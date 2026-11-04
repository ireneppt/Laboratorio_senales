"""Ciclos: como la estacionalidad, pero con duración y altura irregulares."""
import numpy as np

from .constantes import ESTACIONAL_MAXIMO, ESTACIONAL_MINIMO
from .errores import ErrorDeEntrada


def ruido_lento(rng, n, escala):
    """Serie aleatoria que cambia despacio, de media 0 y desviación 1.
    Es ruido normal suavizado con una campana: cuanto mayor la escala (en puntos), más tarda
    en cambiar. Se usa para que la duración y la altura de un ciclo varíen de forma gradual.
    """
    mitad = int(3 * escala) + 1
    campana = np.exp(-0.5 * (np.arange(-mitad, mitad + 1) / escala) ** 2)
    campana = campana / np.sqrt(np.sum(campana ** 2))  # así el resultado mantiene desviación 1
    azar = rng.normal(size=n + 2 * mitad)               # de más en los bordes, que luego se recortan
    return np.convolve(azar, campana, mode="valid")


def onda_de_ciclos(t, u, ciclos):
    """Suma de los ciclos, en unidades de la serie (se suma a lo que ya hay).

    La duración y la altura de cada ciclo van cambiando despacio, así que no se repite
    exactamente igual. Con variabilidad 0 sería una onda fija.
    """
    puntos = len(t)
    periodos = ciclos.periodos or [100]
    var_periodos = ciclos.var_periodos or [20.0]
    minimos = ciclos.minimos or [ESTACIONAL_MINIMO] * len(periodos)
    maximos = ciclos.maximos or [ESTACIONAL_MAXIMO] * len(periodos)
    minimos_fin = ciclos.minimos_fin or minimos
    maximos_fin = ciclos.maximos_fin or maximos
    var_amplitudes = ciclos.var_amplitudes or [25.0]
    modos = ciclos.modos or ["aditiva"]
    semillas = ciclos.semillas or [44 + i for i in range(len(periodos))]
    if len({len(periodos), len(var_periodos), len(minimos), len(maximos), len(minimos_fin), len(maximos_fin), len(var_amplitudes), len(modos), len(semillas)}) != 1:
        raise ErrorDeEntrada("Cada ciclo necesita todos sus valores")
    for modo, mn, mx, mn_fin, mx_fin in zip(modos, minimos, maximos, minimos_fin, maximos_fin):
        if mn > mx or (modo == "multiplicativa" and mn_fin > mx_fin):
            raise ErrorDeEntrada("El mínimo del ciclo no puede superar al máximo")

    suma_aditivos = np.zeros(puntos)         # ciclos que se SUMAN
    for i in range(len(periodos)):
        # cada ciclo tiene su propia muestra aleatoria, que sale de su semilla
        rng_ciclo = np.random.default_rng(semillas[i])
        escala = periodos[i] / 3  # los cambios se notan de un ciclo al siguiente, no de un punto al otro

        # duración de cada vuelta: varía alrededor del periodo medio (nunca menos de un 20 % de él)
        duracion = periodos[i] * (1 + var_periodos[i] / 100 * ruido_lento(rng_ciclo, puntos, escala))
        duracion = np.maximum(duracion, 0.2 * periodos[i])
        # posición dentro del ciclo: 0 a 1 es una vuelta. Empieza en 0 y avanza 1/duración por punto.
        posicion = np.concatenate([[0], np.cumsum(1 / duracion[:-1])])

        # altura de cada vuelta: también varía despacio alrededor de la media (nunca negativa)
        altura = np.maximum(0, 1 + var_amplitudes[i] / 100 * ruido_lento(rng_ciclo, puntos, escala))

        # oscila entre minimo y maximo: centro +- media altura (la altura es la que varía)
        # (en aditivo la amplitud es constante: los "fin" se ignoran)
        minimo_fin = minimos_fin[i] if modos[i] == "multiplicativa" else minimos[i]
        maximo_fin = maximos_fin[i] if modos[i] == "multiplicativa" else maximos[i]
        centro = ((maximos[i] + minimos[i]) + ((maximo_fin + minimo_fin) - (maximos[i] + minimos[i])) * u) / 2
        mitad = ((maximos[i] - minimos[i]) + ((maximo_fin - minimo_fin) - (maximos[i] - minimos[i])) * u) / 2
        onda = centro + altura * mitad * np.sin(2 * np.pi * posicion)
        suma_aditivos = suma_aditivos + onda
    return suma_aditivos
