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


def test_ultimo_valor_al_principio_no_imputa():
    completa = simples.ultimo_valor(problema([None, None, 3, None]))
    assert np.isnan(completa[:2]).all() and completa[2:].tolist() == [3, 3]


def test_media_y_mediana_de_lo_conocido():
    p = problema([1, 2, None, None, 5, 9])
    assert simples.media(p).tolist() == [1, 2, 4.25, 4.25, 5, 9]
    assert simples.mediana(p).tolist() == [1, 2, 3.5, 3.5, 5, 9]


def test_lo_quitado_no_cuenta_para_la_media():
    p = problema([1, 2, 3, 4, 5, 100], quitados=[(5, 5)])   # el 100 se ha quitado: no entra en la media
    assert simples.media(p)[5] == pytest.approx(3)


@pytest.mark.parametrize("metodo", [simples.media, simples.mediana, simples.ultimo_valor, simples.siguiente_valor, simples.media_movil, simples.media_movil_anteriores, simples.interpolacion, simples.polinomica])
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


# ---------------------------------------------------------------- siguiente valor, media móvil y polinómica
def test_siguiente_valor_repite_el_posterior_y_al_final_no_imputa():
    completa = simples.siguiente_valor(problema([1, None, None, 4, None, None]))
    assert completa[:4].tolist() == [1, 4, 4, 4] and np.isnan(completa[4:]).all()     # al final no hay ninguno después
    assert simples.siguiente_valor(problema([None, 2, 3])).tolist() == [2, 2, 3]


def test_media_movil_usa_k_datos_conocidos_a_cada_lado():
    p = problema([1, 2, None, 4, 8])
    assert simples.media_movil(p, {"k": 1})[2] == pytest.approx(3)             # (2 + 4) / 2
    assert simples.media_movil(p, {"k": 2})[2] == pytest.approx(3.75)          # (1 + 2 + 4 + 8) / 4
    assert simples.media_movil(p, {"k": 50})[2] == pytest.approx(3.75)         # no hay más: usa los que hay
    assert simples.media_movil(problema([None, 2, 4, 6]), {"k": 2})[0] == pytest.approx(3)   # al principio, solo los de después


def test_media_movil_salta_los_huecos_hasta_encontrar_k_datos():
    p = problema([10, 20, None, None, None, 40, 50])
    completa = simples.media_movil(p, {"k": 1})
    assert completa[2:5].tolist() == [30, 30, 30]                              # dentro del hueco: el 20 y el 40


def test_media_movil_con_k_mal_da_error():
    for k in (0, -1, "3", 2.5, True):
        with pytest.raises(ErrorDeEntrada, match="k"):
            simples.media_movil(problema([1, None, 3]), {"k": k})


def test_media_movil_sin_k_usa_3():
    p = problema([1, 2, 3, None, 5, 6, 7])
    assert simples.media_movil(p)[3] == pytest.approx(4)


def test_polinomica_es_la_spline_natural():
    # con (0, 0), (2, 1) y (4, 0) la spline natural vale 0,6875 en x = 1 y en x = 3
    completa = simples.polinomica(problema([0, None, 1, None, 0]))
    assert completa[1] == pytest.approx(0.6875) and completa[3] == pytest.approx(0.6875)


def test_polinomica_pasa_por_los_datos_y_con_una_recta_da_la_recta():
    y = [2 + 3 * i for i in range(12)]
    con_huecos = [None if i in (3, 4, 8) else v for i, v in enumerate(y)]
    completa = simples.polinomica(problema(con_huecos))
    assert completa == pytest.approx(y)


def test_polinomica_sigue_mejor_una_curva_que_la_lineal():
    y = [float(np.sin(i / 4)) for i in range(60)]
    p = problema(y, quitados=[(20, 27)])
    error = lambda completa: np.abs(completa[20:28] - np.array(y[20:28])).max()
    assert error(simples.polinomica(p)) < error(simples.interpolacion(p)) / 3


def test_polinomica_en_los_extremos_y_con_pocos_datos_es_como_la_lineal():
    p = problema([None, 1, None, 3, 2, None])
    assert simples.polinomica(p)[[0, 5]].tolist() == [1, 2]
    assert simples.polinomica(problema([1, None, 3])).tolist() == [1, 2, 3]


def test_media_movil_solo_anteriores_usa_los_ultimos_k_conocidos():
    p = problema([1, 2, None, 4, 8, None])
    completa = simples.media_movil_anteriores(p, {"k": 2})
    assert completa[2] == pytest.approx(1.5)                                  # (1 + 2) / 2: lo de después no cuenta
    assert completa[5] == pytest.approx(6)                                    # (4 + 8) / 2
    assert simples.media_movil_anteriores(p, {"k": 1})[2] == pytest.approx(2)


