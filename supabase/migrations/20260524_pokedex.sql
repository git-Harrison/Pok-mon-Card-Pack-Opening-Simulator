-- ============================================================
-- 도감 (Pokedex) — PCL10 슬랩을 영구 박제해 모으는 시스템.
--
-- 개요:
--   · 사용자는 PCL10 슬랩을 도감에 등록할 수 있다.
--   · 등록하면 슬랩(psa_gradings 행) 은 영구 삭제되고,
--     pokedex_entries 에 행이 새로 들어간다.
--   · 한 사용자는 같은 card_id 를 두 번 도감에 넣을 수 없다.
--   · 도감 보유 수에 따라 users.center_power 에 보너스가 더해져
--     /users 랭킹에 자동 반영된다 (get_user_rankings 에서 합산).
--
-- 보너스 곡선 (pokedex_power_bonus):
--    1~4 장   → 100 × n               (linear)
--    5~9 장   →   500 + (n - 5)  × 140
--   10~14 장  → 1,200 + (n - 10) × 160
--   15~19 장  → 2,000 + (n - 15) × 200
--   20~29 장  → 3,000 + (n - 20) × 200
--   30+ 장    → 5,000 + (n - 30) × 100
--
--   체크포인트:
--     n = 5  →   500
--     n = 10 → 1,200
--     n = 15 → 2,000
--     n = 20 → 3,000
--     n = 30 → 5,000
--
-- 모든 DDL/DML 은 idempotent. CI 가 다시 돌려도 안전.
-- ============================================================

-- 1) Table -----------------------------------------------------
create table if not exists pokedex_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  card_id text not null,
  rarity text,
  registered_at timestamptz not null default now(),
  source_grading_id uuid
);

create unique index if not exists pokedex_entries_user_card_uniq
  on pokedex_entries(user_id, card_id);

create index if not exists pokedex_entries_user_idx
  on pokedex_entries(user_id);

-- 2) Cache column on users ------------------------------------
alter table users
  add column if not exists pokedex_count int not null default 0;

-- One-shot reconciliation: keep the cache in sync with what's already
-- in the table. Going forward register_pokedex_entry maintains it.
update users u
   set pokedex_count = greatest(
     u.pokedex_count,
     coalesce((
       select count(*)::int
         from pokedex_entries p
        where p.user_id = u.id
     ), 0)
   );

-- 3) Power-bonus curve ----------------------------------------
create or replace function pokedex_power_bonus(p_count int)
returns int
language sql
immutable
set search_path = public
as $$
  select case
    when coalesce(p_count, 0) >= 30 then 5000 + (p_count - 30) * 100
    when p_count >= 20 then 3000 + (p_count - 20) * 200
    when p_count >= 15 then 2000 + (p_count - 15) * 200
    when p_count >= 10 then 1200 + (p_count - 10) * 160
    when p_count >= 5  then 500  + (p_count - 5)  * 140
    when p_count >= 1  then p_count * 100
    else 0
  end;
$$;

grant execute on function pokedex_power_bonus(int) to anon, authenticated;

-- 4) register_pokedex_entry -----------------------------------
create or replace function register_pokedex_entry(
  p_user_id uuid,
  p_grading_id uuid
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_grading psa_gradings%rowtype;
  v_count int;
  v_bonus int;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  select * into v_grading from psa_gradings
    where id = p_grading_id for update;
  if not found then
    return json_build_object('ok', false, 'error', '슬랩을 찾을 수 없어요.');
  end if;
  if v_grading.user_id <> p_user_id then
    return json_build_object('ok', false, 'error', '본인 소유 슬랩만 등록할 수 있어요.');
  end if;
  if v_grading.grade <> 10 then
    return json_build_object('ok', false, 'error', 'PCL 10 슬랩만 도감에 등록할 수 있어요.');
  end if;
  if exists (select 1 from showcase_cards c where c.grading_id = v_grading.id) then
    return json_build_object('ok', false, 'error', '센터에 전시 중인 슬랩은 등록할 수 없어요.');
  end if;
  if exists (
    select 1 from gifts
      where grading_id = v_grading.id
        and status = 'pending'
        and expires_at > now()
  ) then
    return json_build_object('ok', false, 'error', '선물로 보낸 슬랩은 등록할 수 없어요.');
  end if;

  if exists (
    select 1 from pokedex_entries
      where user_id = p_user_id and card_id = v_grading.card_id
  ) then
    return json_build_object('ok', false, 'error', '이미 도감에 등록된 카드예요.');
  end if;

  insert into pokedex_entries (user_id, card_id, rarity, source_grading_id)
    values (p_user_id, v_grading.card_id, v_grading.rarity, v_grading.id);

  delete from psa_gradings where id = v_grading.id;

  update users
     set pokedex_count = pokedex_count + 1
   where id = p_user_id
   returning pokedex_count into v_count;

  v_bonus := pokedex_power_bonus(v_count);

  return json_build_object(
    'ok', true,
    'pokedex_count', v_count,
    'power_bonus', v_bonus
  );
end;
$$;

grant execute on function register_pokedex_entry(uuid, uuid) to anon, authenticated;

-- 5) fetch_pokedex --------------------------------------------
create or replace function fetch_pokedex(p_user_id uuid)
returns json
language sql
stable
set search_path = public, extensions
as $$
  select coalesce(
    json_agg(row_to_json(r) order by r.rarity_rank desc, r.card_id asc),
    '[]'::json
  )
  from (
    select
      p.id,
      p.card_id,
      p.rarity,
      p.registered_at,
      case p.rarity
        when 'MUR' then 9
        when 'UR'  then 8
        when 'SAR' then 7
        when 'MA'  then 6
        when 'SR'  then 5
        when 'AR'  then 4
        when 'RR'  then 3
        when 'R'   then 2
        when 'U'   then 1
        when 'C'   then 0
        else -1
      end as rarity_rank
    from pokedex_entries p
    where p.user_id = p_user_id
  ) r;
