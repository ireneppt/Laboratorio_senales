"""Generación y análisis de series. La API (app.py) solo recibe peticiones y llama a este paquete."""
from .errores import ErrorDeEntrada
from .generar import generar_serie
from .parametros import Anomalias, Ciclos, Estacionalidad, Huecos, Ruido, Tendencia

__all__ = ["generar_serie", "ErrorDeEntrada", "Tendencia", "Estacionalidad", "Ciclos", "Ruido", "Anomalias", "Huecos"]
