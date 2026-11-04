"""La capa web: parámetros, errores y forma de la respuesta."""
from fastapi.testclient import TestClient

from app import app

cliente = TestClient(app)
SIN_RUIDO = dict(puntos=60, ruido_activo="false", estacionalidad_activa="false", anomalias_activas="false")


def pedir(**params):
    return cliente.get("/api/series", params=params)


def test_una_peticion_sin_parametros_funciona():
    r = cliente.get("/api/series")
    assert r.status_code == 200
    cuerpo = r.json()
    assert len(cuerpo["x"]) == 500 and len(cuerpo["y"]) == 500
    assert set(cuerpo) == {"x", "y", "y_completa", "huecos", "n_faltantes", "componentes", "anomalias"}


def test_los_valores_que_faltan_viajan_como_null():
    cuerpo = pedir(**SIN_RUIDO, hueco="5,7").json()
    assert cuerpo["y"][5:8] == [None, None, None] and cuerpo["n_faltantes"] == 3


def test_las_listas_se_envian_repitiendo_el_parametro():
    cuerpo = cliente.get("/api/series", params=[
        ("puntos", 100), ("ruido_activo", "false"), ("anomalias_activas", "false"),
        ("estacionalidad_periodo", 10), ("estacionalidad_periodo", 25),
        ("estacionalidad_modo", "aditiva"), ("estacionalidad_modo", "aditiva"),
        ("estacionalidad_minimo", -5), ("estacionalidad_minimo", -3),
        ("estacionalidad_maximo", 5), ("estacionalidad_maximo", 3),
    ]).json()
    assert max(cuerpo["componentes"]["estacionalidad"]) > 5  # las dos ondas se suman


def test_la_semilla_decide_el_ruido_y_la_de_anomalias_decide_las_anomalias():
    base = dict(puntos=100, estacionalidad_activa="false", anomalia="puntual,aleatorio,aleatorio")
    assert pedir(**base, semilla=1).json() == pedir(**base, semilla=1).json()
    cambia_ruido = pedir(**base, semilla=2).json()
    assert cambia_ruido["componentes"]["ruido"] != pedir(**base, semilla=1).json()["componentes"]["ruido"]
    assert cambia_ruido["anomalias"] == pedir(**base, semilla=1).json()["anomalias"]       # la anomalía no se mueve
    assert pedir(**base, semilla_anomalias=1).json()["anomalias"] != pedir(**base, semilla_anomalias=2).json()["anomalias"]


def test_un_error_de_los_datos_es_un_422_con_el_motivo():
    r = pedir(**SIN_RUIDO, hueco="60,40")
    assert r.status_code == 422 and r.json()["detail"] == "El final del hueco no puede ser anterior al inicio"
    r = pedir(estacionalidad_activa="true", estacionalidad_minimo=30, estacionalidad_maximo=10)
    assert r.status_code == 422 and "mínimo de la estacionalidad" in r.json()["detail"]


def test_los_limites_de_la_peticion_se_rechazan_antes_de_calcular():
    assert pedir(puntos=5).status_code == 422
    assert pedir(puntos=6000).status_code == 422
    assert pedir(tendencia_tipo="rara").status_code == 422
    assert pedir(ruido_phi=0.99).status_code == 422
    assert pedir(estacionalidad_periodo=[10] * 21).status_code == 422


PARAMETROS = {
    "puntos", "semilla", "semilla_anomalias", "nivel_base",
    "tendencia_activa", "tendencia_valor", "tendencia_tipo", "valor_final",
    "estacionalidad_activa", "estacionalidad_periodo", "estacionalidad_modo", "estacionalidad_minimo",
    "estacionalidad_maximo", "estacionalidad_minimo_fin", "estacionalidad_maximo_fin",
    "ciclo_activo", "ciclo_periodo", "ciclo_var_periodo", "ciclo_minimo", "ciclo_maximo", "ciclo_minimo_fin",
    "ciclo_maximo_fin", "ciclo_var_amplitud", "ciclo_modo", "ciclo_semilla",
    "ruido_activo", "ruido_grado", "ruido_tipo", "ruido_phi",
    "anomalias_activas", "anomalia", "magnitud_aleatoria_min", "magnitud_aleatoria_max",
    "huecos_activos", "hueco",
}


def test_la_interfaz_publica_no_ha_cambiado():
    """La página usa exactamente estos 35 parámetros: quitar o renombrar uno la rompería."""
    parametros = {p["name"] for p in cliente.get("/openapi.json").json()["paths"]["/api/series"]["get"]["parameters"]}
    assert parametros == PARAMETROS
