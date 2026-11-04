import numpy as np
import pytest

from senales import ErrorDeEntrada, Tendencia
from senales.tendencia import calcular_nivel, forma_de_tendencia

TIPOS = ("lineal", "cuadratica", "amortiguada", "logaritmica", "exponencial")


def eje(n=101):
    return np.arange(n) / (n - 1)


@pytest.mark.parametrize("tipo", TIPOS)
def test_todas_las_formas_van_de_0_a_1_y_solo_suben(tipo):
    forma = forma_de_tendencia(tipo, eje())
    assert forma[0] == pytest.approx(0) and forma[-1] == pytest.approx(1)
    assert np.all(np.diff(forma) > 0)


def test_cada_tipo_curva_el_camino_distinto():
    a_mitad = {tipo: forma_de_tendencia(tipo, eje())[50] for tipo in TIPOS}
    assert a_mitad["lineal"] == pytest.approx(0.5)
    assert a_mitad["cuadratica"] == pytest.approx(0.25)
    assert a_mitad["exponencial"] < a_mitad["cuadratica"] < a_mitad["lineal"] < a_mitad["logaritmica"] < a_mitad["amortiguada"]


def test_el_valor_es_una_proporcion_del_nivel():
    nivel = calcular_nivel(100, Tendencia(valor=0.5), eje())
    assert nivel[0] == pytest.approx(100) and nivel[-1] == pytest.approx(150)


def test_con_valor_menos_uno_la_serie_baja_hasta_cero():
    assert calcular_nivel(100, Tendencia(valor=-1), eje())[-1] == pytest.approx(0)


def test_sin_tendencia_el_nivel_es_plano():
    nivel = calcular_nivel(70, Tendencia(activa=False), eje())
    assert np.all(nivel == 70)


def test_el_valor_final_manda_sobre_el_valor_y_sobre_el_interruptor():
    nivel = calcular_nivel(100, Tendencia(activa=False, valor=5, valor_final=180), eje())
    assert nivel[0] == pytest.approx(100) and nivel[-1] == pytest.approx(180)


def test_el_valor_final_funciona_con_nivel_cero_y_hacia_abajo():
    assert calcular_nivel(0, Tendencia(valor_final=50), eje())[-1] == pytest.approx(50)
    assert calcular_nivel(100, Tendencia(valor_final=-20), eje())[-1] == pytest.approx(-20)


def test_el_valor_final_respeta_la_forma_elegida():
    nivel = calcular_nivel(100, Tendencia(tipo="cuadratica", valor_final=150), eje())
    assert nivel[50] == pytest.approx(112.5) and nivel[-1] == pytest.approx(150)


def test_un_tipo_desconocido_da_error():
    with pytest.raises(ErrorDeEntrada):
        calcular_nivel(100, Tendencia(tipo="rara"), eje())
