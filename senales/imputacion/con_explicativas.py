"""Métodos que usan las variables explicativas: regresión, regresión estocástica y EM.

Además de la serie completada devuelven, para cada punto imputado, la desviación típica de su predicción: con ella
se construye el intervalo del 95 % (lo imputado ± 1,96 desviaciones). Donde no hay imputación, NaN.

Si a una explicativa le falta el dato justo en un punto a imputar, el método usa las demás; si no hay
ninguna con dato en ese punto, ese punto se queda sin imputar (NaN), salvo en el EM, que usa la media.
"""
import numpy as np

from ..errores import ErrorDeEntrada
from .simples import _entero


def _necesita_explicativas(p):
    if p.X.shape[1] == 0:
        raise ErrorDeEntrada("Este método necesita al menos una variable explicativa")
    if np.all(np.isnan(p.y)):
        raise ErrorDeEntrada("No queda ningún dato conocido de la variable explicada")


def _ajustar_regresion(p):
    """Ajusta la recta de la explicada sobre las explicativas (mínimos cuadrados) con los puntos conocidos y predice los
    huecos. Si en un punto faltan algunas explicativas, se usa un modelo con las que sí hay. Devuelve una lista con un
    elemento por cada conjunto de puntos que comparten modelo: (puntos, predicción, varianza residual s², desviación de la
    predicción). La desviación incluye la incertidumbre de la recta; s² es solo la varianza de los residuos."""
    por_disponibles = {}
    for i in np.flatnonzero(p.objetivo):
        por_disponibles.setdefault(tuple(np.flatnonzero(~np.isnan(p.X[i]))), []).append(i)
    grupos = []
    for columnas, puntos in por_disponibles.items():
        if not columnas:
            continue
        columnas = list(columnas)
        filas = ~np.isnan(p.y) & ~np.isnan(p.X[:, columnas]).any(axis=1)
        if filas.sum() < len(columnas) + 2:
            continue                                       # muy pocos datos para ajustar el modelo
        A = np.column_stack([np.ones(filas.sum()), p.X[filas][:, columnas]])
        coeficientes = np.linalg.lstsq(A, p.y[filas], rcond=None)[0]
        nuevos = np.column_stack([np.ones(len(puntos)), p.X[puntos][:, columnas]])
        # intervalo de predicción clásico: s² · (1 + x0ᵀ (AᵀA)⁻¹ x0), con s² la varianza de los residuos
        residuos = p.y[filas] - A @ coeficientes
        s2 = float(residuos @ residuos) / (len(residuos) - A.shape[1])
        inversa = np.linalg.pinv(A.T @ A)
        desviacion = np.sqrt(s2 * (1 + np.einsum("ij,jk,ik->i", nuevos, inversa, nuevos)))
        grupos.append((np.array(puntos), nuevos @ coeficientes, s2, desviacion))
    return grupos


def regresion(p, parametros=None):
    """Ajusta una recta (mínimos cuadrados) de la explicada sobre las explicativas con los puntos conocidos
    y predice los huecos: la media condicional. Si en un punto faltan algunas explicativas, se usa un modelo con las que sí hay."""
    _necesita_explicativas(p)
    completa = p.y.copy()
    desviacion = np.full(p.n, np.nan)
    for puntos, prediccion, _, sd in _ajustar_regresion(p):
        completa[puntos] = prediccion
        desviacion[puntos] = sd
    return completa, desviacion


def regresion_estocastica(p, parametros=None):
    """Regresión estocástica, como la describe el Handbook de la OCDE y el JRC (apartado 3.3, ecuación 3): en vez de la
    media condicional, se imputa una extracción de la distribución condicional,
        x̂ = β̂₀ + Σ β̂ⱼ xⱼ + ε,   ε ~ N(0, σ̂²),
    con σ̂² la varianza residual de la regresión con los puntos conocidos. Los β̂ son los estimados (sin incertidumbre) y
    el ruido de cada punto es independiente: una sola extracción por punto. Con la misma semilla sale siempre lo mismo.

    No da intervalo: uno centrado en una extracción aleatoria no tiene sentido, y el manual avisa de que la imputación
    única, aunque sea estocástica, sigue subestimando la incertidumbre (la imputación múltiple la recoge)."""
    _necesita_explicativas(p)
    semilla = _entero(parametros, "semilla", 42, 0, 1_000_000, "La semilla")
    rng = np.random.default_rng(semilla)
    completa = p.y.copy()
    for puntos, prediccion, s2, _ in _ajustar_regresion(p):
        completa[puntos] = prediccion + np.sqrt(s2) * rng.standard_normal(len(puntos))
    return completa, None


