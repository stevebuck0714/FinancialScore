import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// GET - Load Master data for a company
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    if (!companyId) {
      return NextResponse.json(
        { error: 'Missing companyId parameter' },
        { status: 400 }
      );
    }

    const dataDir = path.join(process.cwd(), 'public', 'data');
    const filePath = path.join(dataDir, `company-${companyId}.json`);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: 'Master data file not found for this company' },
        { status: 404 }
      );
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const monthlyData = JSON.parse(fileContent);

    console.log(`✅ Master data loaded: ${filePath}`);
    console.log(`📊 Loaded ${monthlyData.length} months of Master data`);

    return NextResponse.json({
      success: true,
      monthlyData,
      _source: 'master',
      months: monthlyData.length
    });
  } catch (error: any) {
    console.error('Error loading master data:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

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

