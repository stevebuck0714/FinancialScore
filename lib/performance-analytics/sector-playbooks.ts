import { normalizeIndustrySectorCategory } from './industry-sector-category';

/**
 * Sector playbook library for Performance Analytics.
 * Focuses analysis (Focus Board, Trend Explorer, Anomaly, Opportunities) by company sector.
 * @see docs/SECTOR_PLAYBOOK_LIBRARY.md
 */

export type FocusBucket = 'fix_now' | 'investigate' | 'monitor' | 'opportunities';

export type FocusPriority = {
  metricHint?: string;
  whenSevere: FocusBucket;
  whenModerate: FocusBucket;
  rank: number;
};

export type AnomalyContext = {
  seasonalityNote?: string;
  typicalVarianceNote?: string;
  highSeverityTriggers?: string[];
};

export type RecommendationTheme = {
  id: string;
  title: string;
  family: string;
  whenCondition: string;
  objective: 'cash' | 'margin' | 'growth' | 'risk';
  suggestedOwner?: 'Sales' | 'Ops' | 'Finance' | 'Marketing' | 'General';
};

/** COA field names (MonthlyFinancial) to prioritize for anomaly/trend in this sector. */
export type COACategoryHint = string;

export type SectorPlaybook = {
  sector: string;
  label: string;
  opsProfileRef: string;
  focusPriorities: FocusPriority[];
  anomalyContext: AnomalyContext;
  recommendationThemes: RecommendationTheme[];
  /** COA line/category keys to scan first for this sector (e.g. revenue, cogsTotal, payroll, marketing). */
  coaCategoryHints?: COACategoryHint[];
};

const DEFAULT_PLAYBOOK: SectorPlaybook = {
  sector: 'DEFAULT',
  label: 'General Operations',
  opsProfileRef: 'DEFAULT',
  coaCategoryHints: ['revenue', 'cogsTotal', 'expense', 'payroll', 'marketing', 'rent', 'professionalFees'],
  focusPriorities: [
    { metricHint: 'revenue', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 1 },
    { metricHint: 'gross margin', whenSevere: 'fix_now', whenModerate: 'monitor', rank: 2 },
    { metricHint: 'AR days', whenSevere: 'investigate', whenModerate: 'monitor', rank: 3 },
    { metricHint: 'inventory', whenSevere: 'investigate', whenModerate: 'monitor', rank: 4 },
    { metricHint: 'churn', whenSevere: 'monitor', whenModerate: 'opportunities', rank: 5 },
  ],
  anomalyContext: {
    typicalVarianceNote: 'Revenue and margin often ±10–20% MoM for small businesses.',
    highSeverityTriggers: ['Revenue', 'Gross Margin', 'Cash Balance', 'Total AR'],
  },
  recommendationThemes: [
    { id: 'default_dso', title: 'Tighten terms and collections to reduce DSO', family: 'Working capital', whenCondition: 'DSO above peer or trend', objective: 'cash', suggestedOwner: 'Finance' },
    { id: 'default_inventory', title: 'Optimize inventory and payables to free cash', family: 'Working capital', whenCondition: 'Inventory days elevated', objective: 'cash', suggestedOwner: 'Ops' },
    { id: 'default_margin', title: 'Strengthen unit economics and contribution per order', family: 'Unit economics', whenCondition: 'Margin below peer or declining', objective: 'margin', suggestedOwner: 'Ops' },
    { id: 'default_fulfillment', title: 'Improve on-time delivery and cycle time', family: 'Fulfillment', whenCondition: 'On-time or cycle time weak', objective: 'growth', suggestedOwner: 'Ops' },
    { id: 'default_retention', title: 'Reduce churn and improve retention', family: 'Customer', whenCondition: 'Churn elevated or rising', objective: 'growth', suggestedOwner: 'Sales' },
  ],
};

const AGRICULTURE: SectorPlaybook = {
  sector: 'AGRICULTURE',
  label: 'Agriculture',
  opsProfileRef: 'AGRICULTURE',
  coaCategoryHints: ['revenue', 'cogsTotal', 'cogsMaterials', 'expense', 'payroll', 'inventory'],
  focusPriorities: [
    { metricHint: 'yield', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 1 },
    { metricHint: 'price per unit', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 2 },
    { metricHint: 'input cost', whenSevere: 'investigate', whenModerate: 'monitor', rank: 3 },
    { metricHint: 'shrink', whenSevere: 'investigate', whenModerate: 'monitor', rank: 4 },
    { metricHint: 'cash conversion', whenSevere: 'investigate', whenModerate: 'monitor', rank: 5 },
  ],
  anomalyContext: {
    seasonalityNote: 'Harvest and planting cycles; quarterly yield and price spikes common.',
    typicalVarianceNote: 'Yield and price can swing ±20%+ by season; input costs volatile.',
    highSeverityTriggers: ['yield', 'price per unit', 'input cost', 'shrink'],
  },
  recommendationThemes: [
    { id: 'ag_yield', title: 'Improve yield per acre and input efficiency', family: 'Supply & demand', whenCondition: 'Yield or input cost variance', objective: 'margin', suggestedOwner: 'Ops' },
    { id: 'ag_shrink', title: 'Reduce shrink and defect rates', family: 'Quality', whenCondition: 'Shrink or defect elevated', objective: 'margin', suggestedOwner: 'Ops' },
    { id: 'ag_cash', title: 'Shorten cash conversion cycle and inventory days', family: 'Working capital', whenCondition: 'Cash conversion or inventory elevated', objective: 'cash', suggestedOwner: 'Finance' },
    { id: 'ag_hedge', title: 'Lock in price or hedge input costs when volatility high', family: 'Risk', whenCondition: 'Price or input volatility', objective: 'risk', suggestedOwner: 'Finance' },
    { id: 'ag_util', title: 'Optimize capacity utilization and seasonal planning', family: 'Supply', whenCondition: 'Utilization or seasonality', objective: 'margin', suggestedOwner: 'Ops' },
  ],
};

