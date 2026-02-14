import { normalizeIndustrySectorCategory } from './industry-sector-category';

export type OpsMetricCategory =
  | 'demand'
  | 'supply'
  | 'fulfillment'
  | 'customer'
  | 'unitEconomics'
  | 'workingCapital'
  | 'capacity'
  | 'quality'
  | 'service';

export type OpsMetricGroup = {
  category: OpsMetricCategory;
  items: string[];
};

export type OpsMetricProfile = {
  sector: string;
  label: string;
  groups: OpsMetricGroup[];
  suggestedGoals: string[];
};

const DEFAULT_PROFILE: OpsMetricProfile = {
  sector: 'DEFAULT',
  label: 'General Operations',
  groups: [
    { category: 'demand', items: ['orders', 'revenue per customer', 'backlog'] },
    { category: 'fulfillment', items: ['cycle time', 'on-time %', 'returns %'] },
    { category: 'customer', items: ['churn', 'repeat rate', 'NPS'] },
    { category: 'unitEconomics', items: ['contribution per order', 'gross margin %'] },
    { category: 'workingCapital', items: ['AR days', 'AP days', 'inventory days'] },
  ],
  suggestedGoals: ['order volume', 'on-time delivery %', 'gross margin %'],
};

const OPS_METRIC_PROFILES: Record<string, OpsMetricProfile> = {
  AGRICULTURE: {
    sector: 'AGRICULTURE',
    label: 'Agriculture',
    groups: [
      { category: 'demand', items: ['orders', 'price per unit', 'yield per acre'] },
      { category: 'supply', items: ['capacity utilization', 'input cost per unit'] },
      { category: 'quality', items: ['shrink %', 'defect %'] },
      { category: 'workingCapital', items: ['inventory days', 'cash conversion'] },
    ],
    suggestedGoals: ['yield per acre', 'shrink %', 'cash conversion days'],
  },
  MINING: {
    sector: 'MINING',
    label: 'Mining',
    groups: [
      { category: 'supply', items: ['throughput', 'downtime %', 'utilization %'] },
      { category: 'capacity', items: ['planned vs unplanned outages'] },
      { category: 'unitEconomics', items: ['cost per ton', 'margin per ton'] },
      { category: 'quality', items: ['grade variance', 'recovery rate'] },
    ],
    suggestedGoals: ['throughput', 'cost per ton', 'downtime %'],
  },
  UTILITIES: {
    sector: 'UTILITIES',
    label: 'Utilities',
    groups: [
      { category: 'service', items: ['uptime %', 'outage frequency', 'response time'] },
      { category: 'capacity', items: ['load factor', 'peak vs off-peak'] },
      { category: 'unitEconomics', items: ['cost per kWh', 'loss %'] },
    ],
    suggestedGoals: ['uptime %', 'loss %', 'cost per unit'],
  },
  CONSTRUCTION: {
    sector: 'CONSTRUCTION',
    label: 'Construction',
    groups: [
      { category: 'demand', items: ['backlog', 'bid win rate'] },
      { category: 'fulfillment', items: ['schedule variance', 'change orders %'] },
      { category: 'unitEconomics', items: ['job margin', 'labor productivity'] },
      { category: 'workingCapital', items: ['WIP aging', 'retention receivable'] },
    ],
    suggestedGoals: ['schedule variance', 'job margin', 'change orders %'],
  },
  MANUFACTURING: {
    sector: 'MANUFACTURING',
    label: 'Manufacturing',
    groups: [
      { category: 'supply', items: ['throughput', 'capacity utilization %', 'scrap %'] },
      { category: 'fulfillment', items: ['on-time delivery %', 'cycle time', 'schedule adherence %'] },
      { category: 'quality', items: ['first pass yield', 'defect %'] },
      { category: 'unitEconomics', items: ['cost per unit', 'gross margin %'] },
    ],
    suggestedGoals: ['throughput', 'first pass yield', 'cost per unit'],
  },
  WHOLESALE_TRADE: {
    sector: 'WHOLESALE_TRADE',
    label: 'Wholesale Trade',
    groups: [
      { category: 'demand', items: ['order volume', 'fill rate'] },
      { category: 'fulfillment', items: ['cycle time', 'returns %'] },
      { category: 'unitEconomics', items: ['gross margin %', 'freight cost %'] },
      { category: 'workingCapital', items: ['inventory turns', 'AR days'] },
    ],
    suggestedGoals: ['fill rate', 'inventory turns', 'gross margin %'],
  },
  RETAIL_TRADE: {
    sector: 'RETAIL_TRADE',
    label: 'Retail Trade',
    groups: [
      { category: 'demand', items: ['traffic', 'conversion %', 'basket size'] },
      { category: 'fulfillment', items: ['stockout %', 'return rate'] },
      { category: 'unitEconomics', items: ['gross margin %', 'promo lift'] },
      { category: 'workingCapital', items: ['inventory turns', 'sell-through %'] },
    ],
    suggestedGoals: ['conversion %', 'stockout %', 'inventory turns'],
  },
  TRANSPORTATION: {
    sector: 'TRANSPORTATION',
    label: 'Transportation and Warehousing',
    groups: [
      { category: 'capacity', items: ['utilization %', 'load factor'] },
      { category: 'fulfillment', items: ['on-time %', 'cycle time'] },
      { category: 'unitEconomics', items: ['cost per mile', 'margin per load'] },
      { category: 'quality', items: ['damage rate', 'claims %'] },
    ],
    suggestedGoals: ['on-time %', 'cost per mile', 'utilization %'],
  },
  INFORMATION: {
    sector: 'INFORMATION',
    label: 'Information',
    groups: [
      { category: 'demand', items: ['trial starts', 'activation %'] },
      { category: 'customer', items: ['churn', 'retention', 'NPS'] },
      { category: 'unitEconomics', items: ['ARPU', 'gross margin %'] },
      { category: 'service', items: ['uptime %', 'latency'] },
    ],
    suggestedGoals: ['churn', 'activation %', 'uptime %'],
  },
  FINANCE_INSURANCE: {
    sector: 'FINANCE_INSURANCE',
    label: 'Finance and Insurance',
    groups: [
      { category: 'demand', items: ['policy growth', 'loan originations'] },
      { category: 'quality', items: ['loss ratio', 'default rate'] },
      { category: 'unitEconomics', items: ['net interest margin', 'fee income %'] },
      { category: 'workingCapital', items: ['cash runway', 'capital adequacy'] },
    ],
    suggestedGoals: ['loss ratio', 'default rate', 'net interest margin'],
  },
  REAL_ESTATE: {
    sector: 'REAL_ESTATE',
    label: 'Real Estate, Rental and Leasing',
    groups: [
      { category: 'demand', items: ['occupancy %', 'lease renewal %'] },
      { category: 'unitEconomics', items: ['NOI margin', 'rent per unit'] },
      { category: 'fulfillment', items: ['turnover time', 'maintenance cycle time'] },
      { category: 'workingCapital', items: ['rent collection days', 'arrears %'] },
    ],
    suggestedGoals: ['occupancy %', 'NOI margin', 'turnover time'],
  },
  PROFESSIONAL_SERVICES: {
    sector: 'PROFESSIONAL_SERVICES',
    label: 'Professional Services',
    groups: [
      { category: 'demand', items: ['pipeline', 'win rate'] },
      { category: 'capacity', items: ['utilization %', 'billable rate'] },
      { category: 'unitEconomics', items: ['project margin', 'realization %'] },
      { category: 'customer', items: ['repeat rate', 'NPS'] },
    ],
    suggestedGoals: ['utilization %', 'project margin', 'win rate'],
  },
  ADMIN_SUPPORT_WASTE: {
    sector: 'ADMIN_SUPPORT_WASTE',
    label: 'Admin & Support + Waste Management/Remediation',
    groups: [
      { category: 'demand', items: ['service volume', 'route density', 'contract renewals %'] },
      { category: 'fulfillment', items: ['on-time completion %', 'schedule adherence %'] },
      { category: 'unitEconomics', items: ['cost per service', 'fuel cost %', 'gross margin %'] },
      { category: 'quality', items: ['safety incidents', 'rework %'] },
    ],
    suggestedGoals: ['on-time completion %', 'cost per service', 'contract renewals %'],
  },
  EDUCATIONAL_SERVICES: {
    sector: 'EDUCATIONAL_SERVICES',
    label: 'Educational Services',
    groups: [
      { category: 'demand', items: ['enrollment growth', 'program fill rate'] },
      { category: 'customer', items: ['retention %', 'completion %', 'NPS'] },
      { category: 'service', items: ['instructional hours delivered', 'class utilization %'] },
      { category: 'unitEconomics', items: ['revenue per student', 'cost per student'] },
    ],
    suggestedGoals: ['retention %', 'completion %', 'revenue per student'],
  },
  HEALTH_CARE_SOCIAL_ASSISTANCE: {
    sector: 'HEALTH_CARE_SOCIAL_ASSISTANCE',
    label: 'Health Care & Social Assistance',
    groups: [
      { category: 'service', items: ['visit volume', 'appointment lead time', 'wait time'] },
      { category: 'quality', items: ['readmission %', 'no-show %', 'compliance %'] },
      { category: 'capacity', items: ['provider utilization %', 'bed/slot utilization %'] },
      { category: 'unitEconomics', items: ['revenue per visit', 'cost per encounter'] },
    ],
    suggestedGoals: ['wait time', 'no-show %', 'provider utilization %'],
  },
  ARTS_ENTERTAINMENT_RECREATION: {
    sector: 'ARTS_ENTERTAINMENT_RECREATION',
    label: 'Arts, Entertainment & Recreation',
    groups: [
      { category: 'demand', items: ['attendance', 'ticket conversion %', 'membership growth'] },
      { category: 'fulfillment', items: ['event utilization %', 'capacity fill %'] },
      { category: 'unitEconomics', items: ['revenue per attendee', 'concession margin %'] },
      { category: 'customer', items: ['repeat attendance %', 'NPS'] },
    ],
    suggestedGoals: ['attendance', 'capacity fill %', 'revenue per attendee'],
  },
  ACCOMMODATION_FOOD_SERVICES: {
    sector: 'ACCOMMODATION_FOOD_SERVICES',
    label: 'Accommodation & Food Services',
    groups: [
      { category: 'demand', items: ['occupancy %', 'table turns', 'covers per day'] },
      { category: 'fulfillment', items: ['service speed', 'order accuracy %'] },
      { category: 'unitEconomics', items: ['RevPAR', 'food cost %', 'labor cost %'] },
      { category: 'quality', items: ['guest satisfaction', 'complaint rate'] },
    ],
    suggestedGoals: ['occupancy %', 'food cost %', 'order accuracy %'],
  },
  OTHER_SERVICES: {
    sector: 'OTHER_SERVICES',
    label: 'Other Services',
    groups: [
      { category: 'demand', items: ['bookings', 'lead-to-booking conversion %'] },
      { category: 'fulfillment', items: ['cycle time', 'on-time completion %'] },
      { category: 'unitEconomics', items: ['average ticket', 'gross margin %'] },
      { category: 'customer', items: ['repeat customer %', 'NPS'] },
    ],
    suggestedGoals: ['bookings', 'on-time completion %', 'gross margin %'],
  },
};

export function getOpsMetricProfile(industrySectorCategory?: string | null): OpsMetricProfile {
  const normalized = normalizeIndustrySectorCategory(industrySectorCategory);
  return OPS_METRIC_PROFILES[normalized] || DEFAULT_PROFILE;
}
