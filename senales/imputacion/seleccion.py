"""Sugiere qué explicativas usar en la regresión: prueba subconjuntos y los ordena por su error de validación.

Siguiendo el «in sample / out of sample» del Handbook (Box 4), se mide cuánto falla la regresión con cada combinación:
- Si se han quitado tramos con valor real (pestaña «Variable explicada»), se miden en ellos, igual que la tabla de
  resultados: regresión ajustada con lo demás y error sobre lo quitado. El RMSE y el MAE de una combinación coinciden con
  los de la fila «Regresión» de esa tabla. Como se elige y se mide con los mismos puntos, el error sale algo optimista.
- Si no se ha quitado nada (o casi), se esconden bloques seguidos de lo que se conoce (no puntos sueltos: los huecos
  reales suelen ser tramos), cada bloque se imputa con un modelo ajustado con los demás, y se mide el error.
No hay azar: el mismo problema da siempre lo mismo.

Con pocas explicativas se prueban todos los subconjuntos; con muchas, se va añadiendo la que más baja el error
(regresión paso a paso hacia delante), que no garantiza el mejor subconjunto global. Solo se consideran subconjuntos
de 2 o más explicativas (de una sola ya hay una ventana «Solo X»).
"""
from itertools import combinations

import numpy as np

from ..errores import ErrorDeEntrada
from . import con_explicativas
from .preparar import Problema, preparar

MAX_EXHAUSTIVO = 8       # hasta aquí se prueban todos los subconjuntos (como mucho 247 de 2 o más)
MEJORA_MINIMA = 0.01     # el paso a paso se para cuando añadir una variable no baja el RMSE al menos un 1 %
MIN_CONOCIDOS = 10
MIN_VALIDADOS = 3


def _problema(y, X, ocultos):
    """Un problema donde, además de lo que faltaba, se esconden los puntos `ocultos`."""
    conocida = y.copy()
    conocida[ocultos] = np.nan
    n = len(y)
    return Problema(y=conocida, verdad=np.full(n, np.nan), quitado=np.zeros(n, dtype=bool), objetivo=np.isnan(conocida), tramos=[], X=X)


def _validar(y, X, bloques):
    """Error de la regresión con las columnas de X al imputar cada bloque con un modelo hecho con los demás.
    Devuelve (rmse, mae, puntos validados) o None si casi no se ha podido predecir nada."""
    conocidos = np.flatnonzero(~np.isnan(y))
    errores = []
    for bloque in np.array_split(conocidos, bloques):
        ocultos = np.zeros(len(y), dtype=bool)
        ocultos[bloque] = True
        try:
            completa, _ = con_explicativas.regresion(_problema(y, X, ocultos))
        except ErrorDeEntrada:
            continue
        predicho = completa[bloque]
        buenos = ~np.isnan(predicho)
        errores.append(predicho[buenos] - y[bloque][buenos])
    errores = np.concatenate(errores) if errores else np.array([])
    if len(errores) < MIN_VALIDADOS:
        return None
    return float(np.sqrt(np.mean(errores ** 2))), float(np.mean(np.abs(errores))), int(len(errores))


def _validar_en_tramos(problema, columnas):
    """Error de la regresión con esas columnas sobre los puntos quitados con valor real, con la misma regla que la tabla de
    resultados (se evalúan los que el método consigue imputar). Devuelve (rmse, mae, puntos) o None si casi no se ha podido predecir."""
    p = Problema(y=problema.y, verdad=problema.verdad, quitado=problema.quitado, objetivo=problema.objetivo, tramos=problema.tramos, X=problema.X[:, columnas])
    try:
        completa, _ = con_explicativas.regresion(p)
    except ErrorDeEntrada:
        return None
    evaluables = problema.quitado & ~np.isnan(completa)
    if evaluables.sum() < MIN_VALIDADOS:
        return None
    errores = completa[evaluables] - problema.verdad[evaluables]
    return float(np.sqrt(np.mean(errores ** 2))), float(np.mean(np.abs(errores))), int(evaluables.sum())


def _ajuste(y, X):
    """(SSE, puntos, parámetros) de la recta de y sobre X con los puntos donde todo tiene dato; None si no se puede."""
    filas = ~np.isnan(y) & ~np.isnan(X).any(axis=1)
    parametros = X.shape[1] + 1
    if filas.sum() < parametros + 1:
        return None
    A = np.column_stack([np.ones(filas.sum()), X[filas]])
    coeficientes = np.linalg.lstsq(A, y[filas], rcond=None)[0]
    residuos = y[filas] - A @ coeficientes
    return float(residuos @ residuos), int(filas.sum()), parametros, float(np.sum((y[filas] - y[filas].mean()) ** 2))


