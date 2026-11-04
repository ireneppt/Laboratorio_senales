"""Tendencia: el nivel de la serie, con su camino de principio a fin."""
import numpy as np

from .errores import ErrorDeEntrada


def forma_de_tendencia(tipo, u):
    """Camino de 0 a 1 según el tipo. Así todas las tendencias terminan
    en el mismo punto y solo cambia cómo se curva el camino."""
    if tipo == "lineal":
        return u
    if tipo == "cuadratica":
        return u ** 2
    if tipo == "amortiguada":
        return (1 - np.exp(-4 * u)) / (1 - np.exp(-4))
    if tipo == "logaritmica":
        return np.log(1 + 9 * u) / np.log(10)
    if tipo == "exponencial":
        return (np.exp(3 * u) - 1) / (np.exp(3) - 1)
    raise ErrorDeEntrada(f"Tipo de tendencia no válido: {tipo}")


def calcular_nivel(nivel_base, tendencia, u):
    """El nivel de la serie en cada punto. `u` va de 0 a 1 a lo largo de la serie."""
    forma = forma_de_tendencia(tendencia.tipo, u)

    if tendencia.valor_final is not None:
        return nivel_base + (tendencia.valor_final - nivel_base) * forma  # de valor inicial a valor final
    if tendencia.activa:
        return nivel_base * (1 + tendencia.valor * forma)
    return np.full(len(u), nivel_base)  # sin tendencia: línea plana en el nivel base