const MINING: SectorPlaybook = {
  sector: 'MINING',
  label: 'Mining',
  opsProfileRef: 'MINING',
  coaCategoryHints: ['revenue', 'cogsTotal', 'cogsPayroll', 'cogsMaterials', 'expense', 'depreciationAmortization'],
  focusPriorities: [
    { metricHint: 'throughput', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 1 },
    { metricHint: 'downtime', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 2 },
    { metricHint: 'cost per ton', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 3 },
    { metricHint: 'recovery rate', whenSevere: 'investigate', whenModerate: 'monitor', rank: 4 },
    { metricHint: 'utilization', whenSevere: 'investigate', whenModerate: 'monitor', rank: 5 },
  ],
  anomalyContext: {
    seasonalityNote: 'Weather and maintenance windows; quarterly production swings.',
    typicalVarianceNote: 'Throughput and cost per ton can move ±15% with outages or grade mix.',
    highSeverityTriggers: ['throughput', 'downtime', 'cost per ton', 'recovery rate'],
  },
  recommendationThemes: [
    { id: 'mining_downtime', title: 'Reduce unplanned downtime and improve utilization', family: 'Capacity', whenCondition: 'Downtime or utilization weak', objective: 'margin', suggestedOwner: 'Ops' },
    { id: 'mining_cost', title: 'Lower cost per ton through throughput and efficiency', family: 'Unit economics', whenCondition: 'Cost per ton elevated', objective: 'margin', suggestedOwner: 'Ops' },
    { id: 'mining_recovery', title: 'Improve recovery rate and grade consistency', family: 'Quality', whenCondition: 'Recovery or grade variance', objective: 'margin', suggestedOwner: 'Ops' },
    { id: 'mining_maintenance', title: 'Optimize maintenance and outage planning', family: 'Capacity', whenCondition: 'Unplanned outages', objective: 'risk', suggestedOwner: 'Ops' },
  ],
};

const UTILITIES: SectorPlaybook = {
  sector: 'UTILITIES',
  label: 'Utilities',
  opsProfileRef: 'UTILITIES',
  coaCategoryHints: ['revenue', 'expense', 'depreciationAmortization', 'infrastructure', 'professionalFees'],
  focusPriorities: [
    { metricHint: 'uptime', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 1 },
    { metricHint: 'outage', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 2 },
    { metricHint: 'cost per unit', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 3 },
    { metricHint: 'load factor', whenSevere: 'investigate', whenModerate: 'monitor', rank: 4 },
    { metricHint: 'loss', whenSevere: 'investigate', whenModerate: 'monitor', rank: 5 },
  ],
  anomalyContext: {
    seasonalityNote: 'Peak demand summer/winter; planned outages in shoulder seasons.',
    typicalVarianceNote: 'Load and cost per unit can vary ±10–15% by season.',
    highSeverityTriggers: ['uptime', 'outage', 'loss', 'response time'],
  },
  recommendationThemes: [
    { id: 'util_uptime', title: 'Improve uptime and reduce outage frequency', family: 'Service', whenCondition: 'Outage or uptime weak', objective: 'risk', suggestedOwner: 'Ops' },
    { id: 'util_loss', title: 'Reduce technical and commercial loss %', family: 'Unit economics', whenCondition: 'Loss % elevated', objective: 'margin', suggestedOwner: 'Ops' },
    { id: 'util_load', title: 'Optimize load factor and peak/off-peak mix', family: 'Capacity', whenCondition: 'Load factor weak', objective: 'margin', suggestedOwner: 'Ops' },
  ],
};

const CONSTRUCTION: SectorPlaybook = {
  sector: 'CONSTRUCTION',
  label: 'Construction',
  opsProfileRef: 'CONSTRUCTION',
  coaCategoryHints: ['revenue', 'cogsTotal', 'subcontractors', 'cogsPayroll', 'expense', 'payroll', 'professionalFees'],
  focusPriorities: [
    { metricHint: 'schedule variance', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 1 },
    { metricHint: 'change orders', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 2 },
    { metricHint: 'job margin', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 3 },
    { metricHint: 'backlog', whenSevere: 'investigate', whenModerate: 'monitor', rank: 4 },
    { metricHint: 'WIP', whenSevere: 'investigate', whenModerate: 'monitor', rank: 5 },
  ],
  anomalyContext: {
    seasonalityNote: 'Weather and project phasing; backlog and completions lumpy by quarter.',
    typicalVarianceNote: 'Job margin and schedule often ±10–15% by job; change orders can spike.',
    highSeverityTriggers: ['schedule variance', 'job margin', 'change orders', 'WIP', 'retention'],
  },
  recommendationThemes: [
    { id: 'constr_schedule', title: 'Reduce schedule variance and improve project execution', family: 'Fulfillment', whenCondition: 'Schedule variance or slippage', objective: 'margin', suggestedOwner: 'Ops' },
    { id: 'constr_change', title: 'Control change orders and scope creep', family: 'Fulfillment', whenCondition: 'Change orders % elevated', objective: 'margin', suggestedOwner: 'Ops' },
    { id: 'constr_margin', title: 'Improve job margin and labor productivity', family: 'Unit economics', whenCondition: 'Job margin or productivity weak', objective: 'margin', suggestedOwner: 'Ops' },
    { id: 'constr_wip', title: 'Tighten WIP and retention collection', family: 'Working capital', whenCondition: 'WIP aging or retention elevated', objective: 'cash', suggestedOwner: 'Finance' },
    { id: 'constr_win', title: 'Strengthen bid win rate and backlog quality', family: 'Demand', whenCondition: 'Win rate or backlog weak', objective: 'growth', suggestedOwner: 'Sales' },
  ],
};

