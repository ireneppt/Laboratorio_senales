"""Métodos que usan las variables explicativas: regresión y EM.

Si a una explicativa le falta el dato justo en un punto a imputar, el método usa las demás; si no hay
ninguna con dato en ese punto, ese punto se queda sin imputar (NaN), salvo en el EM, que usa la media.
"""
import numpy as np

from ..errores import ErrorDeEntrada


def _necesita_explicativas(p):
    if p.X.shape[1] == 0:
        raise ErrorDeEntrada("Este método necesita al menos una variable explicativa")
    if np.all(np.isnan(p.y)):
        raise ErrorDeEntrada("No queda ningún dato conocido de la variable explicada")


def regresion(p, parametros=None):
    """Ajusta una recta (mínimos cuadrados) de la explicada sobre las explicativas con los puntos conocidos
    y predice los huecos. Si en un punto faltan algunas explicativas, se usa un modelo con las que sí hay."""
    _necesita_explicativas(p)
    completa = p.y.copy()
    por_disponibles = {}
    for i in np.flatnonzero(p.objetivo):
        por_disponibles.setdefault(tuple(np.flatnonzero(~np.isnan(p.X[i]))), []).append(i)
    for columnas, puntos in por_disponibles.items():
        if not columnas:
            continue
        columnas = list(columnas)
        filas = ~np.isnan(p.y) & ~np.isnan(p.X[:, columnas]).any(axis=1)
        if filas.sum() < len(columnas) + 2:
            continue                                       # muy pocos datos para ajustar el modelo
        A = np.column_stack([np.ones(filas.sum()), p.X[filas][:, columnas]])
        coeficientes = np.linalg.lstsq(A, p.y[filas], rcond=None)[0]
        completa[puntos] = np.column_stack([np.ones(len(puntos)), p.X[puntos][:, columnas]]) @ coeficientes
    return completa


def em(p, parametros=None, iteraciones=300, tolerancia=1e-7):
    """EM (esperanza-maximización) suponiendo que explicada y explicativas siguen una normal conjunta.

    Repite dos pasos hasta que se estabiliza: (E) rellena lo que falta con su valor esperado dado lo que se
    conoce de cada punto, y (M) recalcula medias y covarianzas con eso. Admite que las explicativas también
    tengan huecos. Un punto sin ningún dato conocido se imputa con la media.
    """
    _necesita_explicativas(p)
    datos = np.column_stack([p.y, p.X])
    columnas_vacias = np.all(np.isnan(datos), axis=0)
    datos = datos[:, ~columnas_vacias]                    # una explicativa sin ningún dato no aporta nada
    media0 = np.nanmean(datos, axis=0)
    desviacion0 = np.nanstd(datos, axis=0)
    desviacion0 = np.where(desviacion0 == 0, 1.0, desviacion0)
    z = (datos - media0) / desviacion0                    # estandarizado: así el cálculo es más estable
    n, d = z.shape
    observado = ~np.isnan(z)
    con_datos = observado.any(axis=1)

    # puntos agrupados por qué columnas tienen dato (hay pocos grupos distintos)
    grupos = {}
    for i in np.flatnonzero(con_datos):
        grupos.setdefault(tuple(observado[i]), []).append(i)
    grupos = [(np.array(clave), np.array(filas)) for clave, filas in grupos.items()]
    total = int(con_datos.sum())

    mu = np.zeros(d)
    sigma = np.eye(d)
    anillo = 1e-8                                          # para que las matrices se puedan invertir aunque haya series casi iguales

    def valor_esperado(clave, filas, mu, sigma):
        """Valores esperados de lo que falta en cada fila y covarianza que queda sin explicar."""
        O = np.flatnonzero(clave)
        M = np.flatnonzero(~clave)
        completo = np.empty((len(filas), d))
        completo[:, O] = z[np.ix_(filas, O)]
        covarianza = np.zeros((d, d))
        if len(M):
            if len(O):
                soo = sigma[np.ix_(O, O)] + anillo * np.eye(len(O))
                smo = sigma[np.ix_(M, O)]
                ganancia = np.linalg.solve(soo, smo.T).T
                completo[:, M] = mu[M] + (z[np.ix_(filas, O)] - mu[O]) @ ganancia.T
                covarianza[np.ix_(M, M)] = sigma[np.ix_(M, M)] - ganancia @ smo.T
            else:
                completo[:, M] = mu[M]
                covarianza[np.ix_(M, M)] = sigma[np.ix_(M, M)]
        return completo, covarianza

    for _ in range(iteraciones):
        suma = np.zeros(d)
        suma_cuadrados = np.zeros((d, d))
        for clave, filas in grupos:
            completo, covarianza = valor_esperado(clave, filas, mu, sigma)
            suma += completo.sum(axis=0)
            suma_cuadrados += completo.T @ completo + len(filas) * covarianza
        mu_nuevo = suma / total
        sigma_nuevo = suma_cuadrados / total - np.outer(mu_nuevo, mu_nuevo)
        cambio = max(np.abs(mu_nuevo - mu).max(), np.abs(sigma_nuevo - sigma).max())
        mu, sigma = mu_nuevo, sigma_nuevo
        if cambio < tolerancia:
            break

    completa = p.y.copy()
    for clave, filas in grupos:
        esperado, _ = valor_esperado(clave, filas, mu, sigma)
        falta_y = p.objetivo[filas]
        completa[filas[falta_y]] = esperado[falta_y, 0] * desviacion0[0] + media0[0]
    sin_datos = np.flatnonzero(~con_datos & p.objetivo)
    completa[sin_datos] = mu[0] * desviacion0[0] + media0[0]
    return completa
