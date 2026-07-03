-- Run this once in your Supabase project: SQL Editor -> New query -> paste -> Run

create table if not exists kv_store (
  owner_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value text not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id, key)
);

alter table kv_store enable row level security;

-- Each logged-in user can only read/write rows where owner_id matches their
-- own auth id. This is what actually protects your data -- the anon key
-- used in the app is meant to be public, this policy is the real gate.
create policy "Users manage their own rows"
  on kv_store
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);
