import pytest

from senales import ErrorDeEntrada, Huecos
from senales.huecos import resolver_huecos


def huecos(*textos, activos=True, puntos=100):
    return resolver_huecos(Huecos(activos=activos, textos=list(textos)), puntos)


def test_un_punto_suelto():
    faltan, resueltos = huecos("30,30")
    assert faltan.sum() == 1 and faltan[30]
    assert resueltos == [{"desde": 30, "hasta": 30}]


def test_un_rango_incluye_los_dos_extremos():
    faltan, _ = huecos("40,60")
    assert faltan.sum() == 21 and faltan[40] and faltan[60] and not faltan[39] and not faltan[61]


def test_varios_huecos_se_juntan():
    faltan, resueltos = huecos("10,10", "30,45", "90,99")
    assert faltan.sum() == 1 + 16 + 10 and len(resueltos) == 3


def test_lo_que_se_sale_del_eje_se_pega_al_borde():
    faltan, resueltos = huecos("90,500", "-4,3")
    assert resueltos == [{"desde": 90, "hasta": 99}, {"desde": 0, "hasta": 3}]
    assert faltan.sum() == 10 + 4


def test_apagado_o_sin_huecos_no_falta_nada():
    assert huecos("30,40", activos=False)[0].sum() == 0
    assert resolver_huecos(Huecos(), 100)[0].sum() == 0


@pytest.mark.parametrize("texto,mensaje", [("60,40", "anterior al inicio"), ("60", "no válido"), ("a,b", "no válido"), ("1,2,3", "no válido")])
def test_los_errores_dicen_que_pasa(texto, mensaje):
    with pytest.raises(ErrorDeEntrada, match=mensaje):
        huecos(texto)
