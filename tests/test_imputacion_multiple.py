"""Imputación múltiple (MCMC) según el Handbook de la OCDE y el JRC (apartado 3.5): N imputaciones independientes con
pasos de imputación y posterior, combinadas con la media o la mediana."""
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app import app
from senales import ErrorDeEntrada
from senales.imputacion import con_explicativas, imputar, metricas, multiple
from senales.imputacion.preparar import preparar

cliente = TestClient(app)


def problema(y, explicativas=(), quitados=()):
    return preparar(y, list(quitados), list(explicativas))


def datos_normales(n=300, ruido=0.5, semilla=11):
    """y = 2 + 1.5·x1 − 0.8·x2 + ruido N(0, ruido), con x1 y x2 normales."""
    rng = np.random.default_rng(semilla)
    x1, x2 = rng.normal(0, 1, n), rng.normal(0, 1, n)
    return x1, x2, 2 + 1.5 * x1 - 0.8 * x2 + rng.normal(0, ruido, n)


TRAMOS = [(40, 49), (100, 109), (180, 189), (250, 254)]


def escenario(n=300, ruido=0.5, tramos=TRAMOS, semilla=11):
    x1, x2, y = datos_normales(n, ruido, semilla)
    return problema(list(y), [list(x1), list(x2)], tramos), x1, x2, y


def tramos_repartidos(n, cuantos, largo):
    """`cuantos` tramos de `largo` puntos repartidos por la serie."""
    paso = n // cuantos
    return [(i * paso + 3, i * paso + 3 + largo - 1) for i in range(cuantos)]


# ---------------------------------------------------------------- muestreador de la Wishart-inversa
def test_la_media_de_la_inversa_wishart_es_escala_entre_grados_menos_p_menos_1():
    escala = np.array([[2.0, 0.5, 0.2], [0.5, 1.5, 0.3], [0.2, 0.3, 1.0]])
    grados, p = 12, 3
    rng = np.random.default_rng(1)
    muestras = np.array([multiple.inversa_wishart(rng, grados, escala) for _ in range(6_000)])
    assert muestras.mean(axis=0) == pytest.approx(escala / (grados - p - 1), rel=0.08, abs=0.02)


def test_las_muestras_de_la_inversa_wishart_son_simetricas_y_definidas_positivas():
    escala = np.array([[2.0, 0.5, 0.2], [0.5, 1.5, 0.3], [0.2, 0.3, 1.0]])
    rng = np.random.default_rng(2)
    for _ in range(300):
        muestra = multiple.inversa_wishart(rng, 12, escala)
        assert np.allclose(muestra, muestra.T)
        assert np.linalg.eigvalsh((muestra + muestra.T) / 2).min() > 0


# ---------------------------------------------------------------- reproducibilidad
def test_misma_semilla_da_exactamente_lo_mismo_y_otra_semilla_algo_distinto():
    p, *_ = escenario()
    a, _, muestras_a = multiple.imputacion_multiple(p, {"semilla": 7})
    b, _, muestras_b = multiple.imputacion_multiple(p, {"semilla": 7})
    c, _, muestras_c = multiple.imputacion_multiple(p, {"semilla": 8})
    assert np.array_equal(a, b) and np.array_equal(muestras_a, muestras_b)
    assert not np.allclose(a[p.objetivo], c[p.objetivo]) and not np.allclose(muestras_a, muestras_c)


def test_los_valores_conocidos_de_la_explicada_no_cambian():
    p, *_ = escenario()
    completa, _, muestras = multiple.imputacion_multiple(p)
    conocidos = ~np.isnan(p.y)
    assert np.array_equal(completa[conocidos], p.y[conocidos])
    assert (muestras[:, conocidos] == p.y[conocidos]).all()
    assert not np.isnan(completa).any() and muestras.shape == (5, p.n)          # N = 5 por defecto


def test_las_n_imputaciones_son_distintas_entre_si():
    p, *_ = escenario()
    _, _, muestras = multiple.imputacion_multiple(p, {"n": 6})
    assert muestras.shape == (6, p.n)
    huecos = muestras[:, p.objetivo]
    assert all(not np.allclose(huecos[0], huecos[i]) for i in range(1, 6))


# ---------------------------------------------------------------- datos normales simulados
def test_el_valor_combinado_se_parece_al_de_la_regresion_y_su_dispersion_al_ruido():
    p, *_ = escenario(n=300, ruido=0.5)
    completa, _, muestras = multiple.imputacion_multiple(p, {"n": 25, "iteraciones": 100, "semilla": 1})
    regresion, _ = con_explicativas.regresion(p)
    assert np.abs(completa - regresion)[p.objetivo].mean() < 0.15
    dispersion = muestras[:, p.objetivo].std(axis=0, ddof=1).mean()      # entre las N imputaciones de un mismo punto
    assert 0.3 < dispersion < 0.8


