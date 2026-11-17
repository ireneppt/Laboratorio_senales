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


# ---------------------------------------------------------------- regresión estocástica
def _con_ruido(n=200, hueco=(80, 119), semilla=0, sd=2.0):
    rng = np.random.default_rng(semilla)
    a, b = rng.normal(size=n), rng.normal(size=n)
    y = 5 + 3 * a - 2 * b + sd * rng.normal(size=n)
    return y, a, b, [hueco]


def test_la_estocastica_con_la_misma_semilla_da_lo_mismo_y_con_otra_no():
    y, a, b, quitados = _con_ruido()
    p = problema(list(y), [list(a), list(b)], quitados)
    uno = con_explicativas.regresion_estocastica(p, {"semilla": 7})[0]
    otra_vez = con_explicativas.regresion_estocastica(p, {"semilla": 7})[0]
    distinta = con_explicativas.regresion_estocastica(p, {"semilla": 8})[0]
    assert np.array_equal(uno, otra_vez) and not np.allclose(uno, distinta)


def test_la_estocastica_es_la_prediccion_de_la_recta_mas_un_ruido_de_la_varianza_de_los_residuos():
    y, a, b, quitados = _con_ruido(sd=2.0)
    p = problema(list(y), [list(a), list(b)], quitados)
    media = con_explicativas.regresion(p)[0]
    huecos = p.objetivo
    ruidos = np.array([con_explicativas.regresion_estocastica(p, {"semilla": s})[0][huecos] - media[huecos] for s in range(300)])
    assert abs(ruidos.mean()) < 0.05                             # sin sesgo: las extracciones se reparten alrededor de la recta
    # σ̂ de los residuos de la recta con los datos conocidos (3 parámetros)
    A = np.column_stack([np.ones((~huecos).sum()), a[~huecos], b[~huecos]])
    r = y[~huecos] - A @ np.linalg.lstsq(A, y[~huecos], rcond=None)[0]
    sigma = np.sqrt(r @ r / (len(r) - 3))
    assert ruidos.std() == pytest.approx(sigma, rel=0.05)
    assert ruidos[0].std() > 0 and np.std(ruidos[0]) == pytest.approx(sigma, rel=0.3)   # y cada punto es independiente


def test_con_una_relacion_exacta_la_estocastica_es_la_regresion():
    x = np.arange(30, dtype=float)
    y = list(1 + 2 * x)
    y[10] = None
    p = problema(y, [list(x)])
    assert con_explicativas.regresion_estocastica(p)[0][10] == pytest.approx(con_explicativas.regresion(p)[0][10], abs=1e-6)


def test_la_estocastica_conserva_la_varianza_y_la_regresion_la_aplana():
    y, a, b, quitados = _con_ruido(n=400, hueco=(100, 299), sd=3.0)
    r = imputar(list(y), quitados, [list(a), list(b)], [{"metodo": "regresion"}, {"metodo": "regresion_estocastica", "parametros": {"semilla": 3}}])
    por = {f["metodo"]: f["metricas"] for f in r["resultados"]}
    assert por["regresion_estocastica"]["razon_var"] > por["regresion"]["razon_var"] + 0.1
    assert por["regresion_estocastica"]["rmse"] > por["regresion"]["rmse"]              # suma ruido: falla más al acertar el valor
    assert por["regresion_estocastica"]["rmse"] == pytest.approx(np.sqrt(2) * por["regresion"]["rmse"], rel=0.2)


def test_la_estocastica_no_da_intervalo():
    y, a, b, quitados = _con_ruido()
    r = imputar(list(y), quitados, [list(a), list(b)], [{"metodo": "regresion_estocastica"}])["resultados"][0]
    assert r["error"] is None and r["intervalo"] is None and r["metricas"]["cobertura"] is None


def test_la_estocastica_usa_el_modelo_con_las_explicativas_que_hay_en_cada_punto():
    y, a, b, _ = _con_ruido(n=100)
    y = [float(v) for v in y]
    y[10] = None
    y[11] = None
    a = [float(v) for v in a]
    b = [float(v) for v in b]
    b[11] = None                                                    # en el punto 11 solo hay la primera explicativa
    p = problema(y, [a, b])
    completa = con_explicativas.regresion_estocastica(p)[0]
    assert np.isfinite(completa[[10, 11]]).all()
    a[11] = None                                                    # y en el 12... sin ninguna: se queda sin imputar
    y[12] = None
    b[12] = None
    a[12] = None
    assert np.isnan(con_explicativas.regresion_estocastica(problema(y, [a, b]))[0][12])


def test_errores_de_la_estocastica():
    with pytest.raises(ErrorDeEntrada, match="explicativa"):
        con_explicativas.regresion_estocastica(problema([1, None, 3, 4]))
    y, a, b, quitados = _con_ruido(n=50, hueco=(10, 20))
    p = problema(list(y), [list(a)], quitados)
    for semilla in (-1, 1.5, True, 2_000_000):
        with pytest.raises(ErrorDeEntrada, match="semilla"):
            con_explicativas.regresion_estocastica(p, {"semilla": semilla})
