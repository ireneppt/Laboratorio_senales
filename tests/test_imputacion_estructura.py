"""Métricas de estructura (razón de varianzas, sesgo de correlación) e incertidumbre (intervalos de la regresión y
del EM: cobertura, anchura e interval score)."""
import json
import re
import shutil
import subprocess
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app import app
from senales.imputacion import con_explicativas, imputar, metricas
from senales.imputacion.preparar import preparar

cliente = TestClient(app)
RAIZ = Path(__file__).resolve().parent.parent


def problema(y, explicativas=(), quitados=()):
    return preparar(y, list(quitados), list(explicativas))


def datos_lineales(n=3000, quitados=600, semilla=7):
    """y = 2 + 3x + ruido N(0, 1), con `quitados` puntos sueltos quitados al azar."""
    rng = np.random.default_rng(semilla)
    x = rng.normal(0, 1, n)
    y = 2 + 3 * x + rng.normal(0, 1, n)
    puntos = rng.choice(np.arange(n), size=quitados, replace=False)
    return x, y, [(int(i), int(i)) for i in puntos]


# ---------------------------------------------------------------- Pearson
def test_pearson_coincide_con_el_calculo_a_mano():
    x, y = np.array([1.0, 2, 3, 4]), np.array([2.0, 4, 5, 9])
    dx, dy = x - 2.5, y - 5
    a_mano = (dx @ dy) / np.sqrt((dx @ dx) * (dy @ dy))
    assert metricas.pearson(x, y) == pytest.approx(a_mano)


def test_pearson_sin_datos_suficientes_o_con_una_serie_constante_es_none():
    assert metricas.pearson(np.array([1.0, 2]), np.array([3.0, 4])) is None          # menos de 3 parejas
    assert metricas.pearson(np.array([1.0, 2, 3]), np.array([5.0, 5, 5])) is None    # una serie constante


def test_pearson_esta_recortado_entre_menos_1_y_1():
    x = np.array([0.1, 0.2, 0.3, 0.4, 0.5]) * 1e8
    assert -1 <= metricas.pearson(x, x) <= 1 and metricas.pearson(x, x) == pytest.approx(1)
    assert metricas.pearson(x, -x) == pytest.approx(-1) and metricas.pearson(x, -x) >= -1


def test_pearson_de_python_es_el_mismo_que_el_de_javascript():
    if shutil.which("node") is None:
        pytest.skip("no hay node para ejecutar el JavaScript")
    codigo = (RAIZ / "public" / "js" / "80-correlacion.js").read_text(encoding="utf-8")
    funcion = re.search(r"function correlacionPearson\(xs, ys\) \{.*?\n\}", codigo, re.S).group(0)
    rng = np.random.default_rng(3)
    xs = np.round(rng.normal(50, 12, 30), 4)
    ys = np.round(0.7 * xs + rng.normal(0, 5, 30), 4)
    programa = f"{funcion}\nconsole.log(JSON.stringify(correlacionPearson({json.dumps(xs.tolist())}, {json.dumps(ys.tolist())})));"
    salida = subprocess.run(["node", "-e", programa], capture_output=True, text=True, check=True).stdout
    assert metricas.pearson(xs, ys) == pytest.approx(json.loads(salida), rel=1e-12)


# ---------------------------------------------------------------- razón de varianzas
def test_razon_de_varianzas():
    real = np.array([1.0, 4, 2, 8])
    assert metricas.razon_varianzas(real, real) == pytest.approx(1)                   # imputación exacta
    assert metricas.razon_varianzas(real, np.full(4, 3.0)) == 0                       # constante: la aplana del todo
    assert metricas.razon_varianzas(np.array([1.0]), np.array([2.0])) is None         # menos de 2 puntos
    assert metricas.razon_varianzas(np.array([5.0, 5, 5]), real[:3]) is None          # lo real no varía


# ---------------------------------------------------------------- sesgo de correlación
def test_sesgo_de_correlacion_es_0_con_una_imputacion_exacta():
    x = np.arange(20, dtype=float)
    real = 2 * x + np.sin(x)
    assert metricas.sesgo_correlacion(real, real.copy(), x) == pytest.approx(0)


