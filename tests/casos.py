"""Casos de prueba de la API: peticiones a /api/series con distintas configuraciones.

Sirven para el "test de referencia" (test_referencia.py): lo que devuelve la API para cada caso
se guardó una vez en referencia.json, y cualquier cambio en el cálculo que altere un solo número
hace fallar la prueba. Si el cambio es intencionado, se regenera con `python tests/generar_referencia.py`.

Cada caso es (nombre, parámetros). Los parámetros son pares (clave, valor): una clave repetida
es una lista en la URL, como hace la página (estacionalidad_periodo=12&estacionalidad_periodo=30).
"""


def p(**kw):
    """Convierte parámetros con listas en pares clave-valor repetidos."""
    pares = []
    for clave, valor in kw.items():
        for v in (valor if isinstance(valor, (list, tuple)) else [valor]):
            pares.append((clave, v))
    return pares


# Para que las respuestas sean pequeñas, casi todo usa 120 puntos y solo lo que se prueba
BASE = dict(puntos=120, ruido_activo="false", estacionalidad_activa="false", anomalias_activas="false")


def caso(nombre, **kw):
    return nombre, p(**{**BASE, **kw})


CASOS = [
    # ---- por defecto y estructura general ----
    ("por_defecto", p(puntos=120)),
    ("por_defecto_500", []),
    ("todo_apagado", p(puntos=60, tendencia_activa="false", estacionalidad_activa="false", ruido_activo="false", anomalias_activas="false")),
    ("nivel_negativo", p(puntos=80, nivel_base=-50)),
    ("nivel_cero", p(puntos=80, nivel_base=0)),

    # ---- tendencia ----
    *[caso(f"tendencia_{tipo}", tendencia_tipo=tipo, tendencia_valor=0.8) for tipo in ("lineal", "cuadratica", "amortiguada", "logaritmica", "exponencial")],
    caso("tendencia_baja_a_cero", tendencia_valor=-1),
    caso("tendencia_negativa_pasa_a_menos", tendencia_valor=-2),
    caso("tendencia_apagada", tendencia_activa="false"),
    *[caso(f"valor_final_{tipo}", tendencia_tipo=tipo, valor_final=150) for tipo in ("lineal", "cuadratica", "logaritmica")],
    caso("valor_final_menor_que_inicial", valor_final=-20),
    caso("valor_final_con_nivel_cero", nivel_base=0, valor_final=50),

    # ---- estacionalidad ----
    caso("estacionalidad_defecto", estacionalidad_activa="true"),
    caso("estacionalidad_aditiva", estacionalidad_activa="true", estacionalidad_periodo=40, estacionalidad_modo="aditiva", estacionalidad_minimo=-5, estacionalidad_maximo=20),
    caso("estacionalidad_aditiva_ignora_fin", estacionalidad_activa="true", estacionalidad_periodo=40, estacionalidad_modo="aditiva", estacionalidad_minimo=-10, estacionalidad_maximo=10, estacionalidad_minimo_fin=-30, estacionalidad_maximo_fin=30),
    caso("estacionalidad_multiplicativa", estacionalidad_activa="true", estacionalidad_periodo=40, estacionalidad_modo="multiplicativa", estacionalidad_minimo=-10, estacionalidad_maximo=10, estacionalidad_minimo_fin=-30, estacionalidad_maximo_fin=30),
    caso("estacionalidad_multiples", estacionalidad_activa="true", estacionalidad_periodo=[12, 30], estacionalidad_modo=["aditiva", "multiplicativa"], estacionalidad_minimo=[-5, -8], estacionalidad_maximo=[5, 8], estacionalidad_minimo_fin=[-5, -20], estacionalidad_maximo_fin=[5, 20]),
    caso("estacionalidad_con_tendencia", estacionalidad_activa="true", estacionalidad_periodo=25, estacionalidad_modo="multiplicativa", estacionalidad_minimo=-10, estacionalidad_maximo=10, estacionalidad_minimo_fin=-25, estacionalidad_maximo_fin=25, tendencia_valor=1),
    caso("estacionalidad_error_min_mayor", estacionalidad_activa="true", estacionalidad_minimo=30, estacionalidad_maximo=10),
    caso("estacionalidad_error_min_fin_mayor", estacionalidad_activa="true", estacionalidad_modo="multiplicativa", estacionalidad_minimo=-10, estacionalidad_maximo=10, estacionalidad_minimo_fin=50, estacionalidad_maximo_fin=40),
    caso("estacionalidad_error_longitudes", estacionalidad_activa="true", estacionalidad_periodo=[12, 30], estacionalidad_modo="aditiva"),

    # ---- ciclos ----
    caso("ciclo_defecto", ciclo_activo="true"),
    caso("ciclo_sin_variacion", ciclo_activo="true", ciclo_periodo=40, ciclo_var_periodo=0, ciclo_var_amplitud=0, ciclo_minimo=-10, ciclo_maximo=10, ciclo_modo="aditiva"),
    caso("ciclo_con_variacion", ciclo_activo="true", ciclo_periodo=50, ciclo_var_periodo=30, ciclo_var_amplitud=40, ciclo_minimo=-10, ciclo_maximo=10, ciclo_modo="aditiva", ciclo_semilla=7),
    caso("ciclo_otra_semilla", ciclo_activo="true", ciclo_periodo=50, ciclo_var_periodo=30, ciclo_var_amplitud=40, ciclo_minimo=-10, ciclo_maximo=10, ciclo_modo="aditiva", ciclo_semilla=8),
    caso("ciclo_multiplicativo", ciclo_activo="true", ciclo_periodo=40, ciclo_var_periodo=0, ciclo_var_amplitud=0, ciclo_minimo=-10, ciclo_maximo=10, ciclo_minimo_fin=-30, ciclo_maximo_fin=30, ciclo_modo="multiplicativa"),
    caso("ciclos_varios", ciclo_activo="true", ciclo_periodo=[50, 120], ciclo_var_periodo=[30, 20], ciclo_var_amplitud=[40, 25], ciclo_minimo=[-10, -4], ciclo_maximo=[10, 4], ciclo_minimo_fin=[-10, -4], ciclo_maximo_fin=[10, 4], ciclo_modo=["aditiva", "aditiva"], ciclo_semilla=[1, 2]),
    caso("ciclos_sin_semillas", ciclo_activo="true", ciclo_periodo=[50, 120], ciclo_var_periodo=[30, 20], ciclo_var_amplitud=[40, 25], ciclo_minimo=[-10, -4], ciclo_maximo=[10, 4], ciclo_modo=["aditiva", "aditiva"]),
    caso("ciclo_error_longitudes", ciclo_activo="true", ciclo_periodo=[50, 120], ciclo_var_periodo=30),
    caso("ciclo_error_min_mayor", ciclo_activo="true", ciclo_minimo=20, ciclo_maximo=10),

    # ---- ruido ----
    *[dict_caso for dict_caso in (
        (f"ruido_{tipo}", p(puntos=200, estacionalidad_activa="false", anomalias_activas="false", ruido_activo="true", ruido_tipo=tipo, ruido_grado=5, semilla=11))
        for tipo in ("blanco", "heterocedastico", "autocorrelado_positivo", "autocorrelado_negativo", "garch", "colas_pesadas")
    )],
    ("ruido_autocorrelado_phi_alto", p(puntos=200, estacionalidad_activa="false", anomalias_activas="false", ruido_tipo="autocorrelado_positivo", ruido_phi=0.95, semilla=3)),
    ("ruido_autocorrelado_phi_cero", p(puntos=200, estacionalidad_activa="false", anomalias_activas="false", ruido_tipo="autocorrelado_negativo", ruido_phi=0, semilla=3)),
    ("ruido_otra_semilla", p(puntos=200, estacionalidad_activa="false", anomalias_activas="false", ruido_grado=5, semilla=12)),
    ("ruido_grado_cero", p(puntos=100, estacionalidad_activa="false", anomalias_activas="false", ruido_grado=0)),
    ("ruido_con_nivel_negativo", p(puntos=100, estacionalidad_activa="false", anomalias_activas="false", nivel_base=-100, ruido_grado=5)),

    # ---- anomalías ----
    caso("anomalia_puntual", anomalias_activas="true", anomalia="puntual,30,25"),
    caso("anomalia_cambio_nivel", anomalias_activas="true", anomalia="cambio_nivel,40,-20"),
    caso("anomalia_transitorio_defecto", anomalias_activas="true", anomalia="transitorio,50,30"),
    caso("anomalia_transitorio_decaimiento", anomalias_activas="true", anomalia="transitorio,50,30,0.9"),
    caso("anomalias_varias", anomalias_activas="true", anomalia=["cambio_nivel,30,20", "puntual,60,-15", "transitorio,80,25,0.8"]),
    caso("anomalias_aleatorias", anomalias_activas="true", anomalia=["puntual,aleatorio,aleatorio", "cambio_nivel,aleatorio,aleatorio", "transitorio,aleatorio,aleatorio"], semilla_anomalias=5),
    caso("anomalias_aleatorias_otra_semilla", anomalias_activas="true", anomalia=["puntual,aleatorio,aleatorio", "cambio_nivel,aleatorio,aleatorio", "transitorio,aleatorio,aleatorio"], semilla_anomalias=6),
    caso("anomalias_aleatorias_rango", anomalias_activas="true", anomalia=["puntual,aleatorio,aleatorio"] * 3, magnitud_aleatoria_min=50, magnitud_aleatoria_max=60),
    caso("anomalia_fuera_del_eje", anomalias_activas="true", anomalia=["puntual,500,10", "puntual,-5,10"]),
    caso("anomalia_apagada", anomalias_activas="false", anomalia="puntual,30,25"),
    caso("anomalia_error_tipo", anomalias_activas="true", anomalia="rara,30,25"),
    caso("anomalia_error_partes", anomalias_activas="true", anomalia="puntual,30"),
    caso("anomalia_error_numero", anomalias_activas="true", anomalia="puntual,abc,25"),
    caso("anomalia_error_magnitud_texto", anomalias_activas="true", anomalia="puntual,30,xx"),
    caso("anomalia_error_decaimiento_texto", anomalias_activas="true", anomalia="transitorio,30,10,mucho"),
    caso("anomalia_error_decaimiento_rango", anomalias_activas="true", anomalia="transitorio,30,10,1.5"),
    caso("anomalia_error_magnitud_rango", anomalias_activas="true", anomalia="puntual,30,5000"),
    caso("anomalia_error_rango_aleatorio", anomalias_activas="true", anomalia="puntual,aleatorio,aleatorio", magnitud_aleatoria_min=40, magnitud_aleatoria_max=10),

    # ---- datos faltantes ----
    caso("hueco_punto", hueco="30,30"),
    caso("hueco_rango", hueco="40,60"),
    caso("huecos_varios", hueco=["10,10", "30,45", "100,119"]),
    caso("hueco_se_pega_al_borde", hueco=["110,500", "-4,3"]),
    caso("hueco_apagado", huecos_activos="false", hueco="30,40"),
    caso("hueco_con_ruido_y_anomalia", ruido_activo="true", anomalias_activas="true", anomalia="puntual,50,40", hueco="45,55"),
    caso("hueco_error_orden", hueco="60,40"),
    caso("hueco_error_formato", hueco="60"),
    caso("hueco_error_numero", hueco="a,b"),

    # ---- todo junto ----
    ("todo_activo", p(puntos=300, semilla=21, semilla_anomalias=22, tendencia_tipo="amortiguada", tendencia_valor=0.6, estacionalidad_activa="true", estacionalidad_periodo=[24, 60], estacionalidad_modo=["aditiva", "multiplicativa"], estacionalidad_minimo=[-6, -5], estacionalidad_maximo=[6, 5], estacionalidad_minimo_fin=[-6, -12], estacionalidad_maximo_fin=[6, 12], ciclo_activo="true", ciclo_periodo=[100], ciclo_var_periodo=[25], ciclo_var_amplitud=[30], ciclo_minimo=[-8], ciclo_maximo=[8], ciclo_modo=["aditiva"], ciclo_semilla=[9], ruido_activo="true", ruido_tipo="garch", ruido_grado=4, anomalias_activas="true", anomalia=["cambio_nivel,100,15", "transitorio,200,-20,0.85", "puntual,aleatorio,aleatorio"], hueco=["20,25", "150,170"])),
    ("todo_activo_valor_final", p(puntos=200, semilla=5, valor_final=300, estacionalidad_activa="true", estacionalidad_periodo=30, ciclo_activo="true", ruido_tipo="colas_pesadas", anomalia="puntual,aleatorio,aleatorio", hueco="90,110")),

    # ---- límites de la propia petición (FastAPI los rechaza antes de calcular: solo se comprueba el estado) ----
    ("limite_pocos_puntos", p(puntos=5)),
    ("limite_demasiados_puntos", p(puntos=6000)),
    ("limite_nivel_enorme", p(puntos=50, nivel_base=5_000_000)),
    ("limite_phi", p(puntos=50, ruido_phi=0.99)),
    ("limite_tipo_de_tendencia", p(puntos=50, tendencia_tipo="rara")),
    ("limite_periodo_estacional", p(puntos=50, estacionalidad_periodo=1)),
    ("limite_demasiadas_ondas", p(puntos=50, estacionalidad_periodo=[10] * 21)),
    ("limite_demasiados_huecos", p(puntos=50, hueco=["1,2"] * 21)),
]
