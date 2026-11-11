import numpy as np
import pytest

from senales import ErrorDeEntrada
from senales.imputacion import METODOS, imputar
from senales.imputacion import metricas
from senales.imputacion.preparar import preparar

REAL = np.array([10.0, 12.0, 14.0])
IMPUTADO = np.array([11.0, 12.0, 17.0])      # errores +1, 0 y +3


def test_mae_y_rmse_del_ejemplo():
    assert metricas.mae(REAL, IMPUTADO) == pytest.approx(4 / 3)
    assert metricas.rmse(REAL, IMPUTADO) == pytest.approx(np.sqrt(10 / 3))


def test_r2_frente_al_real_se_compara_con_la_media_de_lo_conocido():
    conocidos = np.array([12.0, 12.0])                       # media 12: imputar siempre 12 daría error 4+0+4
    assert metricas.r2_frente_al_real(REAL, IMPUTADO, conocidos) == pytest.approx(1 - 10 / 8)
    otros_conocidos = np.array([10.0, 10.0])                  # media 10, distinta de la de lo quitado (12): 0 + 4 + 16 = 20
    assert metricas.r2_frente_al_real(REAL, IMPUTADO, otros_conocidos) == pytest.approx(1 - 10 / 20)
    assert metricas.r2_frente_al_real(REAL, REAL, conocidos) == pytest.approx(1)       # perfecto
    assert metricas.r2_frente_al_real(REAL, np.full(3, 12.0), conocidos) == pytest.approx(0)  # igual que la media
    assert metricas.r2_frente_al_real(REAL, REAL, np.array([5.0, 5.0])) is not None
    assert metricas.r2_frente_al_real(np.array([5.0, 5.0]), IMPUTADO[:2], np.array([5.0, 5.0])) is None  # lo conocido no varía


def test_mejora_sobre_la_referencia():
    assert metricas.mejora_sobre_referencia(1.0, 2.0) == pytest.approx(0.5)     # la mitad de error
    assert metricas.mejora_sobre_referencia(3.0, 2.0) == pytest.approx(-0.5)    # peor que la referencia
    assert metricas.mejora_sobre_referencia(1.0, 0.0) is None


def prueba():
    """Serie lineal 0..19 con dos tramos quitados: [5, 6] y [12, 14]."""
    return preparar(list(range(20)), [(5, 6), (12, 14)], [])


def test_evaluar_mide_global_y_por_tramo():
    p = prueba()
    completa = p.y.copy()
    completa[[5, 6, 12, 13, 14]] = [5 + 1, 6 + 1, 12 + 2, 13 + 2, 14 + 2]            # errores 1, 1, 2, 2, 2
    referencia = np.where(p.objetivo, p.verdad + 4, p.y)                              # la referencia se equivoca siempre en 4
    resultado, por_tramo = metricas.evaluar(p, completa, referencia)
    assert resultado["n"] == 5
    assert resultado["mae"] == pytest.approx(8 / 5)
    assert resultado["rmse"] == pytest.approx(np.sqrt(14 / 5))
    assert resultado["mejora"] == pytest.approx(1 - np.sqrt(14 / 5) / 4)
    assert [(t["desde"], t["hasta"], t["n"]) for t in por_tramo] == [(5, 6, 2), (12, 14, 3)]
    assert por_tramo[0]["mae"] == pytest.approx(1) and por_tramo[1]["mae"] == pytest.approx(2)


def test_lo_que_el_metodo_no_imputa_no_se_mide():
    p = prueba()
    completa = p.y.copy()
    completa[[5, 6]] = [5, 6]                      # solo el primer tramo
    resultado, por_tramo = metricas.evaluar(p, completa, np.where(p.objetivo, 0.0, p.y))
    assert resultado["n"] == 2 and por_tramo[1]["n"] == 0 and por_tramo[1]["mae"] is None


