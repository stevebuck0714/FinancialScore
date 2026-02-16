'use client';

import { useEffect, useMemo, useState } from 'react';

type AskResponse = {
  shortAnswer: string;
  longAnswer: string;
  citedBullets: Array<{
    text: string;
    citations: Array<{
      url: string;
      title?: string;
      publishedDate?: string | null;
    }>;
  }>;
  howThisImpactsUs: string;
  sources: Array<{
    url: string;
    title?: string;
    publishedDate?: string | null;
    snippet?: string;
  }>;
};

type PeriodReviewResponse = {
  period: {
    start: string;
    end: string;
    label: string;
  };
  executiveSummary: string;
  performanceVsGoals: string;
  peerAndMarketContext: string;
  operationalTrends: {
    negativeTrendAlerts: Array<{
      metric: string;
      signal: string;
      whyItMatters: string;
      evidence: string;
    }>;
    narrative: string;
  };
  driversAndRisks: string;
  opportunities: string;
  appendix: {
    notes: string[];
    sources: Array<{ url: string; title?: string; publishedDate?: string | null }>;
  };
};

type MonthlyDataLike = {
  date: Date;
  month: string;
  revenue?: number;
  expense?: number;
};

type QuestionsByCategory = Record<string, string[]>;

type DocCategory = 'LOAN_DOCUMENTS' | 'FINANCING_DOCUMENTS' | 'LEGAL_AND_REGULATORY' | 'OTHER';
type CompanyDocument = {
  id: string;
  category: DocCategory;
  originalFileName: string;
  extractionStatus: string;
  indexStatus?: string;
  indexError?: string | null;
  createdAt: string;
};

const DOC_CATEGORY_META: Array<{ id: DocCategory; label: string }> = [
  { id: 'LOAN_DOCUMENTS', label: 'Loan Documents' },
  { id: 'FINANCING_DOCUMENTS', label: 'Financing Documents' },
  { id: 'LEGAL_AND_REGULATORY', label: 'Legal and Regulatory' },
  { id: 'OTHER', label: 'Other' },
];

