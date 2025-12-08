import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Only allow site admins
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // For now, just run the fix - in production you'd want proper authentication
    console.log('🔧 Starting consultant relationship fix...');

    // Find all users with role 'consultant'
    const consultantUsers = await prisma.user.findMany({
      where: {
        role: 'consultant'
      },
      include: {
        primaryConsultant: true,
        consultantFirm: true
      }
    });

    console.log(`Found ${consultantUsers.length} consultant users`);

    const results = [];

    for (const user of consultantUsers) {
      console.log(`Checking user: ${user.email} (${user.name})`);

      let consultantId = user.consultantId;
      let needsUpdate = false;

      // Try to find consultant by matching user name with consultant company name
      if (!consultantId) {
        console.log(`  No consultantId set, trying to find matching consultant...`);

        // Look for consultant where companyName matches user name
        const matchingConsultant = await prisma.consultant.findFirst({
          where: {
            OR: [
              { companyName: user.name },
              { fullName: user.name },
              { user: { email: user.email } }
            ]
          }
        });

        if (matchingConsultant) {
          consultantId = matchingConsultant.id;
          needsUpdate = true;
          console.log(`  ✅ Found matching consultant: ${matchingConsultant.companyName} (${consultantId})`);
        } else {
          console.log(`  ❌ No matching consultant found for user ${user.name}`);
        }
      }

      // Check if relationships are set up
      if (!user.primaryConsultant && !user.consultantFirm && consultantId) {
        console.log(`  Setting up consultant relationship...`);

        try {
          // Link the user to the consultant
          await prisma.user.update({
            where: { id: user.id },
            data: {
              consultantId: consultantId,
              primaryConsultant: {
                connect: { id: consultantId }
              }
            }
          });

          console.log(`  ✅ Linked user to consultant`);
        } catch (linkError) {
          console.error(`  ❌ Failed to link user to consultant:`, linkError);
        }
      }

      if (needsUpdate) {
        try {
          await prisma.user.update({
            where: { id: user.id },
            data: { consultantId: consultantId }
          });
          console.log(`  ✅ Updated consultantId for user`);
        } catch (updateError) {
          console.error(`  ❌ Failed to update consultantId:`, updateError);
        }
      }

      // Count companies
      let companyCount = 0;
      if (consultantId) {
        try {
          companyCount = await prisma.company.count({
            where: { consultantId: consultantId }
          });
        } catch (countError) {
          console.error(`  ❌ Failed to count companies:`, countError);
        }
      }

      results.push({
        user: {
          id: user.id,
          email: user.email,
          name: user.name
        },
        consultantId: consultantId,
        companyCount: companyCount,
        wasFixed: needsUpdate || (!user.primaryConsultant && !user.consultantFirm && consultantId)
      });
    }

    console.log('✅ Consultant relationship fix completed');

    return NextResponse.json({
      success: true,
      message: 'Consultant relationships fixed',
      results: results
    });

  } catch (error: any) {
    console.error('❌ Error fixing consultant relationships:', error);
    return NextResponse.json(
      {
        error: 'Failed to fix consultant relationships',
        details: error.message
      },
      { status: 500 }
    );
  }
}
