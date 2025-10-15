import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const industryId = searchParams.get('industryId');
    const assetSize = searchParams.get('assetSize');

    if (!industryId) {
      return NextResponse.json(
        { error: 'Industry ID is required' },
        { status: 400 }
      );
    }

    // If no asset size specified, get all asset sizes
    const where: any = { industryId };
    if (assetSize) {
      where.assetSizeCategory = assetSize;
    }

    const benchmarks = await prisma.industryBenchmark.findMany({
      where,
      select: {
        industryId: true,
        industryName: true,
        assetSizeCategory: true,
        metricName: true,
        fiveYearValue: true
      }
    });

    console.log(`📊 Benchmark API: industryId=${industryId}, assetSize=${assetSize}, found ${benchmarks.length} benchmarks`);
    if (benchmarks.length === 0) {
      console.log('⚠️ No benchmarks found for this industry/asset size combination');
    }

    return NextResponse.json(benchmarks);
  } catch (error) {
    console.error('Error fetching benchmarks:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

