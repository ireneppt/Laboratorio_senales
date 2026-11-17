"""Imputación múltiple (MCMC), tal como la describe el Handbook on Constructing Composite Indicators (OCDE y JRC, 2008),
apartado 3.5, páginas 58 a 61 (Figuras 10 y 11, ecuación 8).

Qué hace el manual:
- Se imputa N veces, con un proceso aleatorio que refleja la incertidumbre, para crear N conjuntos "completos".
- Se usa MCMC: se supone que los datos siguen una normal multivariante (la explicada y las explicativas, cada punto
  es una fila) y que faltan al azar (MAR o MCAR).
- Valores de partida: el vector de medias y la matriz de covarianzas de los datos que no tienen valores faltantes.
- Paso de imputación (I): se simulan los valores que faltan, sacándolos al azar de su distribución dado lo que se
  conoce de la fila. Paso posterior (P): se recalculan las medias y covarianzas con lo imputado (se sacan de su
  distribución posterior). Se repite hasta que la distribución es estacionaria; se usa la imputación de la última
  iteración.
- Estos pasos se repiten de forma independiente N veces. El valor que rellena el hueco es la media de las N
  imputaciones (o la mediana), ecuación (8).

Lo que el manual no concreta y aquí se ha tenido que decidir:
- N (el manual solo lo llama N) y el número de iteraciones ("las suficientes"): los elige el usuario; por defecto, 5 y 100.
- La distribución posterior: el manual dice que se aproxima por una normal. Aquí se usa la del modelo normal
  multivariante con la a priori no informativa habitual (Schafer, 1997): la covarianza sale de una Wishart-inversa
  y la media de una normal dada la covarianza.
- La semilla del azar, para que el mismo proyecto dé siempre lo mismo.
- El orden temporal no se usa: cada punto es una observación de la normal multivariante.
"""
import numpy as np

from ..errores import ErrorDeEntrada
from .con_explicativas import _necesita_explicativas
from .simples import _entero

PRESUPUESTO = 2.5e8      # tope de trabajo (imputaciones x iteraciones x puntos x columnas²): unos 4 s en el peor caso; no cabe más en Vercel


def _cholesky(a):
    """Cholesky de una matriz simétrica, con un pequeño refuerzo de la diagonal si no es del todo definida positiva."""
    a = (a + a.T) / 2
    for refuerzo in (0.0, 1e-10, 1e-8, 1e-6, 1e-4):
        try:
            return np.linalg.cholesky(a + refuerzo * np.eye(len(a)))
        except np.linalg.LinAlgError:
            continue
    raise ErrorDeEntrada("No se puede calcular la imputación múltiple: algunas series son casi idénticas entre sí")


def _inversa(a):
    """Inversa de una matriz simétrica; si es singular o casi (series idénticas), con un pequeño refuerzo de la diagonal."""
    a = (a + a.T) / 2
    tamano = float(np.trace(a)) / len(a) or 1.0
    for refuerzo in (0.0, 1e-10, 1e-8, 1e-6, 1e-4):
        reforzada = a + refuerzo * tamano * np.eye(len(a))
        try:
            if np.linalg.cond(reforzada) < 1e12:
                return np.linalg.inv(reforzada)
        except np.linalg.LinAlgError:
            continue
    raise ErrorDeEntrada("No se puede calcular la imputación múltiple: algunas series son casi idénticas entre sí")


