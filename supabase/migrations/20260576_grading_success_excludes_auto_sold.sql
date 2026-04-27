-- ============================================================
-- bulk_submit_pcl_grading: success_count 에서 auto_sold 분리.
--
-- 이전: auto_sell 분기와 save 분기 둘 다 v_success += 1.
--   → 결과 패널 "성공 N장" 에 자동판매 카드도 포함되어 사용자
--     혼동 ("나는 슬랩이 N장 생긴 줄 알았는데 실제로는 적음")
-- 이후: success_count 는 슬랩 저장된 카드만. auto_sold 는 별도
--   auto_sold_count 로 이미 분리되어 있어 그걸 그대로 사용.
--
-- 본문은 20260571 (5000 cap) + 20260568 (보너스 제거) 정합 그대로
-- 두고, auto_sell 분기의 v_success 증가 한 줄만 제거.
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
  v_total_payout int := 0;
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

    v_roll := random() * 100;

    if v_roll < 70 then
      update card_ownership set count = count - 1, last_pulled_at = now()
        where user_id = p_user_id and card_id = v_card_id;
      delete from card_ownership
        where user_id = p_user_id and card_id = v_card_id and count = 0;

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

    v_should_auto_sell :=
      p_auto_sell_below_grade is not null
      and v_grade < p_auto_sell_below_grade;

    if v_should_auto_sell then
      update card_ownership set count = count - 1, last_pulled_at = now()
        where user_id = p_user_id and card_id = v_card_id;
      delete from card_ownership
        where user_id = p_user_id and card_id = v_card_id and count = 0;

      v_sell_payout := pcl_sell_price(v_grade);
      v_auto_sold_count := v_auto_sold_count + 1;
      v_auto_sold_earned := v_auto_sold_earned + v_sell_payout;
      v_total_payout := v_total_payout + v_sell_payout;
      -- 자동판매는 success 가 아님 — slab 발급 안 했으므로.
      -- v_auto_sold_count 로 별도 노출.

      v_results := v_results || jsonb_build_object(
        'card_id', v_card_id, 'ok', true, 'failed', false,
        'grade', v_grade, 'bonus', 0,
        'auto_sold', true, 'sell_payout', v_sell_payout
      );
      continue;
    end if;

    if v_pcl_used >= v_pcl_room then
      v_cap_skipped := v_cap_skipped + 1;
      v_results := v_results || jsonb_build_object(
        'card_id', v_card_id, 'ok', false, 'error', 'pcl_cap',
        'grade', v_grade
      );
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

    v_results := v_results || jsonb_build_object(
      'card_id', v_card_id, 'ok', true, 'failed', false,
      'grade', v_grade, 'bonus', 0
    );
  end loop;

  if v_pcl_10_delta > 0 then
    update users set pcl_10_wins = pcl_10_wins + v_pcl_10_delta
      where id = p_user_id;
  end if;

  if v_total_payout > 0 then
    update users set points = points + v_total_payout
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
    'bonus', 0,
    'points', v_new_points
  );
end;
$$;

grant execute on function bulk_submit_pcl_grading(uuid, text[], text[], int) to anon, authenticated;

notify pgrst, 'reload schema';
