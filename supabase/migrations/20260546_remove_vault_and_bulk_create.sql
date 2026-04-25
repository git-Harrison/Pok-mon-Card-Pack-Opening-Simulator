-- ============================================================
-- 통합 보관함 제거 + 일괄 전시 다중 카드 신설
--
-- /center 의 통합 보관함('vault')을 폐기하고, 페이지 단계에서
-- 사용자가 빈 자리들을 한번에 전시(=박제)할 수 있는 새 RPC
-- bulk_create_showcases 를 도입한다.
--
-- 1) 기존 vault 데이터 정리
--    user_showcases.showcase_type = 'vault' 행을 모두 삭제.
--    showcase_cards 는 ON DELETE CASCADE 로 함께 사라지고,
--    그 슬랩들은 자동으로 "전시 안 된" 상태로 돌아온다.
--
-- 2) 카탈로그 헬퍼에서 'vault' 제거
--    showcase_price/capacity/defense/sabotage_cost 모두 vault에
--    대해 null 을 반환 → 더 이상 valid type 으로 취급되지 않음.
--
-- 3) 구버전 RPC bulk_display_pcl_slabs 폐기
--    호출 시 ok=false 를 돌려주는 안전한 no-op 으로 교체.
--
-- 4) 새 RPC bulk_create_showcases(p_user_id, p_type, p_grading_ids)
--    - 빈 자리 N 개를 left→right, top→bottom 으로 찾아
--      N 개의 user_showcases + showcase_cards 를 한 트랜잭션에서 생성.
--    - 슬랩은 PCL 9·10, 본인 소유, 미전시, 펫(main_card_ids)·도감·
--      대기중 선물 어디에도 묶여있지 않을 것을 검증한다.
--    - 총 비용 = N × showcase_price(p_type). 포인트 부족이면 ok:false.
--
-- 모든 DDL 은 idempotent — `create or replace function`.
-- ============================================================

-- 1) Vault 행 정리 (CASCADE 로 showcase_cards 도 함께 삭제)
delete from user_showcases where showcase_type = 'vault';

-- 2) 카탈로그 헬퍼 — vault 케이스 삭제
create or replace function showcase_price(p_type text) returns int
language sql immutable as $$
  select case p_type
    when 'basic'     then    10000
    when 'glass'     then   100000
    when 'premium'   then   300000
    when 'legendary' then  1000000
    else null
  end
$$;

create or replace function showcase_capacity(p_type text) returns int
language sql immutable as $$
  select case p_type
    when 'basic'     then 1
    when 'glass'     then 1
    when 'premium'   then 1
    when 'legendary' then 1
    else null
  end
$$;

create or replace function showcase_defense(p_type text) returns numeric
language sql immutable as $$
  select case p_type
    when 'basic'     then 0.03
    when 'glass'     then 0.05
    when 'premium'   then 0.10
    when 'legendary' then 0.15
    else 0.00
  end
$$;

create or replace function showcase_sabotage_cost(p_type text) returns int
language sql immutable as $$
  select floor(showcase_price(p_type) * 0.1)::int
$$;

-- 3) 구버전 일괄 전시 RPC — no-op 화 (호환성 유지)
create or replace function bulk_display_pcl_slabs(
  p_user_id uuid,
  p_showcase_id uuid
) returns json
language sql
security definer
set search_path = public, extensions
as $$
  select json_build_object(
    'ok', false,
    'error', '이 기능은 더 이상 지원되지 않아요. 페이지 상단의 "일괄 전시" 버튼을 사용하세요.'
  );
$$;

