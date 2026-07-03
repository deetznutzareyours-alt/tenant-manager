import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // This will make the failure obvious in the browser console instead of a silent blank screen.
  console.error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. ' +
    'Set them in Vercel → Settings → Environment Variables, then redeploy.'
  );
}

export const supabase = createClient(url, anonKey);
