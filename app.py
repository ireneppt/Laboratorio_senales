"""La API: recibe las peticiones, comprueba los parámetros y llama a `senales`, donde está el cálculo."""
from typing import Annotated, Literal

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field

from senales import Anomalias, Ciclos, ErrorDeEntrada, Estacionalidad, Huecos, Ruido, Tendencia, generar_serie
from senales.componentes import analizar
from senales.imputacion import imputar
from senales.constantes import (
    MAGNITUD_ALEATORIA, MAX_ANOMALIAS, MAX_CICLOS, MAX_ESTACIONALIDADES, MAX_HUECOS, PHI_AUTOCORRELACION,
)

app = FastAPI()


@app.get("/api/series")
def get_series(
    # Serie
    puntos: int = Query(500, ge=10, le=5000),  # número de puntos (eje x)
    # Semillas de lo aleatorio: misma semilla = mismo resultado. Una para el ruido y otra para los
    # valores "aleatorio" de las anomalías, así se puede regenerar una sin tocar la otra.
    semilla: int = Query(42, ge=0, le=1_000_000),
    semilla_anomalias: int = Query(43, ge=0, le=1_000_000),
    nivel_base: float = Query(100, ge=-1_000_000, le=1_000_000),  # valor en el que arranca la serie (puede ser negativo o 0)
    # Tendencia
    tendencia_activa: bool = True,
    tendencia_valor: float = Query(0.5, ge=-100, le=100),  # 0.5 = la serie sube un 50 %; -1 = baja hasta 0; por debajo de -1 la serie pasa a negativa
    tendencia_tipo: Literal["lineal", "cuadratica", "amortiguada", "logaritmica", "exponencial"] = "lineal",
    # Valor en el que acaba la serie (en unidades): la tendencia va del nivel_base a este valor siguiendo
    # el tipo elegido. Si se envía, manda sobre tendencia_activa y tendencia_valor.
    valor_final: float | None = Query(None, ge=-1_000_000, le=1_000_000),
    # Estacionalidad
    estacionalidad_activa: bool = True,
    # Estacionalidad múltiple: una lista de ondas, cada una con su periodo y su modo.
    # Se envían repetidos: ?estacionalidad_periodo=12&estacionalidad_modo=aditiva&estacionalidad_periodo=30&...
    # Si no se envía ninguna, se usa una sola onda de periodo 50 aditiva.
    #   minimo y maximo: valores entre los que oscila la onda.
    #     aditiva: en unidades de la serie (minimo -5 y maximo 20 suma entre -5 y +20)
    #     multiplicativa: minimo y maximo son los del primer punto, y minimo_fin y maximo_fin los del último;
    #     la amplitud de la onda pasa de unos a otros en línea recta (abanico). En aditiva es constante y
    #     minimo_fin y maximo_fin se ignoran. Si no se envían, no hay cambio.
    estacionalidad_periodo: list[Annotated[int, Field(ge=2, le=100)]] | None = Query(None, max_length=MAX_ESTACIONALIDADES),
    estacionalidad_modo: list[Literal["aditiva", "multiplicativa"]] | None = Query(None, max_length=MAX_ESTACIONALIDADES),
    estacionalidad_minimo: list[Annotated[float, Field(ge=-1_000_000, le=1_000_000)]] | None = Query(None, max_length=MAX_ESTACIONALIDADES),
    estacionalidad_maximo: list[Annotated[float, Field(ge=-1_000_000, le=1_000_000)]] | None = Query(None, max_length=MAX_ESTACIONALIDADES),
    estacionalidad_minimo_fin: list[Annotated[float, Field(ge=-1_000_000, le=1_000_000)]] | None = Query(None, max_length=MAX_ESTACIONALIDADES),
    estacionalidad_maximo_fin: list[Annotated[float, Field(ge=-1_000_000, le=1_000_000)]] | None = Query(None, max_length=MAX_ESTACIONALIDADES),
    # Ciclos: como la estacionalidad, pero con duración y altura irregulares. Una lista de ciclos,
    # cada uno con todos sus valores (se envían repetidos y deben ir todas las listas con la misma longitud).
    #   periodo: duración media, en puntos            var_periodo: cuánto varía la duración (%)
    #   minimo y maximo: valores medios entre los que oscila (aditivo: unidades de la serie;
    #                    multiplicativo: la amplitud cambia hasta minimo_fin y maximo_fin)          var_amplitud: cuánto varía la altura (%)
    #   modo: aditivo o multiplicativo
    # Por defecto apagado, para que quien llame a la API sin pedirlo no reciba ciclos.
    ciclo_activo: bool = False,
    ciclo_periodo: list[Annotated[int, Field(ge=10, le=2000)]] | None = Query(None, max_length=MAX_CICLOS),
    ciclo_var_periodo: list[Annotated[float, Field(ge=0, le=80)]] | None = Query(None, max_length=MAX_CICLOS),
    ciclo_minimo: list[Annotated[float, Field(ge=-1_000_000, le=1_000_000)]] | None = Query(None, max_length=MAX_CICLOS),
    ciclo_maximo: list[Annotated[float, Field(ge=-1_000_000, le=1_000_000)]] | None = Query(None, max_length=MAX_CICLOS),
    ciclo_minimo_fin: list[Annotated[float, Field(ge=-1_000_000, le=1_000_000)]] | None = Query(None, max_length=MAX_CICLOS),
    ciclo_maximo_fin: list[Annotated[float, Field(ge=-1_000_000, le=1_000_000)]] | None = Query(None, max_length=MAX_CICLOS),
    ciclo_var_amplitud: list[Annotated[float, Field(ge=0, le=100)]] | None = Query(None, max_length=MAX_CICLOS),
    ciclo_modo: list[Literal["aditiva", "multiplicativa"]] | None = Query(None, max_length=MAX_CICLOS),
    # Semilla de cada ciclo (una por ciclo, en el mismo orden): así se puede repetir o regenerar un ciclo
    # sin tocar los demás. Si no se envían, el ciclo i usa 44 + i.
    ciclo_semilla: list[Annotated[int, Field(ge=0, le=1_000_000)]] | None = Query(None, max_length=MAX_CICLOS),
    # Ruido
    ruido_activo: bool = True,
    ruido_grado: float = Query(3, ge=0, le=100),  # desviación típica, en % del valor de la serie
    ruido_tipo: Literal[
        "blanco", "heterocedastico", "autocorrelado_positivo",
        "autocorrelado_negativo", "garch", "colas_pesadas",
    ] = "blanco",
    # Fuerza de la dependencia con el valor anterior en el ruido autocorrelado (0 = ninguna, 0.95 = muy fuerte).
    # El signo lo da el tipo: positivo = rachas, negativo = zigzag.
    ruido_phi: float = Query(PHI_AUTOCORRELACION, ge=0, le=0.95),
    # Anomalías: una lista, cada una como "tipo,punto,magnitud" (repetido en la URL).
    #   tipo: puntual | cambio_nivel | transitorio
    #   punto: número de punto, o "aleatorio"
    #   magnitud: % del valor de la serie (-1000 a 1000), o "aleatorio"
    #   decaimiento (opcional, solo transitorio): fracción del efecto que se conserva en cada punto (0 a 0.95)
    # Ejemplo: ?anomalia=cambio_nivel,30,20&anomalia=puntual,aleatorio,aleatorio&anomalia=transitorio,50,20,0.9
    anomalias_activas: bool = True,
    anomalia: list[str] | None = Query(None, max_length=MAX_ANOMALIAS),
    # Rango (en %) del que sale la magnitud cuando una anomalía la tiene en "aleatorio"
    magnitud_aleatoria_min: float = Query(MAGNITUD_ALEATORIA[0], ge=0, le=1000),
    magnitud_aleatoria_max: float = Query(MAGNITUD_ALEATORIA[1], ge=0, le=1000),
    # Datos faltantes: una lista, cada uno como "desde,hasta" (repetido en la URL). Los puntos desde..hasta,
    # ambos incluidos, quedan sin dato (null). Un punto suelto es desde == hasta.
    # Ejemplo: ?hueco=30,30&hueco=100,140
    huecos_activos: bool = True,
    hueco: list[str] | None = Query(None, max_length=MAX_HUECOS),
):
    try:
        return generar_serie(
            puntos=puntos,
            nivel_base=nivel_base,
            tendencia=Tendencia(activa=tendencia_activa, valor=tendencia_valor, tipo=tendencia_tipo, valor_final=valor_final),
            estacionalidad=Estacionalidad(
                activa=estacionalidad_activa, periodos=estacionalidad_periodo, modos=estacionalidad_modo,
                minimos=estacionalidad_minimo, maximos=estacionalidad_maximo,
                minimos_fin=estacionalidad_minimo_fin, maximos_fin=estacionalidad_maximo_fin,
            ),
            ciclos=Ciclos(
                activo=ciclo_activo, periodos=ciclo_periodo, var_periodos=ciclo_var_periodo,
                minimos=ciclo_minimo, maximos=ciclo_maximo, minimos_fin=ciclo_minimo_fin, maximos_fin=ciclo_maximo_fin,
                var_amplitudes=ciclo_var_amplitud, modos=ciclo_modo, semillas=ciclo_semilla,
            ),
            ruido=Ruido(activo=ruido_activo, grado=ruido_grado, tipo=ruido_tipo, phi=ruido_phi, semilla=semilla),
            anomalias=Anomalias(
                activas=anomalias_activas, textos=anomalia, magnitud_min=magnitud_aleatoria_min,
                magnitud_max=magnitud_aleatoria_max, semilla=semilla_anomalias,
            ),
            huecos=Huecos(activos=huecos_activos, textos=hueco),
        )
    except ErrorDeEntrada as error:
        raise HTTPException(422, str(error))


