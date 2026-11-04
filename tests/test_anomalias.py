import numpy as np
import pytest

from senales import Anomalias, ErrorDeEntrada
from senales.anomalias import factor_de_anomalias

T = np.arange(100)


def factor(*textos, **kw):
    return factor_de_anomalias(T, Anomalias(textos=list(textos), **kw))


def test_la_puntual_solo_afecta_a_un_punto():
    f, resueltas = factor("puntual,30,25")
    assert f[30] == pytest.approx(0.25) and np.count_nonzero(f) == 1
    assert resueltas == [{"tipo": "puntual", "punto": 30, "magnitud": 25.0}]


def test_el_cambio_de_nivel_desplaza_la_serie_desde_ese_punto():
    f, _ = factor("cambio_nivel,40,-20")
    assert np.all(f[:40] == 0) and np.all(f[40:] == pytest.approx(-0.2))


def test_el_transitorio_se_apaga_poco_a_poco():
    f, _ = factor("transitorio,50,30,0.9")
    assert f[49] == 0 and f[50] == pytest.approx(0.3)
    assert f[51] == pytest.approx(0.3 * 0.9) and f[60] == pytest.approx(0.3 * 0.9 ** 10)


def test_el_decaimiento_por_defecto_es_0_7():
    f, _ = factor("transitorio,10,50")
    assert f[11] == pytest.approx(0.5 * 0.7)


def test_varias_anomalias_se_acumulan():
    f, resueltas = factor("cambio_nivel,30,20", "puntual,60,-15")
    assert f[29] == 0 and f[30] == pytest.approx(0.2) and f[60] == pytest.approx(0.2 - 0.15)
    assert len(resueltas) == 2


def test_un_punto_fuera_del_eje_se_pega_al_borde():
    _, resueltas = factor("puntual,500,10", "puntual,-5,10")
    assert [r["punto"] for r in resueltas] == [99, 0]


def test_las_aleatorias_salen_de_su_semilla():
    pedido = ("puntual,aleatorio,aleatorio", "cambio_nivel,aleatorio,aleatorio")
    assert factor(*pedido, semilla=5)[1] == factor(*pedido, semilla=5)[1]
    assert factor(*pedido, semilla=5)[1] != factor(*pedido, semilla=6)[1]


def test_la_magnitud_aleatoria_cae_dentro_del_rango_con_signo_al_azar():
    _, resueltas = factor(*["puntual,aleatorio,aleatorio"] * 30, magnitud_min=50, magnitud_max=60, semilla=1)
    assert all(50 <= abs(r["magnitud"]) <= 60 for r in resueltas)
    assert {r["magnitud"] > 0 for r in resueltas} == {True, False}


@pytest.mark.parametrize("texto,mensaje", [
    ("rara,30,25", "Anomalía no válida"),
    ("puntual,30", "Anomalía no válida"),
    ("puntual,abc,25", "Anomalía no válida"),
    ("puntual,30,xx", "Anomalía no válida"),
    ("transitorio,30,10,mucho", "Anomalía no válida"),
    ("transitorio,30,10,1.5", "decaimiento"),
    ("puntual,30,5000", "magnitud debe estar"),
])
def test_los_errores_dicen_que_pasa(texto, mensaje):
    with pytest.raises(ErrorDeEntrada, match=mensaje):
        factor(texto)


def test_el_minimo_aleatorio_no_puede_superar_al_maximo():
    with pytest.raises(ErrorDeEntrada, match="magnitud aleatoria"):
        factor("puntual,10,10", magnitud_min=40, magnitud_max=10)
