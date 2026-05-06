# 🔬 Generative API Workbench — Full Technical Breakdown

> A deep-dive into every component of the hackathon project: what was built, how it works, which technologies were used, and why each decision was made.

---

## 📐 High-Level Architecture (3 Layers)

```
┌─────────────────────────────────────────────────────┐
│  LAYER 1 — Presentation (chat-ui)                  │
│  Angular 17 SPA  ·  Tailwind CSS  ·  TypeScript    │
│  User types NLQ prompt → sends to backend          │
└───────────────────────┬─────────────────────────────┘
                        │  HTTP POST /v1/workbench/query/execute
                        ▼
┌─────────────────────────────────────────────────────┐
│  LAYER 2 — Orchestration (FastAPI backend)         │
│  ┌──────────────┐    ┌──────────────┐              │
│  │ LLM Planner  │───▶│  Executor    │              │
│  │ (OpenAI GPT) │    │  (Python)    │              │
│  └──────────────┘    └──────┬───────┘              │
│                             │                       │
│  API Registry (OpenAPI spec parsed on startup)      │
└─────────────────────────────┼───────────────────────┘
                              │  HTTP calls (httpx)
                              ▼
┌─────────────────────────────────────────────────────┐
│  LAYER 3 — Data (Source APIs + MySQL RDS)          │
│  FastAPI mock servers  ·  AWS RDS MySQL             │
│  /clients  /deals  /trades  /compliance/exposures  │
│  /kyc/profiles  /aml/alerts                        │
└─────────────────────────────────────────────────────┘
```

**Key Principle:** Data is NEVER copied or warehoused. It stays at the source (MySQL RDS). The orchestration layer fetches, joins, filters, and aggregates it **in-memory in Python**, then returns the result. This is the Data Virtualization approach.

---

## 🗂️ Complete File-by-File Breakdown

---

### BACKEND — `working_latest 1/generativeapi/`

---

#### `app/main.py` — FastAPI Entry Point & API Gateway

**Purpose:** The application entry point. Defines all HTTP endpoints and wires all layers together.

**Key logic:**
```python
@app.on_event("startup")
async def startup():
    openapi = load_openapi_yaml("data/capital_markets_wealth_openapi.yaml")
    REGISTRY.register_from_openapi(openapi)
```
On startup, it **automatically parses the OpenAPI YAML** and loads all API endpoints into the in-memory Registry. No manual configuration needed.

**The main query endpoint:**
```
POST /v1/workbench/query/execute
```
Flow inside this endpoint:
1. Receives `{ role, user_prompt }` from the UI
2. Calls `build_plan_with_openai()` → sends prompt to GPT → gets back a JSON execution plan
3. Calls `execute_plan()` → runs the plan step by step against real source APIs
4. Returns `{ execution_plan, result: { rows }, trace }` back to the UI

**Other endpoints:**
- `GET /health` — simple health check
- `POST /v1/registry/register` — shows registered tools count
- `GET /v1/registry/tools` — lists all discovered API tools

**Technology:** FastAPI (Python) + Uvicorn ASGI server
**Why FastAPI?** Async-first (important for concurrent API calls), auto-generates OpenAPI docs, Pydantic validation built-in, very fast.

---

#### `app/planner_openai.py` — The LLM Planner Agent 🧠

**Purpose:** This is the most important and clever file. It is the brain of the system.

**What it does:**
- Takes the user's natural language prompt + the list of available API tools (from the registry) + technical docs
- Sends all of this to GPT-4o-mini
- Gets back a **structured JSON execution plan** with steps like FETCH_DATA, FILTER, JOIN, AGGREGATE

**The SYSTEM_PROMPT is a masterpiece of prompt engineering.** It does the following:

1. **Constrains tool names** — the LLM can only output `clients_api`, `deals_api`, `trades_api`, `compliance_api`, `research_api`. Nothing else.

2. **Defines strict step formats** — each step type (FETCH_DATA, FILTER, JOIN, AGGREGATE, SORT, LIMIT) has a rigid JSON schema the LLM must follow.

3. **Teaches ordering rules** — the prompt explicitly tells the LLM:
   > "If your plan contains a JOIN, ALL FILTER steps must come ONLY AFTER the JOIN."
   This is because FETCH_DATA replaces the current dataset. If you filter before fetching the second dataset, the filter is lost.

