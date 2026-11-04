"""Ruido: la parte aleatoria que se suma a la serie."""
import numpy as np

from .errores import ErrorDeEntrada


def ruido_unitario(ruido, u):
    """Ruido "de tamaño 1" (desviación típica 1) según el tipo, un valor por punto.

    Luego se escala: el ruido es PROPORCIONAL al valor de la serie en cada punto.
    Con grado 3, un punto que vale 100 se mueve ~3 y uno que vale 150 se mueve ~4.5.
    """
    puntos = len(u)
    # con la misma semilla sale siempre la misma muestra aleatoria
    rng = np.random.default_rng(ruido.semilla)
    azar = rng.normal(size=puntos)   # números normales (media 0, desviación 1)

    if ruido.tipo == "blanco":
        # cada punto es independiente y con la misma variabilidad
        return azar

    if ruido.tipo == "heterocedastico":
        # la variabilidad crece con el tiempo: x0.25 al inicio, x2 al final
        return (0.25 + 1.75 * u) * azar

    if ruido.tipo in ("autocorrelado_positivo", "autocorrelado_negativo"):
        # AR(1): cada valor depende del anterior.  ruido[t] = phi * ruido[t-1] + novedad
        # phi > 0: los valores se parecen al anterior (rachas suaves)
        # phi < 0: los valores alternan de signo (zigzag)
        if ruido.tipo == "autocorrelado_positivo":
            phi = ruido.phi
        else:
            phi = -ruido.phi
        # la novedad se reescala para que la desviación total siga siendo 1
        novedad = np.sqrt(1 - phi ** 2) * azar
        resultado = np.zeros(puntos)
        resultado[0] = azar[0]
        for i in range(1, puntos):
            resultado[i] = phi * resultado[i - 1] + novedad[i]
        return resultado

    if ruido.tipo == "garch":
        # GARCH(1,1): la variabilidad de hoy depende de los golpes de ayer,
        # así salen rachas de calma y rachas de volatilidad.
        #   varianza[t] = omega + alfa * ruido[t-1]**2 + beta * varianza[t-1]
        alfa = 0.10
        beta = 0.85
        omega = 1 - alfa - beta  # así la desviación media sigue siendo 1
        varianza = 1.0
        resultado = np.zeros(puntos)
        for i in range(puntos):
            resultado[i] = np.sqrt(varianza) * azar[i]
            varianza = omega + alfa * resultado[i] ** 2 + beta * varianza
        return resultado

    if ruido.tipo == "colas_pesadas":
        # t de Student con 3 grados de libertad: casi todo es pequeño, pero
        # de vez en cuando salen valores extremos (outliers).
        # Se divide entre raíz de 3 para que la desviación sea 1.
        return rng.standard_t(3, size=puntos) / np.sqrt(3)

    raise ErrorDeEntrada(f"Tipo de ruido no válido: {ruido.tipo}")


def aplicar_ruido(serie, ruido, u):
    """La serie con el ruido sumado: grado % del valor de la serie (sin ruido) en cada punto."""
    escala = np.abs(serie) * ruido.grado / 100
    return serie + escala * ruido_unitario(ruido, u)