def test_imputar_con_la_media_debilita_la_correlacion():
    rng = np.random.default_rng(1)
    x = rng.normal(0, 1, 200)
    y = 3 * x + rng.normal(0, 0.3, 200)
    p = problema(list(y), quitados=[(40, 79)])
    completa = p.y.copy()
    completa[p.objetivo] = np.nanmean(p.y)
    real = np.where(p.quitado, p.verdad, p.y)
    assert metricas.sesgo_correlacion(real, completa, x) < -0.05


def test_sesgo_solo_con_los_puntos_que_tienen_dato_las_tres_series():
    real = np.array([1.0, 2, 3, 4, np.nan, 6])
    completa = np.array([1.0, 2, 3, 4, 5, 6])
    otra = np.array([2.0, 4, 6, 8, 10, np.nan])
    assert metricas.sesgo_correlacion(real, completa, otra) == pytest.approx(0)       # se ignoran los puntos 4 y 5


# ---------------------------------------------------------------- incertidumbre (intervalo del 95 %)
def test_incertidumbre_a_mano():
    imputado, desviacion = np.full(3, 10.0), np.ones(3)
    real = np.array([10.0, 7.0, 13.0])                       # dentro, por debajo y por encima
    l, u = 10 - metricas.Z_95, 10 + metricas.Z_95
    anchura = u - l
    puntuaciones = [anchura, anchura + (2 / 0.05) * (l - 7), anchura + (2 / 0.05) * (13 - u)]
    r = metricas.incertidumbre(real, imputado, desviacion, np.array([0.0, 2.0]))     # lo conocido: desviación 1
    assert r["cobertura"] == pytest.approx(1 / 3)
    assert r["anchura"] == pytest.approx(anchura)
    assert r["anchura_est"] == pytest.approx(anchura / 1)
    assert r["interval_score"] == pytest.approx(np.mean(puntuaciones))


def test_incertidumbre_con_lo_conocido_constante_no_da_anchura_estandarizada():
    r = metricas.incertidumbre(np.array([1.0]), np.array([1.0]), np.array([1.0]), np.array([5.0, 5.0]))
    assert r["anchura_est"] is None and r["cobertura"] == 1


# ---------------------------------------------------------------- intervalos de la regresión
def test_la_desviacion_de_la_regresion_es_la_del_intervalo_de_prediccion():
    x = np.array([0.0, 1, 2, 3, 4, 5, 6, 7])
    y = np.array([1.0, 3.2, 4.9, 7.1, 9.0, 11.2, 12.8, 15.1])
    con_hueco = list(y)
    con_hueco[5] = None
    completa, desviacion = con_explicativas.regresion(problema(con_hueco, explicativas=[list(x)]))
    filas = [i for i in range(8) if i != 5]
    A = np.column_stack([np.ones(len(filas)), x[filas]])
    coef = np.linalg.lstsq(A, y[filas], rcond=None)[0]
    residuos = y[filas] - A @ coef
    s2 = residuos @ residuos / (len(filas) - 2)
    x0 = np.array([1.0, x[5]])
    assert completa[5] == pytest.approx(x0 @ coef)
    assert desviacion[5] == pytest.approx(np.sqrt(s2 * (1 + x0 @ np.linalg.inv(A.T @ A) @ x0)))
    assert np.isnan(desviacion[[0, 1, 2, 3, 4, 6, 7]]).all()                          # solo donde se imputa


def test_el_intervalo_de_la_regresion_cubre_el_95_por_ciento():
    x, y, quitados = datos_lineales()
    p = problema(list(y), explicativas=[list(x)], quitados=quitados)
    completa, desviacion = con_explicativas.regresion(p)
    m, _, _ = metricas.evaluar(p, completa, completa, desviacion)
    assert 0.92 <= m["cobertura"] <= 0.98
    assert np.nanmean(desviacion[p.objetivo]) == pytest.approx(1, abs=0.05)           # la del ruido


