-- ============================================================
-- 펫 등록 전투력 대폭 상향 v3 (MUR 40,000 기준)
--
-- 배경:
--   기존 펫 점수 = rarity_score × 15.
--   현재 MUR PCL10 슬롯당 28×15 = 420점.
--   하지만 메달/도감/체육관 보상이 수천~수만 단위라
--   MUR 펫을 등록해도 체감이 거의 없음. 사용자 요청으로
--   펫 등록 전투력을 절대값으로 재정의 — MUR 만 단위.
--
-- 새 정책:
--   펫 점수 = pet_rarity_score(rarity) 그대로 (× multiplier 폐기).
--   PCL 10 슬랩만 합산 (기존 정책 유지).
--   같은 카드가 신구조(main_cards_by_type) 와 구구조(main_card_ids)
--   에 모두 있어도 UNION 으로 1회만 합산 (기존 정책 유지).
--   방어덱 / 전시 카드 제외 (기존 정책 유지 — main_cards 에서
--   자동 제거되므로).
--
-- 등급별 새 절대값 (PCL 10 슬롯당):
--   MUR : 40,000   (이전 420 → ×95)
--   UR  : 20,000
--   SAR : 12,000
--   SR  :  7,000
--   MA  :  5,000
--   AR  :  4,000
--   RR  :  2,000
--   R   :  1,000
--   U   :    500
--   C   :    500
--   else:      0
--
-- 우선순위: MUR > UR > SAR > SR > MA > AR > RR > R > U/C.
--   (MA 가 SR 보다 낮은 건 사용자 명시 요청 — 기존 위계와 다름.)
--
-- 구현 노트:
--   기존 rarity_score(text) 함수는 활동 피드(× 10) 등에서 계속
--   사용 중이므로 건드리지 않음. 펫 점수 전용 헬퍼를
--   pet_rarity_score(text) 로 분리.
--
-- 영향 범위 (모두 자동 반영 — pet_score 컬럼 → center_power):
--   · users.pet_score (denormalized cache)
--   · get_profile().center_power
--   · get_user_rankings().center_power
--   · gym_compute_user_center_power()  → 체육관 도전 게이트 + 슬롯 보너스
--   · UsersView 상세 패널 (클라 RARITY_SCORE 별도 보정 필요)
-- ============================================================

-- ── 1) pet_rarity_score: 펫 점수 전용 절대값 헬퍼 ──
create or replace function pet_rarity_score(p_rarity text)
returns int
language sql
immutable
set search_path = public, extensions
as $$
  select case p_rarity
    when 'MUR' then 40000
    when 'UR'  then 20000
    when 'SAR' then 12000
    when 'SR'  then  7000
    when 'MA'  then  5000
    when 'AR'  then  4000
    when 'RR'  then  2000
    when 'R'   then  1000
    when 'U'   then   500
    when 'C'   then   500
    else 0
  end::int;
$$;

grant execute on function pet_rarity_score(text) to anon, authenticated;

-- ── 2) compute_user_pet_score: 신구조 + 구구조 UNION, 새 함수 사용 ──
create or replace function compute_user_pet_score(p_user_id uuid)
returns int
language sql
stable
set search_path = public, extensions
as $$
  with all_ids as (
    select unnest(coalesce(main_card_ids, '{}'::uuid[])) as id
      from users where id = p_user_id
    union
    select unnest(flatten_pet_ids_by_type(main_cards_by_type)) as id
      from users where id = p_user_id
  )
  select coalesce(sum(pet_rarity_score(g.rarity)), 0)::int
    from psa_gradings g
   where g.id in (select id from all_ids)
     and g.grade = 10;
$$;

grant execute on function compute_user_pet_score(uuid) to anon, authenticated;

-- ── 3) pet_score_for(uuid[]): legacy 입력용도 동일 산식으로 ──
create or replace function pet_score_for(p_grading_ids uuid[])
returns int
language sql
stable
set search_path = public, extensions
as $$
  select coalesce(sum(pet_rarity_score(g.rarity)), 0)::int
    from psa_gradings g
   where g.id = any(coalesce(p_grading_ids, '{}'::uuid[]))
     and g.grade = 10;
$$;

grant execute on function pet_score_for(uuid[]) to anon, authenticated;

-- ── 4) 모든 유저 pet_score 즉시 재계산 ──
update users
   set pet_score = compute_user_pet_score(id);

notify pgrst, 'reload schema';
