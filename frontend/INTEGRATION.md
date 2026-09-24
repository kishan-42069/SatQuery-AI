# Frontend ↔ Backend integration

How the Next.js app in `frontend/` talks to the FastAPI service in `app/`, and
what the backend still needs for the UI to be fully functional.

## Running the two together

```bash
# terminal 1 — API (needs Postgres + Redis up)
uvicorn app.main:app --reload --port 8000

# terminal 2 — the query worker. Without this, queries sit in the Redis
# queue forever and the UI shows "queued" until it times out.
python -m app.workers.query_worker

# terminal 3 — frontend
cd frontend
npm install
npm run dev
```

Point the frontend at the API with `frontend/.env.local`:

```
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

It defaults to `http://localhost:8000`, so this is only needed if the API runs
elsewhere. The frontend origin must also appear in the API's `ALLOWED_ORIGINS`
or every request fails CORS preflight:

```
ALLOWED_ORIGINS=["http://localhost:3000"]
```

## How the query flow works

`POST /sessions/{id}/queries` returns `202` and a `query_id` — the analysis
runs in the Redis-queued worker, not in the request. The frontend therefore
tracks a run two ways at once:

| Channel | Role |
|---|---|
| `GET .../queries/{qid}/status` | **Authoritative.** Polled on a backoff schedule until `completed` / `failed`. |
| `WS /sessions/{id}/ws` | **Live texture.** Streams orchestrator trace events for the Agent Activity panel. |

The socket is not authoritative: Redis pub/sub has no replay, so a socket that
connects late misses everything already published. It does short-circuit the
poll interval when it sees `worker_completed`, which is what makes the UI feel
immediate. If the socket never connects, the Agent Activity panel says
`Polling — trace socket unavailable` rather than silently pretending to stream.

On `completed`, the frontend reads `result.run_id` and fetches
`GET /workflows/{run_id}` for findings, confidence and bounding boxes.

## What was added to the backend

**`GET /assets/{asset_id}/preview`** (`app/routers/assets.py`)

`generate_rgb_preview()` already existed in `app/geospatial/preview_generator.py`
but nothing called it, and no route served image bytes — so the frontend had no
way to display imagery at all. The new endpoint wraps the existing converter:

- Renders the source raster to 8-bit RGB PNG (the existing 2–98 % percentile
  stretch, so 16-bit optical and float SAR both come out viewable).
- Caches to `data/derived/{asset_id}_{max}.png`, regenerating only when the
  source file is newer than the cached PNG.
- `?max=` controls the long edge (256–4096, default 1024).

No other backend behaviour was changed.

## Backend issues the frontend has to work around

These are real bugs, not preferences. Worth fixing before the demo.

### 1. `GET /workflows/{run_id}` throws on every call

`app/routers/workflows.py` constructs findings like this:

```python
FindingResponse(
    label=f.label,
    confidence=f.confidence,
    evidence_refs=f.evidence_refs,
    geometry=None,
)
```

But `FindingResponse` (in `app/schemas/workflows.py`) **requires** `finding_id`
and `workflow`, and has no `geometry` field at all. Every call to this endpoint
raises a `ValidationError`. Since it's the only source of findings and bounding
boxes, the results panel and the detection overlay stay empty until it's fixed.

Fix — pass the fields the schema declares:

```python
FindingResponse(
    finding_id=f.finding_id,
    workflow=run.workflow,
    label=f.label,
    confidence=f.confidence,
    evidence_refs=f.evidence_refs,
    bounding_boxes=f.geometry,   # once geometry is serialised
)
```

The same construction appears in `list_runs_for_query`, and
`store_workflow_result` builds `FindingResponse` objects too.

### 2. Bounding boxes are never persisted

Both `store_workflow_result` and `get_workflow_result` set
`geometry=None` with a `# Simplified for MVP` comment. Until real geometry is
stored and returned, findings have no `bounding_boxes` and nothing can be drawn
on the imagery — the run will report a confident answer with no visual evidence
to check it against, which is the one thing the PRD says the product must not do.

The viewer already handles both coordinate spaces once the data arrives:
`BoundingBox.crs = null` is read as source-image pixels, and a set `crs` is
projected through the asset's own bbox.

### 3. Silent field drops from router/schema drift

Several handlers pass fields their response model doesn't declare, so Pydantic
drops them before serialising:

| Endpoint | Passed but not declared |
|---|---|
| `POST /sessions/` | `query_count`, `referenced_asset_ids`, `conversation_history` |
| `GET /sessions/{id}` | `conversation_history` |
| `GET .../queries/{qid}/status` | `text`, `asset_ids`, `created_at` |

Nothing errors — the fields just never arrive. The frontend keeps its own copy
of the prompt text rather than relying on the status echo, but conversation
history can't be shown at all until `SessionInfoResponse` declares it.

### 4. `GET /assets/{id}` returns placeholder metadata

`get_asset` returns `bbox=None`, `width=0`, `height=0`, `band_count=0` with a
`# Mocking for now` comment, and `list_assets` does the same. The values are
extracted correctly at upload time but only `crs` is persisted on the model.

Consequences in the UI: dimensions and band count read as "Not read", and
**pixel-space bounding boxes cannot be placed at all**, because placing them
needs `width`/`height`. Georeferenced boxes need `bbox`, which requires reading
the PostGIS geometry back via `ST_AsGeoJSON`.

Persisting `width`, `height`, `band_count` and `file_size_bytes` on `ImageAsset`
would fix all of it.

### 5. `.env` is committed with live-looking secrets

`SECRET_KEY` and `OPENAI_API_KEY` are in the repo, which is public. Rotate both,
then:

```bash
git rm --cached .env
echo ".env" >> .gitignore
git mv .env .env.example   # keep the template, drop the values
```

Rotating matters more than removing — the key is already in the git history and
in anyone's clone.

## Frontend structure

```
src/
  app/
    page.tsx              3D hero (unchanged)
    (app)/
      layout.tsx          shared chrome + scroll container
      analyze/            single-image workspace
      compare/            bi-temporal change detection
      reports/            run history + export
  lib/api/
    types.ts              mirrors app/schemas/*.py — keep in sync
    client.ts             fetch wrapper, ApiError, WS + export URL helpers
    endpoints.ts          one function per route
  hooks/
    useAnalysisSession.ts session + submit + WS trace + poll + findings
    useAssets.ts          catalogue + upload
  components/app/         nav, viewer, composer, trace, results, primitives
```

`lib/api/types.ts` is the contract. When a Pydantic schema changes, change that
file in the same commit — everything else is typed through it.

## Design tokens

The analysis screens reuse the hero's CSS variables (`--ink-primary`,
`--accent`, `--hairline`, `--font-serif-display`) and add opaque surface tokens
the hero didn't need (`--surface`, `--page-canvas`, `--brand-deep`,
`--brand-rule`). Both light and dark are defined, so the hero's theme toggle
carries across all screens.

One change to shared CSS: `overflow: hidden` was removed from `body`. The hero
clips its own canvas and the app shell owns its own scroll container, so
neither screen depends on a global scroll lock. The hero is unaffected.
