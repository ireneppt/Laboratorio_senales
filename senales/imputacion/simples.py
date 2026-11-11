"""Métodos que solo usan la propia serie: media, mediana, último y siguiente valor, medias móviles (simples y
ponderadas), media estacional e interpolación (lineal, spline cúbica y polinómica local)."""
import numpy as np

from ..errores import ErrorDeEntrada


def _conocidos(p):
    if np.all(np.isnan(p.y)):
        raise ErrorDeEntrada("No queda ningún dato conocido de la variable explicada")


def media(p, parametros=None):
    """Rellena con la media de los datos conocidos."""
    _conocidos(p)
    completa = p.y.copy()
    completa[p.objetivo] = np.nanmean(p.y)
    return completa


def mediana(p, parametros=None):
    """Rellena con la mediana de los datos conocidos."""
    _conocidos(p)
    completa = p.y.copy()
    completa[p.objetivo] = np.nanmedian(p.y)
    return completa


def ultimo_valor(p, parametros=None):
    """Rellena con el último dato conocido (forward fill). Al principio, donde no hay ninguno antes, se queda
    sin imputar."""
    _conocidos(p)
    puntos = np.arange(p.n)
    ultimo = np.maximum.accumulate(np.where(~np.isnan(p.y), puntos, -1))
    completa = p.y.copy()
    rellenables = p.objetivo & (ultimo >= 0)
    completa[rellenables] = p.y[ultimo[rellenables]]
    return completa


def interpolacion(p, parametros=None):
    """Une los datos conocidos con rectas. Fuera del primer y último dato se mantiene el valor más cercano."""
    _conocidos(p)
    conocidos = np.flatnonzero(~np.isnan(p.y))
    completa = p.y.copy()
    objetivo = np.flatnonzero(p.objetivo)
    completa[objetivo] = np.interp(objetivo, conocidos, p.y[conocidos])
    return completa


def siguiente_valor(p, parametros=None):
    """Rellena con el siguiente dato conocido (backward fill). Al final, donde no hay ninguno después, se queda
    sin imputar."""
    _conocidos(p)
    puntos = np.arange(p.n)
    siguiente = np.minimum.accumulate(np.where(~np.isnan(p.y), puntos, p.n)[::-1])[::-1]
    completa = p.y.copy()
    rellenables = p.objetivo & (siguiente < p.n)
    completa[rellenables] = p.y[siguiente[rellenables]]
    return completa


def _entero(parametros, clave, defecto, minimo, maximo, nombre):
    """Un parámetro entero de un método, comprobado (los booleanos no valen como enteros)."""
    valor = (parametros or {}).get(clave, defecto)
    if not isinstance(valor, int) or isinstance(valor, bool) or not minimo <= valor <= maximo:
        tope = "o más" if maximo == float("inf") else f"y {maximo}"
        raise ErrorDeEntrada(f"{nombre} tiene que ser un número entero entre {minimo} {tope}")
    return valor


def _media_movil(p, parametros, solo_anteriores, ponderada=False):
    _conocidos(p)
    k = _entero(parametros, "k", 3, 1, float("inf"), "El número de datos de la media móvil (k)")
    conocidos = np.flatnonzero(~np.isnan(p.y))
    completa = p.y.copy()
    for i in np.flatnonzero(p.objetivo):
        posicion = np.searchsorted(conocidos, i)               # los conocidos antes de i son conocidos[:posicion]
        vecinos = conocidos[max(0, posicion - k):posicion]
        if not solo_anteriores:
            vecinos = np.concatenate([vecinos, conocidos[posicion:posicion + k]])
        if len(vecinos):                                       # sin ninguno (al principio, solo con anteriores): sin imputar
            pesos = 1 / np.abs(vecinos - i) if ponderada else np.ones(len(vecinos))   # ponderada: 1 / distancia en el tiempo
            completa[i] = np.average(p.y[vecinos], weights=pesos)
    return completa


def media_movil(p, parametros=None):
    """Media móvil centrada: la media de los k datos conocidos más cercanos antes y los k más cercanos después
    (en los extremos, solo los del lado que hay). k lo elige el usuario."""
    return _media_movil(p, parametros, solo_anteriores=False)


def media_movil_anteriores(p, parametros=None):
    """Media móvil hacia atrás: la media de los últimos k datos conocidos antes del punto (solo el pasado). Al
    principio, donde no hay ninguno antes, se queda sin imputar."""
    return _media_movil(p, parametros, solo_anteriores=True)


def media_movil_ponderada(p, parametros=None):
    """Como la media móvil centrada, pero cada dato pesa 1 / su distancia en el tiempo al punto: uno a 1 punto pesa el
    doble que uno a 2."""
    return _media_movil(p, parametros, solo_anteriores=False, ponderada=True)


def media_movil_ponderada_anteriores(p, parametros=None):
    """Como la media móvil solo con anteriores, pero cada dato pesa 1 / su distancia en el tiempo al punto."""
    return _media_movil(p, parametros, solo_anteriores=True, ponderada=True)


