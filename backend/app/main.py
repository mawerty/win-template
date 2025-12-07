from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import init_db
from app.routes import health, analysis, articles


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="Atlantis Analyst",
    description="Narzędzie analityczne dla MSZ - scenariusze geopolityczne",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, tags=["Health"])
app.include_router(analysis.router, prefix=settings.api_prefix, tags=["Analysis"])
app.include_router(articles.router, prefix=settings.api_prefix, tags=["Articles"])
