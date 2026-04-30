-- ============================================================
-- 카드 보유 한도 상향:
--   · 일반 카드 (card_ownership.count 합)  100,000 → 200,000
--   · PCL 슬랩 (psa_gradings row 수)        20,000  → 100,000
--
-- 사용자 spec — 감별 입력 한도와 결과 저장 한도를 분리:
--   · 감별 입력은 일반 카드 기준 (200,000장까지 투입 가능)
--   · 감별 결과 PCL 저장은 PCL 한도 (100,000장)
--
-- 영향 함수 (다른 마이그레이션의 cap 정의를 같은 시점에 일괄 갱신):
--   1) record_pack_pulls_batch  — 박스 일괄 / persist (20260661 cap 100k)
--   2) record_pack_pull_v4      — 단건 박스 (20260661 cap 100k)
--   3) assert_pcl_cap           — 단건 감별 / fallback (20260556 cap 20k)
--   4) bulk_submit_pcl_grading  — sync 일괄 감별 (20260573 rename)
--   5) process_grading_job_chunk — 비동기 chunk 감별 (20260667 cap 20k)
--
-- 클라 sync (별도 commit):
--   src/lib/limits.ts — CARD_CAP=200000, PCL_CAP=100000.
--   서버↔클라 cap 불일치 방지 — 본 파일의 hardcoded 와 limits.ts 가
--   sync 되어야 함.
-- ============================================================

