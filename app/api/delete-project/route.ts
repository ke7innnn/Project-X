import { NextResponse } from 'next/server';

export const runtime = 'edge';

/**
 * DELETE /api/delete-project
 * Dummy handler when database is disconnected (projects are managed locally via localStorage).
 */
export async function DELETE(request: Request) {
  return NextResponse.json({ success: true });
}
