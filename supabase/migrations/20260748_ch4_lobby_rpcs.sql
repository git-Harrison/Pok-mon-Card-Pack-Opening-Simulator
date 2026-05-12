-- ============================================================
-- 체육관 챕터 4 — Phase 0 / 3단계: 로비 RPC + 스탯 보정
--
-- RPC 8개:
--   ch4_user_stats(user_id)              — 자격 확인 + center_power → 스케일
--   gen_ch4_room_code()                  — 6자 룸 코드 (혼동 글자 제외)
--   compute_ch4_loadout(role, species)   — 스킬 로드아웃 자동 계산 (role 3 + sig 1)
--   create_ch4_raid(user, boss, role)    — 룸 생성 (방장 자동 slot 1)
--   join_ch4_raid(user, code, role)      — 룸 코드로 참가 (slot 2/3)
--   leave_ch4_raid(user, raid)           — 나가기 (방장 = 취소)
--   change_ch4_role(user, raid, role)    — 대기 중 역할 변경
--   get_ch4_raid(raid_id)                — 전체 상태 조회 (참가자 + 보스 + replay)
--   lookup_ch4_raid_by_code(code)        — 코드 → raid_id
--   get_my_ch4_waiting_raid(user)        — 내가 참여 중인 대기 레이드
--
-- 스탯 산식:
--   sqrt_cp   = sqrt(center_power)
--   hp_scale  = atk_scale = 1 + min(2.0, sqrt_cp / 1500)   -- max ×3.0
--   skill_mul = 1 + min(1.0, sqrt_cp / 3000)               -- max +100%
-- ============================================================