const MANUFACTURING: SectorPlaybook = {
  sector: 'MANUFACTURING',
  label: 'Manufacturing',
  opsProfileRef: 'MANUFACTURING',
  coaCategoryHints: ['revenue', 'cogsTotal', 'cogsMaterials', 'cogsPayroll', 'expense', 'inventory', 'depreciationAmortization'],
  focusPriorities: [
    { metricHint: 'throughput', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 1 },
    { metricHint: 'scrap', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 2 },
    { metricHint: 'first pass yield', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 3 },
    { metricHint: 'cost per unit', whenSevere: 'investigate', whenModerate: 'monitor', rank: 4 },
    { metricHint: 'on-time', whenSevere: 'investigate', whenModerate: 'monitor', rank: 5 },
  ],
  anomalyContext: {
    seasonalityNote: 'Production schedules and customer demand cycles create monthly volatility.',
    typicalVarianceNote: 'Throughput and scrap often move ±8–12% with mix and downtime.',
    highSeverityTriggers: ['throughput', 'scrap', 'first pass yield', 'cost per unit', 'on-time'],
  },
  recommendationThemes: [
    { id: 'mfg_throughput', title: 'Increase throughput and line utilization', family: 'Capacity', whenCondition: 'Throughput or utilization below target', objective: 'margin', suggestedOwner: 'Ops' },
    { id: 'mfg_quality', title: 'Reduce scrap and improve first pass yield', family: 'Quality', whenCondition: 'Scrap or defects elevated', objective: 'margin', suggestedOwner: 'Ops' },
    { id: 'mfg_unit_cost', title: 'Lower unit cost through process efficiency', family: 'Unit economics', whenCondition: 'Cost per unit above plan', objective: 'margin', suggestedOwner: 'Ops' },
    { id: 'mfg_otd', title: 'Improve on-time delivery reliability', family: 'Fulfillment', whenCondition: 'On-time performance weak', objective: 'growth', suggestedOwner: 'Ops' },
  ],
};

const WHOLESALE_TRADE: SectorPlaybook = {
  sector: 'WHOLESALE_TRADE',
  label: 'Wholesale Trade',
  opsProfileRef: 'WHOLESALE_TRADE',
  coaCategoryHints: ['revenue', 'cogsTotal', 'expense', 'inventory', 'marketing', 'rent'],
  focusPriorities: [
    { metricHint: 'fill rate', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 1 },
    { metricHint: 'order volume', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 2 },
    { metricHint: 'gross margin', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 3 },
    { metricHint: 'inventory turns', whenSevere: 'investigate', whenModerate: 'monitor', rank: 4 },
    { metricHint: 'AR days', whenSevere: 'investigate', whenModerate: 'monitor', rank: 5 },
  ],
  anomalyContext: {
    seasonalityNote: 'Demand peaks by product/season; inventory and fill rate swing.',
    typicalVarianceNote: 'Fill rate and margin often ±5–10%; inventory turns by category.',
    highSeverityTriggers: ['fill rate', 'gross margin', 'inventory', 'AR'],
  },
  recommendationThemes: [
    { id: 'wholesale_fill', title: 'Improve fill rate and order fulfillment', family: 'Fulfillment', whenCondition: 'Fill rate or order volume weak', objective: 'growth', suggestedOwner: 'Ops' },
    { id: 'wholesale_inv', title: 'Optimize inventory turns and working capital', family: 'Working capital', whenCondition: 'Inventory turns low', objective: 'cash', suggestedOwner: 'Ops' },
    { id: 'wholesale_freight', title: 'Reduce freight cost % and improve margin', family: 'Unit economics', whenCondition: 'Freight or margin pressure', objective: 'margin', suggestedOwner: 'Ops' },
    { id: 'wholesale_returns', title: 'Lower returns % and cycle time', family: 'Fulfillment', whenCondition: 'Returns or cycle time elevated', objective: 'margin', suggestedOwner: 'Ops' },
  ],
};

const RETAIL_TRADE: SectorPlaybook = {
  sector: 'RETAIL_TRADE',
  label: 'Retail Trade',
  opsProfileRef: 'RETAIL_TRADE',
  coaCategoryHints: ['revenue', 'cogsTotal', 'expense', 'marketing', 'inventory', 'payroll', 'rent'],
  focusPriorities: [
    { metricHint: 'conversion', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 1 },
    { metricHint: 'stockout', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 2 },
    { metricHint: 'gross margin', whenSevere: 'investigate', whenModerate: 'monitor', rank: 3 },
    { metricHint: 'inventory turns', whenSevere: 'investigate', whenModerate: 'monitor', rank: 4 },
    { metricHint: 'sell-through', whenSevere: 'investigate', whenModerate: 'monitor', rank: 5 },
  ],
  anomalyContext: {
    seasonalityNote: 'Holiday and back-to-school peaks; category-specific seasonality.',
    typicalVarianceNote: 'Conversion and traffic can move ±10–15%; margin with promo mix.',
    highSeverityTriggers: ['conversion', 'stockout', 'gross margin', 'sell-through'],
  },
  recommendationThemes: [
    { id: 'retail_stockout', title: 'Reduce stockouts and improve conversion', family: 'Fulfillment & demand', whenCondition: 'Stockout or conversion weak', objective: 'growth', suggestedOwner: 'Ops' },
    { id: 'retail_markdown', title: 'Optimize markdown and promo effectiveness', family: 'Unit economics', whenCondition: 'Margin or promo pressure', objective: 'margin', suggestedOwner: 'Marketing' },
    { id: 'retail_inv', title: 'Improve inventory turns and sell-through', family: 'Working capital', whenCondition: 'Inventory or sell-through weak', objective: 'cash', suggestedOwner: 'Ops' },
    { id: 'retail_basket', title: 'Increase basket size and traffic', family: 'Demand', whenCondition: 'Traffic or basket weak', objective: 'growth', suggestedOwner: 'Marketing' },
    { id: 'retail_returns', title: 'Reduce return rate and improve margin', family: 'Fulfillment', whenCondition: 'Return rate elevated', objective: 'margin', suggestedOwner: 'Ops' },
  ],
};

