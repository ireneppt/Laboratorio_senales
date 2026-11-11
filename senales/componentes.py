"""Componentes de una serie que no se ha generado (importada, escrita o dibujada).

Calcula el periodo estacional sugerido, la descomposición clásica aditiva (tendencia, estacionalidad y resto), la
fuerza de cada componente, la pendiente de Sen con el contraste de Mann-Kendall y las posibles anomalías. Todo con
la posición i de cada punto (no hay fechas). Además de los resultados devuelve un "detalle" con los números
intermedios, para poder explicar paso a paso cómo se ha llegado a cada uno.

Referencias: descomposición clásica y fuerzas (Hyndman y Athanasopoulos, Forecasting: Principles and Practice, cap. 3
y 4; Wang, Smith y Hyndman, 2006); pendiente de Sen (Sen, 1968); Mann-Kendall (Mann, 1945; Kendall, 1975).
"""
import math

import numpy as np

from .errores import ErrorDeEntrada

MIN_DATOS = 8                # datos conocidos mínimos para analizar
MIN_PUNTOS_ESTACIONALIDAD = 12  # con menos puntos no se busca estacionalidad (no caben 3 ciclos de ni siquiera 4 puntos)
UMBRAL_PICO = 0.3            # autocorrelación mínima de un pico para tomarlo como periodo
UMBRAL_MULTIPLO = 0.2        # el doble del periodo también tiene que tener autocorrelación (si cabe en la serie)
PARECIDO_AL_MEJOR = 0.85     # entre los picos válidos, el primero que llegue al 85 % del más alto (los demás son múltiplos)
FUERZA_DEBIL = 0.3           # por debajo, "débil"
FUERZA_FUERTE = 0.6          # por encima, "fuerte"; entre las dos, "moderada"
ANOMALIA_MAD = 3             # anomalía: el resto se aleja más de 3 MAD escaladas de su mediana
ESCALA_MAD = 1.4826          # MAD escalada: con datos normales vale lo mismo que la desviación típica
MAX_PUNTOS_SEN = 1500        # la pendiente de Sen usa todos los pares (crece con n²): con más puntos se submuestrea
NIVEL_SIGNIFICACION = 0.05


def _redondear(vector):
    return [None if np.isnan(v) else round(float(v), 6) for v in vector]


def _num(valor, decimales=6):
    return None if valor is None or (isinstance(valor, float) and math.isnan(valor)) else round(float(valor), decimales)


def etiqueta_fuerza(valor):
    if valor is None:
        return None
    return "débil" if valor < FUERZA_DEBIL else "fuerte" if valor > FUERZA_FUERTE else "moderada"


def rellenar(y):
    """Los huecos, rellenos provisionalmente uniendo los datos con rectas (en los extremos, el dato más cercano)."""
    conocidos = ~np.isnan(y)
    completa = y.copy()
    completa[~conocidos] = np.interp(np.flatnonzero(~conocidos), np.flatnonzero(conocidos), y[conocidos])
    return completa, conocidos


def autocorrelacion(r, max_retardo):
    """Autocorrelación de r para los retardos 0..max_retardo (la fórmula clásica, con la media y la varianza de toda r)."""
    r = r - r.mean()
    total = float(np.dot(r, r))
    if total == 0:
        return np.zeros(max_retardo + 1)
    return np.array([1.0] + [float(np.dot(r[:-k], r[k:])) / total for k in range(1, max_retardo + 1)])


