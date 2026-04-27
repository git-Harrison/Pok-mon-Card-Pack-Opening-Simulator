-- ============================================================
-- 체육관 시스템 Phase 1 — DB 골조 + 시드 + 조회/락 RPC
--
-- 포함:
--   1) 9 테이블 + 인덱스 (gyms, gym_pokemon, gym_medals,
--      gym_ownerships, gym_challenges, gym_battle_logs,
--      user_gym_medals, gym_rewards, gym_cooldowns)
--   2) 8개 NPC 체육관 시드 (각 속성 1개 — 풀/물/바위/전기/불꽃/땅/얼음/에스퍼)
--   3) 각 체육관 관장 포켓몬 3마리 (WILD_POOL dex 기준 sprite 사용)
--   4) 각 체육관 메달 1개 시드
--   5) RPC 3개:
--      · get_gyms_state(p_user_id)         — 한 번에 모든 체육관 + 상태
--      · start_gym_challenge(p_user_id, p_gym_id) — advisory lock + 동시성
--        검증 + active 도전 1개 보장
--      · abandon_gym_challenge(p_user_id, p_challenge_id) — 자발적 포기
--
-- 미포함 (Phase 2-4 에서):
--   · 전투 결과 RPC (resolve_gym_battle) — 펫 능력치 + 속성 보정 + 결과
--     소유권 변경 + 메달 지급 트랜잭션
--   · 보호 연장 RPC (extend_gym_protection 10M 포인트)
--   · 보상 청구 RPC (claim_gym_rewards)
--   · 자동 패배 처리 (전투 중 이탈)
--   · 메달 / 점령 정보 → get_user_rankings / 프로필 RPC 통합
--
-- 모든 DDL 멱등 (`create or replace`, `if not exists`).
-- 시드 DML 도 멱등 (`on conflict do update`, 시드 직전 delete + insert).
-- ============================================================

-- 1) 테이블 ----------------------------------------------------

create table if not exists gyms (
  id text primary key,                            -- short slug 'gym-grass'
  name text not null,
  type text not null,                             -- WildType (Korean)
  difficulty text not null check (difficulty in ('EASY','NORMAL','HARD','BOSS')),
  leader_name text not null,
  leader_sprite text,                             -- 외부 sprite URL 또는 null
  location_x int not null,                        -- 0~100 정규화
  location_y int not null,                        -- 0~100 정규화
  min_power int not null default 0,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists gym_pokemon (
  id uuid primary key default gen_random_uuid(),
  gym_id text not null references gyms(id) on delete cascade,
  slot int not null check (slot between 1 and 3),
  name text not null,
  type text not null,                             -- WildType
  dex int not null,                               -- WILD_POOL dex (sprite key)
  hp int not null,
  atk int not null,
  def int not null,
  spd int not null,
  unique (gym_id, slot)
);

create index if not exists gym_pokemon_gym_idx on gym_pokemon(gym_id);

create table if not exists gym_medals (
  id uuid primary key default gen_random_uuid(),
  gym_id text not null unique references gyms(id) on delete cascade,
  name text not null,
  type text not null,
  description text not null
);

create table if not exists gym_ownerships (
  gym_id text primary key references gyms(id) on delete cascade,
  owner_user_id uuid not null references users(id) on delete cascade,
  captured_at timestamptz not null default now(),
  protection_until timestamptz not null
);

create index if not exists gym_ownerships_owner_idx
  on gym_ownerships(owner_user_id);
create index if not exists gym_ownerships_protection_idx
  on gym_ownerships(protection_until);

create table if not exists gym_challenges (
  id uuid primary key default gen_random_uuid(),
  gym_id text not null references gyms(id) on delete cascade,
  challenger_user_id uuid not null references users(id) on delete cascade,
  status text not null check (status in ('active','won','lost','abandoned')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  result text
);

-- gym 당 active 도전 1개만 허용 — 동시 점령 race 방지의 핵심.
-- partial unique index 라 종료된 도전(won/lost/abandoned)은 제약 받지 않음.
create unique index if not exists gym_challenges_active_unique
  on gym_challenges(gym_id) where status = 'active';

create index if not exists gym_challenges_user_idx
  on gym_challenges(challenger_user_id, started_at desc);

create table if not exists gym_battle_logs (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid references gym_challenges(id) on delete set null,
  gym_id text not null references gyms(id) on delete cascade,
  challenger_user_id uuid not null,
  defender_user_id uuid,                          -- NPC 도전이면 null
  result text not null,                           -- 'won' | 'lost'
  used_pets jsonb,                                -- [{ id, slot, name, ... }]
  turn_log jsonb,                                 -- 턴별 데미지 기록
  started_at timestamptz not null,
  ended_at timestamptz not null default now()
);

create index if not exists gym_battle_logs_user_idx
  on gym_battle_logs(challenger_user_id, ended_at desc);
create index if not exists gym_battle_logs_gym_idx
  on gym_battle_logs(gym_id, ended_at desc);

create table if not exists user_gym_medals (
  user_id uuid not null references users(id) on delete cascade,
  gym_id text not null references gyms(id) on delete cascade,
  medal_id uuid not null references gym_medals(id) on delete cascade,
  earned_at timestamptz not null default now(),
  used_pets jsonb,
  primary key (user_id, gym_id)
);

create index if not exists user_gym_medals_user_idx
  on user_gym_medals(user_id, earned_at desc);

create table if not exists gym_rewards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  gym_id text not null references gyms(id) on delete cascade,
  reward_type text not null
    check (reward_type in ('capture','maintenance','defense','extension')),
  amount int not null,
  claimed_at timestamptz not null default now()
);

create index if not exists gym_rewards_user_idx
  on gym_rewards(user_id, claimed_at desc);

create table if not exists gym_cooldowns (
  user_id uuid not null references users(id) on delete cascade,
  gym_id text not null references gyms(id) on delete cascade,
  cooldown_until timestamptz not null,
  primary key (user_id, gym_id)
);

create index if not exists gym_cooldowns_until_idx
  on gym_cooldowns(cooldown_until);

-- 2) 시드: 8개 체육관 (각 속성 1개) ---------------------------
-- location_x, location_y 는 0~100 정규화 좌표 — 클라가 % 로 배치.
-- min_power 는 Phase 2 의 center_power 기준 가이드 (EASY 500 → BOSS 6500).