const TRANSPORTATION: SectorPlaybook = {
  sector: 'TRANSPORTATION',
  label: 'Transportation and Warehousing',
  opsProfileRef: 'TRANSPORTATION',
  coaCategoryHints: ['revenue', 'cogsTotal', 'expense', 'payroll', 'subcontractors', 'depreciationAmortization'],
  focusPriorities: [
    { metricHint: 'on-time', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 1 },
    { metricHint: 'utilization', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 2 },
    { metricHint: 'cost per mile', whenSevere: 'investigate', whenModerate: 'monitor', rank: 3 },
    { metricHint: 'damage', whenSevere: 'investigate', whenModerate: 'monitor', rank: 4 },
    { metricHint: 'claims', whenSevere: 'investigate', whenModerate: 'monitor', rank: 5 },
  ],
  anomalyContext: {
    seasonalityNote: 'Peak shipping periods; weather and demand cause utilization swings.',
    typicalVarianceNote: 'On-time and utilization often ±5–10%; cost per mile with fuel.',
    highSeverityTriggers: ['on-time', 'utilization', 'cost per mile', 'claims', 'damage'],
  },
  recommendationThemes: [
    { id: 'trans_ontime', title: 'Improve on-time delivery and cycle time', family: 'Fulfillment', whenCondition: 'On-time or cycle time weak', objective: 'growth', suggestedOwner: 'Ops' },
    { id: 'trans_util', title: 'Increase utilization and load factor', family: 'Capacity', whenCondition: 'Utilization or load factor weak', objective: 'margin', suggestedOwner: 'Ops' },
    { id: 'trans_cost', title: 'Reduce cost per mile and improve margin per load', family: 'Unit economics', whenCondition: 'Cost per mile or margin weak', objective: 'margin', suggestedOwner: 'Ops' },
    { id: 'trans_claims', title: 'Lower damage and claims', family: 'Quality', whenCondition: 'Damage or claims elevated', objective: 'risk', suggestedOwner: 'Ops' },
  ],
};

const INFORMATION: SectorPlaybook = {
  sector: 'INFORMATION',
  label: 'Information',
  opsProfileRef: 'INFORMATION',
  coaCategoryHints: ['revenue', 'expense', 'payroll', 'marketing', 'professionalFees', 'infrastructure'],
  focusPriorities: [
    { metricHint: 'churn', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 1 },
    { metricHint: 'activation', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 2 },
    { metricHint: 'ARPU', whenSevere: 'investigate', whenModerate: 'monitor', rank: 3 },
    { metricHint: 'uptime', whenSevere: 'investigate', whenModerate: 'monitor', rank: 4 },
    { metricHint: 'gross margin', whenSevere: 'monitor', whenModerate: 'opportunities', rank: 5 },
  ],
  anomalyContext: {
    seasonalityNote: 'Quarter-end and renewal waves; trial and activation can spike with campaigns.',
    typicalVarianceNote: 'Churn and ARPU often ±5–10% month to month.',
    highSeverityTriggers: ['churn', 'activation', 'ARPU', 'uptime', 'latency'],
  },
  recommendationThemes: [
    { id: 'info_churn', title: 'Reduce churn and improve retention', family: 'Customer', whenCondition: 'Churn or retention weak', objective: 'growth', suggestedOwner: 'Ops' },
    { id: 'info_activation', title: 'Improve activation and trial-to-paid', family: 'Demand', whenCondition: 'Activation or trial conversion weak', objective: 'growth', suggestedOwner: 'Marketing' },
    { id: 'info_arpu', title: 'Increase ARPU and expansion revenue', family: 'Unit economics', whenCondition: 'ARPU or expansion weak', objective: 'growth', suggestedOwner: 'Sales' },
    { id: 'info_uptime', title: 'Maintain uptime and reduce latency', family: 'Service', whenCondition: 'Uptime or latency weak', objective: 'risk', suggestedOwner: 'Ops' },
  ],
};

const FINANCE_INSURANCE: SectorPlaybook = {
  sector: 'FINANCE_INSURANCE',
  label: 'Finance and Insurance',
  opsProfileRef: 'FINANCE_INSURANCE',
  coaCategoryHints: ['revenue', 'expense', 'interestExpense', 'payroll', 'professionalFees', 'otherExpense'],
  focusPriorities: [
    { metricHint: 'loss ratio', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 1 },
    { metricHint: 'default rate', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 2 },
    { metricHint: 'net interest margin', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 3 },
    { metricHint: 'policy growth', whenSevere: 'investigate', whenModerate: 'monitor', rank: 4 },
    { metricHint: 'capital adequacy', whenSevere: 'investigate', whenModerate: 'monitor', rank: 5 },
  ],
  anomalyContext: {
    seasonalityNote: 'Reporting and underwriting cycles; loss and default can lag.',
    typicalVarianceNote: 'Loss ratio and NIM often ±3–5%; originations by quarter.',
    highSeverityTriggers: ['loss ratio', 'default rate', 'NIM', 'capital adequacy'],
  },
  recommendationThemes: [
    { id: 'fin_loss', title: 'Improve loss ratio and underwriting', family: 'Quality', whenCondition: 'Loss ratio elevated', objective: 'margin', suggestedOwner: 'Ops' },
    { id: 'fin_default', title: 'Reduce default rate and credit risk', family: 'Quality', whenCondition: 'Default rate elevated', objective: 'risk', suggestedOwner: 'Finance' },
    { id: 'fin_nim', title: 'Protect or improve net interest margin and fee income', family: 'Unit economics', whenCondition: 'NIM or fee income pressure', objective: 'margin', suggestedOwner: 'Finance' },
    { id: 'fin_capital', title: 'Maintain capital adequacy and cash runway', family: 'Working capital', whenCondition: 'Capital or liquidity concern', objective: 'risk', suggestedOwner: 'Finance' },
  ],
};

