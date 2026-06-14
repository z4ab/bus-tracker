"""FastAPI application entrypoint for the Bus Tracker backend.

Configures logging, CORS origins, and starts the refresh cache.
CORS origins are read from the CORS_ALLOWED_ORIGINS environment variable
(comma-separated list), falling back to localhost dev origins. The
FRONTEND_ORIGIN environment variable is also supported for backward
compatibility.
"""

import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import router as api_router
from services.cache import get_cache

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

app = FastAPI(title="Bus Tracker API")

# Read allowed origins from CORS_ALLOWED_ORIGINS (comma-separated list).
# Fall back to local Vite dev server origins during development.
# FRONTEND_ORIGIN is also supported for backward compatibility.
cors_env = os.environ.get("CORS_ALLOWED_ORIGINS", "").strip()
if cors_env:
    cors_origins = [origin.strip() for origin in cors_env.split(",") if origin.strip()]
else:
    cors_origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

frontend_origin = os.environ.get("FRONTEND_ORIGIN", "").strip()
if frontend_origin and frontend_origin not in cors_origins:
    cors_origins.append(frontend_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup() -> None:
    """Start the background cache refresh task."""
    get_cache().start()


@app.on_event("shutdown")
async def shutdown() -> None:
    """Stop the background cache refresh task."""
    await get_cache().stop()


app.include_router(api_router)
