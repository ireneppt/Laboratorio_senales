"""Métodos que solo usan la propia serie: media, mediana, último valor conocido e interpolación."""
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
    """Rellena con el último dato conocido (hot deck secuencial). Al principio, donde no hay ninguno
    anterior, se usa el primero que aparece."""
    _conocidos(p)
    puntos = np.arange(p.n)
    ultimo = np.maximum.accumulate(np.where(~np.isnan(p.y), puntos, -1))
    primero = np.flatnonzero(~np.isnan(p.y))[0]
    origen = np.where(ultimo >= 0, ultimo, primero)
    completa = p.y.copy()
    completa[p.objetivo] = p.y[origen][p.objetivo]
    return completa


def interpolacion(p, parametros=None):
    """Une los datos conocidos con rectas. Fuera del primer y último dato se mantiene el valor más cercano."""
    _conocidos(p)
    conocidos = np.flatnonzero(~np.isnan(p.y))
    completa = p.y.copy()
    objetivo = np.flatnonzero(p.objetivo)
    completa[objetivo] = np.interp(objetivo, conocidos, p.y[conocidos])
    return completa
