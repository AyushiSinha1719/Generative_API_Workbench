# 🎯 Interview Q&A — Generative API Workbench

> All questions and answers are written from your perspective as a team member who understands the project deeply. Answers are structured to be spoken in interviews — clear, confident, and technically precise.

---

## 📋 CATEGORY 1: Project Overview & Problem Statement

---

### Q1. Tell me about your hackathon project in 2 minutes.

**A:**
> "We built the **Generative API Workbench** — a platform that lets non-technical business users like Sales, Compliance, and Research teams query data across multiple enterprise APIs using plain English, instead of writing SQL or calling APIs manually.
>
> The core problem we solved is **data silos** in large organizations. Teams have data spread across separate systems — clients in one API, deals in another, compliance exposure in another — and combining them traditionally requires an analyst or BI developer. That's slow and expensive.
>
> Our solution has three layers: a **chat UI** where users type questions like 'Show compliance exposure by region for high-risk clients', an **LLM Planner Agent** that converts that question into a structured execution plan with steps like FETCH, JOIN, FILTER, AGGREGATE, and a **Data Virtualization layer** that executes those steps by calling real source APIs in real-time and combining the results in-memory.
>
> The biggest technical achievement is that data never moves to a central warehouse — it stays at the source, so governance and security stay intact."

---

### Q2. What problem were you solving and why is it important?

**A:**
> "Enterprises face three interconnected problems. First, **data silos** — departments own their data and isolate it. Second, **high cost of BI tools** — enterprise BI like Tableau or Power BI costs $125,000+ per year on average and still requires pre-built dashboards. Third, **analyst overload** — any ad-hoc question that falls outside a pre-built report requires an analyst, creating backlogs.
>
> Our workbench addresses all three. It doesn't require moving data to a central store, it doesn't require a BI license, and it doesn't require an analyst for every question. A Sales manager can type 'List open deals above $10M in APAC for high-risk clients' and get an answer in under a second."

---

### Q3. What is Data Virtualization and how did you implement it?

**A:**
> "Data virtualization means providing a unified view of data from multiple sources **without physically moving or copying it**. The data stays at its source — in our case, different microservice APIs backed by a MySQL database — and we query it on-demand when a user asks a question.
>
> Our implementation works like this: when a user submits a query, we call the relevant source APIs using HTTP (via the `httpx` library), fetch the raw JSON responses, and then perform JOIN, FILTER, and AGGREGATE operations **in-memory in Python**. The result is returned to the user immediately. Nothing is stored in our backend. This is pure data virtualization — the orchestration layer is stateless with respect to data."

---

### Q4. Who is the target audience and why those specific teams?

**A:**
> "We specifically targeted **Sales, Compliance, and Research** teams because they suffer the highest friction from data silos.
>
> **Sales** needs to combine client risk ratings with deal pipelines to prioritize accounts — data that sits in two different systems.
>
> **Compliance** needs to cross-reference client KYC profiles, AML alerts, and exposure amounts — again, three separate systems.
>
> **Research** needs aggregated trade data with market snapshots — yet another combination.
>
> All three teams currently either wait for analyst support or struggle with Swagger documentation. Our NLQ interface makes them self-sufficient."

---

## 🏗️ CATEGORY 2: System Design

---

### Q5. Walk me through your system architecture.

**A:**
> "The architecture has three layers, each with a clear responsibility.
>
> **Layer 1 — Presentation:** An Angular 17 Single Page Application. The user types a natural language query in a chat interface. The Angular service sends this as a POST request to our backend.
>
> **Layer 2 — Orchestration:** A FastAPI Python backend running on port 8000. It has two sub-components: the LLM Planner, which uses GPT-4o-mini to convert the user's query into a structured JSON execution plan, and the Executor, which runs that plan step by step.
>
> **Layer 3 — Data:** A separate FastAPI server on port 9090 that acts as the source API, backed by AWS RDS MySQL. This simulates enterprise microservices for clients, deals, trades, compliance, KYC, and AML data.
>
> The result flows back up through all layers — the executor returns structured rows, the backend returns them with a trace, and the frontend renders them as a table and bar chart."

---

### Q6. Why did you choose a separate mock source API instead of querying the database directly?

**A:**
> "This was a deliberate architectural decision that mirrors real-world enterprise environments. In an actual bank or enterprise, you don't have direct database access. You consume data through APIs — REST or GraphQL. The API is the contract.
>
> By building a separate source API server, we replicated this reality. Our orchestration layer only knows about HTTP endpoints, not database schemas. This means if tomorrow the clients data moved to a different database or cloud provider, our workbench doesn't care — as long as the API contract (the OpenAPI spec) stays the same.
>
> It also cleanly separates concerns: the source API handles authentication, rate limiting, and data access control. The workbench handles orchestration and query planning."

---