def sugerir_periodo(z):
    """Periodo estacional sugerido para la serie z (sin huecos): el primer pico claro de la autocorrelación de z
    menos su recta, hasta un tercio de la serie (al menos 3 ciclos). Devuelve (periodo o None, detalle)."""
    n = len(z)
    puntos = np.arange(n)
    pendiente, ordenada = np.polyfit(puntos, z, 1)
    resto = z - (ordenada + pendiente * puntos)
    retardo_max = n // 3
    detalle = {"retardo_max": retardo_max, "pendiente_quitada": _num(pendiente), "umbral_pico": UMBRAL_PICO,
               "umbral_multiplo": UMBRAL_MULTIPLO, "picos": [], "elegido": None}
    if n < MIN_PUNTOS_ESTACIONALIDAD:
        return None, detalle
    acf = autocorrelacion(resto, min(n - 3, 2 * retardo_max + 1))
    picos = [k for k in range(2, retardo_max + 1)
             if acf[k] >= UMBRAL_PICO and acf[k] > acf[k - 1] and acf[k] >= acf[k + 1]]
    validos = []
    for k in picos:
        cerca = acf[2 * k - 1:2 * k + 2]
        multiplo = float(cerca.max()) if 2 * k + 1 < len(acf) else None
        detalle["picos"].append({"retardo": k, "autocorrelacion": _num(acf[k], 4), "en_el_doble": _num(multiplo, 4)})
        if multiplo is None or multiplo >= UMBRAL_MULTIPLO:
            validos.append(k)
    if not validos:
        return None, detalle
    mejor = max(acf[k] for k in validos)
    elegido = next(k for k in validos if acf[k] >= PARECIDO_AL_MEJOR * mejor)
    detalle["elegido"] = elegido
    detalle["autocorrelacion_elegido"] = _num(acf[elegido], 4)
    detalle["autocorrelacion_mejor"] = _num(mejor, 4)
    detalle["picos"] = detalle["picos"][:8]
    return elegido, detalle


def media_movil_centrada(z, longitud):
    """Media móvil centrada de esa longitud. Si es par, la media móvil 2 x longitud habitual (los dos extremos pesan
    la mitad). Donde la ventana no cabe (los extremos), NaN."""
    pesos = np.ones(longitud) / longitud if longitud % 2 else np.r_[0.5, np.ones(longitud - 1), 0.5] / longitud
    mitad = len(pesos) // 2
    tendencia = np.full(len(z), np.nan)
    tendencia[mitad:len(z) - mitad] = np.convolve(z, pesos, mode="valid")
    return tendencia


def prolongar(tendencia, ancho):
    """Rellena los extremos sin tendencia con una recta ajustada a sus primeros (o últimos) `ancho` valores.
    Devuelve la tendencia completa y qué puntos son prolongados."""
    definidos = np.flatnonzero(~np.isnan(tendencia))
    prolongado = np.isnan(tendencia)
    completa = tendencia.copy()
    m = max(2, min(len(definidos), ancho))
    for tramo, huecos in ((definidos[:m], np.arange(definidos[0])), (definidos[-m:], np.arange(definidos[-1] + 1, len(tendencia)))):
        if len(huecos):
            pendiente, ordenada = np.polyfit(tramo, tendencia[tramo], 1)
            completa[huecos] = ordenada + pendiente * huecos
    return completa, prolongado


