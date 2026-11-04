"""Los parámetros de cada bloque de una serie, agrupados.

Los valores por defecto son los de la API. Las listas (periodos, modos...) llevan un valor por
onda o por ciclo, en el mismo orden; si están vacías (None) se usa el valor por defecto de cada bloque.
"""
from dataclasses import dataclass

from .constantes import MAGNITUD_ALEATORIA, PHI_AUTOCORRELACION


@dataclass
class Tendencia:
    activa: bool = True
    valor: float = 0.5          # 0.5 = la serie sube un 50 %; -1 = baja hasta 0; por debajo de -1 pasa a negativa
    tipo: str = "lineal"
    valor_final: float | None = None  # si se da, la serie acaba en este valor (en unidades) y manda sobre activa y valor


@dataclass
class Estacionalidad:
    activa: bool = True
    periodos: list[int] | None = None
    modos: list[str] | None = None
    minimos: list[float] | None = None
    maximos: list[float] | None = None
    minimos_fin: list[float] | None = None
    maximos_fin: list[float] | None = None


@dataclass
class Ciclos:
    activo: bool = False
    periodos: list[int] | None = None
    var_periodos: list[float] | None = None
    minimos: list[float] | None = None
    maximos: list[float] | None = None
    minimos_fin: list[float] | None = None
    maximos_fin: list[float] | None = None
    var_amplitudes: list[float] | None = None
    modos: list[str] | None = None
    semillas: list[int] | None = None


@dataclass
class Ruido:
    activo: bool = True
    grado: float = 3            # desviación típica, en % del valor de la serie
    tipo: str = "blanco"
    phi: float = PHI_AUTOCORRELACION
    semilla: int = 42


@dataclass
class Anomalias:
    activas: bool = True
    textos: list[str] | None = None  # cada una como "tipo,punto,magnitud" (más ",decaimiento" en los transitorios)
    magnitud_min: float = MAGNITUD_ALEATORIA[0]
    magnitud_max: float = MAGNITUD_ALEATORIA[1]
    semilla: int = 43


@dataclass
class Huecos:
    activos: bool = True
    textos: list[str] | None = None  # cada uno como "desde,hasta"
