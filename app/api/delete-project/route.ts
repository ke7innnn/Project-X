import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const runtime = 'edge';

/**
 * DELETE /api/delete-project
 * Body: { session_id: string } | { all: true }
 * Performs a SOFT DELETE by adding { isDeleted: true } to the state JSON.
 */
export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const { session_id, all } = body;

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    if (all) {
      // Fetch all projects to update their state
      const { data: projects } = await supabase.from('projects').select('session_id, state');
      if (projects) {
        for (const proj of projects) {
          await supabase.from('projects').update({
            state: { ...proj.state, isDeleted: true }
          }).eq('session_id', proj.session_id);
        }
      }
    } else if (session_id) {
      // Fetch single project to update its state
      const { data: proj } = await supabase.from('projects').select('state').eq('session_id', session_id).single();
      if (proj) {
        await supabase.from('projects').update({
          state: { ...proj.state, isDeleted: true }
        }).eq('session_id', session_id);
      }
    } else {
      return NextResponse.json({ error: 'Must provide session_id or all:true' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[delete-project] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