def test_lo_que_ya_faltaba_se_imputa_pero_no_se_mide():
    p = preparar([1, 2, None, 4, 5, 6], [(4, 4)], [])
    resultado = imputar([1, 2, None, 4, 5, 6], [(4, 4)], [], [{"metodo": "interpolacion"}])
    assert resultado["a_imputar"] == 2 and resultado["quitados"] == 1       # dos huecos que imputar, un valor real con el que medir
    assert resultado["resultados"][0]["metricas"]["n"] == 1


# ---------------------------------------------------------------- imputar (varios métodos a la vez)
def serie_con_tramos():
    x = np.arange(60, dtype=float)
    return list(10 + 0.5 * x + np.sin(x / 3)), [(10, 14), (30, 33), (45, 52)]


def test_se_comparan_varios_metodos_sobre_los_mismos_huecos():
    y, quitados = serie_con_tramos()
    r = imputar(y, quitados, [], [{"metodo": m} for m in ("media", "mediana", "ultimo_valor", "interpolacion")])
    assert [f["metodo"] for f in r["resultados"]] == ["media", "mediana", "ultimo_valor", "interpolacion"]
    por = {f["metodo"]: f for f in r["resultados"]}
    assert all(f["error"] is None and f["sin_imputar"] == 0 and len(f["imputado"]) == 60 for f in r["resultados"])
    assert por["interpolacion"]["metricas"]["rmse"] < por["media"]["metricas"]["rmse"]    # en una serie con tendencia
    assert por["interpolacion"]["metricas"]["mejora"] == pytest.approx(0)                    # frente a sí misma
    assert por["media"]["metricas"]["mejora"] < 0                                            # la media es peor que la interpolación
    assert por["interpolacion"]["metricas"]["r2"] > 0.9


def test_lo_conocido_no_se_toca():
    y, quitados = serie_con_tramos()
    imputado = imputar(y, quitados, [], [{"metodo": "media"}])["resultados"][0]["imputado"]
    quitado = {i for a, b in quitados for i in range(a, b + 1)}
    assert all(imputado[i] == pytest.approx(y[i], abs=1e-3) for i in range(60) if i not in quitado)


def test_un_metodo_sin_lo_que_necesita_devuelve_su_error_y_los_demas_siguen():
    y, quitados = serie_con_tramos()
    r = imputar(y, quitados, [], [{"metodo": "regresion"}, {"metodo": "media"}])
    assert "explicativa" in r["resultados"][0]["error"] and "imputado" not in r["resultados"][0]
    assert r["resultados"][1]["error"] is None


def test_un_metodo_desconocido_da_error():
    with pytest.raises(ErrorDeEntrada, match="desconocido"):
        imputar([1, 2, 3], [], [], [{"metodo": "magia"}])


def test_cada_metodo_tiene_nombre_grupo_y_funcion():
    assert set(METODOS) == {"hot_deck", "donante", "media", "mediana", "regresion", "em", "ultimo_valor", "interpolacion"}
    assert {grupo for _, grupo, _, _ in METODOS.values()} == {"implicito", "explicito", "referencia"}


def test_sin_valor_real_no_hay_metricas():
    r = imputar([1, 2, None, 4, 5], [], [], [{"metodo": "interpolacion"}])["resultados"][0]
    assert r["metricas"]["n"] == 0 and r["metricas"]["mae"] is None and r["imputado"][2] == 3


def test_rmse_estandarizado_divide_entre_la_desviacion_de_lo_conocido():
    conocidos = np.array([10.0, 14.0])                    # desviación típica 2
    assert metricas.rmse_estandarizado(3.0, conocidos) == pytest.approx(1.5)
    assert metricas.rmse_estandarizado(0.0, conocidos) == 0
    assert metricas.rmse_estandarizado(3.0, np.array([5.0, 5.0])) is None     # lo conocido no varía
    # no depende de las unidades: con todo multiplicado por 10, sale lo mismo
    assert metricas.rmse_estandarizado(30.0, conocidos * 10) == pytest.approx(1.5)
