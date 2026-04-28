-- ============================================================
-- 진정한 background grading — pg_cron 으로 1분마다 pending/processing
-- grading_jobs 자동 전진. 사용자가 페이지 닫고 앱 완전히 종료해도
-- 서버가 알아서 청크 처리 → 다시 들어오면 완료 상태.
--
-- 이전 (20260618): client-driven polling. 모달 닫으면 청크 진행 정지.
-- 이번 변경: pg_cron 이 server-side 청크 worker 역할.
-- ============================================================

-- pg_cron 확장 — Supabase 는 기본 활성화 가능. 권한이 없는 환경에서는
-- 이 명령이 실패할 수 있으니 if not exists + exception block.
do $$
begin
  begin
    create extension if not exists pg_cron with schema extensions;
  exception when others then
    raise notice 'pg_cron extension not available — cron job 등록 skip. Supabase dashboard 에서 활성화 필요: Database → Extensions → pg_cron.';
    return;
  end;
end$$;

-- ── worker 함수: pending/processing 잡 1건 골라 1 chunk 전진 ──
-- 한 번에 1 잡씩 처리 — pg_cron 은 매 분 호출되므로 누적 잡은 분당
-- 1 청크 (5,000장) 진행. 동시 처리는 advisory lock 으로 serial 보장.
create or replace function process_grading_jobs_worker()
returns json
language plpgsql
security definer
set search_path = public, extensions
set statement_timeout = '180s'
as $$
declare
  v_job grading_jobs%rowtype;
  v_result json;
begin
  -- 가장 오래된 pending/processing 잡 1건만 — for update skip locked 로
  -- 다른 worker 와 경쟁 안 하게.
  select * into v_job
    from grading_jobs
   where status in ('pending', 'processing')
   order by created_at asc
   limit 1
   for update skip locked;

  if not found then
    return json_build_object('ok', true, 'processed', false, 'reason', 'no_active_jobs');
  end if;

  -- 청크 1개 전진. 기존 RPC 재사용 — security definer 라 권한 OK.
  v_result := process_grading_job_chunk(v_job.id, 5000);

  return json_build_object(
    'ok', true,
    'processed', true,
    'job_id', v_job.id,
    'detail', v_result
  );
end;
$$;

grant execute on function process_grading_jobs_worker() to anon, authenticated;

-- ── pg_cron 스케줄 등록 ──
-- 1분마다 worker 호출. 잡이 없으면 즉시 return, 있으면 1청크 전진.
do $$
begin
  -- 기존 같은 이름 잡 있으면 unschedule (idempotent re-run).
  begin
    perform extensions.cron.unschedule('grading_jobs_worker');
  exception when others then
    null; -- 처음 등록이면 unschedule 가 실패 — OK.
  end;

  -- 매 분 worker 호출. 환경에 따라 cron 미설치면 NOTICE 로만 종료.
  begin
    perform extensions.cron.schedule(
      'grading_jobs_worker',
      '* * * * *',
      $cmd$ select public.process_grading_jobs_worker(); $cmd$
    );
    raise notice 'pg_cron grading_jobs_worker scheduled (매 분).';
  exception when others then
    raise notice 'pg_cron schedule 실패 (% — Supabase Dashboard 에서 확장 활성화 필요).', sqlerrm;
  end;
end$$;

notify pgrst, 'reload schema';