def em(p, parametros=None, iteraciones=300, tolerancia=1e-7):
    """EM (esperanza-maximización) suponiendo que explicada y explicativas siguen una normal conjunta.

    Repite dos pasos hasta que se estabiliza: (E) rellena lo que falta con su valor esperado dado lo que se
    conoce de cada punto, y (M) recalcula medias y covarianzas con eso. Admite que las explicativas también
    tengan huecos. Un punto sin ningún dato conocido se imputa con la media.
    """
    _necesita_explicativas(p)
    datos = np.column_stack([p.y, p.X])
    columnas_vacias = np.all(np.isnan(datos), axis=0)
    datos = datos[:, ~columnas_vacias]                    # una explicativa sin ningún dato no aporta nada
    media0 = np.nanmean(datos, axis=0)
    desviacion0 = np.nanstd(datos, axis=0)
    desviacion0 = np.where(desviacion0 == 0, 1.0, desviacion0)
    z = (datos - media0) / desviacion0                    # estandarizado: así el cálculo es más estable
    n, d = z.shape
    observado = ~np.isnan(z)
    con_datos = observado.any(axis=1)

    # puntos agrupados por qué columnas tienen dato (hay pocos grupos distintos)
    grupos = {}
    for i in np.flatnonzero(con_datos):
        grupos.setdefault(tuple(observado[i]), []).append(i)
    grupos = [(np.array(clave), np.array(filas)) for clave, filas in grupos.items()]
    total = int(con_datos.sum())

    mu = np.zeros(d)
    sigma = np.eye(d)
    anillo = 1e-8                                          # para que las matrices se puedan invertir aunque haya series casi iguales

    def valor_esperado(clave, filas, mu, sigma):
        """Valores esperados de lo que falta en cada fila y covarianza que queda sin explicar."""
        O = np.flatnonzero(clave)
        M = np.flatnonzero(~clave)
        completo = np.empty((len(filas), d))
        completo[:, O] = z[np.ix_(filas, O)]
        covarianza = np.zeros((d, d))
        if len(M):
            if len(O):
                soo = sigma[np.ix_(O, O)] + anillo * np.eye(len(O))
                smo = sigma[np.ix_(M, O)]
                ganancia = np.linalg.solve(soo, smo.T).T
                completo[:, M] = mu[M] + (z[np.ix_(filas, O)] - mu[O]) @ ganancia.T
                covarianza[np.ix_(M, M)] = sigma[np.ix_(M, M)] - ganancia @ smo.T
            else:
                completo[:, M] = mu[M]
                covarianza[np.ix_(M, M)] = sigma[np.ix_(M, M)]
        return completo, covarianza

    for _ in range(iteraciones):
        suma = np.zeros(d)
        suma_cuadrados = np.zeros((d, d))
        for clave, filas in grupos:
            completo, covarianza = valor_esperado(clave, filas, mu, sigma)
            suma += completo.sum(axis=0)
            suma_cuadrados += completo.T @ completo + len(filas) * covarianza
        mu_nuevo = suma / total
        sigma_nuevo = suma_cuadrados / total - np.outer(mu_nuevo, mu_nuevo)
        cambio = max(np.abs(mu_nuevo - mu).max(), np.abs(sigma_nuevo - sigma).max())
        mu, sigma = mu_nuevo, sigma_nuevo
        if cambio < tolerancia:
            break

    # lo imputado es el valor esperado; su desviación, la de la normal condicionada a lo que se conoce de la fila
    # (con los parámetros finales: no cuenta la incertidumbre de haberlos estimado, así que el intervalo sale algo estrecho)
    completa = p.y.copy()
    desviacion = np.full(p.n, np.nan)
    for clave, filas in grupos:
        esperado, covarianza = valor_esperado(clave, filas, mu, sigma)
        falta_y = p.objetivo[filas]
        completa[filas[falta_y]] = esperado[falta_y, 0] * desviacion0[0] + media0[0]
        desviacion[filas[falta_y]] = np.sqrt(max(covarianza[0, 0], 0.0)) * desviacion0[0]
    sin_datos = np.flatnonzero(~con_datos & p.objetivo)
    completa[sin_datos] = mu[0] * desviacion0[0] + media0[0]
    desviacion[sin_datos] = np.sqrt(max(sigma[0, 0], 0.0)) * desviacion0[0]
    return completa, desviacion
