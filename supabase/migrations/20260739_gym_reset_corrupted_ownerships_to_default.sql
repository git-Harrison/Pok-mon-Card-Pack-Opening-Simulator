-- ============================================================
-- 손상된 방어덱(stale psa_gradings 참조) 가진 체육관 ownership 일괄 삭제
-- → default NPC 관장으로 복귀.
--
-- 배경:
--   gym_ownerships.defense_pet_ids 가 length 3 인데 그 중 하나 이상이
--   psa_gradings 에서 사라졌거나 owner-owned PCL10 이 아니면 "stale".
--   현재 정책 (20260686) 은 stale 시 resolve_gym_battle 이
--   'defender_deck_stale' 명시 에러로 도전을 차단함 — 점령자가
--   재셋업해야 풀림. 사용자 보고 (예: 뇌전 체육관) 에 따르면
--   재셋업되지 않고 방치된 ownership 이 누적 → 도전 자체 봉쇄.
--
--   사용자 요청: "지금 데이터 손상인 체육관 전부 default 관장으로
--   초기화". 일회성 데이터 정리 — 손상된 ownership 삭제하여
--   체육관을 NPC 기본 상태로 복귀.
--
-- 대상 (stale 정의 = resolve_gym_battle 검증과 동일):
--   defense_pet_ids 가 NOT NULL 이고 length=3 인데, 그 중 valid
--   (psa_gradings 존재 + owner-owned + grade=10) 가 3 개 미만인
--   gym_ownerships row.
--
-- 비대상:
--   · defense_pet_ids 가 NULL 인 ownership — "점령했지만 미셋업"
--     상태로 NPC 경로 (20260625) 가 정상 작동. 손상 아님.
--   · valid=3 인 ownership — 정상.
--
-- 영향:
--   · gym_ownerships row DELETE → UI 에 default NPC 관장 표시.
--   · captured_at / protection_until 손실 — 점령 자체가 reset.
--   · user_gym_medals 는 별도 테이블 (영구 업적, PK 보존) — 미영향.
--   · 진행 중 gym_challenges 는 force_cleanup_stale_gym_challenges
--     로 정리.
--
-- 멱등 — DELETE WHERE 조건이 stale 만 매칭. 재실행 시 0 행 영향.
-- ============================================================

do $$
declare
  v_row record;
  v_stale_count int := 0;
  v_deleted int := 0;
begin
  -- 1) 사전 진단 — 어떤 체육관이 손상됐는지 NOTICE 로그.
  raise notice '═══ 손상된 방어덱 스캔 ═══';
  for v_row in
    select o.gym_id,
           g.name as gym_name,
           g.type as gym_type,
           o.owner_user_id,
           u.display_name,
           coalesce(array_length(o.defense_pet_ids, 1), 0) as deck_len,
           (select count(*)::int from psa_gradings gd
             where gd.id = any(o.defense_pet_ids)
               and gd.user_id = o.owner_user_id
               and gd.grade = 10) as valid_count
      from gym_ownerships o
      join gyms g on g.id = o.gym_id
      left join users u on u.id = o.owner_user_id
     where o.defense_pet_ids is not null
       and coalesce(array_length(o.defense_pet_ids, 1), 0) = 3
  loop
    if v_row.valid_count <> 3 then
      v_stale_count := v_stale_count + 1;
      raise notice 'STALE: gym=% (% / %) | owner=% | valid=%/3',
        v_row.gym_id, v_row.gym_name, v_row.gym_type,
        coalesce(v_row.display_name, v_row.owner_user_id::text),
        v_row.valid_count;
    end if;
  end loop;
  raise notice '총 손상 체육관: %', v_stale_count;

  -- 2) 손상 ownership 삭제 → default NPC 로 복귀.
  delete from gym_ownerships o
   where o.defense_pet_ids is not null
     and coalesce(array_length(o.defense_pet_ids, 1), 0) = 3
     and (select count(*)::int from psa_gradings gd
           where gd.id = any(o.defense_pet_ids)
             and gd.user_id = o.owner_user_id
             and gd.grade = 10) <> 3;
  get diagnostics v_deleted = row_count;
  raise notice 'gym_ownerships 삭제: % 행 → default NPC 관장으로 복귀.', v_deleted;

  -- 3) 진행 중 challenge 정리.
  perform force_cleanup_stale_gym_challenges();
  raise notice '═══ 정리 완료 ═══';
end;
$$;

notify pgrst, 'reload schema';
