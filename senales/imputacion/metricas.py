"""Cuánto se equivoca una imputación, comparándola con el valor real de lo que se quitó.

Solo se miden los puntos quitados a propósito (los que tienen valor real) que el método ha conseguido imputar.
"""
import numpy as np


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


def mejora_sobre_referencia(rmse_metodo, rmse_referencia):
    """1 − RMSE del método / RMSE de la referencia. Positivo = mejor que la referencia (0,35 = un 35 % menos de error)."""
    if rmse_referencia == 0:
        return None
    return 1 - rmse_metodo / rmse_referencia


def evaluar(problema, completa, referencia):
    """Métricas de un método: globales y por tramo. `referencia` es la serie completada por el método de referencia."""
    evaluables = problema.quitado & ~np.isnan(completa)
    resultado = {"n": int(evaluables.sum()), "mae": None, "rmse": None, "rmse_est": None, "r2": None, "mejora": None}
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
    for desde, hasta in problema.tramos:
        puntos = np.zeros(problema.n, dtype=bool)
        puntos[desde:hasta + 1] = True
        puntos &= evaluables
        fila = {"desde": desde, "hasta": hasta, "n": int(puntos.sum()), "mae": None, "rmse": None}
        if fila["n"]:
            fila["mae"] = mae(problema.verdad[puntos], completa[puntos])
            fila["rmse"] = rmse(problema.verdad[puntos], completa[puntos])
        por_tramo.append(fila)
    return resultado, por_tramo
