# Laboratorio_senales

Laboratorio de señales para la herramienta de índices compuestos. Backend FastAPI + frontend estático (Plotly.js) en `public/`.

## Local

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app:app --reload      # solo API: http://localhost:8000/api/series
```

Para ver también la página (`public/`), usa la CLI de Vercel: `npm i -g vercel` y `vercel dev`.

## Despliegue

Importar el repositorio en vercel.com (Add New → Project). Cada push a `main` redespliega.
Vercel soporta Python 3.12, 3.13 y 3.14 (usa 3.12 por defecto); usa la misma versión en local.

## Proyectos

Un proyecto es el conjunto de series de la pantalla. Se puede guardar en el navegador («Guardar», lista «Mis proyectos») o exportar como archivo `.json` y abrir en otro sitio.

- **Formato** (versión 6): `{ formato: "laboratorio-senales", version, id, nombre, creado, modificado, series: [...], imputacion }`. `imputacion` guarda la fase 2: la variable explicada (`explicada.serieId`), los tramos que se le han quitado (`explicada.quitados`, pares `[desde, hasta]`) las series elegidas como explicativas (`explicativas`, una lista de `serieId`), los métodos de imputación elegidos en cada ventana de la pestaña 4 (`metodos`, un objeto `{ sin, "solo:<serieId>", "multi:<n>" }` con listas de ids), las combinaciones de la ventana multivariante (`combinaciones`: `{ id, explicativas }`, con una lista de `serieId` o `null` si usa todas) y sus parámetros (`parametros`: la k de cada media móvil, el periodo de la media estacional —`null` si se detecta solo— y si se quita la tendencia, y el grado de la polinómica local). De una serie generada se guarda su configuración (con las semillas, así que sale idéntica); de una manual, sus valores. Lo que es solo de pantalla no se guarda.
- **Versiones**: al cambiar el formato hay que subir `VERSION_FORMATO` en `public/index.html` y añadir en `MIGRACIONES[n]` la función que pasa un proyecto de la versión `n` a la `n+1`. Los campos que falten al abrir un proyecto antiguo se completan con los valores por defecto.
- **Dónde se guarda**: todo pasa por el objeto `almacen` (`listar`, `leer`, `guardar`, `borrar`). Hoy usa IndexedDB; para guardar en un servidor basta con otra implementación con esas cuatro operaciones.
- **Copia automática**: el trabajo sin guardar se copia cada pocos segundos y se ofrece recuperarlo al volver a abrir la página.

## Fases del proyecto

Un proyecto avanza por fases, cada una con su pantalla. **1 · Series** es el laboratorio (generar, importar, escribir y dibujar series). **2 · Imputación** tiene cuatro pestañas: *Variable explicada*, *Variables explicativas*, *Correlación* e *Imputación y resultados* (las cuatro hechas). Esta última se reparte en sub-pestañas según con qué se imputa: *Sin explicativas*, una *Solo X* por cada explicativa, una o varias *Multivariante* (combinaciones de explicativas a la vez, las que se elijan; se añaden con «+ combinación») y, al final, *Comparación*, que junta en una tabla (con ranking y gráfica) lo que se ha marcado en las otras ventanas. Los métodos se marcan por ventana, y la interpolación lineal sale siempre como referencia. Para añadir una fase hay que añadirla a `FASES` en `public/index.html` y crear su `<section>`.

## Estructura del código

- `app.py`: la API (FastAPI). Solo recibe la petición, comprueba los parámetros y llama a `senales`.
- `senales/`: el cálculo, sin nada de web. `senales/imputacion/` tiene los métodos de imputación (`simples.py`: media, mediana, último y siguiente valor, medias móviles simples y ponderadas (centradas y solo con anteriores), media estacional, e interpolación lineal, spline cúbica y polinómica local; `con_explicativas.py`: regresión y EM), `metricas.py` (MAE, RMSE, R² frente al real, mejora sobre la referencia y error por tramo) y `ejecutar.py`, que los compara. Es la ruta `POST /api/imputar`. `generar.py` junta los bloques en orden (`tendencia`, `estacionalidad`, `ciclos`, `ruido`, `anomalias`, `huecos`), `parametros.py` agrupa los parámetros de cada bloque, `constantes.py` guarda valores por defecto y topes, y `errores.py` define el error que `app.py` convierte en un 422.
- `tests/`: pruebas de Python (ver «Pruebas»).
- `public/index.html`: solo el esqueleto de la página (marcado). Carga los estilos y los scripts.
- `public/css/`: los estilos, en el mismo orden en que se cargan: `base`, `imputacion`, `resultados`, `proyecto`, `panel`, `formulario` y `series-manuales`.
- `public/js/`: el JavaScript, en trozos numerados por orden de carga: `00-base` (constantes y validación), `10-bloques` (bloques del formulario), `20-series` (series y pestañas), `30-grafica`, `40-series-manuales`, `50-fases`, `60-explicada`, `70-explicativas`, `80-correlacion`, `82-resultados`, `85-imputacion-proyecto`, `90-proyectos` y `99-arranque`.

Los scripts son **clásicos, no módulos**: comparten el mismo ámbito global y el orden de carga importa (cada uno usa lo definido en los anteriores). Al añadir un archivo hay que añadirlo en `index.html` en el sitio que le toque.

## Pruebas

```powershell
pip install -r requirements-dev.txt
python -m pytest
```

- **Pruebas de cada bloque** (`test_tendencia.py`, `test_estacionalidad.py`, `test_ciclos.py`, `test_ruido.py`, `test_anomalias.py`, `test_huecos.py`): comprueban qué debe pasar (propiedades, errores, semillas).
- `test_generar.py` y `test_api.py`: la serie completa y la capa web, incluida la lista exacta de parámetros que usa la página.
- **Referencia** (`test_referencia.py`): `casos.py` define 84 peticiones y `referencia.json` guarda una huella de lo que devolvía la API en cada una. Si cualquier cálculo cambia un solo número, falla. Si el cambio es a propósito: `python tests/generar_referencia.py` y revisar en Git qué casos han cambiado. Si se actualiza numpy, sus números aleatorios pueden cambiar y habrá que regenerarla.
