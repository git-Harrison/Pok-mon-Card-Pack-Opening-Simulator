-- ============================================================
-- 레거시 PSA 명명 → 현재 브랜드 PCL 로 RPC 함수 rename.
--
-- 클라이언트는 이미 `bulk_submit_pcl_grading` / `submit_pcl_grading` /
-- `is_pcl_eligible_rarity` 이름으로 호출하도록 갱신됨. 이 마이그레이션은
-- 새 이름 함수를 추가하고 기존 PSA 이름 함수를 drop 한다.
--
-- 본문은 직전 정의 (20260568 / 20260571 / 20260565) 에서 그대로 가져왔고
-- 함수 이름만 바꿨다. 함수 안의 `psa_gradings` 테이블 참조는 그대로
-- 유지 — 테이블 자체는 56개 과거 migration / FK 들이 참조 중이라 rename
-- 불가. bulk 안에서 호출하던 `is_psa_eligible_rarity` 는 새 이름
-- `is_pcl_eligible_rarity` 로 갱신.
-- ============================================================

-- ---------- is_pcl_eligible_rarity (전 10등급 허용) ----------
create or replace function is_pcl_eligible_rarity(p_rarity text)
returns boolean
language sql
immutable
as $$
  select p_rarity in ('C', 'U', 'R', 'RR', 'AR', 'SR', 'MA', 'SAR', 'UR', 'MUR');
$$;

grant execute on function is_pcl_eligible_rarity(text) to anon, authenticated;

-- ---------- submit_pcl_grading (단건) ----------
-- 보너스 적립 없음. 자동판매는 단건엔 없음 (bulk 만).
create or replace function submit_pcl_grading(
  p_user_id uuid,
  p_card_id text,
  p_rarity text default null
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_count int;
  v_grade int;
  v_roll numeric;
  v_new_points int;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  if p_rarity is null or not is_pcl_eligible_rarity(p_rarity) then
    return json_build_object(
      'ok', false,
      'error', '감별 가능한 카드 등급이 아닙니다.'
    );
  end if;

  perform assert_pcl_cap(p_user_id, 1);

  select count into v_count from card_ownership
    where user_id = p_user_id and card_id = p_card_id;
  if not found or coalesce(v_count, 0) < 1 then
    return json_build_object('ok', false, 'error', '보유하지 않은 카드입니다.');
  end if;

  update card_ownership set count = count - 1, last_pulled_at = now()
    where user_id = p_user_id and card_id = p_card_id;
  delete from card_ownership
    where user_id = p_user_id and card_id = p_card_id and count = 0;

  v_roll := random() * 100;

  if v_roll < 70 then
    return json_build_object('ok', true, 'failed', true);
  end if;

  v_grade := case
    when v_roll < 78   then 6
    when v_roll < 88   then 7
    when v_roll < 96   then 8
    when v_roll < 99.5 then 9
    else 10
  end;

  insert into psa_gradings (user_id, card_id, grade, rarity)
    values (p_user_id, p_card_id, v_grade, p_rarity);

  if v_grade = 10 then
    update users set pcl_10_wins = pcl_10_wins + 1 where id = p_user_id;
  end if;

  -- 보너스 포인트 적립 제거. 현재 포인트만 응답에 동봉.
  select points into v_new_points from users where id = p_user_id;

  return json_build_object('ok', true,
    'grade', v_grade,
    'bonus', 0,
    'points', v_new_points);
end;
$$;

grant execute on function submit_pcl_grading(uuid, text, text) to anon, authenticated;

-- ---------- bulk_submit_pcl_grading (일괄, 5,000장 cap) ----------
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
      v_success := v_success + 1;

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

-- ---------- 기존 PSA 이름 함수 drop ----------
-- 새 이름으로 동일 본문이 이미 존재하므로 안전하게 제거.
drop function if exists submit_psa_grading(uuid, text, text);
drop function if exists bulk_submit_psa_grading(uuid, text[], text[], int);
drop function if exists is_psa_eligible_rarity(text);

notify pgrst, 'reload schema';