### Q7. How does your system handle multiple data sources?

**A:**
> "The API Registry is the key. On startup, we parse an OpenAPI YAML file that describes all available APIs. The registry groups endpoints by their tag — so `Clients`, `Deals`, `Compliance` become `clients_api`, `deals_api`, `compliance_api` respectively.
>
> The LLM Planner receives this full tool map as part of its context, so it knows exactly which tools exist and what operations each supports. The executor then looks up the HTTP path and method for any `operationId` it needs to call.
>
> To add a new data source, you just add its endpoints to the OpenAPI YAML — no code changes. That's true extensibility."

---

### Q8. What is the role of the OpenAPI/Swagger specification in your system?

**A:**
> "The OpenAPI spec plays three roles simultaneously in our system.
>
> First, **discovery** — on startup, we parse it to auto-discover all available API tools and their operation IDs.
>
> Second, **LLM context** — the tool map derived from the spec is sent to the LLM planner so it knows what APIs exist. This replaces what would otherwise be hardcoded tool lists.
>
> Third, **routing** — when the executor needs to call `clients_list`, it looks up the spec to find the path is `/clients` and the method is `GET`.
>
> The beautiful thing is that OpenAPI is already an industry standard. Any enterprise that already has Swagger docs for their APIs can plug directly into our workbench."

---

### Q9. How do you ensure the system is secure?

**A:**
> "We implemented several security measures. Source API calls use Bearer token authentication — the token is pulled from environment variables, never hardcoded. The CORS middleware is configured to control which origins can call the backend.
>
> The technical documentation we give to the LLM includes role-based access rules — for example, Sales users should not see raw compliance alerts, only aggregates. In 5 the current implementation this is enforced at the planning level through the LLM prompt.
>
> For production, we'd add API Gateway-level enforcement, proper JWT validation per user role, and field-level masking for sensitive data like client names in Compliance reports. The architecture is designed to accommodate these additions."

---

### Q10. Why FastAPI over Django or Flask?

**A:**
> "Three main reasons.
>
> **Async first** — FastAPI is built on ASGI and supports `async/await` natively. Since our executor makes multiple HTTP calls to source APIs, being able to await those calls without blocking is critical for performance.
>
> **Auto-validation** — Pydantic models give us automatic request/response validation. If the frontend sends a malformed request, FastAPI rejects it with a clear error without us writing any validation code.
>
> **Speed** — FastAPI benchmarks faster than both Django and Flask because of Starlette's ASGI foundation. For a demo where latency matters, this was important."

---

## 🤖 CATEGORY 3: LLM / AI / Prompt Engineering

---

### Q11. How does the LLM Planner Agent work?

**A:**
> "The planner is the brain of the system. It receives three inputs: the user's role (Sales, Compliance, Research), their natural language query, and a map of available API tools derived from the OpenAPI spec.
>
> We send this to GPT-4o-mini with a carefully engineered system prompt that constrains the LLM to output only valid JSON following a specific schema. The LLM performs **task decomposition** — it breaks the user's intent into a sequence of discrete steps: FETCH_DATA, FILTER, JOIN, AGGREGATE, SORT, LIMIT.
>
> The output is a JSON execution plan that the executor can run deterministically. The LLM's job ends there — all actual data processing is done in Python, not by the LLM."

---

### Q12. What is prompt engineering and how did you apply it in this project?

**A:**
> "Prompt engineering is the practice of crafting LLM instructions — the system prompt — to reliably produce outputs that meet your requirements. It's the difference between a useful LLM integration and an unpredictable one.
>
> In our project, the system prompt is approximately 300 lines and does several things: it defines a grammar of valid step types, specifies exact JSON schemas for each step, teaches the LLM ordering rules (like all FILTERs must come after JOINs), lists valid field names to prevent hallucination, and handles edge cases like the AUM duplication problem.
>
> The key insight is that the LLM is not doing data processing — it's doing **query planning**. We push all computation to Python where we have full control. The LLM just needs to produce a valid plan."

---

### Q13. Why did you set temperature=0? What does it mean?

**A:**
> "Temperature controls randomness in LLM output. At temperature=1, the model samples from a probability distribution and gives varied responses. At temperature=0, it always picks the highest-probability token — making output deterministic.
>
> We set temperature=0 because we need the LLM to produce the **same execution plan every time for the same query**. If a Sales manager asks 'List open deals in APAC' on Monday and again on Friday, they should get the same query plan, just with potentially different data from the source APIs. Determinism is a requirement for an enterprise tool, not a nice-to-have."

---

### Q14. How did you prevent LLM hallucinations in your system?

