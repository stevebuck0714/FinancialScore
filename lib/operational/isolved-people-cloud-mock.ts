import { addEstCalendarDays, previousEstBusinessDate, previousEstCalendarDate } from '@/lib/time/eastern';
import { ISOLVED_REPORT_SOURCE } from '@/lib/operational/isolved-people-cloud';

export const ISOLVED_MOCK_NOTE =
  'Dev mock isolved People Cloud data for a $12M+ payroll bureau book: 200+ employer clients and about 10,000 employees, including several clients with 100+ employees. The named compensation roster is a sample of that census. Live isolved sync will replace this after credentials are connected.';

const CLIENT_BOOK_SIZE = 228;
const ROSTER_BUDGET = 1100;

type Rng = {
  next: () => number;
  int: (min: number, max: number) => number;
  pick: <T>(items: readonly T[]) => T;
};

type IndustryTemplate = {
  division: string;
  departments: readonly string[];
  locations: readonly string[];
  roles: readonly string[];
  nouns: readonly string[];
  suffixes: readonly string[];
  hourlyShare: number;
  avgAnnual: number;
};

type ClientRecord = {
  name: string;
  ein: string;
  status: 'Active' | 'Onboarding';
  division: string;
  departments: readonly string[];
  locations: readonly string[];
  roles: readonly string[];
  currentCount: number;
  terminatedCount: number;
  avgAnnualCost: number;
  hourlyShare: number;
  coveredShare: number;
  payFrequency: 'Weekly' | 'Biweekly' | 'Semimonthly';
  payGroup: string;
  depositDirectShare: number;
  accountManager: string;
  processor: string;
  sizeBand: 'Small' | 'Mid' | 'Large' | 'Enterprise';
  stateCount: number;
  jobCosting: boolean;
  union: boolean;
  tipsOrCommissions: boolean;
  offCycleFrequent: boolean;
};

type MockEmployee = {
  id: string;
  name: string;
  clientName: string;
  role: string;
  division: string;
  department: string;
  location: string;
  employmentStatus: string;
  payType: string;
  paidPer: 'Hour' | 'Year';
  annualCost: number;
  hourlyCost: number | null;
  billRateLevel: string;
  payGroup: string;
  payFrequency: ClientRecord['payFrequency'];
  depositMethod: string;
};

type GroupAcc = {
  headcount: number;
  hourlyCount: number;
  salaryCount: number;
  annualSum: number;
  minAnnual: number;
  maxAnnual: number;
  covered: number;
};

type GroupRow = {
  key: string;
  headcount: number;
  hourlyCount: number;
  salaryCount: number;
  avgHourlyCost: number | null;
  avgAnnualCost: number | null;
  avgMonthlyCost: number | null;
  totalAnnualCost: number | null;
  minAnnualCost: number | null;
  maxAnnualCost: number | null;
  billRateLevelCoveragePct: number;
};

const INDUSTRY_TEMPLATES: readonly IndustryTemplate[] = [
  {
    division: 'Healthcare',
    departments: ['Nursing', 'Allied Health', 'Credentialing', 'Administration'],
    locations: ['Brooklyn NY', 'Newark NJ', 'Philadelphia PA'],
    roles: ['RN', 'LPN', 'CNA', 'Credentialing Specialist', 'Clinical Supervisor'],
    nouns: ['Medical', 'Health', 'Care', 'Clinic'],
    suffixes: ['Staffing', 'Group', 'Associates', 'Partners'],
    hourlyShare: 0.78,
    avgAnnual: 58_000,
  },
  {
    division: 'Manufacturing',
    departments: ['Production', 'Quality', 'Maintenance', 'Warehouse'],
    locations: ['Allentown PA', 'Trenton NJ', 'York PA'],
    roles: ['Machine Operator', 'Quality Inspector', 'Maintenance Lead', 'Production Supervisor', 'Assembler'],
    nouns: ['Manufacturing', 'Industrial', 'Fabrication', 'Precision'],
    suffixes: ['Works', 'Industries', 'Products', 'Manufacturing'],
    hourlyShare: 0.82,
    avgAnnual: 49_500,
  },
  {
    division: 'Logistics',
    departments: ['Warehouse', 'Dispatch', 'Safety', 'Fleet'],
    locations: ['Elizabeth NJ', 'Harrisburg PA', 'Newburgh NY'],
    roles: ['Warehouse Associate', 'Forklift Operator', 'Dispatcher', 'Safety Coordinator', 'CDL Driver'],
    nouns: ['Logistics', 'Freight', 'Distribution', 'Supply'],
    suffixes: ['Logistics', 'Transport', 'Distribution', 'Freight'],
    hourlyShare: 0.86,
    avgAnnual: 47_000,
  },
  {
    division: 'Facilities',
    departments: ['Janitorial', 'Engineering', 'Site Services', 'Security'],
    locations: ['Philadelphia PA', 'Wilmington DE', 'Jersey City NJ'],
    roles: ['Facilities Technician', 'Janitorial Lead', 'Site Supervisor', 'Engineer', 'Security Officer'],
    nouns: ['Facilities', 'Property', 'Building', 'Campus'],
    suffixes: ['Facilities', 'Services', 'Maintenance', 'Operations'],
    hourlyShare: 0.8,
    avgAnnual: 44_000,
  },
  {
    division: 'Hospitality',
    departments: ['Front Desk', 'Housekeeping', 'Food & Beverage', 'Events'],
    locations: ['Atlantic City NJ', 'Scranton PA', 'White Plains NY'],
    roles: ['Front Desk Agent', 'Housekeeper', 'Server', 'Shift Manager', 'Cook'],
    nouns: ['Hospitality', 'Hotel', 'Resort', 'Dining'],
    suffixes: ['Hospitality', 'Inns', 'Hotels', 'Hospitality Group'],
    hourlyShare: 0.88,
    avgAnnual: 38_500,
  },
  {
    division: 'BPO',
    departments: ['Inbound', 'Quality', 'Workforce', 'Training'],
    locations: ['Buffalo NY', 'Pittsburgh PA', 'Syracuse NY'],
    roles: ['Customer Support Rep', 'Quality Analyst', 'Workforce Planner', 'Team Lead', 'Trainer'],
    nouns: ['Contact', 'Support', 'Service', 'Call'],
    suffixes: ['Center', 'Support', 'Solutions', 'Services'],
    hourlyShare: 0.84,
    avgAnnual: 42_000,
  },
  {
    division: 'Professional Services',
    departments: ['Client Services', 'Payroll Ops', 'HR', 'Finance'],
    locations: ['White Plains NY', 'Paramus NJ', 'Stamford CT'],
    roles: ['Account Manager', 'Payroll Specialist', 'HR Coordinator', 'Controller', 'Staff Accountant'],
    nouns: ['Workforce', 'Advisory', 'Business', 'People'],
    suffixes: ['Advisors', 'Group', 'Consulting', 'Partners'],
    hourlyShare: 0.28,
    avgAnnual: 72_000,
  },
  {
    division: 'Construction Support',
    departments: ['Field', 'Safety', 'Estimating', 'Office'],
    locations: ['Edison NJ', 'Bethlehem PA', 'Albany NY'],
    roles: ['Laborer', 'Foreman', 'Safety Manager', 'Estimator', 'Project Coordinator'],
    nouns: ['Construction', 'Builder', 'Trades', 'Field'],
    suffixes: ['Construction', 'Builders', 'Trades', 'Contracting'],
    hourlyShare: 0.83,
    avgAnnual: 54_000,
  },
] as const;