4. **Prevents hallucination of field names** — it lists exact valid field names like `aumUsd`, `exposureAmountUsd`, `dealValueUsd` and says "DO NOT INVENT FIELDS".

5. **Handles the AUM duplication problem** — a subtle data engineering issue: if you JOIN clients with deals before summing AUM, every client's AUM gets duplicated per deal row. The prompt explicitly tells the LLM to avoid this.

6. **Chained JOIN support** — teaches how to join 3+ datasets by chaining JOIN steps using `left_tool/right_tool` for first join, then `tool` for subsequent joins on the current result.

**The LLM call:**
```python
resp = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": json.dumps({
            "role": role,
            "user_prompt": user_prompt,
            "available_tools": swagger_tools,
            "technical_docs": technical_docs[:12000]
        })}
    ],
    temperature=0   # ← deterministic output, no creativity
)
```
`temperature=0` ensures the LLM always produces the same plan for the same query (reproducible, reliable).

**Example: User says "List deals for high-risk clients"**
The LLM produces:
```json
{
  "role": "Sales",
  "goal": "List deals for high-risk clients",
  "tools": ["clients_api", "deals_api"],
  "steps": [
    { "type": "FETCH_DATA", "tool": "clients_api", "action": "clients_list", "params": {} },
    { "type": "FETCH_DATA", "tool": "deals_api", "action": "deals_list", "params": {} },
    { "type": "JOIN", "left_tool": "clients_api", "right_tool": "deals_api", "on": ["clientId"] },
    { "type": "FILTER", "params": { "field": "riskRating", "op": "eq", "value": "HIGH" } }
  ]
}
```

**Technology:** OpenAI Python SDK v1.x (`openai==1.57.2`)
**Model used:** `gpt-4o-mini` (via a custom Brain AI OpenAI-compatible proxy endpoint)
**Why GPT-4o-mini?** Cost-effective, fast, and the highly constrained system prompt means you don't need the most powerful model.

---

#### `app/executor.py` — The Plan Executor ⚙️

**Purpose:** Receives the JSON plan from the planner and executes it step-by-step against real source APIs. This is the Data Virtualization engine.

**State management:** The executor maintains two data structures:
- `datasets` — a dictionary keyed by tool name, storing fetched rows: `{"clients_api": [...], "deals_api": [...]}`
- `current` — the "working dataset" that is modified by each step

**Step execution logic:**

| Step Type | What happens |
|-----------|-------------|
| `FETCH_DATA` | Makes an HTTP GET call to the source API, stores rows in `datasets[tool]` and also sets `current = rows` |
| `FILTER` | Calls `apply_filter(current, field, op, value)` — filters rows in-memory |
| `JOIN` | Calls `join_on_keys(left_rows, right_rows, keys)` — in-memory hash join |
| `AGGREGATE` | Calls `aggregate_rows(current, group_by, metrics)` — group-by with sum/count |
| `SORT` | Calls `sort_rows(current, sort_by, order)` — Python sorted() |
| `LIMIT` | Simple Python slice: `current = current[:limit]` |

**Resilience features:**
- Handles multiple LLM output format variations (e.g., `filter`, `criteria`, `params.field`) — the LLM sometimes outputs slightly different formats, so the executor handles all variants
- Alias map for tool names: `"deals"` → `"deals_api"`, `"compliance"` → `"compliance_api"` etc.
- The sort step auto-converts `sum(exposureAmountUsd)` → `sum_exposureAmountUsd` (the actual output column name from AGGREGATE)

**Tracing:** Every step is logged to a `trace` object:
```json
{
  "api_calls": [{"tool": "clients_api", "operationId": "clients_list", "rows": 150}],
  "steps": [{"type": "JOIN", "keys": ["clientId"], "rows": 320}],
  "execution_time_ms": 438
}
```
This trace is returned to the UI and shown to the user (transparency into what happened).

**HTTP calls:** Uses `httpx` (async HTTP client) to call source APIs with Bearer token auth pulled from `.env`.

---

#### `app/operations.py` — Core Data Operations Library

**Purpose:** Pure Python implementation of JOIN, FILTER, AGGREGATE, SORT — the actual data virtualization operations.

