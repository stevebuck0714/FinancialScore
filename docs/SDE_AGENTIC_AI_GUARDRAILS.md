# SDE Agentic AI Guardrails

## Objective
Allow agentic AI to enhance recommendation quality while preserving financial correctness, explainability, and operator control.

## Non-Negotiables
- Deterministic financial computations remain canonical.
- Agentic outputs cannot overwrite source metrics.
- No recommendations from mock or unapproved sources.
- Every recommendation must include evidence references.
- Human approval required for any externally impactful action.

## Safety Layers

### 1) Data Validation Gate
- Require strict SDE readiness:
  - approved source
  - non-mock source
  - company financial data loaded
- If gate fails, AI layer does not execute.

### 2) Deterministic Facts Engine
- Compute flags, trends, and baselines first.
- AI can only reason over validated facts payload.
- Facts payload includes:
  - metric values
  - trend windows
  - thresholds crossed
  - confidence metadata

### 3) Policy-Constrained Agent
- Agent output schema is strict/validated.
- Prohibited:
  - unsupported claims
  - unverifiable external assumptions
  - hidden chain-of-thought outputs
- Required:
  - rationale grounded in facts
  - confidence score
  - action horizon

### 4) Human-in-the-Loop Workflow
- Recommendation states:
  - `proposed`
  - `approved`
  - `rejected`
  - `in_progress`
  - `completed`
- Only approved recommendations can move into execution planning.

### 5) Auditability
- Persist versioned recommendation snapshots.
- Store:
  - deterministic facts hash
  - model/version metadata
  - prompt template version
  - decision log (approve/reject + actor + timestamp)

## Confidence and Escalation
- High impact + low confidence recommendations are auto-escalated for review.
- If deterministic and agentic conclusions conflict materially:
  - downgrade confidence
  - mark as conflict
  - require analyst sign-off

## Monitoring
- Track recommendation precision over time:
  - accepted vs rejected rates
  - realized impact vs predicted range
  - drift by industry/company segment
- Trigger guardrail alerts for:
  - recurring unsupported recommendations
  - confidence inflation
  - unstable output variance for similar fact patterns

## Rollout Plan
- Stage 1: Deterministic-only recommendations (production baseline).
- Stage 2: Agentic explanations and re-prioritization (read-only shadow mode).
- Stage 3: Agentic suggestions visible to users with mandatory approval workflow.
