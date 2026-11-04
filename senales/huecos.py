"""Datos faltantes: tramos de la serie que se dejan sin dato."""
import numpy as np

from .errores import ErrorDeEntrada


def resolver_huecos(huecos, puntos):
    """Qué puntos quedan sin dato. Devuelve (faltan, resueltos).

    "faltan" es un booleano por punto; "resueltos" es la lista de huecos aplicados, ya recortados al eje.
    """
    faltan = np.zeros(puntos, dtype=bool)
    resueltos = []
    if huecos.activos and huecos.textos:
        for texto in huecos.textos:
            partes = texto.split(",")
            try:
                if len(partes) != 2:
                    raise ValueError
                desde, hasta = int(partes[0]), int(partes[1])
            except ValueError:
                raise ErrorDeEntrada(f"Hueco no válido: {texto}")
            if hasta < desde:
                raise ErrorDeEntrada("El final del hueco no puede ser anterior al inicio")
            desde = min(max(desde, 0), puntos - 1)  # si se sale del eje x, se pega al borde
            hasta = min(max(hasta, 0), puntos - 1)
            faltan[desde:hasta + 1] = True
            resueltos.append({"desde": desde, "hasta": hasta})
    return faltan, resueltos
