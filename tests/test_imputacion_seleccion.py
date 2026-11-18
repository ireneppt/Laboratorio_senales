"""Sugerir qué explicativas usar en la regresión."""
import numpy as np
import pytest

from senales.errores import ErrorDeEntrada
from senales.imputacion import imputar
from senales.imputacion.seleccion import sugerir_explicativas

rng = np.random.default_rng(3)
N = 80
A = rng.normal(size=N)
B = rng.normal(size=N)
RUIDO = rng.normal(size=N)
Y = 3 * A - 2 * B + 0.05 * rng.normal(size=N)


def lista(v):
    return [float(x) for x in v]


def test_elige_las_dos_que_explican_la_serie_y_no_la_de_ruido():
    r = sugerir_explicativas(lista(Y), [], [lista(A), lista(B), lista(RUIDO)])
    assert r["metodo"] == "exhaustivo" and r["mejor"] == [0, 1]
    assert r["candidatos"][0]["rmse"] < 0.2 < r["candidatos"][-1]["rmse"]
    assert r["probados"] == 4                                   # 3 pares + el trío
    assert [c["rmse"] for c in r["candidatos"]] == sorted(c["rmse"] for c in r["candidatos"])


def test_da_siempre_lo_mismo():
    args = (lista(Y), [], [lista(A), lista(B), lista(RUIDO)])
    assert sugerir_explicativas(*args) == sugerir_explicativas(*args)


def test_con_muchas_explicativas_va_paso_a_paso_y_encuentra_las_buenas():
    ruidos = [lista(rng.normal(size=N)) for _ in range(8)]
    r = sugerir_explicativas(lista(Y), [], [lista(A), lista(B)] + ruidos)
    assert r["metodo"] == "paso_a_paso" and set(r["mejor"]) >= {0, 1}
    assert r["probados"] < 2 ** 10


def test_los_tramos_quitados_no_cuentan_como_conocidos():
    r = sugerir_explicativas(lista(Y), [[10, 30]], [lista(A), lista(B)])
    assert r["conocidos"] == N - 21


def test_explicativas_con_huecos_y_cp_y_r2():
    a = lista(A)
    a[5] = None
    r = sugerir_explicativas(lista(Y), [], [a, lista(B), lista(RUIDO)])
    mejor = r["candidatos"][0]
    assert mejor["r2_ajustado"] > 0.99


def test_errores_de_entrada():
    with pytest.raises(ErrorDeEntrada, match="al menos 2"):
        sugerir_explicativas(lista(Y), [], [lista(A)])
    with pytest.raises(ErrorDeEntrada, match="bloques"):
        sugerir_explicativas(lista(Y), [], [lista(A), lista(B)], bloques=1)
    with pytest.raises(ErrorDeEntrada, match="conocidos"):
        sugerir_explicativas(lista(Y[:6]), [], [lista(A[:6]), lista(B[:6])])



def _dos_buenas_y_ruido(n=200, semilla=5):
    rng = np.random.default_rng(semilla)
    a, b = rng.normal(size=n), rng.normal(size=n)
    ruido = rng.normal(size=n)
    y = 5 + 3 * a - 2 * b + 0.5 * rng.normal(size=n)
    return [float(v) for v in y], [float(v) for v in a], [float(v) for v in b], [float(v) for v in ruido]


def test_con_tramos_quitados_se_mide_en_ellos_y_coincide_con_la_tabla_de_resultados():
    y, a, b, ruido = _dos_buenas_y_ruido()
    tramos = [[60, 90], [140, 160]]
    r = sugerir_explicativas(y, tramos, [a, b, ruido])
    assert r["validacion"] == "tramos" and r["quitados"] == 31 + 21
    for c in r["candidatos"]:                                    # cada combinación, con el RMSE y el MAE de la fila «Regresión»
        columnas = [[a, b, ruido][i] for i in c["indices"]]
        fila = imputar(y, [tuple(t) for t in tramos], columnas, [{"metodo": "regresion"}])["resultados"][0]["metricas"]
        assert c["rmse"] == pytest.approx(fila["rmse"], abs=1e-5) and c["mae"] == pytest.approx(fila["mae"], abs=1e-5)
        assert c["validados"] == fila["n"]
    assert set(r["mejor"]) >= {0, 1}                              # con tan pocos puntos de prueba puede colarse la de ruido (error algo optimista)
    pares = [c for c in r["candidatos"] if c["indices"] == [0, 1]]
    assert pares and pares[0]["rmse"] < 1.1 * r["candidatos"][0]["rmse"]


def test_sin_tramos_quitados_se_esconden_bloques():
    y, a, b, ruido = _dos_buenas_y_ruido()
    r = sugerir_explicativas(y, [], [a, b, ruido])
    assert r["validacion"] == "bloques" and r["quitados"] == 0 and r["mejor"] == [0, 1]


def test_con_muy_pocos_puntos_quitados_vuelve_a_los_bloques():
    y, a, b, ruido = _dos_buenas_y_ruido()
    assert sugerir_explicativas(y, [[50, 51]], [a, b, ruido])["validacion"] == "bloques"      # 2 puntos: no basta
    assert sugerir_explicativas(y, [[50, 52]], [a, b, ruido])["validacion"] == "tramos"       # 3 sí


def test_un_tramo_donde_la_explicada_ya_faltaba_no_cuenta_como_prueba():
    y, a, b, ruido = _dos_buenas_y_ruido()
    for i in range(50, 60):
        y[i] = None                                              # no hay valor real que comparar
    r = sugerir_explicativas(y, [[50, 59]], [a, b, ruido])
    assert r["validacion"] == "bloques" and r["quitados"] == 0


def test_el_paso_a_paso_tambien_se_mide_en_los_tramos():
    y, a, b, _ = _dos_buenas_y_ruido()
    rng = np.random.default_rng(9)
    ruidos = [[float(v) for v in rng.normal(size=len(y))] for _ in range(8)]
    r = sugerir_explicativas(y, [[60, 90], [140, 160]], [a, b] + ruidos)
    assert r["metodo"] == "paso_a_paso" and r["validacion"] == "tramos" and set(r["mejor"]) >= {0, 1}
