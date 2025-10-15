import prisma from '../lib/prisma';

async function checkBenchmarks() {
  try {
    // Check for industry 23811 (Fred's company)
    const benchmarks23811 = await prisma.industryBenchmark.findMany({
      where: {
        industryId: '23811',
        assetSizeCategory: '1m-5m'
      },
      select: {
        metricName: true,
        fiveYearValue: true
      }
    });

    console.log(`\n📊 Benchmarks for Industry 23811 (1m-5m):`);
    console.log(`   Found: ${benchmarks23811.length} benchmarks`);
    
    if (benchmarks23811.length > 0) {
      console.log('\n   Sample benchmarks:');
      benchmarks23811.slice(0, 10).forEach(b => {
        console.log(`   - ${b.metricName}: ${b.fiveYearValue}`);
      });
    } else {
      console.log('\n   ⚠️ NO BENCHMARKS FOUND for industry 23811!');
      console.log('   This industry may not have been imported.');
    }

    // Check total benchmarks
    const totalCount = await prisma.industryBenchmark.count();
    console.log(`\n📈 Total benchmarks in database: ${totalCount}`);

    // Check which industries exist
    const industries = await prisma.industryBenchmark.groupBy({
      by: ['industryId', 'industryName'],
      _count: true
    });

    console.log(`\n🏭 Industries in database: ${industries.length}`);
    console.log('\n   Sample industries:');
    industries.slice(0, 5).forEach(i => {
      console.log(`   - ${i.industryId}: ${i.industryName} (${i._count} benchmarks)`);
    });

    // Check if 23811 exists at all
    const has23811 = industries.some(i => i.industryId === '23811');
    if (has23811) {
      console.log('\n   ✓ Industry 23811 EXISTS in database');
    } else {
      console.log('\n   ✗ Industry 23811 NOT FOUND in database');
      console.log('   You need to run: npm run import:benchmarks');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkBenchmarks();


