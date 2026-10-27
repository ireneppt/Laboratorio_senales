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
