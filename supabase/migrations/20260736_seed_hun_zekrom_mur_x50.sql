-- ============================================================
-- hun 계정 시드 — MUR 제크로무 ex (sv11b-174) PCL10 슬랩 50장 카드지갑.
--
-- 사용자 요구:
--   "hun 계정에 MUR 제크로무 50개 카드지갑에 시드로 넣어줘"
--
-- 정책 (20260716 zekrom x40 시드 패턴 그대로):
--   · psa_gradings INSERT 만 — 슬랩 보유 상태만 생성.
--   · pokedex_entries 미터치 — 도감 등록 안 됨.
--   · users.main_card_ids / main_cards_by_type 미터치 — 펫 자동 등록 안 됨.
--   · gym_ownerships.defense_pet_ids 미터치 — 체육관 방어덱 안 들어감.
--   · pcl_10_wins 카운터 만큼 가산 (감별 누적 통계 일관성).
--
-- 멱등:
--   · 현재 보유 PCL10 슬랩 수가 50장 미만이면 부족분만 채움.
--   · 이미 50장 이상 보유 시 skip.
--   · 20260716 (목표 40장) 이후 추가 보충용 — 20260716 가 먼저 적용된
--     상태에서 본 시드 적용하면 +10 장 INSERT.
--
-- 의존성: 20260664 (card_types — sv11 카드 카탈로그).
-- ============================================================

do $$
declare
  v_user_id uuid;
  v_card_id constant text := 'sv11b-174';
  v_target_count constant int := 50;
  v_existing int;
  v_to_insert int;
begin
  select id into v_user_id from users where user_id = 'hun';
  if not found then
    raise notice '[hun zekrom x50] user hun 미존재 — skip';
    return;
  end if;

  -- 카탈로그 검증 — 실제 존재 + MUR 인지 확인.
  if not exists (
    select 1 from card_types
     where card_id = v_card_id
       and rarity = 'MUR'
  ) then
    raise notice '[hun zekrom x50] card_types 에 % (MUR) 없음 — skip', v_card_id;
    return;
  end if;

  -- 멱등 — 부족분만 채움.
  select count(*)::int into v_existing
    from psa_gradings
   where user_id = v_user_id
     and card_id = v_card_id
     and grade = 10;

  v_to_insert := v_target_count - v_existing;

  if v_to_insert <= 0 then
    raise notice '[hun zekrom x50] 이미 % 장 보유 (목표 %) — skip',
      v_existing, v_target_count;
    return;
  end if;

  insert into psa_gradings (user_id, card_id, grade, rarity)
  select v_user_id, v_card_id, 10, 'MUR'
    from generate_series(1, v_to_insert);

  update users
     set pcl_10_wins = coalesce(pcl_10_wins, 0) + v_to_insert
   where id = v_user_id;

  raise notice '[hun zekrom x50] 기존 % 장 → 목표 % 장 (% 장 추가, pcl_10_wins +%)',
    v_existing, v_target_count, v_to_insert, v_to_insert;
end $$;

notify pgrst, 'reload schema';

-- 마이그레이션: 20260736_seed_hun_zekrom_mur_x50.sql
