# Corelytics AI Model Usage Overview

Corelytics uses AI to help turn company financial, operational, document, and market data into practical business analysis. AI is used for summarization, question answering, source-backed research synthesis, document search, and executive briefings. It is not used to replace the underlying financial records, accounting data, operational data, or user-entered company data.

## AI Platform Overview

Corelytics uses OpenAI-compatible models through Vercel's AI infrastructure. This allows Corelytics to route model requests through a managed enterprise-grade gateway while keeping the application flexible enough to use newer OpenAI models, including GPT-5.1, when configured.

For customer deployments, the primary text-generation model can be configured. The current default in the application is GPT-4o when no newer model is configured. If GPT-5.1 is selected for the deployment, the same Corelytics AI features use GPT-5.1 for the applicable text-generation workflows.

Corelytics also uses an embedding model for document search. Embeddings are different from chat models: they convert document text and questions into numerical representations so the application can find the most relevant document sections before generating an answer.

## OpenAI Enterprise Through Vercel

Corelytics routes OpenAI-compatible AI traffic through Vercel's AI gateway in production. Vercel acts as the secure routing layer between Corelytics and upstream model providers such as OpenAI.

This setup is used so Corelytics can:

- Centralize AI provider access through one managed production pathway.
- Use OpenAI models such as GPT-4o or GPT-5.1 without changing product workflows.
- Request Zero Data Retention for gateway-routed model calls.
- Keep model selection configurable by deployment and feature area.
- Maintain a direct OpenAI fallback for controlled development environments when gateway credentials are not present.

In practical terms, customer-facing AI features call Corelytics server-side services first. Those services gather the relevant company data, prepare a limited task-specific prompt, call the configured AI model, and then return a structured response to the application.

## Model Categories

| Model category | Typical model | What it is used for |
| --- | --- | --- |
| Primary reasoning and writing model | GPT-5.1 when configured, otherwise GPT-4o by default | Ask Corelytics answers, executive briefings, period reviews, and business research synthesis. |
| Document embedding model | Text Embedding 3 Small by default | Document search, document chunk retrieval, and matching user questions to relevant uploaded document sections. |
| Web research model | Perplexity Sonar Pro | Live web research and source discovery for external research workflows. |

## Application Areas Using AI

| Application area | Model used | Purpose |
| --- | --- | --- |
| Ask Corelytics, company data questions | Configured primary GPT model, such as GPT-5.1 or GPT-4o | Answers user questions using internal company financial data, operational data, benchmarks, alerts, sector context, and available documents. |
| Ask Corelytics, document questions | Configured primary GPT model plus document embeddings | Answers questions using uploaded company documents. The embedding model finds the most relevant document sections, and the GPT model writes the final response. |
| Ask Corelytics, web research | Perplexity Sonar Pro for research, with the configured primary GPT model for synthesis when available | Researches external sources and converts findings into a clear, source-backed business answer. |
| Daily Exec Briefing | Configured briefing model, usually the primary GPT model | Produces an executive briefing from financial performance, liquidity, AR/AP, debt, covenants, alerts, benchmarks, and sector-specific operational data. |
| Period Review | Configured primary GPT model | Creates a structured period review covering performance, goals, operational trends, risks, opportunities, and market context. |
| Business Overview and Market Position | Perplexity Sonar Pro for research, with the configured primary GPT model for synthesis when available | Builds valuation-oriented business background, market positioning, competitive landscape, and competitor summaries from researched material. |
| Company document search | Text Embedding 3 Small by default | Indexes uploaded documents and retrieves relevant sections for document-grounded AI answers. |
| AI health check | Configured primary GPT model | Confirms that the configured AI provider path is working for the deployment. |

## How Corelytics Uses Customer Data With AI

Corelytics sends only the information needed for the specific AI task. For example, Ask Corelytics receives the user's question and relevant company context; Daily Exec Briefing receives the prepared financial and operational facts needed for that briefing; document mode receives selected document excerpts rather than the entire document library.

AI responses are generated from the data provided to the model for that request. The system is designed to avoid inventing facts and to ground answers in company data, uploaded documents, or clearly identified external research, depending on the selected mode.

## What AI Does Not Do

AI does not create or alter the source accounting records, operational records, or company master data. It does not replace accounting-system syncs, operational integrations, data mappings, or user approvals. AI is used to interpret, summarize, explain, and draft analysis from data already available to Corelytics.

Some product areas use "AI" terminology but are not GPT model calls. For example, account mapping includes rule-based matching, learned mapping behavior, account-code logic, and keyword matching. That workflow may assist with mapping recommendations, but it is not currently a hosted GPT/OpenAI text-generation call.

## Summary

Corelytics uses AI in targeted areas where language models are useful: answering questions, summarizing business performance, drafting executive analysis, synthesizing research, and finding relevant document excerpts. The core application data remains system-of-record data from accounting systems, operational systems, documents, user inputs, and Corelytics calculations.
