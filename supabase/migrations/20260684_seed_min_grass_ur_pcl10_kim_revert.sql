-- ============================================================
-- 시드 대상 정정 — kim → min.
--
-- 사용자: "20260682 에서 kim 으로 추가했는데 사실 min 이 정답이었어."
--
-- 1) kim 카드지갑에서 풀속성 UR PCL10 슬랩 3장 (20260682 가 추가한 것)
--    제거. card_id 별로 가장 오래된 PCL10 슬랩 1장씩만 삭제 (멱등 +
--    혹시 이후 organic 으로 추가된 슬랩 보존).
-- 2) 같은 3장을 min 카드지갑에 추가.
-- 3) pcl_10_wins 카운터 양쪽 동기화 (kim 차감 / min 가산).
--
-- 정책 (20260682 와 동일):
--   · psa_gradings 만 변경 — 도감/펫/체육관/전시 자동 반영 X.
--
-- 멱등:
--   · kim: 해당 슬랩 없으면 skip (재실행 안전).
--   · min: 이미 보유 시 skip.
--
-- 의존성: 20260679 (card_types — sv8a/s6a 시드).
-- ============================================================

do $$
declare
  v_target_cards constant text[] := array[
    'sv8a-233',  -- 무쇠잎새 ex (UR / 풀)
    'sv8a-234',  -- 초록가면 오거폰 ex (골드) (UR / 풀)
    's6a-088'    -- 리피아 VMAX (UR / 풀)
  ];
  v_card_id text;
  v_kim_id uuid;
  v_min_id uuid;
  v_deleted int := 0;
  v_inserted int := 0;
  v_existing int;
  v_target_id uuid;
begin
  select id into v_kim_id from users where user_id = 'kim';
  select id into v_min_id from users where user_id = 'min';

  if v_min_id is null then
    raise notice '[seed revert] user min 미존재 — abort';
    return;
  end if;

  -- Step 1: kim 슬랩 제거 (card_id 별 가장 오래된 PCL10 1장).
  if v_kim_id is not null then
    foreach v_card_id in array v_target_cards loop
      select id into v_target_id
        from psa_gradings
       where user_id = v_kim_id
         and card_id = v_card_id
         and grade = 10
       order by graded_at asc
       limit 1;

      if v_target_id is not null then
        delete from psa_gradings where id = v_target_id;
        v_deleted := v_deleted + 1;
        raise notice '[seed revert] kim card=% PCL10 1장 삭제', v_card_id;
        v_target_id := null;
      else
        raise notice '[seed revert] kim card=% PCL10 슬랩 없음 — skip', v_card_id;
      end if;
    end loop;

    if v_deleted > 0 then
      update users
         set pcl_10_wins = greatest(0, coalesce(pcl_10_wins, 0) - v_deleted)
       where id = v_kim_id;
      raise notice '[seed revert] kim pcl_10_wins -%', v_deleted;
    end if;
  else
    raise notice '[seed revert] user kim 미존재 — kim 정리 skip';
  end if;

  -- Step 2: min 슬랩 추가 (멱등).
  foreach v_card_id in array v_target_cards loop
    -- 카탈로그 검증.
    if not exists (
      select 1 from card_types
       where card_id = v_card_id
         and rarity = 'UR'
         and wild_type = '풀'
    ) then
      raise notice '[seed revert] card_types 에 % (UR/풀) 없음 — skip', v_card_id;
      continue;
    end if;

    select count(*)::int into v_existing
      from psa_gradings
     where user_id = v_min_id
       and card_id = v_card_id
       and grade = 10;

    if v_existing >= 1 then
      raise notice '[seed revert] min card=% 이미 % 장 보유 — skip',
        v_card_id, v_existing;
      continue;
    end if;

    insert into psa_gradings (user_id, card_id, grade, rarity)
      values (v_min_id, v_card_id, 10, 'UR');

    v_inserted := v_inserted + 1;
    raise notice '[seed revert] min card=% PCL10 1장 추가', v_card_id;
  end loop;

  if v_inserted > 0 then
    update users
       set pcl_10_wins = coalesce(pcl_10_wins, 0) + v_inserted
     where id = v_min_id;
    raise notice '[seed revert] min pcl_10_wins +%', v_inserted;
  end if;

  raise notice '[seed revert] 완료 — kim 삭제 % / min 추가 %',
    v_deleted, v_inserted;
end $$;

notify pgrst, 'reload schema';
