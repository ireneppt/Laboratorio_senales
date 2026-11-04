import numpy as np
import pytest

from senales import Ciclos, ErrorDeEntrada
from senales.ciclos import onda_de_ciclos, ruido_lento

N = 400


def eje(n=N):
    t = np.arange(n)
    return t, t / (n - 1)


def onda(**kw):
    t, u = eje()
    return onda_de_ciclos(t, u, Ciclos(activo=True, **kw))


IRREGULAR = dict(periodos=[50], var_periodos=[30], var_amplitudes=[40], minimos=[-10], maximos=[10], modos=["aditiva"])


def test_con_la_misma_semilla_sale_lo_mismo_y_con_otra_no():
    assert np.array_equal(onda(**IRREGULAR, semillas=[7]), onda(**IRREGULAR, semillas=[7]))
    assert not np.array_equal(onda(**IRREGULAR, semillas=[7]), onda(**IRREGULAR, semillas=[8]))


def test_sin_variacion_es_una_onda_fija():
    y = onda(periodos=[40], var_periodos=[0], var_amplitudes=[0], minimos=[-10], maximos=[10], modos=["aditiva"])
    t, _ = eje()
    assert np.allclose(y, 10 * np.sin(2 * np.pi * t / 40))


def test_con_variacion_la_altura_cambia_de_una_vuelta_a_otra():
    y = onda(**IRREGULAR, semillas=[3])
    picos = [y[i:i + 50].max() for i in range(0, N - 50, 50)]
    assert max(picos) - min(picos) > 1


def test_cada_ciclo_depende_solo_de_su_semilla():
    uno = dict(periodos=[50], var_periodos=[30], var_amplitudes=[40], minimos=[-10], maximos=[10], modos=["aditiva"], semillas=[1])
    dos = dict(periodos=[120], var_periodos=[20], var_amplitudes=[25], minimos=[-4], maximos=[4], modos=["aditiva"], semillas=[2])
    juntos = {clave: uno[clave] + dos[clave] for clave in uno}
    assert np.allclose(onda(**juntos) - onda(**uno), onda(**dos))  # borrar el primero no cambia el segundo


def test_sin_semillas_el_ciclo_i_usa_44_mas_i():
    sin = onda(periodos=[50, 120], var_periodos=[30, 30], var_amplitudes=[40, 40], minimos=[-10, -4], maximos=[10, 4], modos=["aditiva", "aditiva"])
    con = onda(periodos=[50, 120], var_periodos=[30, 30], var_amplitudes=[40, 40], minimos=[-10, -4], maximos=[10, 4], modos=["aditiva", "aditiva"], semillas=[44, 45])
    assert np.array_equal(sin, con)


def test_la_multiplicativa_cambia_su_amplitud_del_inicio_al_final():
    y = onda(periodos=[40], var_periodos=[0], var_amplitudes=[0], minimos=[-10], maximos=[10], minimos_fin=[-30], maximos_fin=[30], modos=["multiplicativa"])
    assert np.abs(y[:40]).max() < 15 and np.abs(y[-40:]).max() > 25


def test_cada_ciclo_necesita_todos_sus_valores():
    with pytest.raises(ErrorDeEntrada, match="todos sus valores"):
        onda(periodos=[50, 120], var_periodos=[30])


def test_el_minimo_no_puede_superar_al_maximo():
    with pytest.raises(ErrorDeEntrada, match="mínimo del ciclo"):
        onda(minimos=[20], maximos=[10])


def test_el_ruido_lento_tiene_media_0_desviacion_1_y_cambia_despacio():
    r = ruido_lento(np.random.default_rng(1), 20000, 15)
    assert len(r) == 20000
    assert abs(r.mean()) < 0.15 and r.std() == pytest.approx(1, abs=0.1)
    assert np.corrcoef(r[:-1], r[1:])[0, 1] > 0.9  # un punto se parece mucho al siguiente
