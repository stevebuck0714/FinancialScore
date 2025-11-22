// Financial scoring and calculation utilities

export function clamp(x: number, min = 10, max = 100) {
  return Math.min(max, Math.max(min, x));
}

export function revenueGrowthScore_24mo(growthPct: number | null) {
  if (growthPct === null) return null;
  const g = growthPct;
  if (g >= 25) return 100;
  if (g >= 15) return 80;
  if (g >= 5) return 60;
  if (g >= 0) return 50;
  if (g >= -5) return 40;
  if (g >= -15) return 20;
  return 10;
}

export function rgsAdjustmentFrom6mo(rgs: number | null, growth6moPct: number | null) {
  if (rgs === null || growth6moPct === null) return null;
  const g = growth6moPct;
  if (g >= 25) return rgs + 50;
  if (g >= 15) return ((100 - rgs) * 0.8) + rgs;
  if (g >= 5) return ((100 - rgs) * 0.6) + rgs;
  if (g >= 0) return ((100 - rgs) * 0.4) + rgs;
  if (g >= -5) return rgs * 0.9;
  if (g >= -15) return rgs * 0.7;
  if (g >= -25) return rgs * 0.5;
  return rgs * 0.3;
}

