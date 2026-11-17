'use client';

import React from 'react';
import { formatMonthShort } from '@/lib/date-utils';
import type { QoeSummaryAccount, QoeSummaryBucket, QoeSummaryLine, QoeSummaryOtherEntry } from '@/lib/sde/qoe-adjustment-summary';

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const formatPct = (pct: number) => {
  const rounded = Math.round(pct * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
};

function AccountSentence({
  account,
  line,
  bucket,
  fmt,
}: {
  account: QoeSummaryAccount;
  line: QoeSummaryLine;
  bucket: QoeSummaryBucket['bucket'];
  fmt: (n: number) => string;
}) {
  const verb = line.effect === 'add' ? 'Added back' : 'Deducted';
  const isFull = account.ownerPercent >= 99.95;
  const isReplacementSalary = line.key === 'marketReplacementSalary';
  const share = isFull ? 'the full account' : `${formatPct(account.ownerPercent)} of the account`;
  const method = account.ownerMode === 'AMOUNT' ? 'a fixed dollar amount' : 'a percentage of the account';
  const remainderHome = bucket === 'ONE_TIME_REVENUE' ? 'revenue' : 'operating expenses';
  return (
    <div style={{ fontSize: '12px', color: '#334155', lineHeight: 1.55, padding: '4px 0 4px 12px' }}>
      <strong style={{ color: '#0f172a' }}>
        {account.accountCode ? `${account.accountCode} ` : ''}
        {account.accountName}
      </strong>{' '}
      — LTM total {fmt(account.ltm)}. {verb} <strong>{fmt(account.ownerAmount)}</strong> ({share}), entered as {method}
      {isReplacementSalary ? ', as the market salary a buyer would pay to replace the owner.' : '.'}
      {!isFull && !isReplacementSalary && account.remaining >= 0.5 && (
        <> The remaining {fmt(account.remaining)} stays in {remainderHome}.</>
      )}
      {account.note && (
        <div style={{ color: '#475569', fontStyle: 'italic', marginTop: '2px' }}>Reason: {account.note}</div>
      )}
    </div>
  );
}

function OtherSentence({ other, line, fmt }: { other: QoeSummaryOtherEntry; line: QoeSummaryLine; fmt: (n: number) => string }) {
  const verb = line.effect === 'add' ? 'added back' : 'deducted';
  return (
    <div style={{ fontSize: '12px', color: '#334155', lineHeight: 1.55, padding: '4px 0 4px 12px' }}>
      {other.source === 'manual' ? (
        <>
          <strong style={{ color: '#0f172a' }}>Manual entry</strong> — <strong>{fmt(other.amount)}</strong> {verb}, not tied to a
          specific account{other.month ? `, posted in ${formatMonthShort(other.month)}` : ''}.
        </>
      ) : (
        <>
          <strong style={{ color: '#0f172a' }}>Detected from account names</strong> — <strong>{fmt(other.amount)}</strong> {verb}{' '}
          from accounts whose names match this item.
        </>
      )}
      {other.note && <div style={{ color: '#475569', fontStyle: 'italic', marginTop: '2px' }}>Reason: {other.note}</div>}
    </div>
  );
}

export default function QoeAdjustmentSummary({
  buckets,
  fmt,
}: {
  buckets: QoeSummaryBucket[];
  fmt: (n: number) => string;
}) {
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', background: 'white' }}>
      <div style={{ fontSize: '14px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>Adjustment Summary</div>
      <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5, marginBottom: '8px' }}>
        Each adjustment shows how much of the underlying account was removed from earnings, whether it was entered as a
        percentage of the account or a fixed dollar amount, and what stays in reported results. Account totals are the
        trailing twelve months (LTM).
      </div>
      {buckets.length === 0 ? (
        <div style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>No adjustments recorded.</div>
      ) : (
        buckets.map((bucket) => (
          <div key={bucket.bucket} className="qoe-adjustment-summary-bucket" style={{ marginTop: '10px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px' }}>
              {bucket.title}
            </div>
            {bucket.lines.map((line) => (
              <div key={line.key} style={{ marginTop: '6px', breakInside: 'avoid' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                  <span>{capitalize(line.label)}</span>
                  <span style={{ color: line.effect === 'add' ? '#059669' : '#dc2626' }}>
                    {line.effect === 'add' ? '+' : '−'}
                    {fmt(Math.abs(line.total))}
                  </span>
                </div>
                {line.accounts.map((account) => (
                  <AccountSentence key={account.mappingId} account={account} line={line} bucket={bucket.bucket} fmt={fmt} />
                ))}
                {line.other && <OtherSentence other={line.other} line={line} fmt={fmt} />}
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
