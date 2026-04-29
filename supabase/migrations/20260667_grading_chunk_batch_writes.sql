-- ============================================================
-- 감별 청크 처리 — set-based CTE 로 재작성. per-card 4 statement
-- (SELECT FOR UPDATE / UPDATE count-1 / DELETE 0 / INSERT psa_gradings)
-- 를 단일 CTE 체인 + bulk UPDATE/DELETE/INSERT 로 압축.
--
-- 배경 / 측정:
--   기존 process_grading_job_chunk 가 5,000장 chunk 안에서 카드마다
--   loop iteration 당 SQL 4문 발생. 모두 indexed 라 빠르긴 하나 1
--   chunk = ~10,000~20,000 statement → 초당 statement 한도에 걸려
--   chunk 1개에 1~4초. 50,000장 = 10 chunk × 250ms idle = 42~82초.
--
--   같은 사용자 의견 — "박스 50개 일괄 빨라진 거 좋다, 감별도 같이
--   해달라". 박스는 buy_box round-trip 50→1 로 단축한 게 핵심.
--   감별은 RPC round-trip 자체는 chunk 마다 1번이라 이미 적은데,
--   chunk 안 statement 수가 많아 자체 지연. 그래서 chunk 안을
--   set-based 로 합치는 방향.
--
-- 변경 — 동일 의미, 다른 구현:
--   1) 입력 chunk slice 를 generate_series + 배열 indexing 으로 row
--      형태 표시 (CTE chunk).
--   2) 같은 card_id 끼리 row_number() OVER (PARTITION BY card_id ORDER BY i)
--      로 occurrence index 매김 → "사용자가 가진 N장 안에서 N+1 번째
--      는 skip_insufficient" 정책 보존.
--   3) random()*100 1회만 호출 (CTE 컬럼). 점수 분포 동일.
--   4) outcome (skip_eligibility / skip_insufficient / fail / auto_delete /
--      cap / graded_<n>) 을 windowed CTE 로 결정. cap 은 i 순으로 누적
--      삽입 카운트가 v_pcl_room 도달하면 cap 처리.
--   5) outcomes CTE 로부터 단일 패스로:
--      - 카운트 집계 (success/fail/skip/cap/deleted/pcl10)
--      - card_ownership UPDATE (소비된 unique card_id 별 합)
--      - card_ownership DELETE (count → 0 인 행)
--      - psa_gradings INSERT (graded_* 만)
--   6) per-row jsonb_set 루프 / array_append O(N²) 없음.
--
-- 정확도 보존:
--   · random()*100 의 임계값 (70 / 78 / 88 / 96 / 99.7 / 99.9-MUR) 동일.
--   · is_pcl_eligible_rarity 사용 동일.
--   · auto_sell_below_grade NULL 시 적용 안 됨 동일.
--   · v_pcl_room (20,000 cap - 현재 슬랩 수) 계산 동일.
--   · pcl_10_wins 누적 동일.
--   · graded_at = now() (배치 INSERT 라 같은 timestamp — 의미 차이 미미).
--
-- 시그니처 / 호출 측 인터페이스 변경 없음. JSON 응답 스키마 그대로.
-- ============================================================

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
  -- 잡 lock + status 체크.
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

  -- 같은 사용자 동시 작업 직렬화.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  if v_job.status = 'pending' then
    update grading_jobs set status = 'processing', started_at = now()
      where id = p_job_id;
  end if;

  v_end := least(v_job.cursor + p_max_per_chunk, v_job.total_count);

  -- chunk slice (PG arrays 1-indexed).
  v_chunk_card_ids := v_job.input_card_ids[v_job.cursor + 1 : v_end];
  v_chunk_rarities := v_job.input_rarities[v_job.cursor + 1 : v_end];

  if coalesce(array_length(v_chunk_card_ids, 1), 0) = 0 then
    -- 빈 chunk — 잡 카운트만 갱신하고 완료 체크.
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

  -- PCL 슬랩 한도 (잡 시작 후 다른 경로로 슬랩 생긴 케이스 방어).
  select count(*)::int into v_pcl_current from psa_gradings
    where user_id = v_user_id;
  v_pcl_room := greatest(0, 20000 - v_pcl_current);

  -- 관련 card_ownership 행 LOCK — 같은 사용자 동시 wallet 변경 방어.
  -- 결과 row 는 사용 안 함 (잠금 목적).
  perform 1
    from card_ownership
   where user_id = v_user_id
     and card_id = any(v_chunk_card_ids)
   for update;

  -- ── 핵심: chunk 전체 outcome 결정을 단일 SQL 로 ──
  with chunk as (
    select
      i,
      v_chunk_card_ids[i] as card_id,
      v_chunk_rarities[i] as rarity,
      random() * 100.0 as roll
    from generate_series(1, array_length(v_chunk_card_ids, 1)) i
  ),
  -- 같은 card_id 의 chunk 안 N 번째 occurrence (1-based).
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
  -- auto_delete 적용 (auto_sell_below_grade 미설정 시 noop).
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
  -- cap 적용 — i 순으로 누적 슬랩 등재 카운트가 room 도달하면 cap.
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
  -- 1) 카운트 집계.
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
  -- 2) card_ownership 소비 집계 — fail / auto_del / graded_* 모두 카드 1장 소비.
  consumed as (
    select card_id, count(*)::int as n
      from final
     where outcome in ('fail','auto_del','g6','g7','g8','g9','g10')
     group by card_id
  ),
  -- 3) card_ownership UPDATE (남은 count > 0).
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
  -- 4) card_ownership DELETE (count -> 0).
  del as (
    delete from card_ownership co
     using consumed c
     where co.user_id = v_user_id
       and co.card_id = c.card_id
       and co.count - c.n <= 0
  ),
  -- 5) psa_gradings 일괄 INSERT (graded_* 만).
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

  -- pcl_10_wins 누적.
  if v_local_pcl10 > 0 then
    update users set pcl_10_wins = pcl_10_wins + v_local_pcl10
      where id = v_user_id;
  end if;

  -- 잡 카운트 갱신.
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

notify pgrst, 'reload schema';
