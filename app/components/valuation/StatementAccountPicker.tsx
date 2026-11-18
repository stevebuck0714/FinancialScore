'use client';

import {
  linkedStatementAccount,
  statementAccountLabel,
  type DetectedStatementAccount,
} from '@/lib/bank-statements/account-match';
import type { CashProofAccountView } from '@/lib/cash-proof/service';
import { inputStyle } from './cashProofStyles';

const MANUAL = '__manual';

type Fields = { bankName?: string | null; accountLast4?: string | null };

/**
 * Links a Cash Proof account to a bank account found in the statements, so bank name and last 4
 * are copied from the bank instead of typed. Hand entry stays available for accounts with no statements yet.
 */
export default function StatementAccountPicker({
  account,
  statementAccounts,
  linkedBy,
  manual,
  disabled,
  onManual,
  onSave,
}: {
  account: CashProofAccountView;
  statementAccounts: DetectedStatementAccount[];
  /** Detected account key → name of the Cash Proof account already linked to it. */
  linkedBy: Map<string, string>;
  manual: boolean;
  disabled: boolean;
  onManual: (on: boolean) => void;
  onSave: (fields: Fields) => void;
}) {
  const linked = linkedStatementAccount(account, statementAccounts);
  const handEntered = !linked && Boolean(account.accountLast4 || account.bankName);
  const showInputs = manual || handEntered || statementAccounts.length === 0;
  const value = manual ? MANUAL : linked ? linked.key : showInputs ? MANUAL : '';

  return (
    <div style={{ display: 'grid', gap: '4px' }}>
      {statementAccounts.length > 0 && (
        <select
          value={value}
          disabled={disabled}
          style={{ ...inputStyle, width: 240 }}
          onChange={(e) => {
            const next = e.target.value;
            if (next === MANUAL) {
              onManual(true);
              return;
            }
            onManual(false);
            if (!next) {
              onSave({ bankName: null, accountLast4: null });
              return;
            }
            const d = statementAccounts.find((s) => s.key === next);
            if (d) onSave({ bankName: d.bankName ?? account.bankName, accountLast4: d.last4 });
          }}
        >
          <option value="">{value ? 'Not linked' : 'Choose statement account…'}</option>
          {statementAccounts.map((d) => {
            const other = linkedBy.get(d.key);
            return (
              <option key={d.key} value={d.key}>
                {statementAccountLabel(d)}
                {other && other !== account.accountName ? ` (linked to ${other})` : ''}
              </option>
            );
          })}
          <option value={MANUAL}>Enter by hand…</option>
        </select>
      )}
      {showInputs && (
        <div style={{ display: 'flex', gap: '6px' }}>
          <input
            key={`bank-${account.bankName ?? ''}`}
            defaultValue={account.bankName || ''}
            disabled={disabled}
            placeholder="Bank"
            onBlur={(e) => {
              if ((e.target.value || '') !== (account.bankName || '')) onSave({ bankName: e.target.value });
            }}
            style={{ ...inputStyle, width: 170 }}
          />
          <input
            key={`last4-${account.accountLast4 ?? ''}`}
            defaultValue={account.accountLast4 || ''}
            disabled={disabled}
            placeholder="Last 4"
            maxLength={4}
            onBlur={(e) => {
              if ((e.target.value || '') !== (account.accountLast4 || '')) onSave({ accountLast4: e.target.value });
            }}
            style={{ ...inputStyle, width: 64 }}
          />
        </div>
      )}
      <div style={{ fontSize: '10px', color: linked ? '#64748b' : '#b45309', whiteSpace: 'normal' }}>
        {linked
          ? `${linked.months} month${linked.months === 1 ? '' : 's'} of statements`
          : account.accountLast4
            ? `No statements found for x${account.accountLast4} yet.`
            : account.included
              ? 'Not linked to statements.'
              : ''}
      </div>
    </div>
  );
}
