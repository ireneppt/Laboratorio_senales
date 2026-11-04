import numpy as np
import pytest

from senales import ErrorDeEntrada
from senales.imputacion import con_explicativas, imputar
from senales.imputacion.preparar import preparar


def problema(y, explicativas=(), quitados=()):
    return preparar(y, list(quitados), list(explicativas))


# ---------------------------------------------------------------- hot deck
def test_hot_deck_copia_el_dato_del_punto_con_explicativa_mas_parecida():
    p = problema([10, 20, 30, 40, None], explicativas=[[1, 2, 3, 4, 3.1]])
    assert con_explicativas.hot_deck(p, {"k": 1})[4] == 30          # el donante es el punto con x = 3


def test_hot_deck_con_varios_donantes_hace_la_media():
    p = problema([10, 20, 30, 40, None], explicativas=[[1, 2, 3, 4, 3.1]])
    assert con_explicativas.hot_deck(p, {"k": 2})[4] == pytest.approx(35)   # los dos más cercanos: x = 3 y x = 4


def test_hot_deck_compara_con_las_explicativas_que_si_hay():
    p = problema([10, 20, 30, 40, None], explicativas=[[1, 2, 3, 4, 2.1], [9, 9, 9, 9, None]])
    assert con_explicativas.hot_deck(p, {"k": 1})[4] == 20           # solo mira la primera: la segunda no tiene dato ahí


def test_hot_deck_no_imputa_si_ninguna_explicativa_tiene_dato():
    p = problema([10, 20, 30, None], explicativas=[[1, 2, 3, None]])
    assert np.isnan(con_explicativas.hot_deck(p)[3])


# ---------------------------------------------------------------- regresión
def test_la_regresion_recupera_una_relacion_exacta():
    x = np.arange(20, dtype=float)
    y = list(2 + 3 * x)
    y[7] = None
    y[15] = None
    p = problema(y, explicativas=[list(x)])
    assert con_explicativas.regresion(p)[[7, 15]] == pytest.approx([2 + 3 * 7, 2 + 3 * 15])


def test_la_regresion_con_dos_explicativas():
    rng = np.random.default_rng(0)
    a, b = rng.normal(size=60), rng.normal(size=60)
    y = list(1 + 2 * a - 3 * b)
    y[10] = None
    p = problema(y, explicativas=[list(a), list(b)])
    assert con_explicativas.regresion(p)[10] == pytest.approx(1 + 2 * a[10] - 3 * b[10])


def test_la_regresion_usa_las_explicativas_que_hay_en_cada_punto():
    x = np.arange(20, dtype=float)
    segunda = list(np.sin(x))
    segunda[12] = None                                  # en el punto 12 solo hay la primera
    y = list(5 + 2 * x)
    y[12] = None
    p = problema(y, explicativas=[list(x), segunda])
    assert con_explicativas.regresion(p)[12] == pytest.approx(5 + 2 * 12)


def test_la_regresion_no_imputa_con_muy_pocos_datos():
    p = problema([1, None, None, None], explicativas=[[1, 2, 3, 4]])
    assert np.isnan(con_explicativas.regresion(p)[1:]).all()


# ---------------------------------------------------------------- EM
def datos_correlados(n=400, correlacion=0.9, semilla=1):
    rng = np.random.default_rng(semilla)
    x = rng.normal(size=n)
    y = correlacion * x + np.sqrt(1 - correlacion ** 2) * rng.normal(size=n)
    return x, y


def tramos_quitados(n, cada=10, largo=4):
    return [(i, i + largo - 1) for i in range(5, n - largo, cada * 2)]


def test_em_mejora_mucho_a_la_media_cuando_hay_buena_relacion():
    x, y = datos_correlados()
    r = imputar(list(y), tramos_quitados(len(y)), [list(x)], [{"metodo": "em"}, {"metodo": "media"}])
    por_metodo = {f["metodo"]: f["metricas"]["rmse"] for f in r["resultados"]}
    assert por_metodo["em"] < 0.6 * por_metodo["media"]            # el error teórico con r = 0,9 es 0,44 frente a 1


def test_em_con_explicativas_completas_se_parece_a_la_regresion():
    x, y = datos_correlados()
    p = problema(list(y), explicativas=[list(x)], quitados=tramos_quitados(len(y)))
    assert np.allclose(con_explicativas.em(p), con_explicativas.regresion(p), atol=0.05)


def test_em_admite_que_las_explicativas_tengan_huecos():
    x, y = datos_correlados()
    x = list(x)
    for i in range(0, 400, 7):
        x[i] = None
    p = problema(list(y), explicativas=[x], quitados=tramos_quitados(len(y)))
    completa = con_explicativas.em(p)
    assert not np.isnan(completa).any()


def test_em_imputa_con_la_media_donde_no_hay_ningun_dato():
    x, y = datos_correlados(n=100)
    y = list(y)
    y[50] = None
    x = list(x)
    x[50] = None
    p = problema(y, explicativas=[x])
    assert con_explicativas.em(p)[50] == pytest.approx(np.nanmean(p.y), abs=0.05)


def test_em_con_dos_explicativas_casi_iguales_no_falla():
    x, y = datos_correlados(n=200)
    p = problema(list(y), explicativas=[list(x), list(x + 1e-9)], quitados=[(10, 15)])
    assert not np.isnan(con_explicativas.em(p)).any()


# ---------------------------------------------------------------- serie donante
def test_la_serie_donante_se_copia_en_los_huecos():
    p = problema([1, 2, None, 4], explicativas=[])
    assert con_explicativas.donante(p, {"donante": [9, 9, 3, 9]}).tolist() == [1, 2, 3, 4]


def test_la_serie_donante_se_puede_ajustar_a_la_escala():
    y = np.arange(30, dtype=float)
    donante = list(2 * y + 5)                      # otra escala
    y_con_hueco = list(y)
    y_con_hueco[10] = None
    p = problema(y_con_hueco)
    assert con_explicativas.donante(p, {"donante": donante, "escalar": True})[10] == pytest.approx(10)
    assert con_explicativas.donante(p, {"donante": donante})[10] == pytest.approx(25)  # sin ajustar, copia tal cual


def test_donante_mas_corta_deja_sin_imputar_lo_que_no_alcanza():
    p = problema([1, None, 3, None])
    assert np.isnan(con_explicativas.donante(p, {"donante": [0, 2]})[3])


def test_sin_donante_da_error():
    with pytest.raises(ErrorDeEntrada, match="donante"):
        con_explicativas.donante(problema([1, None, 3]), {})


# ---------------------------------------------------------------- necesitan explicativas
@pytest.mark.parametrize("metodo", [con_explicativas.hot_deck, con_explicativas.regresion, con_explicativas.em])
def test_sin_explicativas_dan_error(metodo):
    with pytest.raises(ErrorDeEntrada, match="explicativa"):
        metodo(problema([1, None, 3, 4]))