def media_estacional(p, parametros=None):
    """Rellena cada punto con la media de los datos conocidos que están en el mismo momento del ciclo (a 1, 2, 3...
    periodos antes o después). Con "quitar_tendencia" (por defecto), antes se quita una recta ajustada a lo conocido y
    luego se vuelve a sumar: si no, en una serie con tendencia la media mezcla ciclos que estaban más arriba o más abajo.
    Un punto sin ningún dato conocido en su momento del ciclo se queda sin imputar."""
    _conocidos(p)
    periodo = (parametros or {}).get("periodo")
    if periodo is None:
        raise ErrorDeEntrada("Indica el periodo de la estacionalidad")
    periodo = _entero(parametros, "periodo", None, 2, max(2, p.n // 2), "El periodo")
    quitar_tendencia = (parametros or {}).get("quitar_tendencia", True) is not False
    puntos = np.arange(p.n)
    conocidos = ~np.isnan(p.y)
    tendencia = np.zeros(p.n)
    if quitar_tendencia and conocidos.sum() >= 2:
        pendiente, ordenada = np.polyfit(puntos[conocidos], p.y[conocidos], 1)
        tendencia = ordenada + pendiente * puntos
    resto = p.y - tendencia
    fase = puntos % periodo
    completa = p.y.copy()
    for f in np.unique(fase[p.objetivo]):
        del_ciclo = (fase == f) & conocidos
        if del_ciclo.any():
            huecos = (fase == f) & p.objetivo
            completa[huecos] = tendencia[huecos] + resto[del_ciclo].mean()
    return completa


def polinomica_local(p, parametros=None):
    """Para cada punto, el polinomio de grado d que pasa por los d + 1 datos conocidos más cercanos (al menos uno a
    cada lado, para interpolar y no extrapolar). Grado 1 es la interpolación lineal; con grados altos oscila más.
    Fuera del primer y último dato se mantiene el valor más cercano, como en la interpolación lineal."""
    _conocidos(p)
    grado = _entero(parametros, "grado", 2, 1, 5, "El grado del polinomio")
    conocidos = np.flatnonzero(~np.isnan(p.y))
    completa = interpolacion(p)                                # los extremos, como la lineal
    grado = min(grado, len(conocidos) - 1)
    if grado < 1:
        return completa
    for i in np.flatnonzero(p.objetivo):
        posicion = np.searchsorted(conocidos, i)
        if posicion == 0 or posicion == len(conocidos):
            continue                                           # fuera de los datos: ya está como la lineal
        izquierda, derecha = posicion - 1, posicion            # uno a cada lado y, después, los más cercanos
        elegidos = [conocidos[izquierda], conocidos[derecha]]
        while len(elegidos) < grado + 1:
            puede_izq, puede_der = izquierda > 0, derecha < len(conocidos) - 1
            if puede_izq and (not puede_der or i - conocidos[izquierda - 1] <= conocidos[derecha + 1] - i):
                izquierda -= 1
                elegidos.append(conocidos[izquierda])
            else:
                derecha += 1
                elegidos.append(conocidos[derecha])
        x = np.array(elegidos, dtype=float) - i                # centrado en el punto: más estable
        coeficientes = np.polyfit(x, p.y[elegidos], grado)
        completa[i] = coeficientes[-1]                         # el valor en x = 0, que es el punto
    return completa


def _spline_natural(x, y):
    """Segundas derivadas de la spline cúbica natural que pasa por (x, y), con el algoritmo de Thomas
    (sistema tridiagonal en O(n), para no montar una matriz de n x n)."""
    n = len(x)
    m = np.zeros(n)
    if n < 3:
        return m
    h = np.diff(x)
    diagonal = 2 * (h[:-1] + h[1:])
    lado = h[1:-1].copy()
    derecha = 6 * (np.diff(y[1:]) / h[1:] - np.diff(y[:-1]) / h[:-1])
    for i in range(1, len(diagonal)):                          # eliminación hacia delante
        factor = lado[i - 1] / diagonal[i - 1]
        diagonal[i] -= factor * lado[i - 1]
        derecha[i] -= factor * derecha[i - 1]
    interior = np.zeros(len(diagonal))
    interior[-1] = derecha[-1] / diagonal[-1]
    for i in range(len(diagonal) - 2, -1, -1):                 # sustitución hacia atrás
        interior[i] = (derecha[i] - lado[i] * interior[i + 1]) / diagonal[i]
    m[1:-1] = interior
    return m


def polinomica(p, parametros=None):
    """Une los datos conocidos con curvas: una spline cúbica natural (un polinomio de grado 3 entre cada dos datos,
    empalmados de forma suave). Con menos de 3 datos, rectas. Fuera del primer y último dato se mantiene el
    valor más cercano, como en la interpolación lineal."""
    _conocidos(p)
    x = np.flatnonzero(~np.isnan(p.y)).astype(float)
    y = p.y[~np.isnan(p.y)]
    completa = interpolacion(p)                                # los extremos (y el caso de pocos datos) como la lineal
    if len(x) < 3:
        return completa
    m = _spline_natural(x, y)
    objetivo = np.flatnonzero(p.objetivo)
    dentro = objetivo[(objetivo > x[0]) & (objetivo < x[-1])]
    tramo = np.searchsorted(x, dentro) - 1                     # entre x[tramo] y x[tramo + 1]
    x0, x1 = x[tramo], x[tramo + 1]
    h = x1 - x0
    a, b = (x1 - dentro) / h, (dentro - x0) / h
    completa[dentro] = (a * y[tramo] + b * y[tramo + 1]
                        + ((a ** 3 - a) * m[tramo] + (b ** 3 - b) * m[tramo + 1]) * h ** 2 / 6)
    return completa
