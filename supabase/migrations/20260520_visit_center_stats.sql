create or replace function get_center_visit_stats(p_login_id text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_owner record;
  v_income_trade bigint := 0;
  v_income_rank bigint := 0;
  v_showcase_count int := 0;
  v_rank_position int := 0;
  v_rank_total int := 0;
begin
  select id, user_id, display_name, "character" as character_key, pet_score, showcase_rank_pts
    into v_owner
    from users
   where user_id = lower(p_login_id)
   limit 1;

  if not found then
    return json_build_object('ok', false, 'error', '사용자를 찾을 수 없어요.');
  end if;

  select
    coalesce(sum(slab_income_trade(g.rarity, g.grade)), 0),
    coalesce(sum(slab_income_rank(g.rarity, g.grade)), 0),
    count(*)::int
    into v_income_trade, v_income_rank, v_showcase_count
    from showcase_cards c
    join user_showcases s on s.id = c.showcase_id
    join psa_gradings g on g.id = c.grading_id
   where s.user_id = v_owner.id;

  with per_user as (
    select
      u.id,
      coalesce(sum(slab_income_trade(g.rarity, g.grade)), 0)::bigint as income
      from users u
      left join user_showcases s on s.user_id = u.id
      left join showcase_cards c on c.showcase_id = s.id
      left join psa_gradings g on g.id = c.grading_id
     group by u.id
  ),
  ranked as (
    select id, income,
           rank() over (order by income desc) as rk
      from per_user
  )
  select rk::int, (select count(*)::int from per_user)
    into v_rank_position, v_rank_total
    from ranked
   where id = v_owner.id;

  return json_build_object(
    'ok', true,
    'user_id', v_owner.id,
    'login_id', v_owner.user_id,
    'display_name', v_owner.display_name,
    'character', v_owner.character_key,
    'pet_score', coalesce(v_owner.pet_score, 0),
    'showcase_count', v_showcase_count,
    'income_per_hour_trade', v_income_trade::int,
    'income_per_hour_rank', v_income_rank::int,
    'showcase_rank_pts', coalesce(v_owner.showcase_rank_pts, 0),
    'income_rank_position', coalesce(v_rank_position, 0),
    'income_rank_total', coalesce(v_rank_total, 0)
  );
end;
$$;

grant execute on function get_center_visit_stats(text) to anon, authenticated;

notify pgrst, 'reload schema';