**`join_on_keys()` — LEFT JOIN implementation:**
```python
# Index right table by join key for O(1) lookups
idx = {}
for rr in right_rows:
    k = tuple(rr.get(x) for x in keys)
    idx.setdefault(k, []).append(rr)

# For each left row, find matching right rows
for lr in left_rows:
    k = tuple(lr.get(x) for x in keys)
    matches = idx.get(k, [])
    for rr in matches:
        merged = dict(lr)  # start from left
        for rk, rv in rr.items():
            if rk in keys: merged[rk] = rv
            elif rk in merged and merged[rk] != rv:
                merged[f"right_{rk}"] = rv  # conflict: prefix with right_
            else:
                merged[rk] = rv
        out.append(merged)
```
This is a **hash join** — it indexes the right dataset once, then does O(1) lookups per left row. Very efficient for in-memory data.

**`apply_filter()` — supports 5 operators:**
- `eq` — exact match
- `in` — value in a list
- `gt` / `lt` — numeric comparison (uses `float()` conversion)
- `contains` — case-insensitive substring search

**`aggregate_rows()` — GROUP BY with metrics:**
- Groups rows into a dictionary keyed by the group_by tuple
- Supports `sum(fieldName)` → output column `sum_fieldName`
- Supports `count(fieldName)` → output column `count_fieldName`
- Uses `_to_float()` helper to safely handle MySQL `Decimal` types

**`sort_rows()` — handles None values gracefully:**
```python
sorted(rows, key=lambda r: (r.get(sort_by) is None, r.get(sort_by)), reverse=reverse)
```
None values are always sorted last (the `is None` part returns True=1 which sorts after False=0).

---

#### `app/registry.py` — API Registry (Auto-Discovery)

**Purpose:** Parses the OpenAPI YAML on startup and builds an index of all available API tools.

**Key logic:**
```python
def _build_tools(self, endpoints):
    tools = {}
    for ep in endpoints:
        tag = (ep.get("tags") or ["misc"])[0].lower()
        tool_name = f"{tag}_api"           # e.g., "clients" → "clients_api"
        tools.setdefault(tool_name, []).append(ep)
    return tools
```

It groups endpoints by their OpenAPI `tags` field and creates tool groups like `clients_api`, `deals_api`, etc. This tool map is what gets sent to the LLM as "available tools".

`find_operation(operation_id)` is used by the executor to look up the HTTP path/method for a given `operationId` like `clients_list`.

**Key advantage:** No hardcoded API lists. As long as you register a new API via OpenAPI spec, it automatically appears as a tool the LLM can use.

---

#### `app/llm_client.py` — LLM Client Factory

**Purpose:** Creates and returns an OpenAI client instance using environment variables.

Uses a **custom base URL** (`OPENAI_BASE_URL=https://brain-api.bounteous.tools/ai/v1`) — this is an OpenAI-compatible proxy provided by the hackathon organizer (Bounteous/Brain AI), not the actual OpenAI endpoint. This means the team used a managed LLM gateway rather than direct OpenAI API access.

---

#### `app/schemas.py` — Pydantic Request/Response Models

**Purpose:** Defines the data contracts for HTTP API.

Key models:
- `QueryRequest` — `{ role: str, user_prompt: str, context: dict }` — what the frontend sends
- `RegisterResponse` — what the `/register` endpoint returns
- `AuthConfig`, `EndpointDefinition` — for manual API registration (future extensibility)

**Technology:** Pydantic v2 (built into FastAPI)
**Why Pydantic?** Auto-validates incoming JSON, gives clear error messages if wrong data is sent, generates JSON Schema automatically.

---

#### `app/models.py` — SQLAlchemy ORM Models

**Purpose:** Defines the database table structure for the workbench's own registry storage (future use — not yet actively used by the main query flow).

Tables: `api_sources`, `api_endpoints`

**Technology:** SQLAlchemy 2.x
**Why this is there:** The original design planned for a persistent API registry in MySQL. In the hackathon, they used in-memory registry from YAML instead, so this is partially implemented.

---

#### `app/openapi_loader.py` & `app/docs_store.py` — File Loaders

Simple utilities:
- `load_openapi_yaml()` — reads and parses the YAML spec file using PyYAML
- `load_technical_docs()` — reads the `TECHNICAL_DOCS.md` markdown file as plain text, which gets appended to the LLM context

---

#### `mock_source_api.py` — Simulated Source APIs (Port 9090)

**Purpose:** A standalone FastAPI server that acts as the "enterprise data systems" — simulates what would, in a real bank, be separate microservices for clients, deals, compliance, KYC, AML.