const REAL_ESTATE: SectorPlaybook = {
  sector: 'REAL_ESTATE',
  label: 'Real Estate, Rental and Leasing',
  opsProfileRef: 'REAL_ESTATE',
  coaCategoryHints: ['revenue', 'expense', 'rent', 'payroll', 'professionalFees', 'depreciationAmortization'],
  focusPriorities: [
    { metricHint: 'occupancy', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 1 },
    { metricHint: 'NOI', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 2 },
    { metricHint: 'turnover', whenSevere: 'investigate', whenModerate: 'monitor', rank: 3 },
    { metricHint: 'rent collection', whenSevere: 'investigate', whenModerate: 'monitor', rank: 4 },
    { metricHint: 'arrears', whenSevere: 'investigate', whenModerate: 'monitor', rank: 5 },
  ],
  anomalyContext: {
    seasonalityNote: 'Lease expirations and turnover by quarter; occupancy can step-change.',
    typicalVarianceNote: 'Occupancy and NOI often stable; arrears and turnover can spike.',
    highSeverityTriggers: ['occupancy', 'NOI', 'turnover', 'arrears', 'rent collection'],
  },
  recommendationThemes: [
    { id: 're_occupancy', title: 'Improve occupancy and lease renewal', family: 'Demand', whenCondition: 'Occupancy or renewal weak', objective: 'growth', suggestedOwner: 'Sales' },
    { id: 're_noi', title: 'Protect NOI margin and rent per unit', family: 'Unit economics', whenCondition: 'NOI or rent pressure', objective: 'margin', suggestedOwner: 'Ops' },
    { id: 're_turnover', title: 'Reduce turnover time and maintenance cycle', family: 'Fulfillment', whenCondition: 'Turnover or maintenance slow', objective: 'margin', suggestedOwner: 'Ops' },
    { id: 're_arrears', title: 'Tighten rent collection and reduce arrears', family: 'Working capital', whenCondition: 'Arrears or collection weak', objective: 'cash', suggestedOwner: 'Finance' },
  ],
};

const PROFESSIONAL_SERVICES: SectorPlaybook = {
  sector: 'PROFESSIONAL_SERVICES',
  label: 'Professional Services',
  opsProfileRef: 'PROFESSIONAL_SERVICES',
  coaCategoryHints: ['revenue', 'expense', 'payroll', 'subcontractors', 'professionalFees', 'marketing'],
  focusPriorities: [
    { metricHint: 'utilization', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 1 },
    { metricHint: 'realization', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 2 },
    { metricHint: 'project margin', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 3 },
    { metricHint: 'pipeline', whenSevere: 'investigate', whenModerate: 'monitor', rank: 4 },
    { metricHint: 'win rate', whenSevere: 'investigate', whenModerate: 'monitor', rank: 5 },
  ],
  anomalyContext: {
    seasonalityNote: 'Quarter-end and project milestones; utilization and pipeline lumpy.',
    typicalVarianceNote: 'Utilization and realization often ±5–10%; project margin by engagement.',
    highSeverityTriggers: ['utilization', 'realization', 'project margin', 'win rate'],
  },
  recommendationThemes: [
    { id: 'ps_util', title: 'Improve utilization and billable capacity', family: 'Capacity', whenCondition: 'Utilization weak', objective: 'margin', suggestedOwner: 'Ops' },
    { id: 'ps_realization', title: 'Increase realization and project margin', family: 'Unit economics', whenCondition: 'Realization or margin weak', objective: 'margin', suggestedOwner: 'Ops' },
    { id: 'ps_pipeline', title: 'Strengthen pipeline and win rate', family: 'Demand', whenCondition: 'Pipeline or win rate weak', objective: 'growth', suggestedOwner: 'Sales' },
    { id: 'ps_repeat', title: 'Improve repeat rate and NPS', family: 'Customer', whenCondition: 'Repeat or NPS weak', objective: 'growth', suggestedOwner: 'Ops' },
  ],
};

const ADMIN_SUPPORT_WASTE: SectorPlaybook = {
  sector: 'ADMIN_SUPPORT_WASTE',
  label: 'Admin & Support + Waste Management/Remediation',
  opsProfileRef: 'ADMIN_SUPPORT_WASTE',
  coaCategoryHints: ['revenue', 'cogsTotal', 'expense', 'payroll', 'fuel', 'professionalFees', 'otherExpense'],
  focusPriorities: [
    { metricHint: 'service volume', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 1 },
    { metricHint: 'on-time completion', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 2 },
    { metricHint: 'cost per service', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 3 },
    { metricHint: 'route density', whenSevere: 'investigate', whenModerate: 'monitor', rank: 4 },
    { metricHint: 'safety', whenSevere: 'investigate', whenModerate: 'monitor', rank: 5 },
  ],
  anomalyContext: {
    seasonalityNote: 'Demand varies by contract cycles and municipal/commercial calendars.',
    typicalVarianceNote: 'Service volume and route costs can shift ±10% by territory and fuel.',
    highSeverityTriggers: ['service volume', 'on-time completion', 'cost per service', 'safety'],
  },
  recommendationThemes: [
    { id: 'asw_route', title: 'Improve route density and dispatch efficiency', family: 'Fulfillment', whenCondition: 'Route density or travel time weak', objective: 'margin', suggestedOwner: 'Ops' },
    { id: 'asw_unit_cost', title: 'Lower cost per service and fuel intensity', family: 'Unit economics', whenCondition: 'Cost per service elevated', objective: 'margin', suggestedOwner: 'Ops' },
    { id: 'asw_ontime', title: 'Increase on-time completion and SLA adherence', family: 'Service', whenCondition: 'On-time completion below SLA', objective: 'growth', suggestedOwner: 'Ops' },
    { id: 'asw_safety', title: 'Reduce safety incidents and rework', family: 'Risk', whenCondition: 'Safety incidents rising', objective: 'risk', suggestedOwner: 'Ops' },
  ],
};