def test_el_error_de_la_imputacion_multiple_es_parecido_al_de_la_regresion():
    x1, x2, y = datos_normales(300, 0.5)
    r = imputar(list(y), TRAMOS, [list(x1), list(x2)], [{"metodo": "imputacion_multiple", "parametros": {"n": 25, "semilla": 1}}, {"metodo": "regresion"}])
    por = {f["metodo"]: f["metricas"] for f in r["resultados"]}
    assert por["imputacion_multiple"]["rmse"] == pytest.approx(por["regresion"]["rmse"], rel=0.25)
    assert por["imputacion_multiple"]["r2"] == pytest.approx(por["regresion"]["r2"], abs=0.1)


# ---------------------------------------------------------------- estructura: la variación se conserva
def test_la_razon_de_varianzas_de_la_imputacion_multiple_es_cercana_a_1_y_mayor_que_la_de_la_regresion():
    n = 400
    x1, x2, y = datos_normales(n, ruido=2.0)                            # mucho ruido: la regresión aplana más
    quitados = tramos_repartidos(n, 20, 10)                              # 200 puntos quitados, repartidos
    r = imputar(list(y), quitados, [list(x1), list(x2)], [{"metodo": "imputacion_multiple", "parametros": {"n": 20, "semilla": 3}}, {"metodo": "regresion"}])
    por = {f["metodo"]: f["metricas"] for f in r["resultados"]}
    assert por["regresion"]["razon_var"] < 0.7                           # la regresión aplana
    assert 0.7 < por["imputacion_multiple"]["razon_var"] < 1.4           # la imputación múltiple conserva la variación
    assert por["imputacion_multiple"]["razon_var"] > por["regresion"]["razon_var"] + 0.2


def test_la_razon_de_varianzas_se_promedia_sobre_las_n_series_y_no_se_mide_sobre_la_media():
    n = 400
    x1, x2, y = datos_normales(n, ruido=2.0)
    quitados = tramos_repartidos(n, 20, 10)
    p = problema(list(y), [list(x1), list(x2)], quitados)
    completa, _, muestras = multiple.imputacion_multiple(p, {"n": 20, "semilla": 3})
    evaluables = p.quitado
    real = p.verdad[evaluables]
    sobre_la_media = metricas.razon_varianzas(real, completa[evaluables])
    promedio = np.mean([metricas.razon_varianzas(real, m[evaluables]) for m in muestras])
    resultado, _, _ = metricas.evaluar(p, completa, completa, None, (), muestras)
    assert resultado["razon_var"] == pytest.approx(promedio)             # lo que da evaluar: el promedio de las N
    assert resultado["razon_var"] > sobre_la_media + 0.2                 # sobre la media saldría la variación aplanada
    sin_muestras, _, _ = metricas.evaluar(p, completa, completa)
    assert sin_muestras["razon_var"] == pytest.approx(sobre_la_media)


def test_el_cambio_en_la_correlacion_tambien_se_promedia_sobre_las_n_series():
    n = 400
    x1, x2, y = datos_normales(n, ruido=2.0)
    p = problema(list(y), [list(x1), list(x2)], tramos_repartidos(n, 20, 10))
    completa, _, muestras = multiple.imputacion_multiple(p, {"n": 10, "semilla": 4})
    serie_real = np.where(p.quitado, p.verdad, p.y)
    esperado = np.mean([abs(np.mean([metricas.sesgo_correlacion(serie_real, np.where(p.objetivo, m, p.y), x)
                                     for m in muestras])) for x in (x1, x2)])
    _, _, sesgos = metricas.evaluar(p, completa, completa, None, (x1, x2), muestras)
    resultado, _, _ = metricas.evaluar(p, completa, completa, None, (x1, x2), muestras)
    assert resultado["sesgo_corr"] == pytest.approx(esperado)
    assert len(sesgos) == 2


# ---------------------------------------------------------------- media o mediana
def test_la_mediana_es_la_mediana_de_las_n_imputaciones_y_la_media_su_media():
    p, *_ = escenario()
    for n in (4, 5):                                                     # par e impar
        media, _, muestras = multiple.imputacion_multiple(p, {"n": n, "semilla": 5, "combinar": "media"})
        mediana, _, otras = multiple.imputacion_multiple(p, {"n": n, "semilla": 5, "combinar": "mediana"})
        assert np.array_equal(muestras, otras)                           # mismas N imputaciones
        assert media[p.objetivo] == pytest.approx(muestras.mean(axis=0)[p.objetivo])
        assert mediana[p.objetivo] == pytest.approx(np.median(muestras, axis=0)[p.objetivo])
        assert np.isfinite(media).all() and np.isfinite(mediana).all()
        assert not np.allclose(media[p.objetivo], mediana[p.objetivo])