const ACCOUNT_MANAGERS = [
  'Dana Alvarez',
  'Marcus Chen',
  'Priya Shah',
  'Jordan Blake',
  'Elena Rossi',
  'Chris Okonkwo',
  'Taylor Nguyen',
] as const;

const PAYROLL_PROCESSORS = [
  'Pat Reynolds',
  'Sam Ortega',
  'Kim Walsh',
  'Alex Brooks',
  'Riley Patel',
  'Morgan Diaz',
  'Casey Hughes',
  'Quinn Bennett',
] as const;

const FLAGSHIP_CLIENTS: Array<{ name: string; templateIndex: number; currentCount: number }> = [
  { name: 'Harbor Medical Staffing', templateIndex: 0, currentCount: 412 },
  { name: 'Granite Manufacturing', templateIndex: 1, currentCount: 286 },
  { name: 'Blue Ridge Logistics', templateIndex: 2, currentCount: 241 },
  { name: 'Keystone Facilities', templateIndex: 3, currentCount: 188 },
  { name: 'Lighthouse Hospitality', templateIndex: 4, currentCount: 167 },
  { name: 'Northstar Contact Center', templateIndex: 5, currentCount: 154 },
  { name: 'Atlas Workforce', templateIndex: 6, currentCount: 138 },
  { name: 'Evergreen Support', templateIndex: 6, currentCount: 121 },
  { name: 'Summit Care Partners', templateIndex: 0, currentCount: 209 },
  { name: 'Ironwood Warehousing', templateIndex: 2, currentCount: 176 },
  { name: 'Crescent Distribution', templateIndex: 2, currentCount: 143 },
  { name: 'Patriot Trades Group', templateIndex: 7, currentCount: 132 },
];

const NAME_PREFIXES = [
  'Harbor', 'Granite', 'Crescent', 'Delta', 'Evergreen', 'Frontline', 'Ironwood', 'Keystone',
  'Lighthouse', 'Northstar', 'Pioneer', 'Redwood', 'Silverline', 'Summit', 'Trident', 'Valley',
  'Westfield', 'Apex', 'Beacon', 'Cascade', 'Cobalt', 'Elmwood', 'Foxhill', 'Glacier',
  'Horizon', 'Juniper', 'Linden', 'Maple', 'Oakridge', 'Pacific', 'Quarry', 'Riverbend',
  'Stonegate', 'Timber', 'Union', 'Vista', 'Willow', 'Yorkshire', 'Zenith', 'Capitol',
] as const;

