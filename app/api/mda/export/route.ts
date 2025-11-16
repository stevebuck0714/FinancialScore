import { NextRequest, NextResponse } from 'next/server';
import { Document, HeadingLevel, Packer, Paragraph } from 'docx';

interface MdaExportPayload {
  companyName?: string;
  executiveSummary?: string;
  strengths?: string[];
  weaknesses?: string[];
  insights?: string[];
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as MdaExportPayload;
    const companyName = body.companyName || 'Company';
    const executiveSummary = body.executiveSummary || '';
    const strengths = body.strengths || [];
    const weaknesses = body.weaknesses || [];
    const insights = body.insights || [];

    const paragraphs: Paragraph[] = [];

    // Title and company name
    paragraphs.push(
      new Paragraph({
        text: 'Management Discussion & Analysis',
        heading: HeadingLevel.TITLE,
      }),
    );

    paragraphs.push(
      new Paragraph({
        text: companyName,
        heading: HeadingLevel.HEADING_1,
      }),
    );

    paragraphs.push(new Paragraph({ text: '' }));

    if (executiveSummary && executiveSummary.trim().length > 0) {
      paragraphs.push(
        new Paragraph({
          text: 'Executive Summary',
          heading: HeadingLevel.HEADING_2,
        }),
      );

      const blocks = executiveSummary.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
      if (blocks.length > 0) {
        blocks.forEach((block) => {
          paragraphs.push(
            new Paragraph({
              text: block,
            }),
          );
          paragraphs.push(new Paragraph({ text: '' }));
        });
      } else {
        paragraphs.push(
          new Paragraph({
            text: executiveSummary.trim(),
          }),
        );
        paragraphs.push(new Paragraph({ text: '' }));
      }
    }

    if (strengths.length > 0) {
      paragraphs.push(
        new Paragraph({
          text: 'Strengths',
          heading: HeadingLevel.HEADING_2,
        }),
      );

      strengths.forEach((item) => {
        if (item && item.trim().length > 0) {
          paragraphs.push(
            new Paragraph({
              text: item,
            }),
          );
        }
      });

      paragraphs.push(new Paragraph({ text: '' }));
    }

    if (weaknesses.length > 0) {
      paragraphs.push(
        new Paragraph({
          text: 'Areas of Concern',
          heading: HeadingLevel.HEADING_2,
        }),
      );

      weaknesses.forEach((item) => {
        if (item && item.trim().length > 0) {
          paragraphs.push(
            new Paragraph({
              text: item,
            }),
          );
        }
      });

      paragraphs.push(new Paragraph({ text: '' }));
    }

    if (insights.length > 0) {
      paragraphs.push(
        new Paragraph({
          text: 'Insights & Recommendations',
          heading: HeadingLevel.HEADING_2,
        }),
      );

      insights.forEach((item) => {
        if (item && item.trim().length > 0) {
          paragraphs.push(
            new Paragraph({
              text: item,
            }),
          );
        }
      });
    }

    const doc = new Document({
      sections: [
        {
          properties: {},
          children: paragraphs,
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);

    const safeCompanyName = companyName.replace(/[^a-zA-Z0-9 \-_.]/g, '').trim() || 'Company';
    const fileName = `MDA - ${safeCompanyName}.docx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
      },
    });
  } catch (error: any) {
    console.error('MD&A export error:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate MD&A Word document',
        details: error?.message || 'Unknown error',
      },
      { status: 500 },
    );
  }
}