**Data Models (SQLAlchemy mapped to AWS RDS MySQL):**
- `Client` — clientId, name, segment, region, riskRating, aumUsd
- `Deal` — dealId, clientId, sector, region, status, stage, productType, dealValueUsd
- `ComplianceExposure` — exposureId, clientId, region, riskCategory, exposureAmountUsd
- `KycProfile` — kycId, clientId, kycStatus, riskRating, pepFlag, sanctionsHit, jurisdiction...
- `AmlAlert` — alertId, clientId, alertType, severity, status

**Endpoints:**
- `GET /clients` → `{ items: [...], pagination: { nextCursor: null } }`
- `GET /deals` → same pattern
- `GET /compliance/exposures` → same
- `GET /kyc/profiles` → same
- `GET /aml/alerts` → same

All return the `{ items: [] }` envelope. The executor handles this: `if "items" in data: return data["items"]`.

**Technology:** FastAPI + SQLAlchemy async (`aiomysql`) + AWS RDS MySQL
**Why async SQLAlchemy?** The source API server uses `AsyncSession` to handle concurrent requests without blocking, critical for performance under load.

---

#### `data/capital_markets_wealth_openapi.yaml` — The API Contract

**Purpose:** A hand-crafted OpenAPI 3.0.3 spec describing all 9 endpoints across 5 domains. This is what gets parsed by the Registry and also shared with the LLM planner.

**Domains covered:**
- **Clients** — `/clients`, `/clients/{clientId}`
- **Deals** — `/deals`, `/deals/{dealId}`
- **Trades** — `/trades`
- **Compliance** — `/compliance/exposures`, `/compliance/alerts`, `/kyc/profiles`, `/aml/alerts`
- **Research** — `/research/market-snapshot`

All endpoints use Bearer JWT authentication (`bearerAuth`).

**Why OpenAPI?** Industry standard. Any real bank already has Swagger/OpenAPI for its APIs. The workbench can plug into existing enterprise APIs by simply loading their spec.

---

#### `data/TECHNICAL_DOCS.md` — LLM Context Document

**Purpose:** A markdown file loaded into the LLM's context on every request (first 12,000 chars). It tells the LLM:
- Tool naming conventions
- Canonical join keys (`clientId` is the universal FK)
- Recommended execution patterns for common query types
- Allowed filter values (regions, risk ratings, deal statuses)
- Role-based governance rules (Sales vs. Compliance vs. Research access)

This is essentially **in-context RAG** — instead of a vector database, they prepend a curated doc to every prompt. Simple but effective for a hackathon.

---

#### `seed_mysql_data.py` — Database Seeder

A utility script (not part of the main app) that populates the AWS RDS MySQL database with realistic fake data for the demo — clients, deals, compliance exposures, KYC profiles, AML alerts.

---

### FRONTEND — `chat-ui 1/chat-ui/`

---

#### Technology Stack

| Technology | Version | Role |
|-----------|---------|------|
| Angular | 17.3 | SPA Framework |
| TypeScript | 5.4 | Language |
| Tailwind CSS | 3.4 | Styling |
| RxJS | 7.8 | Reactive state |
| Angular Signals | 17.x | Reactive state management |
| Angular HttpClient | 17.x | HTTP calls to backend |

**Why Angular?** The team was clearly already familiar with Angular. It provides strong TypeScript support, dependency injection, and a component model suitable for a chat-style app.

---

#### `app/chat.service.ts` — The Core Service

**Purpose:** Handles all state management and backend communication.

**State (Angular Signals):**
```typescript
private _chats = signal<Chat[]>([]);
private _currentChatId = signal<string | null>(null);
private _isLoading = signal<boolean>(false);
```
Angular 17 Signals are used instead of RxJS BehaviorSubject — this is modern Angular reactive state. Signals are synchronous and simpler than observable chains.

**Key interfaces:**
```typescript
interface Message {
  id, content, role: 'user' | 'assistant',
  timestamp, data?, columns?, trace?, chartType?, isError?
}
interface ExecutionTrace {
  api_calls: [{tool, operationId, rows}],
  steps: [{type, rows, ...}],
  execution_time_ms: number
}
```

**`sendMessage()` flow:**
1. Adds user message to chat immediately (optimistic UI update)
2. Sets `isLoading = true`
3. Calls `executeQuery()` → HTTP POST to backend
4. On success: `createResponseMessage()` processes the response
5. Generates natural language summary + determines chart type
6. Adds AI response to chat

