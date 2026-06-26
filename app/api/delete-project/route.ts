import { NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const runtime = 'edge';

/**
 * DELETE /api/delete-project
 * Body: { session_id: string } | { all: true }
 * Deletes from both `projects` and `project_images` tables.
 */
export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const { session_id, all } = body;

    const headers = {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Prefer': 'return=minimal',
    };

    const tables = ['projects', 'project_images'];

    for (const table of tables) {
      let url: string;
      if (all) {
        url = `${SUPABASE_URL}/rest/v1/${table}?id=neq.00000000-0000-0000-0000-000000000000`;
      } else if (session_id) {
        url = `${SUPABASE_URL}/rest/v1/${table}?session_id=eq.${encodeURIComponent(session_id)}`;
      } else {
        return NextResponse.json({ error: 'Must provide session_id or all:true' }, { status: 400 });
      }

      const res = await fetch(url, { method: 'DELETE', headers });
      if (!res.ok) {
        const text = await res.text();
        console.error(`[delete-project] Supabase error on ${table}:`, res.status, text);
        // Continue deleting from other tables even if one fails
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[delete-project] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