-- ── 1) 일반 카드 cap 200,000 — record_pack_pulls_batch (박스 일괄) ──
create or replace function record_pack_pulls_batch(
  p_user_id uuid,
  p_set_code text,
  p_pulls jsonb,
  p_auto_sell_rarities text[]
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pack_count int;
  v_total_kept int := 0;
  v_total_deleted int := 0;
  v_current int;
  v_new_points int;
  v_kept_card_ids text[];
begin
  set local statement_timeout = '60s';

  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  if p_pulls is null or jsonb_typeof(p_pulls) <> 'array' then
    return json_build_object('ok', false, 'error', '팩 데이터가 없어요.');
  end if;

  v_pack_count := jsonb_array_length(p_pulls);
  if v_pack_count = 0 then
    return json_build_object('ok', false, 'error', '팩 데이터가 비어 있어요.');
  end if;

  with packs as (
    select pack_obj
      from jsonb_array_elements(p_pulls) as t(pack_obj)
  ),
  flattened as (
    select
      c.card_id,
      r.rarity
    from packs p
    cross join lateral (
      select value::text as card_id, ord as idx
      from jsonb_array_elements_text(p.pack_obj->'card_ids') with ordinality as t(value, ord)
    ) c
    cross join lateral (
      select value::text as rarity, ord as idx
      from jsonb_array_elements_text(p.pack_obj->'rarities') with ordinality as t(value, ord)
    ) r
    where c.idx = r.idx
  ),
  classified as (
    select
      card_id,
      rarity,
      not (p_auto_sell_rarities is not null and rarity = any(p_auto_sell_rarities)) as is_kept
    from flattened
  )
  select
    coalesce(array_agg(card_id) filter (where is_kept), '{}'::text[]),
    coalesce(count(*) filter (where is_kept), 0)::int,
    coalesce(count(*) filter (where not is_kept), 0)::int
    into v_kept_card_ids, v_total_kept, v_total_deleted
    from classified;

  select coalesce(sum(count), 0)::int
    into v_current
    from card_ownership
   where user_id = p_user_id;
  if v_current + v_total_kept > 200000 then
    raise exception
      '일반 카드 보유 한도 초과 — 현재 %장 / 200,000장. 카드지갑 정리(감별/일괄 삭제) 후 다시 시도하세요.',
      v_current
      using errcode = 'P0001';
  end if;

  insert into pack_opens (user_id, set_code)
  select p_user_id, p_set_code
    from generate_series(1, v_pack_count);

  if v_total_kept > 0 then
    insert into card_ownership (user_id, card_id, count, last_pulled_at)
    select p_user_id, c, count(*)::int, now()
      from unnest(v_kept_card_ids) as c
     group by c
    on conflict (user_id, card_id) do update
      set count = card_ownership.count + excluded.count,
          last_pulled_at = now();
  end if;

  select points into v_new_points from users where id = p_user_id;

  return json_build_object('ok', true,
    'pack_count', v_pack_count,
    'total_kept', v_total_kept,
    'total_sold_count', v_total_deleted,
    'total_sold_earned', 0,
    'total_deleted_count', v_total_deleted,
    'points', v_new_points);
end;
$$;

grant execute on function record_pack_pulls_batch(uuid, text, jsonb, text[]) to anon, authenticated;

-- ── 2) 일반 카드 cap 200,000 — record_pack_pull_v4 (단건 박스) ──
create or replace function record_pack_pull_v4(
  p_user_id uuid,
  p_set_code text,
  p_card_ids text[],
  p_rarities text[],
  p_auto_sell_sub_ar boolean
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pack_id uuid;
  v_current int;
  v_kept_count int := 0;
  v_deleted_count int := 0;
  v_new_points int;
  v_total int;
  v_idx int;
  v_kept_ids text[] := array[]::text[];
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  v_total := coalesce(array_length(p_card_ids, 1), 0);
  if v_total = 0 then
    return json_build_object('ok', false, 'error', '카드가 없어요.');
  end if;
  if p_rarities is null or coalesce(array_length(p_rarities, 1), 0) <> v_total then
    return json_build_object('ok', false, 'error', '레어도 정보가 일치하지 않아요.');
  end if;

  for v_idx in 1..v_total loop
    if p_auto_sell_sub_ar and is_sub_ar(p_rarities[v_idx]) then
      v_deleted_count := v_deleted_count + 1;
    else
      v_kept_ids := v_kept_ids || p_card_ids[v_idx];
      v_kept_count := v_kept_count + 1;
    end if;
  end loop;

  select coalesce(sum(count), 0)::int
    into v_current
    from card_ownership
   where user_id = p_user_id;

  if v_current + v_kept_count > 200000 then
    raise exception
      '일반 카드 보유 한도 초과 — 현재 %장 / 200,000장. 카드지갑 정리(감별/일괄 삭제) 후 다시 시도하세요.',
      v_current
      using errcode = 'P0001';
  end if;

  insert into pack_opens (user_id, set_code)
    values (p_user_id, p_set_code)
    returning id into v_pack_id;

  if v_kept_count > 0 then
    insert into card_ownership (user_id, card_id, count, last_pulled_at)
    select p_user_id, c, count(*)::int, now()
      from unnest(v_kept_ids) as c
     group by c
    on conflict (user_id, card_id) do update
      set count = card_ownership.count + excluded.count,
          last_pulled_at = now();
  end if;

  select points into v_new_points from users where id = p_user_id;

  return json_build_object('ok', true,
    'pack_open_id', v_pack_id,
    'sold_count', v_deleted_count,
    'sold_earned', 0,
    'deleted_count', v_deleted_count,
    'kept_count', v_kept_count,
    'points', v_new_points);
end;
$$;

grant execute on function record_pack_pull_v4(uuid, text, text[], text[], boolean) to anon, authenticated;

-- ── 3) PCL cap 100,000 — assert_pcl_cap (단건 감별 helper) ──
create or replace function assert_pcl_cap(p_user_id uuid, p_incoming int)
returns void
language plpgsql
as $$
declare
  v_current int;
begin
  select count(*)::int into v_current
    from psa_gradings
   where user_id = p_user_id;
  if v_current + p_incoming > 100000 then
    raise exception
      'PCL 카드 보유 한도 초과 — 현재 %장 / 100,000장. 카드지갑에서 PCL 슬랩을 정리한 뒤 다시 시도하세요.',
      v_current
      using errcode = 'P0001';
  end if;
end;
$$;

-- ── 4) PCL cap 100,000 — process_grading_job_chunk (비동기 chunk) ──
-- 20260667 정의에서 v_pcl_room 의 cap 만 20,000 → 100,000 으로 갱신.
-- 본문은 동일 (set-based CTE 처리 그대로).
create or replace function process_grading_job_chunk(
  p_job_id uuid,
  p_max_per_chunk int default 5000
) returns json
language plpgsql
security definer
set search_path = public, extensions
set statement_timeout = '180s'
as $$
declare
  v_job grading_jobs%rowtype;
  v_end int;
  v_user_id uuid;
  v_pcl_current int;
  v_pcl_room int;
  v_auto_sell int;
  v_chunk_card_ids text[];
  v_chunk_rarities text[];
  v_local_success int := 0;
  v_local_fail int := 0;
  v_local_skipped int := 0;
  v_local_cap int := 0;
  v_local_deleted int := 0;
  v_local_pcl10 int := 0;
