export const PULSE_POLICY_OVERRIDE_KEY = '__pulsePolicyOverrides';

export type PulsePolicyKey =
  | 'ar_daily_change.min_over30_pct'
  | 'ar_daily_change.min_delta_pts'
  | 'ar_daily_change.min_top_customer_overdue_amount'
  | 'ar_open_critical.min_over30_pct'
  | 'ar_open_critical.min_dso_days'
  | 'ar_open_critical.min_consecutive_days'
  | 'ap_daily_change.min_over30_pct'
  | 'ap_daily_change.min_delta_pts'
  | 'ap_daily_change.min_top_vendor_overdue_amount'
  | 'ap_open_critical.min_over30_pct'
  | 'ap_open_critical.min_consecutive_days'
  | 'cash_daily_change.max_total_dod_pct'
  | 'cash_daily_change.max_total_dod_amount'
  | 'cash_account_daily_change.max_dod_pct'
  | 'cash_account_daily_change.min_balance_floor'
  | 'cash_open_critical.max_change_pct'
  | 'cash_open_critical.min_runway_weeks'
  | 'cash_open_critical.allow_proxy_runway'
  | 'cash_open_critical.min_consecutive_days'
  | 'unresolved_findings.max_age_days_without_owner'
  | 'unresolved_findings.max_age_days_unacknowledged'
  | 'freshness.max_snapshot_age_hours'
  | 'freshness.max_findings_age_hours'
  | 'bucket.attention_min_score'
  | 'bucket.monitoring_min_score';

export type PulsePolicySection =
  | 'AR'
  | 'AP'
  | 'Cash'
  | 'Findings & Freshness'
  | 'Buckets';

export type PulsePolicyUnit = 'percent' | 'points' | 'currency' | 'days' | 'weeks' | 'hours' | 'score';

export type PulsePolicyDefinition = {
  key: PulsePolicyKey;
  label: string;
  description: string;
  section: PulsePolicySection;
  unit: PulsePolicyUnit;
  step: number;
  min: number;
  max: number;
  defaultValue: number;
};

