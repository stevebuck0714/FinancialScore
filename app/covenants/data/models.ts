// Loan Types
export enum LoanType {
  TERM = 'term',
  REVOLVER = 'revolver',
  BRIDGE = 'bridge',
  OTHER = 'other',
}

// Loan Status
export enum LoanStatus {
  ACTIVE = 'active',
  MATURING = 'maturing',
  PAID_OFF = 'paid_off',
  DEFAULTED = 'defaulted',
}

// Loan Interface
export interface Loan {
  id: string;
  companyId: string;
  loanName: string;
  loanIdNumber: string;
  lenderName: string;
  loanAmount: number;
  interestRate?: number;
  termMonths?: number;
  startDate: Date;
  endDate?: Date;
  loanType: LoanType;
  status: LoanStatus;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}
