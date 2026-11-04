"""Estacionalidad: ondas que se repiten con un periodo fijo."""
import numpy as np

from .constantes import ESTACIONAL_MAXIMO, ESTACIONAL_MINIMO
from .errores import ErrorDeEntrada


def onda_estacional(t, u, estacionalidad):
    """Suma de las ondas estacionales, en unidades de la serie (se suma al nivel)."""
    periodos = estacionalidad.periodos or [50]
    modos = estacionalidad.modos or ["aditiva"]
    minimos = estacionalidad.minimos or [ESTACIONAL_MINIMO] * len(periodos)
    maximos = estacionalidad.maximos or [ESTACIONAL_MAXIMO] * len(periodos)
    minimos_fin = estacionalidad.minimos_fin or minimos
    maximos_fin = estacionalidad.maximos_fin or maximos
    if not len(periodos) == len(modos) == len(minimos) == len(maximos) == len(minimos_fin) == len(maximos_fin):
        raise ErrorDeEntrada("Cada estacionalidad necesita un periodo, un modo, un mínimo y un máximo")
    for modo, mn, mx, mn_fin, mx_fin in zip(modos, minimos, maximos, minimos_fin, maximos_fin):
        if mn > mx or (modo == "multiplicativa" and mn_fin > mx_fin):
            raise ErrorDeEntrada("El mínimo de la estacionalidad no puede superar al máximo")

    suma_aditivas = np.zeros(len(t))         # ondas que se SUMAN al nivel (unidades de la serie)
    for periodo, modo, minimo, maximo, minimo_fin, maximo_fin in zip(periodos, modos, minimos, maximos, minimos_fin, maximos_fin):
        if modo == "aditiva":
            minimo_fin, maximo_fin = minimo, maximo  # amplitud constante
        # la onda oscila entre minimo y maximo (centro +- media altura); esos límites pasan en línea
        # recta de los del primer punto a los del último
        centro = ((maximo + minimo) + ((maximo_fin + minimo_fin) - (maximo + minimo)) * u) / 2
        mitad = ((maximo - minimo) + ((maximo_fin - minimo_fin) - (maximo - minimo)) * u) / 2
        onda = centro + mitad * np.sin(2 * np.pi * t / periodo)
        suma_aditivas = suma_aditivas + onda
    return suma_aditivas
