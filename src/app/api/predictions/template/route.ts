import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generatePredictionTemplate } from '@/lib/excel-parser';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const matches = await prisma.match.findMany({
      include: {
        prediction: true
      },
      orderBy: [
        { kickoffAt: 'asc' },
        { id: 'asc' }
      ]
    });

    // Exclude test/simulation matches
    // Rule: Exclude matches where externalApiId is null, starts with admin-, test-, or indiv-
    const realMatches = matches.filter(m => {
      if (!m.externalApiId) return false;
      const id = m.externalApiId.toLowerCase();
      if (id.startsWith('admin-') || id.startsWith('test-') || id.startsWith('indiv-')) return false;
      return true;
    });

    const buffer = generatePredictionTemplate(realMatches);

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="Plantilla-Pronosticos-Mundial-2026.xlsx"',
      },
    });
  } catch (error: any) {
    console.error('Error generating Excel template:', error);
    return NextResponse.json(
      { error: error.message || 'Template generation failed' },
      { status: 500 }
    );
  }
}
