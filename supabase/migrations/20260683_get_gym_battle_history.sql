-- ============================================================
-- 체육관별 전투 기록 조회 RPC.
--
-- 사용자 spec — "체육관마다 누가 누구랑 싸웠고 누가 이겼는지 상대시간
-- 으로 간단히 보이게."
--
-- 기록 형식 (클라):
--   "1시간 전 / 점령자(패) VS 도전자(승)"  (도전자 승)
--   "15분 전 / 도전자(패) VS 점령자(승)"   (도전자 패)
--
-- 데이터 출처: gym_battle_logs (20260585 phase1 부터). result 컬럼 =
-- 'won'/'lost' (도전자 기준). abandoned 는 표시 X.
--
-- 본 RPC: gym_id 별 최신순 limit 건. challenger / defender 각자
-- users join 으로 display_name 가져옴 (defender_user_id NULL 이면
-- 기본 NPC 방어 — display_name null 로 두고 클라가 "기본 관장" 표시).
-- ============================================================

create or replace function get_gym_battle_history(
  p_gym_id text,
  p_limit int default 20
) returns json
language sql
stable
set search_path = public, extensions
as $$
  select coalesce(
    json_agg(
      json_build_object(
        'id', l.id,
        'result', l.result,
        'challenger_user_id', l.challenger_user_id,
        'challenger_display_name', uc.display_name,
        'defender_user_id', l.defender_user_id,
        'defender_display_name', ud.display_name,
        'ended_at', l.ended_at
      )
      order by l.ended_at desc
    ),
    '[]'::json
  )
  from (
    select * from gym_battle_logs
     where gym_id = p_gym_id
       and result in ('won', 'lost')
     order by ended_at desc
     limit greatest(1, least(coalesce(p_limit, 20), 100))
  ) l
  left join users uc on uc.id = l.challenger_user_id
  left join users ud on ud.id = l.defender_user_id;
$$;

grant execute on function get_gym_battle_history(text, int) to anon, authenticated;

notify pgrst, 'reload schema';
