-- ============================================================
-- 일괄 감별 — 자동 판매(auto-sell) 분기를 자동 삭제(auto-delete)로
-- 전환 + bulk_sell_gradings 폐기. spec 3-1 / 6-1.
--
-- 사용자 스펙:
--   "PCL 카드 판매 기능은 더 이상 사용하지 않습니다. 기존 '판매' 처리는
--    '카드 삭제' 처리로 변경. 감별 후 결과 리스트는 전부 보여주지 말고
--    성공한 카드 개수만 표시. 감별 완료 후 대상 카드는 삭제 처리."
--
-- 변경 내역:
--   1) bulk_submit_pcl_grading
--      · auto-sell 분기 → 카드 삭제 (count 차감 + cleanup) 유지하되
--        포인트 지급 / sell_payout 계산 / users.points 가산 모두 폐기.
--      · 입력 인자명 p_auto_sell_below_grade 는 호환 위해 유지하지만
--        의미는 "이 등급 미만은 슬랩 저장 없이 즉시 삭제".
--      · 응답 results 배열 폐기 — 클라가 요청한 "성공 개수만" 정책에
--        맞춰 N장 일괄 처리 시 N×JSON 객체 응답 없음. 대신 합산 카운트
--        (success/fail/skipped/cap_skipped/auto_deleted) 만 반환.
--      · auto_sold_count → auto_deleted_count 로 의미 명확화. 호환 위해
--        auto_sold_count, auto_sold_earned 키도 0/0 으로 남겨둠.
--   2) bulk_sell_gradings 함수 drop — 호출처 0 (BulkSellView 삭제됨).
--   3) pcl_sell_price 함수도 drop. record_pack_pulls_batch 의 구
--      자동판매 분기는 이미 사용자 토글 기준이라 호출 0 추정. 만약
--      미발견 호출이 있다면 함수 부재로 즉시 에러나서 발견 가능.
-- ============================================================

create or replace function bulk_submit_pcl_grading(
  p_user_id uuid,
  p_card_ids text[],
  p_rarities text[] default null,
  p_auto_sell_below_grade int default null
) returns json
language plpgsql
security definer
set search_path = public, extensions
set statement_timeout = '180s'
as $$
declare
  v_card_id text;
  v_rarity text;
  v_idx int := 0;
  v_count int;
  v_grade int;
  v_roll numeric;
  v_threshold_9 numeric;
  v_success int := 0;
  v_fail int := 0;
  v_skipped int := 0;
  v_cap_skipped int := 0;
  v_auto_deleted int := 0;
  v_new_points int;
  v_pcl_10_delta int := 0;
  v_should_auto_delete boolean;
  v_pcl_current int;
  v_pcl_room int;
  v_pcl_used int := 0;
  v_input_count int;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  if p_card_ids is null or array_length(p_card_ids, 1) is null then
    return json_build_object('ok', false, 'error', '감정할 카드가 없어요.');
  end if;

  v_input_count := array_length(p_card_ids, 1);
  if v_input_count > 5000 then
    return json_build_object(
      'ok', false,
      'error', format(
        '한 번에 최대 5,000장까지 감별 가능 (요청 %s장). 나눠서 의뢰해 주세요.',
        v_input_count
      )
    );
  end if;

  select count(*)::int into v_pcl_current from psa_gradings where user_id = p_user_id;
  v_pcl_room := greatest(0, 20000 - v_pcl_current);

  foreach v_card_id in array p_card_ids loop
    v_idx := v_idx + 1;
    v_rarity := case
      when p_rarities is null then null
      when array_length(p_rarities, 1) >= v_idx then p_rarities[v_idx]
      else null
    end;

    if v_rarity is null or not is_pcl_eligible_rarity(v_rarity) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    select count into v_count from card_ownership
      where user_id = p_user_id and card_id = v_card_id for update;
    if not found or coalesce(v_count, 0) < 1 then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_roll := random() * 100;

    -- 감별 실패 (70%) → 카드 삭제 + skip.
    if v_roll < 70 then
      update card_ownership set count = count - 1, last_pulled_at = now()
        where user_id = p_user_id and card_id = v_card_id;
      delete from card_ownership
        where user_id = p_user_id and card_id = v_card_id and count = 0;
      v_fail := v_fail + 1;
      continue;
    end if;

    v_threshold_9 := case when v_rarity = 'MUR' then 99.9 else 99.7 end;

    v_grade := case
      when v_roll < 78            then 6
      when v_roll < 88            then 7
      when v_roll < 96            then 8
      when v_roll < v_threshold_9 then 9
      else 10
    end;

    -- 자동 삭제 분기 (이전: 자동 판매). spec: "판매 → 삭제" 일원화.
    -- 포인트 지급 / payout 계산 X. 카드 inventory 만 차감하고 다음으로.
    v_should_auto_delete :=
      p_auto_sell_below_grade is not null
      and v_grade < p_auto_sell_below_grade;

    if v_should_auto_delete then
      update card_ownership set count = count - 1, last_pulled_at = now()
        where user_id = p_user_id and card_id = v_card_id;
      delete from card_ownership
        where user_id = p_user_id and card_id = v_card_id and count = 0;
      v_auto_deleted := v_auto_deleted + 1;
      continue;
    end if;

    -- PCL 슬랩 저장 — 한도 초과 시 카드는 그대로 남기고 cap_skipped.
    if v_pcl_used >= v_pcl_room then
      v_cap_skipped := v_cap_skipped + 1;
      continue;
    end if;

    update card_ownership set count = count - 1, last_pulled_at = now()
      where user_id = p_user_id and card_id = v_card_id;
    delete from card_ownership
      where user_id = p_user_id and card_id = v_card_id and count = 0;

    if v_grade = 10 then
      v_pcl_10_delta := v_pcl_10_delta + 1;
    end if;

    insert into psa_gradings (user_id, card_id, grade, rarity)
      values (p_user_id, v_card_id, v_grade, v_rarity);
    v_pcl_used := v_pcl_used + 1;
    v_success := v_success + 1;
  end loop;

  if v_pcl_10_delta > 0 then
    update users set pcl_10_wins = pcl_10_wins + v_pcl_10_delta
      where id = p_user_id;
  end if;

  -- 포인트 변동 없음 (판매 분기 폐기). 현재 잔액만 반환.
  select points into v_new_points from users where id = p_user_id;

  return json_build_object(
    'ok', true,
    -- results 배열 의도적으로 폐기 — 클라 BulkResults UI 도 단순화.
    'success_count', v_success,
    'fail_count', v_fail,
    'skipped_count', v_skipped,
    'cap_skipped_count', v_cap_skipped,
    'auto_deleted_count', v_auto_deleted,
    -- 호환 키 (구 클라 빌드 대비) — 항상 0.
    'auto_sold_count', 0,
    'auto_sold_earned', 0,
    'bonus', 0,
    'points', v_new_points
  );
end;
$$;

grant execute on function bulk_submit_pcl_grading(uuid, text[], text[], int) to anon, authenticated;

-- 폐기 — PCL 카드 판매 기능 제거 (spec 6-1).
drop function if exists bulk_sell_gradings(uuid, uuid[]);
drop function if exists pcl_sell_price(int);

notify pgrst, 'reload schema';
