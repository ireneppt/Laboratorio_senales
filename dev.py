"""Servidor local: sirve la API y public/ sin necesitar la CLI de Vercel.

Solo para desarrollo. En Vercel, public/ lo sirve su CDN y este archivo no se usa.
"""
import uvicorn
from fastapi.staticfiles import StaticFiles

from app import app

# Se monta al final para que /api/* tenga prioridad sobre los archivos estáticos.
app.mount("/", StaticFiles(directory="public", html=True), name="public")

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
