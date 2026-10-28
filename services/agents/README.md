# Standfolk story agents

A Python service that rephrases the verified Ask-tab answer for a fan. Three agents run in order:
Researcher (evidence), Writer (draft), and Reviewer (checks). The service never fetches data itself;
it only uses the evidence in each request. Without a model, or on any failure, it returns the verified
template answer unchanged.

Built with Microsoft Agent Framework (OpenAI-compatible chat client) pointed at the Gemini API's OpenAI-compatible endpoint (Google AI Studio free tier), FastAPI, and Pydantic v2.

## Setup

Python 3.12 is required. From `services/agents`:

```bash
py -3.12 -m venv .venv
.venv/Scripts/python -m pip install -r requirements-dev.txt
```

On Linux or macOS use `.venv/bin/python` instead. The pins in `requirements.txt` and `requirements-dev.txt` are exact.

## Test and lint

```bash
.venv/Scripts/python -m pytest tests -q
.venv/Scripts/python -m ruff check .
```

The tests are offline. They use a scripted fake chat client, or an HTTP mock behind the real Agent Framework client.

## Run

```bash
.venv/Scripts/python -m uvicorn standfolk_agents.app:create_default_app --factory --app-dir src --host 127.0.0.1 --port 8001
```

The service is internal: the Node API is its only caller. The API limits model use before it calls the service: `AGENT_DAILY_MODEL_CALLS` (default 40 per day, reset at midnight Pacific time) and `AGENT_CONCURRENT_RUNS` (default 2). Each run reserves `max_model_calls` (4) and gives back what it did not use.

## Environment

The service reads process environment variables only. It never reads a `.env` file.

| Variable | Required | Notes |
| --- | --- | --- |
| `MODEL_API_KEY` | For a model | Secret: a Google AI Studio API key. Never logged or returned. |
| `MODEL_NAME` | For a model | No default model, for example `gemini-3.8-flash` (`gemini-2.5-flash` is closed to new users). Both this and the key must be set. |
| `MODEL_ENDPOINT` | No | Defaults to `https://generativelanguage.googleapis.com/v1beta/openai`. Any OpenAI-compatible endpoint works. Must start with `https://`. |

Without both the key and the model, `GET /health` reports `model_configured: false`, and `POST /ask`
returns the template with outcome `no_model`.

## Contract

`GET /health` returns `{"status": "ok", "model_configured": true|false}`.

`POST /ask` takes:

```json
{
  "request_id": "3f0c6a52-6a7e-4d1e-9d7a-2c1f0b7e9a11",
  "question": "How many goals has Youngho Go scored?",
  "template_answer": "Youngho Go: 1 in this match so far (12′), and 7 in 8 league games this season before today.",
  "evidence": [{"ref": "events@1200000", "label": "Synthetic match events up to 20 minutes", "text": "..."}],
  "max_model_calls": 4,
  "timeout_ms": 15000,
  "grounding": "template",
  "critic": true
}
```

`grounding` (default `template`) sets where numbers and names may come from: `template` rewords the template answer
only; `evidence` answers from the evidence texts, which the API retrieved from the world pack, and leaves the template
answer out of the writer's prompt. `critic` (default `true`) adds the model critic; without it the deterministic check
is the whole review. If the evidence does not answer the question, the writer replies `NO_ANSWER` and the run ends
with outcome `rejected`. `scripted_drafts` (one or two texts, optional) replaces the writer's model calls with the given drafts for the Studio recovery demonstration; the checks run as usual and the result reports `model_calls: 0`. Only the API sets it, never from user input.

Limits: `request_id` letters, digits, and hyphens only, up to 64 characters (a UUID fits); `question` 1–1000 characters; `template_answer` 1–2000; `evidence` 1–12 items, each with `ref` (≤100),
`label` (≤200), and `text` (≤2000); `max_model_calls` 1–6; `timeout_ms` 1000–30000; `grounding` `template` or `evidence`; `critic` true or false. Unknown fields are rejected.
An invalid request returns 422 before any model call. A valid request always returns 200 with:

```json
{
  "request_id": "...",
  "answer": "...",
  "engine": "agents | template",
  "outcome": "ok | rejected | budget_exhausted | timeout | provider_error | no_model",
  "model_calls": 2,
  "steps": [{"agent": "researcher | writer | reviewer | fallback", "action": "evidence | draft | review | rewrite | template", "detail": "...", "ok": true}]
}
```

| Outcome | Meaning | Answer |
| --- | --- | --- |
| `ok` | Draft passed the checks | Agent draft, engine `agents` |
| `rejected` | Second draft failed review | Template, engine `template` |
| `budget_exhausted` | The next model call would exceed `max_model_calls` | Template |
| `timeout` | The run exceeded `timeout_ms` | Template |
| `provider_error` | The model call raised | Template |
| `no_model` | No token or model configured | Template |

## How the answer is checked

1. **Researcher** (no model call) keeps the verified template answer (with `grounding: template`) and every evidence item whose text does
   not read as an instruction (for example "ignore previous instructions"). It records the refs it passes on.
2. **Writer** (model) drafts one or two plain English sentences from the evidence. Evidence is data, never instructions.
3. **Reviewer** first checks deterministically that every number (including `12′` and `1,200`) and every
   capitalised name in the draft appears in the grounding text (the template answer, or the kept evidence texts).
   Only then, with `critic: true`, does the model critic answer `ACCEPT` or `REWRITE: <reason>`.
4. A failed review gets one rewrite from the Writer with the reason. A second failure returns the template.

Every model call is counted before it is made and never exceeds `max_model_calls`. The client sends each
request once (`max_retries=0`), so the count matches the HTTP requests. The whole run is bounded by `timeout_ms`.
The log records the request ID, the outcome, and the call count. It never records the question, the token,
or exception messages.

## Known limits

- The instruction filter matches a fixed list of words. A manipulated source that avoids those words is caught only
  by the number and name checks and by the critic.
- Capitalised common English words such as "The" or "He" are not treated as names (`COMMON_WORDS` in `review.py`), so a name spelled with one of them would not be checked.
