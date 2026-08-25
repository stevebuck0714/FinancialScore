export const CUBIC_INCHES_PER_CBM = 61023.7440947323;

export type SgpFreightAssumptions = {
  domesticRateCurrent: number;
  domesticRateIncrease: number;
  averageShipmentCost: number;
  estimatedFreightCost: number;
  freightCostIncrease: number;
  containerCbm: number;
};

export const DEFAULT_SGP_FREIGHT_ASSUMPTIONS: SgpFreightAssumptions = {
  domesticRateCurrent: 0.08,
  domesticRateIncrease: 0.05,
  averageShipmentCost: 10000,
  estimatedFreightCost: 10000,
  freightCostIncrease: 0,
  containerCbm: 55,
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asFinite(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asRate(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.abs(parsed) > 1 ? parsed / 100 : parsed;
}

function firstNumber(...values: Array<number | null | undefined>): number | null {
  for (const value of values) {
    if (value == null) continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function normalizeSgpFreightAssumptions(value: unknown): SgpFreightAssumptions {
  const record = asRecord(value);
  return {
    domesticRateCurrent: asRate(record.domesticRateCurrent, DEFAULT_SGP_FREIGHT_ASSUMPTIONS.domesticRateCurrent),
    domesticRateIncrease: asRate(record.domesticRateIncrease, DEFAULT_SGP_FREIGHT_ASSUMPTIONS.domesticRateIncrease),
    averageShipmentCost: asFinite(record.averageShipmentCost, DEFAULT_SGP_FREIGHT_ASSUMPTIONS.averageShipmentCost),
    estimatedFreightCost: asFinite(record.estimatedFreightCost, DEFAULT_SGP_FREIGHT_ASSUMPTIONS.estimatedFreightCost),
    freightCostIncrease: asRate(record.freightCostIncrease, DEFAULT_SGP_FREIGHT_ASSUMPTIONS.freightCostIncrease),
    containerCbm: asFinite(record.containerCbm, DEFAULT_SGP_FREIGHT_ASSUMPTIONS.containerCbm),
  };
}

export function futureDomesticRate(assumptions: SgpFreightAssumptions): number {
  return assumptions.domesticRateCurrent * (1 + assumptions.domesticRateIncrease);
}

export function futureEstimatedFreightCost(assumptions: SgpFreightAssumptions): number {
  return assumptions.estimatedFreightCost * (1 + assumptions.freightCostIncrease);
}

export function isDomesticShipment(shipmentType: string | null | undefined): boolean {
  const value = String(shipmentType || '').trim().toUpperCase();
  return value === 'DOM' || value === 'DOMESTIC' || value === 'US' || value === 'USA' || value.startsWith('DOM');
}

export function calcCbmFromInches(heightIn: number | null, widthIn: number | null, lengthIn: number | null): number | null {
  const height = Number(heightIn);
  const width = Number(widthIn);
  const length = Number(lengthIn);
  if (![height, width, length].every((value) => Number.isFinite(value) && value > 0)) return null;
  return Math.round((height * width * length) / CUBIC_INCHES_PER_CBM * 1e9) / 1e9;
}

export function calcPercentOfContainer(
  cbm: number | null,
  containerCbm: number,
  orderMultiple: number | null = null
): number | null {
  if (cbm == null) return null;
  const volume = Number(cbm);
  const capacity = Number(containerCbm);
  const pieces = Number(orderMultiple);
  if (!Number.isFinite(volume) || volume <= 0 || !(capacity > 0) || !Number.isFinite(pieces) || pieces <= 0) return null;
  return volume / pieces / capacity;
}

export function calcItemFreight(input: {
  cbm: number | null;
  shipmentType: string | null | undefined;
  unitCost: number | null;
  currentUnitCost: number | null;
  orderMultiple?: number | null;
  assumptions: SgpFreightAssumptions;
}): {
  percentOfContainer: number | null;
  estimatedFreightCurrent: number | null;
  estimatedFreightFuture: number | null;
} {
  const assumptions = normalizeSgpFreightAssumptions(input.assumptions);
  const percentOfContainer = calcPercentOfContainer(input.cbm, assumptions.containerCbm, input.orderMultiple);
  const unitCost = firstNumber(input.unitCost, input.currentUnitCost);
  const shipment = String(input.shipmentType || '').trim().toUpperCase();
  if (shipment === 'OVERSEAS') {
    return {
      percentOfContainer,
      estimatedFreightCurrent: percentOfContainer == null ? null : assumptions.averageShipmentCost * percentOfContainer,
      estimatedFreightFuture: percentOfContainer == null ? null : assumptions.estimatedFreightCost * percentOfContainer,
    };
  }
  return {
    percentOfContainer,
    estimatedFreightCurrent: unitCost == null ? null : unitCost * assumptions.domesticRateCurrent,
    estimatedFreightFuture: unitCost == null ? null : unitCost * futureDomesticRate(assumptions),
  };
}
