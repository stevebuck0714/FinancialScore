/** User access section for the whole Quality of Earnings menu, including its top row of report tabs. */
export const QOE_SECTION = 'quality-of-earnings';

export type QoeTabId = 'engagement-tracker' | 'ebitda-adjustments' | 'income-statement' | 'cash-proof' | 'bank-statements' | 'credit-card-review';

/** Second-row Quality of Earnings tabs, in menu order. Each can be granted on its own. */
export const QOE_TABS: Array<{ id: QoeTabId; label: string }> = [
  { id: 'engagement-tracker', label: 'Engagement Tracker' },
  { id: 'ebitda-adjustments', label: 'Quality of Earnings' },
  { id: 'income-statement', label: 'Income Statement' },
  { id: 'cash-proof', label: 'Cash Proof' },
  { id: 'bank-statements', label: 'Bank Statements' },
  { id: 'credit-card-review', label: 'Credit Card Review' },
];

const TAB_PREFIX = 'qoe:';

/** Tabs are stored in the user's section access list as `qoe:<tab>`. */
export const qoeTabAccessKey = (tab: QoeTabId) => `${TAB_PREFIX}${tab}`;

export const isQoeTabAccessKey = (value: string) => value.startsWith(TAB_PREFIX);

/** Tabs a section access list allows: only the ticked tabs, and none without the Quality of Earnings section. */
export function allowedQoeTabs(sidebarAccess: unknown): QoeTabId[] {
  if (!Array.isArray(sidebarAccess) || !sidebarAccess.includes(QOE_SECTION)) return [];
  return QOE_TABS.filter((t) => sidebarAccess.includes(qoeTabAccessKey(t.id))).map((t) => t.id);
}
