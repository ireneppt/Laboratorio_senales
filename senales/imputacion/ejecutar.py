"""Ejecuta varios métodos de imputación sobre el mismo problema y los compara."""
import numpy as np

from ..errores import ErrorDeEntrada
from . import con_explicativas, simples
from .metricas import Z_95, evaluar
from .preparar import alinear, preparar

# id -> (nombre, grupo, necesita explicativas, función)
METODOS = {
    "media": ("Media", "explicito", False, simples.media),
    "mediana": ("Mediana", "explicito", False, simples.mediana),
    "regresion": ("Regresión", "explicito", True, con_explicativas.regresion),
    "em": ("EM (esperanza-maximización)", "explicito", True, con_explicativas.em),
    "ultimo_valor": ("Último valor conocido", "referencia", False, simples.ultimo_valor),
    "siguiente_valor": ("Siguiente valor conocido", "referencia", False, simples.siguiente_valor),
    "media_movil": ("Media móvil centrada", "referencia", False, simples.media_movil),
    "media_movil_atras": ("Media móvil (solo anteriores)", "referencia", False, simples.media_movil_anteriores),
    "media_movil_pond": ("Media móvil ponderada centrada", "referencia", False, simples.media_movil_ponderada),
    "media_movil_pond_atras": ("Media móvil ponderada (solo anteriores)", "referencia", False, simples.media_movil_ponderada_anteriores),
    "media_estacional": ("Media estacional", "referencia", False, simples.media_estacional),
    "interpolacion": ("Interpolación lineal", "referencia", False, simples.interpolacion),
    "polinomica": ("Interpolación polinómica (spline cúbica)", "referencia", False, simples.polinomica),
    "polinomica_local": ("Interpolación polinómica local", "referencia", False, simples.polinomica_local),
}
REFERENCIA = "interpolacion"  # con qué se compara la mejora de cada método


def como_lista(vector):
    """Un vector de numpy como lista para JSON (NaN -> None)."""
    return [None if np.isnan(v) else round(float(v), 4) for v in vector]


def redondear(valor):
    return None if valor is None else round(float(valor), 6)


def imputar(y, quitados, explicativas, metodos, comparar_con=()):
    """Imputa la explicada con cada método pedido y mide sus errores.

    y: la explicada (None donde le falta). quitados: tramos [desde, hasta] que se le han quitado para probar.
    explicativas: las series elegidas. metodos: lista de {"metodo": id, "parametros": {...}}. comparar_con: series
    con las que se mide el sesgo de correlación (las mismas para todos los métodos, para poder compararlos).
    Un método puede devolver la serie completada o (serie completada, desviación de cada predicción): con la
    desviación se da su intervalo del 95 % y las métricas de incertidumbre.
    """
    problema = preparar(y, quitados, explicativas)
    otras = [alinear(serie, problema.n) for serie in comparar_con]
    referencia = simples.interpolacion(problema) if not np.all(np.isnan(problema.y)) else None
    resultados = []
    for pedido in metodos:
        identificador = pedido["metodo"]
        if identificador not in METODOS:
            raise ErrorDeEntrada(f"Método de imputación desconocido: {identificador}")
        nombre, grupo, _, funcion = METODOS[identificador]
        fila = {"metodo": identificador, "nombre": nombre, "grupo": grupo}
        try:
            salida = funcion(problema, pedido.get("parametros") or {})
        except ErrorDeEntrada as error:
            resultados.append({**fila, "error": str(error)})
            continue
        completa, desviacion = salida if isinstance(salida, tuple) else (salida, None)
        metricas, por_tramo, sesgos = evaluar(problema, completa, referencia, desviacion, otras)
        intervalo = None
        if desviacion is not None:
            intervalo = {"inferior": como_lista(completa - Z_95 * desviacion), "superior": como_lista(completa + Z_95 * desviacion)}
        resultados.append({
            **fila, "error": None, "imputado": como_lista(completa), "intervalo": intervalo,
            "sesgo_correlacion": [redondear(s) for s in sesgos],
            "sin_imputar": int((problema.objetivo & np.isnan(completa)).sum()),
            "metricas": {clave: (valor if clave == "n" else redondear(valor)) for clave, valor in metricas.items()},
            "por_tramo": [{**t, "mae": redondear(t["mae"]), "rmse": redondear(t["rmse"])} for t in por_tramo],
        })
    return {
        "n": problema.n,
        "a_imputar": int(problema.objetivo.sum()),
        "quitados": int(problema.quitado.sum()),
        "referencia": REFERENCIA,
        "resultados": resultados,
    }
