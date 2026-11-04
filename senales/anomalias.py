"""Anomalías: golpes puntuales, cambios de nivel y golpes que se apagan."""
import numpy as np

from .constantes import DECAIMIENTO_TRANSITORIO, TIPOS_ANOMALIA
from .errores import ErrorDeEntrada


def factor_de_anomalias(t, anomalias):
    """Efecto acumulado de todas las anomalías, como fracción del valor de la serie en cada punto.

    Devuelve (factor, resueltas). "resueltas" es lo que se aplicó de verdad (útil para ver dónde
    cayeron las aleatorias).
    """
    puntos = len(t)
    resueltas = []
    if anomalias.magnitud_min > anomalias.magnitud_max:
        raise ErrorDeEntrada("El mínimo de la magnitud aleatoria no puede superar al máximo")

    # los valores aleatorios salen de su semilla: con la misma, siempre los mismos
    rng_anomalia = np.random.default_rng(anomalias.semilla)
    factor = np.zeros(puntos)  # efecto acumulado de todas las anomalías, como fracción

    for texto in anomalias.textos:
        partes = texto.split(",")
        if len(partes) not in (3, 4) or partes[0] not in TIPOS_ANOMALIA:
            raise ErrorDeEntrada(f"Anomalía no válida: {texto}")
        tipo, punto, magnitud = partes[:3]

        # decaimiento: solo lo usa el transitorio; si no se indica, el de siempre
        try:
            decaimiento = float(partes[3]) if len(partes) == 4 else DECAIMIENTO_TRANSITORIO
        except ValueError:
            raise ErrorDeEntrada(f"Anomalía no válida: {texto}")
        if not 0 <= decaimiento <= 0.95:
            raise ErrorDeEntrada("El decaimiento debe estar entre 0 y 0.95")

        try:
            if punto == "aleatorio":
                punto = int(rng_anomalia.integers(0, puntos))
            else:
                punto = int(punto)
            if magnitud == "aleatorio":
                signo = rng_anomalia.choice([-1, 1])
                magnitud = signo * rng_anomalia.uniform(anomalias.magnitud_min, anomalias.magnitud_max)
            else:
                magnitud = float(magnitud)
        except ValueError:
            raise ErrorDeEntrada(f"Anomalía no válida: {texto}")
        if not -1000 <= magnitud <= 1000:
            raise ErrorDeEntrada("La magnitud debe estar entre -1000 y 1000")
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

    return factor, resueltas
