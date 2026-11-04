"""Genera tests/referencia.json: la "huella" de lo que devuelve la API para cada caso de casos.py.

Uso (desde la raíz del proyecto):  python tests/generar_referencia.py

Para cada caso se guarda el código de estado y, según el caso:
- 200: una huella (sha256) de la respuesta completa, para detectar el cambio de un solo número;
- 422 con un mensaje propio: el mensaje;
- 422 de validación de FastAPI (lista de errores): solo el estado, porque su texto depende de la versión.

Solo hay que regenerarlo cuando se cambia el cálculo A PROPÓSITO.
"""
import hashlib
import json
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
sys.path.insert(0, os.path.join(RAIZ, "tests"))

from fastapi.testclient import TestClient  # noqa: E402

from app import app  # noqa: E402
from casos import CASOS  # noqa: E402


def huella(respuesta):
    """Resume la respuesta de un caso en lo que se compara."""
    if respuesta.status_code == 200:
        texto = json.dumps(respuesta.json(), sort_keys=True, ensure_ascii=False)
        return {"estado": 200, "huella": hashlib.sha256(texto.encode("utf-8")).hexdigest()}
    detalle = respuesta.json().get("detail")
    if isinstance(detalle, str):
        return {"estado": respuesta.status_code, "detalle": detalle}
    return {"estado": respuesta.status_code}


if __name__ == "__main__":
    cliente = TestClient(app)
    referencia = {nombre: huella(cliente.get("/api/series", params=params)) for nombre, params in CASOS}
    ruta = os.path.join(RAIZ, "tests", "referencia.json")
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(referencia, f, indent=1, ensure_ascii=False, sort_keys=True)
    por_estado = {}
    for r in referencia.values():
        por_estado[r["estado"]] = por_estado.get(r["estado"], 0) + 1
    print(f"{len(referencia)} casos guardados en tests/referencia.json: {por_estado}")
