"""La ruta POST /api/imputar."""
from fastapi.testclient import TestClient

from app import app

cliente = TestClient(app)
Y = [10 + i * 0.5 for i in range(40)]


def pedir(**cuerpo):
    return cliente.post("/api/imputar", json={"y": Y, "quitados": [[10, 14]], "metodos": [{"metodo": "interpolacion"}], **cuerpo})


def test_imputar_devuelve_lo_imputado_y_sus_errores():
    r = pedir(metodos=[{"metodo": "interpolacion"}, {"metodo": "media"}])
    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo["n"] == 40 and cuerpo["a_imputar"] == 5 and cuerpo["quitados"] == 5 and cuerpo["referencia"] == "interpolacion"
    interpolacion, media = cuerpo["resultados"]
    assert interpolacion["imputado"][10:15] == [15.0, 15.5, 16.0, 16.5, 17.0]     # una serie recta se recupera exacta
    assert interpolacion["metricas"]["rmse"] == 0 and media["metricas"]["rmse"] > 0
    assert media["por_tramo"][0]["desde"] == 10 and media["por_tramo"][0]["hasta"] == 14


def test_con_explicativas_y_parametros():
    x = [2 * v for v in Y]
    r = pedir(explicativas=[x], metodos=[{"metodo": "regresion"}, {"metodo": "em", "parametros": {"no_se_usa": 1}}])
    assert r.status_code == 200
    por = {f["metodo"]: f for f in r.json()["resultados"]}
    assert por["regresion"]["metricas"]["rmse"] < 1e-3          # relación exacta
    assert por["em"]["error"] is None


def test_los_huecos_viajan_como_null():
    r = cliente.post("/api/imputar", json={"y": [1, 2, None, 4, 5], "metodos": [{"metodo": "interpolacion"}]})
    assert r.status_code == 200 and r.json()["resultados"][0]["imputado"][2] == 3.0


def test_un_metodo_que_no_puede_se_marca_con_su_error_sin_romper_la_peticion():
    r = pedir(metodos=[{"metodo": "em"}, {"metodo": "media"}])
    assert r.status_code == 200
    assert "explicativa" in r.json()["resultados"][0]["error"] and r.json()["resultados"][1]["error"] is None


def test_los_errores_de_la_peticion_son_422():
    assert pedir(metodos=[{"metodo": "magia"}]).status_code == 422
    assert pedir(metodos=[]).status_code == 422
    assert pedir(y=[1, 2]).status_code == 422
    assert pedir(y=[None, None, None, None]).json()["resultados"][0]["error"] is not None   # sin datos conocidos: error del método
    assert pedir(explicativas=[[1]] * 21).status_code == 422
    assert cliente.post("/api/imputar", json={"y": Y}).status_code == 422


def test_la_misma_peticion_da_siempre_lo_mismo():
    assert pedir(metodos=[{"metodo": "em"}], explicativas=[Y]).json() == pedir(metodos=[{"metodo": "em"}], explicativas=[Y]).json()


def test_la_k_de_la_media_movil_viaja_en_los_parametros():
    y = [1, 2, None, 4, 8]
    r = cliente.post("/api/imputar", json={"y": y, "metodos": [{"metodo": "media_movil", "parametros": {"k": 1}}, {"metodo": "media_movil", "parametros": {"k": 2}}]})
    assert [f["imputado"][2] for f in r.json()["resultados"]] == [3, 3.75]