export default function AIAnalysisView(props: {
  selectedCompanyId: string;
  companyName?: string;
  monthly: MonthlyDataLike[];
}) {
  const { selectedCompanyId, companyName, monthly } = props;
  const [tab, setTab] = useState<'ask' | 'search-documents' | 'period-review'>('ask');

  // Ask
  const [question, setQuestion] = useState('');
  const [askLoading, setAskLoading] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [askResponse, setAskResponse] = useState<AskResponse | null>(null);
  const [useExternalSources, setUseExternalSources] = useState(false);
  const [documents, setDocuments] = useState<CompanyDocument[]>([]);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>('');
  const [isEditingQuestions, setIsEditingQuestions] = useState(false);
  const [questionsDirty, setQuestionsDirty] = useState(false);
  const [questionsSavedAt, setQuestionsSavedAt] = useState<string | null>(null);
  const [questionsError, setQuestionsError] = useState<string | null>(null);
  const [newQuestionByCategory, setNewQuestionByCategory] = useState<Record<string, string>>({});

  // Period review
  const defaultPeriodLabel = useMemo(() => {
    if (!monthly || monthly.length === 0) return '';
    return monthly[monthly.length - 1]?.month || '';
  }, [monthly]);

  const [periodLabel, setPeriodLabel] = useState<string>(defaultPeriodLabel);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [periodError, setPeriodError] = useState<string | null>(null);
  const [periodResponse, setPeriodResponse] = useState<PeriodReviewResponse | null>(null);

  const defaultPresetQuestions = useMemo(() => {
    const name = companyName?.trim() || 'the company';
    return {
      Company: [
        `What are the top drivers of margin change this period for ${name}?`,
        `Which KPIs are below our peer group KPIs for ${name}, and what are the likely causes?`,
        `What are the top 3 risks to performance over the next 90 days for ${name}?`,
      ],
      'Daily Operations': [
        `Which daily operational metrics show sustained negative trends over the last 14 and 30 days for ${name}?`,
        `What leading indicators correlate with deteriorating cash/AR performance in the last 30 days for ${name}?`,
        `Where are we seeing signs of customer concentration risk worsening recently for ${name}?`,
      ],
      'Monthly COA': [
        `Which COA expense categories drove the largest month-over-month variance, and are they structural or one-time for ${name}?`,
        `Is there evidence of run-rate cost creep in specific COA categories over the last 6 months for ${name}?`,
        `What is the earliest month the current expense run-rate shift began for ${name}?`,
      ],
      'Peers / Market': [
        `How are peers in our industry talking about demand, pricing, labor, or churn in the last 90 days?`,
        `What are the most important industry trends likely to affect ${name} over the next 6–12 months?`,
      ],
      Opportunities: [
        `If ${name} is extremely successful, what acquisition archetypes would best accelerate growth in our markets and why?`,
        `Give example capital deployment plans (M&A, reinvestment, debt paydown, distributions) and the outcomes they could drive for ${name}.`,
      ],
    } as const;
  }, [companyName]);

  const storageKey = useMemo(() => {
    return selectedCompanyId ? `ai_analysis_questions_${selectedCompanyId}` : 'ai_analysis_questions_default';
  }, [selectedCompanyId]);

  const [presetQuestions, setPresetQuestions] = useState<QuestionsByCategory>(defaultPresetQuestions);

  function isValidQuestions(value: any): value is QuestionsByCategory {
    if (!value || typeof value !== 'object') return false;
    return Object.values(value).every((list) => Array.isArray(list) && list.every((q) => typeof q === 'string'));
  }

  useEffect(() => {
    setQuestionsError(null);
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (isValidQuestions(parsed)) {
          setPresetQuestions(parsed);
          setQuestionsDirty(false);
          setQuestionsSavedAt(null);
          return;
        }
      }
      setPresetQuestions(defaultPresetQuestions);
      setQuestionsDirty(false);
      setQuestionsSavedAt(null);
    } catch (e: any) {
      console.error('Failed to load saved AI questions:', e);
      setQuestionsError('Failed to load saved questions. Using defaults.');
      setPresetQuestions(defaultPresetQuestions);
    }
  }, [storageKey, defaultPresetQuestions]);

  useEffect(() => {
    // Keep default period aligned when company changes / data loads
    if (defaultPeriodLabel && !periodLabel) setPeriodLabel(defaultPeriodLabel);
  }, [defaultPeriodLabel, periodLabel]);

  function addQuestion(category: string) {
    const draft = newQuestionByCategory[category]?.trim();
    if (!draft) return;
    setPresetQuestions((prev) => ({
      ...prev,
      [category]: [...(prev[category] || []), draft],
    }));
    setNewQuestionByCategory((prev) => ({ ...prev, [category]: '' }));
    setQuestionsDirty(true);
    setQuestionsSavedAt(null);
  }

  function deleteQuestion(category: string, index: number) {
    setPresetQuestions((prev) => ({
      ...prev,
      [category]: (prev[category] || []).filter((_, idx) => idx !== index),
    }));
    setQuestionsDirty(true);
    setQuestionsSavedAt(null);
  }

  function saveQuestions() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(presetQuestions));
      setQuestionsDirty(false);
      setQuestionsSavedAt(new Date().toLocaleTimeString());
      setQuestionsError(null);
    } catch (e: any) {
      console.error('Failed to save AI questions:', e);
      setQuestionsError('Failed to save questions.');
    }
  }

  function resetQuestions() {
    setPresetQuestions(defaultPresetQuestions);
    setQuestionsDirty(true);
    setQuestionsSavedAt(null);
  }

  async function runAsk(q: string, opts?: { mode?: 'default' | 'document' }) {
    const trimmed = q.trim();
    if (!trimmed) return;

    setAskLoading(true);
    setAskError(null);
    setAskResponse(null);

    try {
      const mode = opts?.mode === 'document' ? 'document' : 'default';
      const res = await fetch('/api/ai-analysis/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          companyName,
          question: trimmed,
          useExternalSources,
          documentId: selectedDocumentId || null,
          mode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to run AI Search');
      }
      setAskResponse(data as AskResponse);
    } catch (e: any) {
      setAskError(e?.message || 'Unknown error');
    } finally {
      setAskLoading(false);
    }
  }

  async function reloadDocuments() {
    if (!selectedCompanyId) return;
    setDocumentsError(null);
    try {
      const res = await fetch(`/api/company-documents?companyId=${encodeURIComponent(selectedCompanyId)}`);
      const contentType = res.headers.get('content-type') || '';
      const raw = await res.text();
      if (!contentType.includes('application/json')) {
        throw new Error(`Failed to load documents (${res.status}): non-JSON response`);
      }
      const data = JSON.parse(raw);
      if (!res.ok) throw new Error(data?.error || 'Failed to load documents');
      const docs = Array.isArray(data?.documents) ? data.documents : [];
      setDocuments(docs);
    } catch (e: any) {
      setDocuments([]);
      setDocumentsError(e?.message || 'Failed to load documents');
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function loadDocs() {
      if (!selectedCompanyId) return;
      setDocumentsError(null);
      try {
        const res = await fetch(`/api/company-documents?companyId=${encodeURIComponent(selectedCompanyId)}`);
        const contentType = res.headers.get('content-type') || '';
        const raw = await res.text();
        if (!contentType.includes('application/json')) {
          throw new Error(`Failed to load documents (${res.status}): non-JSON response`);
        }
        const data = JSON.parse(raw);
        if (!res.ok) throw new Error(data?.error || 'Failed to load documents');
        const docs = Array.isArray(data?.documents) ? data.documents : [];
        if (!cancelled) setDocuments(docs);
      } catch (e: any) {
        if (!cancelled) {
          setDocuments([]);
          setDocumentsError(e?.message || 'Failed to load documents');
        }
      }
    }
    loadDocs();
    return () => {
      cancelled = true;
    };
  }, [selectedCompanyId]);

  useEffect(() => {
    // Document search is intended to be "documents-only" context.
    if (tab === 'search-documents') {
      setUseExternalSources(false);
    }
  }, [tab]);

  const docsByCategory = useMemo(() => {
    const map: Record<DocCategory, CompanyDocument[]> = {
      LOAN_DOCUMENTS: [],
      FINANCING_DOCUMENTS: [],
      LEGAL_AND_REGULATORY: [],
      OTHER: [],
    };
    for (const d of documents) {
      const k = (d.category || 'OTHER') as DocCategory;
      (map[k] || map.OTHER).push(d);
    }
    return map;
  }, [documents]);

  const selectedDocument = useMemo(() => {
    if (!selectedDocumentId) return null;
    return documents.find((d) => d.id === selectedDocumentId) || null;
  }, [documents, selectedDocumentId]);

  async function runPeriodReview() {
    if (!periodLabel) return;
    setPeriodLoading(true);
    setPeriodError(null);
    setPeriodResponse(null);

    try {
      const res = await fetch('/api/ai-analysis/period-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          periodLabel,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to run Period Review');
      }
      setPeriodResponse(data as PeriodReviewResponse);
    } catch (e: any) {
      setPeriodError(e?.message || 'Unknown error');
    } finally {
      setPeriodLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '16px', marginBottom: '20px' }}>
        <div />
      </div>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '2px solid #e2e8f0' }}>
        <button
          onClick={() => setTab('ask')}
          style={{
            padding: '12px 20px',
            background: tab === 'ask' ? '#667eea' : 'transparent',
            color: tab === 'ask' ? 'white' : '#64748b',
            border: 'none',
            borderBottom: tab === 'ask' ? '3px solid #667eea' : '3px solid transparent',
            fontSize: '16px',
            fontWeight: '700',
            cursor: 'pointer',
            borderRadius: '8px 8px 0 0',
          }}
        >
          Ask Corelytics
        </button>
        <button
          onClick={() => setTab('search-documents')}
          style={{
            padding: '12px 20px',
            background: tab === 'search-documents' ? '#667eea' : 'transparent',
            color: tab === 'search-documents' ? 'white' : '#64748b',
            border: 'none',
            borderBottom: tab === 'search-documents' ? '3px solid #667eea' : '3px solid transparent',
            fontSize: '16px',
            fontWeight: '700',
            cursor: 'pointer',
            borderRadius: '8px 8px 0 0',
          }}
        >
          Search Documents
        </button>
        <button
          onClick={() => setTab('period-review')}
          style={{
            padding: '12px 20px',
            background: tab === 'period-review' ? '#667eea' : 'transparent',
            color: tab === 'period-review' ? 'white' : '#64748b',
            border: 'none',
            borderBottom: tab === 'period-review' ? '3px solid #667eea' : '3px solid transparent',
            fontSize: '16px',
            fontWeight: '700',
            cursor: 'pointer',
            borderRadius: '8px 8px 0 0',
          }}
        >
          Period Review
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: tab === 'ask' ? '380px 1fr' : '1fr', gap: '16px' }}>
        {/* Presets (Ask only) */}
        {tab === 'ask' && (
          <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', height: 'fit-content' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ fontSize: '14px', fontWeight: '800', color: '#0f172a' }}>Suggested questions</div>
              <button
                onClick={() => setIsEditingQuestions((prev) => !prev)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  background: isEditingQuestions ? '#0ea5e9' : '#fff',
                  color: isEditingQuestions ? '#fff' : '#0f172a',
                  fontSize: '12px',
                  fontWeight: '700',
                  cursor: 'pointer',
                }}
              >
                {isEditingQuestions ? 'Done' : 'Edit'}
              </button>
            </div>
            {isEditingQuestions && (
              <div style={{ display: 'grid', gap: '8px', marginBottom: '10px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={saveQuestions}
                    disabled={!questionsDirty}
                    style={{
                      padding: '6px 10px',
                      borderRadius: '8px',
                      border: 'none',
                      background: questionsDirty ? '#16a34a' : '#94a3b8',
                      color: '#fff',
                      fontSize: '12px',
                      fontWeight: '700',
                      cursor: questionsDirty ? 'pointer' : 'not-allowed',
                    }}
                  >
                    Save
                  </button>
                  <button
                    onClick={resetQuestions}
                    style={{
                      padding: '6px 10px',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      background: '#fff',
                      color: '#0f172a',
                      fontSize: '12px',
                      fontWeight: '700',
                      cursor: 'pointer',
                    }}
                  >
                    Reset
                  </button>
                </div>
                <div style={{ fontSize: '12px', color: questionsDirty ? '#b45309' : '#64748b' }}>
                  {questionsError
                    ? questionsError
                    : questionsDirty
                      ? 'Unsaved changes'
                      : questionsSavedAt
                        ? `Saved at ${questionsSavedAt}`
                        : 'Saved'}
                </div>
              </div>
            )}
            <div style={{ display: 'grid', gap: '12px' }}>
              {Object.entries(presetQuestions).map(([category, questions]) => (
                <div key={category}>
                  <div style={{ fontSize: '12px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
                    {category}
                  </div>
                  <div style={{ display: 'grid', gap: '6px' }}>
                    {questions.map((q, idx) => (
                      <div key={`${category}-${idx}`} style={{ display: 'flex', gap: '6px', alignItems: 'stretch' }}>
                        <button
                          onClick={() => {
                            setQuestion(q);
                            setTab('ask');
                          }}
                          style={{
                            textAlign: 'left',
                            padding: '10px 12px',
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            color: '#0f172a',
                            fontSize: '13px',
                            lineHeight: '1.35',
                            flex: 1,
                          }}
                        >
                          {q}
                        </button>
                        {isEditingQuestions && (
                          <button
                            onClick={() => deleteQuestion(category, idx)}
                            title="Delete"
                            style={{
                              padding: '0 10px',
                              borderRadius: '10px',
                              border: '1px solid #fecaca',
                              background: '#fff',
                              color: '#b91c1c',
                              fontWeight: '800',
                              cursor: 'pointer',
                            }}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                    {isEditingQuestions && (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <input
                          value={newQuestionByCategory[category] || ''}
                          onChange={(e) =>
                            setNewQuestionByCategory((prev) => ({ ...prev, [category]: e.target.value }))
                          }
                          placeholder="Add a question…"
                          style={{
                            flex: 1,
                            padding: '8px 10px',
                            borderRadius: '10px',
                            border: '1px solid #e2e8f0',
                            fontSize: '12px',
                          }}
                        />
                        <button
                          onClick={() => addQuestion(category)}
                          style={{
                            padding: '8px 10px',
                            borderRadius: '10px',
                            border: 'none',
                            background: '#0ea5e9',
                            color: '#fff',
                            fontWeight: '800',
                            cursor: 'pointer',
                          }}
                        >
                          Add
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Main */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          {tab === 'ask' && (
            <div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'stretch' }}>
                <input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Ask a question…"
                  style={{
                    flex: 1,
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    outline: 'none',
                    fontSize: '15px',
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      runAsk(question, { mode: 'default' });
                    }
                  }}
                />
                <button
                  onClick={() => runAsk(question, { mode: 'default' })}
                  disabled={askLoading || !question.trim()}
                  style={{
                    padding: '12px 16px',
                    borderRadius: '10px',
                    border: 'none',
                    background: askLoading ? '#94a3b8' : '#0ea5e9',
                    color: 'white',
                    fontWeight: '800',
                    cursor: askLoading ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                  title="Run (Ctrl/Cmd+Enter)"
                >
                  {askLoading ? 'Searching…' : 'Search & Answer'}
                </button>
              </div>
              <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={useExternalSources}
                    onChange={(e) => setUseExternalSources(e.target.checked)}
                  />
                  <span style={{ fontSize: '13px', color: '#0f172a', fontWeight: 600 }}>Use external web sources</span>
                </label>
                <span style={{ fontSize: '12px', color: '#64748b' }}>
                  Off = internal financial/operational data only.
                </span>
              </div>

              {askError && (
                <div style={{ marginTop: '12px', padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: '10px' }}>
                  {askError}
                </div>
              )}

              {askResponse && (
                <div style={{ marginTop: '16px', display: 'grid', gap: '14px' }}>
                  <Section title="Short answer">
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.65', color: '#0f172a' }}>{askResponse.shortAnswer}</div>
                  </Section>
                  <Section title="Long answer">
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.7', color: '#0f172a' }}>{askResponse.longAnswer}</div>
                  </Section>
                  <Section title="Cited bullets (every bullet is sourced)">
                    <div style={{ display: 'grid', gap: '10px' }}>
                      {askResponse.citedBullets.map((b, idx) => (
                        <div key={idx} style={{ padding: '10px 12px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                          <div style={{ color: '#0f172a', lineHeight: '1.55' }}>• {b.text}</div>
                          <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {(b.citations || []).map((c, cIdx) => (
                              <a
                                key={`${idx}-${cIdx}`}
                                href={c.url}
                                target="_blank"
                                rel="noreferrer"
                                style={{ fontSize: '12px', color: '#2563eb', textDecoration: 'none' }}
                                title={c.title || c.url}
                              >
                                {c.title ? c.title : new URL(c.url).hostname}
                              </a>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Section>
                  <Section title="How this impacts us">
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.7', color: '#0f172a' }}>{askResponse.howThisImpactsUs}</div>
                  </Section>
                  <Section title="Sources">
                    <div style={{ display: 'grid', gap: '8px' }}>
                      {askResponse.sources.map((s, idx) => (
                        <a
                          key={idx}
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            padding: '10px 12px',
                            border: '1px solid #e2e8f0',
                            borderRadius: '10px',
                            color: '#0f172a',
                            textDecoration: 'none',
                            background: '#fff',
                          }}
                        >
                          <div style={{ fontSize: '14px', fontWeight: '800' }}>{s.title || s.url}</div>
                          {s.publishedDate && <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{s.publishedDate}</div>}
                          {s.snippet && <div style={{ fontSize: '13px', color: '#334155', marginTop: '6px', lineHeight: '1.45' }}>{s.snippet}</div>}
                        </a>
                      ))}
                    </div>
                  </Section>
                </div>
              )}
            </div>
          )}

          {tab === 'search-documents' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 900, color: '#0f172a' }}>Search Documents</div>
                  <div style={{ marginTop: '4px', fontSize: '12px', color: '#64748b' }}>
                    Pick one uploaded document, then ask a question about its contents.
                  </div>
                </div>
                {selectedDocumentId && (
                  <button
                    onClick={() => setSelectedDocumentId('')}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: '1px solid #e2e8f0',
                      background: '#fff',
                      color: '#0f172a',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    Clear document
                  </button>
                )}
              </div>

              <div style={{ marginTop: '12px' }}>
                <div style={{ fontSize: '12px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: '6px' }}>
                  Document
                </div>
                <DocumentPicker
                  docsByCategory={docsByCategory}
                  selectedDocumentId={selectedDocumentId}
                  selectedDocumentLabel={selectedDocument ? selectedDocument.originalFileName : ''}
                  onSelect={(id) => setSelectedDocumentId(id)}
                />
                {documentsError && (
                  <div style={{ marginTop: '8px', padding: '10px 12px', background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', borderRadius: '10px', fontSize: '13px' }}>
                    {documentsError}
                  </div>
                )}
                {selectedDocument && (
                  <div style={{ marginTop: '8px', fontSize: '13px', color: '#334155' }}>
                    Selected: <strong>{selectedDocument.originalFileName}</strong>{' '}
                    <span style={{ color: '#64748b' }}>
                      ({DOC_CATEGORY_META.find((c) => c.id === selectedDocument.category)?.label || 'Other'})
                    </span>
                    <button
                      onClick={() => window.open(`/api/company-documents/${selectedDocument.id}/open`, '_blank', 'noreferrer')}
                      style={{ marginLeft: '10px', border: 'none', background: 'transparent', color: '#2563eb', cursor: 'pointer', fontWeight: 800 }}
                    >
                      Open
                    </button>
                  </div>
                )}
              </div>

              {selectedDocument && String(selectedDocument.extractionStatus || '').toUpperCase() !== 'DONE' && (
                <div style={{ marginTop: '12px', padding: '10px 12px', background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', borderRadius: '10px', fontSize: '13px' }}>
                  Document text is not ready yet ({String(selectedDocument.extractionStatus)}). Wait for extraction to finish.
                </div>
              )}
              {selectedDocument && String(selectedDocument.extractionStatus || '').toUpperCase() === 'DONE' && String(selectedDocument.indexStatus || '').toUpperCase() === 'FAILED' && (
                <div style={{ marginTop: '12px', padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: '10px', fontSize: '13px' }}>
                  Document indexing failed. {selectedDocument.indexError ? `(${selectedDocument.indexError})` : ''} Try re-uploading the file.
                  <button
                    onClick={async () => {
                      try {
                        setAskError(null);
                        setAskLoading(true);
                        const res = await fetch(`/api/company-documents/${selectedDocument.id}/reindex`, { method: 'POST' });
                        const data = await res.json().catch(() => ({}));
                        if (!res.ok) throw new Error(data?.error || 'Failed to reindex');
                        await reloadDocuments();
                      } catch (e: any) {
                        setAskError(e?.message || 'Failed to reindex');
                      } finally {
                        setAskLoading(false);
                      }
                    }}
                    disabled={askLoading}
                    style={{ marginLeft: '10px', border: 'none', background: 'transparent', color: '#2563eb', cursor: 'pointer', fontWeight: 800 }}
                  >
                    Retry indexing
                  </button>
                </div>
              )}
              {selectedDocument && String(selectedDocument.extractionStatus || '').toUpperCase() === 'DONE' && String(selectedDocument.indexStatus || '').toUpperCase() === 'PENDING' && (
                <div style={{ marginTop: '12px', padding: '10px 12px', background: '#e0f2fe', border: '1px solid #7dd3fc', color: '#075985', borderRadius: '10px', fontSize: '13px' }}>
                  Indexing document for search. Your first question may take a bit longer.
                </div>
              )}

              <div style={{ marginTop: '14px', display: 'flex', gap: '10px', alignItems: 'stretch' }}>
                <input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder={selectedDocumentId ? 'Ask about this document…' : 'Select a document first…'}
                  style={{
                    flex: 1,
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    outline: 'none',
                    fontSize: '15px',
                  }}
                  disabled={
                    !selectedDocumentId ||
                    (selectedDocument ? String(selectedDocument.extractionStatus || '').toUpperCase() !== 'DONE' : false) ||
                    (selectedDocument ? String(selectedDocument.indexStatus || '').toUpperCase() === 'FAILED' : false)
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      runAsk(question, { mode: 'document' });
                    }
                  }}
                />
                <button
                  onClick={() => runAsk(question, { mode: 'document' })}
                  disabled={
                    askLoading ||
                    !question.trim() ||
                    !selectedDocumentId ||
                    (selectedDocument ? String(selectedDocument.extractionStatus || '').toUpperCase() !== 'DONE' : false) ||
                    (selectedDocument ? String(selectedDocument.indexStatus || '').toUpperCase() === 'FAILED' : false)
                  }
                  style={{
                    padding: '12px 16px',
                    borderRadius: '10px',
                    border: 'none',
                    background: askLoading ? '#94a3b8' : '#0ea5e9',
                    color: 'white',
                    fontWeight: '800',
                    cursor: askLoading ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                  title="Run (Ctrl/Cmd+Enter)"
                >
                  {askLoading ? 'Searching…' : 'Search Document'}
                </button>
              </div>

              {askError && (
                <div style={{ marginTop: '12px', padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: '10px' }}>
                  {askError}
                </div>
              )}

              {askResponse && (
                <div style={{ marginTop: '16px', display: 'grid', gap: '14px' }}>
                  <Section title="Short answer">
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.65', color: '#0f172a' }}>{askResponse.shortAnswer}</div>
                  </Section>
                  <Section title="Long answer">
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.7', color: '#0f172a' }}>{askResponse.longAnswer}</div>
                  </Section>
                  <Section title="Cited bullets (every bullet is sourced)">
                    <div style={{ display: 'grid', gap: '10px' }}>
                      {askResponse.citedBullets.map((b, idx) => (
                        <div key={idx} style={{ padding: '10px 12px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                          <div style={{ color: '#0f172a', lineHeight: '1.55' }}>• {b.text}</div>
                          <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {(b.citations || []).map((c, cIdx) => (
                              <a
                                key={`${idx}-${cIdx}`}
                                href={c.url}
                                target="_blank"
                                rel="noreferrer"
                                style={{ fontSize: '12px', color: '#2563eb', textDecoration: 'none' }}
                                title={c.title || c.url}
                              >
                                {c.title ? c.title : new URL(c.url).hostname}
                              </a>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Section>
                  <Section title="How this impacts us">
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.7', color: '#0f172a' }}>{askResponse.howThisImpactsUs}</div>
                  </Section>
                  <Section title="Sources">
                    <div style={{ display: 'grid', gap: '8px' }}>
                      {askResponse.sources.map((s, idx) => (
                        <a
                          key={idx}
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            padding: '10px 12px',
                            border: '1px solid #e2e8f0',
                            borderRadius: '10px',
                            color: '#0f172a',
                            textDecoration: 'none',
                            background: '#fff',
                          }}
                        >
                          <div style={{ fontSize: '14px', fontWeight: '800' }}>{s.title || s.url}</div>
                          {s.publishedDate && <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{s.publishedDate}</div>}
                          {s.snippet && <div style={{ fontSize: '13px', color: '#334155', marginTop: '6px', lineHeight: '1.45' }}>{s.snippet}</div>}
                        </a>
                      ))}
                    </div>
                  </Section>
                </div>
              )}
            </div>
          )}

          {tab === 'period-review' && (
            <div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ minWidth: '260px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
                    Period (month)
                  </div>
                  <select
                    value={periodLabel}
                    onChange={(e) => setPeriodLabel(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 12px',
                      borderRadius: '10px',
                      border: '1px solid #cbd5e1',
                      fontSize: '14px',
                    }}
                  >
                    {monthly.map((m) => (
                      <option key={m.month} value={m.month}>
                        {m.month}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={runPeriodReview}
                  disabled={periodLoading || !periodLabel}
                  style={{
                    padding: '12px 16px',
                    borderRadius: '10px',
                    border: 'none',
                    background: periodLoading ? '#94a3b8' : '#667eea',
                    color: 'white',
                    fontWeight: '800',
                    cursor: periodLoading ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap',
                    height: '42px',
                  }}
                >
                  {periodLoading ? 'Analyzing…' : 'Run Period Review'}
                </button>
              </div>

              {periodError && (
                <div style={{ marginTop: '12px', padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: '10px' }}>
                  {periodError}
                </div>
              )}

              {periodResponse && (
                <div style={{ marginTop: '16px', display: 'grid', gap: '14px' }}>
                  <Section title={`Executive summary — ${periodResponse.period.label}`}>
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.7' }}>{periodResponse.executiveSummary}</div>
                  </Section>
                  <Section title="Performance vs goals">
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.7' }}>{periodResponse.performanceVsGoals}</div>
                  </Section>
                  <Section title="Peer & market context (sourced)">
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.7' }}>{periodResponse.peerAndMarketContext}</div>
                  </Section>
                  <Section title="Operational trends (focus on negative)">
                    {periodResponse.operationalTrends.negativeTrendAlerts.length > 0 && (
                      <div style={{ display: 'grid', gap: '10px', marginBottom: '10px' }}>
                        {periodResponse.operationalTrends.negativeTrendAlerts.map((a, idx) => (
                          <div key={idx} style={{ padding: '12px', borderRadius: '10px', background: '#fff1f2', border: '1px solid #fecdd3' }}>
                            <div style={{ fontWeight: '900', color: '#9f1239' }}>{a.metric}</div>
                            <div style={{ marginTop: '6px', color: '#0f172a' }}><strong>Signal:</strong> {a.signal}</div>
                            <div style={{ marginTop: '6px', color: '#0f172a' }}><strong>Why it matters:</strong> {a.whyItMatters}</div>
                            <div style={{ marginTop: '6px', color: '#0f172a' }}><strong>Evidence:</strong> {a.evidence}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.7' }}>{periodResponse.operationalTrends.narrative}</div>
                  </Section>
                  <Section title="Drivers & risks">
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.7' }}>{periodResponse.driversAndRisks}</div>
                  </Section>
                  <Section title="Opportunities (extremely successful scenario)">
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.7' }}>{periodResponse.opportunities}</div>
                  </Section>
                  <Section title="Appendix (sources + run notes)">
                    {periodResponse.appendix.sources.length > 0 && (
                      <div style={{ marginBottom: '10px' }}>
                        <div style={{ fontWeight: '800', marginBottom: '6px' }}>Sources</div>
                        <div style={{ display: 'grid', gap: '6px' }}>
                          {periodResponse.appendix.sources.map((s, idx) => (
                            <a key={idx} href={s.url} target="_blank" rel="noreferrer" style={{ color: '#2563eb', textDecoration: 'none' }}>
                              {s.title || s.url}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                    {periodResponse.appendix.notes.length > 0 && (
                      <div>
                        <div style={{ fontWeight: '800', marginBottom: '6px' }}>Notes</div>
                        <ul style={{ margin: 0, paddingLeft: '18px', color: '#0f172a' }}>
                          {periodResponse.appendix.notes.map((n, idx) => (
                            <li key={idx} style={{ marginBottom: '4px' }}>{n}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </Section>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section(props: { title: string; children: any }) {
  return (
    <div style={{ padding: '14px 14px', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#ffffff' }}>
      <div style={{ fontSize: '12px', fontWeight: '900', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: '8px' }}>
        {props.title}
      </div>
      {props.children}
    </div>
  );
}

function DocumentPicker(props: {
  docsByCategory: Record<DocCategory, CompanyDocument[]>;
  selectedDocumentId: string;
  selectedDocumentLabel: string;
  onSelect: (id: string) => void;
}) {
  const { docsByCategory, selectedDocumentId, selectedDocumentLabel, onSelect } = props;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return docsByCategory;
    const out: Record<DocCategory, CompanyDocument[]> = {
      LOAN_DOCUMENTS: [],
      FINANCING_DOCUMENTS: [],
      LEGAL_AND_REGULATORY: [],
      OTHER: [],
    };
    for (const cat of Object.keys(out) as DocCategory[]) {
      out[cat] = (docsByCategory[cat] || []).filter((d) =>
        String(d.originalFileName || '').toLowerCase().includes(q),
      );
    }
    return out;
  }, [docsByCategory, query]);

  const totalCount = useMemo(() => {
    return (Object.keys(filtered) as DocCategory[]).reduce((acc, k) => acc + (filtered[k]?.length || 0), 0);
  }, [filtered]);

  function badgeFor(status: string) {
    const s = String(status || '').toUpperCase();
    if (s === 'DONE') return { label: 'Ready', bg: '#dcfce7', fg: '#166534', border: '#86efac' };
    if (s === 'PENDING') return { label: 'Processing', bg: '#e0f2fe', fg: '#075985', border: '#7dd3fc' };
    if (s === 'NO_TEXT') return { label: 'No text', bg: '#fff7ed', fg: '#9a3412', border: '#fed7aa' };
    if (s === 'FAILED') return { label: 'Failed', bg: '#fef2f2', fg: '#991b1b', border: '#fecaca' };
    return { label: s || 'Unknown', bg: '#f1f5f9', fg: '#334155', border: '#cbd5e1' };
  }

  function indexBadgeFor(extractionStatus: string, indexStatus: string | undefined) {
    const ex = String(extractionStatus || '').toUpperCase();
    const ix = String(indexStatus || '').toUpperCase();
    if (ex !== 'DONE') return badgeFor(ex);
    if (ix === 'DONE') return { label: 'Indexed', bg: '#dcfce7', fg: '#166534', border: '#86efac' };
    if (ix === 'FAILED') return { label: 'Index failed', bg: '#fef2f2', fg: '#991b1b', border: '#fecaca' };
    return { label: 'Indexing', bg: '#e0f2fe', fg: '#075985', border: '#7dd3fc' };
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          textAlign: 'left',
          padding: '12px 12px',
          borderRadius: '12px',
          border: '1px solid #cbd5e1',
          background: 'white',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '10px',
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 900, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selectedDocumentId ? selectedDocumentLabel : 'Select a document…'}
          </div>
          <div style={{ marginTop: '2px', fontSize: '12px', color: '#64748b' }}>One document at a time</div>
        </div>
        <div style={{ fontWeight: 900, color: '#64748b' }}>{open ? '▲' : '▼'}</div>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Document picker"
          style={{
            position: 'absolute',
            zIndex: 50,
            top: 'calc(100% + 8px)',
            left: 0,
            right: 0,
            background: 'white',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 12px 30px rgba(0,0,0,0.12)',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search documents…"
              style={{ width: '100%', padding: '10px 10px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '13px' }}
              autoFocus
            />
            <div style={{ marginTop: '6px', fontSize: '12px', color: '#64748b' }}>
              {totalCount} document{totalCount === 1 ? '' : 's'}
            </div>
          </div>

          <div style={{ maxHeight: '360px', overflow: 'auto' }}>
            {DOC_CATEGORY_META.map((cat) => {
              const list = filtered[cat.id] || [];
              return (
                <div key={cat.id}>
                  <div style={{ padding: '10px 12px', fontSize: '12px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.09em', background: '#ffffff' }}>
                    {cat.label} <span style={{ fontWeight: 800, color: '#94a3b8' }}>({list.length})</span>
                  </div>
                  {list.length === 0 ? (
                    <div style={{ padding: '8px 12px', fontSize: '13px', color: '#94a3b8' }}>No documents</div>
                  ) : (
                    <div style={{ display: 'grid' }}>
                      {list.map((d) => {
                        const b = indexBadgeFor(d.extractionStatus, d.indexStatus);
                        const active = d.id === selectedDocumentId;
                        return (
                          <button
                            key={d.id}
                            onClick={() => {
                              onSelect(d.id);
                              setOpen(false);
                            }}
                            style={{
                              padding: '10px 12px',
                              border: 'none',
                              borderTop: '1px solid #f1f5f9',
                              background: active ? '#e0f2fe' : 'white',
                              cursor: 'pointer',
                              textAlign: 'left',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: '10px',
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 900, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {d.originalFileName}
                              </div>
                              <div style={{ marginTop: '2px', fontSize: '12px', color: '#64748b' }}>
                                {d.createdAt ? new Date(d.createdAt).toLocaleString() : ''}
                              </div>
                            </div>
                            <div style={{ padding: '4px 8px', borderRadius: '999px', border: `1px solid ${b.border}`, background: b.bg, color: b.fg, fontSize: '12px', fontWeight: 900, flexShrink: 0 }}>
                              {b.label}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

