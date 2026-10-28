from typing import Annotated, Literal

import numpy as np
from fastapi import FastAPI, HTTPException, Query
from pydantic import Field

app = FastAPI()

# Valores limite 
AMPLITUD_ESTACIONAL = 10  # amplitud por defecto de una onda estacional, en %
MAX_ESTACIONALIDADES = 20  # tope de ondas estacionales por petición
MAX_ANOMALIAS = 20  # tope de anomalías por petición
MAX_CICLOS = 20  # tope de ciclos por petición
DECAIMIENTO_TRANSITORIO = 0.7  # por defecto, el transitorio pierde un 30 % de su efecto en cada punto
MAGNITUD_ALEATORIA = (10, 30)  # por defecto, una anomalía aleatoria mide entre 10 y 30 % (con signo al azar)
PHI_AUTOCORRELACION = 0.8  # por defecto, fuerza de la dependencia del ruido autocorrelado
TIPOS_ANOMALIA = ("puntual", "cambio_nivel", "transitorio")


def ruido_lento(rng, n, escala):
    """Serie aleatoria que cambia despacio, de media 0 y desviación 1.
    Es ruido normal suavizado con una campana: cuanto mayor la escala (en puntos), más tarda
    en cambiar. Se usa para que la duración y la altura de un ciclo varíen de forma gradual.
    """
    mitad = int(3 * escala) + 1
    campana = np.exp(-0.5 * (np.arange(-mitad, mitad + 1) / escala) ** 2)
    campana = campana / np.sqrt(np.sum(campana ** 2))  # así el resultado mantiene desviación 1
    azar = rng.normal(size=n + 2 * mitad)               # de más en los bordes, que luego se recortan
    return np.convolve(azar, campana, mode="valid")


