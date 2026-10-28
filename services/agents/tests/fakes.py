"""Shared test data, a scripted fake chat client, and an offline model provider double."""

import asyncio
from collections.abc import Callable

import httpx2

from standfolk_agents.provider import AgentFrameworkChat
from standfolk_agents.workflow import AskRequest

# The prime mark that match minutes use in the Ask templates (U+2032).
MINUTE = "′"

MODELS_ENDPOINT = "https://models.example.test/inference"
REQUEST_ID = "3f0c6a52-6a7e-4d1e-9d7a-2c1f0b7e9a11"
QUESTION = "How many goals has Youngho Go scored?"
TEMPLATE = f"Youngho Go: 1 in this match so far (12{MINUTE}), and 7 in 8 league games this season before today."
EVIDENCE_TEXT = f"Youngho Go scored in the 12{MINUTE} minute. Season record: 7 goals in 8 league games before today."
EVIDENCE = {
    "ref": "events@1200000",
    "label": "Synthetic match events up to 20 minutes",
    "text": EVIDENCE_TEXT,
}
PAYLOAD = {
    "request_id": REQUEST_ID,
    "question": QUESTION,
    "template_answer": TEMPLATE,
    "evidence": [EVIDENCE],
    "max_model_calls": 4,
    "timeout_ms": 15000,
}

# Drafts use only numbers and names that the template or the evidence contains, unless noted.
GOOD_DRAFT = f"Youngho Go has scored 1 goal in this match so far (12{MINUTE}), and 7 in 8 league games this season."
SHORT_DRAFT = f"Youngho Go has scored 1 goal in this match so far (12{MINUTE})."
BAD_NUMBER_DRAFT = "Youngho Go has scored 3 goals in this match."
NINE_DRAFT = "Youngho Go scored 9 goals."
BAD_NAME_DRAFT = "Kwame Doherty has scored 1 goal in this match so far."
CAUSAL_DRAFT = f"Youngho Go scored 1 goal in this match so far (12{MINUTE}); the substitution caused the goal."
CAUSAL_REASON = "the evidence does not say the substitution caused the goal."


class FakeChat:
    """Scripted chat client: returns the next reply (or raises) and records every call."""

    def __init__(
        self,
        replies: list[str] | None = None,
        *,
        error: Exception | None = None,
        delay_s: float = 0.0,
    ) -> None:
        self._replies = list(replies or [])
        self._error = error
        self._delay_s = delay_s
        self.calls: list[tuple[str, str]] = []

    async def complete(self, system: str, user: str) -> str:
        self.calls.append((system, user))
        if self._delay_s:
            await asyncio.sleep(self._delay_s)
        if self._error is not None:
            raise self._error
        if not self._replies:
            raise AssertionError("FakeChat ran out of scripted replies")
        return self._replies.pop(0)


def make_request(**overrides: object) -> AskRequest:
    return AskRequest.model_validate({**PAYLOAD, **overrides})


def completion(text: str) -> dict:
    """A minimal OpenAI-style chat completion body that carries one assistant message."""
    return {
        "id": "chatcmpl-test",
        "object": "chat.completion",
        "created": 0,
        "model": "test-model",
        "choices": [{"index": 0, "message": {"role": "assistant", "content": text}, "finish_reason": "stop"}],
    }


def mock_model_chat(handler: Callable[[httpx2.Request], httpx2.Response]) -> AgentFrameworkChat:
    """The real Agent Framework client, with HTTP answered by `handler` instead of the model provider."""
    http_client = httpx2.AsyncClient(transport=httpx2.MockTransport(handler))
    return AgentFrameworkChat(
        token="test-token-value",
        endpoint=MODELS_ENDPOINT,
        model="test-model",
        http_client=http_client,
    )
