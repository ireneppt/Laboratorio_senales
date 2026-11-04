import numpy as np
import pytest

from senales import ErrorDeEntrada, Estacionalidad
from senales.estacionalidad import onda_estacional

N = 401  # con periodo 4 (o 40) el último punto cae justo en un cruce por cero y los picos caen en puntos enteros


def eje(n=N):
    t = np.arange(n)
    return t, t / (n - 1)


def onda(**kw):
    t, u = eje()
    return onda_estacional(t, u, Estacionalidad(**kw))


def test_aditiva_oscila_entre_el_minimo_y_el_maximo():
    y = onda(periodos=[4], modos=["aditiva"], minimos=[-5], maximos=[20])
    assert y.min() == pytest.approx(-5) and y.max() == pytest.approx(20)


def test_por_defecto_es_una_onda_de_periodo_50_entre_menos_10_y_10():
    y = onda()
    assert y.max() == pytest.approx(10, abs=0.1) and y.min() == pytest.approx(-10, abs=0.1)
    assert y[0] == pytest.approx(0) and y[50] == pytest.approx(0, abs=1e-9)  # una vuelta cada 50 puntos


def test_la_aditiva_ignora_los_valores_al_final():
    sin_fin = onda(periodos=[40], modos=["aditiva"], minimos=[-10], maximos=[10])
    con_fin = onda(periodos=[40], modos=["aditiva"], minimos=[-10], maximos=[10], minimos_fin=[-30], maximos_fin=[30])
    assert np.array_equal(sin_fin, con_fin)


def test_la_multiplicativa_pasa_de_la_amplitud_inicial_a_la_final():
    y = onda(periodos=[4], modos=["multiplicativa"], minimos=[-10], maximos=[10], minimos_fin=[-30], maximos_fin=[30])
    assert 10 <= np.abs(y[:8]).max() < 10.5                        # al principio, ±10 (ya empieza a crecer)
    assert 29 < np.abs(y[-8:]).max() <= 30                        # al final, casi ±30
    assert 20 <= np.abs(y[200:208]).max() < 20.5                   # a mitad de camino, ±20


def test_varias_ondas_se_suman():
    t, u = eje()
    juntas = onda_estacional(t, u, Estacionalidad(periodos=[12, 30], modos=["aditiva", "aditiva"], minimos=[-5, -8], maximos=[5, 8]))
    primera = onda_estacional(t, u, Estacionalidad(periodos=[12], modos=["aditiva"], minimos=[-5], maximos=[5]))
    segunda = onda_estacional(t, u, Estacionalidad(periodos=[30], modos=["aditiva"], minimos=[-8], maximos=[8]))
    assert np.allclose(juntas, primera + segunda)


def test_el_minimo_no_puede_superar_al_maximo():
    with pytest.raises(ErrorDeEntrada, match="mínimo de la estacionalidad"):
        onda(minimos=[30], maximos=[10])


def test_el_minimo_final_solo_se_comprueba_en_la_multiplicativa():
    onda(modos=["aditiva"], minimos=[-10], maximos=[10], minimos_fin=[50], maximos_fin=[40])  # se ignora: no da error
    with pytest.raises(ErrorDeEntrada):
        onda(modos=["multiplicativa"], minimos=[-10], maximos=[10], minimos_fin=[50], maximos_fin=[40])


def test_cada_onda_necesita_todos_sus_valores():
    with pytest.raises(ErrorDeEntrada, match="necesita un periodo"):
        onda(periodos=[12, 30], modos=["aditiva"])
