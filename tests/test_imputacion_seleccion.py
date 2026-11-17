"""Sugerir qué explicativas usar en la regresión."""
import numpy as np
import pytest

from senales.errores import ErrorDeEntrada
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
