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

- **Formato** (versión 3): `{ formato: "laboratorio-senales", version, id, nombre, creado, modificado, series: [...], imputacion }`. `imputacion` guarda la fase 2: la variable explicada (`explicada.serieId`), los tramos que se le han quitado (`explicada.quitados`, pares `[desde, hasta]`) y las series elegidas como explicativas (`explicativas`, una lista de `serieId`). De una serie generada se guarda su configuración (con las semillas, así que sale idéntica); de una manual, sus valores. Lo que es solo de pantalla no se guarda.
- **Versiones**: al cambiar el formato hay que subir `VERSION_FORMATO` en `public/index.html` y añadir en `MIGRACIONES[n]` la función que pasa un proyecto de la versión `n` a la `n+1`. Los campos que falten al abrir un proyecto antiguo se completan con los valores por defecto.
- **Dónde se guarda**: todo pasa por el objeto `almacen` (`listar`, `leer`, `guardar`, `borrar`). Hoy usa IndexedDB; para guardar en un servidor basta con otra implementación con esas cuatro operaciones.
- **Copia automática**: el trabajo sin guardar se copia cada pocos segundos y se ofrece recuperarlo al volver a abrir la página.

## Fases del proyecto

Un proyecto avanza por fases, cada una con su pantalla. **1 · Series** es el laboratorio (generar, importar, escribir y dibujar series). **2 · Imputación** tiene cuatro pestañas: *Variable explicada* y *Variables explicativas* (hechas), *Correlación* e *Imputación y resultados* (por hacer). Para añadir una fase hay que añadirla a `FASES` en `public/index.html` y crear su `<section>`.
