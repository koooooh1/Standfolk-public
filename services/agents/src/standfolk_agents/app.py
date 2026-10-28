"""HTTP app for the story agents. The Node API is the only caller, and the service never fetches data itself."""

import os
from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel

from standfolk_agents.provider import ChatProvider, build_provider
from standfolk_agents.workflow import AskRequest, AskResult, run_ask


class Health(BaseModel):
    status: Literal["ok"]
    model_configured: bool


def create_app(provider: ChatProvider | None = None) -> FastAPI:
    """Build the app around one provider. None means no model is configured, so /ask answers with templates."""
    app = FastAPI(title="Standfolk story agents", version="0.1.0")

    @app.get("/health", response_model=Health)
    async def health() -> Health:
        return Health(status="ok", model_configured=provider is not None)

    @app.post("/ask", response_model=AskResult)
    async def ask(request: AskRequest) -> AskResult:
        return await run_ask(request, provider)

    return app


def create_default_app() -> FastAPI:
    """Factory for uvicorn. The model comes from MODEL_API_KEY, MODEL_NAME, and MODEL_ENDPOINT."""
    return create_app(build_provider(os.environ))