def test_otra_forma_de_combinar_da_error():
    p, *_ = escenario()
    with pytest.raises(ErrorDeEntrada, match="mediana"):
        multiple.imputacion_multiple(p, {"combinar": "moda"})


# ---------------------------------------------------------------- casos límite
def test_un_tramo_de_un_solo_punto_se_imputa():
    x1, x2, y = datos_normales(120)
    p = problema(list(y), [list(x1), list(x2)], [(30, 30)])
    completa, _, _ = multiple.imputacion_multiple(p, {"n": 20, "semilla": 1})
    assert np.isfinite(completa).all() and abs(completa[30] - y[30]) < 2.5


def test_admite_huecos_en_las_explicativas_incluso_dentro_del_tramo():
    x1, x2, y = datos_normales(150)
    x1, x2 = list(x1), list(x2)
    for i in (42, 43, 60, 61, 90):                                       # huecos de la explicativa 1 (algunos dentro del tramo 40-49)
        x1[i] = None
    for i in (45, 100, 101):
        x2[i] = None
    p = problema(list(y), [x1, x2], [(40, 49), (95, 104)])
    completa, _, muestras = multiple.imputacion_multiple(p, {"n": 10, "iteraciones": 50, "semilla": 2})
    assert np.isfinite(completa).all() and np.isfinite(muestras).all()


def test_un_punto_sin_ningun_dato_tambien_se_imputa():
    x1, x2, y = datos_normales(100)
    y, x1, x2 = list(y), list(x1), list(x2)
    y[50], x1[50], x2[50] = None, None, None                             # ni la explicada ni las explicativas
    p = problema(y, [x1, x2], [(20, 25)])
    assert p.objetivo[50]
    completa, _, muestras = multiple.imputacion_multiple(p, {"n": 10, "iteraciones": 50, "semilla": 3})
    assert np.isfinite(completa[50]) and muestras[:, 50].std() > 0       # sale de la distribución final: distinto en cada imputación


def test_con_muy_pocos_puntos_con_datos_da_un_error_claro():
    p = problema([1, 2, None, 4, 5], [[1, 2, 3, 4, 5], [5, 3, 4, 1, 2]])
    with pytest.raises(ErrorDeEntrada, match="muy pocos puntos"):
        multiple.imputacion_multiple(p)


def test_sin_explicativas_da_error():
    with pytest.raises(ErrorDeEntrada, match="explicativa"):
        multiple.imputacion_multiple(problema([1, None, 3, 4, 5, 6, 7, 8]))


def test_explicativas_sin_ningun_dato_dan_error():
    p = problema([1.0, 2, None, 4, 3, 5, 6, 2, 8, 9], [[None] * 10])
    with pytest.raises(ErrorDeEntrada, match="ningún dato"):
        multiple.imputacion_multiple(p)


def test_dos_explicativas_casi_identicas_no_fallan():
    x1, _, y = datos_normales(200)
    p = problema(list(y), [list(x1), list(x1 + 1e-9)], [(50, 59), (120, 124)])
    completa, _, _ = multiple.imputacion_multiple(p, {"n": 5, "iteraciones": 30, "semilla": 1})
    assert np.isfinite(completa).all()


# ---------------------------------------------------------------- parámetros
@pytest.mark.parametrize("parametros, palabra", [
    ({"n": 1}, "imputaciones"), ({"n": 51}, "imputaciones"), ({"n": 5.0}, "imputaciones"), ({"n": True}, "imputaciones"), ({"n": "5"}, "imputaciones"),
    ({"iteraciones": 9}, "iteraciones"), ({"iteraciones": 501}, "iteraciones"), ({"iteraciones": 10.5}, "iteraciones"), ({"iteraciones": False}, "iteraciones"),
    ({"semilla": -1}, "semilla"), ({"semilla": 1_000_001}, "semilla"), ({"semilla": "7"}, "semilla"), ({"semilla": True}, "semilla"),
])
def test_parametros_fuera_de_rango_o_de_otro_tipo_dan_error(parametros, palabra):
    p, *_ = escenario(n=60, tramos=[(10, 14)])
    with pytest.raises(ErrorDeEntrada, match=palabra):
        multiple.imputacion_multiple(p, parametros)


@pytest.mark.parametrize("parametros", [{"n": 2, "iteraciones": 10, "semilla": 0}, {"n": 50, "iteraciones": 10, "semilla": 1_000_000}])
def test_los_limites_de_los_parametros_valen(parametros):
    p, *_ = escenario(n=60, tramos=[(10, 14)])
    assert np.isfinite(multiple.imputacion_multiple(p, parametros)[0]).all()


