-- ============================================================
-- 체육관 챕터 4 — AI 봇 시스템 (빈 슬롯 채우기)
--
-- 사용자 base 가 작아 3 명 모집이 어려운 점 보완 — 방장이 빈 슬롯에
-- 봇을 추가해 함께 전투 가능.
--
-- 추가:
--   1) users.is_bot boolean default false (idempotent)
--   2) 6 봇 유저 시드 (starter 화이트리스트 10종 중 미사용 6종)
--   3) 각 봇에 user_starter + 18 type 메달 자동 시드 →
--      ch4_user_stats() eligible=true 자동 통과
--   4) add_bot_to_ch4_raid(host_user_id, raid_id) — 방장 only,
--      대기 중인 raid 의 빈 슬롯 1개를 사용 가능한 봇으로 채움
--   5) get_ch4_raid 응답 participants 배열에 is_bot 필드 추가
--      (UI 에서 봇 표시 가능)
--
-- 제약:
--   user_starter.species 가 글로벌 UNIQUE (20260696) — 화이트리스트 10종 중
--   기존 유저가 점유한 4종 (pikachu/charmander/bulbasaur/gastly) 제외하면
--   사용 가능 6종 (pidgey/poliwag/chikorita/chimchar/geodude/caterpie).
--   따라서 봇 풀은 최대 6 마리.
--
-- 봇 선택 규칙:
--   - is_bot = true
--   - has_starter 존재 (eligibility 통과)
--   - 다른 대기 raid 에 이미 참가 중이 아님 (멀티 raid 동시 진행 가능)
--   - random() 순서로 1개 picking
--
-- 봇 풀 (6 마리):
--   bot01 pidgey    LV12 stage1   bot04 chimchar  LV20 stage2
--   bot02 poliwag   LV20 stage2   bot05 geodude   LV18 stage1
--   bot03 chikorita LV15 stage1   bot06 caterpie  LV10 stage1
-- ============================================================

-- ── 1) is_bot 컬럼 ──
alter table users add column if not exists is_bot boolean not null default false;
create index if not exists users_is_bot_idx on users (is_bot);

-- ── 2) 이전 시도에서 만들어진 봇 정리 (cascade 로 의존 row 삭제) ──
-- 첫 시도 (20260753 v1) 가 starter species unique 위배로 실패하면서
-- bot01~12 user row 만 만들고 starter 없는 상태로 남았을 수 있음. 클린업.
delete from users
 where user_id in ('bot01','bot02','bot03','bot04','bot05','bot06',
                   'bot07','bot08','bot09','bot10','bot11','bot12');

-- ── 3) 봇 유저 시드 (6 마리 — starter 화이트리스트 미사용 6종) ──
-- password_hash 는 bcrypt 형식이 아닌 sentinel → 어떤 패스워드도 매치 X
insert into users (user_id, password_hash, age, display_name, is_bot, points,
                   pcl_10_wins, wild_wins, showcase_rank_pts, pokedex_count,
                   gym_daily_rank_pts, pet_score)
values
  ('bot01', 'BOT_NO_LOGIN', 99, '봇 피죤',     true, 0, 0, 0, 0, 0, 0, 0),
  ('bot02', 'BOT_NO_LOGIN', 99, '봇 강챙이',   true, 0, 0, 0, 0, 0, 0, 0),
  ('bot03', 'BOT_NO_LOGIN', 99, '봇 베이리프', true, 0, 0, 0, 0, 0, 0, 0),
  ('bot04', 'BOT_NO_LOGIN', 99, '봇 초염몽',   true, 0, 0, 0, 0, 0, 0, 0),
  ('bot05', 'BOT_NO_LOGIN', 99, '봇 데구리',   true, 0, 0, 0, 0, 0, 0, 0),
  ('bot06', 'BOT_NO_LOGIN', 99, '봇 단데기',   true, 0, 0, 0, 0, 0, 0, 0);

-- ── 3a) 봇 starter 시드 (각 봇 1종, species 글로벌 unique 충족) ──
with bot_specs as (
  select * from (values
    ('bot01', 'pidgey',    '봇피죤',     12, 1),
    ('bot02', 'poliwag',   '봇강챙이',   20, 2),
    ('bot03', 'chikorita', '봇베이리프', 15, 1),
    ('bot04', 'chimchar',  '봇초염몽',   20, 2),
    ('bot05', 'geodude',   '봇데구리',   18, 1),
    ('bot06', 'caterpie',  '봇단데기',   10, 1)
  ) as t(user_login, species, nickname, level, stage)
)
insert into user_starter (user_id, species, nickname, level, evolution_stage, xp, caught_at)
select u.id, bs.species, bs.nickname, bs.level, bs.stage, 0, now()
  from bot_specs bs
  join users u on u.user_id = bs.user_login;

