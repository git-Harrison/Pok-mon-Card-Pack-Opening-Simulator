-- ============================================================
-- 체육관 챕터 시스템 + 난이도별 일일 보상 차등.
--
-- 사용자 요청:
--  · 기존 체육관/맵 → 1챕터, 신규 체육관 → 2챕터로 분리. 좌우 swipe
--    버튼으로 챕터 전환. 향후 3챕터 확장 슬롯 마련.
--  · 일일 보상이 난이도 무관 일정(20M / +10K) 이었음 → 난이도 비례:
--      EASY    → 10,000,000 / +3,000
--      NORMAL  → 20,000,000 / +8,000
--      HARD    → 40,000,000 / +15,000
--      BOSS    → 80,000,000 / +25,000
-- ============================================================

-- 1) gyms.chapter 컬럼 추가 + 기본값 1.
alter table gyms
  add column if not exists chapter int not null default 1;

-- 백필: 신규 10 (display_order 9..18) 을 chapter 2 로.
update gyms
   set chapter = 2
 where id in (
   'gym-fighting','gym-poison','gym-flying','gym-bug','gym-ghost',
   'gym-fairy','gym-steel','gym-dark','gym-normal','gym-dragon'
 );
update gyms set chapter = 1
 where id in (
   'gym-grass','gym-water','gym-rock','gym-electric',
   'gym-fire','gym-ground','gym-ice','gym-psychic'
 );

create index if not exists gyms_chapter_idx on gyms(chapter, display_order);

-- 2) 난이도별 일일 보상 helper.
create or replace function gym_daily_reward(p_difficulty text)
returns table(money int, rank_pts int)
language sql
immutable
set search_path = public
as $$
  select
    case p_difficulty
      when 'EASY'   then 10000000
      when 'NORMAL' then 20000000
      when 'HARD'   then 40000000
      when 'BOSS'   then 80000000
      else 20000000
    end::int as money,
    case p_difficulty
      when 'EASY'   then 3000
      when 'NORMAL' then 8000
      when 'HARD'   then 15000
      when 'BOSS'   then 25000
      else 8000
    end::int as rank_pts;
$$;

grant execute on function gym_daily_reward(text) to anon, authenticated;

