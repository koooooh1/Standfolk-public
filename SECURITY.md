# Security policy

Standfolk is a hackathon project deployed on Azure Container Apps for demonstration and judging.

## Reporting a vulnerability

Please do not open a public issue for security problems. Report them privately through GitHub's [private vulnerability reporting](https://github.com/koooooh1/Standfolk-public/security/advisories/new) for this repository. Include steps to reproduce and the affected files or endpoints.

## Project practices

- Secrets and credentials never go into the repository. Local configuration lives in a root `.env` file, which is ignored by Git.
- In production on Azure Container Apps, `MODEL_API_KEY` is injected only into the private `standfolk-agents` container as a Container Apps secret.
- The public API enforces per-client POST rate limiting (`RATE_LIMIT_PER_MINUTE`), a daily model-call budget (`AGENT_DAILY_MODEL_CALLS`), and a concurrency gate (`AGENT_CONCURRENT_RUNS`).
- All clubs, players, staff, and match events are fictional and authored in this repository; third-party dependencies and licences are recorded in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