-- ── 3b) 봇 18 type 메달 시드 ──
insert into user_gym_medals (user_id, gym_id, medal_id, earned_at, used_pets)
select u.id, g.id, gm.id, now(), '{"pets": [], "bot": true}'::jsonb
  from users u
  cross join gyms g
  join gym_medals gm on gm.gym_id = g.id
 where u.is_bot = true
   and g.chapter in (1, 2, 3)
on conflict (user_id, gym_id) do nothing;

-- ── 4) 봇 추가 RPC (방장 only) ──
create or replace function add_bot_to_ch4_raid(
  p_host_user_id uuid,
  p_raid_id      uuid
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_raid      ch4_raids%rowtype;
  v_bot_id    uuid;
  v_next_slot int;
  v_role      text;
  v_stats     json;
  v_species   text;
  v_nickname  text;
begin
  select * into v_raid from ch4_raids where id = p_raid_id;
  if not found then
    return json_build_object('ok', false, 'error', '방을 찾을 수 없어요.');
  end if;
  if v_raid.status <> 'waiting' then
    return json_build_object('ok', false, 'error', '이미 시작했거나 종료된 방이에요.');
  end if;
  if v_raid.host_user_id <> p_host_user_id then
    return json_build_object('ok', false, 'error', '방장만 봇을 추가할 수 있어요.');
  end if;

  select min(s) into v_next_slot
    from generate_series(1, 3) s
   where s not in (select slot from ch4_raid_participants where raid_id = p_raid_id);
  if v_next_slot is null then
    return json_build_object('ok', false, 'error', '방이 가득 찼어요.');
  end if;

  -- 사용 가능한 봇: starter 있고, 다른 대기 raid 에 안 들어가 있음
  select u.id into v_bot_id
    from users u
   where u.is_bot = true
     and exists (select 1 from user_starter where user_id = u.id)
     and not exists (
       select 1 from ch4_raid_participants p
       join ch4_raids r on r.id = p.raid_id
       where p.user_id = u.id and r.status = 'waiting'
     )
   order by random()
   limit 1;

  if v_bot_id is null then
    return json_build_object('ok', false, 'error', '사용 가능한 봇이 없어요.');
  end if;

  v_stats := ch4_user_stats(v_bot_id);
  if not coalesce((v_stats->>'eligible')::boolean, false) then
    return json_build_object('ok', false, 'error', '봇 시드가 손상됐어요. 관리자에게 문의하세요.');
  end if;

  v_species := v_stats->'starter'->>'species';
  v_role := pick_random_ch4_role(p_raid_id);

  insert into ch4_raid_participants (
    raid_id, user_id, slot, role,
    skill_loadout, starter_snapshot, center_power_snapshot,
    hp_scale, atk_scale, skill_mul
  ) values (
    p_raid_id, v_bot_id, v_next_slot, v_role,
    compute_ch4_loadout(v_role, v_species),
    v_stats->'starter',
    (v_stats->>'center_power')::int,
    (v_stats->>'hp_scale')::numeric,
    (v_stats->>'atk_scale')::numeric,
    (v_stats->>'skill_mul')::numeric
  );

  -- 봇 nickname 조회
  select display_name into v_nickname from users where id = v_bot_id;

  return json_build_object(
    'ok',          true,
    'slot',        v_next_slot,
    'role',        v_role,
    'bot_user_id', v_bot_id,
    'bot_name',    v_nickname
  );
end;
$$;

grant execute on function add_bot_to_ch4_raid(uuid, uuid) to anon, authenticated;

-- ── 5) get_ch4_raid 응답에 is_bot 필드 추가 (drop + recreate, 시그니처 동일) ──
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
      'is_bot',          coalesce(u.is_bot, false),
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

-- ── 6) get_user_rankings / fetchMe 에서 봇 노출 방지 ──
-- 기존 get_user_rankings 시그니처는 그대로 두고, 봇 row 만 필터.
-- 단, 동적 변경은 마이그레이션 본문에 함수 정의 길어서 다음 마이그레이션
-- 에서 처리. (현재는 봇이 랭킹에 보이지만 pet_score/pokedex_count=0 이라
-- 사실상 하단에 묻힘.)

notify pgrst, 'reload schema';
