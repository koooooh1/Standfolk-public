"""HTTP contract for GET /health and POST /ask, offline and independent of any real token."""

import httpx
import httpx2
import pytest
from fastapi import FastAPI

from fakes import EVIDENCE, GOOD_DRAFT, PAYLOAD, REQUEST_ID, TEMPLATE, FakeChat, completion, mock_model_chat
from standfolk_agents.app import create_app, create_default_app


@pytest.fixture(autouse=True)
def isolated_model_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Start every test with no model settings, whatever the developer's shell holds."""
    for name in ("MODEL_API_KEY", "MODEL_ENDPOINT", "MODEL_NAME"):
        monkeypatch.delenv(name, raising=False)


def api(app: FastAPI) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver")


@pytest.mark.parametrize(
    ("token", "model"),
    [(None, "test-model"), ("test-token-value", None)],
)
async def test_health_reports_no_model_unless_both_token_and_model_are_set(
    monkeypatch: pytest.MonkeyPatch, token: str | None, model: str | None
) -> None:
    if token is not None:
        monkeypatch.setenv("MODEL_API_KEY", token)
    if model is not None:
        monkeypatch.setenv("MODEL_NAME", model)

    async with api(create_default_app()) as client:
        response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "model_configured": False}


async def test_health_reports_a_configured_model_and_never_echoes_the_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MODEL_API_KEY", "test-token-value")
    monkeypatch.setenv("MODEL_NAME", "test-model")

    async with api(create_default_app()) as client:
        response = await client.get("/health")

    assert response.json() == {"status": "ok", "model_configured": True}
    assert "test-token-value" not in response.text


async def test_ask_returns_200_with_the_agent_answer() -> None:
    fake = FakeChat([GOOD_DRAFT, "ACCEPT"])

    async with api(create_app(fake)) as client:
        response = await client.post("/ask", json=PAYLOAD)

    assert response.status_code == 200
    body = response.json()
    assert body["request_id"] == REQUEST_ID
    assert body["answer"] == GOOD_DRAFT
    assert body["engine"] == "agents"
    assert body["outcome"] == "ok"
    assert body["model_calls"] == 2
    assert [step["agent"] for step in body["steps"]] == ["researcher", "writer", "reviewer"]


async def test_ask_without_a_model_returns_the_template_with_200() -> None:
    async with api(create_app(None)) as client:
        response = await client.post("/ask", json=PAYLOAD)

    assert response.status_code == 200
    assert response.json()["outcome"] == "no_model"
    assert response.json()["answer"] == TEMPLATE


@pytest.mark.parametrize(
    "change",
    [
        {"question": ""},
        {"question": "q" * 1001},
        {"template_answer": ""},
        {"template_answer": "t" * 2001},
        {"evidence": []},
        {"evidence": [EVIDENCE] * 13},
        {"max_model_calls": 0},
        {"max_model_calls": 7},
        {"timeout_ms": 999},
        {"timeout_ms": 30001},
        {"unexpected": "field"},
        {"evidence": [{**EVIDENCE, "unexpected": "field"}]},
        {"request_id": "bad\nrequest"},
    ],
)
async def test_ask_rejects_an_invalid_request_with_422_before_any_model_call(change: dict[str, object]) -> None:
    fake = FakeChat([GOOD_DRAFT, "ACCEPT"])

    async with api(create_app(fake)) as client:
        response = await client.post("/ask", json={**PAYLOAD, **change})

    assert response.status_code == 422
    assert fake.calls == []


async def test_ask_through_the_framework_client_makes_one_http_request_per_counted_call() -> None:
    replies = [GOOD_DRAFT, "ACCEPT"]
    sent: list[httpx2.Request] = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        sent.append(request)
        return httpx2.Response(200, json=completion(replies.pop(0)))

    async with api(create_app(mock_model_chat(handler))) as client:
        response = await client.post("/ask", json=PAYLOAD)

    body = response.json()
    assert body["outcome"] == "ok"
    assert body["answer"] == GOOD_DRAFT
    assert body["model_calls"] == len(sent) == 2