class MetodoPedido(BaseModel):
    metodo: str
    parametros: dict = {}  # los propios de cada método (ahora ninguno los usa)


class PeticionImputar(BaseModel):
    y: list[float | None] = Field(min_length=3, max_length=10_000)         # la explicada, con None donde le falta
    quitados: list[tuple[int, int]] = Field(default=[], max_length=1000)  # tramos [desde, hasta] que se le han quitado para probar
    explicativas: list[list[float | None]] = Field(default=[], max_length=20)
    metodos: list[MetodoPedido] = Field(min_length=1, max_length=30)   # holgado: hay más de 10 métodos y vendrán más


class PeticionComponentes(BaseModel):
    y: list[float | None] = Field(min_length=3, max_length=10_000)         # la serie, con None donde le falta
    periodo: int | None = Field(default=None, ge=2, le=5000)              # el del usuario; sin él, se sugiere


@app.post("/api/componentes")
def post_componentes(peticion: PeticionComponentes):
    """Periodo estacional, descomposición (tendencia, estacionalidad y resto), fuerzas, pendiente y anomalías de una serie."""
    try:
        return analizar(peticion.y, peticion.periodo)
    except ErrorDeEntrada as error:
        raise HTTPException(422, str(error))


@app.post("/api/imputar")
def post_imputar(peticion: PeticionImputar):
    """Imputa la explicada con cada método pedido y devuelve lo imputado y sus errores (sobre lo que se quitó)."""
    try:
        return imputar(peticion.y, peticion.quitados, peticion.explicativas, [m.model_dump() for m in peticion.metodos])
    except ErrorDeEntrada as error:
        raise HTTPException(422, str(error))