# ---------------------------------------------------------------- intervalos del EM
def test_el_intervalo_del_em_cubre_razonablemente_y_coincide_con_la_regresion():
    x, y, quitados = datos_lineales()
    p = problema(list(y), explicativas=[list(x)], quitados=quitados)
    completa, desviacion = con_explicativas.em(p)
    m, _, _ = metricas.evaluar(p, completa, completa, desviacion)
    assert 0.90 <= m["cobertura"] <= 0.98
    assert np.allclose(completa[p.objetivo], con_explicativas.regresion(p)[0][p.objetivo], atol=0.01)


# ---------------------------------------------------------------- en la respuesta de imputar
def test_los_metodos_sin_intervalo_no_tienen_metricas_de_incertidumbre_pero_si_de_estructura():
    x, y, quitados = datos_lineales(n=300, quitados=40)
    r = imputar(list(y), quitados, [list(x)], [{"metodo": m} for m in ("media", "interpolacion", "mediana", "regresion")])
    por = {f["metodo"]: f for f in r["resultados"]}
    for metodo in ("media", "interpolacion", "mediana"):
        assert por[metodo]["intervalo"] is None
        assert all(por[metodo]["metricas"][c] is None for c in ("cobertura", "anchura", "anchura_est", "interval_score"))
        assert por[metodo]["metricas"]["razon_var"] is not None
    assert por["regresion"]["intervalo"] is not None and por["regresion"]["metricas"]["cobertura"] is not None
    inferior, superior, imputado = (np.array(v, dtype=float) for v in (por["regresion"]["intervalo"]["inferior"], por["regresion"]["intervalo"]["superior"], por["regresion"]["imputado"]))
    hueco = quitados[0][0]
    assert inferior[hueco] < imputado[hueco] < superior[hueco]
    assert por["media"]["metricas"]["razon_var"] == 0                                  # la media aplana del todo


def test_comparar_con_da_un_sesgo_por_serie_y_su_media_en_valor_absoluto():
    x, y, quitados = datos_lineales(n=300, quitados=40)
    otra = np.sin(np.arange(300) / 10)
    r = imputar(list(y), quitados, [], [{"metodo": "media"}], comparar_con=[list(x), list(otra)])["resultados"][0]
    sesgos = r["sesgo_correlacion"]
    assert len(sesgos) == 2 and sesgos[0] < 0                                          # con x, la media la debilita
    assert r["metricas"]["sesgo_corr"] == pytest.approx(np.mean(np.abs(sesgos)), abs=1e-6)
    sin = imputar(list(y), quitados, [], [{"metodo": "media"}])["resultados"][0]
    assert sin["sesgo_correlacion"] == [] and sin["metricas"]["sesgo_corr"] is None


def test_la_interpolacion_de_una_recta_conserva_varianza_y_correlacion():
    y = [2 + 0.5 * i for i in range(60)]
    otra = [np.cos(i / 7) + i * 0.1 for i in range(60)]
    r = imputar(y, [[20, 29]], [], [{"metodo": "interpolacion"}], comparar_con=[otra])["resultados"][0]
    assert r["metricas"]["razon_var"] == pytest.approx(1, abs=1e-6)
    assert r["sesgo_correlacion"][0] == pytest.approx(0, abs=1e-6)


# ---------------------------------------------------------------- API
def test_la_api_devuelve_intervalo_y_sesgos():
    x, y, quitados = datos_lineales(n=200, quitados=20)
    cuerpo = {"y": list(y), "quitados": quitados, "explicativas": [list(x)], "comparar_con": [list(x)],
              "metodos": [{"metodo": "regresion"}, {"metodo": "media"}]}
    respuesta = cliente.post("/api/imputar", json=cuerpo)
    assert respuesta.status_code == 200
    por = {f["metodo"]: f for f in respuesta.json()["resultados"]}
    assert por["regresion"]["intervalo"] is not None and por["media"]["intervalo"] is None
    assert len(por["media"]["sesgo_correlacion"]) == 1


def test_la_api_no_admite_mas_de_20_series_para_comparar():
    cuerpo = {"y": [1, 2, None, 4, 5], "metodos": [{"metodo": "media"}], "comparar_con": [[1, 2, 3, 4, 5]] * 21}
    assert cliente.post("/api/imputar", json=cuerpo).status_code == 422
