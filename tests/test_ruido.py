import numpy as np
import pytest

from senales import ErrorDeEntrada, Ruido
from senales.ruido import aplicar_ruido, ruido_unitario

N = 20000


def eje(n=N):
    return np.arange(n) / (n - 1)


def unitario(tipo, **kw):
    return ruido_unitario(Ruido(tipo=tipo, semilla=11, **kw), eje())


def autocorrelacion(x, retardo=1):
    return np.corrcoef(x[:-retardo], x[retardo:])[0, 1]


def test_el_ruido_blanco_tiene_media_0_y_desviacion_1():
    r = unitario("blanco")
    assert abs(r.mean()) < 0.05 and r.std() == pytest.approx(1, abs=0.05)
    assert abs(autocorrelacion(r)) < 0.05  # cada punto es independiente


def test_el_heterocedastico_crece_con_el_tiempo():
    r = unitario("heterocedastico")
    quinto = N // 5
    assert r[-quinto:].std() > 3 * r[:quinto].std()


def test_el_heterocedastico_va_de_x0_25_al_principio_a_x2_al_final():
    multiplicador = unitario("heterocedastico") / unitario("blanco")  # mismo azar: solo cambia el factor
    assert multiplicador[0] == pytest.approx(0.25) and multiplicador[-1] == pytest.approx(2)
    assert np.allclose(multiplicador, 0.25 + 1.75 * eje())


@pytest.mark.parametrize("tipo,signo", [("autocorrelado_positivo", 1), ("autocorrelado_negativo", -1)])
def test_el_autocorrelado_se_parece_al_punto_anterior(tipo, signo):
    r = unitario(tipo, phi=0.8)
    assert autocorrelacion(r) == pytest.approx(signo * 0.8, abs=0.03)
    assert r.std() == pytest.approx(1, abs=0.06)  # la desviación sigue siendo 1


def test_con_phi_cero_el_autocorrelado_es_blanco():
    assert abs(autocorrelacion(unitario("autocorrelado_positivo", phi=0))) < 0.05


def test_garch_tiene_rachas_de_calma_y_de_volatilidad():
    r = unitario("garch")
    assert autocorrelacion(r ** 2) > 0.03   # los golpes grandes vienen juntos
    assert abs(autocorrelacion(r)) < 0.05   # pero el signo no se hereda


def test_colas_pesadas_tiene_valores_extremos():
    r = unitario("colas_pesadas")
    assert np.abs(r).max() > 5 * r.std()


def test_con_la_misma_semilla_sale_lo_mismo():
    assert np.array_equal(unitario("garch"), unitario("garch"))
    assert not np.array_equal(ruido_unitario(Ruido(semilla=1), eje()), ruido_unitario(Ruido(semilla=2), eje()))


def test_un_tipo_desconocido_da_error():
    with pytest.raises(ErrorDeEntrada):
        unitario("rara")


def test_el_ruido_es_proporcional_al_valor_de_la_serie():
    u = eje()
    para_100 = aplicar_ruido(np.full(N, 100.0), Ruido(grado=5, semilla=3), u) - 100
    para_200 = aplicar_ruido(np.full(N, 200.0), Ruido(grado=5, semilla=3), u) - 200
    assert para_100.std() == pytest.approx(5, abs=0.25)   # grado 5: se mueve ~5 sobre 100
    assert np.allclose(para_200, 2 * para_100)             # sobre 200 se mueve el doble


def test_el_ruido_no_depende_del_signo_de_la_serie():
    u = eje()
    positivo = aplicar_ruido(np.full(N, 100.0), Ruido(grado=5, semilla=3), u) - 100
    negativo = aplicar_ruido(np.full(N, -100.0), Ruido(grado=5, semilla=3), u) + 100
    assert np.allclose(positivo, negativo)


def test_con_grado_cero_no_cambia_nada():
    serie = np.linspace(50, 150, 200)
    assert np.array_equal(aplicar_ruido(serie, Ruido(grado=0), eje(200)), serie)