insert into gyms (id, name, type, difficulty, leader_name,
                  location_x, location_y, min_power, display_order)
values
  ('gym-grass',    '잎새 체육관',    '풀',     'EASY',   '리프',         22, 78,    500, 1),
  ('gym-water',    '파도 체육관',    '물',     'NORMAL', '미스티',       62, 82,   1500, 2),
  ('gym-rock',     '암석 체육관',    '바위',   'NORMAL', '강석',         18, 52,   1500, 3),
  ('gym-electric', '뇌전 체육관',    '전기',   'NORMAL', '썬더라이트',   50, 48,   2200, 4),
  ('gym-fire',     '불꽃 체육관',    '불꽃',   'HARD',   '플레임',       80, 50,   3200, 5),
  ('gym-ground',   '대지 체육관',    '땅',     'HARD',   '드릴',         34, 28,   3500, 6),
  ('gym-ice',      '빙하 체육관',    '얼음',   'BOSS',   '글레이시아',   72, 18,   5500, 7),
  ('gym-psychic',  '초능력 체육관',  '에스퍼', 'BOSS',   '사이코',       18, 10,   6500, 8)
on conflict (id) do update
  set name = excluded.name,
      type = excluded.type,
      difficulty = excluded.difficulty,
      leader_name = excluded.leader_name,
      location_x = excluded.location_x,
      location_y = excluded.location_y,
      min_power = excluded.min_power,
      display_order = excluded.display_order;

-- 관장 포켓몬 3마리. dex 는 src/lib/wild/pool.ts 의 WILD_POOL 과 일치
-- 해야 sprite (PokeAPI gen5 BW animated) 가 로드됨. 시드 멱등성을 위해
-- 대상 8개 체육관의 기존 row 를 삭제 후 재삽입.
delete from gym_pokemon where gym_id in (
  'gym-grass','gym-water','gym-rock','gym-electric',
  'gym-fire','gym-ground','gym-ice','gym-psychic'
);

