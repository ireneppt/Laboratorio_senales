"""Componentes de una serie manual: periodo, descomposición, fuerzas, pendiente de Sen y anomalías."""
import time

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app import app
from senales import Ciclos, ErrorDeEntrada, Estacionalidad, Ruido, Tendencia, generar_serie
from senales import componentes as comp

cliente = TestClient(app)


def estacional(n, periodo, amplitud=10.0, pendiente=0.05, ruido=1.0, semilla=1):
    """Recta + seno de ese periodo + ruido normal. Devuelve (serie, tendencia real, estacionalidad real)."""
    t = np.arange(n)
    tendencia = 50 + pendiente * t
    estacionalidad = amplitud * np.sin(2 * np.pi * t / periodo)
    ruido = np.random.default_rng(semilla).normal(0, ruido, n)
    return tendencia + estacionalidad + ruido, tendencia, estacionalidad


# ---------------------------------------------------------------- periodo
@pytest.mark.parametrize("periodo", [4, 7, 12, 24])
def test_se_detecta_el_periodo(periodo):
    y, _, _ = estacional(periodo * 12, periodo)
    r = comp.analizar(list(y))
    assert r["periodo"] == periodo and r["origen_periodo"] == "sugerido"


def test_periodo_12_no_se_confunde_con_24_ni_con_6():
    y, _, _ = estacional(240, 12, ruido=2.0, semilla=7)
    assert comp.analizar(list(y))["periodo"] == 12


def test_un_patron_con_dos_picos_por_ciclo_da_el_ciclo_entero():
    t = np.arange(240)
    y = 10 * np.sin(2 * np.pi * t / 12) + 6 * np.sin(2 * np.pi * t / 6) + np.random.default_rng(3).normal(0, 1, 240)
    assert comp.analizar(list(y))["periodo"] == 12


def test_sin_estacionalidad_no_sugiere_periodo_y_avisa():
    t = np.arange(200)
    y = 3 + 0.2 * t + np.random.default_rng(2).normal(0, 1, 200)
    r = comp.analizar(list(y))
    assert r["periodo"] is None and r["estacionalidad"] is None and r["fuerza_estacionalidad"] is None
    assert any("No se ha detectado estacionalidad" in a for a in r["avisos"])


def test_con_pocos_ciclos_no_sugiere_y_avisa():
    # periodo 12 con 30 puntos (2,5 ciclos): solo se buscan periodos de hasta un tercio de la serie (3 ciclos)
    y, _, _ = estacional(30, 12, ruido=0.1)
    r = comp.analizar(list(y))
    assert r["periodo"] != 12 and r["detalle"]["periodo"]["retardo_max"] == 10


def test_estacionalidad_mas_ciclo_generada_se_detecta_bien():
    serie = generar_serie(
        360, 100, tendencia=Tendencia(valor=0.3), estacionalidad=Estacionalidad(periodos=[12], modos=["aditiva"], minimos=[-8], maximos=[8]),
        ciclos=Ciclos(activo=True), ruido=Ruido(grado=1, semilla=5),
    )
    y = [None if v is None else v for v in serie["y"]]
    assert comp.analizar(y)["periodo"] == 12


# ---------------------------------------------------------------- descomposición
def test_la_descomposicion_se_parece_a_las_componentes_reales():
    y, tendencia, estacionalidad = estacional(240, 12, amplitud=10, pendiente=0.1, ruido=0.5)
    r = comp.analizar(list(y))
    dentro = ~np.array(r["prolongado"])
    assert np.abs(np.array(r["tendencia"])[dentro] - tendencia[dentro]).max() < 1
    assert np.abs(np.array(r["estacionalidad"])[dentro] - estacionalidad[dentro]).max() < 1
    assert abs(sum(r["patron"])) < 1e-6                                       # el patrón suma 0


def test_tendencia_mas_estacionalidad_mas_resto_es_la_serie():
    y, _, _ = estacional(100, 7, ruido=2)
    con_huecos = [None if i in (10, 11, 50) else v for i, v in enumerate(y)]
    r = comp.analizar(con_huecos, periodo=7)
    suma = np.array(r["tendencia"]) + np.array(r["estacionalidad"]) + np.array(r["resto"])
    conocidos = np.array([v is not None for v in con_huecos])
    assert suma[conocidos] == pytest.approx(y[conocidos], abs=1e-4)          # también en los extremos prolongados
    assert np.array(r["prolongado"])[:3].all() and np.array(r["prolongado"])[-3:].all()