const EDUCATIONAL_SERVICES: SectorPlaybook = {
  sector: 'EDUCATIONAL_SERVICES',
  label: 'Educational Services',
  opsProfileRef: 'EDUCATIONAL_SERVICES',
  coaCategoryHints: ['revenue', 'expense', 'payroll', 'professionalFees', 'marketing', 'rent'],
  focusPriorities: [
    { metricHint: 'enrollment', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 1 },
    { metricHint: 'retention', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 2 },
    { metricHint: 'completion', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 3 },
    { metricHint: 'class utilization', whenSevere: 'investigate', whenModerate: 'monitor', rank: 4 },
    { metricHint: 'cost per student', whenSevere: 'investigate', whenModerate: 'monitor', rank: 5 },
  ],
  anomalyContext: {
    seasonalityNote: 'Enrollment and attendance have strong term-based seasonality.',
    typicalVarianceNote: 'Enrollment and retention can vary ±5–10% by cohort and program.',
    highSeverityTriggers: ['enrollment', 'retention', 'completion', 'cost per student'],
  },
  recommendationThemes: [
    { id: 'edu_retention', title: 'Improve retention and learner completion', family: 'Customer', whenCondition: 'Retention or completion below target', objective: 'growth', suggestedOwner: 'Ops' },
    { id: 'edu_enrollment', title: 'Increase enrollment pipeline and conversion', family: 'Demand', whenCondition: 'Enrollment growth weak', objective: 'growth', suggestedOwner: 'Marketing' },
    { id: 'edu_utilization', title: 'Optimize class and faculty utilization', family: 'Capacity', whenCondition: 'Class utilization below plan', objective: 'margin', suggestedOwner: 'Ops' },
    { id: 'edu_unit_cost', title: 'Reduce cost per student served', family: 'Unit economics', whenCondition: 'Cost per student elevated', objective: 'margin', suggestedOwner: 'Finance' },
  ],
};

const HEALTH_CARE_SOCIAL_ASSISTANCE: SectorPlaybook = {
  sector: 'HEALTH_CARE_SOCIAL_ASSISTANCE',
  label: 'Health Care & Social Assistance',
  opsProfileRef: 'HEALTH_CARE_SOCIAL_ASSISTANCE',
  coaCategoryHints: ['revenue', 'expense', 'payroll', 'professionalFees', 'supplies', 'otherExpense'],
  focusPriorities: [
    { metricHint: 'wait time', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 1 },
    { metricHint: 'no-show', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 2 },
    { metricHint: 'utilization', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 3 },
    { metricHint: 'readmission', whenSevere: 'investigate', whenModerate: 'monitor', rank: 4 },
    { metricHint: 'cost per encounter', whenSevere: 'investigate', whenModerate: 'monitor', rank: 5 },
  ],
  anomalyContext: {
    seasonalityNote: 'Patient/service demand rises seasonally and with local outbreaks/events.',
    typicalVarianceNote: 'Visit volume and staffing utilization can move ±8–12% month to month.',
    highSeverityTriggers: ['wait time', 'no-show', 'readmission', 'utilization', 'cost per encounter'],
  },
  recommendationThemes: [
    { id: 'hsa_access', title: 'Improve access and reduce wait times', family: 'Service', whenCondition: 'Wait time or lead time elevated', objective: 'growth', suggestedOwner: 'Ops' },
    { id: 'hsa_utilization', title: 'Increase provider/case capacity utilization', family: 'Capacity', whenCondition: 'Utilization below target', objective: 'margin', suggestedOwner: 'Ops' },
    { id: 'hsa_no_show', title: 'Reduce no-show and cancellation rates', family: 'Demand', whenCondition: 'No-show rate elevated', objective: 'growth', suggestedOwner: 'Ops' },
    { id: 'hsa_cost', title: 'Lower cost per encounter while maintaining quality', family: 'Unit economics', whenCondition: 'Cost per encounter pressure', objective: 'margin', suggestedOwner: 'Finance' },
  ],
};

const ARTS_ENTERTAINMENT_RECREATION: SectorPlaybook = {
  sector: 'ARTS_ENTERTAINMENT_RECREATION',
  label: 'Arts, Entertainment & Recreation',
  opsProfileRef: 'ARTS_ENTERTAINMENT_RECREATION',
  coaCategoryHints: ['revenue', 'cogsTotal', 'expense', 'marketing', 'payroll', 'rent'],
  focusPriorities: [
    { metricHint: 'attendance', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 1 },
    { metricHint: 'capacity fill', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 2 },
    { metricHint: 'revenue per attendee', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 3 },
    { metricHint: 'repeat attendance', whenSevere: 'investigate', whenModerate: 'monitor', rank: 4 },
    { metricHint: 'concession margin', whenSevere: 'investigate', whenModerate: 'monitor', rank: 5 },
  ],
  anomalyContext: {
    seasonalityNote: 'Demand depends on calendar events, weather, and holidays.',
    typicalVarianceNote: 'Attendance and utilization often swing ±15% by event schedule.',
    highSeverityTriggers: ['attendance', 'capacity fill', 'revenue per attendee', 'repeat attendance'],
  },
  recommendationThemes: [
    { id: 'aer_attendance', title: 'Increase attendance and conversion', family: 'Demand', whenCondition: 'Attendance or conversion weak', objective: 'growth', suggestedOwner: 'Marketing' },
    { id: 'aer_fill', title: 'Improve capacity fill and event mix', family: 'Capacity', whenCondition: 'Capacity fill under target', objective: 'margin', suggestedOwner: 'Ops' },
    { id: 'aer_ticket', title: 'Lift average revenue per attendee', family: 'Unit economics', whenCondition: 'Revenue per attendee below target', objective: 'margin', suggestedOwner: 'Sales' },
    { id: 'aer_retention', title: 'Grow memberships and repeat attendance', family: 'Customer', whenCondition: 'Repeat attendance soft', objective: 'growth', suggestedOwner: 'Marketing' },
  ],
};

