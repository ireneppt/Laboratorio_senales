from typing import Literal

import numpy as np
from fastapi import FastAPI, Query

app = FastAPI()

# Valores fijos por ahora
N = 500  # número de puntos de la serie
BASE = 100           # nivel base: la serie arranca en este valor
AMPLITUD_ESTACIONAL = 0.10  # la onda estacional mide un 10 % de BASE
SEMILLA = 42         # para que el ruido sea siempre el mismo


@app.get("/api/series")
def get_series(
    # Tendencia
    tendencia_activa: bool = True,
    tendencia_valor: float = Query(0.5, ge=-1, le=5),  # 0.5 = la serie sube un 50 %
    tendencia_tipo: Literal["lineal", "cuadratica", "amortiguada", "logaritmica", "exponencial"] = "lineal",
    # Estacionalidad
    estacionalidad_activa: bool = True,
    estacionalidad_periodo: int = Query(12, ge=2, le=100),
    estacionalidad_modo: Literal["aditiva", "multiplicativa"] = "aditiva",
    # Ruido
    ruido_activo: bool = True,
    ruido_nivel: Literal["bajo", "medio", "alto"] = "medio",
    ruido_tipo: Literal["blanco", "heterocedastico"] = "blanco",
):
    t = np.arange(N)      # 0, 1, 2, ... N-1
    u = t / (N - 1)       # lo mismo pero de 0 a 1

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
        nivel = BASE * (1 + tendencia_valor * forma)
    else:
        nivel = np.full(N, BASE)  # sin tendencia: línea plana en BASE

    # ---------- 2. ESTACIONALIDAD ----------
    if estacionalidad_activa:
        onda = np.sin(2 * np.pi * t / estacionalidad_periodo)  # oscila entre -1 y 1
        if estacionalidad_modo == "aditiva":
            # la onda se SUMA: siempre oscila ±10 puntos
            serie = nivel + BASE * AMPLITUD_ESTACIONAL * onda
        elif estacionalidad_modo == "multiplicativa":
            # la onda MULTIPLICA: oscila ±10 % del nivel (más amplia si la serie sube)
            serie = nivel * (1 + AMPLITUD_ESTACIONAL * onda)
    else:
        serie = nivel

    # ---------- 3. RUIDO ----------
    if ruido_activo:
        # desviación típica del ruido, en puntos (BASE = 100)
        if ruido_nivel == "bajo":
            sigma = BASE * 0.01   # 1
        elif ruido_nivel == "medio":
            sigma = BASE * 0.03   # 3
        elif ruido_nivel == "alto":
            sigma = BASE * 0.06   # 6

        if ruido_tipo == "heterocedastico":
            # la variabilidad crece con el tiempo: x0.25 al inicio, x2 al final
            sigma = sigma * (0.25 + 1.75 * u)
        # si es "blanco", sigma se queda igual en toda la serie

        # misma muestra aleatoria siempre (semilla fija)
        azar = np.random.default_rng(SEMILLA).normal(size=N)
        serie = serie + sigma * azar

    return {"x": t.tolist(), "y": serie.round(4).tolist()}
