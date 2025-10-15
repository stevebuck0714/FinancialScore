import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const { companyId, monthlyData } = await request.json();
    
    if (!companyId || !monthlyData) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    // Ensure data directory exists
    const dataDir = path.join(process.cwd(), 'public', 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // Save to file
    const filePath = path.join(dataDir, `company-${companyId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(monthlyData, null, 2));
    
    console.log(`✅ Master file saved: ${filePath}`);
    console.log(`📊 Saved ${monthlyData.length} months of data`);
    
    return NextResponse.json({ 
      success: true,
      filePath: `/data/company-${companyId}.json`,
      months: monthlyData.length
    });
  } catch (error: any) {
    console.error('Error saving master file:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