def test_media_movil_solo_anteriores_en_un_hueco_repite_la_media_de_antes_y_al_principio_no_imputa():
    completa = simples.media_movil_anteriores(problema([None, 10, 20, None, None, 40]), {"k": 2})
    assert np.isnan(completa[0])                                              # al principio no hay nada antes
    assert completa[3:5].tolist() == [15, 15]


# ---------------------------------------------------------------- medias móviles ponderadas
def test_media_movil_ponderada_pesa_1_entre_la_distancia():
    p = problema([10, None, None, 40])
    # punto 1: el 10 está a 1 (peso 1) y el 40 a 2 (peso 1/2) -> (10 + 20) / 1,5 = 20
    completa = simples.media_movil_ponderada(p, {"k": 1})
    assert completa[1] == pytest.approx(20) and completa[2] == pytest.approx(30)
    assert simples.media_movil(p, {"k": 1})[1] == pytest.approx(25)          # la simple no pondera


def test_media_movil_ponderada_solo_anteriores():
    p = problema([2, 4, None, 8])
    # punto 2: el 4 está a 1 (peso 1) y el 2 a 2 (peso 1/2) -> (4 + 1) / 1,5
    assert simples.media_movil_ponderada_anteriores(p, {"k": 2})[2] == pytest.approx(5 / 1.5)
    assert np.isnan(simples.media_movil_ponderada_anteriores(problema([None, 1, 2]), {"k": 2})[0])


# ---------------------------------------------------------------- media estacional
def test_media_estacional_sin_tendencia_media_del_mismo_momento_del_ciclo():
    y = [1, 5, 9, 2, 6, 10, None, 7, 11]                  # periodo 3: momentos 0 -> 1, 2, ?
    completa = simples.media_estacional(problema(y), {"periodo": 3, "quitar_tendencia": False})
    assert completa[6] == pytest.approx(1.5)


def test_media_estacional_quitando_la_tendencia_recupera_tendencia_mas_ciclo():
    puntos = np.arange(48)
    real = 0.5 * puntos + np.tile([3.0, -1.0, 0.0, -2.0], 12)  # recta + ciclo de periodo 4 (de media 0)
    p = problema(list(real), quitados=[(40, 43)])           # cerca del final: casi todos los ciclos conocidos van antes
    con = simples.media_estacional(p, {"periodo": 4})
    sin = simples.media_estacional(p, {"periodo": 4, "quitar_tendencia": False})
    assert np.abs(con[40:44] - real[40:44]).max() < 0.2
    assert np.abs(sin[40:44] - real[40:44]).max() > 5               # sin quitar la tendencia se queda por debajo


def test_media_estacional_necesita_un_periodo_valido():
    for parametros in ({}, {"periodo": 1}, {"periodo": 3.5}, {"periodo": "4"}, {"periodo": 100}):
        with pytest.raises(ErrorDeEntrada, match="periodo"):
            simples.media_estacional(problema([1, None, 3, 4, 5, 6]), parametros)


def test_media_estacional_sin_datos_en_ese_momento_del_ciclo_no_imputa():
    completa = simples.media_estacional(problema([1, None, 3, 4, None, 6]), {"periodo": 3, "quitar_tendencia": False})
    assert np.isnan(completa[1]) and np.isnan(completa[4])       # el momento 1 del ciclo no tiene ningún dato


# ---------------------------------------------------------------- polinómica local
def test_polinomica_local_de_grado_1_es_la_lineal():
    p = problema([0, None, 4, None, None, 10, 3])
    assert simples.polinomica_local(p, {"grado": 1}).tolist() == pytest.approx(simples.interpolacion(p).tolist())


def test_polinomica_local_de_grado_2_recupera_una_parabola():
    y = [float((i - 5) ** 2) for i in range(12)]
    con_huecos = [None if i in (4, 5, 6) else v for i, v in enumerate(y)]
    assert simples.polinomica_local(problema(con_huecos), {"grado": 2})[4:7].tolist() == pytest.approx([1, 0, 1])


def test_polinomica_local_usa_al_menos_un_dato_a_cada_lado():
    # el punto 1 tiene a la izquierda solo el 0; con grado 2 usa el 0 y los dos más cercanos de la derecha
    p = problema([0, None, 4, 9, 16, 25])                 # y = x², exacta con grado 2
    assert simples.polinomica_local(p, {"grado": 2})[1] == pytest.approx(1)


def test_polinomica_local_grado_mal_da_error_y_por_defecto_es_2():
    for grado in (0, 6, 2.0, True):
        with pytest.raises(ErrorDeEntrada, match="grado"):
            simples.polinomica_local(problema([1, None, 3, 4]), {"grado": grado})
    y = [float(i * i) for i in range(8)]
    assert simples.polinomica_local(problema([None if i == 3 else v for i, v in enumerate(y)]))[3] == pytest.approx(9)


def test_polinomica_local_en_los_extremos_y_con_pocos_datos():
    assert simples.polinomica_local(problema([None, 1, None, 3, None]), {"grado": 4}).tolist() == [1, 1, 2, 3, 3]