begin
  select * into v_job from grading_jobs where id = p_job_id for update;
  if not found then
    return json_build_object('ok', false, 'error', '잡을 찾을 수 없어요.');
  end if;
  if v_job.status not in ('pending', 'processing') then
    return json_build_object(
      'ok', true, 'job_id', p_job_id, 'status', v_job.status,
      'cursor', v_job.cursor, 'total', v_job.total_count,
      'success_count', v_job.success_count,
      'fail_count', v_job.fail_count,
      'skipped_count', v_job.skipped_count,
      'cap_skipped_count', v_job.cap_skipped_count,
      'auto_deleted_count', v_job.auto_deleted_count
    );
  end if;

  v_user_id := v_job.user_id;
  v_auto_sell := v_job.auto_sell_below_grade;

  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  if v_job.status = 'pending' then
    update grading_jobs set status = 'processing', started_at = now()
      where id = p_job_id;
  end if;

  v_end := least(v_job.cursor + p_max_per_chunk, v_job.total_count);

  v_chunk_card_ids := v_job.input_card_ids[v_job.cursor + 1 : v_end];
  v_chunk_rarities := v_job.input_rarities[v_job.cursor + 1 : v_end];

  if coalesce(array_length(v_chunk_card_ids, 1), 0) = 0 then
    update grading_jobs
       set cursor = v_end,
           updated_at = now(),
           status = case when v_end >= total_count then 'completed' else 'processing' end,
           completed_at = case when v_end >= total_count then now() else null end
     where id = p_job_id
     returning * into v_job;
    return json_build_object(
      'ok', true, 'job_id', p_job_id, 'status', v_job.status,
      'cursor', v_job.cursor, 'total', v_job.total_count,
      'success_count', v_job.success_count,
      'fail_count', v_job.fail_count,
      'skipped_count', v_job.skipped_count,
      'cap_skipped_count', v_job.cap_skipped_count,
      'auto_deleted_count', v_job.auto_deleted_count
    );
  end if;

  -- ▶ PCL 한도 100,000 (이전 20,000) — 사용자 spec: 일반 200k / PCL 100k.
  select count(*)::int into v_pcl_current from psa_gradings
    where user_id = v_user_id;
  v_pcl_room := greatest(0, 100000 - v_pcl_current);

  perform 1
    from card_ownership
   where user_id = v_user_id
     and card_id = any(v_chunk_card_ids)
   for update;

  with chunk as (
    select
      i,
      v_chunk_card_ids[i] as card_id,
      v_chunk_rarities[i] as rarity,
      random() * 100.0 as roll
    from generate_series(1, array_length(v_chunk_card_ids, 1)) i
  ),
  numbered as (
    select c.*,
           row_number() over (partition by card_id order by i) as occ
    from chunk c
  ),
  with_avail as (
    select n.*,
           coalesce(co.count, 0) as available
    from numbered n
    left join card_ownership co
      on co.user_id = v_user_id
     and co.card_id = n.card_id
  ),
  classified as (
    select i, card_id, rarity, roll, occ, available,
      case
        when rarity is null or not is_pcl_eligible_rarity(rarity) then 'skip_elig'
        when occ > available then 'skip_insuf'
        when roll < 70 then 'fail'
        when roll < 78 then 'g6'
        when roll < 88 then 'g7'
        when roll < 96 then 'g8'
        when roll < (case when rarity = 'MUR' then 99.9 else 99.7 end) then 'g9'
        else 'g10'
      end as raw_outcome,
      case
        when rarity is null or not is_pcl_eligible_rarity(rarity) then null
        when occ > available then null
        when roll < 70 then null
        when roll < 78 then 6
        when roll < 88 then 7
        when roll < 96 then 8
        when roll < (case when rarity = 'MUR' then 99.9 else 99.7 end) then 9
        else 10
      end as grade
    from with_avail
  ),
  with_auto as (
    select c.*,
      case
        when c.raw_outcome like 'g%'
          and v_auto_sell is not null
          and c.grade < v_auto_sell
          then 'auto_del'
        else c.raw_outcome
      end as outcome2
    from classified c
  ),
  with_cap as (
    select w.*,
      sum(case when outcome2 like 'g%' then 1 else 0 end)
        over (order by i rows between unbounded preceding and 1 preceding)
        as prior_inserts
    from with_auto w
  ),
  final as (
    select c.*,
      case
        when outcome2 like 'g%' and coalesce(prior_inserts, 0) >= v_pcl_room
          then 'cap'
        else outcome2
      end as outcome
    from with_cap c
  ),
  totals as (
    select
      count(*) filter (where outcome like 'g%')             as success_count,
      count(*) filter (where outcome = 'fail')              as fail_count,
      count(*) filter (where outcome in ('skip_elig','skip_insuf')) as skipped_count,
      count(*) filter (where outcome = 'cap')               as cap_count,
      count(*) filter (where outcome = 'auto_del')          as deleted_count,
      count(*) filter (where outcome = 'g10')               as pcl10_count
    from final
  ),
  consumed as (
    select card_id, count(*)::int as n
      from final
     where outcome in ('fail','auto_del','g6','g7','g8','g9','g10')
     group by card_id
  ),
  upd as (
    update card_ownership co
       set count = co.count - c.n,
           last_pulled_at = now()
      from consumed c
     where co.user_id = v_user_id
       and co.card_id = c.card_id
       and co.count - c.n > 0
     returning co.card_id
  ),
  del as (
    delete from card_ownership co
     using consumed c
     where co.user_id = v_user_id
       and co.card_id = c.card_id
       and co.count - c.n <= 0
  ),
  ins as (
    insert into psa_gradings (user_id, card_id, grade, rarity)
    select v_user_id, card_id, grade, rarity
      from final
     where outcome in ('g6','g7','g8','g9','g10')
  )
  select
    coalesce(t.success_count, 0),
    coalesce(t.fail_count, 0),
    coalesce(t.skipped_count, 0),
    coalesce(t.cap_count, 0),
    coalesce(t.deleted_count, 0),
    coalesce(t.pcl10_count, 0)
    into v_local_success, v_local_fail, v_local_skipped,
         v_local_cap, v_local_deleted, v_local_pcl10
  from totals t;

  if v_local_pcl10 > 0 then
    update users set pcl_10_wins = pcl_10_wins + v_local_pcl10
      where id = v_user_id;
  end if;

  update grading_jobs
     set cursor = v_end,
         success_count = success_count + v_local_success,
         fail_count = fail_count + v_local_fail,
         skipped_count = skipped_count + v_local_skipped,
         cap_skipped_count = cap_skipped_count + v_local_cap,
         auto_deleted_count = auto_deleted_count + v_local_deleted,
         updated_at = now(),
         status = case when v_end >= total_count then 'completed' else 'processing' end,
         completed_at = case when v_end >= total_count then now() else null end
   where id = p_job_id
   returning * into v_job;

  return json_build_object(
    'ok', true, 'job_id', p_job_id, 'status', v_job.status,
    'cursor', v_job.cursor, 'total', v_job.total_count,
    'success_count', v_job.success_count,
    'fail_count', v_job.fail_count,
    'skipped_count', v_job.skipped_count,
    'cap_skipped_count', v_job.cap_skipped_count,
    'auto_deleted_count', v_job.auto_deleted_count
  );
end;
$$;

grant execute on function process_grading_job_chunk(uuid, int) to anon, authenticated;

-- ── 5) PCL cap 100,000 — bulk_submit_pcl_grading (sync 일괄, alias) ──
-- 20260573 가 bulk_submit_psa_grading → bulk_submit_pcl_grading 으로 rename.
-- 20260556 의 v_pcl_room 계산만 20000 → 100000 으로 갱신.
-- 본문 나머지는 그대로 유지 (sync 경로가 신규 호출엔 거의 안 쓰이지만
-- 잔존 호출 대비 cap 일관성).
create or replace function bulk_submit_pcl_grading(
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

  select count(*)::int into v_pcl_current from psa_gradings where user_id = p_user_id;
  v_pcl_room := greatest(0, 100000 - v_pcl_current);

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

grant execute on function bulk_submit_pcl_grading(uuid, text[], text[], int) to anon, authenticated;

notify pgrst, 'reload schema';
