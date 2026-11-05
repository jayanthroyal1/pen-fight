-- Wolf Run's leaderboard. Run this once in Supabase: SQL Editor -> New query -> paste -> Run.
-- It's safe to run again.
--
-- The game holds only the public key, so nobody gets to touch the table itself. Everything goes
-- through the two functions below, and a player's private id is never handed back to anyone.

create table if not exists public.wolf_run_scores (
  player_id uuid primary key,
  name text not null check (char_length(name) between 1 and 16),
  score integer not null check (score between 0 and 1000000),
  updated_at timestamptz not null default now()
);

create index if not exists wolf_run_scores_top on public.wolf_run_scores (score desc, updated_at asc);

alter table public.wolf_run_scores enable row level security;
revoke all on table public.wolf_run_scores from anon, authenticated;

-- The top ten, and where this player stands.
create or replace function public.wolf_board(p_player uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'top', coalesce(
      (select json_agg(t) from (
        select name, score, player_id = p_player as me
        from wolf_run_scores
        order by score desc, updated_at asc
        limit 10
      ) t),
      '[]'::json
    ),
    'rank', (
      select 1 + (select count(*) from wolf_run_scores other where other.score > mine.score)
      from wolf_run_scores mine
      where mine.player_id = p_player
    ),
    'players', (select count(*) from wolf_run_scores)
  );
$$;

-- Saves a run. A player keeps their best score, and can change their name.
create or replace function public.wolf_submit(p_player uuid, p_name text, p_score integer)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  clean text := left(btrim(p_name), 16);
begin
  if clean = '' or p_score < 0 or p_score > 1000000 then
    raise exception 'That score can''t be saved.';
  end if;
  insert into wolf_run_scores (player_id, name, score)
  values (p_player, clean, p_score)
  on conflict (player_id) do update
    set name = excluded.name,
        score = greatest(wolf_run_scores.score, excluded.score),
        updated_at = case when excluded.score > wolf_run_scores.score then now() else wolf_run_scores.updated_at end;
  return wolf_board(p_player);
end;
$$;

revoke all on function public.wolf_board(uuid) from public;
revoke all on function public.wolf_submit(uuid, text, integer) from public;
grant execute on function public.wolf_board(uuid) to anon, authenticated;
grant execute on function public.wolf_submit(uuid, text, integer) to anon, authenticated;

-- Tells the API about the new functions straight away.
notify pgrst, 'reload schema';
