/**
 * Type definitions for the Financial Score application
 */

export type Mappings = {
  date: string;
  // Income Statement
  revenue?: string;
  cogsPayroll?: string;
  cogsOwnerPay?: string;
  cogsContractors?: string;
  cogsMaterials?: string;
  cogsCommissions?: string;
  cogsOther?: string;
  cogsTotal?: string;
  salesExpense?: string;
  rent?: string;
  infrastructure?: string;
  autoTravel?: string;
  professionalFees?: string;
  insurance?: string;
  marketing?: string;
  payroll?: string;
  ownerBasePay?: string;
  ownersRetirement?: string;
  subcontractors?: string;
  benefits?: string;
  taxLicense?: string;
  stateIncomeTaxes?: string;
  federalIncomeTaxes?: string;
  phoneComm?: string;
  trainingCert?: string;
  mealsEntertainment?: string;
  otherExpense?: string;
  interestExpense?: string;
  depreciationAmortization?: string;
  operatingExpenseTotal?: string;
  nonOperatingIncome?: string;
  extraordinaryItems?: string;
  expense?: string;
  netProfit?: string;
  // Balance Sheet - Assets
  cash?: string;
  ar?: string;
  inventory?: string;
  otherCA?: string;
  tca?: string;
  fixedAssets?: string;
  otherAssets?: string;
  totalAssets?: string;
  // Balance Sheet - Liabilities & Equity
  ap?: string;
  otherCL?: string;
  tcl?: string;
  ltd?: string;
  totalLiab?: string;
  ownersCapital?: string;
  ownersDraw?: string;
  commonStock?: string;
  preferredStock?: string;
  retainedEarnings?: string;
  additionalPaidInCapital?: string;
  treasuryStock?: string;
  totalEquity?: string;
  totalLAndE?: string;
};

export type NormalRow = {
  date: Date;
  month: string;
  revenue: number;
  expense: number;
  cash: number;
  ar: number;
  inventory: number;
  otherCA: number;
  tca: number;
  fixedAssets: number;
  otherAssets: number;
  totalAssets: number;
  ap: number;
  otherCL: number;
  tcl: number;
  ltd: number;
  totalLiab: number;
  totalEquity: number;
  totalLAndE: number;
};

export type MonthlyDataRow = {
  month: string;
  revenue: number;
  expense: number;
  cogsPayroll: number;
  cogsOwnerPay: number;
  cogsContractors: number;
  cogsMaterials: number;
  cogsCommissions: number;
  cogsOther: number;
  cogsTotal: number;
  salesExpense: number;
  rent: number;
  infrastructure: number;
  autoTravel: number;
  professionalFees: number;
  insurance: number;
  marketing: number;
  payroll: number;
  ownerBasePay: number;
  ownersRetirement: number;
  subcontractors: number;
  benefits: number;
  taxLicense: number;
  stateIncomeTaxes: number;
  federalIncomeTaxes: number;
  phoneComm: number;
  trainingCert: number;
  mealsEntertainment: number;
  otherExpense: number;
  interestExpense: number;
  depreciationAmortization: number;
  operatingExpenseTotal: number;
  nonOperatingIncome: number;
  extraordinaryItems: number;
  netProfit: number;
  totalAssets: number;
  totalLiab: number;
  cash: number;
  ar: number;
  inventory: number;
  otherCA: number;
  tca: number;
  fixedAssets: number;
  otherAssets: number;
  ap: number;
  otherCL: number;
  tcl: number;
  ltd: number;
  ownersCapital: number;
  ownersDraw: number;
  commonStock: number;
  preferredStock: number;
  retainedEarnings: number;
  additionalPaidInCapital: number;
  treasuryStock: number;
  totalEquity: number;
  totalLAndE: number;
};

export interface Company {
  id: string;
  name: string;
  consultantEmail: string;
  consultantId?: string;
  createdDate: string;
  location?: string;
  addressStreet?: string;
  addressCity?: string;
  addressState?: string;
  addressZip?: string;
  addressCountry?: string;
  industrySector?: number;
  subscriptionMonthlyPrice?: number;
  subscriptionQuarterlyPrice?: number;
  subscriptionAnnualPrice?: number;
  selectedSubscriptionPlan?: string | null;
}

export interface CompanyProfile {
  companyId: string;
  legalStructure: string;
  businessStatus: string;
  ownership: string;
  keyEmployees?: Array<{ name: string; title: string; yearEmployed: string }>;
  workforce: string;
  keyAdvisors: string;
  specialNotes: string;
  qoeNotes: string;
  disclosures: {
    bankruptcies: string;
    liens: string;
    contracts: string;
    lawsuits: string;
    mostFavoredNation: string;
    equityControl: string;
    rightOfFirstRefusal: string;
    shareholderProtections: string;
    changeInControl: string;
    regulatoryApprovals: string;
    auditedFinancials: string;
  };
}

export interface AssessmentResponses {
  [questionId: string]: number;
}

export interface AssessmentNotes {
  [categoryId: number]: string;
}

export interface AssessmentRecord {
  id: string;
  userId: string;
  user?: {
    id: string;
    name: string;
    email: string;
  };
  companyId: string;
  company?: {
    id: string;
    name: string;
  };
  responses: AssessmentResponses;
  notes: AssessmentNotes;
  completedAt: string;
  overallScore: number;
  // Legacy fields for backward compatibility
  userEmail?: string;
  userName?: string;
  companyName?: string;
  completedDate?: string;
}

export interface Consultant {
  id: string;
  type: string;
  fullName: string;
  address: string;
  email: string;
  phone: string;
  password: string;
  companyName?: string;
  companyAddress1?: string;
  companyAddress2?: string;
  companyCity?: string;
  companyState?: string;
  companyZip?: string;
  companyWebsite?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  companyId: string;
  consultantId?: string;
  consultantType?: string;
  consultantCompanyName?: string;
  role: 'consultant' | 'user' | 'siteadmin';
  userType?: 'company' | 'assessment'; // company = management team, assessment = fills questionnaire
}

export interface FinancialDataRecord {
  id: string;
  companyId: string;
  uploadedBy: string;
  uploadDate: string;
  rawRows: any[];
  mapping: Mappings;
  fileName: string;
}

export interface LOBData {
  name: string;
  headcountPercentage: number;
}
