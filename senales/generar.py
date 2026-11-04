"""Genera una serie juntando sus bloques, en este orden:
tendencia, estacionalidad, ciclos, ruido, anomalías y datos faltantes."""
import numpy as np

from .anomalias import factor_de_anomalias
from .ciclos import onda_de_ciclos
from .errores import ErrorDeEntrada
from .estacionalidad import onda_estacional
from .huecos import resolver_huecos
from .parametros import Anomalias, Ciclos, Estacionalidad, Huecos, Ruido, Tendencia
from .ruido import aplicar_ruido
from .tendencia import calcular_nivel


def generar_serie(puntos, nivel_base, tendencia=None, estacionalidad=None, ciclos=None, ruido=None, anomalias=None, huecos=None):
    """Devuelve la serie (con sus huecos) y todo lo que hace falta para dibujarla y analizarla.

    Los bloques que no se indican toman sus valores por defecto. Con los mismos parámetros y las mismas
    semillas sale siempre exactamente lo mismo. Lanza ErrorDeEntrada si algún parámetro no es válido.
    """
    tendencia = tendencia or Tendencia()
    estacionalidad = estacionalidad or Estacionalidad()
    ciclos = ciclos or Ciclos()
    ruido = ruido or Ruido()
    anomalias = anomalias or Anomalias()
    huecos = huecos or Huecos()
    if puntos < 2:
        raise ErrorDeEntrada("La serie necesita al menos 2 puntos")

    t = np.arange(puntos)      # 0, 1, 2, ... puntos-1
    u = t / (puntos - 1)       # lo mismo pero de 0 a 1

    # ---------- 1. TENDENCIA ----------
    nivel = calcular_nivel(nivel_base, tendencia, u)

    # ---------- 2. ESTACIONALIDAD ----------
    if estacionalidad.activa:
        serie = nivel + onda_estacional(t, u, estacionalidad)
    else:
        serie = nivel

    con_estacionalidad = serie  # para la descomposición: la serie hasta este punto

    # ---------- 3. CICLOS ----------
    if ciclos.activo:
        serie = serie + onda_de_ciclos(t, u, ciclos)

    con_ciclo = serie  # para la descomposición

    # ---------- 4. RUIDO ----------
    if ruido.activo:
        serie = aplicar_ruido(serie, ruido, u)

    con_ruido = serie  # para la descomposición

    # ---------- 5. ANOMALÍAS ----------
    resueltas = []  # lo que se aplicó de verdad (útil para ver dónde cayeron las aleatorias)
    if anomalias.activas and anomalias.textos:
        factor, resueltas = factor_de_anomalias(t, anomalias)
        # el efecto es proporcional al valor de la serie en cada punto
        serie = serie * (1 + factor)

    # ---------- 6. DATOS FALTANTES ----------
    # Se quitan al final, sobre la serie ya terminada: los componentes no cambian y "y_completa" guarda
    # lo que valían los puntos quitados (sirve para comparar después con una imputación).
    faltan, huecos_resueltos = resolver_huecos(huecos, puntos)
    y_completa = serie.round(4).tolist()
    y = [None if f else v for v, f in zip(y_completa, faltan)]

    # Descomposición: cada pieza es lo que aporta ese bloque, de modo que
    # tendencia + estacionalidad + ciclo + ruido + anomalías = serie. "tendencia" es el nivel con su
    # tendencia, y también sirve para dibujarla aparte sobre la serie.
    componentes = {
        "tendencia": nivel,
        "estacionalidad": con_estacionalidad - nivel,
        "ciclo": con_ciclo - con_estacionalidad,
        "ruido": con_ruido - con_ciclo,
        "anomalias": serie - con_ruido,
    }
    return {
        "x": t.tolist(),
        "y": y,
        "y_completa": y_completa if huecos_resueltos else None,
        "huecos": huecos_resueltos,
        "n_faltantes": int(faltan.sum()),
        "componentes": {nombre: valores.round(4).tolist() for nombre, valores in componentes.items()},
        "anomalias": resueltas,
    }