-- ─── 자격 확인 + center_power → 스케일 변환 ───
create or replace function ch4_user_stats(p_user_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_starter user_starter%rowtype;
  v_medal_count int := 0;
  v_eligible boolean := false;
  v_cp int := 0;
  v_sqrt_cp numeric;
  v_hp_scale numeric;
  v_skill_mul numeric;
begin
  select * into v_starter from user_starter where user_id = p_user_id;

  select count(*) into v_medal_count
    from user_gym_medals where user_id = p_user_id;

  v_eligible := (v_starter.user_id is not null) and (v_medal_count >= 18);

  -- center_power 전체 = 체육관 함수 (도감+펫+메달+showcase) + starter LV
  begin v_cp := coalesce(gym_compute_user_center_power(p_user_id), 0);
  exception when undefined_function then v_cp := 0; end;
  begin v_cp := v_cp + coalesce(user_starter_power_bonus(p_user_id), 0);
  exception when undefined_function then null; end;

  v_sqrt_cp := sqrt(greatest(0, v_cp));
  v_hp_scale := 1 + least(2.0, v_sqrt_cp / 1500.0);
  v_skill_mul := 1 + least(1.0, v_sqrt_cp / 3000.0);

  return json_build_object(
    'ok', true,
    'eligible', v_eligible,
    'medal_count', v_medal_count,
    'medal_required', 18,
    'has_starter', v_starter.user_id is not null,
    'starter', case when v_starter.user_id is not null then
      json_build_object(
        'species', v_starter.species,
        'nickname', v_starter.nickname,
        'level', v_starter.level,
        'evolution_stage', v_starter.evolution_stage
      ) else null end,
    'center_power', v_cp,
    'hp_scale', v_hp_scale,
    'atk_scale', v_hp_scale,
    'skill_mul', v_skill_mul
  );
end;
$$;

grant execute on function ch4_user_stats(uuid) to anon, authenticated;

-- ─── 룸 코드 생성 (6자, 혼동 글자 I/O/0/1 제외) ───
create or replace function gen_ch4_room_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_code text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_attempts int := 0;
  v_i int;
begin
  loop
    v_code := '';
    for v_i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    perform 1 from ch4_raids where room_code = v_code;
    if not found then return v_code; end if;
    v_attempts := v_attempts + 1;
    if v_attempts > 20 then
      raise exception 'ch4 room code generation exhausted after 20 attempts';
    end if;
  end loop;
end;
$$;

-- ─── 스킬 로드아웃 계산 (role 3 + species sig 1) ───
create or replace function compute_ch4_loadout(p_role text, p_species text)
returns text[]
language sql
stable
set search_path = public
as $$
  select array(
    select id from (
      select id, 1 as ord from ch4_skills where scope = 'role'    and role    = p_role
      union all
      select id, 2 as ord from ch4_skills where scope = 'species' and species = p_species
    ) s order by ord, id
  );
$$;

-- ─── 레이드 생성 (방장) ───
create or replace function create_ch4_raid(
  p_user_id uuid,
  p_boss_id text,
  p_role    text
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_stats   json;
  v_boss    ch4_bosses%rowtype;
  v_raid_id uuid;
  v_code    text;
  v_species text;
begin
  -- 자격 확인 (메달 18 + starter)
  v_stats := ch4_user_stats(p_user_id);
  if not coalesce((v_stats->>'eligible')::boolean, false) then
    return json_build_object('ok', false, 'error', '모든 체육관 메달과 내 포켓몬이 필요해요.');
  end if;

  -- 보스 + 해금 확인
  select * into v_boss from ch4_bosses where id = p_boss_id;
  if not found then
    return json_build_object('ok', false, 'error', '보스 정보를 찾을 수 없어요.');
  end if;
  if v_boss.unlock_requires_clear is not null then
    perform 1 from user_ch4_clears
      where user_id = p_user_id and boss_id = v_boss.unlock_requires_clear;
    if not found then
      return json_build_object('ok', false, 'error', '이전 단계 보스를 먼저 클리어해야 해요.');
    end if;
  end if;

  -- 역할 확인
  if p_role not in ('tank','dealer','supporter') then
    return json_build_object('ok', false, 'error', '역할(탱커/딜러/서포터)을 선택해주세요.');
  end if;

  -- 이미 대기 레이드에 참여 중이면 거부
  perform 1 from ch4_raid_participants p
    join ch4_raids r on r.id = p.raid_id
    where p.user_id = p_user_id and r.status = 'waiting';
  if found then
    return json_build_object('ok', false, 'error', '이미 참여 중인 레이드가 있어요. 먼저 나가야 해요.');
  end if;

  v_code := gen_ch4_room_code();
  v_species := v_stats->'starter'->>'species';

  insert into ch4_raids (boss_id, host_user_id, room_code)
    values (p_boss_id, p_user_id, v_code)
    returning id into v_raid_id;

  insert into ch4_raid_participants (
    raid_id, user_id, slot, role,
    skill_loadout, starter_snapshot, center_power_snapshot,
    hp_scale, atk_scale, skill_mul
  ) values (
    v_raid_id, p_user_id, 1, p_role,
    compute_ch4_loadout(p_role, v_species),
    v_stats->'starter',
    (v_stats->>'center_power')::int,
    (v_stats->>'hp_scale')::numeric,
    (v_stats->>'atk_scale')::numeric,
    (v_stats->>'skill_mul')::numeric
  );

  return json_build_object('ok', true, 'raid_id', v_raid_id, 'room_code', v_code);
end;
$$;

grant execute on function create_ch4_raid(uuid, text, text) to anon, authenticated;

-- ─── 레이드 참가 (룸 코드 + 역할) ───
create or replace function join_ch4_raid(
  p_user_id   uuid,
  p_room_code text,
  p_role      text
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_stats     json;
  v_raid      ch4_raids%rowtype;
  v_next_slot int;
  v_species   text;
begin
  if p_role not in ('tank','dealer','supporter') then
    return json_build_object('ok', false, 'error', '역할(탱커/딜러/서포터)을 선택해주세요.');
  end if;

  v_stats := ch4_user_stats(p_user_id);
  if not coalesce((v_stats->>'eligible')::boolean, false) then
    return json_build_object('ok', false, 'error', '모든 체육관 메달과 내 포켓몬이 필요해요.');
  end if;

  select * into v_raid from ch4_raids where room_code = upper(trim(p_room_code));
  if not found then
    return json_build_object('ok', false, 'error', '룸 코드를 찾을 수 없어요.');
  end if;
  if v_raid.status <> 'waiting' then
    return json_build_object('ok', false, 'error', '이미 시작했거나 종료된 레이드예요.');
  end if;

  -- 이미 같은 레이드 참가 중?
  perform 1 from ch4_raid_participants
    where raid_id = v_raid.id and user_id = p_user_id;
  if found then
    return json_build_object('ok', true, 'raid_id', v_raid.id, 'already', true);
  end if;

  -- 역할 중복?
  perform 1 from ch4_raid_participants
    where raid_id = v_raid.id and role = p_role;
  if found then
    return json_build_object('ok', false, 'error', '해당 역할은 이미 다른 참가자가 선택했어요.');
  end if;

  -- 다른 대기 레이드 참가 중?
  perform 1 from ch4_raid_participants p
    join ch4_raids r on r.id = p.raid_id
    where p.user_id = p_user_id and r.status = 'waiting' and r.id <> v_raid.id;
  if found then
    return json_build_object('ok', false, 'error', '이미 다른 레이드에 참가 중이에요.');
  end if;

  -- 빈 슬롯 (1~3 중 가장 작은 미사용)
  select min(s) into v_next_slot
    from generate_series(1, 3) s
   where s not in (select slot from ch4_raid_participants where raid_id = v_raid.id);
  if v_next_slot is null then
    return json_build_object('ok', false, 'error', '레이드가 이미 가득 찼어요.');
  end if;

  v_species := v_stats->'starter'->>'species';

  insert into ch4_raid_participants (
    raid_id, user_id, slot, role,
    skill_loadout, starter_snapshot, center_power_snapshot,
    hp_scale, atk_scale, skill_mul
  ) values (
    v_raid.id, p_user_id, v_next_slot, p_role,
    compute_ch4_loadout(p_role, v_species),
    v_stats->'starter',
    (v_stats->>'center_power')::int,
    (v_stats->>'hp_scale')::numeric,
    (v_stats->>'atk_scale')::numeric,
    (v_stats->>'skill_mul')::numeric
  );

  return json_build_object('ok', true, 'raid_id', v_raid.id, 'slot', v_next_slot);
end;
$$;

grant execute on function join_ch4_raid(uuid, text, text) to anon, authenticated;

-- ─── 레이드 나가기 (방장 = 자동 취소) ───
create or replace function leave_ch4_raid(
  p_user_id uuid,
  p_raid_id uuid
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_raid      ch4_raids%rowtype;
  v_was_host  boolean;
  v_remaining int;
begin
  select * into v_raid from ch4_raids where id = p_raid_id;
  if not found then
    return json_build_object('ok', false, 'error', '레이드를 찾을 수 없어요.');
  end if;
  if v_raid.status <> 'waiting' then
    return json_build_object('ok', false, 'error', '이미 시작했거나 종료된 레이드예요.');
  end if;

  perform 1 from ch4_raid_participants
    where raid_id = p_raid_id and user_id = p_user_id;
  if not found then
    return json_build_object('ok', false, 'error', '이 레이드의 참가자가 아니에요.');
  end if;

  v_was_host := (v_raid.host_user_id = p_user_id);

  delete from ch4_raid_participants
    where raid_id = p_raid_id and user_id = p_user_id;

  select count(*) into v_remaining
    from ch4_raid_participants where raid_id = p_raid_id;

  if v_was_host or v_remaining = 0 then
    update ch4_raids set status = 'cancelled' where id = p_raid_id;
    return json_build_object('ok', true, 'cancelled', true);
  end if;

  return json_build_object('ok', true, 'cancelled', false);
end;
$$;

grant execute on function leave_ch4_raid(uuid, uuid) to anon, authenticated;

-- ─── 역할 변경 (대기 중에만, 본인 역할만) ───
create or replace function change_ch4_role(
  p_user_id  uuid,
  p_raid_id  uuid,
  p_new_role text
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_raid    ch4_raids%rowtype;
  v_part    ch4_raid_participants%rowtype;
  v_species text;
begin
  if p_new_role not in ('tank','dealer','supporter') then
    return json_build_object('ok', false, 'error', '역할(탱커/딜러/서포터)을 선택해주세요.');
  end if;

  select * into v_raid from ch4_raids where id = p_raid_id;
  if not found or v_raid.status <> 'waiting' then
    return json_build_object('ok', false, 'error', '레이드를 찾을 수 없거나 이미 시작했어요.');
  end if;

  select * into v_part from ch4_raid_participants
    where raid_id = p_raid_id and user_id = p_user_id;
  if not found then
    return json_build_object('ok', false, 'error', '이 레이드의 참가자가 아니에요.');
  end if;

  if v_part.role = p_new_role then
    return json_build_object('ok', true, 'unchanged', true);
  end if;

  perform 1 from ch4_raid_participants
    where raid_id = p_raid_id and role = p_new_role and user_id <> p_user_id;
  if found then
    return json_build_object('ok', false, 'error', '해당 역할은 이미 다른 참가자가 선택했어요.');
  end if;

  v_species := v_part.starter_snapshot->>'species';

  update ch4_raid_participants
     set role = p_new_role,
         skill_loadout = compute_ch4_loadout(p_new_role, v_species)
   where raid_id = p_raid_id and user_id = p_user_id;

  return json_build_object('ok', true);
end;
$$;

grant execute on function change_ch4_role(uuid, uuid, text) to anon, authenticated;

-- ─── 레이드 전체 조회 ───
create or replace function get_ch4_raid(p_raid_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_raid         ch4_raids%rowtype;
  v_boss         ch4_bosses%rowtype;
  v_participants jsonb;
begin
  select * into v_raid from ch4_raids where id = p_raid_id;
  if not found then
    return json_build_object('ok', false, 'error', '레이드를 찾을 수 없어요.');
  end if;

  select * into v_boss from ch4_bosses where id = v_raid.boss_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'slot',            p.slot,
      'user_id',         p.user_id,
      'user_name',       u.user_id,
      'display_name',    u.display_name,
      'role',            p.role,
      'skill_loadout',   to_jsonb(p.skill_loadout),
      'starter',         p.starter_snapshot,
      'center_power',    p.center_power_snapshot,
      'hp_scale',        p.hp_scale,
      'atk_scale',       p.atk_scale,
      'skill_mul',       p.skill_mul,
      'joined_at',       p.joined_at
    ) order by p.slot
  ), '[]'::jsonb)
    into v_participants
    from ch4_raid_participants p
    join users u on u.id = p.user_id
   where p.raid_id = p_raid_id;

  return json_build_object(
    'ok',           true,
    'raid',         jsonb_build_object(
      'id',           v_raid.id,
      'boss_id',      v_raid.boss_id,
      'host_user_id', v_raid.host_user_id,
      'room_code',    v_raid.room_code,
      'status',       v_raid.status,
      'result',       v_raid.result,
      'total_turns',  v_raid.total_turns,
      'created_at',   v_raid.created_at,
      'resolved_at',  v_raid.resolved_at,
      'replay_data',  v_raid.replay_data
    ),
    'boss',         row_to_json(v_boss),
    'participants', v_participants
  );
end;
$$;

grant execute on function get_ch4_raid(uuid) to anon, authenticated;

-- ─── 룸 코드 → raid_id 룩업 ───
create or replace function lookup_ch4_raid_by_code(p_room_code text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_raid ch4_raids%rowtype;
begin
  select * into v_raid from ch4_raids where room_code = upper(trim(p_room_code));
  if not found then
    return json_build_object('ok', false, 'error', '룸 코드를 찾을 수 없어요.');
  end if;
  return json_build_object(
    'ok',       true,
    'raid_id',  v_raid.id,
    'status',   v_raid.status,
    'boss_id',  v_raid.boss_id
  );
end;
$$;

grant execute on function lookup_ch4_raid_by_code(text) to anon, authenticated;

-- ─── 내가 참가 중인 대기 레이드 ───
create or replace function get_my_ch4_waiting_raid(p_user_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_raid_id uuid;
  v_code    text;
  v_host    uuid;
begin
  select r.id, r.room_code, r.host_user_id
    into v_raid_id, v_code, v_host
    from ch4_raid_participants p
    join ch4_raids r on r.id = p.raid_id
   where p.user_id = p_user_id and r.status = 'waiting'
   limit 1;

  if v_raid_id is null then
    return json_build_object('ok', true, 'has_raid', false);
  end if;

  return json_build_object(
    'ok',         true,
    'has_raid',   true,
    'raid_id',    v_raid_id,
    'room_code',  v_code,
    'is_host',    v_host = p_user_id
  );
end;
$$;

grant execute on function get_my_ch4_waiting_raid(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
