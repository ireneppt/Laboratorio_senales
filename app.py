from typing import Literal

import numpy as np
from fastapi import FastAPI, Query

app = FastAPI()

# Parámetros fijos por ahora (más adelante se podrán exponer en el panel).
N = 200            # número de puntos
BASE = 100.0       # nivel base de la serie
SEASONAL_AMP = 0.10  # amplitud estacional, como fracción del nivel base
SEED = 42

# Forma de cada tendencia, normalizada para ir de 0 a 1 en u in [0, 1]:
# con el mismo "valor", todas acumulan el mismo cambio total y solo difiere la forma.
TREND_SHAPES = {
    "lineal": lambda u: u,
    "cuadratica": lambda u: u**2,
    "amortiguada": lambda u: (1 - np.exp(-4 * u)) / (1 - np.exp(-4)),
    "logaritmica": lambda u: np.log1p(9 * u) / np.log(10),
    "exponencial": lambda u: (np.exp(3 * u) - 1) / (np.exp(3) - 1),
}

# Desviación típica del ruido como fracción del nivel base.
NOISE_LEVELS = {"bajo": 0.01, "medio": 0.03, "alto": 0.06}


@app.get("/api/series")
def get_series(
    trend_value: float = Query(0.5, ge=-1, le=5, description="Cambio total por tendencia, como fracción del nivel base"),
    trend_type: Literal["lineal", "cuadratica", "amortiguada", "logaritmica", "exponencial"] = "lineal",
    seasonal_period: int = Query(12, ge=2, le=100),
    seasonal_mode: Literal["aditiva", "multiplicativa"] = "aditiva",
    noise_level: Literal["bajo", "medio", "alto"] = "medio",
    noise_type: Literal["blanco", "heterocedastico"] = "blanco",
    trend_on: bool = True,
    seasonal_on: bool = True,
    noise_on: bool = True,
):
    t = np.arange(N)
    u = t / (N - 1)

    level = BASE * (1 + trend_value * TREND_SHAPES[trend_type](u)) if trend_on else np.full(N, BASE)

    if seasonal_on:
        wave = np.sin(2 * np.pi * t / seasonal_period)
        if seasonal_mode == "aditiva":
            y = level + BASE * SEASONAL_AMP * wave
        else:
            y = level * (1 + SEASONAL_AMP * wave)
    else:
        y = level

    if noise_on:
        # Misma muestra normal para todos los niveles: cambiar el nivel no baraja el ruido.
        eps = np.random.default_rng(SEED).normal(size=N)
        sigma = BASE * NOISE_LEVELS[noise_level]
        if noise_type == "heterocedastico":
            sigma = sigma * (0.25 + 1.75 * u)  # la varianza crece con el tiempo
        y = y + sigma * eps

    return {"x": t.tolist(), "y": y.round(4).tolist()}
