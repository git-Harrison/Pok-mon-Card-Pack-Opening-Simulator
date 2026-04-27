-- ============================================================
-- 일일 보상 — 체육관별 24시간 쿨타임 (점령자 변경 무관 유지)
--
-- 사용자 요청: "받은 시점부터 카운트는 계속 진행될거고 점령한 사람이
-- 바뀌어도 카운트는 유지돼야해". 기존 (KST 자정 reset, 유저별) →
-- (claim 시점 + 24h, 체육관 단위) 로 변경. 누가 점령해도 같은 체육관
-- 의 cooldown 은 그대로.
--
-- 변경:
-- 1) claim_gym_daily — 최근 'daily' 보상 (해당 체육관 누가 받았든) 이
--    24시간 안에 있으면 거부. 24h 경과해야 재청구.
-- 2) get_gyms_state ownership — daily_claimed_today 의미 재정의:
--    "지난 24h 안에 (누군가) 보상 받았는지". 본인 소유일 때 노출.
--    + daily_next_claim_at: 다음 청구 가능 시점 (countdown 용).
-- ============================================================

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
  v_last_claim timestamptz;
  v_rank_pts constant int := 10000;
  v_money constant int := 20000000;
  v_new_points int;
  v_seconds_left int;
begin
  if p_user_id is null or p_gym_id is null then
    return json_build_object('ok', false, 'error', '요청이 올바르지 않아요.');
  end if;

  perform pg_advisory_xact_lock(hashtext('gym:daily:' || p_gym_id));

  select * into v_owner from gym_ownerships
    where gym_id = p_gym_id for update;
  if not found then
    return json_build_object('ok', false, 'error', '비점령 체육관입니다.');
  end if;
  if v_owner.owner_user_id <> p_user_id then
    return json_build_object('ok', false, 'error', '체육관 소유자만 청구 가능합니다.');
  end if;

  -- 체육관 단위 cooldown — 누가 받았든, 가장 최근 daily 보상 시각이
  -- 24h 안이면 거부.
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
    'money', v_money,
    'rank_points', v_rank_pts,
    'points', v_new_points,
    'next_claim_at', now() + interval '24 hours');
end;
$$;

grant execute on function claim_gym_daily(uuid, text) to anon, authenticated;

-- get_gyms_state v6 — daily 쿨타임을 24h 단위로 노출. 본인 소유일 때만.
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
            and coalesce(array_length(o.defense_pet_ids, 1), 0) = 3),
        'defender_pokemon',
          case when o.defense_pet_ids is not null
                and coalesce(array_length(o.defense_pet_ids, 1), 0) = 3
          then (
            select coalesce(jsonb_agg(jsonb_build_object(
              'slot', t.idx, 'card_id', g2.card_id,
              'type', o.defense_pet_types[t.idx],
              'rarity', g2.rarity, 'grade', g2.grade
            ) order by t.idx), null::jsonb)
            from unnest(o.defense_pet_ids) with ordinality as t(pid, idx)
            left join psa_gradings g2 on g2.id = t.pid
          ) else null end,
        -- 24h 내 daily claim 이 있으면 true. 본인 소유 아니면 null.
        'daily_claimed_today',
          case when p_user_id is null or o.owner_user_id <> p_user_id then null
          else exists (
            select 1 from gym_rewards r
             where r.gym_id = g.id
               and r.reward_type = 'daily'
               and r.claimed_at > now() - interval '24 hours'
          ) end,
        -- 다음 청구 가능 시점 (countdown UI 용). null = 즉시 청구 가능.
        'daily_next_claim_at',
          case when p_user_id is null or o.owner_user_id <> p_user_id then null
          else (
            select max(r.claimed_at) + interval '24 hours'
              from gym_rewards r
             where r.gym_id = g.id
               and r.reward_type = 'daily'
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
