export const INFOR_IDENTITY_KINDS = ['item', 'customer', 'vendor'] as const;
export type InforIdentityKind = (typeof INFOR_IDENTITY_KINDS)[number];

export type InforNewIdentity = {
  kind: InforIdentityKind;
  key: string;
  label: string;
  missing: string[];
};

export type InforNewIdentitiesResult = {
  companyId: string;
  lastInforSyncAt: string | null;
  items: InforNewIdentity[];
  customers: InforNewIdentity[];
  vendors: InforNewIdentity[];
  counts: { items: number; customers: number; vendors: number; total: number };
};
