export type InforSystem = 'INFOR_CSI' | 'INFOR_M3';

export function normalizeInforSystem(value: unknown): InforSystem {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();

  if (normalized === 'INFOR_CSI') return 'INFOR_CSI';
  return 'INFOR_M3';
}