def test_media_movil_2xp_con_p_par():
    z = np.arange(10, dtype=float) ** 2
    m = comp.media_movil_centrada(z, 4)
    # 2x4: (z0/2 + z1 + z2 + z3 + z4/2) / 4 en el punto 2
    assert m[2] == pytest.approx((0 / 2 + 1 + 4 + 9 + 16 / 2) / 4)
    assert np.isnan(m[:2]).all() and np.isnan(m[-2:]).all() and not np.isnan(m[2:-2]).any()
    impar = comp.media_movil_centrada(z, 3)
    assert impar[1] == pytest.approx((0 + 1 + 4) / 3) and np.isnan(impar[0])


# ---------------------------------------------------------------- fuerzas
def test_fuerzas_altas_con_componentes_fuertes_y_poco_ruido():
    y, _, _ = estacional(240, 12, amplitud=10, pendiente=0.3, ruido=0.3)
    r = comp.analizar(list(y))
    assert r["fuerza_tendencia"]["valor"] > 0.9 and r["fuerza_tendencia"]["etiqueta"] == "fuerte"
    assert r["fuerza_estacionalidad"]["valor"] > 0.9 and r["fuerza_estacionalidad"]["etiqueta"] == "fuerte"


def test_fuerzas_bajas_sin_componente():
    y = np.random.default_rng(4).normal(0, 1, 240)
    r = comp.analizar(list(y), periodo=12)
    assert r["fuerza_tendencia"]["valor"] < comp.FUERZA_DEBIL and r["fuerza_tendencia"]["etiqueta"] == "débil"
    assert r["fuerza_estacionalidad"]["valor"] < comp.FUERZA_DEBIL


def test_etiquetas_de_la_fuerza():
    assert comp.etiqueta_fuerza(0.1) == "débil"
    assert comp.etiqueta_fuerza(0.45) == "moderada"
    assert comp.etiqueta_fuerza(0.9) == "fuerte"
    assert comp.etiqueta_fuerza(None) is None


# ---------------------------------------------------------------- pendiente de Sen y Mann-Kendall
def test_recta_con_ruido_da_su_pendiente_y_es_significativa():
    t = np.arange(200)
    y = 10 + 0.5 * t + np.random.default_rng(6).normal(0, 3, 200)
    p = comp.analizar(list(y))["pendiente"]
    assert p["sen"] == pytest.approx(0.5, abs=0.03) and p["significativa"] and p["p"] < 0.001
    assert not p["submuestreo"] and p["pares"] == 200 * 199 // 2


def test_ruido_puro_no_es_significativo():
    p = comp.analizar(list(np.random.default_rng(8).normal(0, 1, 200)))["pendiente"]
    assert not p["significativa"] and abs(p["sen"]) < 0.01


def test_con_muchos_puntos_se_submuestrea_y_sigue_bien():
    t = np.arange(5000)
    y = 2 - 0.01 * t + np.random.default_rng(9).normal(0, 1, 5000)
    p = comp.analizar(list(y))["pendiente"]
    assert p["submuestreo"] and p["puntos"] == comp.MAX_PUNTOS_SEN
    assert p["sen"] == pytest.approx(-0.01, abs=0.001) and p["significativa"]


def test_la_pendiente_se_calcula_sin_la_estacionalidad():
    y, _, _ = estacional(240, 12, amplitud=20, pendiente=0.2, ruido=0.5)
    assert comp.analizar(list(y))["pendiente"]["sen"] == pytest.approx(0.2, abs=0.02)


# ---------------------------------------------------------------- anomalías
def test_detecta_las_anomalias_insertadas():
    y, _, _ = estacional(240, 12, ruido=0.5, semilla=11)
    for i in (40, 120, 200):
        y[i] += 15
    r = comp.analizar(list(y))
    # sin la segunda pasada, los vecinos de la misma fase (44 y 196) también salían marcados. Puede salir además algún
    # punto de ruido extremo (aquí el 117, a 2,6 desviaciones): el umbral de 3 MAD del resto queda en unas 2,5
    assert {40, 120, 200} <= set(r["anomalias"]) and not {44, 196} & set(r["anomalias"]) and len(r["anomalias"]) <= 4
    assert r["detalle"]["anomalias"]["primera_pasada"] >= 3


