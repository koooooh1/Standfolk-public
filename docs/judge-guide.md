# Judge Guide — Testing Standfolk

This guide walks judges through testing the live Azure deployment and reproducing every claim in the pitch and demo video in under five minutes.

---

## 1. Live Demo Access

- **Public Demo URL:** https://standfolk-web.wonderfulocean-6cd9ec2b.northeurope.azurecontainerapps.io
- **Credentials required:** None. Every feature is open to judges without sign-in.
- **Cold-start note:** Both Azure Container Apps (`standfolk-web` and `standfolk-agents`) run on a consumption plan (`minReplicas: 0`, `maxReplicas: 1`) to stay inside the free grant through judging (10 November 2026). **If the app has been idle, the first page load or first live agent call may take ~20 seconds** while the container starts. Subsequent requests respond in milliseconds (templates) or 1–3 seconds (live agent workflow).

---

## 2. Five-Minute Judging Walkthrough

### Step 1 — Synthetic Match Replay, Build-up Chains, and Offside Retraction (Watch)

1. Open the demo URL without a `mode` query parameter and choose **Enter Fan matchday**. The Fan workspace opens on **Watch → Summary** for Matchday 9 of the fictional Brenmoor League: **Vellmouth Rovers vs Kestrin Athletic** (scenario seed `42`). Its top-level navigation is Watch, Stories, Players, and Table; Studio is not listed.
2. Click **Summary** under the replay bar and drag the match clock slider (or press **Play**):
   - **`12:00` (12′):** Youngho Go opens the scoring (`1 – 0`). Notice the deterministic build-up chain on the key moment: **`3 passes, 65 m`**.
   - **`38:00` (38′):** Rui Calado equalises for Kestrin Athletic (`1 – 1`, `3 passes, 58 m`).
   - **`54:00` (54′):** Theo Marlow's 52nd-minute goal stands provisionally (`2 – 1`). No future correction leaks before 55′.
   - **`55:00` (55′):** The 52nd-minute goal is retracted on receipt (`Disallowed (Offside in the build-up)`), and the score returns to **`1 – 1`**.
   - **`66:00` (66′):** Sol Navarro scores (`2 – 1`, `2 passes, 54 m`).
   - **`90:00` (Full-time):** The **Full-time recap** banner appears above Key moments, summarising the `2 – 1` result, scorers, the 52′ offside disallowance, and total attempts (`20`).

### Step 2 — Discover: Player Journeys, Club Culture, and League Basics

1. Click **Youngho Go** on the pitch (in **Line-ups**) or in **Key moments** to open the right-hand **Side Panel**.
2. Inspect his pronunciation guide (`YUNG-hoh GOH`, native spelling `고영호`), senior career timeline, loan spell (with unavailable lower-tier stats explicitly explained rather than shown as zero), and South Korea national-team record.
3. Click the **Vellmouth Rovers** crest in the header to inspect club history, honours, fan culture (the north-stand harbour bell tradition), and fan glossary terms.
4. Click the **Table** tab in the match header to view the 20-club Brenmoor League standings, how promotion/relegation works, the football glossary, and the world-pack data date (`1 October 2026`).

### Step 3 — Workspace, Language, and Explanation Depth

1. Open a fresh tab at the demo URL without a `mode` query parameter and choose **Open Broadcast Studio**. Studio is the Broadcast home screen, with the queue visible on entry and a separate navigation structure.
   - Open **Match monitor** to see the **Say it** line-up lens and broadcast facts (pronunciation, sourced notes, and terms to use).
   - Fan navigation is focused on Watch, Stories, Players, and Table; Broadcast navigation is focused on production, match monitoring, and league context. Both use the same match stream.
   - Switch **Explanation depth** to **Detailed**: key moments in Summary expand to show the full passer sequence (e.g. `Rosk → Hale → Go`).
   - Switch **Language** to **Korean**: key headings, moment stories, and the full-time recap switch to Korean. (Switch back to **English** before Step 4.)

### Step 4 — Multi-Agent Orchestration, Claim Gate, Recovery Demo, and On-Air Overlay (Studio)

1. Select **Studio** (the Broadcast home screen) and set the replay slider to **`20:00`** (or **`90:00`**).
2. **Inspect Multi-Agent Steps:** Each goal and substitution up to the clock appears in the **Story queue**, drafted by the Python Microsoft Agent Framework service (`Researcher` → `Writer` → `Reviewer`). Expand or read the agent step trail under a card.
3. **Trigger the Scripted Recovery Beat (`Show recovery (demo)`):**
   - Click **Show recovery (demo)** on Youngho Go's 12′ goal card.
   - Watch the real Reviewer catch two scripted wrong-figure drafts (`14th minute` and `16th minute` instead of `12th`), reject both (`Failed the number and name check: the number 14 is not in the evidence`), and fall back safely to the verified template (`0 model calls`).
4. **Test the Unsafe-Approval Gate:**
   - In the `Long copy` box of the 12′ goal card, type an unsupported claim such as `Youngho Go scored his 9th goal.`
   - Notice **Approve** is disabled until the edit is checked. Click **Check edit**: the server blocks it (`Blocked: the figure 9 is not in the evidence.`).
5. **Approve and Take to Air:**
   - Change the copy to a valid supported sentence (e.g. `Youngho Go scored for Vellmouth Rovers in the 12th minute, set up by Callum Hale.`), click **Check edit**, click **Approve** (`Approved · v1`), and click **Take to air**.
   - Inspect the **Overlay preview** and expand **Overlay JSON** (validated against `docs/schemas/overlay.schema.json`).
   - Set the replay slider to **`15:00`** and switch to **Match monitor**: the approved story is live in the **On air** lower-third banner!
   - *(Bonus)* If you air Theo Marlow's 52′ goal and move the clock from `54:00` to `55:00`, the lower-third is automatically pulled from the screen when the offside retraction arrives.

---

## 3. Running Locally (Clean Checkout Reproduction)

Prerequisites: **Node.js 22.13+** (tested on Node 22 and 24) and **Python 3.12**.

```bash
# 1. Install JavaScript dependencies
npm install

# 2. (Optional) Set up the Python agent service virtual environment
python3 -m venv services/agents/.venv
services/agents/.venv/bin/pip install -r services/agents/requirements.txt -r services/agents/requirements-dev.txt

# 3. Run all offline verification checks (15 world + 91 API + 13 web + build)
npm run verify
services/agents/.venv/bin/pytest services/agents

# 4. Start the local stack (agents on :8001, API on :3001, web on :5173)
npm run dev
```

Without a `MODEL_API_KEY` in `.env`, the entire application runs deterministically using verified templates and the scripted recovery demonstration.

---

## 4. Rate Limits, Budget, and Known Boundaries

- **Guaranteed fallback:** When the daily budget is exhausted or the model provider times out, every endpoint still returns 200 with the verified deterministic template (`engine: "template"`), labelled honestly in Studio.