def _r2_ajustado(y, X, subconjunto):
    """R² ajustado con los puntos donde las del subconjunto tienen dato; None si no se puede calcular."""
    ajuste = _ajuste(y, X[:, subconjunto])
    if ajuste is None:
        return None
    sse, n, p, sct = ajuste
    return 1 - (sse / (n - p)) / (sct / (n - 1)) if sct > 0 and n > p else None


def sugerir_explicativas(y, quitados, explicativas, bloques=5):
    """y: la explicada (None donde falta); quitados: tramos que se han quitado (no se usan: se tratan como faltantes);
    explicativas: las candidatas. Devuelve los subconjuntos probados (índices en `explicativas`) ordenados por error."""
    if len(explicativas) < 2:
        raise ErrorDeEntrada("Hacen falta al menos 2 explicativas con datos para buscar una combinación")
    if not 2 <= bloques <= 10:
        raise ErrorDeEntrada("El número de bloques de validación debe estar entre 2 y 10")
    problema = preparar(y, quitados, explicativas)     # deja como faltantes también los tramos quitados
    y, X = problema.y, problema.X
    conocidos = int((~np.isnan(y)).sum())
    if conocidos < MIN_CONOCIDOS:
        raise ErrorDeEntrada(f"Hacen falta al menos {MIN_CONOCIDOS} datos conocidos de la explicada para validar (hay {conocidos})")
    bloques = min(bloques, conocidos // 2)
    quitados_con_valor = int(problema.quitado.sum())
    en_tramos = quitados_con_valor >= MIN_VALIDADOS          # hay con qué comparar: los tramos quitados (si no, se esconden bloques)
    k = X.shape[1]

    evaluados = {}

    def evaluar(subconjunto):
        subconjunto = tuple(sorted(subconjunto))
        if subconjunto in evaluados:
            return evaluados[subconjunto]
        validacion = _validar_en_tramos(problema, list(subconjunto)) if en_tramos else _validar(y, X[:, list(subconjunto)], bloques)
        if validacion is None:
            evaluados[subconjunto] = None
        else:
            evaluados[subconjunto] = {"indices": list(subconjunto), "rmse": validacion[0], "mae": validacion[1], "validados": validacion[2], "r2_ajustado": _r2_ajustado(y, X, list(subconjunto))}
        return evaluados[subconjunto]

    if k <= MAX_EXHAUSTIVO:
        metodo = "exhaustivo"
        for tamano in range(2, k + 1):
            for subconjunto in combinations(range(k), tamano):
                evaluar(subconjunto)
    else:
        metodo = "paso_a_paso"
        singles = [(evaluar((i,)), i) for i in range(k)]
        singles = [(r["rmse"], i) for r, i in singles if r is not None]
        if len(singles) < 2:
            raise ErrorDeEntrada("Casi ninguna explicativa tiene datos suficientes para validar")
        actual = (min(singles)[1],)
        mejor_rmse = min(singles)[0]
        while len(actual) < k:
            candidatos = [(evaluar(actual + (i,)), i) for i in range(k) if i not in actual]
            candidatos = [(r["rmse"], i) for r, i in candidatos if r is not None]
            if not candidatos:
                break
            rmse, i = min(candidatos)
            if len(actual) >= 2 and rmse > mejor_rmse * (1 - MEJORA_MINIMA):
                break
            actual, mejor_rmse = actual + (i,), min(mejor_rmse, rmse)

    candidatos = sorted((r for s, r in evaluados.items() if r is not None and len(s) >= 2), key=lambda r: (r["rmse"], len(r["indices"]), r["indices"]))
    if not candidatos:
        raise ErrorDeEntrada("Ninguna combinación de explicativas tiene datos suficientes para validar")
    redondeado = [{**c, **{clave: (None if c[clave] is None else round(float(c[clave]), 6)) for clave in ("rmse", "mae", "r2_ajustado")}} for c in candidatos]
    return {"metodo": metodo, "validacion": "tramos" if en_tramos else "bloques", "bloques": bloques, "conocidos": conocidos, "quitados": quitados_con_valor, "probados": len(candidatos), "candidatos": redondeado, "mejor": redondeado[0]["indices"]}