$$;

grant execute on function fetch_pokedex(uuid) to anon, authenticated;

-- 6) get_user_rankings — fold pokedex bonus into center_power -
create or replace function get_user_rankings()
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_rows json;
begin
  select coalesce(
    json_agg(r order by r.rank_score desc, r.points desc),
    '[]'::json
  )
    into v_rows
  from (
    select
      u.id,
      u.user_id,
      u.display_name,
      u.age,
      u.points,
      u."character",
      coalesce(u.pet_score, 0) as pet_score,
      coalesce(u.main_card_ids, '{}'::uuid[]) as main_card_ids,
      coalesce((
        select jsonb_agg(
                 jsonb_build_object(
                   'id', g3.id,
                   'card_id', g3.card_id,
                   'grade', g3.grade,
                   'rarity', g3.rarity
                 )
                 order by array_position(u.main_card_ids, g3.id)
               )
          from psa_gradings g3
         where g3.user_id = u.id
           and g3.id = any(coalesce(u.main_card_ids, '{}'::uuid[]))
           and g3.grade = 10
      ), '[]'::jsonb) as main_cards,
      (
        coalesce(u.pcl_10_wins, 0) * 500
        + coalesce((
            select count(*)::int * 3000
              from sabotage_logs l
             where l.attacker_id = u.id and l.success
          ), 0)
        + coalesce((
            select count(*)::int * 50
              from sabotage_logs l
             where l.victim_id = u.id and not l.success
          ), 0)
      ) as rank_score,
      (
        coalesce((
          select sum(rarity_power(g2.rarity) * pcl_power(g2.grade))::int
          from showcase_cards sc
          join user_showcases us on us.id = sc.showcase_id
          join psa_gradings g2 on g2.id = sc.grading_id
          where us.user_id = u.id
        ), 0)
        + pokedex_power_bonus(coalesce(u.pokedex_count, 0))
      ) as center_power,
      coalesce(u.pokedex_count, 0) as pokedex_count,
      pokedex_power_bonus(coalesce(u.pokedex_count, 0)) as pokedex_bonus,
      coalesce(count(g.id), 0)::int as psa_count,
      coalesce(sum(case when g.grade = 10 then 1 else 0 end), 0)::int as psa_10,
      coalesce(sum(case when g.grade = 9  then 1 else 0 end), 0)::int as psa_9,
      coalesce(sum(case when g.grade = 8  then 1 else 0 end), 0)::int as psa_8,
      coalesce(sum(case when g.grade = 7  then 1 else 0 end), 0)::int as psa_7,
      coalesce(sum(case when g.grade = 6  then 1 else 0 end), 0)::int as psa_6,
      coalesce((
        select count(*)::int
        from showcase_cards sc
        join user_showcases us on us.id = sc.showcase_id
        where us.user_id = u.id
      ), 0) as showcase_count,
      coalesce((
        select count(*)::int
        from sabotage_logs l
        where l.attacker_id = u.id and l.success
      ), 0) as sabotage_wins,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', g.id,
            'card_id', g.card_id,
            'grade', g.grade,
            'graded_at', g.graded_at
          )
          order by g.grade desc, g.graded_at desc
        ) filter (where g.id is not null),
        '[]'::jsonb
      ) as gradings
    from users u
    left join psa_gradings g on g.user_id = u.id
    group by u.id
  ) r;
  return v_rows;
end;
$$;

grant execute on function get_user_rankings() to anon, authenticated;

notify pgrst, 'reload schema';