**Natural Language Summary generation:**
```typescript
private generateNaturalLanguageSummary(rows, columns, trace): string {
    // "I found 25 results for your query."
    // "Key Insights: Total Exposure Amount Usd: $12.5M, Avg $500K"
    // "Query executed in 438ms across 2 API calls."
}
```
The frontend generates its own NLQ summary from the structured data — it doesn't ask the LLM for a summary. This keeps it fast and deterministic.

**Chart type selection:**
```typescript
private determineChartType(rows, columns): 'table' | 'bar' | 'none' {
    // Uses bar chart if: ≤20 rows + has numeric column + has label column
    // Otherwise uses table
}
```

**Default role is hardcoded to `"Sales"`** — this is a limitation noted in the code comment `// Default role, can be made dynamic`.

---

#### `app/app.component.ts` — The UI Controller

**Purpose:** Controls the chat UI — sidebar, message display, formatting.

**Key features:**
- `getChartData()` — extracts label/value pairs for bar chart rendering (looks for columns containing 'name', 'client', 'sum', 'amount', 'value', 'count')
- `formatCellValue()` — smart number formatting: `≥1M → "$12.5M"`, `≥1K → "$125.5K"`
- `formatColumnName()` — converts `camelCase`/`snake_case` to "Title Case" for table headers
- `formatMessageContent()` — converts Markdown bold (`**text**`) to HTML `<strong>` tags
- Auto-scroll to bottom after every new message

---

## 🔄 Complete End-to-End Data Flow

```
User types: "Show compliance exposure by region for high-risk clients"
     │
     ▼ [Angular chat.service.ts]
HTTP POST /v1/workbench/query/execute
{ role: "Sales", user_prompt: "...", context: {} }
     │
     ▼ [FastAPI main.py]
load_technical_docs() → 3.5KB markdown context
     │
     ▼ [planner_openai.py]
GPT-4o-mini receives:
  - SYSTEM_PROMPT (step rules, format constraints)
  - user payload: { role, user_prompt, available_tools, technical_docs }

GPT returns JSON plan:
{
  "steps": [
    { type: "FETCH_DATA", tool: "compliance_api", action: "compliance_exposures_list" },
    { type: "FETCH_DATA", tool: "clients_api", action: "clients_list" },
    { type: "JOIN", left_tool: "compliance_api", right_tool: "clients_api", on: ["clientId"] },
    { type: "FILTER", params: { field: "riskRating", op: "eq", value: "HIGH" } },
    { type: "AGGREGATE", group_by: ["region"], metrics: ["sum(exposureAmountUsd)"] }
  ]
}
     │
     ▼ [executor.py]
Step 1: GET http://localhost:9090/compliance/exposures → 200 rows
Step 2: GET http://localhost:9090/clients → 150 rows
Step 3: Hash JOIN on clientId → 200 merged rows
Step 4: FILTER riskRating == "HIGH" → 67 rows
Step 5: AGGREGATE by region, sum(exposureAmountUsd) → 3 rows:
  [
    { region: "APAC", sum_exposureAmountUsd: 45200000 },
    { region: "EMEA", sum_exposureAmountUsd: 32100000 },
    { region: "AMERICAS", sum_exposureAmountUsd: 19800000 }
  ]
     │
     ▼ [FastAPI → HTTP Response]
{ execution_plan: {...}, result: { rows: [3 rows] }, trace: { ...timing... } }
     │
     ▼ [Angular chat.service.ts]
createResponseMessage():
  → summary: "I found 3 results. Key Insights: Total Sum Exposure: $97.1M. Executed in 512ms across 2 API calls."
  → chartType: "bar" (3 rows, has sum_ column, has region)
     │
     ▼ [Angular UI]
Renders: summary text + bar chart + data table
```

---

## 🛠️ Technology Summary Table