insert into gym_pokemon (gym_id, slot, name, type, dex, hp, atk, def, spd) values
  -- 풀 EASY
  ('gym-grass',    1, '이상해씨', '풀',     1,   100,  30, 25, 22),
  ('gym-grass',    2, '이상해씨', '풀',     1,   115,  34, 28, 24),
  ('gym-grass',    3, '이상해씨', '풀',     1,   140,  42, 34, 28),
  -- 물 NORMAL
  ('gym-water',    1, '꼬부기',   '물',     7,   110,  32, 28, 24),
  ('gym-water',    2, '고라파덕', '물',    54,   140,  38, 32, 28),
  ('gym-water',    3, '갸라도스', '물',   130,   200,  60, 40, 38),
  -- 바위 NORMAL
  ('gym-rock',     1, '꼬마돌',   '바위',  74,   130,  36, 50, 18),
  ('gym-rock',     2, '롱스톤',   '바위',  95,   170,  44, 70, 22),
  ('gym-rock',     3, '롱스톤',   '바위',  95,   210,  54, 90, 24),
  -- 전기 NORMAL
  ('gym-electric', 1, '피카츄',   '전기',  25,   115,  42, 24, 50),
  ('gym-electric', 2, '코일',     '강철',  81,   140,  40, 56, 30),
  ('gym-electric', 3, '썬더',     '전기', 145,   220,  72, 50, 60),
  -- 불꽃 HARD
  ('gym-fire',     1, '식스테일', '불꽃',  37,   135,  46, 32, 42),
  ('gym-fire',     2, '포니타',   '불꽃',  77,   170,  54, 38, 56),
  ('gym-fire',     3, '파이어',   '불꽃', 146,   245,  82, 50, 60),
  -- 땅 HARD
  ('gym-ground',   1, '디그다',   '땅',    50,   105,  38, 28, 60),
  ('gym-ground',   2, '모래두지', '땅',    27,   155,  52, 60, 30),
  ('gym-ground',   3, '모래두지', '땅',    27,   225,  72, 82, 32),
  -- 얼음 BOSS
  ('gym-ice',      1, '라프라스', '얼음', 131,   220,  60, 60, 28),
  ('gym-ice',      2, '라프라스', '얼음', 131,   250,  72, 70, 32),
  ('gym-ice',      3, '프리져',   '얼음', 144,   320, 102, 80, 60),
  -- 에스퍼 BOSS
  ('gym-psychic',  1, '캐이시',   '에스퍼', 63,   135,  52, 28, 60),
  ('gym-psychic',  2, '마임맨',   '에스퍼',122,   180,  72, 60, 50),
  ('gym-psychic',  3, '뮤츠',     '에스퍼',150,   350, 112, 80, 80);

-- 메달 — 각 체육관 1개. 멱등 위해 대상만 삭제 후 재삽입.
delete from gym_medals where gym_id in (
  'gym-grass','gym-water','gym-rock','gym-electric',
  'gym-fire','gym-ground','gym-ice','gym-psychic'
);

insert into gym_medals (gym_id, name, type, description) values
  ('gym-grass',    '잎새 메달',    '풀',     '잎새 체육관 정복의 증표.'),
  ('gym-water',    '물결 메달',    '물',     '파도 체육관 정복의 증표.'),
  ('gym-rock',     '바위 메달',    '바위',   '암석 체육관 정복의 증표.'),
  ('gym-electric', '뇌전 메달',    '전기',   '뇌전 체육관 정복의 증표.'),
  ('gym-fire',     '불꽃 메달',    '불꽃',   '불꽃 체육관 정복의 증표.'),
  ('gym-ground',   '대지 메달',    '땅',     '대지 체육관 정복의 증표.'),
  ('gym-ice',      '빙하 메달',    '얼음',   '빙하 체육관 정복의 증표.'),
  ('gym-psychic',  '초능력 메달',  '에스퍼', '초능력 체육관 정복의 증표.');

-- 3) RPC -------------------------------------------------------

-- 3-1) get_gyms_state — 한 번에 모든 체육관 + 상태 한 번에 가져오기.
-- 지도 화면 단일 쿼리 N+1 방지. p_user_id 가 null 이 아니면 해당 유저의
-- 재도전 쿨타임 정보까지 포함.
create or replace function get_gyms_state(p_user_id uuid default null)
returns json
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_rows json;
begin
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
        'captured_at', o.captured_at,
        'protection_until', o.protection_until
       )
       from gym_ownerships o
       join users u on u.id = o.owner_user_id
       where o.gym_id = g.id) as ownership,
      (select jsonb_build_object(
        'id', c.id,
        'user_id', c.challenger_user_id,
        'display_name', cu.display_name,
        'started_at', c.started_at
       )
       from gym_challenges c
       join users cu on cu.id = c.challenger_user_id
       where c.gym_id = g.id and c.status = 'active'
       limit 1) as active_challenge,
      case
        when p_user_id is null then null
        else (
          select cd.cooldown_until
            from gym_cooldowns cd
           where cd.user_id = p_user_id
             and cd.gym_id = g.id
             and cd.cooldown_until > now()
           limit 1
        )
      end as user_cooldown_until
    from gyms g
  )
  select coalesce(json_agg(row_to_json(g) order by g.display_order), '[]'::json)
    into v_rows
    from gyms_full g;
  return v_rows;
end;
$$;

grant execute on function get_gyms_state(uuid) to anon, authenticated;

