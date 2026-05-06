-- ============================================================
-- 카드 dual-type 확장 — MUR 8장 재지정 + UR Pokémon 41장 보조 속성 추가.
--
-- 컨셉:
--   20260703 에서 MUR 만 보조 속성을 가질 수 있게 했으나, 사용자 요청
--   으로 MUR 의 1차/2차 를 새 사양으로 재지정하고 UR Pokémon 카드에도
--   보조 속성을 부여. 트레이너 / 에너지 / 굿즈 / 스타디움 UR (wild_type
--   null) 은 기존 호환성 유지 위해 미터치 (null/null 그대로 — 펫/먹이/
--   체육관 어디에도 사용 불가 상태 유지).
--
-- 적용 후 매칭 로직 (이미 either-type 으로 변경됨, 별도 함수 변경 X):
--   먹이주기  : SAR 1차만 / UR/MUR 1차 또는 2차 일치 시 사용 가능
--   체육관    : 위 동일
--   체육관 룰 : 두 속성 모두 체육관 속성과 다르면 거부 (룰 절대 유지)
--
-- MUR 8장 — 1차/2차 모두 재지정 (사용자 직접 지정):
--   m1l-092   메가루카리오     강철 / 격투
--   m1s-092   메가가디안       노말 / 페어리
--   m2-116    메가 리자몽 X    드래곤 / 비행
--   m2a-250   메가 망나뇽      비행 / 드래곤
--   m3-117    메가지가르데     땅 / 벌레
--   m4-120    메가 개굴닌자    독 / 악
--   sv11b-174 제크로무 ex      악 / 고스트
--   sv11w-174 레시라무         드래곤 / 페어리
--
-- UR 41장 — 1차 유지, 2차만 추가 (카드 컨셉 기반).
-- ============================================================

-- ── MUR 8장 — 1차/2차 모두 강제 재지정 ──
update card_types set wild_type = '강철',   wild_type_2 = '격투'   where card_id = 'm1l-092'   and rarity = 'MUR';
update card_types set wild_type = '노말',   wild_type_2 = '페어리' where card_id = 'm1s-092'   and rarity = 'MUR';
update card_types set wild_type = '드래곤', wild_type_2 = '비행'   where card_id = 'm2-116'    and rarity = 'MUR';
update card_types set wild_type = '비행',   wild_type_2 = '드래곤' where card_id = 'm2a-250'   and rarity = 'MUR';
update card_types set wild_type = '땅',     wild_type_2 = '벌레'   where card_id = 'm3-117'    and rarity = 'MUR';
update card_types set wild_type = '독',     wild_type_2 = '악'     where card_id = 'm4-120'    and rarity = 'MUR';
update card_types set wild_type = '악',     wild_type_2 = '고스트' where card_id = 'sv11b-174' and rarity = 'MUR';
update card_types set wild_type = '드래곤', wild_type_2 = '페어리' where card_id = 'sv11w-174' and rarity = 'MUR';

-- ── UR Pokémon 41장 — 2차 속성만 추가 (1차 유지) ──
-- s4a (Sword & Shield: VMAX Climax base set)
update card_types set wild_type_2 = '드래곤' where card_id = 's4a-327' and rarity = 'UR'; -- 무한다이노 V (독)
update card_types set wild_type_2 = '드래곤' where card_id = 's4a-328' and rarity = 'UR'; -- 무한다이노 VMAX (독)
update card_types set wild_type_2 = '강철'   where card_id = 's4a-329' and rarity = 'UR'; -- 자시안 V (페어리)
update card_types set wild_type_2 = '강철'   where card_id = 's4a-330' and rarity = 'UR'; -- 자마젠타 V (격투)

-- s6a (Eevee Heroes)
update card_types set wild_type_2 = '페어리' where card_id = 's6a-088' and rarity = 'UR'; -- 리피아 VMAX (풀)
update card_types set wild_type_2 = '페어리' where card_id = 's6a-089' and rarity = 'UR';
update card_types set wild_type_2 = '페어리' where card_id = 's6a-090' and rarity = 'UR'; -- 글레이시아 VMAX (얼음)
update card_types set wild_type_2 = '페어리' where card_id = 's6a-091' and rarity = 'UR';
update card_types set wild_type_2 = '노말'   where card_id = 's6a-092' and rarity = 'UR'; -- 님피아 VMAX (페어리)
update card_types set wild_type_2 = '노말'   where card_id = 's6a-093' and rarity = 'UR';
update card_types set wild_type_2 = '페어리' where card_id = 's6a-094' and rarity = 'UR'; -- 블래키 VMAX (악)
update card_types set wild_type_2 = '페어리' where card_id = 's6a-095' and rarity = 'UR';
update card_types set wild_type_2 = '악'     where card_id = 's6a-098' and rarity = 'UR'; -- 인텔리레온 (물)

