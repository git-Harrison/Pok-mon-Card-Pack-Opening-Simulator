-- ============================================================
-- 체육관 챕터 4 "미지의 영역" — Phase 0 / 1단계: 데이터 스키마
--
-- 신규 6 테이블:
--   ch4_bosses              4 보스 마스터 데이터 (단계 순서, 약점, base 스탯)
--   ch4_boss_skills         보스별 스킬 풀 (AI 우선순위 + 애니메이션 메타)
--   ch4_skills              플레이어 스킬 (역할 공통 9 + 종 시그니처 10)
--   ch4_raids               레이드 인스턴스 (룸 코드, 상태, replay_data)
--   ch4_raid_participants   참가자 (raid × slot 1~3, 역할 unique)
--   user_ch4_clears         영구 클리어 기록 (보스 단계 해금용)
--
-- 스탯 보정:
--   center_power → HP/ATK ×배율(최대 ×3.0) + 스킬 데미지(+100% 캡).
--   참가 시점 스냅샷을 participants 행에 저장해 레이드 진행 중 변동 무시.
--
-- Phase 0 다음 마이그레이션:
--   20260747_ch4_seed.sql — 보스/스킬 시드 데이터
--   20260748_ch4_lobby_rpcs.sql — 룸 생성/참가/조회 RPC + ch4_user_stats
-- ============================================================

-- ── 보스 마스터 ──
create table if not exists ch4_bosses (
  id                      text primary key,
  stage_order             int  not null check (stage_order between 1 and 4),
  name                    text not null,
  description             text,
  sprite_key              text not null,
  types                   text[] not null default '{}',
  weak_to                 text[] not null default '{}',
  base_hp                 bigint not null check (base_hp > 0),
  base_atk                int  not null check (base_atk > 0),
  base_def                int  not null check (base_def >= 0),
  -- 페이즈 전환 (Final 보스 전용 — HP 비율 < 이 값이면 광폭화 phase 2)
  phase_switch_hp_ratio   numeric,
  -- 직전 단계 클리어 필요 (stage 1 = null)
  unlock_requires_clear   text references ch4_bosses(id),
  created_at              timestamptz not null default now()
);

create unique index if not exists ch4_bosses_stage_unique on ch4_bosses (stage_order);

-- ── 보스 스킬 ──
create table if not exists ch4_boss_skills (
  id                      text primary key,
  boss_id                 text not null references ch4_bosses(id) on delete cascade,
  name                    text not null,
  kind                    text not null check (kind in ('single','aoe','debuff','self_heal','self_buff')),
  power                   numeric not null default 1.0,
  cooldown_turns          int not null default 0,
  ai_priority             int not null default 0,
  -- 0 = 항상, 1 = 광폭화 모드(phase 2) 이후만
  requires_phase          int not null default 0,
  -- 애니메이션 메타
  fx_template             text not null,
  fx_color                text,
  fx_color_secondary      text,
  fx_intensity            numeric not null default 1.0,
  fx_duration_ms          int not null default 2000,
  fx_shake                text not null default 'medium' check (fx_shake in ('none','small','medium','large','screen')),
  fx_vignette_color       text,
  fx_zoom                 numeric not null default 1.0,
  fx_text_style           text not null default 'shadow',
  created_at              timestamptz not null default now()
);

create index if not exists ch4_boss_skills_boss_idx on ch4_boss_skills (boss_id, ai_priority desc);

-- ── 플레이어 스킬 (역할 공통 + 종 시그니처) ──
create table if not exists ch4_skills (
  id                      text primary key,
  scope                   text not null check (scope in ('role','species')),
  role                    text check (role in ('tank','dealer','supporter')),
  species                 text,
  name                    text not null,
  kind                    text not null check (kind in ('attack','heal','buff','debuff','taunt','counter')),
  target                  text not null check (target in ('enemy','ally_low_hp','all_allies','self','enemy_buffs')),
  power                   numeric not null default 1.0,
  cooldown_turns          int not null default 0,
  ai_priority             int not null default 0,
  duration_turns          int not null default 0,
  fx_template             text not null,
  fx_color                text,
  fx_color_secondary      text,
  fx_intensity            numeric not null default 1.0,
  fx_duration_ms          int not null default 1800,
  fx_shake                text not null default 'small' check (fx_shake in ('none','small','medium','large','screen')),
  fx_zoom                 numeric not null default 1.0,
  fx_text_style           text not null default 'default',
  created_at              timestamptz not null default now(),
  check (
    (scope = 'role' and role is not null and species is null) or
    (scope = 'species' and species is not null and role is null)
  )
);

create index if not exists ch4_skills_role_idx on ch4_skills (scope, role);
create index if not exists ch4_skills_species_idx on ch4_skills (scope, species);

-- ── 레이드 인스턴스 ──
create table if not exists ch4_raids (
  id              uuid primary key default gen_random_uuid(),
  boss_id         text not null references ch4_bosses(id),
  host_user_id    uuid not null references users(id) on delete cascade,
  room_code       text not null unique,
  status          text not null default 'waiting' check (status in ('waiting','resolving','resolved','cancelled')),
  result          text check (result in ('win','loss')),
  replay_data     jsonb,            -- 전체 프레임 시퀀스 (Phase 1 resolve 시 채움)
  total_turns     int,
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz
);

create index if not exists ch4_raids_host_idx on ch4_raids (host_user_id, status);
create index if not exists ch4_raids_status_idx on ch4_raids (status, created_at desc);

-- ── 참가자 (raid × slot 1~3, 역할 unique 강제) ──
create table if not exists ch4_raid_participants (
  raid_id                 uuid not null references ch4_raids(id) on delete cascade,
  user_id                 uuid not null references users(id) on delete cascade,
  slot                    int  not null check (slot between 1 and 3),
  role                    text not null check (role in ('tank','dealer','supporter')),
  skill_loadout           text[] not null default '{}',
  starter_snapshot        jsonb not null,             -- species/level/stage 참가 시점 스냅샷
  center_power_snapshot   int  not null,              -- center_power 참가 시점 스냅샷
  hp_scale                numeric not null default 1.0,
  atk_scale               numeric not null default 1.0,
  skill_mul               numeric not null default 1.0,
  joined_at               timestamptz not null default now(),
  primary key (raid_id, slot),
  unique (raid_id, user_id),
  unique (raid_id, role)
);

create index if not exists ch4_raid_participants_user_idx on ch4_raid_participants (user_id);

-- ── 영구 클리어 기록 (보스별 1회, 다음 보스 해금 + 명예의 전당) ──
create table if not exists user_ch4_clears (
  user_id         uuid not null references users(id) on delete cascade,
  boss_id         text not null references ch4_bosses(id),
  raid_id         uuid references ch4_raids(id) on delete set null,
  cleared_at      timestamptz not null default now(),
  primary key (user_id, boss_id)
);

create index if not exists user_ch4_clears_boss_idx on user_ch4_clears (boss_id);

notify pgrst, 'reload schema';
