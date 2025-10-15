const XLSX = require('xlsx');
const fs = require('fs');

// Sector mapping based on first 2 digits
const SECTORS = {
  11: "Agriculture, Forestry, Fishing and Hunting",
  21: "Mining",
  22: "Utilities",
  23: "Construction",
  32: "Manufacturing",
  42: "Wholesale Trade",
  45: "Retail Trade",
  48: "Transportation and Warehousing",
  51: "Information",
  52: "Finance and Insurance",
  53: "Real Estate and Rental and Leasing",
  54: "Professional, Scientific and Technical Services",
  56: "Administration, Business Support and Waste Management Services",
  61: "Educational Services",
  62: "Healthcare and Social Assistance",
  71: "Arts, Entertainment and Recreation",
  72: "Accommodation and Food Services in the US",
  81: "Other Services (except Public Administration)"
};

const workbook = XLSX.readFile('Industry Desriptions.xlsx');
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(sheet);

const industries = data.map(row => {
  const ibisCode = row['IBIS Code'];
  const sectorCode = Math.floor(ibisCode / 1000); // First 2 digits
  const sectorName = SECTORS[sectorCode] || 'Other';
  
  return {
    id: ibisCode,
    name: row['IndustryName'],
    description: row['Industry Description'],
    sectorCode: sectorCode,
    sectorName: sectorName
  };
}).filter(ind => ind.id && ind.name);

// Create TypeScript file
const tsContent = `// Industry Sectors from IBIS
export interface IndustrySector {
  id: number;
  name: string;
  description: string;
  sectorCode: number;
  sectorName: string;
}

export const INDUSTRY_SECTORS: IndustrySector[] = ${JSON.stringify(industries, null, 2)};

// Sector categories for grouping
export const SECTOR_CATEGORIES = ${JSON.stringify(Object.entries(SECTORS).map(([code, name]) => ({ 
  code: Number(code), 
  name 
})), null, 2)};
`;

fs.writeFileSync('data/industrySectors.ts', tsContent);
console.log(`✓ Extracted ${industries.length} industries with sector categories to data/industrySectors.ts`);
console.log(`✓ Added ${Object.keys(SECTORS).length} sector categories`);
