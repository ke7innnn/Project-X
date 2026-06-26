import { NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const runtime = 'edge';

/**
 * DELETE /api/delete-project
 * Body: { session_id: string } | { all: true }
 * Uses Supabase REST API with Prefer: return=minimal to delete rows.
 */
export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const { session_id, all } = body;

    let url: string;

    if (all) {
      // Delete all projects — use a filter that matches all rows
      url = `${SUPABASE_URL}/rest/v1/projects?id=neq.00000000-0000-0000-0000-000000000000`;
    } else if (session_id) {
      url = `${SUPABASE_URL}/rest/v1/projects?session_id=eq.${encodeURIComponent(session_id)}`;
    } else {
      return NextResponse.json({ error: 'Must provide session_id or all:true' }, { status: 400 });
    }

    const res = await fetch(url, {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Prefer': 'return=minimal',
      },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('[delete-project] Supabase error:', res.status, text);
      return NextResponse.json({ error: `Supabase error ${res.status}: ${text}` }, { status: res.status });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[delete-project] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
