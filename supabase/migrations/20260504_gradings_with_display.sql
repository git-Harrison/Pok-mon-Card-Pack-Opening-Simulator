-- ============================================================
-- Wallet PCL tab should show ALL gradings (including those currently
-- displayed in the center) with a `displayed` flag so the UI can
-- badge them rather than hiding them entirely.
-- ============================================================

create or replace function get_all_gradings_with_display(p_user_id uuid)
returns json
language sql
stable
set search_path = public, extensions
as $$
  select coalesce(json_agg(row_to_json(r) order by r.graded_at desc), '[]'::json)
    from (
      select
        g.id,
        g.user_id,
        g.card_id,
        g.grade,
        g.graded_at,
        g.rarity,
        exists(select 1 from showcase_cards c where c.grading_id = g.id) as displayed
      from psa_gradings g
      where g.user_id = p_user_id
    ) r
$$;

grant execute on function get_all_gradings_with_display(uuid) to anon, authenticated;
notify pgrst, 'reload schema';