-- 3-2) start_gym_challenge — 도전 락 획득.
-- advisory_xact_lock 으로 동일 gym_id 에 동시 RPC 직렬화. partial unique
-- index 가 active row 를 1개로 강제하므로 트랜잭션이 commit 까지 가도
-- 두 번째는 unique violation 으로 실패 → race 안전.
create or replace function start_gym_challenge(
  p_user_id uuid,
  p_gym_id text
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_gym record;
  v_existing record;
  v_protection timestamptz;
  v_cooldown timestamptz;
  v_challenge_id uuid;
begin
  if p_user_id is null or p_gym_id is null then
    return json_build_object('ok', false, 'error', '요청이 올바르지 않아요.');
  end if;

  -- 동일 gym_id 에 advisory lock — 같은 슬롯을 두고 race 못 하게.
  perform pg_advisory_xact_lock(hashtext('gym:' || p_gym_id));

  -- 1) 체육관 존재 확인
  select * into v_gym from gyms where id = p_gym_id;
  if not found then
    return json_build_object('ok', false, 'error', '체육관을 찾을 수 없어요.');
  end if;

  -- 2) 본인이 이미 다른 체육관에 active 인지
  select * into v_existing
    from gym_challenges
   where challenger_user_id = p_user_id and status = 'active'
   limit 1;
  if found then
    return json_build_object(
      'ok', false,
      'error', '이미 다른 체육관에 도전 중이에요.',
      'existing_challenge_id', v_existing.id,
      'existing_gym_id', v_existing.gym_id
    );
  end if;

  -- 3) 같은 체육관에 다른 유저 도전 중인지
  select * into v_existing
    from gym_challenges
   where gym_id = p_gym_id and status = 'active'
   limit 1;
  if found then
    return json_build_object(
      'ok', false,
      'error', '다른 트레이너가 도전 중이에요. 잠시 후 다시 시도하세요.',
      'challenger_user_id', v_existing.challenger_user_id
    );
  end if;

  -- 4) 보호 쿨타임
  select protection_until into v_protection
    from gym_ownerships where gym_id = p_gym_id;
  if v_protection is not null and v_protection > now() then
    return json_build_object(
      'ok', false,
      'error', '체육관이 보호 중이에요.',
      'protection_until', v_protection
    );
  end if;

  -- 5) 재도전 쿨타임 (Phase 3 에서 패배 시 셋팅. Phase 1 단계에선
  --    셋팅 경로 없으므로 사실상 모두 통과.)
  select cooldown_until into v_cooldown
    from gym_cooldowns
   where user_id = p_user_id and gym_id = p_gym_id;
  if v_cooldown is not null and v_cooldown > now() then
    return json_build_object(
      'ok', false,
      'error', '재도전 쿨타임 중이에요.',
      'cooldown_until', v_cooldown
    );
  end if;

  -- 6) active 챌린지 생성 (partial unique index 가 race 막음)
  insert into gym_challenges (gym_id, challenger_user_id, status)
    values (p_gym_id, p_user_id, 'active')
    returning id into v_challenge_id;

  return json_build_object(
    'ok', true,
    'challenge_id', v_challenge_id,
    'gym_id', p_gym_id
  );
end;
$$;

grant execute on function start_gym_challenge(uuid, text) to anon, authenticated;

-- 3-3) abandon_gym_challenge — 자발적 포기 (락 해제).
-- Phase 1: 본인 active 챌린지를 abandoned 로 마감. 메달/소유권/포인트
-- 변동 없음. Phase 4 에서 무응답 자동 패배 처리는 별도 RPC 로 추가.
create or replace function abandon_gym_challenge(
  p_user_id uuid,
  p_challenge_id uuid
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_challenge record;
begin
  if p_user_id is null or p_challenge_id is null then
    return json_build_object('ok', false, 'error', '요청이 올바르지 않아요.');
  end if;

  select * into v_challenge
    from gym_challenges
   where id = p_challenge_id
   for update;
  if not found then
    return json_build_object('ok', false, 'error', '도전 기록을 찾을 수 없어요.');
  end if;
  if v_challenge.challenger_user_id <> p_user_id then
    return json_build_object('ok', false, 'error', '본인 도전만 포기할 수 있어요.');
  end if;
  if v_challenge.status <> 'active' then
    return json_build_object('ok', false, 'error', '이미 종료된 도전이에요.');
  end if;

  update gym_challenges
     set status = 'abandoned',
         ended_at = now(),
         result = 'abandoned'
   where id = p_challenge_id;

  return json_build_object('ok', true, 'challenge_id', p_challenge_id);
end;
$$;

grant execute on function abandon_gym_challenge(uuid, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