-- 3) claim_gym_daily — 난이도별 보상 사용.
create or replace function claim_gym_daily(
  p_user_id uuid,
  p_gym_id text
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_owner record;
  v_gym record;
  v_last_claim timestamptz;
  v_money int;
  v_rank_pts int;
  v_new_points int;
  v_seconds_left int;
begin
  if p_user_id is null or p_gym_id is null then
    return json_build_object('ok', false, 'error', '요청이 올바르지 않아요.');
  end if;

  perform pg_advisory_xact_lock(hashtext('gym:daily:' || p_gym_id));

  select * into v_gym from gyms where id = p_gym_id;
  if not found then
    return json_build_object('ok', false, 'error', '체육관을 찾을 수 없어요.');
  end if;
  select money, rank_pts into v_money, v_rank_pts
    from gym_daily_reward(v_gym.difficulty);

  select * into v_owner from gym_ownerships
    where gym_id = p_gym_id for update;
  if not found then
    return json_build_object('ok', false, 'error', '비점령 체육관입니다.');
  end if;
  if v_owner.owner_user_id <> p_user_id then
    return json_build_object('ok', false, 'error', '체육관 소유자만 청구 가능합니다.');
  end if;

  select max(claimed_at) into v_last_claim
    from gym_rewards
   where gym_id = p_gym_id and reward_type = 'daily';
  if v_last_claim is not null
     and v_last_claim > now() - interval '24 hours'
  then
    v_seconds_left := ceil(extract(epoch from (
      v_last_claim + interval '24 hours' - now()
    )))::int;
    return json_build_object(
      'ok', false,
      'error', '체육관 일일 보상 쿨타임 중이에요.',
      'next_claim_at', v_last_claim + interval '24 hours',
      'seconds_left', greatest(v_seconds_left, 0)
    );
  end if;

  update users
     set points = points + v_money,
         gym_daily_rank_pts = gym_daily_rank_pts + v_rank_pts
   where id = p_user_id
   returning points into v_new_points;
  insert into gym_rewards (user_id, gym_id, reward_type, amount)
    values (p_user_id, p_gym_id, 'daily', v_money);

  return json_build_object(
    'ok', true,
    'gym_id', p_gym_id,
    'difficulty', v_gym.difficulty,
    'money', v_money,
    'rank_points', v_rank_pts,
    'points', v_new_points,
    'next_claim_at', now() + interval '24 hours');
end;
$$;

grant execute on function claim_gym_daily(uuid, text) to anon, authenticated;

-- 4) get_gyms_state — chapter 노출 + daily reward 미리보기 (난이도 따라).
create or replace function get_gyms_state(p_user_id uuid default null)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_rows json;
begin
  perform force_cleanup_stale_gym_challenges();

  with gyms_full as (
    select
      g.id, g.name, g.type, g.difficulty, g.leader_name, g.leader_sprite,
      g.location_x, g.location_y, g.min_power, g.display_order,
      coalesce(g.chapter, 1) as chapter,
      (select gdr.money from gym_daily_reward(g.difficulty) gdr) as daily_money,
      (select gdr.rank_pts from gym_daily_reward(g.difficulty) gdr) as daily_rank_pts,
      coalesce(
        (select jsonb_agg(jsonb_build_object(
          'id', p.id, 'slot', p.slot, 'name', p.name, 'type', p.type,
          'dex', p.dex, 'hp', p.hp, 'atk', p.atk, 'def', p.def, 'spd', p.spd
        ) order by p.slot)
         from gym_pokemon p where p.gym_id = g.id),
        '[]'::jsonb
      ) as pokemon,
      (select jsonb_build_object(
        'id', m.id, 'name', m.name, 'type', m.type, 'description', m.description
       ) from gym_medals m where m.gym_id = g.id) as medal,
      (select jsonb_build_object(
        'user_id', o.owner_user_id,
        'display_name', u.display_name,
        'character', u."character",
        'captured_at', o.captured_at,
        'protection_until', o.protection_until,
        'has_defense_deck',
          (o.defense_pet_ids is not null
            and coalesce(array_length(o.defense_pet_ids, 1), 0) = 3
            and (
              select count(*)::int = 3
                from psa_gradings gd
               where gd.id = any(o.defense_pet_ids)
                 and gd.user_id = o.owner_user_id
                 and gd.grade = 10
            )),
        'defender_pokemon',
          case when o.defense_pet_ids is not null
                and coalesce(array_length(o.defense_pet_ids, 1), 0) = 3
                and (
                  select count(*)::int = 3
                    from psa_gradings gd
                   where gd.id = any(o.defense_pet_ids)
                     and gd.user_id = o.owner_user_id
                     and gd.grade = 10
                )
          then (
            select coalesce(jsonb_agg(jsonb_build_object(
              'slot', t.idx,
              'grading_id', t.pid,
              'card_id', g2.card_id,
              'type', o.defense_pet_types[t.idx],
              'rarity', g2.rarity, 'grade', g2.grade
            ) order by t.idx), null::jsonb)
            from unnest(o.defense_pet_ids) with ordinality as t(pid, idx)
            join psa_gradings g2 on g2.id = t.pid
                                  and g2.user_id = o.owner_user_id
                                  and g2.grade = 10
          ) else null end,
        'daily_claimed_today',
          case when p_user_id is null or o.owner_user_id <> p_user_id then null
          else exists (
            select 1 from gym_rewards r
             where r.gym_id = g.id and r.reward_type = 'daily'
               and r.claimed_at > now() - interval '24 hours'
          ) end,
        'daily_next_claim_at',
          case when p_user_id is null or o.owner_user_id <> p_user_id then null
          else (
            select max(r.claimed_at) + interval '24 hours'
              from gym_rewards r
             where r.gym_id = g.id and r.reward_type = 'daily'
               and r.claimed_at > now() - interval '24 hours'
          ) end
       )
       from gym_ownerships o
       join users u on u.id = o.owner_user_id
       where o.gym_id = g.id) as ownership,
      (select jsonb_build_object(
        'id', c.id, 'user_id', c.challenger_user_id,
        'display_name', cu.display_name, 'started_at', c.started_at)
       from gym_challenges c
       join users cu on cu.id = c.challenger_user_id
       where c.gym_id = g.id and c.status = 'active'
       limit 1) as active_challenge,
      case when p_user_id is null then null
      else (select cd.cooldown_until from gym_cooldowns cd
            where cd.user_id = p_user_id and cd.gym_id = g.id
              and cd.cooldown_until > now() limit 1) end as user_cooldown_until,
      case when p_user_id is null then false
      else exists (select 1 from user_gym_medals m
                   where m.user_id = p_user_id and m.gym_id = g.id) end as has_my_medal
    from gyms g
  )
  select coalesce(json_agg(row_to_json(g) order by g.display_order), '[]'::json)
    into v_rows from gyms_full g;
  return v_rows;
end;
$$;

grant execute on function get_gyms_state(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