| Layer | Technology | Version | Why Used |
|-------|-----------|---------|----------|
| Frontend Framework | Angular | 17.3 | Team familiarity, strong TypeScript, component model |
| Frontend Styling | Tailwind CSS | 3.4 | Rapid UI development with utility classes |
| Frontend State | Angular Signals | 17.x | Modern reactive state without RxJS complexity |
| Backend Framework | FastAPI | 0.128 | Async, auto-docs, Pydantic validation, fast |
| ASGI Server | Uvicorn | 0.30.6 | High-performance async server for FastAPI |
| LLM Orchestration | OpenAI Python SDK | 1.57.2 | Talk to GPT-4o-mini via compatible API |
| LLM Model | GPT-4o-mini | latest | Cost-effective, fast, sufficient with constrained prompts |
| HTTP Client (backend) | httpx | 0.27.2 | Async HTTP for calling source APIs |
| YAML Parsing | PyYAML | 6.0.2 | Parse OpenAPI spec |
| ORM | SQLAlchemy | 2.x | Database models + async MySQL queries |
| Database Driver | aiomysql | 0.2+ | Async MySQL driver for source API server |
| Database | AWS RDS MySQL | — | Managed cloud DB for realistic data |
| Data Format | OpenAPI 3.0.3 | — | Industry standard API contract |
| Env Management | python-dotenv | 1.0.1 | Load .env configs safely |

---

## 💡 Key Technical Advantages

### 1. Zero-Copy Data Virtualization
Data never lands in a central warehouse. The orchestration layer fetches live data from source APIs, runs operations in Python memory, and discards it. This means:
- Always real-time (no stale reports)
- No storage cost
- Governance stays at the source

### 2. OpenAPI-Driven Auto-Discovery
By parsing the OpenAPI YAML on startup, the system automatically discovers all available APIs. Adding a new API = adding it to the YAML. No code changes needed.

### 3. Deterministic LLM Planning (temperature=0)
Setting `temperature=0` makes the LLM's output deterministic. Same question always produces the same plan. This is critical for reliability in enterprise contexts.

### 4. Structured Prompt Engineering as "Code"
The `SYSTEM_PROMPT` in `planner_openai.py` is effectively a **domain-specific language specification** for the LLM. It:
- Defines valid operation types (like a grammar)
- Specifies field names (like a schema)
- Teaches ordering rules (like an algorithm specification)
- Prevents common LLM mistakes (field hallucination, wrong JOIN order)

### 5. In-Memory Hash Join
The `join_on_keys()` function uses a hash index (`dict` keyed by join key tuple) rather than nested loops. This gives O(n+m) performance instead of O(n×m), which is important when joining 200-row datasets.

### 6. Execution Trace for Auditability
Every query returns a full trace: which APIs were called, how many rows each step produced, and total execution time. This directly supports the governance requirement described in the project pitch.

### 7. Multi-Format LLM Output Tolerance
The executor handles multiple JSON formats the LLM might produce (e.g., `filter.field` vs `filter.params.field` vs `filter.criteria`). This makes the system resilient to minor LLM output variations.

---

## ⚠️ Known Limitations & Hackathon Trade-offs

| Limitation | Detail |
|-----------|--------|
| Role hardcoded to "Sales" | `chat.service.ts` always sends `role: "Sales"`. No role selector in UI. |
| No authentication on frontend | The Angular app has no login. Role-based data governance is defined in docs but not enforced in code. |
| In-memory operations only | All JOIN/FILTER/AGGREGATE happen in Python memory. For very large datasets (millions of rows), this would OOM. |
| No pagination loop | The executor fetches max 200 rows per API call and doesn't loop on `nextCursor`. |
| Duplicate RegisterRequest schema | `schemas.py` defines `RegisterRequest` twice (lines 30–34 and 63–66) — a cleanup oversight. |
| Single OpenAPI file | Only one YAML spec is supported. Multi-source registration is designed but not fully implemented. |
| No persistent chat history | Chat sessions exist only in Angular memory (Signals). Refresh = lost history. |

---

## 🏆 What Makes This Impressive for a Hackathon

1. **Full vertical stack** — from NLQ typed in a browser, through an LLM, through live API calls, to a rendered table and bar chart. End-to-end working demo.

2. **Real database** — AWS RDS MySQL with seeded realistic financial data (not just hardcoded mock JSON).

3. **Sophisticated prompt engineering** — the `SYSTEM_PROMPT` handles complex edge cases like JOIN ordering, AUM duplication, and 3-dataset chaining. This represents genuine domain-specific ML engineering.

4. **Domain accuracy** — the data model (clients, deals, trades, KYC, AML, compliance exposure) maps to real capital markets / investment banking data structures. Not a generic e-commerce demo.

5. **Execution trace** — built-in observability. Every result shows how many API calls were made and in how long. This is a real enterprise requirement that was actually implemented.
