"""Imputación de datos faltantes: métodos y forma de medir su error."""
from .ejecutar import METODOS, REFERENCIA, imputar
from .seleccion import sugerir_explicativas

__all__ = ["imputar", "METODOS", "REFERENCIA", "sugerir_explicativas"]
