"""La API devuelve, para cada caso de casos.py, exactamente lo mismo que cuando se guardó la referencia.

Si falla, algún cálculo ha cambiado. Si el cambio es a propósito, se regenera la referencia con
`python tests/generar_referencia.py` (y se revisa en Git qué casos han cambiado).
"""
import json
import os
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(__file__))

from app import app  # noqa: E402
from casos import CASOS  # noqa: E402
from generar_referencia import huella  # noqa: E402

with open(os.path.join(os.path.dirname(__file__), "referencia.json"), encoding="utf-8") as f:
    REFERENCIA = json.load(f)

cliente = TestClient(app)


def test_la_referencia_cubre_todos_los_casos():
    assert sorted(REFERENCIA) == sorted(nombre for nombre, _ in CASOS), "hay que regenerar tests/referencia.json"


@pytest.mark.parametrize("nombre,params", CASOS, ids=[nombre for nombre, _ in CASOS])
def test_caso(nombre, params):
    assert huella(cliente.get("/api/series", params=params)) == REFERENCIA[nombre]
