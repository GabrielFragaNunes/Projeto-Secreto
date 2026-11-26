from fastapi import FastAPI

from app.api.routes import router as fii_router

app = FastAPI(title="Projeto Secreto Engine")
app.include_router(fii_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "engine": "deterministic"}