def inversa_wishart(rng, grados, escala):
    """Una muestra de la Wishart-inversa(grados, escala), con la descomposición de Bartlett: si W = L A Aᵀ Lᵀ, con L el
    Cholesky de escala⁻¹ y A triangular (diagonal √χ²(grados − i), debajo N(0, 1)), entonces W ~ Wishart(grados, escala⁻¹)
    y W⁻¹ es la muestra pedida. Su media es escala / (grados − p − 1)."""
    p = len(escala)
    L = _cholesky(_inversa(escala))
    A = np.zeros((p, p))
    A[np.tril_indices(p, -1)] = rng.standard_normal(p * (p - 1) // 2)
    A[np.diag_indices(p)] = np.sqrt(rng.chisquare(grados - np.arange(p)))
    LA = L @ A
    return _inversa(LA @ LA.T)


def imputacion_multiple(p, parametros=None):
    """Devuelve (serie completada con la media o mediana de las N imputaciones, None, las N series completadas).
    Las N series sirven para medir la estructura en cada una y promediar, como hace el manual con cualquier resultado."""
    _necesita_explicativas(p)
    n_imputaciones = _entero(parametros, "n", 5, 2, 50, "El número de imputaciones (N)")
    iteraciones = _entero(parametros, "iteraciones", 100, 10, 500, "El número de iteraciones")
    semilla = _entero(parametros, "semilla", 42, 0, 1_000_000, "La semilla")
    combinar = (parametros or {}).get("combinar", "media")
    if combinar not in ("media", "mediana"):
        raise ErrorDeEntrada("Las imputaciones se combinan con la media o con la mediana")

    datos = np.column_stack([p.y, p.X])
    datos = datos[:, ~np.all(np.isnan(datos), axis=0)]                 # una explicativa sin ningún dato no aporta nada
    n, d = datos.shape
    if d < 2:
        raise ErrorDeEntrada("Las explicativas elegidas no tienen ningún dato")
    media0 = np.nanmean(datos, axis=0)
    desviacion0 = np.nanstd(datos, axis=0)
    desviacion0 = np.where(desviacion0 == 0, 1.0, desviacion0)
    z = (datos - media0) / desviacion0                                  # estandarizado, para que el cálculo sea estable
    observado = ~np.isnan(z)
    con_datos = observado.any(axis=1)
    filas_datos = np.flatnonzero(con_datos)
    if len(filas_datos) < d + 3:
        raise ErrorDeEntrada("Hay muy pocos puntos con datos para estimar cómo se relacionan las series")
    if n_imputaciones * iteraciones * len(filas_datos) * d * d > PRESUPUESTO:
        raise ErrorDeEntrada("Con tantas imputaciones, iteraciones y puntos tardaría demasiado: baja alguno")

    # los puntos, agrupados por qué columnas tienen dato (hay pocos grupos distintos)
    grupos = {}
    for i in filas_datos:
        grupos.setdefault(tuple(observado[i]), []).append(i)
    grupos = [(np.flatnonzero(clave), np.flatnonzero(~np.array(clave)), np.array(filas))
              for clave, filas in grupos.items() if not all(clave)]

    # valores de partida (Figura 11): medias y covarianzas de los puntos sin ningún dato faltante
    completos = observado.all(axis=1)
    if completos.sum() > d + 1:
        mu0, sigma0 = z[completos].mean(axis=0), np.atleast_2d(np.cov(z[completos], rowvar=False))
    else:                                                               # sin puntos completos suficientes: sin relación entre series
        mu0, sigma0 = np.zeros(d), np.eye(d)

    def una_imputacion(rng):
        x = np.where(observado, z, 0.0)
        mu, sigma = mu0.copy(), sigma0.copy()
        for _ in range(iteraciones):
            # paso I: lo que falta, de su distribución dado lo conocido de la fila
            for O, M, filas in grupos:
                soo = sigma[np.ix_(O, O)] + 1e-10 * np.eye(len(O))
                smo = sigma[np.ix_(M, O)]
                ganancia = np.linalg.solve(soo, smo.T).T
                L = _cholesky(sigma[np.ix_(M, M)] - ganancia @ smo.T)
                media = mu[M] + (x[np.ix_(filas, O)] - mu[O]) @ ganancia.T
                x[np.ix_(filas, M)] = media + rng.standard_normal((len(filas), len(M))) @ L.T
            # paso P: parámetros de su distribución posterior, con los datos ya completos
            completos_ahora = x[filas_datos]
            m = len(completos_ahora)
            media_x = completos_ahora.mean(axis=0)
            centrados = completos_ahora - media_x
            sigma = inversa_wishart(rng, m - 1, centrados.T @ centrados)
            mu = media_x + _cholesky(sigma / m) @ rng.standard_normal(d)
        sin_datos = np.flatnonzero(~con_datos)                          # puntos sin ningún dato: de la distribución final
        if len(sin_datos):
            x[sin_datos] = mu + rng.standard_normal((len(sin_datos), d)) @ _cholesky(sigma).T
        return x[:, 0] * desviacion0[0] + media0[0]

    # las N imputaciones son independientes: cada una, con su propio generador (misma semilla = mismo resultado)
    generadores = [np.random.default_rng(s) for s in np.random.SeedSequence(semilla).spawn(n_imputaciones)]
    muestras = np.array([una_imputacion(g) for g in generadores])
    conocidos = ~np.isnan(p.y)
    muestras[:, conocidos] = p.y[conocidos]
    combinada = muestras.mean(axis=0) if combinar == "media" else np.median(muestras, axis=0)
    completa = p.y.copy()
    completa[p.objetivo] = combinada[p.objetivo]
    return completa, None, muestras