-- s7r (Blue Sky Stream)
update card_types set wild_type_2 = '고스트' where card_id = 's7r-080' and rarity = 'UR'; -- 데기라스 VMAX (바위)
update card_types set wild_type_2 = '비행'   where card_id = 's7r-081' and rarity = 'UR'; -- 갸라도스 VMAX (물)
update card_types set wild_type_2 = '비행'   where card_id = 's7r-082' and rarity = 'UR'; -- 레쿠쟈 VMAX (드래곤)
update card_types set wild_type_2 = '비행'   where card_id = 's7r-083' and rarity = 'UR';
update card_types set wild_type_2 = '고스트' where card_id = 's7r-087' and rarity = 'UR'; -- 눈여아 (얼음)

-- s8ap (Skyscraping Perfect)
update card_types set wild_type_2 = '페어리' where card_id = 's8ap-030' and rarity = 'UR'; -- 뮤 (에스퍼)

-- s8b (VMAX Climax)
update card_types set wild_type_2 = '페어리' where card_id = 's8b-278' and rarity = 'UR'; -- 백마 버드렉스 VMAX (노말)
update card_types set wild_type_2 = '노말'   where card_id = 's8b-279' and rarity = 'UR'; -- 피카츄 VMAX (전기)
update card_types set wild_type_2 = '페어리' where card_id = 's8b-280' and rarity = 'UR'; -- 뮤 VMAX (에스퍼)
update card_types set wild_type_2 = '고스트' where card_id = 's8b-281' and rarity = 'UR'; -- 흑마 버드렉스 VMAX (노말)
update card_types set wild_type_2 = '악'     where card_id = 's8b-282' and rarity = 'UR'; -- 일격의 우라오스 VMAX (노말)
update card_types set wild_type_2 = '격투'   where card_id = 's8b-283' and rarity = 'UR'; -- 연격의 우라오스 VMAX (노말)
update card_types set wild_type_2 = '비행'   where card_id = 's8b-284' and rarity = 'UR'; -- 레쿠쟈 VMAX (드래곤)
update card_types set wild_type_2 = '드래곤' where card_id = 's8b-285' and rarity = 'UR'; -- 두랄루돈 VMAX (강철)

-- s9a (Star Birth)
update card_types set wild_type_2 = '비행'   where card_id = 's9a-112' and rarity = 'UR'; -- 이올브 VMAX (벌레)
update card_types set wild_type_2 = '격투'   where card_id = 's9a-113' and rarity = 'UR'; -- 가라르 불비달마 VMAX (노말)
update card_types set wild_type_2 = '노말'   where card_id = 's9a-114' and rarity = 'UR'; -- 피카츄 VMAX (전기)
update card_types set wild_type_2 = '고스트' where card_id = 's9a-115' and rarity = 'UR'; -- 킬가르도 VMAX (강철)

-- sv2a (151)
update card_types set wild_type_2 = '페어리' where card_id = 'sv2a-208' and rarity = 'UR'; -- 뮤 ex (에스퍼)

-- sv5a (Crimson Haze)
update card_types set wild_type_2 = '악'     where card_id = 'sv5a-094' and rarity = 'UR'; -- 블러드문 우르스루가 ex (땅)

-- sv8 (Super Electric Breaker)
update card_types set wild_type_2 = '노말'   where card_id = 'sv8-136' and rarity = 'UR'; -- 피카츄 ex (전기)

-- sv8a (Terastal Festival)
update card_types set wild_type_2 = '강철'   where card_id = 'sv8a-233' and rarity = 'UR'; -- 무쇠잎새 ex (풀)
update card_types set wild_type_2 = '페어리' where card_id = 'sv8a-234' and rarity = 'UR'; -- 초록가면 오거폰 ex (풀)
update card_types set wild_type_2 = '드래곤' where card_id = 'sv8a-235' and rarity = 'UR'; -- 굽이치는물결 ex (물)
update card_types set wild_type_2 = '노말'   where card_id = 'sv8a-236' and rarity = 'UR'; -- 피카츄 ex (전기)
update card_types set wild_type_2 = '강철'   where card_id = 'sv8a-237' and rarity = 'UR'; -- 테라파고스 ex (노말)

-- sv10 (Rocket Gang)
update card_types set wild_type_2 = '악'     where card_id = 'sv10-130' and rarity = 'UR'; -- 로켓단의 뮤츠ex (에스퍼)
update card_types set wild_type_2 = '비행'   where card_id = 'sv10-131' and rarity = 'UR'; -- 로켓단의 크로뱃ex (독)

notify pgrst, 'reload schema';

-- 마이그레이션: 20260704_card_dual_type_expand.sql
