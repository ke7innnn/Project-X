import { NextResponse } from 'next/server';
import { generateDXF } from '@/lib/dxfExporter';

export async function POST(request: Request) {
  try {
    const { roomDimensions, roomLabels, collectedParameters } = await request.json();

    const dxfString = generateDXF(
      roomDimensions, 
      roomLabels, 
      collectedParameters.plotWidth || 10, 
      collectedParameters.plotHeight || 20
    );

    return new NextResponse(dxfString, {
      status: 200,
      headers: {
        'Content-Type': 'application/dxf',
        'Content-Disposition': 'attachment; filename="floorplan.dxf"',
      },
    });
  } catch (error: any) {
    console.error('Export DXF error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