const FIRST_NAMES = [
  'Avery', 'Jordan', 'Taylor', 'Morgan', 'Riley', 'Casey', 'Jamie', 'Cameron', 'Parker', 'Quinn',
  'Alex', 'Sam', 'Drew', 'Reese', 'Skyler', 'Harper', 'Logan', 'Peyton', 'Rowan', 'Sage',
  'Elena', 'Marcus', 'Priya', 'Devon', 'Nina', 'Omar', 'Chloe', 'Andre', 'Sofia', 'Luis',
] as const;
const LAST_NAMES = [
  'Reed', 'Miller', 'Patel', 'Hayes', 'Brooks', 'Nguyen', 'Diaz', 'Wright', 'Turner', 'Cooper',
  'Bennett', 'Ortiz', 'Walsh', 'Singh', 'Keller', 'Ramirez', 'Foster', 'Hughes', 'Powell', 'Price',
  'Shaw', 'Griffin', 'West', 'Lane', 'Ford', 'Bishop', 'Grant', 'Fleming', 'Bates', 'Nash',
] as const;
const PAY_GRADES = ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4'] as const;
const MISSING_BILL_RATE_LEVEL = 'Missing bill rate level';
const LEAVE_TYPES = ['PTO', 'Sick', 'Personal'] as const;
const APPLICATION_STATUSES = [
  { status: 'New', jobStage: 'New Applicant' },
  { status: 'Screened', jobStage: 'Screening' },
  { status: 'Interview', jobStage: 'Interview' },
  { status: 'Meet & Greet', jobStage: 'Meet & Greet' },
  { status: 'Offer', jobStage: 'Offer' },
  { status: 'Hired', jobStage: 'Hired' },
  { status: 'Rejected', jobStage: 'Screened' },
] as const;

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRng(seedKey: string): Rng {
  const next = mulberry32(xmur3(seedKey)());
  return {
    next,
    int(min: number, max: number) {
      return Math.floor(min + next() * (max - min + 1));
    },
    pick<T>(items: readonly T[]): T {
      return items[this.int(0, items.length - 1)];
    },
  };
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

function pct(part: number, total: number): number {
  return total > 0 ? round2((part / total) * 100) : 0;
}

function average(values: Array<number | null>): number | null {
  const finite = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return finite.length ? round2(finite.reduce((sum, value) => sum + value, 0) / finite.length) : null;
}

function einForIndex(index: number): string {
  const prefix = 10 + (index % 88);
  const rest = String(1_000_000 + index * 4177).slice(-7);
  return `${String(prefix).padStart(2, '0')}-${rest}`;
}

function assignedHeadcount(index: number, rng: Rng, onboarding: boolean): number {
  if (onboarding) return rng.int(6, 16);
  if (index < FLAGSHIP_CLIENTS.length) return FLAGSHIP_CLIENTS[index].currentCount;
  if (index < 20) return rng.int(118, 210);
  if (index < 48) return rng.int(62, 112);
  if (index < 96) return rng.int(24, 58);
  return rng.int(7, 23);
}

function isolvedClientSizeBand(employeeCount: number): ClientRecord['sizeBand'] {
  if (employeeCount >= 250) return 'Enterprise';
  if (employeeCount >= 100) return 'Large';
  if (employeeCount >= 25) return 'Mid';
  return 'Small';
}

function payFrequencyForTemplate(template: IndustryTemplate, rng: Rng): ClientRecord['payFrequency'] {
  if (template.division === 'Professional Services') return rng.next() > 0.35 ? 'Semimonthly' : 'Biweekly';
  return rng.next() > 0.42 ? 'Weekly' : 'Biweekly';
}

function buildClientBook(companyId: string): ClientRecord[] {
  const rng = makeRng(`isolved-people-cloud:${companyId}:clients`);
  const usedNames = new Set<string>();
  const clients: ClientRecord[] = [];
  for (let index = 0; index < CLIENT_BOOK_SIZE; index += 1) {
    const onboarding = index >= CLIENT_BOOK_SIZE - 9;
    const template = index < FLAGSHIP_CLIENTS.length
      ? INDUSTRY_TEMPLATES[FLAGSHIP_CLIENTS[index].templateIndex]
      : INDUSTRY_TEMPLATES[index % INDUSTRY_TEMPLATES.length];
    let name = index < FLAGSHIP_CLIENTS.length
      ? FLAGSHIP_CLIENTS[index].name
      : (() => {
          const prefix = rng.pick(NAME_PREFIXES);
          const noun = rng.pick(template.nouns);
          const suffix = rng.pick(template.suffixes);
          const suffixStart = suffix.split(' ')[0].toLowerCase();
          if (noun.toLowerCase() === suffixStart || suffix.toLowerCase().includes(noun.toLowerCase())) {
            return `${prefix} ${suffix}`;
          }
          return `${prefix} ${noun} ${suffix}`;
        })();
    if (usedNames.has(name)) name = `${name} ${rng.pick(['East', 'West', 'North', 'Metro', 'II'])}`;
    usedNames.add(name);
    const currentCount = assignedHeadcount(index, rng, onboarding);
    const payFrequency = payFrequencyForTemplate(template, rng);
    const stateCount = new Set(template.locations.map((location) => location.split(' ').slice(-1)[0])).size;
    clients.push({
      name,
      ein: einForIndex(index),
      status: onboarding ? 'Onboarding' : 'Active',
      division: template.division,
      departments: template.departments,
      locations: template.locations,
      roles: template.roles,
      currentCount,
      terminatedCount: Math.max(0, Math.round(currentCount * (0.03 + rng.next() * 0.04))),
      avgAnnualCost: round2(template.avgAnnual * (0.9 + rng.next() * 0.22)),
      hourlyShare: Math.min(0.95, Math.max(0.18, template.hourlyShare + (rng.next() - 0.5) * 0.1)),
      coveredShare: 0.82 + rng.next() * 0.12,
      payFrequency,
      payGroup: `${name} ${payFrequency}`,
      depositDirectShare: 0.74 + rng.next() * 0.18,
      accountManager: ACCOUNT_MANAGERS[index % ACCOUNT_MANAGERS.length],
      processor: PAYROLL_PROCESSORS[index % PAYROLL_PROCESSORS.length],
      sizeBand: isolvedClientSizeBand(currentCount),
      stateCount,
      jobCosting: template.division === 'Manufacturing' || template.division === 'Construction Support',
      union: template.division === 'Construction Support' && rng.next() > 0.45,
      tipsOrCommissions: template.division === 'Hospitality' || template.division === 'BPO',
      offCycleFrequent: rng.next() > 0.82,
    });
  }
  return clients;
}

function splitCount(total: number, bucketCount: number): number[] {
  if (bucketCount <= 0) return [];
  const base = Math.floor(total / bucketCount);
  const remainder = total - base * bucketCount;
  return Array.from({ length: bucketCount }, (_, index) => base + (index < remainder ? 1 : 0));
}

function addGroup(map: Map<string, GroupAcc>, key: string, count: number, hourlyCount: number, avgAnnual: number, covered: number) {
  if (count <= 0) return;
  const current = map.get(key) || {
    headcount: 0,
    hourlyCount: 0,
    salaryCount: 0,
    annualSum: 0,
    minAnnual: avgAnnual,
    maxAnnual: avgAnnual,
    covered: 0,
  };
  current.headcount += count;
  current.hourlyCount += hourlyCount;
  current.salaryCount += count - hourlyCount;
  current.annualSum += avgAnnual * count;
  current.minAnnual = Math.min(current.minAnnual, round2(avgAnnual * 0.78));
  current.maxAnnual = Math.max(current.maxAnnual, round2(avgAnnual * 1.32));
  current.covered += covered;
  map.set(key, current);
}

function finishGroups(map: Map<string, GroupAcc>): GroupRow[] {
  return Array.from(map.entries())
    .map(([key, row]) => {
      const totalAnnualCost = row.headcount ? round2(row.annualSum) : null;
      const avgAnnualCost = row.headcount ? round2(row.annualSum / row.headcount) : null;
      return {
        key,
        headcount: row.headcount,
        hourlyCount: row.hourlyCount,
        salaryCount: row.salaryCount,
        avgHourlyCost: row.hourlyCount ? round2((avgAnnualCost || 0) / 2080) : null,
        avgAnnualCost,
        avgMonthlyCost: avgAnnualCost == null ? null : round2(avgAnnualCost / 12),
        totalAnnualCost,
        minAnnualCost: row.headcount ? round2(row.minAnnual) : null,
        maxAnnualCost: row.headcount ? round2(row.maxAnnual) : null,
        billRateLevelCoveragePct: pct(row.covered, row.headcount),
      };
    })
    .sort((a, b) => b.headcount - a.headcount || a.key.localeCompare(b.key));
}

function buildPopulationGroups(clients: ClientRecord[]) {
  const byRole = new Map<string, GroupAcc>();
  const byDepartment = new Map<string, GroupAcc>();
  const byLocation = new Map<string, GroupAcc>();
  const byStatus = new Map<string, GroupAcc>();
  let hourlyCount = 0;
  let covered = 0;
  let annualSum = 0;
  for (const client of clients) {
    const leaveCount = Math.max(1, Math.round(client.currentCount * 0.04));
    const activeCount = Math.max(0, client.currentCount - leaveCount);
    const hourly = Math.round(client.currentCount * client.hourlyShare);
    const clientCovered = Math.round(client.currentCount * client.coveredShare);
    hourlyCount += hourly;
    covered += clientCovered;
    annualSum += client.avgAnnualCost * client.currentCount;
    const roleCounts = splitCount(client.currentCount, client.roles.length);
    client.roles.forEach((role, index) => {
      const count = roleCounts[index] || 0;
      const roleHourly = Math.round(count * client.hourlyShare);
      addGroup(byRole, role, count, roleHourly, client.avgAnnualCost, Math.round(count * client.coveredShare));
    });
    const deptCounts = splitCount(client.currentCount, client.departments.length);
    client.departments.forEach((department, index) => {
      const count = deptCounts[index] || 0;
      addGroup(byDepartment, department, count, Math.round(count * client.hourlyShare), client.avgAnnualCost, Math.round(count * client.coveredShare));
    });
    const locationCounts = splitCount(client.currentCount, client.locations.length);
    client.locations.forEach((location, index) => {
      const count = locationCounts[index] || 0;
      addGroup(byLocation, location, count, Math.round(count * client.hourlyShare), client.avgAnnualCost, Math.round(count * client.coveredShare));
    });
    addGroup(byStatus, 'Active', activeCount, Math.round(activeCount * client.hourlyShare), client.avgAnnualCost, Math.round(activeCount * client.coveredShare));
    addGroup(byStatus, 'Leave', leaveCount, Math.round(leaveCount * client.hourlyShare), client.avgAnnualCost, Math.round(leaveCount * client.coveredShare));
  }
  const currentEmployees = clients.reduce((sum, client) => sum + client.currentCount, 0);
  return {
    currentEmployees,
    hourlyCount,
    salaryCount: currentEmployees - hourlyCount,
    covered,
    annualSum,
    headcountByRole: finishGroups(byRole),
    headcountByDepartment: finishGroups(byDepartment),
    headcountByLocation: finishGroups(byLocation),
    headcountByStatus: finishGroups(byStatus),
  };
}

function rosterCapForIndex(index: number): number {
  if (index < FLAGSHIP_CLIENTS.length) return 70;
  if (index < 20) return 28;
  if (index < 48) return 8;
  return 2;
}

function buildRosterEmployees(companyId: string, clients: ClientRecord[]): MockEmployee[] {
  const rng = makeRng(`isolved-people-cloud:${companyId}:roster`);
  const employees: MockEmployee[] = [];
  let sequence = 1;
  let remaining = ROSTER_BUDGET;
  clients.forEach((client, index) => {
    if (remaining <= 0) return;
    const take = Math.min(client.currentCount, rosterCapForIndex(index), remaining);
    remaining -= take;
    for (let i = 0; i < take; i += 1) {
      const salaried = rng.next() > client.hourlyShare;
      const annualCost = salaried
        ? rng.int(Math.round(client.avgAnnualCost * 0.9), Math.round(client.avgAnnualCost * 1.55))
        : rng.int(Math.round(client.avgAnnualCost * 0.62), Math.round(client.avgAnnualCost * 1.08));
      const statusRoll = rng.next();
      employees.push({
        id: `ISO-${String(sequence).padStart(5, '0')}`,
        name: `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`,
        clientName: client.name,
        role: rng.pick(client.roles),
        division: client.division,
        department: rng.pick(client.departments),
        location: rng.pick(client.locations),
        employmentStatus: statusRoll > 0.96 ? 'Leave' : 'Active',
        payType: salaried ? 'Salary' : 'Hourly',
        paidPer: salaried ? 'Year' : 'Hour',
        annualCost,
        hourlyCost: salaried ? null : round2(annualCost / 2080),
        billRateLevel: rng.next() > 1 - client.coveredShare ? rng.pick(PAY_GRADES) : MISSING_BILL_RATE_LEVEL,
        payGroup: client.payGroup,
        payFrequency: client.payFrequency,
        depositMethod: rng.next() < client.depositDirectShare ? 'Direct Deposit' : rng.next() > 0.45 ? 'Pay Card' : 'Live Check',
      });
      sequence += 1;
    }
  });
  return employees;
}

function biweeklyGross(annualCost: number, frequency: ClientRecord['payFrequency']): number {
  if (frequency === 'Weekly') return round2(annualCost / 52);
  if (frequency === 'Semimonthly') return round2(annualCost / 24);
  return round2(annualCost / 26);
}

function mockMeta() {
  return {
    source: ISOLVED_REPORT_SOURCE,
    generatedAt: new Date().toISOString(),
    note: ISOLVED_MOCK_NOTE,
  };
}

function periodGrossForClient(client: ClientRecord): number {
  return round2(client.currentCount * biweeklyGross(client.avgAnnualCost, client.payFrequency));
}

export function buildIsolvedPayrollMockPayload(companyId: string) {
  const clients = buildClientBook(companyId);
  const rng = makeRng(`isolved-people-cloud:${companyId}:payroll`);
  const asOfDate = previousEstCalendarDate();
  const latestCheckDate = previousEstBusinessDate(asOfDate);
  const employeeCount = clients.reduce((sum, client) => sum + client.currentCount, 0);
  const latestGross = round2(clients.reduce((sum, client) => sum + periodGrossForClient(client), 0));
  const taxWithheld = round2(latestGross * 0.214);
  const deductionTotal = round2(latestGross * 0.086);
  const netPay = round2(latestGross - taxWithheld - deductionTotal);
  const clientCensus = [...clients]
    .sort((a, b) => b.currentCount - a.currentCount || a.name.localeCompare(b.name))
    .map((client) => ({
      id: client.ein,
      clientName: client.name,
      ein: client.ein,
      employeeCount: client.currentCount,
      status: client.status,
      accountManager: client.accountManager,
      processor: client.processor,
      clientType: client.division,
      sizeBand: client.sizeBand,
    }));
  const payGroups = [...clients]
    .sort((a, b) => b.currentCount - a.currentCount)
    .map((client) => ({
      id: `${client.ein}-${client.payGroup}`,
      payGroup: client.payGroup,
      frequency: client.payFrequency,
      nextCheckDate: addEstCalendarDays(latestCheckDate, client.payFrequency === 'Weekly' ? 7 : client.payFrequency === 'Semimonthly' ? 15 : 14),
      employeeCount: client.currentCount,
    }));
  const grossToNet = Array.from({ length: 8 }, (_, index) => {
    const periodEnd = addEstCalendarDays(latestCheckDate, -14 * (7 - index));
    const periodStart = addEstCalendarDays(periodEnd, -13);
    const drift = 0.94 + rng.next() * 0.1;
    const grossPay = round2(latestGross * drift);
    const taxes = round2(grossPay * 0.214);
    const deductions = round2(grossPay * 0.086);
    return {
      id: periodEnd,
      period: `${periodStart} to ${periodEnd}`,
      grossPay,
      taxWithheld: taxes,
      deductions,
      netPay: round2(grossPay - taxes - deductions),
    };
  });
  const payrollRuns = clients.slice(0, 24).map((client, index) => {
    const periodEnd = addEstCalendarDays(latestCheckDate, index >= 22 ? 7 : 0);
    const periodStart = addEstCalendarDays(periodEnd, -13);
    return {
      id: `${client.ein}-${periodEnd}`,
      runName: `${client.name.split(' ')[0]} ${periodEnd}`,
      payPeriod: `${periodStart} to ${periodEnd}`,
      checkDate: periodEnd,
      status: index >= 23 ? 'Scheduled' : index >= 21 ? 'Processing' : 'Processed',
      grossPay: periodGrossForClient(client),
    };
  });
  const hourlyEmployees = clients.reduce((sum, client) => sum + Math.round(client.currentCount * client.hourlyShare), 0);
  const earningsByCode = [
    { code: 'REG Regular', hours: round2(hourlyEmployees * 80), amount: round2(latestGross * 0.78) },
    { code: 'OT Overtime', hours: round2(employeeCount * 4.6), amount: round2(latestGross * 0.09) },
    { code: 'PTO Paid Time Off', hours: round2(employeeCount * 2.1), amount: round2(latestGross * 0.05) },
    { code: 'HOL Holiday', hours: round2(employeeCount * 1.2), amount: round2(latestGross * 0.04) },
    { code: 'BON Bonus', hours: 0, amount: round2(latestGross * 0.04) },
  ];
  const deductionsByCode = [
    { code: '401K', employeeCount: Math.round(employeeCount * 0.62), amount: round2(deductionTotal * 0.38) },
    { code: 'MED Medical', employeeCount: Math.round(employeeCount * 0.71), amount: round2(deductionTotal * 0.34) },
    { code: 'DEN Dental', employeeCount: Math.round(employeeCount * 0.54), amount: round2(deductionTotal * 0.12) },
    { code: 'VIS Vision', employeeCount: Math.round(employeeCount * 0.41), amount: round2(deductionTotal * 0.07) },
    { code: 'GARN Garnishment', employeeCount: Math.max(2, Math.round(employeeCount * 0.04)), amount: round2(deductionTotal * 0.09) },
  ];
  const taxWithholdings = [
    { taxCode: 'FIT', label: 'Federal Income Tax', taxableWages: latestGross, withheld: round2(taxWithheld * 0.46) },
    { taxCode: 'SS', label: 'Social Security', taxableWages: latestGross, withheld: round2(taxWithheld * 0.29) },
    { taxCode: 'MEDCR', label: 'Medicare', taxableWages: latestGross, withheld: round2(taxWithheld * 0.07) },
    { taxCode: 'SIT', label: 'State Income Tax', taxableWages: latestGross, withheld: round2(taxWithheld * 0.15) },
    { taxCode: 'SUTA', label: 'State Unemployment', taxableWages: latestGross, withheld: round2(taxWithheld * 0.03) },
  ];
  const directDepositEmployees = clients.reduce((sum, client) => sum + Math.round(client.currentCount * client.depositDirectShare), 0);
  const payCardEmployees = Math.round((employeeCount - directDepositEmployees) * 0.55);
  const liveCheckEmployees = employeeCount - directDepositEmployees - payCardEmployees;
  const glDebitWages = round2(latestGross);
  const glDebitTaxes = round2(taxWithheld * 0.18);
  const glExportJournal = [
    { account: '6100', description: 'Payroll wages expense', debit: glDebitWages, credit: 0 },
    { account: '6200', description: 'Employer payroll tax expense', debit: glDebitTaxes, credit: 0 },
    { account: '2100', description: 'Employee tax withholdings payable', debit: 0, credit: taxWithheld },
    { account: '2110', description: 'Employee deductions payable', debit: 0, credit: deductionTotal },
    { account: '2120', description: 'Employer tax payable', debit: 0, credit: glDebitTaxes },
    { account: '1000', description: 'Cash / direct deposit clearing', debit: 0, credit: netPay },
  ];
  const benefitsEnrollments = [
    { plan: 'Medical PPO', coverage: 'Employee + Family', employeeCount: Math.round(employeeCount * 0.38), employeeCost: round2(deductionTotal * 0.22) },
    { plan: 'Medical PPO', coverage: 'Employee Only', employeeCount: Math.round(employeeCount * 0.33), employeeCost: round2(deductionTotal * 0.12) },
    { plan: 'Dental', coverage: 'Employee + Spouse', employeeCount: Math.round(employeeCount * 0.28), employeeCost: round2(deductionTotal * 0.07) },
    { plan: 'Vision', coverage: 'Employee Only', employeeCount: Math.round(employeeCount * 0.41), employeeCost: round2(deductionTotal * 0.04) },
    { plan: '401(k)', coverage: 'Pre-tax deferral', employeeCount: Math.round(employeeCount * 0.62), employeeCost: round2(deductionTotal * 0.38) },
  ];

  return {
    meta: mockMeta(),
    summary: {
      asOfDate,
      clientCount: clients.length,
      employeeCount,
      payrollRunCount: payrollRuns.length,
      grossPay: latestGross,
      netPay,
      taxWithheld,
      deductionTotal,
      onTimeProcessingPct: 97.4,
      note: ISOLVED_MOCK_NOTE,
    },
    clientCensus,
    payrollRuns,
    grossToNet,
    earningsByCode,
    deductionsByCode,
    taxWithholdings,
    directDepositMix: [
      { method: 'Direct Deposit', employeeCount: directDepositEmployees, pct: pct(directDepositEmployees, employeeCount) },
      { method: 'Pay Card', employeeCount: payCardEmployees, pct: pct(payCardEmployees, employeeCount) },
      { method: 'Live Check', employeeCount: liveCheckEmployees, pct: pct(liveCheckEmployees, employeeCount) },
    ],
    payGroups,
    glExportJournal,
    benefitsEnrollments,
    records: clientCensus,
  };
}

export function buildIsolvedLaborSchedulingMockPayload(companyId: string) {
  const clients = buildClientBook(companyId);
  const employees = buildRosterEmployees(companyId, clients);
  const rng = makeRng(`isolved-people-cloud:${companyId}:workforce`);
  const asOfDate = previousEstCalendarDate();
  const population = buildPopulationGroups(clients);
  const utilizationByRole = population.headcountByRole.map((row) => {
    const paidHours = round2(row.headcount * 80);
    const billableHours = round2(paidHours * (0.78 + rng.next() * 0.16));
    return {
      role: row.key,
      billableHours,
      paidHours,
      utilizationPct: pct(billableHours, paidHours),
    };
  });
  const overtimeAnalysis = employees
    .filter((employee) => employee.paidPer === 'Hour' && employee.employmentStatus === 'Active')
    .slice(0, 14)
    .map((employee) => ({
      employeeId: employee.id,
      employeeName: employee.name,
      role: employee.role,
      clientName: employee.clientName,
      overtimeHours: round2(rng.int(2, 18) + rng.next()),
    }))
    .sort((a, b) => b.overtimeHours - a.overtimeHours);
  const ptoBalances = employees
    .filter((employee) => employee.employmentStatus === 'Active')
    .slice(0, 36)
    .map((employee) => {
      const accruedHours = rng.int(48, 160);
      const usedHours = rng.int(8, Math.min(80, accruedHours));
      return {
        id: `${employee.id}-pto`,
        employeeName: employee.name,
        leaveType: rng.pick(LEAVE_TYPES),
        balanceHours: accruedHours - usedHours,
        accruedHours,
        usedHours,
      };
    });
  const avgUtilization = average(utilizationByRole.map((row) => row.utilizationPct)) || 0;
  const missingBillRateLevel = employees
    .filter((employee) => employee.billRateLevel === MISSING_BILL_RATE_LEVEL)
    .slice(0, 24)
    .map((employee) => ({
      employeeId: employee.id,
      role: employee.role,
      department: employee.department,
      location: employee.location,
    }));

  return {
    meta: mockMeta(),
    summary: {
      asOfDate,
      headcount: population.currentEmployees,
      billableHeadcount: population.covered,
      totalAnnualCost: round2(population.annualSum),
      avgAnnualCost: population.currentEmployees ? round2(population.annualSum / population.currentEmployees) : null,
      avgMonthlyCost: population.currentEmployees ? round2(population.annualSum / population.currentEmployees / 12) : null,
      billRateLevelCoveragePct: pct(population.covered, population.currentEmployees),
      utilizationPct: avgUtilization,
      note: ISOLVED_MOCK_NOTE,
    },
    headcountByRole: population.headcountByRole,
    headcountByDepartment: population.headcountByDepartment,
    headcountByLocation: population.headcountByLocation,
    headcountByStatus: population.headcountByStatus,
    payTypeMix: [
      { label: 'Hourly', count: population.hourlyCount, pct: pct(population.hourlyCount, population.currentEmployees) },
      { label: 'Salary', count: population.salaryCount, pct: pct(population.salaryCount, population.currentEmployees) },
    ],
    exemptMix: [
      { label: 'Non-exempt', count: population.hourlyCount, pct: pct(population.hourlyCount, population.currentEmployees) },
      { label: 'Exempt', count: population.salaryCount, pct: pct(population.salaryCount, population.currentEmployees) },
    ],
    billRateLevelCoverage: [
      { label: 'Has Bill Rate Level', count: population.covered, pct: pct(population.covered, population.currentEmployees) },
      { label: 'Missing Bill Rate Level', count: population.currentEmployees - population.covered, pct: pct(population.currentEmployees - population.covered, population.currentEmployees) },
    ],
    missingBillRateLevel,
    employeeCompensationRoster: employees.map((employee) => ({
      employeeId: employee.id,
      employeeName: employee.name,
      role: employee.role,
      clientName: employee.clientName,
      department: employee.department,
      division: employee.division,
      location: employee.location,
      employmentStatus: employee.employmentStatus,
      payType: employee.payType,
      paidPer: employee.paidPer,
      annualCost: employee.annualCost,
      monthlyCost: round2(employee.annualCost / 12),
      billRateLevel: employee.billRateLevel,
    })),
    ptoBalances,
    utilizationByRole,
    fillRateByRole: [],
    timeToFillByRole: [],
    assignmentDuration: [],
    idleWorkforceCost: [],
    overtimeAnalysis,
    records: population.headcountByRole,
  };
}

export function buildIsolvedHiringMockPayload(companyId: string) {
  const clients = buildClientBook(companyId);
  const employees = buildRosterEmployees(companyId, clients);
  const rng = makeRng(`isolved-people-cloud:${companyId}:hiring`);
  const asOfDate = previousEstCalendarDate();
  const hiringClients = clients.filter((client) => client.status === 'Active').slice(0, 24);
  const jobs = hiringClients.flatMap((client, clientIndex) => {
    const roleA = client.roles[0];
    const roleB = client.roles[Math.min(1, client.roles.length - 1)];
    const jobCount = client.currentCount >= 120 ? 3 : 2;
    return [roleA, roleB, client.roles[2] || roleA].slice(0, jobCount).map((title, roleIndex) => {
      const id = `JOB-${clientIndex + 1}${roleIndex + 1}`;
      const postedDate = addEstCalendarDays(asOfDate, -rng.int(8, 70));
      return {
        id,
        jobId: id,
        title,
        status: 'open',
        openJobs: 1,
        clientName: client.name,
        division: client.division,
        department: client.departments[roleIndex % client.departments.length],
        location: client.locations[0],
        postedDate,
        activeApplicantsCount: 0,
        newApplicantsCount: 0,
        totalApplicantsCount: 0,
        postingUrl: null,
      };
    });
  });

  const applications = jobs.flatMap((job) => {
    const count = rng.int(4, 8);
    return Array.from({ length: count }, (_, index) => {
      const stage = APPLICATION_STATUSES[Math.min(index, APPLICATION_STATUSES.length - 1)];
      const appliedDate = addEstCalendarDays(job.postedDate, rng.int(1, 18));
      const hired = stage.status === 'Hired';
      const hiredDate = hired ? addEstCalendarDays(appliedDate, rng.int(10, 28)) : null;
      const startDate = hired && hiredDate ? addEstCalendarDays(hiredDate, rng.int(3, 14)) : null;
      const applicantName = `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
      return {
        id: `${job.id}-APP-${index + 1}`,
        jobId: job.id,
        jobTitle: job.title,
        clientName: job.clientName,
        division: job.division,
        department: job.department,
        applicantName,
        email: `${applicantName.toLowerCase().replace(/\s+/g, '.')}@example.com`,
        phone: null,
        status: stage.status,
        jobStage: stage.jobStage,
        applicationCount: 1,
        jobPostedDate: job.postedDate,
        acceptedOfferDate: hired ? hiredDate : null,
        appliedDate,
        hiredDate,
        startDate,
        lastUpdated: appliedDate,
        source: rng.pick(['Indeed', 'Referral', 'Career site', 'isolved Talent']),
        location: job.location,
        rating: rng.int(2, 5),
      };
    });
  });

  jobs.forEach((job) => {
    const rows = applications.filter((application) => application.jobId === job.id);
    job.totalApplicantsCount = rows.length;
    job.newApplicantsCount = rows.filter((row) => row.status === 'New').length;
    job.activeApplicantsCount = rows.filter((row) => !['Hired', 'Rejected'].includes(row.status)).length;
  });

  const hiredApps = applications.filter((application) => application.status === 'Hired' && application.startDate);
  const onboardingStatuses = ['I-9 in progress', 'Tasks complete', 'Waiting on documents', 'New-hire reporting sent'] as const;
  const onboardingPipeline = [
    ...hiredApps.slice(0, 16).map((application, index) => ({
      id: `ONB-${application.id}`,
      employeeName: application.applicantName,
      jobTitle: application.jobTitle,
      clientName: application.clientName,
      startDate: application.startDate,
      status: onboardingStatuses[index % onboardingStatuses.length],
      taskStatus: index % 3 === 0 ? '2 / 6 complete' : index % 3 === 1 ? '6 / 6 complete' : '4 / 6 complete',
    })),
    ...employees.slice(0, 8).map((employee, index) => ({
      id: `ONB-${employee.id}`,
      employeeName: employee.name,
      jobTitle: employee.role,
      clientName: employee.clientName,
      startDate: addEstCalendarDays(asOfDate, -rng.int(4, 28)),
      status: onboardingStatuses[(index + 2) % onboardingStatuses.length],
      taskStatus: index % 2 === 0 ? '3 / 6 complete' : '5 / 6 complete',
    })),
  ];

  return {
    meta: mockMeta(),
    summary: {
      asOfDate,
      openJobs: jobs.filter((job) => job.status === 'open').length,
      totalJobs: jobs.length,
      totalApplicants: applications.length,
      activeApplicants: applications.filter((row) => !['Hired', 'Rejected'].includes(row.status)).length,
      newApplicants: applications.filter((row) => row.status === 'New').length,
      onboardingInProgress: onboardingPipeline.filter((row) => row.status !== 'Tasks complete').length,
      applicationsSampled: applications.length,
      note: ISOLVED_MOCK_NOTE,
    },
    jobs,
    applications,
    onboardingPipeline,
  };
}

export type IsolvedClientRecord = ClientRecord;
export { ACCOUNT_MANAGERS, PAYROLL_PROCESSORS, isolvedClientSizeBand };

export function getIsolvedClientBook(companyId: string): IsolvedClientRecord[] {
  return buildClientBook(companyId);
}

export function shouldServeIsolvedMockReports(options: {
  isolvedConnected: boolean;
  forceOperationalMockData: boolean;
  sectorCategory?: string | null;
}): boolean {
  if (options.isolvedConnected) return true;
  return options.forceOperationalMockData === true && String(options.sectorCategory || '').trim() === '54';
}