**A:**
> "We used several techniques.
>
> **Schema constraints** — the system prompt defines exact schemas for every step type. The LLM can't invent new step types because the executor simply ignores unknown types.
>
> **Valid value lists** — we explicitly listed valid field names (`aumUsd`, `exposureAmountUsd`, `dealValueUsd`) and told the LLM 'DO NOT INVENT FIELDS'.
>
> **Valid tool names** — we restricted tool names to exactly five: `clients_api`, `deals_api`, `trades_api`, `compliance_api`, `research_api`.
>
> **Alias map in executor** — even if the LLM outputs `deals` instead of `deals_api`, the executor has a fallback alias map to correct it.
>
> **Temperature=0** — removes randomness, reducing hallucination probability.
>
> The combination of a tightly constrained prompt and a resilient executor that handles format variations covers most failure modes."

---

### Q15. What is Task Decomposition and why is it important here?

**A:**
> "Task decomposition is the ability to break a complex user intent into a sequence of smaller, executable steps. In our context, when a user asks 'Show compliance exposure by region for high-risk clients', the LLM must decompose this into:
> 1. Fetch compliance exposures
> 2. Fetch clients
> 3. JOIN on clientId
> 4. FILTER where riskRating == HIGH
> 5. AGGREGATE by region, sum exposureAmountUsd
>
> Without decomposition, you'd need to either write custom code for every possible query type (infinitely scalable problem) or ask the LLM to also process the data (expensive and unreliable). Our architecture uses the LLM only for the decomposition and then executes the plan in deterministic Python — best of both worlds."

---

### Q16. Explain the JOIN ordering rule in your system prompt. Why is it critical?

**A:**
> "This is one of the most nuanced parts of the design. In our executor, `FETCH_DATA` always replaces the 'current' working dataset — it's stateful. FILTER always operates on the current dataset.
>
> If the LLM generated a plan like: fetch clients → filter HIGH risk → fetch deals → JOIN... the filter applied to clients would be lost because the second FETCH_DATA call replaces `current` with deals data.
>
> The correct order is: fetch all required datasets → JOIN them → then filter the joined result. The system prompt makes this explicit with a 'HARD RULE' and shows a working example vs a wrong example side by side. We spent significant time on this because early LLM outputs were generating plans in the wrong order, and results were silently wrong — no error, just incorrect data."

---

### Q17. What model did you use and why GPT-4o-mini specifically?

**A:**
> "We used GPT-4o-mini via an OpenAI-compatible proxy provided by the hackathon organizer. We chose mini over the full GPT-4o for two reasons: cost and speed.
>
> Because our system prompt is so tightly constrained — basically a domain-specific grammar — the model doesn't need to be the most intelligent one. It just needs to follow instructions reliably and format JSON correctly. GPT-4o-mini handles this well at a fraction of the cost and with lower latency.
>
> In fact, using a more powerful model here would be wasteful. The heavy lifting is done by our Python operations code, not the LLM."

---

### Q18. What is in-context learning and how does your technical docs feature use it?

**A:**
> "In-context learning is when you provide examples, rules, or reference material inside the prompt itself, rather than through model fine-tuning. The model uses this context to respond more accurately without any training.
>
> In our system, we load a `TECHNICAL_DOCS.md` file on every request and inject it into the LLM's user message. This document contains tool naming conventions, canonical join keys, recommended query patterns, and role-based access rules.
>
> This is a simple form of **Retrieval Augmented Generation (RAG)** — except instead of a vector database, we prepend a curated markdown document. For a hackathon with a small, well-defined domain, this is more reliable than vector search and avoids the infrastructure overhead of maintaining embeddings."

---

## ⚙️ CATEGORY 4: Backend & Python

---

### Q19. Explain the flow when the `/v1/workbench/query/execute` endpoint is called.

**A:**
> "When the POST request arrives at `main.py`:
> 1. The request is validated by Pydantic against the `QueryRequest` schema — role, user_prompt, optional context.
> 2. Technical docs are loaded from disk (TECHNICAL_DOCS.md).
> 3. `build_plan_with_openai()` is called — this is async and awaited. It sends the prompt to GPT and returns a parsed JSON plan.
> 4. `execute_plan()` is called — also async and awaited. It loops through the plan steps and executes them.
> 5. The response is assembled: `{ execution_plan, result: { rows }, trace }` and returned as JSON.
>
> If any step throws an exception, the `try/except` block catches it and returns an HTTP 400 with the error detail. The traceback is also printed server-side for debugging."

---

### Q20. How does the hash join work in your operations.py?

**A:**
> "Our join implementation is a classic hash join in two phases.
>
> **Build phase:** We iterate over the right dataset and build a dictionary indexed by the join key tuple. For example, if joining on `clientId`, the key is `(clientId_value,)`. This is O(n) where n is the size of the right table.
>
> **Probe phase:** For each row in the left dataset, we compute its join key tuple and do a dictionary lookup — O(1). If matches exist, we merge the left row with each matching right row.
>
> During merge, we start from the left row and copy right-side fields, but if a field name conflicts (both left and right have `region` for example, with different values), we prefix the right-side value with `right_` to avoid overwriting.
>
> Total complexity is O(n+m) which is far better than a nested loop join at O(n×m)."

