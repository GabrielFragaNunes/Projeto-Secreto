import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router as fii_router

app = FastAPI(title="Projeto Secreto Engine")
configured_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000")
allowed_origins = [
    origin.strip() for origin in configured_origins.split(",") if origin.strip()
] or ["http://localhost:3000"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(fii_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "engine": "deterministic"}
