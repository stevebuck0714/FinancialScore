export type DepreciableAsset = {
  id: string;
  cost: number;
  inServiceDate: string | null;
  usefulLifeYears: number | null;
};

const monthIndex = (isoDate: string) => {
  const [year, month] = isoDate.split('-').map(Number);
  return year * 12 + (month - 1);
};

export const isDepreciable = (asset: DepreciableAsset) =>
  Boolean(asset.inServiceDate && /^\d{4}-\d{2}-\d{2}$/.test(asset.inServiceDate) && asset.usefulLifeYears && asset.usefulLifeYears > 0 && asset.cost > 0);

/**
 * Straight-line depreciation taken through the end of the given month index,
 * starting with the month the asset is placed in service (full-month convention).
 * Rounded cumulatively so the total never exceeds cost.
 */
function cumulativeThroughMonth(asset: DepreciableAsset, throughMonth: number) {
  if (!isDepreciable(asset)) return 0;
  const totalMonths = Math.round(Number(asset.usefulLifeYears) * 12);
  const elapsed = throughMonth - monthIndex(asset.inServiceDate as string) + 1;
  if (elapsed <= 0) return 0;
  if (elapsed >= totalMonths) return asset.cost;
  return Math.round((asset.cost * elapsed * 100) / totalMonths) / 100;
}

export function depreciationForYear(asset: DepreciableAsset, year: number) {
  const value = cumulativeThroughMonth(asset, year * 12 + 11) - cumulativeThroughMonth(asset, year * 12 - 1);
  return Math.round(value * 100) / 100;
}

export function accumulatedDepreciation(asset: DepreciableAsset, asOfDate: string) {
  return cumulativeThroughMonth(asset, monthIndex(asOfDate));
}

export function annualRunRate(asset: DepreciableAsset) {
  if (!asset.usefulLifeYears || asset.usefulLifeYears <= 0) return 0;
  return Math.round((asset.cost / asset.usefulLifeYears) * 100) / 100;
}

/** Calendar years from the first in-service year through the as-of year. */
export function depreciationYears(assets: DepreciableAsset[], asOfDate: string) {
  const starts = assets.filter(isDepreciable).map((asset) => Number((asset.inServiceDate as string).slice(0, 4)));
  if (!starts.length) return [];
  const last = Number(asOfDate.slice(0, 4));
  const first = Math.min(...starts);
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => first + index);
}
