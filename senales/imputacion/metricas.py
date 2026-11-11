"""Cuánto se equivoca una imputación, comparándola con el valor real de lo que se quitó.

Solo se miden los puntos quitados a propósito (los que tienen valor real) que el método ha conseguido imputar.
Hay tres familias de métricas:
- precisión: cuánto se acerca lo imputado al valor real (MAE, RMSE, RMSE estandarizado, R², mejora);
- estructura: si se conserva la forma de la serie (razón de varianzas, sesgo de correlación con otras series);
- incertidumbre: si el intervalo del 95 % del método es honesto (cobertura, anchura, interval score). Solo para los
  métodos que dan intervalo; los demás, None ("no aplica").
"""
import numpy as np

Z_95 = 1.959964      # cuantil de la normal para un intervalo del 95 %
ALFA = 1 - 0.95      # el del interval score (Gneiting y Raftery, 2007)


def _error(real, imputado):
    return imputado - real


def mae(real, imputado):
    """Error absoluto medio: la media de las distancias, en las unidades de la serie."""
    return float(np.mean(np.abs(_error(real, imputado))))


def rmse(real, imputado):
    """Raíz del error cuadrático medio: como el MAE, pero castiga más los fallos grandes."""
    return float(np.sqrt(np.mean(_error(real, imputado) ** 2)))


def r2_frente_al_real(real, imputado, conocidos):
    """Qué parte de lo quitado recupera el método. 1 = perfecto; 0 = igual que imputar la media de lo conocido;
    negativo = peor que eso. None si lo conocido es constante."""
    base = float(np.sum((real - np.mean(conocidos)) ** 2))
    if base == 0:
        return None
    return 1 - float(np.sum(_error(real, imputado) ** 2)) / base


def rmse_estandarizado(rmse_metodo, conocidos):
    """RMSE / desviación típica de lo conocido: el error medido en "desviaciones" de la serie, sin unidades.
    0 = perfecto; 1 = un error del tamaño de lo que varía la serie. None si lo conocido es constante."""
    desviacion = float(np.std(conocidos))
    if desviacion == 0:
        return None
    return rmse_metodo / desviacion


def pearson(x, y):
    """Correlación de Pearson, igual que correlacionPearson de public/js/80-correlacion.js: None con menos de 3
    parejas o si una de las dos series es constante; recortada a [-1, 1]."""
    n = len(x)
    if n < 3:
        return None
    dx, dy = x - x.mean(), y - y.mean()
    sxx, syy = float(dx @ dx), float(dy @ dy)
    if sxx == 0 or syy == 0:
        return None
    return max(-1.0, min(1.0, float(dx @ dy) / np.sqrt(sxx * syy)))


def razon_varianzas(real, imputado):
    """Varianza de lo imputado / varianza de lo real, en los puntos quitados. 1 = conserva la variación; por debajo
    de 1, la aplana. None con menos de 2 puntos o si lo real no varía."""
    if len(real) < 2 or float(np.var(real)) == 0:
        return None
    return float(np.var(imputado)) / float(np.var(real))


def sesgo_correlacion(real, completa, otra):
    """corr(serie completada, otra) − corr(serie real, otra), en los puntos donde las tres tienen dato. 0 = la
    imputación no cambia la relación con esa serie; negativo = la debilita."""
    juntos = ~np.isnan(real) & ~np.isnan(completa) & ~np.isnan(otra)
    con_imputado, con_real = pearson(completa[juntos], otra[juntos]), pearson(real[juntos], otra[juntos])
    return None if con_imputado is None or con_real is None else con_imputado - con_real


def incertidumbre(real, imputado, desviacion, conocidos):
    """Cobertura, anchura media (y estandarizada) e interval score del intervalo del 95 %: imputado ± 1,96 desviaciones."""
    inferior, superior = imputado - Z_95 * desviacion, imputado + Z_95 * desviacion
    anchura = superior - inferior
    debajo, encima = real < inferior, real > superior
    puntuacion = anchura + (2 / ALFA) * (inferior - real) * debajo + (2 / ALFA) * (real - superior) * encima
    desviacion_conocidos = float(np.std(conocidos))
    return {
        "cobertura": float(np.mean(~debajo & ~encima)),
        "anchura": float(np.mean(anchura)),
        "anchura_est": None if desviacion_conocidos == 0 else float(np.mean(anchura)) / desviacion_conocidos,
        "interval_score": float(np.mean(puntuacion)),
    }


def mejora_sobre_referencia(rmse_metodo, rmse_referencia):
    """1 − RMSE del método / RMSE de la referencia. Positivo = mejor que la referencia (0,35 = un 35 % menos de error)."""
    if rmse_referencia == 0:
        return None
    return 1 - rmse_metodo / rmse_referencia


def evaluar(problema, completa, referencia, desviacion=None, comparar_con=()):
    """Métricas de un método: globales y por tramo. `referencia` es la serie completada por el método de referencia;
    `desviacion`, la de la predicción de cada punto (None si el método no da intervalo); `comparar_con`, las series
    con las que se mide el sesgo de correlación. Devuelve (métricas, por tramo, sesgo con cada serie)."""
    evaluables = problema.quitado & ~np.isnan(completa)
    resultado = {"n": int(evaluables.sum()), "mae": None, "rmse": None, "rmse_est": None, "r2": None, "mejora": None,
                 "razon_var": None, "sesgo_corr": None, "cobertura": None, "anchura": None, "anchura_est": None, "interval_score": None}
    por_tramo = []
    if resultado["n"]:
        real, imputado = problema.verdad[evaluables], completa[evaluables]
        resultado["mae"] = mae(real, imputado)
        resultado["rmse"] = rmse(real, imputado)
        conocidos = problema.y[~np.isnan(problema.y)]
        resultado["rmse_est"] = rmse_estandarizado(resultado["rmse"], conocidos)
        resultado["r2"] = r2_frente_al_real(real, imputado, conocidos)
        en_referencia = referencia[evaluables]
        resultado["mejora"] = mejora_sobre_referencia(resultado["rmse"], rmse(real, en_referencia))
        resultado["razon_var"] = razon_varianzas(real, imputado)
        if desviacion is not None:
            con_intervalo = ~np.isnan(desviacion[evaluables])
            if con_intervalo.any():
                resultado.update(incertidumbre(real[con_intervalo], imputado[con_intervalo], desviacion[evaluables][con_intervalo], conocidos))
    # sesgo de correlación: sobre la serie entera (lo conocido, más lo imputado frente a lo real en lo quitado)
    serie_real = np.where(problema.quitado, problema.verdad, problema.y)
    sesgos = [sesgo_correlacion(serie_real, completa, otra) for otra in comparar_con]
    validos = [abs(s) for s in sesgos if s is not None]
    resultado["sesgo_corr"] = float(np.mean(validos)) if validos else None
    for desde, hasta in problema.tramos:
        puntos = np.zeros(problema.n, dtype=bool)
        puntos[desde:hasta + 1] = True
        puntos &= evaluables
        fila = {"desde": desde, "hasta": hasta, "n": int(puntos.sum()), "mae": None, "rmse": None}
        if fila["n"]:
            fila["mae"] = mae(problema.verdad[puntos], completa[puntos])
            fila["rmse"] = rmse(problema.verdad[puntos], completa[puntos])
        por_tramo.append(fila)
    return resultado, por_tramo, sesgos