-- 4) 새 RPC: bulk_create_showcases
create or replace function bulk_create_showcases(
  p_user_id uuid,
  p_showcase_type text,
  p_grading_ids uuid[]
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_price int;
  v_count int;
  v_total_cost bigint;
  v_points int;
  v_new_points int;
  v_main_ids uuid[];
  v_grading record;
  v_used_cells int[];
  v_cell int;
  v_slot_x int;
  v_slot_y int;
  v_new_showcase uuid;
  v_created int := 0;
  v_total_cells constant int := 36; -- 6x6
begin
  if p_user_id is null then
    return json_build_object('ok', false, 'error', '요청이 올바르지 않아요.');
  end if;

  if p_showcase_type is null
     or p_showcase_type = 'vault'
     or showcase_price(p_showcase_type) is null then
    return json_build_object('ok', false, 'error', '존재하지 않는 보관함 종류예요.');
  end if;

  if p_grading_ids is null or array_length(p_grading_ids, 1) is null then
    return json_build_object('ok', false, 'error', '전시할 슬랩을 선택해 주세요.');
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  v_price := showcase_price(p_showcase_type);
  v_count := array_length(p_grading_ids, 1);
  v_total_cost := v_price::bigint * v_count;

  -- 사용자 / 잔고 / 펫 슬랩 ID 조회
  select points, coalesce(main_card_ids, '{}'::uuid[])
    into v_points, v_main_ids
  from users
  where id = p_user_id
  for update;
  if not found then
    return json_build_object('ok', false, 'error', '사용자를 찾을 수 없어요.');
  end if;
  if v_points < v_total_cost then
    return json_build_object('ok', false, 'error', '포인트가 부족해요.');
  end if;

  -- 빈 자리 개수가 충분한지 사전 검증
  select array_agg(slot_y * 6 + slot_x)
    into v_used_cells
    from user_showcases
   where user_id = p_user_id;
  v_used_cells := coalesce(v_used_cells, '{}'::int[]);
  if v_total_cells - coalesce(array_length(v_used_cells, 1), 0) < v_count then
    return json_build_object(
      'ok', false,
      'error', '빈 자리가 부족해요.'
    );
  end if;

  -- 슬랩 ID 들을 입력 순서대로 한 건씩 검증 + 빈 자리 채우기.
  -- LEFT JOIN 후 NULL 체크로 "타인의 슬랩" / "존재하지 않는 ID" 를 감지한다.
  for v_grading in
    select t.id as input_id, g.id, g.grade, g.card_id, g.user_id, t.ord
      from unnest(p_grading_ids) with ordinality as t(id, ord)
      left join psa_gradings g on g.id = t.id
     order by t.ord
  loop
    -- 존재 + 본인 소유 검증
    if v_grading.id is null or v_grading.user_id <> p_user_id then
      return json_build_object('ok', false, 'error', '소유하지 않은 슬랩이 포함돼 있어요.');
    end if;

    -- PCL 9·10 만 전시 가능
    if v_grading.grade not in (9, 10) then
      return json_build_object('ok', false, 'error', 'PCL 9·10 슬랩만 전시 가능해요.');
    end if;

    -- 펫 슬랩이면 거부
    if v_grading.id = any(v_main_ids) then
      return json_build_object('ok', false, 'error', '펫으로 등록된 슬랩은 전시할 수 없어요.');
    end if;

    -- 이미 전시 중이면 거부
    if exists (select 1 from showcase_cards sc where sc.grading_id = v_grading.id) then
      return json_build_object('ok', false, 'error', '이미 전시 중인 슬랩이 포함돼 있어요.');
    end if;

    -- 도감 등록 슬랩이면 거부
    if exists (
      select 1 from pokedex_entries pe
       where pe.user_id = p_user_id and pe.card_id = v_grading.card_id
    ) then
      return json_build_object('ok', false, 'error', '도감 등록 슬랩은 전시할 수 없어요.');
    end if;

    -- 대기 중 선물에 묶여있으면 거부
    if exists (
      select 1 from gifts gf
       where gf.grading_id = v_grading.id
         and gf.status = 'pending'
         and gf.expires_at > now()
    ) then
      return json_build_object('ok', false, 'error', '선물 대기 중인 슬랩이 포함돼 있어요.');
    end if;

    -- 다음 빈 셀 찾기 (left→right, top→bottom)
    v_cell := null;
    for i in 0 .. v_total_cells - 1 loop
      if not (i = any(v_used_cells)) then
        v_cell := i;
        exit;
      end if;
    end loop;
    if v_cell is null then
      return json_build_object('ok', false, 'error', '빈 자리가 부족해요.');
    end if;
    v_used_cells := v_used_cells || v_cell;
    v_slot_x := v_cell % 6;
    v_slot_y := v_cell / 6;

    -- 보관함 + 전시 카드 생성
    insert into user_showcases (user_id, showcase_type, slot_x, slot_y)
      values (p_user_id, p_showcase_type, v_slot_x, v_slot_y)
      returning id into v_new_showcase;

    insert into showcase_cards (showcase_id, slot_index, grading_id)
      values (v_new_showcase, 0, v_grading.id);

    v_created := v_created + 1;
  end loop;

  -- 포인트 차감
  update users set points = points - v_total_cost
    where id = p_user_id
    returning points into v_new_points;

  return json_build_object(
    'ok', true,
    'created_count', v_created,
    'total_cost', v_total_cost,
    'points', v_new_points
  );
end;
$$;

grant execute on function showcase_price(text) to anon, authenticated;
grant execute on function showcase_capacity(text) to anon, authenticated;
grant execute on function showcase_defense(text) to anon, authenticated;
grant execute on function showcase_sabotage_cost(text) to anon, authenticated;
grant execute on function bulk_display_pcl_slabs(uuid, uuid) to anon, authenticated;
grant execute on function bulk_create_showcases(uuid, text, uuid[]) to anon, authenticated;

notify pgrst, 'reload schema';
