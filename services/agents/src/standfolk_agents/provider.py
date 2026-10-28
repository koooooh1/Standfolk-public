"""The only module that imports Microsoft Agent Framework or talks to the model provider (Google AI Studio by default).

The workflow depends on ChatProvider alone, so the tests use a fake and never reach the network.
"""

from collections.abc import Mapping
from typing import Protocol

import httpx2
from agent_framework import Agent
from agent_framework_openai import OpenAIChatCompletionClient
from openai import AsyncOpenAI

# Gemini API, OpenAI-compatible surface.
DEFAULT_MODEL_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/openai"


class ChatProvider(Protocol):
    """One chat completion: a system instruction and a user message in, the model's text out."""

    async def complete(self, system: str, user: str) -> str: ...


class AgentFrameworkChat:
    """Chat completions through the Agent Framework OpenAI-compatible client, for any OpenAI-compatible endpoint."""

    def __init__(
        self,
        *,
        token: str,
        endpoint: str,
        model: str,
        http_client: httpx2.AsyncClient | None = None,
    ) -> None:
        # max_retries=0: each HTTP request is one counted model call, so the workflow's call budget stays exact.
        openai_client = AsyncOpenAI(api_key=token, base_url=endpoint, max_retries=0, http_client=http_client)
        self._client = OpenAIChatCompletionClient(model=model, async_client=openai_client)

    async def complete(self, system: str, user: str) -> str:
        # A new agent per call, and no session passed: each call is stateless and sees only its own messages.
        agent = Agent(self._client, instructions=system)
        response = await agent.run(user)
        return response.text


def build_provider(environ: Mapping[str, str]) -> ChatProvider | None:
    """Return a provider when MODEL_API_KEY and MODEL_NAME are both set, otherwise None."""
    token = environ.get("MODEL_API_KEY", "").strip()
    model = environ.get("MODEL_NAME", "").strip()
    if not token or not model:
        return None
    endpoint = environ.get("MODEL_ENDPOINT", "").strip() or DEFAULT_MODEL_ENDPOINT
    if not endpoint.startswith("https://"):
        raise ValueError("MODEL_ENDPOINT must be an https URL")
    return AgentFrameworkChat(token=token, endpoint=endpoint, model=model)
