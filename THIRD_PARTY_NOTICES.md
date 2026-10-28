# Third-Party Notices

Standfolk is released under the MIT License (`LICENSE`, Copyright (c) 2026 Youngho Go). This file lists the third-party software, rule sets, and generated media assets included in or used by the repository.

---

## 1. Fictional World Data and Generated Media

- **Fictional World Pack (`data/world/authored.json`, `data/catalog/*.json`):**
  All league names (Brenmoor League, Brenmoor Championship), all 26 club names, grounds, mottoes, histories, and culture cards, and all 60 player and staff names and career records are original fictional creations authored for this project. No real football league, club, player, or sponsor data or trademarks are used.
- **Generated Portraits and Club Crests (`data/catalog/media/people/*.webp`, `data/catalog/media/crests/*.webp`):**
  All 60 fictional person portraits and 20 fictional club crests were generated for this project using Google Gemini image generation, explicitly excluding real likenesses and third-party heraldry.

---

## 2. Third-Party Open-Source Software

### Python Dependencies (`services/agents`)

| Package | License | Repository / Source |
| :--- | :--- | :--- |
| `agent-framework-core`, `agent-framework-openai` (Microsoft Agent Framework) | MIT | https://github.com/microsoft/agent-framework |
| `fastapi` | MIT | https://github.com/fastapi/fastapi |
| `uvicorn` | BSD-3-Clause | https://github.com/encode/uvicorn |
| `pydantic` | MIT | https://github.com/pydantic/pydantic |
| `openai` | Apache-2.0 | https://github.com/openai/openai-python |
| `httpx` | BSD-3-Clause | https://github.com/encode/httpx |
| `pytest`, `pytest-asyncio` | MIT / Apache-2.0 | https://github.com/pytest-dev/pytest |

### Node.js and Web Dependencies (`apps/api`, `apps/web`)

| Package | License | Repository / Source |
| :--- | :--- | :--- |
| `fastify` | MIT | https://github.com/fastify/fastify |
| `react`, `react-dom` | MIT | https://github.com/facebook/react |
| `lucide-react` | ISC | https://github.com/lucide-icons/lucide |
| `typescript` | Apache-2.0 | https://github.com/microsoft/TypeScript |
| `vite`, `vitest` | MIT | https://github.com/vitejs/vite |
| `@testing-library/react`, `@testing-library/user-event`, `jsdom` | MIT | https://github.com/testing-library/react-testing-library |

### Architecture diagrams

The standalone diagrams in `docs/architecture/` embed the Archify 3.2.0 viewer. Archify is distributed under Apache-2.0; its license and notice are included alongside the diagrams. The embedded JetBrains Mono font includes its own SIL Open Font License notice in the generated HTML. Source: https://github.com/tt-a1i/archify.

