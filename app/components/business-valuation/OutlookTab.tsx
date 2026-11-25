'use client';

import { useMemo, useState } from 'react';
import {
  INDICATOR_SCOPES,
  OUTLOOK_SECTIONS,
  PUBLISHED_OUTLOOKS,
  buildOutlookDraft,
  federalReserveDistrict,
  formatIndicatorChange,
  formatIndicatorValue,
  formatObservationDate,
  normalizeOutlook,
  outlookCitations,
  outlookGaps,
  type Outlook,
  type OutlookSectionKey,
  type PublishedOutlookEntry,
  type PublishedOutlookKey,
} from '@/lib/business-valuation/outlook';
import { formatEstDateLabel, formatEstDateTime } from '@/lib/time/eastern';
import { CARD, button, cardSubtitle, cardTitle, input, pendingNote, td, th } from './styles';

type Props = {
  engagement: any;
  companyName: string;
  industryTable: { industryId: string; industryName: string } | null;
  locked: boolean;
  saving: string | null;
  run: (label: string, body: Record<string, unknown>) => Promise<boolean>;
};

type Pending = Partial<Record<OutlookSectionKey, string>> & { published?: Partial<Record<PublishedOutlookKey, Partial<PublishedOutlookEntry>>> };

const textarea = { ...input, height: 'auto', resize: 'vertical' as const, fontFamily: 'inherit' };
const smallButton = { ...button, padding: '3px 8px', fontSize: '11px' };

