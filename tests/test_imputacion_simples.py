import numpy as np
import pytest

from senales import ErrorDeEntrada
from senales.imputacion import simples
from senales.imputacion.preparar import preparar

NAN = np.nan


def problema(y, quitados=(), explicativas=()):
    return preparar(y, list(quitados), list(explicativas))


def test_se_distingue_lo_que_ya_faltaba_de_lo_que_se_quita():
    p = problema([1, 2, None, 4, 5, 6], quitados=[(4, 5)])
    assert p.objetivo.tolist() == [False, False, True, False, True, True]   # a imputar: el hueco y lo quitado
    assert p.quitado.tolist() == [False, False, False, False, True, True]   # de lo quitado se conoce el valor real
    assert p.verdad[4:].tolist() == [5, 6] and np.isnan(p.verdad[:4]).all()
    assert np.isnan(p.y[4:]).all()                                           # lo quitado no se ve


def test_los_tramos_se_recortan_y_se_funden():
    p = problema(list(range(10)), quitados=[(2, 4), (4, 6), (8, 99), (-5, 0)])
    assert p.tramos == [(0, 0), (2, 6), (8, 9)]


def test_interpolacion_une_los_datos_con_rectas():
    p = problema([1, 2, None, None, 5, 6])
    assert simples.interpolacion(p).tolist() == [1, 2, 3, 4, 5, 6]


def test_interpolacion_mantiene_el_valor_mas_cercano_en_los_extremos():
    assert simples.interpolacion(problema([None, 2, 3, None])).tolist() == [2, 2, 3, 3]


def test_ultimo_valor_repite_el_anterior():
    assert simples.ultimo_valor(problema([1, 2, None, None, 5, None])).tolist() == [1, 2, 2, 2, 5, 5]


def test_ultimo_valor_usa_el_primero_si_empieza_vacia():
    assert simples.ultimo_valor(problema([None, None, 3, 4])).tolist() == [3, 3, 3, 4]


def test_media_y_mediana_de_lo_conocido():
    p = problema([1, 2, None, None, 5, 9])
    assert simples.media(p).tolist() == [1, 2, 4.25, 4.25, 5, 9]
    assert simples.mediana(p).tolist() == [1, 2, 3.5, 3.5, 5, 9]


def test_lo_quitado_no_cuenta_para_la_media():
    p = problema([1, 2, 3, 4, 5, 100], quitados=[(5, 5)])   # el 100 se ha quitado: no entra en la media
    assert simples.media(p)[5] == pytest.approx(3)


@pytest.mark.parametrize("metodo", [simples.media, simples.mediana, simples.ultimo_valor, simples.interpolacion])
def test_sin_ningun_dato_conocido_da_error(metodo):
    with pytest.raises(ErrorDeEntrada, match="ningún dato conocido"):
        metodo(problema([None, None, None]))


def test_se_alinean_las_explicativas_de_otra_longitud():
    p = problema([1, 2, 3, 4], explicativas=[[10, 20], [1, 2, 3, 4, 5, 6]])
    assert p.X.shape == (4, 2)
    assert np.isnan(p.X[2:, 0]).all() and p.X[:, 1].tolist() == [1, 2, 3, 4]


def test_hacen_falta_al_menos_3_puntos():
    with pytest.raises(ErrorDeEntrada):
        problema([1, 2])
