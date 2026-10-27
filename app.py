import numpy as np
from fastapi import FastAPI

app = FastAPI()


@app.get("/api/series")
def get_series():
    """Serie placeholder para comprobar el circuito API -> gráfica."""
    rng = np.random.default_rng(42)
    x = np.arange(100)
    y = np.cumsum(rng.normal(size=x.size))
    return {"x": x.tolist(), "y": y.round(4).tolist()}