---

### Q21. Explain how AGGREGATE is implemented.

**A:**
> "Aggregate groups rows by a combination of fields and computes metrics for each group.
>
> We use a Python dictionary where the key is a tuple of the group-by field values. For example, grouping by `region` might give keys like `('APAC',)`, `('EMEA',)`, `('AMERICAS',)`.
>
> For each row, we compute its group key, then accumulate the metrics. We support two metric functions: `sum(fieldName)` which adds numeric values using a safe float conversion (handling MySQL Decimal types), and `count(fieldName)` which increments a counter if the field is not None.
>
> The output column names are `sum_fieldName` and `count_fieldName` — using underscore instead of parentheses so they're valid JSON keys.
>
> A key design decision was the `_to_float()` helper function which safely handles MySQL's `Decimal` type, regular `int`, `float`, and even numeric strings — because MySQL SQLAlchemy returns Decimal objects, not plain floats."

---

### Q22. Why did you use httpx instead of the standard `requests` library?

**A:**
> "The `requests` library is synchronous — it blocks the thread while waiting for an HTTP response. Since our FastAPI backend is async (ASGI), using a blocking library inside an async handler would defeat the purpose of async — it would block the event loop.
>
> `httpx` is the async-first HTTP client for Python. Using `async with httpx.AsyncClient()` and `await client.get()` allows FastAPI to handle other requests while waiting for the source API to respond. This is critical for performance when multiple users are querying simultaneously."

---

### Q23. What is Pydantic and why is it used here?

**A:**
> "Pydantic is a Python library for data validation using type annotations. FastAPI uses it automatically for request and response models.
>
> In our project, when the frontend sends a POST request with `{ role, user_prompt }`, FastAPI automatically validates it against the `QueryRequest` Pydantic model. If `role` is missing, FastAPI returns a 422 error with a clear explanation — without us writing any validation code.
>
> We also use Pydantic for the `RegisterResponse` model which ensures the `/register` endpoint always returns the exact fields the frontend expects. This contract enforcement is especially valuable in a team setting where frontend and backend developers work in parallel."

---

### Q24. What does `@app.on_event("startup")` do and why did you use it?

