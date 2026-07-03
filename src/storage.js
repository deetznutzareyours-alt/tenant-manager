import { supabase } from './supabaseClient.js';

// Same shape as the old localStorage adapter (get/set/delete/list), so App.jsx
// is completely untouched. Data now lives in Supabase Postgres, scoped per
// logged-in user via Row Level Security (see supabase-setup.sql) -- that RLS
// policy is what actually protects the data, not this file.

async function getUserId() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  return session.user.id;
}

const storage = {
  async get(key) {
    const owner_id = await getUserId();
    const { data, error } = await supabase
      .from('kv_store')
      .select('value')
      .eq('owner_id', owner_id)
      .eq('key', key)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('key not found: ' + key);
    return { key, value: data.value };
  },
  async set(key, value) {
    const owner_id = await getUserId();
    const { error } = await supabase
      .from('kv_store')
      .upsert({ owner_id, key, value, updated_at: new Date().toISOString() }, { onConflict: 'owner_id,key' });
    if (error) throw error;
    return { key, value };
  },
  async delete(key) {
    const owner_id = await getUserId();
    const { error } = await supabase.from('kv_store').delete().eq('owner_id', owner_id).eq('key', key);
    if (error) throw error;
    return { key, deleted: true };
  },
  async list(prefix) {
    const owner_id = await getUserId();
    let query = supabase.from('kv_store').select('key').eq('owner_id', owner_id);
    if (prefix) query = query.like('key', prefix + '%');
    const { data, error } = await query;
    if (error) throw error;
    return { keys: (data || []).map((r) => r.key) };
  },
};

if (typeof window !== 'undefined') {
  window.storage = storage;
  window.auth = {
    signOut: () => supabase.auth.signOut(),
  };
}

export default storage;
