-- ============================================================
-- 감별 백그라운드 잡 인프라 — spec 3-2.
--
-- 사용자 스펙:
--   "페이지를 이탈하거나 모바일에서 다른 앱을 보고 돌아와도 감별이
--    멈추지 않아야 한다. 다시 접속하면 진행 상태 또는 완료 결과를
--    확인할 수 있어야 한다. job id 반환 + 상태 조회 API + 작업 상태
--    pending/processing/completed/failed."
--
-- 설계:
--   · grading_jobs 테이블 — 감별 작업 메타 + 누적 카운트 + 작업 큐.
--   · enqueue_grading_job (user, auto_sell_below) → job_id (status=pending).
--     스냅샷 시점의 PCL-eligible 카드 ID/희귀도 배열을 input_card_ids /
--     input_rarities 에 저장. 5,000장 단위 청크로 분할 처리.
--   · process_grading_job_chunk (job_id) → 다음 5,000장 처리, status
--     갱신. 완료 시 status='completed'.
--   · get_grading_job (job_id) → 현재 상태 조회 (폴링용).
--   · get_active_grading_job (user) → 페이지 재진입 시 진행 중 잡 확인.
--
-- 진정한 background (pg_cron / Edge Function) 가 아닌 "resumable
-- client-driven" 패턴 — 청크 단위 trigger 는 클라가 호출하지만 매
-- 청크가 transactional 이라 페이지 닫혀도 누적은 유지. 다시 열면
-- get_active_grading_job 으로 잡 확인 후 process_chunk 재개.
-- ============================================================

create table if not exists grading_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','processing','completed','failed','cancelled')),
  -- 입력 스냅샷 (잡 생성 시점의 카드 인벤토리 평탄화).
  input_card_ids text[] not null,
  input_rarities text[] not null,
  total_count int not null,
  -- 진행도 — process_chunk 마다 cursor 만큼 증가.
  cursor int not null default 0,
  -- 누적 결과 카운트.
  success_count int not null default 0,
  fail_count int not null default 0,
  skipped_count int not null default 0,
  cap_skipped_count int not null default 0,
  auto_deleted_count int not null default 0,
  -- 옵션 — 자동 삭제 임계 등급.
  auto_sell_below_grade int,
  -- 에러 메시지 (failed 일 때).
  error_message text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists grading_jobs_user_status_idx
  on grading_jobs(user_id, status, created_at desc);

create index if not exists grading_jobs_status_pending_idx
  on grading_jobs(status, created_at)
  where status in ('pending', 'processing');

