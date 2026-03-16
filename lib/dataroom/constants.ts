export type DataRoomFolder = {
  id: string;
  key: string;
  name: string;
  order: number;
};

export const DATAROOM_MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

export const DATAROOM_ALLOWED_EXTENSIONS = [
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.csv',
  '.txt',
] as const;

export const DATAROOM_ALLOWED_CONTENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/csv',
  'text/plain',
] as const;

export const DATAROOM_DEFAULT_FOLDERS: DataRoomFolder[] = [
  { id: 'corporate-overview', key: 'corporate_overview', name: 'Corporate Overview', order: 1 },
  { id: 'financial-statements', key: 'financial_statements', name: 'Financial Statements', order: 2 },
  { id: 'qoe-adjustments', key: 'qoe_adjustments', name: 'Quality of Earnings / Adjustments', order: 3 },
  { id: 'revenue-customers', key: 'revenue_customers', name: 'Revenue & Customers', order: 4 },
  { id: 'sales-pipeline', key: 'sales_pipeline', name: 'Sales & Pipeline', order: 5 },
  { id: 'products-services', key: 'products_services', name: 'Products & Services', order: 6 },
  { id: 'operations', key: 'operations', name: 'Operations', order: 7 },
  { id: 'technology', key: 'technology', name: 'Technology', order: 8 },
  { id: 'legal', key: 'legal', name: 'Legal', order: 9 },
  { id: 'human-resources', key: 'human_resources', name: 'Human Resources', order: 10 },
  { id: 'tax', key: 'tax', name: 'Tax', order: 11 },
  { id: 'misc-strategic', key: 'misc_strategic', name: 'Miscellaneous / Strategic', order: 12 },
];