const ACCOMMODATION_FOOD_SERVICES: SectorPlaybook = {
  sector: 'ACCOMMODATION_FOOD_SERVICES',
  label: 'Accommodation & Food Services',
  opsProfileRef: 'ACCOMMODATION_FOOD_SERVICES',
  coaCategoryHints: ['revenue', 'cogsTotal', 'expense', 'payroll', 'inventory', 'rent', 'marketing'],
  focusPriorities: [
    { metricHint: 'occupancy', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 1 },
    { metricHint: 'food cost', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 2 },
    { metricHint: 'labor cost', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 3 },
    { metricHint: 'order accuracy', whenSevere: 'investigate', whenModerate: 'monitor', rank: 4 },
    { metricHint: 'guest satisfaction', whenSevere: 'investigate', whenModerate: 'monitor', rank: 5 },
  ],
  anomalyContext: {
    seasonalityNote: 'Strong weekly and seasonal demand cycles across dayparts and travel periods.',
    typicalVarianceNote: 'Occupancy and labor productivity can vary ±10–20% by season.',
    highSeverityTriggers: ['occupancy', 'food cost', 'labor cost', 'order accuracy', 'guest satisfaction'],
  },
  recommendationThemes: [
    { id: 'afs_revpar', title: 'Improve occupancy/table turns and revenue density', family: 'Demand', whenCondition: 'Occupancy or covers below target', objective: 'growth', suggestedOwner: 'Ops' },
    { id: 'afs_food', title: 'Reduce food cost and waste', family: 'Unit economics', whenCondition: 'Food cost % elevated', objective: 'margin', suggestedOwner: 'Ops' },
    { id: 'afs_labor', title: 'Optimize labor scheduling and productivity', family: 'Capacity', whenCondition: 'Labor cost % elevated', objective: 'margin', suggestedOwner: 'Ops' },
    { id: 'afs_service', title: 'Improve service speed and guest satisfaction', family: 'Service', whenCondition: 'Guest satisfaction or speed weak', objective: 'growth', suggestedOwner: 'Ops' },
  ],
};

const OTHER_SERVICES: SectorPlaybook = {
  sector: 'OTHER_SERVICES',
  label: 'Other Services',
  opsProfileRef: 'OTHER_SERVICES',
  coaCategoryHints: ['revenue', 'expense', 'payroll', 'marketing', 'professionalFees', 'rent'],
  focusPriorities: [
    { metricHint: 'bookings', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 1 },
    { metricHint: 'on-time completion', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 2 },
    { metricHint: 'gross margin', whenSevere: 'fix_now', whenModerate: 'investigate', rank: 3 },
    { metricHint: 'repeat customer', whenSevere: 'investigate', whenModerate: 'monitor', rank: 4 },
    { metricHint: 'cycle time', whenSevere: 'investigate', whenModerate: 'monitor', rank: 5 },
  ],
  anomalyContext: {
    seasonalityNote: 'Service demand varies by local seasonality and appointment patterns.',
    typicalVarianceNote: 'Booking and completion rates can shift ±10% month to month.',
    highSeverityTriggers: ['bookings', 'on-time completion', 'gross margin', 'repeat customer'],
  },
  recommendationThemes: [
    { id: 'other_demand', title: 'Increase bookings and conversion', family: 'Demand', whenCondition: 'Bookings or conversion weak', objective: 'growth', suggestedOwner: 'Marketing' },
    { id: 'other_margin', title: 'Improve ticket mix and gross margin', family: 'Unit economics', whenCondition: 'Margin below target', objective: 'margin', suggestedOwner: 'Ops' },
    { id: 'other_cycle', title: 'Reduce service cycle time and improve completion', family: 'Fulfillment', whenCondition: 'Cycle time elevated', objective: 'margin', suggestedOwner: 'Ops' },
    { id: 'other_repeat', title: 'Increase repeat customers and loyalty', family: 'Customer', whenCondition: 'Repeat rate declining', objective: 'growth', suggestedOwner: 'Sales' },
  ],
};

const SECTOR_PLAYBOOKS: Record<string, SectorPlaybook> = {
  DEFAULT: DEFAULT_PLAYBOOK,
  AGRICULTURE,
  MINING,
  UTILITIES,
  CONSTRUCTION,
  MANUFACTURING,
  WHOLESALE_TRADE,
  RETAIL_TRADE,
  TRANSPORTATION,
  INFORMATION,
  FINANCE_INSURANCE,
  REAL_ESTATE,
  PROFESSIONAL_SERVICES,
  ADMIN_SUPPORT_WASTE,
  EDUCATIONAL_SERVICES,
  HEALTH_CARE_SOCIAL_ASSISTANCE,
  ARTS_ENTERTAINMENT_RECREATION,
  ACCOMMODATION_FOOD_SERVICES,
  OTHER_SERVICES,
};

/**
 * Returns the sector playbook for the given company industry sector category.
 * Uses same normalization as getOpsMetricProfile (trim, uppercase, spaces/dashes → underscore).
 * Fallback: DEFAULT playbook when sector is missing or unknown.
 */
export function getSectorPlaybook(industrySectorCategory: string | null | undefined): SectorPlaybook {
  const key = normalizeIndustrySectorCategory(industrySectorCategory);
  return SECTOR_PLAYBOOKS[key] ?? DEFAULT_PLAYBOOK;
}

/**
 * Returns the focus bucket (Fix now / Investigate / Monitor / Opportunities) for a given
 * metric and severity, using the playbook's focus priorities when there is a rank match.
 */
export function getFocusBucketForMetric(
  playbook: SectorPlaybook,
  metricLabel: string,
  severity: 'high' | 'medium' | 'low'
): FocusBucket {
  const normalizedMetric = (metricLabel || '').toLowerCase();
  const priority = playbook.focusPriorities.find((p) => {
    const hint = (p.metricHint || '').toLowerCase();
    return hint && normalizedMetric.includes(hint);
  });
  if (priority) {
    return severity === 'high' ? priority.whenSevere : priority.whenModerate;
  }
  // Default: high → investigate, medium → monitor, low → opportunities
  if (severity === 'high') return 'investigate';
  if (severity === 'medium') return 'monitor';
  return 'opportunities';
}

