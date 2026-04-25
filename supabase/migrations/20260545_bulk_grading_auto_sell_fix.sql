-- ============================================================
-- bulk_submit_psa_grading: PCL 자동판매 (auto_sell_below) 버그 수정
--
-- 문제점 (20260541 기준):
--   1. 함수 진입부에서 assert_pcl_cap(user, v_eligible_count) 으로
--      "모든 eligible 카드가 슬랩이 된다" 가정하여 cap 검사 → 자동판매가
--      켜진 경우 실제로 저장될 슬랩은 일부(70%는 감별 실패, threshold 미만은
--      자동판매)뿐인데도 cap 초과로 거부되는 사례가 발생.
--      예) 9,500 슬랩 보유 사용자가 "9 미만 자동판매" 로 1,000장 일괄 의뢰
--          → 실제 저장될 슬랩은 ~50장이지만 함수가 P0001 raise.
--
--   2. v_pcl_10_delta 가 auto-sell 분기 *전에* 증가 → 자동판매로 사라진
--      grade 10 도 pcl_10_wins 카운트가 올라감 (사용자가 "10 미만" 선택 시
--      모든 grade 10이 자동판매되는데도 PCL 10 보유 카운트만 올라감).
--
--   3. 부분 성공 보장: cap 도달 시 raise 대신 inline cap-skip 으로 처리하여
--      auto-sell + cap 가까운 사용자도 안전하게 일괄 의뢰가 통과되도록 함.
--      (20260540 의 v_pcl_used 카운터 패턴 복원, 단 자동판매 슬랩은 카운트
--      에서 제외하여 정확하게 cap 을 사용.)
-- ============================================================

create or replace function bulk_submit_psa_grading(
  p_user_id uuid,
  p_card_ids text[],
  p_rarities text[] default null,
  p_auto_sell_below_grade int default null
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_card_id text;
  v_rarity text;
  v_idx int := 0;
  v_count int;
  v_grade int;
  v_roll numeric;
  v_bonus int;
  v_total_bonus int := 0;
  v_success int := 0;
  v_fail int := 0;
  v_skipped int := 0;
  v_cap_skipped int := 0;
  v_results jsonb := '[]'::jsonb;
  v_new_points int;
  v_auto_sold_count int := 0;
  v_auto_sold_earned int := 0;
  v_pcl_10_delta int := 0;
  v_sell_payout int;
  v_should_auto_sell boolean;
  v_pcl_current int;
  v_pcl_room int;
  v_pcl_used int := 0;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  if p_card_ids is null or array_length(p_card_ids, 1) is null then
    return json_build_object('ok', false, 'error', '감정할 카드가 없어요.');
  end if;

  -- cap 잔여 슬랩 자리 계산 (자동판매·실패는 카운트하지 않음)
  select count(*)::int into v_pcl_current from psa_gradings where user_id = p_user_id;
  v_pcl_room := greatest(0, 10000 - v_pcl_current);

  foreach v_card_id in array p_card_ids loop
    v_idx := v_idx + 1;
    v_rarity := case
      when p_rarities is null then null
      when array_length(p_rarities, 1) >= v_idx then p_rarities[v_idx]
      else null
    end;

    if v_rarity is null or not is_psa_eligible_rarity(v_rarity) then
      v_skipped := v_skipped + 1;
      v_results := v_results || jsonb_build_object(
        'card_id', v_card_id, 'ok', false, 'error', 'ineligible_rarity'
      );
      continue;
    end if;

    select count into v_count from card_ownership
      where user_id = p_user_id and card_id = v_card_id for update;
    if not found or coalesce(v_count, 0) < 1 then
      v_skipped := v_skipped + 1;
      v_results := v_results || jsonb_build_object(
        'card_id', v_card_id, 'ok', false, 'error', 'not_owned'
      );
      continue;
    end if;

    update card_ownership set count = count - 1, last_pulled_at = now()
      where user_id = p_user_id and card_id = v_card_id;
    delete from card_ownership
      where user_id = p_user_id and card_id = v_card_id and count = 0;

    v_roll := random() * 100;

    if v_roll < 70 then
      v_fail := v_fail + 1;
      v_results := v_results || jsonb_build_object(
        'card_id', v_card_id, 'ok', true, 'failed', true
      );
      continue;
    end if;

    v_grade := case
      when v_roll < 78   then 6
      when v_roll < 88   then 7
      when v_roll < 96   then 8
      when v_roll < 99.5 then 9
      else 10
    end;

    v_bonus := case
      when v_grade = 10 then 50000
      when v_grade = 9  then 30000
      when v_grade = 8  then 10000
      when v_grade in (6, 7) then 3000
      else 0
    end;

    v_should_auto_sell :=
      p_auto_sell_below_grade is not null
      and v_grade < p_auto_sell_below_grade;

    if v_should_auto_sell then
      -- 자동판매: 슬랩 저장 없이 즉시 환산.
      -- pcl_10_wins / cap 모두 영향 없음.
      v_sell_payout := pcl_sell_price(v_grade);
      v_auto_sold_count := v_auto_sold_count + 1;
      v_auto_sold_earned := v_auto_sold_earned + v_sell_payout;
      v_total_bonus := v_total_bonus + v_bonus + v_sell_payout;
      v_success := v_success + 1;

      v_results := v_results || jsonb_build_object(
        'card_id', v_card_id, 'ok', true, 'failed', false,
        'grade', v_grade, 'bonus', v_bonus,
        'auto_sold', true, 'sell_payout', v_sell_payout
      );
      continue;
    end if;

    -- 슬랩 저장 시도. cap 도달 시 raise 대신 cap_skipped 로 부드럽게 처리.
    if v_pcl_used >= v_pcl_room then
      v_cap_skipped := v_cap_skipped + 1;
      v_results := v_results || jsonb_build_object(
        'card_id', v_card_id, 'ok', false, 'error', 'pcl_cap',
        'grade', v_grade
      );
      continue;
    end if;

    if v_grade = 10 then
      v_pcl_10_delta := v_pcl_10_delta + 1;
    end if;

    insert into psa_gradings (user_id, card_id, grade, rarity)
      values (p_user_id, v_card_id, v_grade, v_rarity);
    v_pcl_used := v_pcl_used + 1;

    v_total_bonus := v_total_bonus + v_bonus;
    v_success := v_success + 1;

    v_results := v_results || jsonb_build_object(
      'card_id', v_card_id, 'ok', true, 'failed', false,
      'grade', v_grade, 'bonus', v_bonus
    );
  end loop;

  if v_pcl_10_delta > 0 then
    update users set pcl_10_wins = pcl_10_wins + v_pcl_10_delta
      where id = p_user_id;
  end if;

  if v_total_bonus > 0 then
    update users set points = points + v_total_bonus
      where id = p_user_id
      returning points into v_new_points;
  else
    select points into v_new_points from users where id = p_user_id;
  end if;

  return json_build_object(
    'ok', true,
    'results', v_results,
    'success_count', v_success,
    'fail_count', v_fail,
    'skipped_count', v_skipped,
    'cap_skipped_count', v_cap_skipped,
    'auto_sold_count', v_auto_sold_count,
    'auto_sold_earned', v_auto_sold_earned,
    'bonus', v_total_bonus,
    'points', v_new_points
  );
end;
$$;

grant execute on function bulk_submit_psa_grading(uuid, text[], text[], int) to anon, authenticated;

notify pgrst, 'reload schema';