export default function OutlookTab({ engagement, companyName, industryTable, locked, saving, run }: Props) {
  const saved: Outlook = engagement.outlook;
  const [pending, setPending] = useState<Pending>({});
  const [justSaved, setJustSaved] = useState(false);
  const hasPending = Object.keys(pending).length > 0;
  const valuationDate: string | null = engagement.valuationDate ? String(engagement.valuationDate).slice(0, 10) : null;

  const preview = useMemo(() => {
    const published: Record<string, object> = { ...saved.published };
    for (const [key, entry] of Object.entries(pending.published || {})) published[key] = { ...(published[key] || {}), ...entry };
    const sections = Object.fromEntries(OUTLOOK_SECTIONS.filter((section) => section.key in pending).map((section) => [section.key, pending[section.key]]));
    return normalizeOutlook({ ...saved, ...sections, published });
  }, [saved, pending]);

  const sectionText = (key: OutlookSectionKey) => (key in pending ? pending[key] ?? '' : saved[key] ?? '');
  const editSection = (key: OutlookSectionKey, text: string) => {
    setJustSaved(false);
    setPending((current) => ({ ...current, [key]: text }));
  };
  const publishedValue = (key: PublishedOutlookKey, field: keyof PublishedOutlookEntry) => {
    const edited = pending.published?.[key];
    if (edited && field in edited) return edited[field] ?? '';
    return saved.published[key]?.[field] ?? '';
  };
  const editPublished = (key: PublishedOutlookKey, field: keyof PublishedOutlookEntry, text: string) => {
    setJustSaved(false);
    setPending((current) => ({ ...current, published: { ...current.published, [key]: { ...current.published?.[key], [field]: text } } }));
  };

  const save = async () => {
    if (await run('outlook', { action: 'update-outlook', outlook: pending })) {
      setPending({});
      setJustSaved(true);
    }
  };
  const buildDraft = () => {
    const hasText = OUTLOOK_SECTIONS.some((section) => sectionText(section.key).trim());
    if (hasText && !window.confirm('Replace the current text in all three sections with a new draft?')) return;
    const draft = buildOutlookDraft(preview, {
      companyName,
      industryName: industryTable?.industryName || null,
      industryCode: industryTable?.industryId || null,
      valuationDate: valuationDate ? formatEstDateLabel(valuationDate) : null,
    });
    setJustSaved(false);
    setPending((current) => ({ ...current, ...draft }));
  };

  const industryDraftHint = !valuationDate
    ? 'Set the valuation date on the Engagement tab first'
    : saved.indicators.length === 0
      ? 'Pull the economic indicators first (top of this tab)'
      : null;
  const canDraftIndustry = !industryDraftHint;
  const draftIndustryWithAi = async () => {
    const message = hasPending
      ? 'Save your unsaved Outlook changes and replace the Industry text with an AI draft?'
      : 'Replace the current Industry text with an AI draft?';
    if ((hasPending || sectionText('industry').trim()) && !window.confirm(message)) return;
    if (hasPending) {
      if (!(await run('outlook', { action: 'update-outlook', outlook: pending }))) return;
      setPending({});
    }
    if (await run('outlook-ai', { action: 'draft-industry-outlook' })) setJustSaved(false);
  };

  const geography = saved.geography;
  const district = federalReserveDistrict(geography?.stateCode);
  const gaps = [...saved.indicatorNotes, ...outlookGaps(preview, valuationDate)];
  const citations = outlookCitations(preview);
  const canApprove = !hasPending && !saved.approvedAt && OUTLOOK_SECTIONS.every((section) => saved[section.key]) && saved.indicators.length > 0;
  const place = geography
    ? [geography.countyName, geography.metroName, geography.stateName].filter(Boolean).join(' · ')
    : null;

  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <div style={cardTitle}>Economic indicators</div>
            <div style={cardSubtitle}>
              {saved.indicatorsAsOf
                ? `As of ${formatEstDateLabel(saved.indicatorsAsOf)}. Pulled ${saved.indicatorsFetchedAt ? formatEstDateTime(saved.indicatorsFetchedAt) : ''} from FRED, BLS, and the Census geocoder.`
                : 'National, state, metro, county, and industry data as of the valuation date.'}
            </div>
          </div>
          <button
            type="button"
            disabled={locked || Boolean(saving) || !valuationDate}
            onClick={() => void run('outlook-refresh', { action: 'refresh-economic-indicators' })}
            style={{ ...button, marginLeft: 'auto', opacity: locked || !valuationDate ? 0.55 : 1 }}
            title={valuationDate ? undefined : 'Set the valuation date on the Engagement tab first'}
          >
            {saving === 'outlook-refresh' ? 'Pulling…' : saved.indicators.length ? 'Refresh indicators' : 'Pull indicators'}
          </button>
        </div>
        {place && (
          <div style={{ fontSize: '12px', color: '#334155', marginBottom: '6px' }}>
            <span style={{ fontWeight: 600 }}>Location:</span> {place}
            <span style={{ color: '#64748b' }}>{geography?.source === 'CENSUS_GEOCODER' ? ' (matched from the company address)' : ' (state only)'}</span>
            {district && (
              <>
                {' · '}
                <span style={{ fontWeight: 600 }}>Federal Reserve district:</span> {district.name} ({district.number})
              </>
            )}
          </div>
        )}
        {saved.indicators.length === 0 ? (
          <div style={{ fontSize: '12px', color: '#64748b' }}>No indicators pulled yet.</div>
        ) : (
          <table style={{ width: '100%', maxWidth: '1200px', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Indicator</th>
                <th style={th}>Area</th>
                <th style={{ ...th, textAlign: 'right' }}>Latest</th>
                <th style={th}>Period</th>
                <th style={{ ...th, textAlign: 'right' }}>Year earlier</th>
                <th style={{ ...th, textAlign: 'right' }}>Change</th>
                <th style={th}>Source</th>
              </tr>
            </thead>
            <tbody>
              {INDICATOR_SCOPES.flatMap((scope) => {
                const items = saved.indicators.filter((indicator) => indicator.scope === scope.value);
                if (items.length === 0) return [];
                return [
                  <tr key={scope.value}>
                    <td colSpan={7} style={{ ...td, fontSize: '11px', fontWeight: 700, color: '#0f172a', background: '#f8fafc', textTransform: 'uppercase' }}>{scope.label}</td>
                  </tr>,
                  ...items.map((indicator) => (
                    <tr key={indicator.key}>
                      <td style={td}>{indicator.label}</td>
                      <td style={{ ...td, color: '#64748b' }}>{indicator.area}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{formatIndicatorValue(indicator.value, indicator.unit, indicator.unitsLabel)}</td>
                      <td style={td}>{formatObservationDate(indicator.date, indicator.frequency)}</td>
                      <td style={{ ...td, textAlign: 'right', color: '#64748b' }}>{formatIndicatorValue(indicator.priorValue, indicator.unit, indicator.unitsLabel)}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{formatIndicatorChange(indicator)}</td>
                      <td style={td}>
                        <a href={indicator.url} target="_blank" rel="noreferrer" style={{ color: '#2751d0', textDecoration: 'none' }}>
                          {indicator.provider} {indicator.seriesId}
                        </a>
                        {indicator.provider === 'FRED' && indicator.vintage === 'CURRENT' && <span style={{ color: '#b45309' }}> · revised</span>}
                      </td>
                    </tr>
                  )),
                ];
              })}
            </tbody>
          </table>
        )}
      </div>

      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <div style={cardTitle}>Published outlooks</div>
            <div style={cardSubtitle}>Use the edition current at the valuation date. Save records the whole Outlook tab.</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
            {hasPending && <span style={pendingNote}>Unsaved changes</span>}
            <button
              type="button"
              disabled={!hasPending || Boolean(saving) || locked}
              onClick={() => void save()}
              style={{ ...button, background: !hasPending && justSaved ? '#16a34a' : button.background, opacity: !hasPending && !justSaved ? 0.55 : 1 }}
            >
              {saving === 'outlook' ? 'Saving…' : !hasPending && justSaved ? 'Saved' : 'Save'}
            </button>
          </div>
        </div>
        <table style={{ width: '100%', maxWidth: '1200px', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...th, width: '230px' }}>Source</th>
              <th style={{ ...th, width: '130px' }}>Published</th>
              <th style={{ ...th, width: '260px' }}>Link</th>
              <th style={th}>Key points</th>
            </tr>
          </thead>
          <tbody>
            {PUBLISHED_OUTLOOKS.map((item) => {
              const link = String(publishedValue(item.key, 'url') || item.url);
              return (
                <tr key={item.key}>
                  <td style={td}>
                    <div style={{ fontWeight: 600 }}>
                      {item.title}
                      {item.key === 'BEIGE_BOOK' && district ? `, ${district.name} District` : ''}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>{item.publisher}</div>
                  </td>
                  <td style={td}>
                    <input type="date" disabled={locked} value={String(publishedValue(item.key, 'publishedDate'))} onChange={(event) => editPublished(item.key, 'publishedDate', event.target.value)} style={input} />
                  </td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <input type="text" disabled={locked} placeholder={item.url} value={String(publishedValue(item.key, 'url'))} onChange={(event) => editPublished(item.key, 'url', event.target.value)} style={{ ...input, flex: 1, minWidth: 0 }} />
                      <a href={link} target="_blank" rel="noreferrer" style={{ fontSize: '11px', color: '#2751d0', alignSelf: 'center', textDecoration: 'none' }}>Open</a>
                    </div>
                  </td>
                  <td style={td}>
                    <textarea rows={2} disabled={locked} placeholder={item.prompt} value={String(publishedValue(item.key, 'keyPoints'))} onChange={(event) => editPublished(item.key, 'keyPoints', event.target.value)} style={textarea} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <div style={cardTitle}>Economic and Industry Outlook</div>
            <div style={cardSubtitle}>
              {saved.approvedAt ? `Approved by ${saved.approvedByName || 'unknown'} on ${formatEstDateTime(saved.approvedAt)}.` : 'Not approved. Edits after approval withdraw it.'}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
            <button type="button" disabled={locked} onClick={buildDraft} style={{ ...smallButton, background: '#64748b' }}>Build draft from data</button>
            <button
              type="button"
              disabled={locked || Boolean(saving) || !canDraftIndustry}
              onClick={() => void draftIndustryWithAi()}
              style={{ ...smallButton, background: '#64748b', opacity: canDraftIndustry ? 1 : 0.55 }}
              title={industryDraftHint || 'Writes the Industry section from the indicators, published outlooks, and benchmarks. Review before approving.'}
            >
              {saving === 'outlook-ai' ? 'Drafting…' : 'Draft industry with AI'}
            </button>
            {!locked && industryDraftHint && <span style={{ ...pendingNote, alignSelf: 'center' }}>AI draft: {industryDraftHint.toLowerCase()}</span>}
            <button
              type="button"
              disabled={locked || Boolean(saving) || !canApprove}
              onClick={() => void run('outlook-approve', { action: 'approve-outlook' })}
              style={{ ...smallButton, background: saved.approvedAt ? '#16a34a' : button.background, opacity: canApprove || saved.approvedAt ? 1 : 0.55 }}
              title={hasPending ? 'Save first' : undefined}
            >
              {saving === 'outlook-approve' ? 'Approving…' : saved.approvedAt ? 'Approved' : 'Approve'}
            </button>
          </div>
        </div>
        <div style={{ display: 'grid', gap: '6px', maxWidth: '1200px' }}>
          {OUTLOOK_SECTIONS.map((section) => (
            <label key={section.key} style={{ display: 'block' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>{section.label}</span>
              <textarea rows={6} disabled={locked} value={sectionText(section.key)} onChange={(event) => editSection(section.key, event.target.value)} style={{ ...textarea, marginTop: '2px' }} />
            </label>
          ))}
        </div>
        {citations.length > 0 && (
          <>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', marginTop: '8px' }}>Citations</div>
            <table style={{ width: '100%', maxWidth: '1200px', borderCollapse: 'collapse' }}>
              <tbody>
                {citations.map((citation) => (
                  <tr key={citation.key}>
                    <td style={{ ...td, width: '230px' }}>{citation.url ? <a href={citation.url} target="_blank" rel="noreferrer" style={{ color: '#2751d0', textDecoration: 'none' }}>{citation.label}</a> : citation.label}</td>
                    <td style={{ ...td, color: '#64748b' }}>{citation.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {gaps.length > 0 && (
        <div style={{ ...CARD, background: '#fffbeb', borderColor: '#fde68a' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#92400e', marginBottom: '4px' }}>Open outlook items</div>
          {gaps.map((gap) => (
            <div key={gap} style={{ fontSize: '12px', color: '#78350f' }}>• {gap}</div>
          ))}
        </div>
      )}
    </div>
  );
}
