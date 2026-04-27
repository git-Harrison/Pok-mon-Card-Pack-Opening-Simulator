-- ============================================================
-- 사용자 요청 일회성 데이터 정리 — PCL 6, 7, 8 등급 슬랩 일괄 삭제.
--
-- 전제:
--   · 도감 등록 / 전시 / 펫 등록은 PCL 10 (또는 9·10) 만 가능하므로
--     6/7/8 은 showcase_cards / pokedex_entries / main_card_ids
--     어디에도 참조 안 됨.
--   · sabotage_logs 는 FK 없는 단순 기록 — 영향 없음.
--   · gifts 의 pending 항목만 PCL 6/7/8 슬랩을 가리킬 수 있어 사전
--     'expired' 처리 후 슬랩 삭제.
--
-- 사용자 보상 없이 소멸. 감별 RPC 의 등급 분포는 그대로라 향후
-- 새 PCL 6/7/8 이 정상 생성됨 (이번 작업은 현 시점 일회 wipe).
--
-- idempotent — 재실행 시 grade 6/7/8 슬랩 0개라 no-op.
-- ============================================================

do $$
declare
  v_pending_canceled int;
  v_slabs_deleted int;
begin
  -- 1) 진행 중 선물에 잠긴 PCL 6/7/8 슬랩 → expired 처리.
  with affected as (
    update gifts g
       set status = 'expired'
      from psa_gradings p
     where g.grading_id = p.id
       and p.grade in (6, 7, 8)
       and g.status = 'pending'
    returning g.id
  )
  select count(*)::int into v_pending_canceled from affected;

  -- 2) PCL 6/7/8 슬랩 일괄 삭제.
  with deleted as (
    delete from psa_gradings
     where grade in (6, 7, 8)
    returning id
  )
  select count(*)::int into v_slabs_deleted from deleted;

  raise notice 'PCL 6/7/8 정리 완료 — pending gifts %건 expired 처리, slab %건 삭제',
    v_pending_canceled, v_slabs_deleted;
end;
$$;
