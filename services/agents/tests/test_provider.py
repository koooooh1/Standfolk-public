"""Provider wire check: one HTTP request per model call, sent to the configured model endpoint."""

import json

import httpx2
import pytest
from agent_framework.exceptions import ChatClientException

from fakes import MODELS_ENDPOINT, completion, make_request, mock_model_chat
from standfolk_agents.provider import build_provider
from standfolk_agents.workflow import run_ask


def text_of(message: dict) -> str:
    content = message["content"]
    if isinstance(content, str):
        return content
    return "".join(part.get("text", "") for part in content)


async def test_complete_sends_one_chat_request_with_system_and_user_messages() -> None:
    sent: list[httpx2.Request] = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        sent.append(request)
        return httpx2.Response(200, json=completion("Youngho Go has scored 1 goal."))

    text = await mock_model_chat(handler).complete(system="RULES", user="QUESTION AND EVIDENCE")

    assert text == "Youngho Go has scored 1 goal."
    assert len(sent) == 1
    assert str(sent[0].url) == f"{MODELS_ENDPOINT}/chat/completions"
    assert sent[0].headers["authorization"] == "Bearer test-token-value"
    body = json.loads(sent[0].content)
    assert body["model"] == "test-model"
    assert [message["role"] for message in body["messages"]] == ["system", "user"]
    assert text_of(body["messages"][0]) == "RULES"
    assert text_of(body["messages"][1]) == "QUESTION AND EVIDENCE"


async def test_a_rate_limited_call_is_sent_once_so_the_call_budget_stays_exact() -> None:
    sent: list[httpx2.Request] = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        sent.append(request)
        return httpx2.Response(429, json={"error": {"message": "rate limited", "code": "rate_limited"}})

    # The framework wraps the SDK's RateLimitError; the workflow treats any exception as a provider error.
    with pytest.raises(ChatClientException):
        await mock_model_chat(handler).complete(system="RULES", user="QUESTION")

    assert len(sent) == 1


def test_build_provider_needs_both_a_token_and_a_model() -> None:
    assert build_provider({}) is None
    assert build_provider({"MODEL_API_KEY": "test-token-value"}) is None
    assert build_provider({"MODEL_NAME": "test-model"}) is None
    assert build_provider({"MODEL_API_KEY": "  ", "MODEL_NAME": "test-model"}) is None


def test_build_provider_refuses_a_plain_http_endpoint_without_echoing_the_token() -> None:
    environ = {
        "MODEL_API_KEY": "test-token-value",
        "MODEL_NAME": "test-model",
        "MODEL_ENDPOINT": "http://models.example.test",
    }

    with pytest.raises(ValueError, match="https") as error:
        build_provider(environ)

    assert "test-token-value" not in str(error.value)


async def test_a_failed_call_logs_the_http_status_but_not_the_message(caplog: pytest.LogCaptureFixture) -> None:
    def handler(request: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(503, json={"error": {"message": "secret upstream detail", "code": 503}})

    result = await run_ask(make_request(), mock_model_chat(handler))

    assert result.outcome == "provider_error"
    assert "HTTP 503" in caplog.text
    assert "secret upstream detail" not in caplog.text
