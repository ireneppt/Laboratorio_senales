"""Prepara el problema: qué se conoce de la explicada, qué hay que imputar y con qué ayudas."""
from dataclasses import dataclass

import numpy as np

from ..errores import ErrorDeEntrada


@dataclass
class Problema:
    """Todo lo que necesita un método de imputación.

    y          lo que se conoce de la explicada (NaN donde falta o se ha quitado)
    verdad     el valor real de lo quitado (NaN en el resto): sirve para medir el error
    quitado    puntos que se han quitado a propósito (los que tienen valor real)
    objetivo   puntos que hay que imputar: lo que ya faltaba y lo quitado
    tramos     los tramos quitados, como pares (desde, hasta)
    X          las explicativas, una columna cada una (NaN donde les falta el dato)
    """
    y: np.ndarray
    verdad: np.ndarray
    quitado: np.ndarray
    objetivo: np.ndarray
    tramos: list
    X: np.ndarray

    @property
    def n(self):
        return len(self.y)


def alinear(valores, n):
    """Una serie como vector de longitud n: se recorta si sobra y se completa con NaN si falta."""
    vector = np.full(n, np.nan)
    datos = np.array([np.nan if v is None else v for v in valores], dtype=float)[:n]
    vector[:len(datos)] = datos
    return vector


def preparar(y, quitados, explicativas):
    """y: la explicada completa (None donde le falta); quitados: tramos [desde, hasta]; explicativas: lista de series."""
    y = alinear(y, len(y))
    n = len(y)
    if n < 3:
        raise ErrorDeEntrada("La serie necesita al menos 3 puntos")
    quitado = np.zeros(n, dtype=bool)
    tramos = []
    for desde, hasta in quitados:
        desde, hasta = min(max(int(desde), 0), n - 1), min(max(int(hasta), 0), n - 1)
        if hasta < desde:
            desde, hasta = hasta, desde
        quitado[desde:hasta + 1] = True
    # los tramos de verdad, ya fundidos si se tocaban
    i = 0
    while i < n:
        if quitado[i]:
            j = i
            while j + 1 < n and quitado[j + 1]:
                j += 1
            tramos.append((i, j))
            i = j
        i += 1

    verdad = np.where(quitado, y, np.nan)
    conocida = y.copy()
    conocida[quitado] = np.nan
    X = np.column_stack([alinear(e, n) for e in explicativas]) if explicativas else np.empty((n, 0))
    return Problema(y=conocida, verdad=verdad, quitado=quitado & ~np.isnan(verdad), objetivo=np.isnan(conocida), tramos=tramos, X=X)
