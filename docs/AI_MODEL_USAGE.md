# AI Model Usage

This document inventories the sections of Corelytics that call AI models, which model configuration they use, and why each call exists.

## Provider Architecture

The application centralizes OpenAI-compatible model access in `lib/ai-gateway.ts` and `lib/openai-helpers.ts`.

In production, the intended path is:

1. Vercel-hosted Next.js API route or server helper receives the user action.
2. The route calls `getOpenAiClient()`.
3. `getOpenAiClient()` points the OpenAI SDK at Vercel AI Gateway when `AI_GATEWAY_API_KEY` or Vercel's `VERCEL_OIDC_TOKEN` is available.
4. The gateway base URL is `https://ai-gateway.vercel.sh/v1`.
5. Bare OpenAI model names such as `gpt-4o` or `gpt-5.1` are automatically resolved to gateway model names such as `openai/gpt-4o` or `openai/gpt-5.1`.
6. Requests include `providerOptions.gateway.zeroDataRetention = true` when routed through Vercel AI Gateway.

If no Vercel AI Gateway credential is available, the code falls back to direct OpenAI via `OPENAI_API_KEY`. That fallback is mainly for local development. If neither gateway nor OpenAI credentials are configured, AI routes return an error or skip optional AI synthesis.

The helper `createModelText()` prefers the OpenAI Responses API first. This matters for newer models such as `gpt-5.1`, because those models may be Responses-only. For older chat-compatible models, the helper can fall back to Chat Completions.

## OpenAI Enterprise Through Vercel

The app does not instantiate a separate "OpenAI Enterprise" client in code. Instead, it uses the OpenAI SDK against Vercel AI Gateway. Vercel is the routing layer between Corelytics and upstream model providers such as OpenAI.

Operationally, that means:

- Production AI traffic should be configured with `AI_GATEWAY_API_KEY` or rely on `VERCEL_OIDC_TOKEN` in Vercel.
- Vercel AI Gateway chooses the upstream OpenAI provider endpoint for model names prefixed with `openai/`.
- The application asks the gateway for Zero Data Retention on each request.
- Existing environment variables can still use normal OpenAI names, for example `OPENAI_MODEL=gpt-5.1`; the gateway helper adds the `openai/` prefix automatically.
- Local development can use `OPENAI_API_KEY` directly when gateway credentials are not present.

The `/api/test-openai` endpoint is the health check for this setup. It reports the active transport (`gateway`, `openai-direct`, or `unconfigured`), the base URL, whether ZDR is enforced, the requested model, the resolved gateway model hint, and which API path responded.

## Shared Model Defaults

| Environment variable | Default | Used for |
| --- | --- | --- |
| `OPENAI_MODEL` | `gpt-4o` | Global default text model when a feature-specific override is not set. Can be set to `gpt-5.1` or another supported OpenAI model. |
| `OPENAI_MODEL_ASK` | `OPENAI_MODEL` | Ask Corelytics internal-data Q&A. Also used as a fallback by Daily Exec Briefing. |
| `OPENAI_MODEL_DOCS` | `OPENAI_MODEL_ASK` | Ask Corelytics document mode. |
| `OPENAI_MODEL_EXEC_BRIEFING` | `OPENAI_MODEL_ASK`, then `OPENAI_MODEL`, then `gpt-4o` | Daily Exec Briefing generation. |
| `OPENAI_MODEL_INDUSTRY_BRIEF_FINAL` | Required | Final company-specific Industry Brief narrative and growth-opportunity ranking step. No model fallback is used. |
| `OPENAI_MODEL_INDUSTRY_BRIEF_SCAN` | Required | Source scanning, headline classification, competitor/opportunity extraction, and signal categorization. No model fallback is used. |
| `OPENAI_MODEL_WEB_RESEARCH` | `OPENAI_MODEL`, then `gpt-4o` | Ask Corelytics web-research synthesis after live web research. |
| `OPENAI_MODEL_BUSINESS_CONTEXT` | `OPENAI_MODEL`, then `gpt-4o` | Business overview and market-position synthesis. |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | Company document vector embeddings for document search / retrieval. |
| `PERPLEXITY_MODEL` | `sonar-pro` | Ask Corelytics web research and Daily Industry Brief live market/competitor scan. |

When traffic goes through Vercel AI Gateway, these defaults resolve to provider-prefixed gateway model names, for example `openai/gpt-4o`, `openai/gpt-5.1`, or `openai/text-embedding-3-small`.

## Application Sections

