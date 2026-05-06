-- ============================================================
-- qwer1413 계정 — 모든 MUR 카드 종류별 PCL10 슬랩 1장씩 카드지갑 보충.
--
-- 정책 (20260689 hun all-mur seed 패턴 그대로):
--   · psa_gradings INSERT (grade=10, rarity='MUR') — 1 row per MUR card_id.
--   · 이미 같은 card_id 의 PCL10 슬랩 1장 이상 보유 시 skip (멱등).
--   · pokedex_entries / users.main_card_ids / main_cards_by_type /
--     gym_ownerships / showcases / showcase_cards 일절 미터치.
--   · pcl_10_wins += inserted_count (감별 누적 통계 일관성).
--
-- 1차/2차 속성은 card_types 테이블이 이미 보유 (20260703/20260704). 본
-- 시드는 슬랩 인스턴스만 생성 — 속성 매핑 자동 반영.
--
-- 의존성: 20260664 / 20260679 등 card_types 시드.
-- ============================================================

do $$
declare
  v_user_id uuid;
  v_inserted int;
begin
  select id into v_user_id from users where user_id = 'qwer1413';
  if not found then
    raise notice '[qwer1413 all-mur seed] user qwer1413 미존재 — skip';
    return;
  end if;

  with new_inserts as (
    insert into psa_gradings (user_id, card_id, grade, rarity)
    select v_user_id, ct.card_id, 10, 'MUR'
      from card_types ct
     where ct.rarity = 'MUR'
       and not exists (
         select 1 from psa_gradings g
          where g.user_id = v_user_id
            and g.card_id = ct.card_id
            and g.grade = 10
       )
    returning id
  )
  select count(*)::int into v_inserted from new_inserts;

  if v_inserted > 0 then
    update users
       set pcl_10_wins = coalesce(pcl_10_wins, 0) + v_inserted
     where id = v_user_id;
  end if;

  raise notice '[qwer1413 all-mur seed] %장 신규 INSERT (이미 보유한 MUR 은 skip)',
    v_inserted;
end $$;

-- 마이그레이션: 20260711_seed_qwer1413_all_mur_pcl10.sql
