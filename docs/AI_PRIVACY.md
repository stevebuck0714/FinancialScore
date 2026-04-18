# Corelytics AI Data Privacy

_Last updated: 2026-04-17_

This document explains how Corelytics handles customer data when our AI features are used. It is intended for customers and their security/compliance teams.

## Where AI is used inside Corelytics

| Feature | What is sent to a model | When it runs |
|---|---|---|
| **Company Documents — search & Q&A** | Text extracted from documents you upload, plus the questions you ask | Every upload (one-time embedding) and every question (retrieval + answer) |
| **Ask Corelytics — financial Q&A** | The question, plus dashboard data points and document snippets it retrieves to answer | Each question |
| **Period Review (AI narrative report)** | Aggregated financial metrics for the period, internal notes, and trend alerts | When you request a narrative report |

**No customer data is used to train any AI model.** Corelytics does not fine-tune on your data, and our upstream providers do not train on data sent through this configuration.

## How requests are routed

All AI calls flow through **Vercel AI Gateway** with **per-request Zero Data Retention (ZDR)** enabled. ZDR means:

1. **No prompt logging.** Upstream model providers do not retain the prompt or the response after returning it.
2. **No abuse-monitoring window.** Standard OpenAI accounts retain prompts for up to 30 days for abuse monitoring; ZDR removes that window entirely.
3. **Provider routing is restricted.** AI Gateway only routes ZDR-enforced requests to providers that have signed ZDR agreements with Vercel. If no ZDR-compliant provider is available for a requested model, the request fails rather than silently routing through a non-ZDR provider.

```
Your browser
    ↓ HTTPS
Corelytics (Vercel)
    ↓ HTTPS, providerOptions.gateway.zeroDataRetention = true
Vercel AI Gateway
    ↓ HTTPS, ZDR-only routing
OpenAI / Anthropic / Google (ZDR endpoints)
```

## Models in use today

| Purpose | Model |
|---|---|
| Document embeddings (vector search) | `openai/text-embedding-3-small` |
| Q&A and narrative generation | `openai/gpt-4o` (configurable) |

The provider abstraction means we can switch models or providers without code changes if a customer or compliance review requires it.

## Where document text and metadata are stored

| Asset | Where it lives | Encrypted at rest | Access |
|---|---|---|---|
| Original document file (PDF, DOCX, etc.) | Vercel Blob storage | Yes (AES-256) | Service role + your tenant only |
| Extracted text chunks + vector embeddings | Postgres (Neon) — `CompanyDocumentChunk` table | Yes (AES-256) | Service role + your tenant only |
| Document metadata (filename, owner, upload time) | Postgres (Neon) — `CompanyDocument` table | Yes (AES-256) | Service role + your tenant only |

All chunks are tenant-scoped — no cross-tenant retrieval is possible.

## Configuration

The AI privacy posture is enforced in code. The relevant module is `lib/ai-gateway.ts`, which:

- Selects the AI Gateway base URL when `AI_GATEWAY_API_KEY` (or `VERCEL_OIDC_TOKEN`) is set
- Attaches `providerOptions.gateway.zeroDataRetention = true` to every request
- Falls back to direct OpenAI only when no gateway key is provisioned (development environments)

In production, every Corelytics deployment uses the gateway-with-ZDR path. This is verified by the `/api/test-openai` health check, which reports the active transport and ZDR status.

## What is NOT covered today

- **HIPAA Business Associate Agreement (BAA):** Not currently in place. If your use case requires HIPAA, contact us — we can route through Azure OpenAI under Microsoft's BAA via the same gateway.
- **Data residency outside the US:** Today's deployment hosts in `us-east-1`. EU residency is on the roadmap.
- **Customer-managed keys (CMK / BYOK) for storage encryption:** Not available today. Vercel/Neon manage encryption keys.

## Questions

For security questionnaires or to request additional documentation (SOC 2, penetration test summary, etc.), contact your Corelytics account representative.

## References

- [Vercel AI Gateway — Zero Data Retention](https://vercel.com/docs/ai-gateway/capabilities/zdr)
- [Vercel — ZDR launch announcement (April 2026)](https://vercel.com/blog/zdr-on-ai-gateway)
- [OpenAI — Enterprise Privacy](https://openai.com/enterprise-privacy)
