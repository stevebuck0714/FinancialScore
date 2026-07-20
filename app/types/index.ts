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
  nonOperatingExpense?: string;
  extraordinaryItems?: string;
  expense?: string;
  netProfit?: string;
  // Balance Sheet - Assets
  cash?: string;
  ar?: string;
  retainageReceivables?: string;
  contractAssets?: string;
  inventory?: string;
  otherCA?: string;
  tca?: string;
  fixedAssets?: string;
  constructionEquipment?: string;
  officeEquipment?: string;
  shopEquipment?: string;
  investments?: string;
  rightOfUseLeases?: string;
  otherAssets?: string;
  totalAssets?: string;
  // Balance Sheet - Liabilities & Equity
  ap?: string;
  loc?: string;
  contractLiabilities?: string;
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
  retainageReceivables: number;
  contractAssets: number;
  inventory: number;
  otherCA: number;
  tca: number;
  fixedAssets: number;
  constructionEquipment: number;
  officeEquipment: number;
  shopEquipment: number;
  investments: number;
  rightOfUseLeases: number;
  otherAssets: number;
  totalAssets: number;
  ap: number;
  loc: number;
  contractLiabilities: number;
  otherCL: number;
  tcl: number;
  ltd: number;
  totalLiab: number;
  totalEquity: number;
  totalLAndE: number;
};

export type MonthlyDataRow = {
  [key: string]: any;
  date?: string | Date;
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
  nonOperatingExpense: number;
  extraordinaryItems: number;
  netProfit: number;
  netIncome?: number;
  grossProfit?: number;
  grossMargin?: number;
  cogs?: number;
  contractors?: number;
  materials?: number;
  totalAssets: number;
  totalLiab: number;
  cash: number;
  ar: number;
  retainageReceivables: number;
  contractAssets: number;
  inventory: number;
  otherCA: number;
  tca: number;
  fixedAssets: number;
  constructionEquipment: number;
  officeEquipment: number;
  shopEquipment: number;
  investments: number;
  rightOfUseLeases: number;
  otherAssets: number;
  ap: number;
  loc: number;
  contractLiabilities: number;
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
  [key: string]: any;
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
  accountingSystem?: string;
  companySizeCategory?: string;
  industrySectorCategory?: string;
  subscriptionMonthlyPrice?: number;
  subscriptionQuarterlyPrice?: number;
  subscriptionAnnualPrice?: number;
  subscriptionSetupFee?: number;
  subscriptionStatus?: string;
  subscriptionStartDate?: string | null;
  nextBillingDate?: string | null;
  selectedSubscriptionPlan?: string | null;
  affiliateCode?: string | null;
  referralPartnerId?: string | null;
  referralPartnerConsultantId?: string | null;
  referralSetupFeePercentage?: number;
  referralRecurringFeePercentage?: number;
  commercialBillingMethod?: string;
  commercialPaymentStatus?: string;
  commercialInvoiceNumber?: string | null;
  commercialInvoiceUrl?: string | null;
  commercialInvoiceDate?: string | null;
  commercialPaymentDate?: string | null;
  commercialNextDueDate?: string | null;
  commercialTermsNotes?: string | null;
  tier1SupportOwner?: 'CORELYTICS' | 'CONSULTANT';
  tier1SupportConsultantId?: string | null;
  tier1SupportContactEmail?: string | null;
  hasRealOperationalData?: boolean;
  realDataActivatedAt?: string | null;
  forceOperationalMockData?: boolean;
  linesOfBusiness?: any;
  headcountAllocations?: any;
  userDefinedAllocations?: any;
}

export interface CompanyProfile {
  [key: string]: any;
  companyId: string;
  legalStructure: string;
  businessStatus: string;
  ownership: string;
  keyEmployees?: Array<{ name: string; title: string; yearEmployed: string }>;
  workforce: string;
  keyAdvisors: string;
  specialNotes: string;
  qoeNotes: string;
  aiResearchSearchName?: string;
  aiResearchAliases?: string[];
  aiResearchExcludedNames?: string[];
  aiResearchIdentityAnchors?: string[];
  disclosures: Record<string, string | { status?: string; notes?: string }>;
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
  [key: string]: any;
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
  referralPartnerId?: string | null;
  referralSetupFeePercentage?: number | null;
  referralRecurringFeePercentage?: number | null;
}

export interface User {
  [key: string]: any;
  id: string;
  name: string;
  email: string;
  password: string;
  title?: string;
  phone?: string;
  companyId: string;
  activeCompanyId?: string;
  accessibleCompanies?: Array<{
    companyId: string;
    name: string;
    companyRole?: string | null;
    sidebarAccess?: any;
    operationalDashboardAccess?: any;
  }>;
  consultantId?: string;
  consultantType?: string;
  consultantCompanyName?: string;
  demoCompany?: boolean;
  demoExpired?: boolean;
  demoExpiresAt?: string | null;
  role: 'consultant' | 'user' | 'siteadmin';
  userType?: 'company' | 'assessment'; // company = management team, assessment = fills questionnaire
  companyRole?: 'user' | 'admin'; // admin = company admin with full access, user = restricted access
  sidebarAccess?: string[]; // Array of sidebar sections the user can access
  operationalDashboardAccess?: string[]; // Array of Operational Dashboard module/page keys the user can access
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