def ventana_sin_estacionalidad(n):
    """Longitud de la media móvil de la tendencia cuando no hay estacionalidad: unos n/10 puntos, impar, al menos 3."""
    return max(3, int(round(n / 10)) // 2 * 2 + 1)


def _fuerza(resto, componente):
    base = float(np.var(componente + resto))
    return None if base == 0 else max(0.0, 1 - float(np.var(resto)) / base)


def pendiente_sen(t, v):
    """Pendiente de Sen (mediana de las pendientes entre todos los pares) y contraste de Mann-Kendall (aproximación
    normal, con corrección por empates y de continuidad). Con más de MAX_PUNTOS_SEN puntos se toman MAX_PUNTOS_SEN
    repartidos por igual."""
    submuestreo = len(t) > MAX_PUNTOS_SEN
    if submuestreo:
        elegidos = np.unique(np.linspace(0, len(t) - 1, MAX_PUNTOS_SEN).round().astype(int))
        t, v = t[elegidos], v[elegidos]
    m = len(t)
    i, j = np.triu_indices(m, 1)
    pendiente = float(np.median((v[j] - v[i]) / (t[j] - t[i])))
    ordenada = float(np.median(v - pendiente * t))
    s = int(np.sign(v[j] - v[i]).sum())
    _, empates = np.unique(v, return_counts=True)
    varianza = (m * (m - 1) * (2 * m + 5) - float(np.sum(empates * (empates - 1) * (2 * empates + 5)))) / 18
    z = 0.0 if s == 0 or varianza <= 0 else (s - np.sign(s)) / math.sqrt(varianza)
    p = 2 * (1 - 0.5 * (1 + math.erf(abs(z) / math.sqrt(2))))
    return {"sen": _num(pendiente), "ordenada": _num(ordenada), "s": s, "z": _num(z, 4), "p": _num(p, 6),
            "significativa": p < NIVEL_SIGNIFICACION, "puntos": m, "pares": m * (m - 1) // 2, "submuestreo": submuestreo}


def descomponer(z, validos, periodo, longitud):
    """Descomposición clásica aditiva de z (sin huecos). `validos`: los puntos que cuentan para el patrón estacional.
    Devuelve tendencia, qué puntos de la tendencia son prolongados, el patrón (o None) y la estacionalidad."""
    tendencia, prolongado = prolongar(media_movil_centrada(z, longitud), max(longitud, 2))
    if not periodo:
        return tendencia, prolongado, None, np.zeros(len(z))
    # estacionalidad: media de lo que queda al quitar la tendencia, por posición dentro del periodo, centrada en 0
    sin_tendencia = z - tendencia
    fase = np.arange(len(z)) % periodo
    cuentan = ~prolongado & validos
    patron = np.array([sin_tendencia[(fase == f) & cuentan].mean() if ((fase == f) & cuentan).any()
                       else sin_tendencia[fase == f].mean() for f in range(periodo)])
    patron -= patron.mean()
    return tendencia, prolongado, patron, patron[fase]


def buscar_anomalias(resto, conocidos, z):
    """Puntos con dato cuyo resto se aleja de su mediana más de ANOMALIA_MAD veces la MAD escalada. Una MAD
    despreciable frente a la escala de la serie (solo redondeos) cuenta como 0: entonces no se marca nada."""
    mediana = float(np.median(resto[conocidos]))
    mad = ESCALA_MAD * float(np.median(np.abs(resto[conocidos] - mediana)))
    if mad <= 1e-9 * max(1.0, float(np.abs(z).max())):
        mad = 0.0
    anomalias = [] if mad == 0 else np.flatnonzero(conocidos & (np.abs(resto - mediana) > ANOMALIA_MAD * mad)).tolist()
    return anomalias, mediana, mad


def analizar(y, periodo=None):
    """Analiza la serie y (None o NaN = dato que falta). Con `periodo`, se usa ese (el del usuario); sin él, se sugiere."""
    y = np.array([np.nan if v is None else v for v in y], dtype=float)
    n = len(y)
    conocidos_n = int((~np.isnan(y)).sum())
    if conocidos_n < MIN_DATOS:
        raise ErrorDeEntrada(f"Hacen falta al menos {MIN_DATOS} datos para analizar la serie")
    if periodo is not None and not (isinstance(periodo, int) and not isinstance(periodo, bool) and 2 <= periodo <= n // 2):
        raise ErrorDeEntrada(f"El periodo tiene que ser un número entero entre 2 y {n // 2} (la mitad de la serie: hacen falta al menos 2 ciclos)")
    z, conocidos = rellenar(y)
    avisos = []
    if conocidos_n < n:
        avisos.append("Los huecos se han rellenado provisionalmente (uniendo los datos con rectas) para analizar la serie. La serie no cambia.")

    detalle = {"n": n, "huecos": n - conocidos_n}
    if periodo is None:
        periodo, detalle["periodo"] = sugerir_periodo(z)
        origen = "sugerido" if periodo else None
        if n < MIN_PUNTOS_ESTACIONALIDAD:
            avisos.append(f"La serie es demasiado corta (menos de {MIN_PUNTOS_ESTACIONALIDAD} puntos) para buscar estacionalidad.")
        elif periodo is None:
            avisos.append("No se ha detectado estacionalidad: ningún retardo tiene una autocorrelación clara.")
    else:
        origen = "usuario"
        detalle["periodo"] = None

    # tendencia: media móvil centrada (del periodo, o de unos n/10 puntos si no hay estacionalidad), prolongada en los extremos
    longitud = periodo or ventana_sin_estacionalidad(n)
    if longitud >= n:
        longitud = max(3, (n - 1) // 2 * 2 - 1)
    tendencia, prolongado, patron, estacionalidad = descomponer(z, conocidos, periodo, longitud)
    resto = z - tendencia - estacionalidad
    anomalias, mediana, mad = buscar_anomalias(resto, conocidos, z)
    # Segunda pasada: una anomalía grande arrastra la media móvil y el patrón, y hace parecer anómalos a sus vecinos.
    # Se repite la descomposición con las anomalías tratadas como huecos; el resto se mide contra la serie original.
    primera_pasada = len(anomalias)
    if anomalias:
        sin_anomalias = y.copy()
        sin_anomalias[anomalias] = np.nan
        z_limpia, validos = rellenar(sin_anomalias)
        tendencia, prolongado, patron, estacionalidad = descomponer(z_limpia, validos, periodo, longitud)
        resto = z - tendencia - estacionalidad
        anomalias, mediana, mad = buscar_anomalias(resto, conocidos, z)
    detalle["tendencia"] = {"longitud": longitud, "doble": longitud % 2 == 0,
                            "prolongados_inicio": int(np.argmax(~prolongado)), "prolongados_fin": int(np.argmax(~prolongado[::-1]))}
    if periodo:
        detalle["patron"] = {"minimo": _num(patron.min()), "maximo": _num(patron.max()), "posicion_minimo": int(patron.argmin()), "posicion_maximo": int(patron.argmax())}

    # fuerzas, en los puntos con dato y sin prolongar
    dentro = conocidos & ~prolongado
    if dentro.sum() < 3:
        dentro = conocidos
    f_tendencia = _fuerza(resto[dentro], tendencia[dentro])
    f_estacionalidad = _fuerza(resto[dentro], estacionalidad[dentro]) if periodo else None
    detalle["fuerzas"] = {
        "var_resto": _num(np.var(resto[dentro])), "var_tendencia_resto": _num(np.var(tendencia[dentro] + resto[dentro])),
        "var_estacionalidad_resto": _num(np.var(estacionalidad[dentro] + resto[dentro])) if periodo else None,
        "puntos": int(dentro.sum()), "umbral_debil": FUERZA_DEBIL, "umbral_fuerte": FUERZA_FUERTE,
    }

    # pendiente de Sen y Mann-Kendall, sobre la serie sin estacionalidad y solo con los datos conocidos
    puntos = np.flatnonzero(conocidos)
    pendiente = pendiente_sen(puntos.astype(float), (z - estacionalidad)[conocidos])

    detalle["anomalias"] = {"mediana_resto": _num(mediana), "mad_escalada": _num(mad), "umbral": _num(ANOMALIA_MAD * mad),
                            "veces_mad": ANOMALIA_MAD, "primera_pasada": primera_pasada}

    return {
        "n": n, "periodo": periodo, "origen_periodo": origen,
        "tendencia": _redondear(tendencia), "estacionalidad": _redondear(estacionalidad) if periodo else None,
        "resto": _redondear(resto), "patron": _redondear(patron) if periodo else None,
        "prolongado": prolongado.tolist(), "rellenado": (~conocidos).tolist(),
        "fuerza_tendencia": {"valor": _num(f_tendencia, 4), "etiqueta": etiqueta_fuerza(f_tendencia)},
        "fuerza_estacionalidad": {"valor": _num(f_estacionalidad, 4), "etiqueta": etiqueta_fuerza(f_estacionalidad)} if periodo else None,
        "pendiente": pendiente, "anomalias": anomalias, "avisos": avisos, "detalle": detalle,
    }