def test_pasarse_del_presupuesto_de_trabajo_da_error():
    p, *_ = escenario(n=2000, tramos=[(100, 109)])
    assert 50 * 500 * 2000 * 3 * 3 > multiple.PRESUPUESTO
    with pytest.raises(ErrorDeEntrada, match="tardaría demasiado"):
        multiple.imputacion_multiple(p, {"n": 50, "iteraciones": 500})


def test_los_valores_por_defecto_funcionan_sin_parametros():
    p, *_ = escenario(n=60, tramos=[(10, 14)])
    completa, desviacion, muestras = multiple.imputacion_multiple(p)
    por_defecto = multiple.imputacion_multiple(p, {"n": 5, "iteraciones": 100, "semilla": 42, "combinar": "media"})[0]
    assert np.array_equal(completa, por_defecto) and desviacion is None and muestras.shape[0] == 5


# ---------------------------------------------------------------- imputar()
def test_imputar_da_las_metricas_completas_sin_intervalo_y_junto_a_otros_metodos():
    x1, x2, y = datos_normales(300)
    explicativas = [list(x1), list(x2)]
    r = imputar(list(y), TRAMOS, explicativas, [
        {"metodo": "regresion"}, {"metodo": "em"}, {"metodo": "imputacion_multiple", "parametros": {"n": 5, "iteraciones": 50, "semilla": 1}},
    ], explicativas)
    por = {f["metodo"]: f for f in r["resultados"]}
    assert list(por) == ["regresion", "em", "imputacion_multiple"]
    mi = por["imputacion_multiple"]
    assert mi["error"] is None and mi["nombre"] == "Imputación múltiple (MCMC)" and mi["sin_imputar"] == 0
    for clave in ("mae", "rmse", "rmse_est", "r2", "mejora", "razon_var", "sesgo_corr"):
        assert mi["metricas"][clave] is not None, clave
    assert mi["metricas"]["n"] == sum(b - a + 1 for a, b in TRAMOS)
    assert mi["intervalo"] is None
    for clave in ("cobertura", "anchura", "anchura_est", "interval_score"):
        assert mi["metricas"][clave] is None, clave
    assert len(mi["sesgo_correlacion"]) == 2 and all(s is not None for s in mi["sesgo_correlacion"])
    assert por["regresion"]["intervalo"] is not None                     # la regresión sí da el suyo


def test_sin_comparar_con_no_hay_sesgo_de_correlacion():
    x1, x2, y = datos_normales(200)
    r = imputar(list(y), [(50, 59)], [list(x1), list(x2)], [{"metodo": "imputacion_multiple", "parametros": {"n": 3, "iteraciones": 20}}])
    mi = r["resultados"][0]
    assert mi["sesgo_correlacion"] == [] and mi["metricas"]["sesgo_corr"] is None and mi["metricas"]["razon_var"] is not None


def test_el_error_de_un_metodo_no_impide_los_demas():
    x1, x2, y = datos_normales(200)
    r = imputar(list(y), [(50, 59)], [list(x1), list(x2)], [{"metodo": "imputacion_multiple", "parametros": {"n": 1}}, {"metodo": "regresion"}])
    mal, bien = r["resultados"]
    assert "imputaciones" in mal["error"] and "imputado" not in mal
    assert bien["error"] is None


# ---------------------------------------------------------------- API
def pedir(metodos, n=80, quitados=((20, 29),)):
    x1, x2, y = datos_normales(n, 0.5, semilla=21)
    return cliente.post("/api/imputar", json={
        "y": list(map(float, y)), "quitados": [list(t) for t in quitados], "explicativas": [list(map(float, x1)), list(map(float, x2))],
        "metodos": metodos, "comparar_con": [list(map(float, x1)), list(map(float, x2))],
    })


def test_la_api_acepta_la_imputacion_multiple_con_sus_parametros():
    r = pedir([{"metodo": "imputacion_multiple", "parametros": {"n": 3, "iteraciones": 20, "semilla": 5, "combinar": "mediana"}}])
    assert r.status_code == 200
    mi = r.json()["resultados"][0]
    assert mi["error"] is None and len(mi["imputado"]) == 80 and mi["metricas"]["razon_var"] is not None
    otra = pedir([{"metodo": "imputacion_multiple", "parametros": {"n": 3, "iteraciones": 20, "semilla": 5, "combinar": "mediana"}}]).json()["resultados"][0]
    assert otra["imputado"] == mi["imputado"]                            # misma semilla, mismo resultado


def test_la_api_devuelve_el_error_del_metodo_y_no_un_422():
    r = pedir([{"metodo": "imputacion_multiple", "parametros": {"n": 1}}, {"metodo": "media"}])
    assert r.status_code == 200                                          # los ErrorDeEntrada de un método van en su resultado
    mal, bien = r.json()["resultados"]
    assert "imputaciones" in mal["error"] and bien["error"] is None
