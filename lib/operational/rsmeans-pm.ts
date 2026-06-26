export const RSMEANS_PM_SOURCE_CODE = 'RSMEANS_PM';
export const RSMEANS_PM_LABEL = 'RSMeams - PM';

export type RsmeansPmDataDomain = {
  dataDomain: string;
  sourceObject: string;
  enabled: boolean;
};

export const DEFAULT_RSMEANS_PM_DATA_DOMAINS: RsmeansPmDataDomain[] = [
  { dataDomain: 'Cost Catalogs', sourceObject: 'RSMeans cost books, catalog metadata, catalog scopes, and subscriber-accessible datasets', enabled: true },
  { dataDomain: 'Unit Costs', sourceObject: 'Material, labor, equipment, and total unit cost line items by task or item code', enabled: true },
  { dataDomain: 'Assembly Costs', sourceObject: 'Assemblies, component breakdowns, assembly quantities, and bundled construction tasks', enabled: true },
  { dataDomain: 'Labor Rates', sourceObject: 'Trade labor rates, crew composition, wage rates, burden, and productivity assumptions', enabled: true },
  { dataDomain: 'Equipment Rental Rates', sourceObject: 'Equipment rental rates, ownership costs, operating costs, and equipment categories', enabled: true },
  { dataDomain: 'Material Costs', sourceObject: 'Material item costs, units of measure, specifications, and cost release values', enabled: true },
  { dataDomain: 'CSI Divisions', sourceObject: 'CSI division, section, classification, and cost-code hierarchy mappings', enabled: true },
  { dataDomain: 'Geographic Cost Factors', sourceObject: 'City cost indexes, regional adjustment factors, and location-specific modifiers', enabled: true },
  { dataDomain: 'Square-Foot Models', sourceObject: 'Building models, square-foot estimating templates, model assumptions, and cost summaries', enabled: true },
  { dataDomain: 'Productivity Factors', sourceObject: 'Labor productivity assumptions, crew output, task production rates, and adjustment factors', enabled: true },
  { dataDomain: 'Cost Releases / Versions', sourceObject: 'Cost data release dates, version identifiers, effective periods, and historical revisions', enabled: true },
  { dataDomain: 'Estimating Metrics', sourceObject: 'Estimate inputs, benchmark costs, budget models, and property management capital planning metrics', enabled: true },
];
