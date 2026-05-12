-- ============================================================
-- 체육관 챕터 4 — UX 단순화 (사용자 피드백 반영)
--
-- 변경:
--   1) 역할(탱커/딜러/서포터)을 서버가 랜덤 배정
--      (create_ch4_raid / join_ch4_raid 에서 p_role 파라미터 제거)
--   2) 룸 코드로 참가하는 UI 제거 → 대기 방 목록 (list_ch4_waiting_raids)
--      에서 버튼 한 번 클릭으로 참가
--   3) change_ch4_role 함수 제거 (역할 변경 UI 도 X)
--   4) room_code 자체는 보존 — 친구 공유 표시용
-- ============================================================

-- ── 기존 시그니처 제거 ──
drop function if exists create_ch4_raid(uuid, text, text);
drop function if exists join_ch4_raid(uuid, text, text);
drop function if exists change_ch4_role(uuid, uuid, text);

-- ── 랜덤 역할 picker (남은 역할 중 1개) ──
create or replace function pick_random_ch4_role(p_raid_id uuid)
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_taken     text[];
  v_available text[];
begin
  select coalesce(array_agg(role), '{}'::text[]) into v_taken
    from ch4_raid_participants where raid_id = p_raid_id;
  v_available := array(
    select unnest(array['tank','dealer','supporter'])
    except
    select unnest(v_taken)
  );
  if array_length(v_available, 1) is null then
    raise exception 'no_role_available';
  end if;
  return v_available[1 + floor(random() * array_length(v_available, 1))::int];
end;
$$;

-- ── 방 생성 (방장 — 역할 랜덤) ──
create or replace function create_ch4_raid(
  p_user_id uuid,
  p_boss_id text
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
  v_role    text;
begin
  v_stats := ch4_user_stats(p_user_id);
  if not coalesce((v_stats->>'eligible')::boolean, false) then
    return json_build_object('ok', false, 'error', '모든 체육관 메달과 내 포켓몬이 필요해요.');
  end if;

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

  -- 빈 raid 라 picker 가 random 으로 3개 중 하나 반환
  v_role := pick_random_ch4_role(v_raid_id);

  insert into ch4_raid_participants (
    raid_id, user_id, slot, role,
    skill_loadout, starter_snapshot, center_power_snapshot,
    hp_scale, atk_scale, skill_mul
  ) values (
    v_raid_id, p_user_id, 1, v_role,
    compute_ch4_loadout(v_role, v_species),
    v_stats->'starter',
    (v_stats->>'center_power')::int,
    (v_stats->>'hp_scale')::numeric,
    (v_stats->>'atk_scale')::numeric,
    (v_stats->>'skill_mul')::numeric
  );

  return json_build_object('ok', true, 'raid_id', v_raid_id, 'room_code', v_code, 'role', v_role);
end;
$$;

grant execute on function create_ch4_raid(uuid, text) to anon, authenticated;

-- ── 방 참가 (raid_id 직접 — 역할 랜덤) ──
create or replace function join_ch4_raid(
  p_user_id uuid,
  p_raid_id uuid
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
  v_role      text;
begin
  v_stats := ch4_user_stats(p_user_id);
  if not coalesce((v_stats->>'eligible')::boolean, false) then
    return json_build_object('ok', false, 'error', '모든 체육관 메달과 내 포켓몬이 필요해요.');
  end if;

  select * into v_raid from ch4_raids where id = p_raid_id;
  if not found then
    return json_build_object('ok', false, 'error', '방을 찾을 수 없어요.');
  end if;
  if v_raid.status <> 'waiting' then
    return json_build_object('ok', false, 'error', '이미 시작했거나 종료된 방이에요.');
  end if;

  -- 이미 같은 방에 참가했으면 그냥 OK
  perform 1 from ch4_raid_participants
    where raid_id = v_raid.id and user_id = p_user_id;
  if found then
    return json_build_object('ok', true, 'raid_id', v_raid.id, 'already', true);
  end if;

  -- 다른 대기 방에 있으면 거부
  perform 1 from ch4_raid_participants p
    join ch4_raids r on r.id = p.raid_id
    where p.user_id = p_user_id and r.status = 'waiting' and r.id <> v_raid.id;
  if found then
    return json_build_object('ok', false, 'error', '이미 다른 방에 참가 중이에요.');
  end if;

  -- 빈 슬롯
  select min(s) into v_next_slot
    from generate_series(1, 3) s
   where s not in (select slot from ch4_raid_participants where raid_id = v_raid.id);
  if v_next_slot is null then
    return json_build_object('ok', false, 'error', '방이 이미 가득 찼어요.');
  end if;

  v_role := pick_random_ch4_role(v_raid.id);
  v_species := v_stats->'starter'->>'species';

  insert into ch4_raid_participants (
    raid_id, user_id, slot, role,
    skill_loadout, starter_snapshot, center_power_snapshot,
    hp_scale, atk_scale, skill_mul
  ) values (
    v_raid.id, p_user_id, v_next_slot, v_role,
    compute_ch4_loadout(v_role, v_species),
    v_stats->'starter',
    (v_stats->>'center_power')::int,
    (v_stats->>'hp_scale')::numeric,
    (v_stats->>'atk_scale')::numeric,
    (v_stats->>'skill_mul')::numeric
  );

  return json_build_object('ok', true, 'raid_id', v_raid.id, 'slot', v_next_slot, 'role', v_role);
end;
$$;

grant execute on function join_ch4_raid(uuid, uuid) to anon, authenticated;

-- ── 대기 방 목록 (자격 통과 후 보임) ──
create or replace function list_ch4_waiting_raids()
returns json
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce(json_agg(rows order by created_at desc), '[]'::json)
    from (
      select
        r.id            as raid_id,
        r.room_code,
        r.boss_id,
        b.stage_order   as boss_stage,
        b.name          as boss_name,
        b.sprite_key    as boss_sprite_key,
        b.types         as boss_types,
        r.host_user_id,
        hu.user_id      as host_user_name,
        hu.display_name as host_display_name,
        r.created_at,
        coalesce(p.slot_count, 0) as slot_count
      from ch4_raids r
      join ch4_bosses b on b.id = r.boss_id
      join users hu on hu.id = r.host_user_id
      left join (
        select raid_id, count(*)::int as slot_count
          from ch4_raid_participants group by raid_id
      ) p on p.raid_id = r.id
      where r.status = 'waiting'
        and coalesce(p.slot_count, 0) < 3
    ) rows;
$$;

grant execute on function list_ch4_waiting_raids() to anon, authenticated;

notify pgrst, 'reload schema';
