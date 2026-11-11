import numpy as np
import pytest

from senales import ErrorDeEntrada
from senales.imputacion import con_explicativas, imputar
from senales.imputacion.preparar import preparar


def problema(y, explicativas=(), quitados=()):
    return preparar(y, list(quitados), list(explicativas))


# ---------------------------------------------------------------- regresión
def test_la_regresion_recupera_una_relacion_exacta():
    x = np.arange(20, dtype=float)
    y = list(2 + 3 * x)
    y[7] = None
    y[15] = None
    p = problema(y, explicativas=[list(x)])
    assert con_explicativas.regresion(p)[0][[7, 15]] == pytest.approx([2 + 3 * 7, 2 + 3 * 15])


def test_la_regresion_con_dos_explicativas():
    rng = np.random.default_rng(0)
    a, b = rng.normal(size=60), rng.normal(size=60)
    y = list(1 + 2 * a - 3 * b)
    y[10] = None
    p = problema(y, explicativas=[list(a), list(b)])
    assert con_explicativas.regresion(p)[0][10] == pytest.approx(1 + 2 * a[10] - 3 * b[10])


def test_la_regresion_usa_las_explicativas_que_hay_en_cada_punto():
    x = np.arange(20, dtype=float)
    segunda = list(np.sin(x))
    segunda[12] = None                                  # en el punto 12 solo hay la primera
    y = list(5 + 2 * x)
    y[12] = None
    p = problema(y, explicativas=[list(x), segunda])
    assert con_explicativas.regresion(p)[0][12] == pytest.approx(5 + 2 * 12)


def test_la_regresion_no_imputa_con_muy_pocos_datos():
    p = problema([1, None, None, None], explicativas=[[1, 2, 3, 4]])
    assert np.isnan(con_explicativas.regresion(p)[0][1:]).all()


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
    assert np.allclose(con_explicativas.em(p)[0], con_explicativas.regresion(p)[0], atol=0.05)


def test_em_admite_que_las_explicativas_tengan_huecos():
    x, y = datos_correlados()
    x = list(x)
    for i in range(0, 400, 7):
        x[i] = None
    p = problema(list(y), explicativas=[x], quitados=tramos_quitados(len(y)))
    completa = con_explicativas.em(p)[0]
    assert not np.isnan(completa).any()


def test_em_imputa_con_la_media_donde_no_hay_ningun_dato():
    x, y = datos_correlados(n=100)
    y = list(y)
    y[50] = None
    x = list(x)
    x[50] = None
    p = problema(y, explicativas=[x])
    assert con_explicativas.em(p)[0][50] == pytest.approx(np.nanmean(p.y), abs=0.05)


def test_em_con_dos_explicativas_casi_iguales_no_falla():
    x, y = datos_correlados(n=200)
    p = problema(list(y), explicativas=[list(x), list(x + 1e-9)], quitados=[(10, 15)])
    assert not np.isnan(con_explicativas.em(p)[0]).any()


# ---------------------------------------------------------------- necesitan explicativas
@pytest.mark.parametrize("metodo", [con_explicativas.regresion, con_explicativas.em])
def test_sin_explicativas_dan_error(metodo):
    with pytest.raises(ErrorDeEntrada, match="explicativa"):
        metodo(problema([1, None, 3, 4]))
