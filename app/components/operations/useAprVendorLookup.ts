'use client';

import { useEffect, useRef, useState } from 'react';

export type AprVendorLookup = {
  status: 'loading' | 'none' | 'single' | 'multiple';
  vendorKeys: string[];
};

type LookupState = AprVendorLookup & { scope: string };

export function useAprVendorLookup(params: {
  companyId: string | null | undefined;
  year: number;
  aprSearch: string;
  needsLookup: boolean;
  onSingleVendor: (vendorKey: string) => void;
}): AprVendorLookup | null {
  const { companyId, year, aprSearch, needsLookup, onSingleVendor } = params;
  const query = aprSearch.trim();
  const scope = `${companyId || ''}|${year}|${query.toLowerCase()}`;
  const [lookup, setLookup] = useState<LookupState | null>(null);
  const onSingleVendorRef = useRef(onSingleVendor);

  useEffect(() => {
    onSingleVendorRef.current = onSingleVendor;
  });

  useEffect(() => {
    if (!companyId || !query || !needsLookup) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLookup({ scope, status: 'loading', vendorKeys: [] });
      try {
        const search = new URLSearchParams({ companyId, year: String(year), itemSku: query });
        const response = await fetch(`/api/operational-data/vendor-forecast?${search.toString()}`, {
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Failed to find vendor');
        const vendorKeys: string[] = Array.isArray(payload.itemVendors)
          ? payload.itemVendors.map((vendor: { key: string }) => vendor.key)
          : [];
        const status = vendorKeys.length === 0 ? 'none' : vendorKeys.length === 1 ? 'single' : 'multiple';
        setLookup({ scope, status, vendorKeys });
        if (vendorKeys.length === 1) onSingleVendorRef.current(vendorKeys[0]);
      } catch {
        if (controller.signal.aborted) return;
        setLookup({ scope, status: 'none', vendorKeys: [] });
      }
    }, 350);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [companyId, year, query, scope, needsLookup]);

  if (!query || !lookup || lookup.scope !== scope) return null;
  return { status: lookup.status, vendorKeys: lookup.vendorKeys };
}