@app.get("/api/series")
def get_series(
    # Serie
    puntos: int = Query(500, ge=10, le=5000),  # número de puntos (eje x)
    # Semillas de lo aleatorio: misma semilla = mismo resultado. Una para el ruido y otra para los
    # valores "aleatorio" de las anomalías, así se puede regenerar una sin tocar la otra.
    semilla: int = Query(42, ge=0, le=1_000_000),
    semilla_anomalias: int = Query(43, ge=0, le=1_000_000),
    nivel_base: float = Query(100, ge=1, le=1_000_000),  # valor en el que arranca la serie
    # Tendencia
    tendencia_activa: bool = True,
    tendencia_valor: float = Query(0.5, ge=-100, le=100),  # 0.5 = la serie sube un 50 %; -1 = baja hasta 0; por debajo de -1 la serie pasa a negativa
    tendencia_tipo: Literal["lineal", "cuadratica", "amortiguada", "logaritmica", "exponencial"] = "lineal",
    # Estacionalidad
    estacionalidad_activa: bool = True,
    # Estacionalidad múltiple: una lista de ondas, cada una con su periodo y su modo.
    # Se envían repetidos: ?estacionalidad_periodo=12&estacionalidad_modo=aditiva&estacionalidad_periodo=30&...
    # Si no se envía ninguna, se usa una sola onda de periodo 50 aditiva.
    #   amplitud: altura de la onda en % (aditiva: % del nivel base; multiplicativa: % del valor de la serie)
    estacionalidad_periodo: list[Annotated[int, Field(ge=2, le=100)]] | None = Query(None, max_length=MAX_ESTACIONALIDADES),
    estacionalidad_modo: list[Literal["aditiva", "multiplicativa"]] | None = Query(None, max_length=MAX_ESTACIONALIDADES),
    estacionalidad_amplitud: list[Annotated[float, Field(ge=0, le=100)]] | None = Query(None, max_length=MAX_ESTACIONALIDADES),
    # Ciclos: como la estacionalidad, pero con duración y altura irregulares. Una lista de ciclos,
    # cada uno con sus seis valores (se envían repetidos y deben ir todas las listas con la misma longitud).
    #   periodo: duración media, en puntos            var_periodo: cuánto varía la duración (%)
    #   amplitud: altura media (% del valor)          var_amplitud: cuánto varía la altura (%)
    #   fase: dónde empieza (% del ciclo)             modo: aditivo o multiplicativo
    # Por defecto apagado, para que quien llame a la API sin pedirlo no reciba ciclos.
    ciclo_activo: bool = False,
    ciclo_periodo: list[Annotated[int, Field(ge=10, le=2000)]] | None = Query(None, max_length=MAX_CICLOS),
    ciclo_var_periodo: list[Annotated[float, Field(ge=0, le=80)]] | None = Query(None, max_length=MAX_CICLOS),
    ciclo_amplitud: list[Annotated[float, Field(ge=0, le=100)]] | None = Query(None, max_length=MAX_CICLOS),
    ciclo_var_amplitud: list[Annotated[float, Field(ge=0, le=100)]] | None = Query(None, max_length=MAX_CICLOS),
    ciclo_fase: list[Annotated[float, Field(ge=0, le=100)]] | None = Query(None, max_length=MAX_CICLOS),
    ciclo_modo: list[Literal["aditiva", "multiplicativa"]] | None = Query(None, max_length=MAX_CICLOS),
    semilla_ciclo: int = Query(44, ge=0, le=1_000_000),
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
):
    t = np.arange(puntos)      # 0, 1, 2, ... puntos-1
    u = t / (puntos - 1)       # lo mismo pero de 0 a 1

    # ---------- 1. TENDENCIA ----------
    # "forma" va de 0 a 1 según el tipo. Así todas las tendencias terminan
    # en el mismo punto y solo cambia cómo se curva el camino.
    if tendencia_tipo == "lineal":
        forma = u
    elif tendencia_tipo == "cuadratica":
        forma = u ** 2
    elif tendencia_tipo == "amortiguada":
        forma = (1 - np.exp(-4 * u)) / (1 - np.exp(-4))
    elif tendencia_tipo == "logaritmica":
        forma = np.log(1 + 9 * u) / np.log(10)
    elif tendencia_tipo == "exponencial":
        forma = (np.exp(3 * u) - 1) / (np.exp(3) - 1)

    if tendencia_activa:
        nivel = nivel_base * (1 + tendencia_valor * forma)
    else:
        nivel = np.full(puntos, nivel_base)  # sin tendencia: línea plana en el nivel base

    # ---------- 2. ESTACIONALIDAD ----------
    if estacionalidad_activa:
        periodos = estacionalidad_periodo or [50]
        modos = estacionalidad_modo or ["aditiva"]
        amplitudes = estacionalidad_amplitud or [AMPLITUD_ESTACIONAL] * len(periodos)
        if not len(periodos) == len(modos) == len(amplitudes):
            raise HTTPException(422, "Cada estacionalidad necesita un periodo, un modo y una amplitud")

        suma_aditivas = np.zeros(puntos)         # ondas que se SUMAN al nivel
        suma_multiplicativas = np.zeros(puntos)  # ondas que MULTIPLICAN el nivel
        for periodo, modo, amplitud in zip(periodos, modos, amplitudes):
            # cada onda oscila entre -amplitud y +amplitud (en fracción: 10 % = 0.10)
            onda = amplitud / 100 * np.sin(2 * np.pi * t / periodo)
            if modo == "aditiva":
                suma_aditivas = suma_aditivas + onda
            elif modo == "multiplicativa":
                suma_multiplicativas = suma_multiplicativas + onda

        # aditivas: oscilan en puntos fijos (±10 con nivel base 100 y amplitud 10 %)
        # multiplicativas: oscilan un % del nivel (más amplias si la serie sube)
        serie = nivel * (1 + suma_multiplicativas) + nivel_base * suma_aditivas
    else:
        serie = nivel

    con_estacionalidad = serie  # para la descomposición: la serie hasta este punto

    # ---------- 3. CICLOS ----------
    # Como la estacionalidad, pero irregular: la duración y la altura de cada ciclo van cambiando
    # despacio, así que no se repite exactamente igual. Con variabilidad 0 sería una onda fija.
    if ciclo_activo:
        periodos = ciclo_periodo or [100]
        var_periodos = ciclo_var_periodo or [20.0]
        amplitudes = ciclo_amplitud or [10.0]
        var_amplitudes = ciclo_var_amplitud or [25.0]
        fases = ciclo_fase or [0.0]
        modos = ciclo_modo or ["aditiva"]
        if len({len(periodos), len(var_periodos), len(amplitudes), len(var_amplitudes), len(fases), len(modos)}) != 1:
            raise HTTPException(422, "Cada ciclo necesita sus seis valores")

        suma_aditivos = np.zeros(puntos)         # ciclos que se SUMAN
        suma_multiplicativos = np.zeros(puntos)  # ciclos que MULTIPLICAN
        for i in range(len(periodos)):
            # cada ciclo tiene su propia muestra aleatoria (misma semilla + número de ciclo)
            rng_ciclo = np.random.default_rng([semilla_ciclo, i])
            escala = periodos[i] / 3  # los cambios se notan de un ciclo al siguiente, no de un punto al otro

            # duración de cada vuelta: varía alrededor del periodo medio (nunca menos de un 20 % de él)
            duracion = periodos[i] * (1 + var_periodos[i] / 100 * ruido_lento(rng_ciclo, puntos, escala))
            duracion = np.maximum(duracion, 0.2 * periodos[i])
            # posición dentro del ciclo: 0 a 1 es una vuelta. Empieza en la fase pedida y avanza 1/duración por punto.
            posicion = fases[i] / 100 + np.concatenate([[0], np.cumsum(1 / duracion[:-1])])

            # altura de cada vuelta: también varía despacio alrededor de la amplitud media (nunca negativa)
            altura = amplitudes[i] / 100 * np.maximum(0, 1 + var_amplitudes[i] / 100 * ruido_lento(rng_ciclo, puntos, escala))

            onda = altura * np.sin(2 * np.pi * posicion)
            if modos[i] == "aditiva":
                suma_aditivos = suma_aditivos + onda
            elif modos[i] == "multiplicativa":
                suma_multiplicativos = suma_multiplicativos + onda

        # aditivos: oscilan en puntos (un % del nivel base); multiplicativos: un % del valor de la serie
        serie = serie * (1 + suma_multiplicativos) + nivel_base * suma_aditivos

    con_ciclo = serie  # para la descomposición

    # ---------- 4. RUIDO ----------
    if ruido_activo:
        # Primero se genera un ruido "de tamaño 1" (desviación típica 1) según el tipo,
        # y al final se escala: el ruido es PROPORCIONAL al valor de la serie en cada punto.
        # Con grado 3, un punto que vale 100 se mueve ~3 y uno que vale 150 se mueve ~4.5.

        # con la misma semilla sale siempre la misma muestra aleatoria
        rng = np.random.default_rng(semilla)
        azar = rng.normal(size=puntos)   # números normales (media 0, desviación 1)

        if ruido_tipo == "blanco":
            # cada punto es independiente y con la misma variabilidad
            ruido = azar

        elif ruido_tipo == "heterocedastico":
            # la variabilidad crece con el tiempo: x0.25 al inicio, x2 al final
            ruido = (0.25 + 1.75 * u) * azar

        elif ruido_tipo == "autocorrelado_positivo" or ruido_tipo == "autocorrelado_negativo":
            # AR(1): cada valor depende del anterior.  ruido[t] = phi * ruido[t-1] + novedad
            # phi > 0: los valores se parecen al anterior (rachas suaves)
            # phi < 0: los valores alternan de signo (zigzag)
            if ruido_tipo == "autocorrelado_positivo":
                phi = ruido_phi
            else:
                phi = -ruido_phi
            # la novedad se reescala para que la desviación total siga siendo 1
            novedad = np.sqrt(1 - phi ** 2) * azar
            ruido = np.zeros(puntos)
            ruido[0] = azar[0]
            for i in range(1, puntos):
                ruido[i] = phi * ruido[i - 1] + novedad[i]

        elif ruido_tipo == "garch":
            # GARCH(1,1): la variabilidad de hoy depende de los golpes de ayer,
            # así salen rachas de calma y rachas de volatilidad.
            #   varianza[t] = omega + alfa * ruido[t-1]**2 + beta * varianza[t-1]
            alfa = 0.10
            beta = 0.85
            omega = 1 - alfa - beta  # así la desviación media sigue siendo 1
            varianza = 1.0
            ruido = np.zeros(puntos)
            for i in range(puntos):
                ruido[i] = np.sqrt(varianza) * azar[i]
                varianza = omega + alfa * ruido[i] ** 2 + beta * varianza

        elif ruido_tipo == "colas_pesadas":
            # t de Student con 3 grados de libertad: casi todo es pequeño, pero
            # de vez en cuando salen valores extremos (outliers).
            # Se divide entre raíz de 3 para que la desviación sea 1.
            ruido = rng.standard_t(3, size=puntos) / np.sqrt(3)

        # tamaño del ruido en cada punto: grado % del valor de la serie (sin ruido)
        escala = np.abs(serie) * ruido_grado / 100
        serie = serie + escala * ruido

    con_ruido = serie  # para la descomposición

    # ---------- 5. ANOMALÍAS ----------
    resueltas = []  # lo que se aplicó de verdad (útil para ver dónde cayeron las aleatorias)
    if anomalias_activas and anomalia:
        if magnitud_aleatoria_min > magnitud_aleatoria_max:
            raise HTTPException(422, "El mínimo de la magnitud aleatoria no puede superar al máximo")

        # los valores aleatorios salen de su semilla: con la misma, siempre los mismos
        rng_anomalia = np.random.default_rng(semilla_anomalias)
        factor = np.zeros(puntos)  # efecto acumulado de todas las anomalías, como fracción

        for texto in anomalia:
            partes = texto.split(",")
            if len(partes) not in (3, 4) or partes[0] not in TIPOS_ANOMALIA:
                raise HTTPException(422, f"Anomalía no válida: {texto}")
            tipo, punto, magnitud = partes[:3]

            # decaimiento: solo lo usa el transitorio; si no se indica, el de siempre
            try:
                decaimiento = float(partes[3]) if len(partes) == 4 else DECAIMIENTO_TRANSITORIO
            except ValueError:
                raise HTTPException(422, f"Anomalía no válida: {texto}")
            if not 0 <= decaimiento <= 0.95:
                raise HTTPException(422, "El decaimiento debe estar entre 0 y 0.95")

            try:
                if punto == "aleatorio":
                    punto = int(rng_anomalia.integers(0, puntos))
                else:
                    punto = int(punto)
                if magnitud == "aleatorio":
                    signo = rng_anomalia.choice([-1, 1])
                    magnitud = signo * rng_anomalia.uniform(magnitud_aleatoria_min, magnitud_aleatoria_max)
                else:
                    magnitud = float(magnitud)
            except ValueError:
                raise HTTPException(422, f"Anomalía no válida: {texto}")
            if not -1000 <= magnitud <= 1000:
                raise HTTPException(422, "La magnitud debe estar entre -1000 y 1000")
            punto = min(max(punto, 0), puntos - 1)  # si se sale del eje x, se pega al borde

            # "forma" = cómo se reparte el efecto en el tiempo (1 = efecto completo)
            if tipo == "puntual":
                # solo afecta a un punto
                forma = (t == punto).astype(float)
            elif tipo == "cambio_nivel":
                # desde el punto en adelante, la serie queda desplazada para siempre
                forma = (t >= punto).astype(float)
            elif tipo == "transitorio":
                # golpe en el punto que se va apagando poco a poco
                forma = np.where(t >= punto, decaimiento ** np.maximum(t - punto, 0), 0.0)

            factor = factor + magnitud / 100 * forma
            resueltas.append({"tipo": tipo, "punto": punto, "magnitud": round(float(magnitud), 1)})

        # el efecto es proporcional al valor de la serie en cada punto
        serie = serie * (1 + factor)

    # Descomposición: cada pieza es lo que aporta ese bloque, de modo que
    # tendencia + estacionalidad + ciclo + ruido + anomalías = serie. "tendencia" es el nivel con su
    # tendencia, y también sirve para dibujarla aparte sobre la serie.
    componentes = {
        "tendencia": nivel,
        "estacionalidad": con_estacionalidad - nivel,
        "ciclo": con_ciclo - con_estacionalidad,
        "ruido": con_ruido - con_ciclo,
        "anomalias": serie - con_ruido,
    }
    return {
        "x": t.tolist(),
        "y": serie.round(4).tolist(),
        "componentes": {nombre: valores.round(4).tolist() for nombre, valores in componentes.items()},
        "anomalias": resueltas,
    }
