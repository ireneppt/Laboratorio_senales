"""Métodos que solo usan la propia serie: media, mediana, último y siguiente valor, media móvil e interpolación
(lineal y polinómica)."""
import numpy as np

from ..errores import ErrorDeEntrada


def _conocidos(p):
    if np.all(np.isnan(p.y)):
        raise ErrorDeEntrada("No queda ningún dato conocido de la variable explicada")


def media(p, parametros=None):
    """Rellena con la media de los datos conocidos."""
    _conocidos(p)
    completa = p.y.copy()
    completa[p.objetivo] = np.nanmean(p.y)
    return completa


def mediana(p, parametros=None):
    """Rellena con la mediana de los datos conocidos."""
    _conocidos(p)
    completa = p.y.copy()
    completa[p.objetivo] = np.nanmedian(p.y)
    return completa


def ultimo_valor(p, parametros=None):
    """Rellena con el último dato conocido (forward fill). Al principio, donde no hay ninguno antes, se queda
    sin imputar."""
    _conocidos(p)
    puntos = np.arange(p.n)
    ultimo = np.maximum.accumulate(np.where(~np.isnan(p.y), puntos, -1))
    completa = p.y.copy()
    rellenables = p.objetivo & (ultimo >= 0)
    completa[rellenables] = p.y[ultimo[rellenables]]
    return completa


def interpolacion(p, parametros=None):
    """Une los datos conocidos con rectas. Fuera del primer y último dato se mantiene el valor más cercano."""
    _conocidos(p)
    conocidos = np.flatnonzero(~np.isnan(p.y))
    completa = p.y.copy()
    objetivo = np.flatnonzero(p.objetivo)
    completa[objetivo] = np.interp(objetivo, conocidos, p.y[conocidos])
    return completa


def siguiente_valor(p, parametros=None):
    """Rellena con el siguiente dato conocido (backward fill). Al final, donde no hay ninguno después, se queda
    sin imputar."""
    _conocidos(p)
    puntos = np.arange(p.n)
    siguiente = np.minimum.accumulate(np.where(~np.isnan(p.y), puntos, p.n)[::-1])[::-1]
    completa = p.y.copy()
    rellenables = p.objetivo & (siguiente < p.n)
    completa[rellenables] = p.y[siguiente[rellenables]]
    return completa


def _media_movil(p, parametros, solo_anteriores):
    _conocidos(p)
    k = (parametros or {}).get("k", 3)
    if not isinstance(k, int) or isinstance(k, bool) or k < 1:
        raise ErrorDeEntrada("El número de datos de la media móvil (k) tiene que ser un entero de 1 o más")
    conocidos = np.flatnonzero(~np.isnan(p.y))
    completa = p.y.copy()
    for i in np.flatnonzero(p.objetivo):
        posicion = np.searchsorted(conocidos, i)               # los conocidos antes de i son conocidos[:posicion]
        vecinos = conocidos[max(0, posicion - k):posicion]
        if not solo_anteriores:
            vecinos = np.concatenate([vecinos, conocidos[posicion:posicion + k]])
        if len(vecinos):                                       # sin ninguno (al principio, solo con anteriores): sin imputar
            completa[i] = p.y[vecinos].mean()
    return completa


def media_movil(p, parametros=None):
    """Media móvil centrada: la media de los k datos conocidos más cercanos antes y los k más cercanos después
    (en los extremos, solo los del lado que hay). k lo elige el usuario."""
    return _media_movil(p, parametros, solo_anteriores=False)


def media_movil_anteriores(p, parametros=None):
    """Media móvil hacia atrás: la media de los últimos k datos conocidos antes del punto (solo el pasado). Al
    principio, donde no hay ninguno antes, se queda sin imputar."""
    return _media_movil(p, parametros, solo_anteriores=True)


def _spline_natural(x, y):
    """Segundas derivadas de la spline cúbica natural que pasa por (x, y), con el algoritmo de Thomas
    (sistema tridiagonal en O(n), para no montar una matriz de n x n)."""
    n = len(x)
    m = np.zeros(n)
    if n < 3:
        return m
    h = np.diff(x)
    diagonal = 2 * (h[:-1] + h[1:])
    lado = h[1:-1].copy()
    derecha = 6 * (np.diff(y[1:]) / h[1:] - np.diff(y[:-1]) / h[:-1])
    for i in range(1, len(diagonal)):                          # eliminación hacia delante
        factor = lado[i - 1] / diagonal[i - 1]
        diagonal[i] -= factor * lado[i - 1]
        derecha[i] -= factor * derecha[i - 1]
    interior = np.zeros(len(diagonal))
    interior[-1] = derecha[-1] / diagonal[-1]
    for i in range(len(diagonal) - 2, -1, -1):                 # sustitución hacia atrás
        interior[i] = (derecha[i] - lado[i] * interior[i + 1]) / diagonal[i]
    m[1:-1] = interior
    return m


def polinomica(p, parametros=None):
    """Une los datos conocidos con curvas: una spline cúbica natural (un polinomio de grado 3 entre cada dos datos,
    empalmados de forma suave). Con menos de 3 datos, rectas. Fuera del primer y último dato se mantiene el
    valor más cercano, como en la interpolación lineal."""
    _conocidos(p)
    x = np.flatnonzero(~np.isnan(p.y)).astype(float)
    y = p.y[~np.isnan(p.y)]
    completa = interpolacion(p)                                # los extremos (y el caso de pocos datos) como la lineal
    if len(x) < 3:
        return completa
    m = _spline_natural(x, y)
    objetivo = np.flatnonzero(p.objetivo)
    dentro = objetivo[(objetivo > x[0]) & (objetivo < x[-1])]
    tramo = np.searchsorted(x, dentro) - 1                     # entre x[tramo] y x[tramo + 1]
    x0, x1 = x[tramo], x[tramo + 1]
    h = x1 - x0
    a, b = (x1 - dentro) / h, (dentro - x0) / h
    completa[dentro] = (a * y[tramo] + b * y[tramo + 1]
                        + ((a ** 3 - a) * m[tramo] + (b ** 3 - b) * m[tramo + 1]) * h ** 2 / 6)
    return completa
