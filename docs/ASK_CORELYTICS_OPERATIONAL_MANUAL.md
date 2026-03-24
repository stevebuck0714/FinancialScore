# Ask Corelytics - Operational Description

## Purpose

This document explains how the Ask Corelytics section works operationally, with focus on the two AI search capabilities it uses:

1. **Company/Market AI Search** (Ask tab)
2. **Document Semantic Search (RAG)** (Search Documents tab)

It describes data flow, source selection, model behavior, grounding/citation controls, and operational guardrails.

---

## 1) Ask Corelytics Runtime Architecture

Ask Corelytics UI is implemented in `app/components/AIAnalysisView.tsx` and calls two API routes:

- `POST /api/ai-analysis/ask` (for Ask + Search Documents modes)
- `POST /api/ai-analysis/period-review` (separate narrative review workflow)

Authentication and tenant boundary checks are enforced server-side before any AI processing:

- `requireAuth()`
- `validateCompanyAccess(companyId)`
- forbidden attempts are audited with `auditForbiddenAccess(...)`

---

## 2) Capability A: Company/Market AI Search (Ask tab)

### What it does

Given a question, this capability builds a grounded answer using:

- internal company financial and operational context, and
- optional external web sources (when enabled and relevant).

### Trigger path

- UI tab: **Ask**
- API mode: `mode = "default"`
- Endpoint: `POST /api/ai-analysis/ask`

### Data context assembled by the API

The API builds a structured `internalSummary` payload including:

- monthly financial snapshot and prior-month deltas
- ratio/KPI snapshot with industry benchmark values (when available)
- recent daily operational trend summaries (cash, AR/AP patterns, customer concentration)
- data availability metadata and notes

This is the canonical context fed to the model for company-specific answers.

### Source strategy

The source set is selected based on question type and toggle behavior:

- **Internal-only mode** (default in many operational questions):
  - Data Review source
  - Operations source
- **External web mode**:
  - SerpApi results (Google organic results), bounded and filtered
- If a document is selected in UI (from shared request path), document source can be appended.

### External source selection logic

The route uses term heuristics to decide if external sources should be used:

- internal terms (KPI, margin, AR/AP, trend, goals, etc.)
- external terms (competitor, market, benchmark, regulatory, macro, etc.)

If external mode is requested but no sources are found, the route returns a clear 422 error.

### Model behavior

The route calls OpenAI via `createModelText(...)` with:

- a strict JSON output contract
- explicit requirement to cite only allowed URLs
- anti-hallucination constraints (no invented metrics/URLs/claims)
- compact retry mode if response truncates
- repair pass if response is malformed JSON

### Reliability controls

- citation allowlist validation (all bullet citations must match provided source URLs)
- strict retry if citation quality is invalid
- fallback synthesized answer from available sources when model output is invalid or truncated
- list-quality enforcement for "Top N" style questions

---

## 3) Capability B: Document Semantic Search (RAG) (Search Documents tab)

### What it does

Given one selected company document and a question, this capability retrieves the most relevant chunks and generates a grounded answer with citations to the selected document only.

### Trigger path

- UI tab: **Search Documents**
- API mode: `mode = "document"`
- Endpoint: `POST /api/ai-analysis/ask` (same route, document branch)

### Document prerequisites

For selected document:

- extraction must be complete (`extractionStatus = DONE`)
- index must be usable (`indexStatus = DONE` or indexable on demand)

If index is missing, the route attempts indexing before retrieval.

### Indexing pipeline

Indexing is managed by `lib/company-documents/index-document.ts`:

1. sanitize extracted text
2. chunk text (`chunkDocumentText`) with overlap
3. generate embeddings (`embedTexts`)
4. store chunk text + vector in `CompanyDocumentChunk`
5. update document `indexStatus`, model, and vector dimensional metadata

### Retrieval pipeline (hybrid search)

Retrieval is implemented in `lib/company-documents/retrieve-chunks.ts` and uses a hybrid approach:

- keyword full-text ranking (`ts_rank_cd`)
- vector similarity (`pgvector <->`)
- query expansion for legal/contract phrasing
- anchor-term pass for section-style terminology
- score fusion (keyword + vector weighted score)
- neighbor-window expansion around top chunks to preserve clause continuity

Result: ranked and context-expanded chunk set for grounded generation.

### Generation constraints (document mode)

The model is constrained to:

- answer only from retrieved chunks
- cite only the selected document open URL
- avoid invented section numbers or unsupported claims
- return strict JSON structure

If citations are missing, the route auto-attaches document citation where appropriate.  
If answer quality is still weak, it falls back to excerpt-based grounded bullets.

---

## 4) Shared Output Contract (Ask + Document modes)

Both modes return:

- `shortAnswer`
- `longAnswer`
- `citedBullets[]` (with citations per bullet)
- `howThisImpactsUs`
- `sources[]`

This response shape is stable and designed for deterministic rendering in the Ask Corelytics UI.

---

## 5) Operational Guardrails

### Security and tenancy

- user must be authenticated
- company access validated per request
- forbidden requests are auditable

### Grounding and citation integrity

- model citations are restricted to an allowlist of route-provided sources
- invalid citations trigger strict retry/fallback logic

### Failure handling

- request timeout handling in UI (AbortController path)
- actionable API errors for missing company/question/document state
- document extraction/index readiness messaging

### Data-quality resilience

- if model response truncates or fails JSON parsing, route performs compact retry/repair
- if still invalid, route returns grounded fallback response from available source set

---

## 6) Environment and Model Controls

Relevant settings:

- `OPENAI_API_KEY` (required)
- `OPENAI_MODEL` (default model)
- `OPENAI_MODEL_ASK` (optional Ask-mode override)
- `OPENAI_MODEL_DOCS` (optional Document-mode override)
- `OPENAI_EMBEDDING_MODEL` (default: `text-embedding-3-small`)
- `SERPAPI_API_KEY` (for external web source retrieval)

Operational recommendation:

- keep Ask and Document models configurable independently
- monitor latency and truncation rates per mode

---

## 7) How the Two Agentic Search Capabilities Differ

### A) Company/Market AI Search

- Scope: enterprise financial/operational context + optional external market context
- Sources: internal app pages and/or SerpApi results
- Best for: KPI interpretation, trend questions, competitor/market context, action framing

### B) Document Semantic Search (RAG)

- Scope: one selected uploaded company document
- Sources: indexed document chunks only (hybrid keyword + vector retrieval)
- Best for: covenant extraction, clause lookup, document-grounded Q&A

Both are agentic in orchestration (selection, retrieval, synthesis, validation) but enforce grounded output and citation controls.

---

## 8) Relationship to Period Review

Period Review is related but distinct:

- endpoint: `POST /api/ai-analysis/period-review`
- purpose: structured narrative period report (not ad-hoc search)
- inputs: monthly + daily internal signals, goals, benchmark context, optional external market sources
- includes explicit negative trend alert handling and opportunities section generation

---

## 9) Current Limits and Next Enhancements

Current limits:

- custom report metadata and Ask capabilities are separate; Ask does not auto-ingest custom report definitions.
- document Q&A quality depends on extraction quality and chunking fidelity.
- external source availability depends on SerpApi results and query specificity.

High-value enhancements:

- add source confidence scoring in UI
- persist Ask query/response audit history by company
- add retrieval diagnostics panel (top chunks + scoring metadata) for admins
- add policy controls for allowed external domains by tenant