**A:**
> "It's a FastAPI lifecycle hook that runs code once when the application starts, before handling any requests. We used it to parse the OpenAPI YAML file and populate the in-memory API Registry.
>
> This is the right place to do this because: it runs exactly once (no wasteful re-parsing per request), it fails fast if the YAML file is missing (the app won't start), and the populated Registry singleton is available to all request handlers immediately.
>
> Note: in newer FastAPI versions, `@app.on_event` is deprecated in favor of `lifespan` context managers. In a production upgrade, we'd migrate to that pattern."

---

## 📊 CATEGORY 5: Data Engineering Concepts

---

### Q25. Explain the difference between FILTER, JOIN, and AGGREGATE in your system.

**A:**
> "These are the three core data operations and they serve distinct purposes.
>
> **FILTER** narrows down rows based on a condition on a single field. For example, keep only rows where `riskRating == 'HIGH'`. It reduces row count, doesn't change columns.
>
> **JOIN** combines rows from two different datasets based on a shared key. For example, combining client records (with riskRating) and deal records (with dealValueUsd) using their shared `clientId`. It can change both row count (matching rows only if doing inner join) and column count (fields from both sides merge).
>
> **AGGREGATE** groups rows and computes summary metrics. For example, group by `region` and compute `sum(exposureAmountUsd)` per region. It drastically reduces row count to one row per unique group and replaces detail columns with metric columns.
>
> In a typical complex query, you'd do JOIN first to bring data together, FILTER to narrow scope, then AGGREGATE to summarize."

---

### Q26. What is an inner join vs left join? Which did you implement?

**A:**
> "An inner join returns only rows that have a match in both datasets. A left join returns all rows from the left dataset, even if there's no match in the right — the right-side fields would just be null.
>
> We implemented something closer to an inner join actually — if a left row has no matching right row, we `continue` and skip it. This was a pragmatic choice: in our domain, every deal has a valid clientId that exists in the clients table. For our hackathon demo data, this works correctly.
>
> In production, we'd want to expose join type as a parameter in the plan schema — `join_type: 'inner' | 'left'` — and handle the left join case by returning the left row with null values for right-side fields."

---

### Q27. What was the AUM duplication problem and how did you solve it?

**A:**
> "This is a subtle but real data engineering issue. AUM (Assets Under Management) is a client-level metric — one value per client. But when you JOIN clients with deals, each client appears once per deal. So if a client has 5 deals, their AUM appears 5 times in the joined result.
>
> If you then do `sum(aumUsd)`, you get 5× the actual AUM. This is data duplication leading to incorrect aggregation.
>
> We solved this through prompt engineering. The system prompt explicitly tells the LLM: 'If the user asks for top clients by AUM, do NOT join with deals. Just SORT by aumUsd and LIMIT.' And if deal count is also needed, include aumUsd in the group_by (not sum it) and only count deals. This way AUM is passed through as-is, not re-summed."

---

### Q28. How did you handle data type inconsistencies from MySQL?

**A:**
> "MySQL's SQLAlchemy ORM returns `DECIMAL` columns as Python `Decimal` objects — not plain floats. Python's built-in `+` and comparison operators work differently on Decimal vs float.
>
> We wrote a `_to_float()` helper in `operations.py` that handles: None (returns 0.0), int/float (converts directly), Decimal (converts with `float()`), and even numeric strings (strips whitespace and parses). Every metric accumulation goes through this function.
>
> This prevents TypeErrors during aggregation and ensures consistent numeric behavior regardless of the data source's storage type."

---

## 🖥️ CATEGORY 6: Frontend / Angular

---

### Q29. What is Angular Signals and why did you use it instead of RxJS?

**A:**
> "Angular Signals, introduced in Angular 16 and stabilized in 17, are a new reactive primitive. A Signal holds a value and automatically tracks who reads it, then notifies them when the value changes.
>
> Compared to RxJS Observables and BehaviorSubjects: Signals are simpler to write, synchronous, don't require `.subscribe()` / unsubscribe management, and don't risk memory leaks from forgotten subscriptions.
>
> We used Signals for `_chats`, `_currentChatId`, and `_isLoading`. The component template automatically re-renders when these signals change. For a chat application where state updates happen in response to user actions, Signals are cleaner."

---

### Q30. How does the frontend determine whether to show a bar chart or a table?

**A:**
> "The `determineChartType()` method in `chat.service.ts` applies three conditions to decide on a bar chart: the result must have 20 or fewer rows (a chart with 200 bars is useless), the result must have at least one numeric column that's not an ID field (something to chart), and it must have a label column (a name or identifier column to label the bars).
>
> If all three are true, it shows a bar chart using CSS percentage widths. Otherwise it shows a table.
>
> For example, 'Compliance exposure by region' returns 3 rows (APAC, EMEA, AMERICAS) with a numeric `sum_exposureAmountUsd` column — perfect for a bar chart. But 'List all clients' returns 150 rows with many columns — better as a table."

---

### Q31. How does the frontend generate natural language summaries without calling the LLM again?

**A:**
> "The frontend's `generateNaturalLanguageSummary()` method generates the summary entirely in TypeScript from the structured data — no LLM call.
>
> It calculates: row count for the headline ('I found 25 results'), then for each numeric column (up to 3), it computes total, average, max, and min and formats them as sentences. It also appends execution metadata from the trace object: 'Query executed in 438ms across 2 API calls.'
>
> This is faster, cheaper, and more reliable than asking the LLM to summarize — the LLM might hallucinate or change numbers. Here, the numbers come directly from the data."

---

### Q32. What is the role of the `ExecutionTrace` in your architecture?

**A:**
> "The trace is the observability layer. Every time a query runs, the backend builds a trace object that records: which API was called with which operationId and how many rows it returned, what step types were applied (FILTER removed 83 rows, JOIN produced 200 rows, AGGREGATE reduced to 3 rows), and total execution time in milliseconds.
>
> The frontend receives this trace and shows it in the summary: 'Query executed in 512ms across 2 API calls.' This serves two purposes: transparency for the user (they can see what the system did), and auditability for compliance — a requirement explicitly mentioned in the project brief."

---

## 🗄️ CATEGORY 7: Database & Infrastructure

---

### Q33. Why AWS RDS MySQL? What are its advantages for this use case?

**A:**
> "We chose AWS RDS MySQL for several reasons. RDS provides managed MySQL — no need to install, patch, backup, or monitor the database ourselves, which was important during a hackathon where time is limited.
>
> MySQL is the most widely used relational database in enterprises, familiar to the team, and well-supported by SQLAlchemy. The `aiomysql` driver provides async connectivity which pairs well with our FastAPI source API server.
>
> The RDS instance in `ap-south-1` (Mumbai) region was provided by the hackathon organizers. In production, we'd want connection pooling, read replicas for scaling, and proper VPC security group configurations."

---

### Q34. What is SQLAlchemy and what are ORM models?

**A:**
> "SQLAlchemy is Python's most popular database toolkit. It has two layers: the Core (SQL expression language) and the ORM (Object-Relational Mapper).
>
> The ORM lets you define Python classes that map to database tables. In our `mock_source_api.py`, we have classes like `Client`, `Deal`, `ComplianceExposure` — each attribute maps to a database column. You query using Python objects instead of writing raw SQL strings.
>
> For example, `select(Client).limit(200)` generates `SELECT * FROM clients LIMIT 200`. The ORM handles SQL generation, parameterization (preventing SQL injection), and object hydration.
>
> We use SQLAlchemy 2.x's newer mapped_column syntax with type annotations — `Mapped[str]`, `Mapped[Optional[float]]` — which makes column types explicit and editor-friendly."

---

### Q35. What is async SQLAlchemy and why does it matter?

**A:**
> "Standard SQLAlchemy uses blocking database calls — the Python thread waits while the database query executes. This blocks the entire async event loop in a FastAPI/ASGI application.
>
> Async SQLAlchemy uses `AsyncSession` and `await` keywords. The database query is non-blocking — while waiting for MySQL to respond, the event loop can handle other requests.
>
> We use `create_async_engine` with the `aiomysql` driver (the async MySQL connector). Within our source API endpoints:
> ```python
> async with SessionLocal() as session:
>     res = await session.execute(select(Client).limit(200))
> ```
> This is correct async usage — it doesn't block the event loop."

---

## 🤝 CATEGORY 8: Behavioral / HR Questions

---

### Q36. What was your specific contribution to this project?

**A:**
> *(Tailor this based on what you actually did. Here's a framework for multiple scenarios:)*
>
> **If you worked on the backend:**
> "My main contribution was the backend orchestration layer — specifically the executor and the operations library. I implemented the in-memory hash join algorithm, the filter operators, and the aggregate function with grouping. I also worked on making the executor resilient to different LLM output formats."
>
> **If you focused on prompt engineering:**
> "I was responsible for the LLM planner prompt engineering. The most challenging part was identifying and fixing the JOIN ordering bug — early plans filtered before joining, silently producing wrong results. I designed the 'HARD RULE' in the prompt and tested it across all our query types to ensure correct plan generation."
>
> **If you worked on the frontend:**
> "I built the Angular chat interface — the chat service with signal-based state management, the bar chart rendering using CSS, the natural language summary generation from structured data, and the table display with smart number formatting."

---

### Q37. What was the biggest technical challenge and how did you overcome it?

**A:**
> "The biggest challenge was making the LLM output reliable and consistent. Initially, the LLM would sometimes output FILTER steps before JOIN steps, producing silently wrong results — no errors, just incorrect data. There was also the problem of the LLM inventing field names that didn't exist.
>
> We addressed this through an iterative prompt engineering process. First, we identified all failure modes by running 20+ test queries. Then we added explicit rules to the system prompt for each failure mode, with examples of correct vs wrong plans. Finally, we made the executor resilient to minor format variations.
>
> The key lesson was: you can't just tell the LLM what you want — you have to teach it all the ways it can go wrong and explicitly forbid them."

---

### Q38. How did you manage team collaboration during the hackathon?

**A:**
> "We divided responsibilities by layer. One sub-team worked on the backend orchestration (planner and executor), another on the source API and data seeding, and another on the Angular frontend. We defined API contracts early — the request/response schema for `/v1/workbench/query/execute` — so teams could work in parallel without blocking each other.
>
> We used Git for version control and kept the `main` branch stable, doing feature work on branches. Daily syncs helped us catch integration issues early."

---

### Q39. What would you do differently if you had more time?

**A:**
> "Several things. First, I'd implement proper role-based access control — currently the role is hardcoded to 'Sales' in the frontend. The plan schema and technical docs define role-based rules but they're not enforced in code.
>
> Second, I'd add pagination support — currently we fetch max 200 rows per API. For large datasets, we'd need to loop on `nextCursor`.
>
> Third, I'd replace in-context RAG with proper vector search using embeddings, so users could register any technical document and the system would retrieve only the relevant portions per query.
>
> Fourth, I'd add user session management and persistent chat history in a database."

---

### Q40. How does this project demonstrate understanding of enterprise software requirements?

**A:**
> "Several design decisions reflect enterprise thinking. We chose data virtualization over ETL because enterprises can't easily move data out of regulated systems. We built an OpenAPI-driven registry because enterprises already have Swagger docs for their APIs. We included an execution trace because compliance teams need auditability. We designed role-based access rules because data governance is non-negotiable in financial services.
>
> The domain choice itself — capital markets, KYC, AML, compliance exposure — demonstrates understanding of where data silo problems are most severe and most costly."

---

## 🔥 CATEGORY 9: Advanced / Tricky Questions

---

### Q41. How would you scale this system to handle 10,000 concurrent users?

**A:**
> "The current architecture has several scaling bottlenecks. First, in-memory operations — for each query, we load full datasets (up to 200 rows per source). With concurrent users, this memory usage multiplies. We'd need to add a query result cache (Redis) for common queries.
>
> Second, the LLM call — each query makes a GPT API call. Under high load, this becomes a bottleneck. We'd add a plan cache keyed by the normalized query hash, so repeated queries don't call the LLM again.
>
> Third, the source API calls — we'd add connection pooling and potentially move to event-driven architecture where requests are queued (Kafka) and results stored in Redis, with the frontend polling.
>
> Fourth, we'd containerize everything (Docker/Kubernetes) and horizontal-scale the FastAPI orchestration layer behind a load balancer."

---

### Q42. Your system fetches 200 rows from each API. What if a user asks about all 10 million clients?

**A:**
> "This is a real limitation we acknowledged. The current system has a hardcoded `limit=200` per API call and doesn't paginate. For large datasets, the in-memory approach breaks down.
>
> The correct architectural answer for true scale is **query pushdown** — instead of fetching data and filtering in Python, push the filter conditions down to the source API as query parameters. For example, instead of fetching 10M clients and filtering HIGH risk in Python, we'd call `/clients?riskRating=HIGH`, letting the database do the filtering.
>
> The OpenAPI spec already supports query parameters for filtering (region, riskRating, status). A smarter executor could use these when a FILTER step corresponds to a supported parameter, reducing data transfer dramatically."

---

### Q43. What's the difference between your system and a traditional Business Intelligence tool like Tableau?

**A:**
> "Several fundamental differences.
>
> **Data access model:** Tableau typically requires pre-built connectors and a centralized data warehouse or cube. Our system works directly against source APIs in real-time with no central data store.
>
> **Query interface:** Tableau uses drag-and-drop with pre-defined dimensions/measures. Our system uses natural language — much lower barrier for non-technical users.
>
> **Flexibility:** Tableau reports are pre-built. Changing what you measure requires a developer. Our system can answer any question the LLM can decompose, including follow-up questions that drill down in unforeseen ways.
>
> **Cost model:** Tableau charges per user per month (~$115/user). Our system's cost is LLM API calls per query — dramatically cheaper for organizations with many occasional users.
>
> **Trade-off:** Tableau has mature visualization, scheduling, sharing, and governance. For production, we'd need to add those capabilities."

---

### Q44. How is your system different from just asking ChatGPT a question?

**A:**
> "Three key differences.
>
> **Live data:** ChatGPT has a knowledge cutoff date and no access to your private enterprise data. Our system queries live source APIs — clients added yesterday show up today.
>
> **Accurate numbers:** ChatGPT might hallucinate financial figures or make up data. Our system fetches actual numbers from the database and computes aggregates in Python — the math is exact.
>
> **Structured output:** ChatGPT gives prose answers. Our system returns structured tabular data with a trace, which can be exported, further processed, or used in reports.
>
> Our LLM is used only for query planning — turning English into a structured plan. All actual data retrieval and computation is done in code, where we have full control."

---

### Q45. Explain how you'd add a new data source (e.g., a Portfolio Management API) to this system.

**A:**
> "The process has three steps.
>
> First, **add the API to the OpenAPI YAML** — add the new paths, operation IDs, schemas, and parameters. Assign appropriate tags like `Portfolio` that will auto-create a `portfolio_api` tool group.
>
> Second, **update TECHNICAL_DOCS.md** — add tool naming, join keys (if it joins on `clientId` or some new key), valid field names for aggregation, and example query patterns.
>
> Third, **update the system prompt** if needed — if the new API introduces a new valid tool name or has fields that the LLM should know about to prevent hallucination.
>
> If the source has an actual running API server, just start it and update the base URL in the OpenAPI spec. The executor's dynamic registry lookup handles everything else. No changes to executor code."

---

### Q46. What is the `alias_map` in executor.py and why does it exist?

**A:**
> "The alias map is a resilience mechanism for LLM output format drift. Despite the system prompt specifying tool names like `clients_api`, `deals_api`, the LLM occasionally outputs shorter names like `clients`, `deals`, or `compliance_exposures`.
>
> Rather than treating these as errors and failing the query, the executor maps known aliases to their canonical tool names:
> ```python
> alias_map = {
>     'clients': 'clients_api',
>     'deals': 'deals_api',
>     'compliance': 'compliance_api',
>     ...
> }
> ```
> This reflects a principle of 'be strict in what you send, lenient in what you accept.' The system prompt is strict about what it requires, but the executor is forgiving about minor variations. This makes the overall system more robust in production where LLM outputs can't be perfectly controlled."

---

### Q47. How would you add conversational context — i.e., "Show me the same but for EMEA" as a follow-up?

**A:**
> "Currently the system is stateless — each query is independent. To add conversational context, we'd need to pass the conversation history to the LLM planner.
>
> The `QueryRequest` schema already has an optional `context` field — this was designed for this purpose. We'd populate it with the previous execution plan or result summary.
>
> The system prompt would need a new section explaining how to interpret context — for example, 'if context.last_plan contains steps and the user says "same but for EMEA", generate the same plan with an additional FILTER for region == EMEA.'
>
> On the frontend, `chat.service.ts`'s `sendMessage()` would include the last few messages or the last execution plan in the context field. This is a natural evolution of the architecture — the interfaces are already wired for it."

---

### Q48. What design pattern is used by the executor for step processing?

**A:**
> "The executor uses a combination of the **Chain of Responsibility** and **Strategy** patterns.
>
> The `execute_plan()` loop processes each step in sequence — this is Chain of Responsibility. Each step type is handled by a specific branch in the if/elif block, which delegates to a strategy function: `apply_filter()`, `join_on_keys()`, `aggregate_rows()`, `sort_rows()`.
>
> The state — `current` dataset and `datasets` dictionary — flows through the chain, transformed by each step. This is similar to a Unix pipe: each command takes input, transforms it, and passes the result to the next.
>
> In a more scalable implementation, we'd use proper Strategy objects — a dict mapping step type strings to handler classes — making it easier to add new step types without modifying the main loop."

---

### Q49. How does CORS work in your system and why is it needed?

**A:**
> "CORS — Cross-Origin Resource Sharing — is a browser security mechanism. Browsers block JavaScript from making HTTP requests to a different origin (different domain or port) unless the server explicitly allows it.
>
> Our Angular app runs on `http://localhost:4200` during development. Our FastAPI backend runs on `http://localhost:8000`. These are different origins (different ports), so without CORS headers, the browser would block the API call.
>
> We added `CORSMiddleware` to FastAPI with `allow_origins=['*']` — which allows any origin. This is acceptable for a hackathon demo but in production we'd restrict it to the specific frontend domain, add `allow_credentials: false` unless cookies are needed, and limit allowed methods to POST and GET only."

---

### Q50. What happens if the LLM returns invalid JSON?

**A:**
> "In `planner_openai.py`, after getting the LLM response, we call `json.loads(content)`. If the LLM returns invalid JSON (malformed, with markdown code fences, or with added explanation text), this raises a `json.JSONDecodeError`.
>
> The system prompt explicitly instructs the LLM 'Return ONLY JSON — no markdown, no explanation text.' with `temperature=0` this is mostly reliable.
>
> But for production robustness, we'd add a fallback: try `json.loads()`, and if it fails, use a regex to extract the JSON object from within markdown code fences (` ```json ... ``` `). We'd also add retry logic — if parsing fails, re-send the prompt once before giving up.
>
> This exception propagates up to `main.py`'s try/except and returns as an HTTP 400 error to the frontend."

---

## 🎖️ BONUS: Quick-fire Terminology Questions

| Question | Answer |
|----------|--------|
| What is a Natural Language Query (NLQ) interface? | An interface where users query data using plain English instead of SQL or code |
| What is a Planner Agent? | An LLM component that translates user intent into a structured sequence of executable steps |
| What does ASGI stand for? | Asynchronous Server Gateway Interface — the async successor to WSGI for Python web apps |
| What is an operationId in OpenAPI? | A unique identifier for each API operation (endpoint + method combo) used for routing |
| What is Bearer token authentication? | An HTTP auth scheme where the caller sends `Authorization: Bearer <token>` in the header |
| What does idempotent mean? | A request that produces the same result no matter how many times it's made — GET calls in our system are idempotent |
| What is a singleton pattern? | A design pattern ensuring only one instance of a class exists — our `REGISTRY = ApiRegistry()` is a module-level singleton |
| What is a Pydantic model? | A Python class with type-annotated fields that automatically validates data |
| What is async/await in Python? | A syntax for writing non-blocking concurrent code in Python's `asyncio` event loop |
| What is a hash join? | A join algorithm that builds a hash index on one table for O(1) key lookups instead of O(n) linear scan |

---

## 💼 Tips for Presenting This Project in an Interview

1. **Lead with the business problem** — start with "data silos cost enterprises $125K+/year" before talking tech.

2. **Use the analogy:** "Our LLM is like a translator, not the worker. It translates English to a plan. Python does the actual work."

3. **Highlight the prompt engineering depth** — most interviewers underestimate how much engineering goes into a reliable system prompt. The JOIN ordering rule is a great example of non-obvious domain knowledge embedded in a prompt.

4. **Mention trade-offs honestly** — saying "we hardcoded the role to Sales due to time constraints and would fix it by adding a role selector" shows engineering maturity.

5. **Know your numbers** — "200 max rows per API call, 3 filter operators, 2 aggregate functions, <500ms typical response time."

6. **Be ready to whiteboard the flow** — user prompt → planner → execution plan JSON → executor → source API calls → in-memory ops → result.