const POLICY_DEFINITIONS = [
  {
    key: 'ar_daily_change.min_over30_pct',
    label: 'AR daily deterioration minimum overdue %',
    description: 'Minimum AR over-30-day percentage required before AR deterioration alerts can trigger.',
    section: 'AR',
    unit: 'percent',
    step: 0.1,
    min: 0,
    max: 100,
    defaultValue: 30,
  },
  {
    key: 'ar_daily_change.min_delta_pts',
    label: 'AR daily deterioration minimum day-over-day change',
    description: 'Minimum day-over-day increase in overdue AR percentage points required to alert.',
    section: 'AR',
    unit: 'points',
    step: 0.1,
    min: 0,
    max: 100,
    defaultValue: 2,
  },
  {
    key: 'ar_daily_change.min_top_customer_overdue_amount',
    label: 'AR top-5 customer minimum overdue amount',
    description: 'Minimum >30-day overdue amount on any customer in the top-5 overdue customer list before AR deterioration is treated as material.',
    section: 'AR',
    unit: 'currency',
    step: 1000,
    min: 0,
    max: 1000000000,
    defaultValue: 25000,
  },
  {
    key: 'ar_open_critical.min_over30_pct',
    label: 'AR open critical minimum overdue %',
    description: 'AR over-30-day percentage that marks AR as persistently critical.',
    section: 'AR',
    unit: 'percent',
    step: 0.1,
    min: 0,
    max: 100,
    defaultValue: 35,
  },
  {
    key: 'ar_open_critical.min_dso_days',
    label: 'AR open critical minimum DSO days',
    description: 'DSO threshold above which AR remains in an open critical condition.',
    section: 'AR',
    unit: 'days',
    step: 1,
    min: 0,
    max: 365,
    defaultValue: 50,
  },
  {
    key: 'ar_open_critical.min_consecutive_days',
    label: 'AR open critical consecutive days',
    description: 'How many days AR must stay critical before it is considered persistent.',
    section: 'AR',
    unit: 'days',
    step: 1,
    min: 1,
    max: 60,
    defaultValue: 2,
  },
  {
    key: 'ap_daily_change.min_over30_pct',
    label: 'AP daily deterioration minimum overdue %',
    description: 'Minimum AP over-30-day percentage required before AP pressure alerts can trigger.',
    section: 'AP',
    unit: 'percent',
    step: 0.1,
    min: 0,
    max: 100,
    defaultValue: 30,
  },
  {
    key: 'ap_daily_change.min_delta_pts',
    label: 'AP daily deterioration minimum day-over-day change',
    description: 'Minimum day-over-day increase in overdue AP percentage points required to alert.',
    section: 'AP',
    unit: 'points',
    step: 0.1,
    min: 0,
    max: 100,
    defaultValue: 2,
  },
  {
    key: 'ap_daily_change.min_top_vendor_overdue_amount',
    label: 'AP top vendor minimum overdue amount',
    description: 'Minimum overdue amount on the largest vendor before AP pressure is treated as material.',
    section: 'AP',
    unit: 'currency',
    step: 1000,
    min: 0,
    max: 1000000000,
    defaultValue: 25000,
  },
  {
    key: 'ap_open_critical.min_over30_pct',
    label: 'AP open critical minimum overdue %',
    description: 'AP over-30-day percentage that marks AP as persistently critical.',
    section: 'AP',
    unit: 'percent',
    step: 0.1,
    min: 0,
    max: 100,
    defaultValue: 35,
  },
  {
    key: 'ap_open_critical.min_consecutive_days',
    label: 'AP open critical consecutive days',
    description: 'How many days AP must stay critical before it is considered persistent.',
    section: 'AP',
    unit: 'days',
    step: 1,
    min: 1,
    max: 60,
    defaultValue: 2,
  },
  {
    key: 'cash_daily_change.max_total_dod_pct',
    label: 'Cash daily change maximum total % drop',
    description: 'Largest acceptable one-day percentage drop in total cash before alerting.',
    section: 'Cash',
    unit: 'percent',
    step: 0.1,
    min: -100,
    max: 100,
    defaultValue: -5,
  },
  {
    key: 'cash_daily_change.max_total_dod_amount',
    label: 'Cash daily change maximum total amount drop',
    description: 'Largest acceptable one-day cash decrease in dollars before alerting.',
    section: 'Cash',
    unit: 'currency',
    step: 1000,
    min: -1000000000,
    max: 1000000000,
    defaultValue: -50000,
  },
  {
    key: 'cash_account_daily_change.max_dod_pct',
    label: 'Cash account daily change maximum % drop',
    description: 'Largest acceptable one-day percentage drop in an individual cash account.',
    section: 'Cash',
    unit: 'percent',
    step: 0.1,
    min: -100,
    max: 100,
    defaultValue: -8,
  },
  {
    key: 'cash_account_daily_change.min_balance_floor',
    label: 'Cash account minimum balance floor',
    description: 'Minimum account balance before account-level cash movement is considered material.',
    section: 'Cash',
    unit: 'currency',
    step: 1000,
    min: 0,
    max: 1000000000,
    defaultValue: 10000,
  },
  {
    key: 'cash_open_critical.max_change_pct',
    label: 'Cash open critical maximum change %',
    description: 'If current cash percent change is worse than this, Pulse marks cash risk as open critical.',
    section: 'Cash',
    unit: 'percent',
    step: 0.1,
    min: -100,
    max: 100,
    defaultValue: -10,
  },
  {
    key: 'cash_open_critical.min_runway_weeks',
    label: 'Cash open critical minimum runway weeks',
    description: 'Minimum acceptable runway before cash risk is considered open critical.',
    section: 'Cash',
    unit: 'weeks',
    step: 0.1,
    min: 0,
    max: 104,
    defaultValue: 8,
  },
  {
    key: 'cash_open_critical.allow_proxy_runway',
    label: 'Cash open critical allow proxy runway',
    description: 'Set to 1 only if proxy runway math is explicitly approved when sourced runway data is unavailable.',
    section: 'Cash',
    unit: 'score',
    step: 1,
    min: 0,
    max: 1,
    defaultValue: 0,
  },
  {
    key: 'cash_open_critical.min_consecutive_days',
    label: 'Cash open critical consecutive days',
    description: 'How many days cash risk must remain bad before it is treated as persistent.',
    section: 'Cash',
    unit: 'days',
    step: 1,
    min: 1,
    max: 60,
    defaultValue: 2,
  },
  {
    key: 'unresolved_findings.max_age_days_without_owner',
    label: 'Unresolved findings max age without owner',
    description: 'Maximum days a critical finding can remain open without an owner before escalation.',
    section: 'Findings & Freshness',
    unit: 'days',
    step: 1,
    min: 0,
    max: 365,
    defaultValue: 2,
  },
  {
    key: 'unresolved_findings.max_age_days_unacknowledged',
    label: 'Unresolved findings max age unacknowledged',
    description: 'Maximum days a critical finding can remain unacknowledged before escalation.',
    section: 'Findings & Freshness',
    unit: 'days',
    step: 1,
    min: 0,
    max: 365,
    defaultValue: 1,
  },
  {
    key: 'freshness.max_snapshot_age_hours',
    label: 'Snapshot freshness max age hours',
    description: 'Maximum age of operational snapshots before Pulse marks data freshness risk.',
    section: 'Findings & Freshness',
    unit: 'hours',
    step: 1,
    min: 1,
    max: 720,
    defaultValue: 36,
  },
  {
    key: 'freshness.max_findings_age_hours',
    label: 'Findings freshness max age hours',
    description: 'Maximum age of findings feed data before Pulse marks data freshness risk.',
    section: 'Findings & Freshness',
    unit: 'hours',
    step: 1,
    min: 1,
    max: 720,
    defaultValue: 48,
  },
  {
    key: 'bucket.attention_min_score',
    label: 'Needs Attention minimum score',
    description: 'Minimum priority score required to place an alert in Needs Attention.',
    section: 'Buckets',
    unit: 'score',
    step: 1,
    min: 0,
    max: 100,
    defaultValue: 70,
  },
  {
    key: 'bucket.monitoring_min_score',
    label: 'Monitoring minimum score',
    description: 'Minimum priority score required to display an alert in Monitoring.',
    section: 'Buckets',
    unit: 'score',
    step: 1,
    min: 0,
    max: 100,
    defaultValue: 45,
  },
] as const satisfies readonly PulsePolicyDefinition[];

