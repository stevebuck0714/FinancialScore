export type CashProofSampleStatus = 'REQUESTED' | 'RECEIVED' | 'TIED' | 'EXCEPTION' | 'CLEARED';

export const SAMPLE_STATUS_LABELS: Record<CashProofSampleStatus, string> = {
  REQUESTED: 'Requested',
  RECEIVED: 'Received',
  TIED: 'Tied',
  EXCEPTION: 'Exception',
  CLEARED: 'Cleared',
};

export type TieOutInput = {
  statementBeginning: number | null;
  statementDeposits: number | null;
  statementWithdrawals: number | null;
  statementEnding: number | null;
  reconcilingItems: number | null;
  dataRoomDocumentId: string | null;
  resolutionNote: string | null;
  status: string;
};

export type TieOutResult = {
  bookBalance: number | null;
  adjustedBankBalance: number | null;
  difference: number | null;
  statementFoots: boolean | null;
  footDifference: number | null;
  continuityOk: boolean | null;
  continuityDifference: number | null;
  status: CashProofSampleStatus;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Book vs. bank for one account-month:
 *   difference = book − (statement ending + reconciling items)
 * plus two integrity checks on the statement itself: it foots
 * (beginning + deposits − withdrawals = ending), and its beginning matches
 * the prior month's ending when that month was also sampled.
 */
export function computeTieOut(
  sample: TieOutInput,
  bookBalance: number | null,
  priorMonthEnding: number | null,
  tolerance: number,
): TieOutResult {
  const ending = sample.statementEnding;
  const adjustedBankBalance = ending === null ? null : round2(ending + (sample.reconcilingItems ?? 0));
  const difference =
    adjustedBankBalance === null || bookBalance === null ? null : round2(bookBalance - adjustedBankBalance);

  let statementFoots: boolean | null = null;
  let footDifference: number | null = null;
  if (
    ending !== null &&
    sample.statementBeginning !== null &&
    sample.statementDeposits !== null &&
    sample.statementWithdrawals !== null
  ) {
    footDifference = round2(
      sample.statementBeginning + sample.statementDeposits - sample.statementWithdrawals - ending,
    );
    statementFoots = Math.abs(footDifference) <= tolerance;
  }

  let continuityOk: boolean | null = null;
  let continuityDifference: number | null = null;
  if (priorMonthEnding !== null && sample.statementBeginning !== null) {
    continuityDifference = round2(sample.statementBeginning - priorMonthEnding);
    continuityOk = Math.abs(continuityDifference) <= tolerance;
  }

  let status: CashProofSampleStatus;
  if (ending === null) {
    status = sample.dataRoomDocumentId ? 'RECEIVED' : 'REQUESTED';
  } else if (
    difference !== null &&
    Math.abs(difference) <= tolerance &&
    statementFoots !== false &&
    continuityOk !== false
  ) {
    status = 'TIED';
  } else if (sample.status === 'CLEARED' && String(sample.resolutionNote || '').trim()) {
    status = 'CLEARED';
  } else {
    status = 'EXCEPTION';
  }

  return {
    bookBalance,
    adjustedBankBalance,
    difference,
    statementFoots,
    footDifference,
    continuityOk,
    continuityDifference,
    status,
  };
}