| Application section | Code location | Model used | Purpose |
| --- | --- | --- | --- |
| Ask Corelytics, internal data mode | `app/api/ai-analysis/ask/route.ts` | `OPENAI_MODEL_ASK || OPENAI_MODEL || 'gpt-4o'` | Synthesizes user Q&A from company financial, operational, sector, benchmark, alert, and document context. It returns structured short answer, long answer, cited bullets, business impact, and follow-up prompts. |
| Ask Corelytics, document mode | `app/api/ai-analysis/ask/route.ts` | `OPENAI_MODEL_DOCS || OPENAI_MODEL_ASK || OPENAI_MODEL || 'gpt-4o'` | Answers questions against uploaded company documents and retrieved chunks, while still formatting the response for the Ask Corelytics UI. |
| Ask Corelytics JSON repair retry | `app/api/ai-analysis/ask/route.ts` | Same model selected for Ask Corelytics | If the first Ask Corelytics response is malformed or too large, the route retries in compact mode and can repair output into the expected JSON shape. |
| Daily Exec Briefing | `app/api/pulse/exec-briefing/route.ts` | `OPENAI_MODEL_EXEC_BRIEFING || OPENAI_MODEL_ASK || OPENAI_MODEL || 'gpt-4o'` | Creates the Daily Exec Briefing from financial facts, liquidity, AR/AP, covenants, Pulse alerts, performance findings, benchmarks, and sector-appropriate operational modules. |
| Daily Exec Briefing formatter retry | `app/api/pulse/exec-briefing/route.ts` | Same model selected for Daily Exec Briefing | Converts an unusable briefing draft into strict JSON sections, with a "No Material Exceptions" fallback if the model still does not return usable sections. |
| Daily Industry Brief | `app/api/industry-brief/route.ts` + `lib/industry-brief/*` | Final: `OPENAI_MODEL_INDUSTRY_BRIEF_FINAL`; Scan: `OPENAI_MODEL_INDUSTRY_BRIEF_SCAN` | Produces a company-specific market/industry brief and ranked growth-opportunity cards from live FRED, BLS, and Perplexity source records. If company profile, live source scan, scan-model classification, or final AI synthesis fails, the route returns an explicit unavailable status instead of generated fallback content. |
| Period Review | `app/api/ai-analysis/period-review/route.ts` | `OPENAI_MODEL || 'gpt-4o'` | Generates a structured period review covering executive summary, performance vs goals, market context, negative operational trend alerts, drivers, risks, and opportunities. |
| Ask Corelytics Web Research, live search | `app/api/ai-analysis/web-research/route.ts` | `PERPLEXITY_MODEL || 'sonar-pro'` | Performs source-backed live web research across selected scopes for Ask Corelytics external-source mode. This is not OpenAI; it calls Perplexity directly. |
| Ask Corelytics Web Research, synthesis | `app/api/ai-analysis/web-research/route.ts` | `OPENAI_MODEL_WEB_RESEARCH || OPENAI_MODEL || 'gpt-4o'` | Synthesizes Perplexity research notes, citations, Firecrawl extracts, and conversation context into the structured Ask Corelytics web-research answer. |
| Ask Corelytics Web Research, synthesis fallback | `app/api/ai-analysis/web-research/route.ts` | `PERPLEXITY_MODEL || 'sonar-pro'` | If OpenAI/Vercel synthesis is unavailable or fails, Perplexity produces the final JSON response. |
| Business Overview / Market Position research | `app/api/company-market-context/generate/route.ts` | `sonar-pro` | Runs live Perplexity research for company background, products, operations, competitors, and valuation implications. |
| Business Overview / Market Position synthesis | `app/api/company-market-context/generate/route.ts` | `OPENAI_MODEL_BUSINESS_CONTEXT || OPENAI_MODEL || 'gpt-4o'` | Synthesizes research notes and Firecrawl extracts into valuation-ready company background, market position, competitive landscape, competitor table, and sources. |
| Business Overview / Market Position synthesis fallback | `app/api/company-market-context/generate/route.ts` | `sonar-pro` | If OpenAI/Vercel synthesis is unavailable or fails, Perplexity produces the final JSON output. |
| Company document embeddings | `lib/company-documents/embeddings.ts` | `OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small'` | Embeds uploaded company-document chunks and Ask document queries for semantic retrieval. This supports document-grounded Ask Corelytics answers. |
| Company document indexing | `lib/company-documents/index-document.ts` | Uses `embedTexts()` model above | Splits uploaded documents into chunks, embeds them, and stores vectors plus the embedding model used. |
| Company document retrieval | `lib/company-documents/retrieve-chunks.ts` | Uses `embedTexts()` model above | Embeds the expanded user query and retrieves the most relevant document chunks for Ask Corelytics document mode. |
| AI provider health check | `app/api/test-openai/route.ts` | `OPENAI_MODEL || 'gpt-4o'` | Tests that the configured Vercel AI Gateway or direct OpenAI transport can return a small JSON response. |

## AI-Named Features That Do Not Call GPT/OpenAI

Some areas use "AI" language in the product or file names but do not call an external GPT/OpenAI model directly:

- `app/api/ai-mapping/enhanced/route.ts` is primarily deterministic account-mapping logic using account codes, keyword rules, overrides, and the local `mappingLearner`. It does not call OpenAI in the current implementation.
- `lib/ai-learning/MappingLearner.ts` is local mapping-learning logic, not a hosted LLM call.

## Security And Data Handling Notes

- All OpenAI-compatible text calls should go through `getOpenAiClient()` and `createModelText()` rather than creating a raw `new OpenAI()` client in feature code.
- Gateway-routed requests attach `zeroDataRetention: true` per request.
- The app does not log full prompts by default. Some routes log model name, finish reason, response length, or short previews for debugging.
- Document embeddings send extracted document text chunks to the configured embedding model. The code caps each embedded text chunk at 12,000 characters and batches up to 64 chunks per request.
- Perplexity and Firecrawl are separate external services used for live web research and page extraction. Those calls do not use the OpenAI/Vercel gateway path.

## Practical Production Checklist

- Set `AI_GATEWAY_API_KEY` in Vercel production and preview environments, or confirm `VERCEL_OIDC_TOKEN` is available and accepted by Vercel AI Gateway.
- Set `OPENAI_MODEL` to the desired default model, for example `gpt-5.1` if that is the intended standard model.
- Set feature-specific overrides only when needed: `OPENAI_MODEL_ASK`, `OPENAI_MODEL_DOCS`, `OPENAI_MODEL_EXEC_BRIEFING`, `OPENAI_MODEL_WEB_RESEARCH`, and `OPENAI_MODEL_BUSINESS_CONTEXT`.
- Set `OPENAI_EMBEDDING_MODEL` only if changing the embedding model intentionally; changing embedding models may require re-indexing stored document chunks for consistency.
- Run `/api/test-openai` after deployment to confirm the transport is `gateway`, ZDR is enforced, and the resolved model is the expected `openai/...` model.
