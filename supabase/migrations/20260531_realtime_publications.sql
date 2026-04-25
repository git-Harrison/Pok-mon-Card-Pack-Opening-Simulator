-- ============================================================
-- Enable Supabase Realtime on `taunts` and `gifts` so recipients
-- get push-based notifications instead of relying on polling.
-- ============================================================

do $$
begin
  begin
    alter publication supabase_realtime add table taunts;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime add table gifts;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;

alter table taunts enable row level security;
alter table gifts  enable row level security;

drop policy if exists taunts_select_all on taunts;
create policy taunts_select_all on taunts for select using (true);

drop policy if exists gifts_select_all on gifts;
create policy gifts_select_all on gifts for select using (true);

notify pgrst, 'reload schema';
