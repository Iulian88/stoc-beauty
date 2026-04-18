import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

// ── Background sync helpers ────────────────────────────────────────────────
// Fire-and-forget: localStorage is always the source of truth.
// These just keep Supabase in sync so data survives across devices.

export function syncUpsert(table, row) {
  supabase.from(table).upsert({ id: row.id, data: row }).then(({ error }) => {
    if (error) console.warn(`[supabase] upsert ${table} ${row.id}:`, error.message);
  });
}

export function syncDelete(table, id) {
  supabase.from(table).delete().eq('id', id).then(({ error }) => {
    if (error) console.warn(`[supabase] delete ${table} ${id}:`, error.message);
  });
}

// ── Hydration: called once on app start ──────────────────────────────────
// Fetches all data from Supabase and overwrites localStorage.
// Falls back silently if Supabase is unavailable.
export async function hydrateFromSupabase() {
  try {
    const [t, z, p] = await Promise.all([
      supabase.from('tranzactii').select('data').order('id'),
      supabase.from('z_rapoarte').select('data').order('id'),
      supabase.from('produse_custom').select('data').order('id'),
    ]);

    if (t.data?.length)
      localStorage.setItem('stoc_tranzactii', JSON.stringify(t.data.map(r => r.data)));
    if (z.data?.length)
      localStorage.setItem('stoc_z_rapoarte', JSON.stringify(z.data.map(r => r.data)));
    if (p.data?.length)
      localStorage.setItem('stoc_produse_custom', JSON.stringify(p.data.map(r => r.data)));

    return true;
  } catch (err) {
    console.warn('[supabase] hydration failed, using localStorage:', err.message);
    return false;
  }
}
