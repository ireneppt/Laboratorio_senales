import numpy as np
import pytest

from senales import Anomalias, Ciclos, ErrorDeEntrada, Estacionalidad, Huecos, Ruido, Tendencia, generar_serie

SIN_NADA = dict(
    tendencia=Tendencia(activa=False), estacionalidad=Estacionalidad(activa=False), ciclos=Ciclos(activo=False),
    ruido=Ruido(activo=False), anomalias=Anomalias(activas=False), huecos=Huecos(activos=False),
)


def serie(puntos=120, nivel_base=100, **bloques):
    return generar_serie(puntos, nivel_base, **{**SIN_NADA, **bloques})


def test_la_respuesta_tiene_todo_lo_que_la_pagina_necesita():
    r = serie()
    assert set(r) == {"x", "y", "y_completa", "huecos", "n_faltantes", "componentes", "anomalias"}
    assert set(r["componentes"]) == {"tendencia", "estacionalidad", "ciclo", "ruido", "anomalias"}
    assert r["x"] == list(range(120)) and len(r["y"]) == 120


def test_sin_nada_activo_es_una_recta_plana_en_el_nivel_base():
    assert set(serie()["y"]) == {100.0}


def test_con_los_mismos_parametros_sale_siempre_lo_mismo():
    pedido = dict(estacionalidad=Estacionalidad(), ciclos=Ciclos(activo=True), ruido=Ruido(tipo="garch", semilla=3),
                  anomalias=Anomalias(textos=["puntual,aleatorio,aleatorio"], semilla=4))
    assert serie(**pedido) == serie(**pedido)


def test_por_defecto_hay_ruido_y_no_hay_ciclos():
    por_defecto = generar_serie(120, 100)
    assert any(abs(v) > 0 for v in por_defecto["componentes"]["ruido"])
    assert all(v == 0 for v in por_defecto["componentes"]["ciclo"])


def test_los_componentes_suman_la_serie():
    r = generar_serie(
        200, 100, estacionalidad=Estacionalidad(periodos=[24], modos=["aditiva"]), ciclos=Ciclos(activo=True),
        ruido=Ruido(grado=4), anomalias=Anomalias(textos=["cambio_nivel,100,15", "puntual,50,-30"]),
    )
    suma = np.sum([r["componentes"][c] for c in ("tendencia", "estacionalidad", "ciclo", "ruido", "anomalias")], axis=0)
    assert np.allclose(suma, r["y_completa"] or r["y"], atol=1e-3)


def test_la_serie_acaba_en_el_valor_final():
    assert serie(tendencia=Tendencia(valor_final=300))["y"][-1] == pytest.approx(300)


def test_los_huecos_dejan_none_y_guardan_lo_que_valian():
    r = serie(huecos=Huecos(textos=["10,12"]))
    assert r["y"][10:13] == [None, None, None] and r["n_faltantes"] == 3
    assert r["y_completa"][10:13] == [100.0, 100.0, 100.0] and None not in r["y_completa"]
    assert r["huecos"] == [{"desde": 10, "hasta": 12}]


def test_sin_huecos_no_hay_serie_completa_aparte():
    r = serie()
    assert r["y_completa"] is None and r["n_faltantes"] == 0 and r["huecos"] == []


def test_los_huecos_no_cambian_los_componentes():
    con = serie(tendencia=Tendencia(valor_final=200), huecos=Huecos(textos=["5,50"]))
    sin = serie(tendencia=Tendencia(valor_final=200))
    assert con["componentes"] == sin["componentes"]


def test_las_anomalias_aplicadas_se_devuelven():
    r = serie(anomalias=Anomalias(textos=["puntual,aleatorio,aleatorio"], semilla=9))
    assert len(r["anomalias"]) == 1 and 0 <= r["anomalias"][0]["punto"] < 120


def test_cada_bloque_se_calcula_aunque_otros_esten_apagados():
    assert any(v != 0 for v in serie(estacionalidad=Estacionalidad())["componentes"]["estacionalidad"])
    assert any(v != 0 for v in serie(ruido=Ruido())["componentes"]["ruido"])


def test_hacen_falta_al_menos_2_puntos():
    with pytest.raises(ErrorDeEntrada):
        generar_serie(1, 100)


def test_un_error_de_un_bloque_apagado_no_molesta():
    serie(estacionalidad=Estacionalidad(activa=False, minimos=[50], maximos=[10]))  # no se llega a comprobar
