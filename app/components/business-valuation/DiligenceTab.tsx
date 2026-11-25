'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  INTERVIEW_TOPICS,
  REP_LETTER_STATUSES,
  automaticReliedOnSources,
  diligenceGaps,
  normalizeDiligence,
  representationLetterDraft,
  type Diligence,
} from '@/lib/business-valuation/diligence';
import { normalizeDealTerms } from '@/lib/business-valuation/deal-terms';
import { formatMonthKey } from '@/lib/business-valuation/fiscal-years';
import { formatEstDateLabel, formatEstDateTime } from '@/lib/time/eastern';
import { CARD, button, cardSubtitle, cardTitle, formColumns, formRow, formRowLabel, groupTitle, input, pendingNote, td } from './styles';

type Props = {
  engagement: any;
  snapshot: any;
  companyName: string;
  documents: Array<{ id: string; originalFileName: string; category: string | null }>;
  locked: boolean;
  saving: string | null;
  run: (label: string, body: Record<string, unknown>) => Promise<boolean>;
};

const textarea = { ...input, height: 'auto', resize: 'vertical' as const, fontFamily: 'inherit' };

export default function DiligenceTab({ engagement, snapshot, companyName, documents, locked, saving, run }: Props) {
  const saved: Diligence = engagement.diligence;
  const [pending, setPending] = useState<Record<string, unknown>>({});
  const [justSaved, setJustSaved] = useState(false);
  const [documentFilter, setDocumentFilter] = useState('');
  const [showLetter, setShowLetter] = useState(false);
  const [copied, setCopied] = useState(false);
  const hasPending = Object.keys(pending).length > 0;

  const value = (field: keyof Diligence) => (field in pending ? pending[field] : saved[field]);
  const edit = (field: keyof Diligence, next: unknown) => {
    setJustSaved(false);
    setPending((current) => ({ ...current, [field]: next }));
  };
  const responses = useMemo(
    () => ({ ...saved.responses, ...((pending.responses as Record<string, string>) || {}) }) as Record<string, string>,
    [saved.responses, pending.responses],
  );
  const editResponse = (key: string, text: string) => edit('responses', { ...((pending.responses as Record<string, string>) || {}), [key]: text });
  const reliedOn = new Set((value('reliedOnDocumentIds') as string[]) || []);
  const toggleRelied = (id: string, checked: boolean) => {
    const next = new Set(reliedOn);
    if (checked) next.add(id);
    else next.delete(id);
    edit('reliedOnDocumentIds', Array.from(next));
  };

  const preview = useMemo(() => normalizeDiligence({ ...saved, ...pending, responses }), [saved, pending, responses]);
  const gaps = diligenceGaps(preview);
  const dealTerms = normalizeDealTerms(engagement.dealTerms);
  const documentName = (id: string | null) => documents.find((doc) => doc.id === id)?.originalFileName || null;
  const automatic = automaticReliedOnSources(snapshot, {
    appraisalCount: (engagement.appraisals || []).length,
    dealDocumentName: documentName(dealTerms.dealDocumentId),
    formatMonth: formatMonthKey,
    formatDate: (iso) => (iso ? formatEstDateTime(iso) : ''),
  });
  const filteredDocuments = documents.filter((doc) => !documentFilter || doc.originalFileName.toLowerCase().includes(documentFilter.toLowerCase()));
  const valuationDate = engagement.valuationDate ? formatEstDateLabel(String(engagement.valuationDate).slice(0, 10)) : null;
  const letter = representationLetterDraft({
    companyName,
    valuationDate,
    appraiserFirm: 'Corelytics',
    signerName: preview.repLetterSignerName,
    signerTitle: preview.repLetterSignerTitle,
    documents: [
      ...automatic.map((source) => `${source.label}: ${source.detail}`),
      ...preview.reliedOnDocumentIds.map((id) => documentName(id)).filter((name): name is string => Boolean(name)),
    ],
  });

  const save = async () => {
    if (await run('diligence', { action: 'update-diligence', diligence: pending })) {
      setPending({});
      setJustSaved(true);
    }
  };
  const copyLetter = async () => {
    try {
      await navigator.clipboard.writeText(letter);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setShowLetter(true);
    }
  };
  const downloadLetter = () => {
    const url = URL.createObjectURL(new Blob([letter], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${companyName || 'Company'} - Management representation letter.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const row = (label: string, control: ReactNode) => (
    <label style={formRow}>
      <span style={formRowLabel}>{label}</span>
      {control}
    </label>
  );
  const dateInput = (field: keyof Diligence) => (
    <input type="date" disabled={locked} value={String(value(field) ?? '')} onChange={(event) => edit(field, event.target.value)} style={{ ...input, width: '140px' }} />
  );
  const textInput = (field: keyof Diligence, placeholder = '') => (
    <input type="text" disabled={locked} placeholder={placeholder} value={String(value(field) ?? '')} onChange={(event) => edit(field, event.target.value)} style={{ ...input, flex: 1, minWidth: 0 }} />
  );
  const smallButton = { ...button, padding: '3px 8px', fontSize: '11px' };

  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <div style={cardTitle}>Management interview and site visit</div>
            <div style={cardSubtitle}>Save records the whole Diligence tab.</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
            {hasPending && <span style={pendingNote}>Unsaved changes</span>}
            <button
              type="button"
              disabled={!hasPending || Boolean(saving) || locked}
              onClick={() => void save()}
              style={{ ...button, background: !hasPending && justSaved ? '#16a34a' : button.background, opacity: !hasPending && !justSaved ? 0.55 : 1 }}
            >
              {saving === 'diligence' ? 'Saving…' : !hasPending && justSaved ? 'Saved' : 'Save'}
            </button>
          </div>
        </div>

        <div style={formColumns}>
          <div>
            <div style={groupTitle}>Interview</div>
            {row('Date', dateInput('interviewDate'))}
            {row(
              'Method',
              <select disabled={locked} value={String(value('interviewMethod') ?? '')} onChange={(event) => edit('interviewMethod', event.target.value || null)} style={{ ...input, flex: 1, minWidth: 0 }}>
                <option value="">Not recorded</option>
                <option value="IN_PERSON">In person</option>
                <option value="VIDEO">Video call</option>
                <option value="PHONE">Phone</option>
              </select>,
            )}
            {row('Attendees', textInput('interviewAttendees', 'Names and roles'))}
          </div>
          <div>
            <div style={groupTitle}>Site visit</div>
            {row('Date', dateInput('siteVisitDate'))}
            {row('Attendees', textInput('siteVisitAttendees', 'Names and roles'))}
          </div>
          <div>
            <div style={groupTitle}>Site visit notes</div>
            <textarea
              rows={3}
              disabled={locked}
              placeholder="Condition of the premises and equipment, inventory observed, staffing, or why no visit was made."
              value={String(value('siteVisitNotes') ?? '')}
              onChange={(event) => edit('siteVisitNotes', event.target.value)}
              style={{ ...textarea, marginTop: '4px' }}
            />
          </div>
        </div>

        <div style={{ ...groupTitle, marginTop: '10px' }}>Interview notes</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '6px 16px', marginTop: '4px', maxWidth: '1400px' }}>
          {INTERVIEW_TOPICS.map((topic) => (
            <label key={topic.key} style={{ display: 'block' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>{topic.label}</span>
              <textarea
                rows={3}
                disabled={locked}
                placeholder={topic.prompt}
                value={responses[topic.key] ?? ''}
                onChange={(event) => editResponse(topic.key, event.target.value)}
                style={{ ...textarea, marginTop: '2px' }}
              />
            </label>
          ))}
        </div>
      </div>

      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '6px' }}>
          <div style={cardTitle}>Documents relied on</div>
          <div style={cardSubtitle}>Corelytics data is listed automatically from the latest snapshot. Check the data room files you also relied on.</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 640px))', gap: '12px' }}>
          <div>
            <div style={groupTitle}>Corelytics data</div>
            {automatic.length === 0 ? (
              <div style={{ fontSize: '12px', color: '#64748b', padding: '4px 0' }}>Freeze data on the Data Snapshot tab to list the data relied on.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {automatic.map((source) => (
                    <tr key={source.key}>
                      <td style={td}>{source.label}</td>
                      <td style={{ ...td, color: '#64748b' }}>{source.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div>
            <div style={{ ...groupTitle, display: 'flex', alignItems: 'center' }}>
              <span>Data room files ({reliedOn.size} selected)</span>
              <input
                type="text"
                placeholder="Filter"
                value={documentFilter}
                onChange={(event) => setDocumentFilter(event.target.value)}
                style={{ ...input, width: '160px', marginLeft: 'auto', textTransform: 'none', fontWeight: 400 }}
              />
            </div>
            <div style={{ maxHeight: '220px', overflowY: 'auto', borderBottom: '1px solid #f1f5f9' }}>
              {filteredDocuments.length === 0 ? (
                <div style={{ fontSize: '12px', color: '#64748b', padding: '4px 0' }}>{documents.length === 0 ? 'No files in the data room.' : 'No files match.'}</div>
              ) : (
                filteredDocuments.map((doc) => (
                  <label key={doc.id} style={{ ...formRow, cursor: locked ? 'not-allowed' : 'pointer', fontSize: '12px', color: '#1e293b' }}>
                    <input type="checkbox" disabled={locked} checked={reliedOn.has(doc.id)} onChange={(event) => toggleRelied(doc.id, event.target.checked)} style={{ margin: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.originalFileName}</span>
                    {doc.category && <span style={{ fontSize: '11px', color: '#64748b' }}>{doc.category}</span>}
                  </label>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <div style={cardTitle}>Management representation letter</div>
            <div style={cardSubtitle}>Draft from the template, send for signature, then attach the signed copy from the data room.</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
            <button type="button" onClick={() => setShowLetter(!showLetter)} style={{ ...smallButton, background: '#64748b' }}>{showLetter ? 'Hide draft' : 'Show draft'}</button>
            <button type="button" onClick={() => void copyLetter()} style={smallButton}>{copied ? 'Copied' : 'Copy draft'}</button>
            <button type="button" onClick={downloadLetter} style={smallButton}>Download draft</button>
          </div>
        </div>
        <div style={formColumns}>
          <div>
            <div style={groupTitle}>Signer</div>
            {row('Name', textInput('repLetterSignerName'))}
            {row('Title', textInput('repLetterSignerTitle', 'e.g. Owner and President'))}
          </div>
          <div>
            <div style={groupTitle}>Signature tracking</div>
            {row(
              'Status',
              <select disabled={locked} value={String(value('repLetterStatus'))} onChange={(event) => edit('repLetterStatus', event.target.value)} style={{ ...input, flex: 1, minWidth: 0 }}>
                {REP_LETTER_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
              </select>,
            )}
            {row('Date sent', dateInput('repLetterSentDate'))}
            {row('Date signed', dateInput('repLetterSignedDate'))}
          </div>
          <div>
            <div style={groupTitle}>Signed copy</div>
            {row(
              'Data room file',
              <select disabled={locked} value={String(value('repLetterDocumentId') ?? '')} onChange={(event) => edit('repLetterDocumentId', event.target.value || null)} style={{ ...input, flex: 1, minWidth: 0 }}>
                <option value="">Not attached</option>
                {documents.map((doc) => <option key={doc.id} value={doc.id}>{doc.originalFileName}</option>)}
              </select>,
            )}
          </div>
        </div>
        {showLetter && (
          <pre style={{ margin: '8px 0 0', padding: '8px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '12px', fontFamily: 'inherit', whiteSpace: 'pre-wrap', maxWidth: '900px' }}>{letter}</pre>
        )}
      </div>

      {gaps.length > 0 && (
        <div style={{ ...CARD, background: '#fffbeb', borderColor: '#fde68a' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#92400e', marginBottom: '4px' }}>Open diligence items</div>
          {gaps.map((gap) => (
            <div key={gap} style={{ fontSize: '12px', color: '#78350f' }}>• {gap}</div>
          ))}
        </div>
      )}
    </div>
  );
}
