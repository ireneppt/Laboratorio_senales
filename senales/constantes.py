"""Valores por defecto y topes de la generación de series."""

# Valores limite
ESTACIONAL_MINIMO = -10  # mínimo por defecto de una onda estacional
ESTACIONAL_MAXIMO = 10   # máximo por defecto de una onda estacional
MAX_ESTACIONALIDADES = 20  # tope de ondas estacionales por petición
MAX_ANOMALIAS = 20  # tope de anomalías por petición
MAX_CICLOS = 20  # tope de ciclos por petición
MAX_HUECOS = 20  # tope de huecos (datos faltantes) por petición
DECAIMIENTO_TRANSITORIO = 0.7  # por defecto, el transitorio pierde un 30 % de su efecto en cada punto
MAGNITUD_ALEATORIA = (10, 30)  # por defecto, una anomalía aleatoria mide entre 10 y 30 % (con signo al azar)
PHI_AUTOCORRELACION = 0.8  # por defecto, fuerza de la dependencia del ruido autocorrelado
TIPOS_ANOMALIA = ("puntual", "cambio_nivel", "transitorio")
