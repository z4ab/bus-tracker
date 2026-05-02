"""FastAPI application entrypoint for the Bus Tracker backend.

Configures logging, CORS for the local Vite dev server, and starts the refresh cache.
"""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import router as api_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

app = FastAPI(title="Bus Tracker API")

# Allow local Vite dev server origins during development.
cors_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://bus-tracker-murex-psi.vercel.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)
