export const INFOR_IDENTITY_KINDS = ['item', 'customer', 'vendor'] as const;

/** Window event a section dispatches after a save so its review warning rechecks. */
export const INFOR_REVIEW_WARNINGS_STALE_EVENT = 'infor-review-warnings-stale';

export function notifyInforReviewWarningsStale(companyId: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(INFOR_REVIEW_WARNINGS_STALE_EVENT, { detail: { companyId } }));
}
export type InforIdentityKind = (typeof INFOR_IDENTITY_KINDS)[number];

/** The page section that can fix a flagged gap. Each section only shows its own rows. */
export type InforReviewSection = 'volumeForecast' | 'dutiesTariffs' | 'freight' | 'vendorForecast';

export type InforReviewCustomer = {
  customerId: string;
  customerName: string;
};

export type InforReviewRow = {
  key: string;
  section: InforReviewSection;
  kind: InforIdentityKind;
  itemId: string | null;
  itemDescription: string | null;
  customerId: string | null;
  customerName: string | null;
  customerPartNumber: string | null;
  vendorId: string | null;
  vendorName: string | null;
  /** Item-level rows (duties, freight) list every customer the item applies to. */
  customers: InforReviewCustomer[];
  /** Why the row was flagged, in plain language. */
  issues: string[];
};

export type InforReviewWarnings = {
  companyId: string;
  year: number;
  builtAt: string;
  lastInforSyncAt: string | null;
  rows: InforReviewRow[];
};