-- ── enqueue_grading_job — 잡 생성 ──
-- 클라가 카드 ID/rarity 배열을 평탄화해서 넘기면 잡 한 건 등록.
-- 같은 사용자가 이미 진행 중인 잡이 있으면 거부.
create or replace function enqueue_grading_job(
  p_user_id uuid,
  p_card_ids text[],
  p_rarities text[],
  p_auto_sell_below_grade int default null
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_job_id uuid;
  v_total int;
  v_existing uuid;
begin
  if p_user_id is null then
    return json_build_object('ok', false, 'error', '인증 필요.');
  end if;
  if p_card_ids is null or coalesce(array_length(p_card_ids, 1), 0) = 0 then
    return json_build_object('ok', false, 'error', '감별할 카드가 없어요.');
  end if;
  if p_rarities is null
     or coalesce(array_length(p_rarities, 1), 0) <> coalesce(array_length(p_card_ids, 1), 0)
  then
    return json_build_object('ok', false, 'error', '카드와 희귀도 정보 길이 불일치.');
  end if;

  -- 기존 진행 중 잡 확인 — 1 user 1 active job 정책.
  select id into v_existing from grading_jobs
   where user_id = p_user_id and status in ('pending', 'processing')
   order by created_at desc
   limit 1;
  if v_existing is not null then
    return json_build_object('ok', false,
      'error', '이미 진행 중인 감별 작업이 있어요. 완료 후 다시 시도하세요.',
      'job_id', v_existing);
  end if;

  v_total := array_length(p_card_ids, 1);

  insert into grading_jobs (
    user_id, status, input_card_ids, input_rarities,
    total_count, auto_sell_below_grade
  ) values (
    p_user_id, 'pending', p_card_ids, p_rarities,
    v_total, p_auto_sell_below_grade
  ) returning id into v_job_id;

  return json_build_object('ok', true, 'job_id', v_job_id, 'total', v_total);
end;
$$;

grant execute on function enqueue_grading_job(uuid, text[], text[], int) to anon, authenticated;

-- ── process_grading_job_chunk — 청크 1개 처리 (default 5,000장) ──
-- 클라가 폴링하며 호출. 매 호출마다 cursor 부터 max_per_chunk 만큼
-- 처리, transactional 로 카운트 갱신. 완료 시 status='completed'.
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
  v_card_id text;
  v_rarity text;
  v_grade int;
  v_roll numeric;
  v_threshold_9 numeric;
  v_count int;
  v_should_auto_delete boolean;
  v_pcl_current int;
  v_pcl_room int;
  v_pcl_used int := 0;
  v_local_success int := 0;
  v_local_fail int := 0;
  v_local_skipped int := 0;
  v_local_cap int := 0;
  v_local_deleted int := 0;
  v_local_pcl10 int := 0;
  v_i int;
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

  perform pg_advisory_xact_lock(hashtext(v_job.user_id::text));

  if v_job.status = 'pending' then
    update grading_jobs set status = 'processing', started_at = now()
      where id = p_job_id;
    v_job.status := 'processing';
    v_job.started_at := now();
  end if;

  v_end := least(v_job.cursor + p_max_per_chunk, v_job.total_count);

  -- PCL 슬랩 한도 체크 (잡 시작 후 신규 슬랩이 다른 경로로 추가됐을
  -- 가능성 — 보수적으로 매 청크마다 재조회).
  select count(*)::int into v_pcl_current from psa_gradings
    where user_id = v_job.user_id;
  v_pcl_room := greatest(0, 20000 - v_pcl_current);

  v_i := v_job.cursor;
  while v_i < v_end loop
    v_card_id := v_job.input_card_ids[v_i + 1];  -- pg arrays are 1-indexed
    v_rarity := v_job.input_rarities[v_i + 1];

    if v_rarity is null or not is_pcl_eligible_rarity(v_rarity) then
      v_local_skipped := v_local_skipped + 1;
      v_i := v_i + 1;
      continue;
    end if;

    select count into v_count from card_ownership
      where user_id = v_job.user_id and card_id = v_card_id for update;
    if not found or coalesce(v_count, 0) < 1 then
      v_local_skipped := v_local_skipped + 1;
      v_i := v_i + 1;
      continue;
    end if;

    v_roll := random() * 100;

    if v_roll < 70 then
      update card_ownership set count = count - 1, last_pulled_at = now()
        where user_id = v_job.user_id and card_id = v_card_id;
      delete from card_ownership
        where user_id = v_job.user_id and card_id = v_card_id and count = 0;
      v_local_fail := v_local_fail + 1;
      v_i := v_i + 1;
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

    v_should_auto_delete :=
      v_job.auto_sell_below_grade is not null
      and v_grade < v_job.auto_sell_below_grade;

    if v_should_auto_delete then
      update card_ownership set count = count - 1, last_pulled_at = now()
        where user_id = v_job.user_id and card_id = v_card_id;
      delete from card_ownership
        where user_id = v_job.user_id and card_id = v_card_id and count = 0;
      v_local_deleted := v_local_deleted + 1;
      v_i := v_i + 1;
      continue;
    end if;

    if v_pcl_used >= v_pcl_room then
      v_local_cap := v_local_cap + 1;
      v_i := v_i + 1;
      continue;
    end if;

    update card_ownership set count = count - 1, last_pulled_at = now()
      where user_id = v_job.user_id and card_id = v_card_id;
    delete from card_ownership
      where user_id = v_job.user_id and card_id = v_card_id and count = 0;

    if v_grade = 10 then
      v_local_pcl10 := v_local_pcl10 + 1;
    end if;

    insert into psa_gradings (user_id, card_id, grade, rarity)
      values (v_job.user_id, v_card_id, v_grade, v_rarity);
    v_pcl_used := v_pcl_used + 1;
    v_local_success := v_local_success + 1;
    v_i := v_i + 1;
  end loop;

  if v_local_pcl10 > 0 then
    update users set pcl_10_wins = pcl_10_wins + v_local_pcl10
      where id = v_job.user_id;
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

-- ── get_grading_job — 단일 잡 상태 조회 ──
create or replace function get_grading_job(p_job_id uuid)
returns json
language sql
stable
set search_path = public, extensions
as $$
  select case when id is null then null else json_build_object(
    'job_id', id,
    'user_id', user_id,
    'status', status,
    'cursor', cursor,
    'total', total_count,
    'success_count', success_count,
    'fail_count', fail_count,
    'skipped_count', skipped_count,
    'cap_skipped_count', cap_skipped_count,
    'auto_deleted_count', auto_deleted_count,
    'auto_sell_below_grade', auto_sell_below_grade,
    'error_message', error_message,
    'created_at', created_at,
    'started_at', started_at,
    'completed_at', completed_at
  ) end
  from grading_jobs
  where id = p_job_id;
$$;

grant execute on function get_grading_job(uuid) to anon, authenticated;

-- ── get_active_grading_job — 사용자의 진행 중 잡 (페이지 재진입용) ──
create or replace function get_active_grading_job(p_user_id uuid)
returns json
language sql
stable
set search_path = public, extensions
as $$
  select case when id is null then null else json_build_object(
    'job_id', id,
    'user_id', user_id,
    'status', status,
    'cursor', cursor,
    'total', total_count,
    'success_count', success_count,
    'fail_count', fail_count,
    'skipped_count', skipped_count,
    'cap_skipped_count', cap_skipped_count,
    'auto_deleted_count', auto_deleted_count,
    'auto_sell_below_grade', auto_sell_below_grade,
    'error_message', error_message,
    'created_at', created_at,
    'started_at', started_at,
    'completed_at', completed_at
  ) end
  from (
    select * from grading_jobs
     where user_id = p_user_id
       and status in ('pending', 'processing')
     order by created_at desc
     limit 1
  ) g;
$$;

grant execute on function get_active_grading_job(uuid) to anon, authenticated;

-- ── cancel_grading_job — 사용자가 명시적 취소 ──
-- 진행 중인 청크는 영향 없고, 완료된 cursor 까지만 처리됨.
create or replace function cancel_grading_job(p_job_id uuid, p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_job grading_jobs%rowtype;
begin
  select * into v_job from grading_jobs where id = p_job_id for update;
  if not found then
    return json_build_object('ok', false, 'error', '잡을 찾을 수 없어요.');
  end if;
  if v_job.user_id <> p_user_id then
    return json_build_object('ok', false, 'error', '본인 잡만 취소할 수 있어요.');
  end if;
  if v_job.status not in ('pending', 'processing') then
    return json_build_object('ok', false, 'error',
      format('이미 %s 상태인 잡은 취소할 수 없어요.', v_job.status));
  end if;
  update grading_jobs
     set status = 'cancelled', updated_at = now(), completed_at = now()
   where id = p_job_id;
  return json_build_object('ok', true, 'job_id', p_job_id);
end;
$$;

grant execute on function cancel_grading_job(uuid, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
