# GramAgent AI

GramAgent is an independent decision-support application alongside Village 360°. Existing fieldwork screens and database records remain intact. The new Village 360 route exposes only scoped, consenting, verified household aggregates; GramAgent never writes source records.

## Start locally

Requirements: Python 3.12+, Node 22.12+, npm. Commands below start at the repository root.

```sh
npm ci
python3.12 -m venv .venv
.venv/bin/pip install -r gramagent/api/requirements.lock.txt
cp gramagent/.env.example gramagent/.env
```

Edit `gramagent/.env`: choose a random JWT secret of at least 32 characters and a unique bootstrap administrator password of at least 16 characters. Do not commit secrets. For development, a persistent SQLite database is used when `GRAM_MONGO_URI` is empty.

Start the API and worker in separate terminals, both from `gramagent/` so they read the same configuration and data directory:

```sh
cd gramagent
PYTHONPATH=api ../.venv/bin/uvicorn gramagent.main:app --host 127.0.0.1 --port 8000
```

```sh
cd gramagent
PYTHONPATH=api ../.venv/bin/python -m gramagent.worker
```

Start the interface from the repository root:

```sh
npm run dev:gramagent
```

Open http://localhost:5174 and sign in with the configured bootstrap account. Remove the bootstrap password from the environment after first setup. The first administrator can add other users and assign villages. Local login tokens expire after two hours and are invalidated on logout or account deactivation.

For a credential-free data demonstration, open **Village 360° connection → Load demonstration** after signing in. The supplied fixture is visibly labelled synthetic throughout the application and exported reports. It is not Athipalayam survey data.

## Working flow

1. Create a village and import aggregate observations, or load synthetic observations.
2. Inspect Data quality and resolve missing denominators, duplicates, stale or unverified observations.
3. Run an analytical assessment to calculate evidence-based findings and reproducible screening priorities.
4. Optionally enter the eight human-assessed priority criteria and source-backed cost items. Start a new assessment to capture these inputs in an immutable plan.
5. Configure a model provider and choose AI mode for solution generation, student projects and independent narrative verification.
6. Review the complete plan and record approval or rejection. The decision is bound to the plan hash. Approval records a plan for monitoring; no money is moved or intervention executed.
7. Enter observed baseline, target and current indicators on an approved plan, and export reports.

## What operates without paid services

Authentication, all navigation, role/village permissions, JSON/CSV/XLSX import, PDF text staging, quality checks, deterministic diagnosis and prioritisation, manual budget input, persistent LangGraph workflow, human review, measurements, scenarios, local scheme retrieval and PDF/Excel/CSV export work locally. SQLite is a development persistence option, not an Atlas emulator.

AI generation and the assistant are unavailable until a real model is configured. Empty AI sections explicitly explain this. Analytical mode does not pretend that AI recommendations were generated.

## Model providers

Set `GRAM_MODEL_PROVIDER=openai` and `OPENAI_API_KEY`, or `GRAM_MODEL_PROVIDER=gemini` and `GOOGLE_API_KEY`. Set `GRAM_MODEL_NAME` to a model available in your account that supports structured output and tool calling. The application does not hardcode a model name. Models receive aggregate evidence, not raw household records.

The orchestrator selects available sectors and allowed tools for the objective. Scheme retrieval and budgeting run concurrently. Structured solution and student agents feed planning. A critic checks references and, in AI mode, reviews narrative claims. Failed verification routes back to the solution agent, with a maximum of three verification passes. Persistent checkpoints support human interruption and recovery. The assistant selects from two read-only, organisation-scoped tools with a bounded loop.

Model generation is nondeterministic even at low temperature. Human review remains necessary. Unit tests use isolated test doubles for provider failure and correction; live provider acceptance requires configured credentials.

## Village 360 integration

The inspected source version is recorded in the implementation notes. The added source route is:

`GET /api/gramagent/v1/snapshots/:village`

Configure the existing Express backend with:

- `GRAMAGENT_READ_TOKEN`: dedicated random token, at least 32 characters.
- `GRAMAGENT_VILLAGE_IDS`: comma-separated source village ObjectIds explicitly permitted for export.
- `GRAMAGENT_MIN_SAMPLE`: optional minimum aggregate cell size, never below five.

Configure GramAgent with the corresponding `GRAM_VILLAGE360_URL` and `GRAM_VILLAGE360_TOKEN`. The user interface accepts a source village ID but never accepts arbitrary remote URLs or source credentials. REST reads consenting `Verified` household observations and exports six mapped indicators with conservative source dates. Small denominators, small adverse cells and small complements are suppressed. If all cells are suppressed, import reports an explicit validation error rather than treating absence as zero.

Alternatively configure `GRAM_VILLAGE360_MONGO_URI` using a database user restricted to the source database's **read** role. The adapter only performs aggregate reads. Credential permissions must be enforced by MongoDB. Never use the source URI as `GRAM_MONGO_URI`.

The current adapter maps water unavailability, toilet absence, electricity absence, unavailable school/healthcare access and internet absence. Other sectors can be supplied through the documented aggregate import contract; extending the native adapter requires field-specific review. Fieldwork targets are never imported as observed statistics.

## Aggregate import contract

Download the template in the interface. Each observation contains:

- `indicator`, `sector`, `value` (nullable), `denominator` (nullable but greater than zero when present), `unit` (`count`, `percent`, `INR`, `days`), `adverse`.
- `source`, `source_date`, `verified`.
- Optional paired `latitude`/`longitude`, only with `public_location=true` for public infrastructure.

