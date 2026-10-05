import { after, type NextRequest } from 'next/server';
import {
  ATLANTIC_PRECISION_COMPANY_ID,
  warmAtlanticOperationalTabsCaches,
} from '@/lib/operations/product-group-report-warmup';

/**
 * Saves change the source fingerprints used by operational caches. Rebuild
 * Atlantic's operational pages after the save response is sent so the next
 * page open reads a fresh cached payload.
 */
export function scheduleOperationalCacheWarmupAfterSave(
  request: NextRequest,
  companyId: string | null | undefined,
  source: string
): void {
  if (String(companyId || '').trim() !== ATLANTIC_PRECISION_COMPANY_ID) return;
  const origin = request.nextUrl.origin;
  after(async () => {
    const result = await warmAtlanticOperationalTabsCaches({ baseUrl: origin });
    if (!result.ok) {
      console.warn('Atlantic operational cache warm-up failed after save:', {
        source,
        customers: result.customers,
        products: result.products,
        inventory: result.inventory,
        arAging: result.arAging,
        apAging: result.apAging,
        cash: result.cash,
        dailyFinancials: result.dailyFinancials,
        groups: result.groups,
      });
    }
  });
}