/**
 * Returns true if the anomaly metric name matches a high-severity trigger for the sector.
 * Used to optionally elevate severity when sector playbook says this metric is critical.
 */
export function isHighSeverityTrigger(playbook: SectorPlaybook, metricName: string): boolean {
  const triggers = playbook.anomalyContext.highSeverityTriggers;
  if (!triggers?.length) return false;
  const normalized = (metricName || '').toLowerCase();
  return triggers.some((t) => normalized.includes(t.toLowerCase()));
}

// --- Recommendation layer: match themes to signals ---

export type RecommendationSignals = {
  revenue: number;
  growth: number;
  grossMargin: number;
  dso: number | null;
  dio: number | null;
  cogs: number;
  grossMarginBenchmark: number | null;
  dsoBenchmark: number | null;
  dioBenchmark: number | null;
};

export type RecommendationMatch = {
  why: string[];
  impactLow: number | null;
  impactHigh: number | null;
  impactUnit: 'EBITDA' | 'Cash' | 'Revenue';
  confidence: number;
  feasibility: number;
  metric: string;
};

/**
 * Returns a match (rationale + impact) if the theme applies given current signals.
 * Used by the run route to generate sector opportunities from playbook themes.
 */
export function matchRecommendationTheme(
  theme: RecommendationTheme,
  signals: RecommendationSignals
): RecommendationMatch | null {
  const { revenue, growth, grossMargin, dso, dio, cogs, grossMarginBenchmark, dsoBenchmark, dioBenchmark } = signals;
  const id = theme.id.toLowerCase();
  const cond = (theme.whenCondition || '').toLowerCase();

  // Cash / working capital
  if (theme.objective === 'cash') {
    if ((id.includes('dso') || id.includes('receivables') || cond.includes('dso')) && dso != null && dsoBenchmark != null && dso > dsoBenchmark + 5 && revenue > 0) {
      const cashImpact = ((dso - dsoBenchmark) / 365) * revenue;
      return {
        why: [`DSO ${Math.round(dso)} days vs peer ${Math.round(dsoBenchmark)}. Cash conversion slower than peer.`],
        impactLow: cashImpact * 0.5,
        impactHigh: cashImpact * 0.9,
        impactUnit: 'Cash',
        confidence: 0.6,
        feasibility: 0.75,
        metric: 'DSO',
      };
    }
    if ((id.includes('inventory') || id.includes('inv') || cond.includes('inventory')) && dio != null && dioBenchmark != null && dio > dioBenchmark + 5 && cogs > 0) {
      const cashImpact = ((dio - dioBenchmark) / 365) * cogs;
      return {
        why: [`Inventory days ${Math.round(dio)} vs peer ${Math.round(dioBenchmark)}. Excess working capital in inventory.`],
        impactLow: cashImpact * 0.4,
        impactHigh: cashImpact * 0.8,
        impactUnit: 'Cash',
        confidence: 0.5,
        feasibility: 0.55,
        metric: 'Inventory Days',
      };
    }
  }

  // Margin
  if (theme.objective === 'margin') {
    if ((id.includes('margin') || id.includes('gross') || cond.includes('margin')) && grossMarginBenchmark != null && grossMargin < grossMarginBenchmark - 0.02 && revenue > 0) {
      const gap = grossMarginBenchmark - grossMargin;
      return {
        why: [`Gross margin ${(grossMargin * 100).toFixed(1)}% vs peer ${(grossMarginBenchmark * 100).toFixed(1)}%. Margin gap suggests pricing or mix improvement.`],
        impactLow: revenue * gap * 0.4,
        impactHigh: revenue * gap * 0.85,
        impactUnit: 'EBITDA',
        confidence: 0.58,
        feasibility: 0.65,
        metric: 'Gross Margin',
      };
    }
  }

  // Growth
  if (theme.objective === 'growth') {
    if (growth > 0.05 && (grossMarginBenchmark == null || grossMargin >= grossMarginBenchmark) && revenue > 0 && (id.includes('scale') || id.includes('channel') || id.includes('pipeline') || id.includes('growth'))) {
      return {
        why: [`Revenue growth ${(growth * 100).toFixed(1)}% over last 3 months. Margin is healthy; consider scaling channels.`],
        impactLow: revenue * 0.05,
        impactHigh: revenue * 0.12,
        impactUnit: 'Revenue',
        confidence: 0.55,
        feasibility: 0.6,
        metric: 'Revenue Growth',
      };
    }
    if (grossMarginBenchmark != null && grossMargin > grossMarginBenchmark + 0.02 && growth < 0.03 && revenue > 0 && (id.includes('pipeline') || id.includes('expand') || id.includes('monetize'))) {
      return {
        why: [`Strong margin ${(grossMargin * 100).toFixed(1)}% vs peer ${(grossMarginBenchmark * 100).toFixed(1)}%. Growth ${(growth * 100).toFixed(1)}% below potential.`],
        impactLow: revenue * 0.04,
        impactHigh: revenue * 0.1,
        impactUnit: 'Revenue',
        confidence: 0.5,
        feasibility: 0.55,
        metric: 'Pipeline Growth',
      };
    }
  }

  // Risk: no simple signal in current run; skip unless we add covenant/liquidity later
  return null;
}

/** Map playbook objective to run's opportunity objective type. */
export function themeObjectiveToRun(objective: RecommendationTheme['objective']): 'Cash' | 'Margin' | 'Growth' | 'Risk' {
  return objective.charAt(0).toUpperCase() + objective.slice(1) as 'Cash' | 'Margin' | 'Growth' | 'Risk';
}

/** Map playbook suggestedOwner to run's owner type (default Ops). */
export function themeOwnerToRun(owner: RecommendationTheme['suggestedOwner']): 'Sales' | 'Ops' | 'Finance' | 'Marketing' {
  if (owner === 'Sales' || owner === 'Ops' || owner === 'Finance' || owner === 'Marketing') return owner;
  return 'Ops';
}
