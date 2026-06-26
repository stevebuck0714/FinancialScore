import { NextResponse } from 'next/server';
import { fetchRealEstateMacroForecastInputs } from '@/lib/operations/real-estate-macro-data';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const periods = Number(searchParams.get('periods') || 12);
    const data = await fetchRealEstateMacroForecastInputs({
      periods: Number.isFinite(periods) ? periods : 12,
    });

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load FRED macro inputs.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