def test_una_serie_limpia_no_tiene_anomalias():
    y, _, _ = estacional(240, 12, ruido=0)                                      # resto ≈ 0 (solo redondeos): MAD despreciable
    assert comp.analizar(list(y))["anomalias"] == []
    exacta = 50 + 0.1 * np.arange(120) + 5 * np.tile([1.0, -1.0, 0.5, -0.5], 30)
    assert comp.analizar(list(exacta), periodo=4)["anomalias"] == []           # resto 0: MAD 0, no se marca nada


# ---------------------------------------------------------------- huecos
def test_una_serie_con_huecos_se_analiza_y_avisa():
    y, _, _ = estacional(240, 12, ruido=0.5)
    huecos = set(range(30, 40)) | {100, 150}
    con_huecos = [None if i in huecos else v for i, v in enumerate(y)]
    con_huecos[60] += 20                                                      # una anomalía, fuera de los huecos
    r = comp.analizar(con_huecos)
    assert r["periodo"] == 12 and any("rellenado provisionalmente" in a for a in r["avisos"])
    assert [i for i, v in enumerate(r["rellenado"]) if v] == sorted(huecos)
    assert 60 in r["anomalias"] and not set(r["anomalias"]) & huecos


# ---------------------------------------------------------------- periodo del usuario y entradas no válidas
def test_se_respeta_el_periodo_del_usuario():
    y, _, _ = estacional(240, 12)
    r = comp.analizar(list(y), periodo=24)
    assert r["periodo"] == 24 and r["origen_periodo"] == "usuario" and len(r["patron"]) == 24


@pytest.mark.parametrize("periodo", [1, 0, 121, 2.5, "12", True])
def test_un_periodo_no_valido_da_error(periodo):
    with pytest.raises(ErrorDeEntrada, match="periodo"):
        comp.analizar(list(range(240)), periodo=periodo)


def test_con_menos_de_8_datos_da_error():
    with pytest.raises(ErrorDeEntrada, match="8 datos"):
        comp.analizar([1, 2, None, 4, 5, 6, 7, None, None])


# ---------------------------------------------------------------- API
def test_api_componentes():
    y, _, _ = estacional(120, 12)
    r = cliente.post("/api/componentes", json={"y": [None, *list(y)[1:]]})
    assert r.status_code == 200
    datos = r.json()
    for clave in ("periodo", "origen_periodo", "tendencia", "estacionalidad", "resto", "patron", "prolongado", "rellenado",
                  "fuerza_tendencia", "fuerza_estacionalidad", "pendiente", "anomalias", "avisos", "detalle"):
        assert clave in datos
    assert datos["periodo"] == 12 and len(datos["tendencia"]) == 120
    assert cliente.post("/api/componentes", json={"y": list(y), "periodo": 12}).json()["origen_periodo"] == "usuario"


def test_api_componentes_con_periodo_no_valido():
    assert cliente.post("/api/componentes", json={"y": list(range(20)), "periodo": 15}).status_code == 422   # más de la mitad
    assert cliente.post("/api/componentes", json={"y": list(range(20)), "periodo": 1}).status_code == 422    # menos de 2
    assert cliente.post("/api/componentes", json={"y": [1, 2, None, None]}).status_code == 422             # pocos datos


def test_es_rapido_con_10000_puntos():
    y, _, _ = estacional(10_000, 12, ruido=1)
    inicio = time.perf_counter()
    comp.analizar(list(y))
    comp.analizar(list(y), periodo=12)
    assert time.perf_counter() - inicio < 10


def test_una_serie_muy_corta_no_busca_estacionalidad_y_lo_avisa():
    r = comp.analizar([1.0, 3, 2, 4, 3, 5, 4, 6, 5, 7])          # 10 puntos
    assert r["periodo"] is None and any("demasiado corta" in a for a in r["avisos"])


def test_el_detalle_cuenta_los_puntos_prolongados_a_cada_lado():
    serie, _, _ = estacional(120, 12)
    r = comp.analizar(list(serie))
    d = r["detalle"]["tendencia"]
    assert (d["longitud"], d["doble"], d["prolongados_inicio"], d["prolongados_fin"]) == (12, True, 6, 6)   # media 2x12: 13 puntos
    assert sum(r["prolongado"]) == 12 and r["prolongado"][:6] == [True] * 6 and r["prolongado"][-6:] == [True] * 6