Unexpected fields are rejected. Files are limited to 5 MB and 5,000 observations. Excel expanded content is limited to 50 MB. PDFs are limited to 100 pages and staged for human mapping; OCR and automatic numeric extraction are not represented as working features. Source files are not retained; content checksums and normalised observations preserve provenance. Importing identical content is idempotent.

## Calculations

- Supplied-field completeness = non-null values / supplied observations × 100. This is not total village survey coverage.
- Screening priority = observed adverse prevalence × weight + source freshness × weight. Freshness = max(0,100 × (1 − age_days/730)). Missing denominators or unverified evidence leave the finding unranked.
- Human MCDA supports severity, people affected, urgency, social impact, vulnerable population, feasibility, cost effectiveness and data reliability. Scores are 0–100 and require a human rubric/evidence. Weights sum to one. Missing values are excluded with visible weight coverage; severity and reliability are mandatory.
- Estimate = quantity × unit price × (1 + contingency/100). Unknown costs remain unknown.
- Scenario units = min(floor(budget/unit price), months × monthly capacity). Potential coverage assumes distinct beneficiaries and is explicitly hypothetical.
- Target progress = (current − baseline)/(target − baseline) × 100. Zero target difference returns unavailable. Values may exceed 100% or be negative and are not silently clamped.
- No overall development-readiness score is invented. Its approved rubric remains an organisational decision.

## Scheme knowledge and RAG

Authorised reviewers enter official HTTPS `gov.in` or `nic.in` sources, eligibility, assistance, documents, procedure, department and a verification date. Retrieval excludes unreviewed sources and those older than 180 days. Local retrieval uses TF-IDF. For Atlas Vector Search, configure `GRAM_VECTOR_INDEX` and `GRAM_EMBEDDING_MODEL` with OpenAI embedding credentials. Use the index definition in `atlas-vector-index.json`; set its dimensions to the selected embedding model. Existing documents must be reimported to generate embeddings after enabling vector search.

A retrieved match indicates potential relevance only. The system does not determine welfare eligibility. Official URL and last verified date remain attached to results. No seeded scheme facts are presented as current government policy.

## Roles

| Role | Permissions |
| --- | --- |
| Super administrator | Organisation-wide administration, villages, users, evidence and approval |
| Panchayat officer | Assigned villages: evidence, schemes, runs, approvals and monitoring |
| College administrator / Faculty / Field coordinator | Assigned villages: imports, assessment, costs and monitoring; no plan approval |
| Student team | Assigned villages: evidence and plans; no mutations |
| Public viewer | Assigned villages: approved project summaries only |

Accounts are private by default; there is no open self-registration. Local password accounts implement the requested JWT authentication. If your organisation requires identity federation, MFA or self-service password recovery, integrate its identity provider before broad rollout.

## Production deployment

1. Provision a dedicated MongoDB database and least-privilege credentials. Set `GRAM_ENVIRONMENT=production`, `GRAM_MONGO_URI`, a strong JWT secret and the exact frontend HTTPS origin.
2. Build `gramagent/api/Dockerfile` from the repository root. Run an API service and one or more worker services from the same image and environment. Use managed secrets, TLS termination, ingress limits and service monitoring. Do not expose MongoDB publicly.
3. Build the frontend with `VITE_API_URL=https://your-api-host/api/v1`. On Vercel choose `gramagent/web` as the root and use its included configuration. Do not set private provider or database credentials as `VITE_` variables.
4. Run `docker compose -f gramagent/compose.yaml up --build` for the API/worker pair where Docker is available. The example binds the API to localhost; configure an HTTPS reverse proxy for external access.
5. Workers claim queued runs atomically and renew three-minute leases every 20 seconds. Expired leases are returned to the queue and execution resumes from checkpoints. Use a gateway rate limiter for multi-instance API deployments; the built-in limiter is per-process.
6. Create the administrator, then remove bootstrap credentials. Configure the source adapter separately and verify it against a non-production village.
7. Back up the entire GramAgent database, including LangGraph checkpoint and write collections. Test restoring into an isolated environment before relying on backups. Restore SQLite development databases only while API/worker are stopped; preserve both records and checkpoint files.

API reference: `/docs` (interactive OpenAPI) and `/openapi.json`. The repository includes an exported OpenAPI schema. Health check: `/api/v1/health`. It reports service configuration, not provider connectivity.

## Retention and audit

Preview maintenance with `python -m gramagent.retention`; use `--apply` only after reviewing the configured retention period. This removes old staged PDF text and old login sessions. Baselines, approval records and audit history are retained because deleting them would break plan provenance. Agree an archival policy with the data owner before production. Audit records are append-only through application routes; database-level immutable archival is an operational control.

## Verification

```sh
PYTHONPATH=gramagent/api .venv/bin/python -m pytest gramagent/api/tests -q
npm test
npm run build
npm run build:gramagent
```

Browser verification instructions and results are recorded in `verification.md`. Live Atlas, real source synchronisation, provider calls and cloud deployments require your service configuration and are not implied by local passing tests.

## Language and accessibility

Navigation, overview headings and common form labels, actions and report selectors support English/Tamil through a local translation dictionary. Source evidence, generated reports, detailed explanatory copy and some dynamic messages retain their source language; terminology review remains necessary for a Tamil-only deployment. Keyboard labels, visible focus, a skip link, reduced motion, responsive navigation, dark mode and explicit error/empty states are implemented.