export type PulsePolicyValues = Record<PulsePolicyKey, number>;

export const PULSE_POLICY_DEFINITIONS: readonly PulsePolicyDefinition[] = POLICY_DEFINITIONS;

const SECTOR_PATCHES: Record<number, Partial<PulsePolicyValues>> = {
  // Construction: generally slower AR/AP cycles, slightly wider cash swing tolerance.
  23: {
    'ar_daily_change.min_over30_pct': 35,
    'ar_open_critical.min_dso_days': 55,
    'ap_daily_change.min_over30_pct': 32,
    'cash_daily_change.max_total_dod_pct': -6,
  },
  // Manufacturing: higher working-capital intensity.
  32: {
    'ar_daily_change.min_over30_pct': 33,
    'ap_daily_change.min_over30_pct': 33,
    'cash_daily_change.max_total_dod_pct': -6,
    'cash_account_daily_change.max_dod_pct': -9,
  },
  // Professional services: tighter AR/DSO expectations.
  54: {
    'ar_daily_change.min_over30_pct': 25,
    'ar_open_critical.min_dso_days': 40,
    'ap_daily_change.min_over30_pct': 28,
    'cash_daily_change.max_total_dod_pct': -4,
  },
  // Retail: seasonal volatility, more tolerance on cash swings.
  45: {
    'cash_daily_change.max_total_dod_pct': -7,
    'cash_open_critical.max_change_pct': -12,
    'ar_daily_change.min_delta_pts': 2.5,
  },
};

const SECTOR_LABELS: Record<number, string> = {
  11: 'Agriculture',
  21: 'Mining',
  22: 'Utilities',
  23: 'Construction',
  32: 'Manufacturing',
  42: 'Wholesale Trade',
  45: 'Retail Trade',
  48: 'Transportation and Warehousing',
  51: 'Information',
  52: 'Finance and Insurance',
  53: 'Real Estate',
  54: 'Professional Services',
  56: 'Administrative and Support Services',
  61: 'Educational Services',
  62: 'Healthcare and Social Assistance',
  71: 'Arts and Recreation',
  72: 'Accommodation and Food Services',
  81: 'Other Services',
};

function parseSectorCode(industrySectorCategory?: string | null): number | null {
  if (!industrySectorCategory) return null;
  const raw = String(industrySectorCategory).trim();
  if (!raw) return null;
  const head = raw.slice(0, 2);
  const parsed = Number(head);
  if (Number.isFinite(parsed)) return parsed;
  const whole = Number(raw);
  return Number.isFinite(whole) ? whole : null;
}

export function getSectorLabel(industrySectorCategory?: string | null): string {
  const code = parseSectorCode(industrySectorCategory);
  if (!code) return 'General';
  return SECTOR_LABELS[code] || `Sector ${code}`;
}

export function getBasePulsePolicyValues(): PulsePolicyValues {
  return PULSE_POLICY_DEFINITIONS.reduce((acc, def) => {
    acc[def.key] = def.defaultValue;
    return acc;
  }, {} as PulsePolicyValues);
}

export function getSectorPulsePolicyValues(industrySectorCategory?: string | null): PulsePolicyValues {
  const base = getBasePulsePolicyValues();
  const code = parseSectorCode(industrySectorCategory);
  if (!code) return base;
  return {
    ...base,
    ...(SECTOR_PATCHES[code] || {}),
  };
}

export function sanitizePulsePolicyOverrides(raw: unknown): Partial<PulsePolicyValues> {
  if (!raw || typeof raw !== 'object') return {};
  const incoming = raw as Record<string, unknown>;
  const out: Partial<PulsePolicyValues> = {};
  PULSE_POLICY_DEFINITIONS.forEach((def) => {
    if (!(def.key in incoming)) return;
    const n = Number(incoming[def.key]);
    if (!Number.isFinite(n)) return;
    out[def.key] = Math.min(def.max, Math.max(def.min, n));
  });
  return out;
}

export function getResolvedPulsePolicyValues(
  overrides: Partial<PulsePolicyValues> | null | undefined,
  industrySectorCategory?: string | null
): PulsePolicyValues {
  const sector = getSectorPulsePolicyValues(industrySectorCategory);
  return {
    ...sector,
    ...(overrides || {}),
  };
}
