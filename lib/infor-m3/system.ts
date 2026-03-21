export type InforSystem = 'INFOR_M3' | 'INFOR_CSI';

export function normalizeInforSystem(value: unknown): InforSystem {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized === 'INFOR_CSI' ? 'INFOR_CSI' : 'INFOR_M3';
}

export function isInforSystem(value: unknown): boolean {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized === 'INFOR_M3' || normalized === 'INFOR_CSI';
}

