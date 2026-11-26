from fastapi import FastAPI

app = FastAPI(title="Projeto Secreto Engine")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "engine": "deterministic"}
