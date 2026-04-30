-- ============================================================
-- 내 포켓몬 (스타터) — 신규 컨텐츠.
--
-- 컨셉: /my-pokemon 진입 시 풀스크린 뽑기 (최대 5회) → 캐릭터 1마리
-- 선택 → 별명 → LV1 등록. 1 user 1 row.
--
-- 종(species) 화이트리스트 — src/lib/wild/name-to-dex.ts 의 dex 번호와
-- 1:1 대응. 모든 sprite 는 PokeAPI Gen-5 BW 애니 GIF 로 렌더 (야생/체육관
-- 과 동일 시스템 wildSpriteUrl 재사용).
--   pikachu(25) / charmander(4) / squirtle(7) / bulbasaur(1) /
--   gastly(92) / dratini(147) / pidgey(16) / piplup(393) /
--   mew(151) / mewtwo(150)
-- ============================================================

create table if not exists user_starter (
  user_id   uuid primary key references users(id) on delete cascade,
  species   text not null,
  nickname  text not null,
  level     int  not null default 1,
  caught_at timestamptz not null default now()
);

create or replace function get_my_starter(p_user_id uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select json_build_object(
       'species',   s.species,
       'nickname',  s.nickname,
       'level',     s.level,
       'caught_at', s.caught_at
     )
       from user_starter s where s.user_id = p_user_id),
    null::json
  );
$$;

grant execute on function get_my_starter(uuid) to anon, authenticated;

create or replace function pick_my_starter(
  p_user_id  uuid,
  p_species  text,
  p_nickname text
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing user_starter%rowtype;
  v_clean text;
  v_allowed constant text[] := array[
    'pikachu','charmander','squirtle','bulbasaur',
    'gastly','dratini','pidgey','piplup','mew','mewtwo'
  ];
begin
  if p_species is null or not (p_species = any(v_allowed)) then
    return json_build_object('ok', false, 'error', '알 수 없는 포켓몬이에요.');
  end if;

  v_clean := nullif(btrim(coalesce(p_nickname, '')), '');
  if v_clean is null then
    return json_build_object('ok', false, 'error', '이름을 입력해주세요.');
  end if;
  if char_length(v_clean) > 12 then
    return json_build_object('ok', false, 'error', '이름은 12자 이하로 적어주세요.');
  end if;

  select * into v_existing from user_starter where user_id = p_user_id;
  if found then
    return json_build_object(
      'ok', false,
      'error', '이미 내 포켓몬을 정했어요.',
      'starter', json_build_object(
        'species',   v_existing.species,
        'nickname',  v_existing.nickname,
        'level',     v_existing.level,
        'caught_at', v_existing.caught_at
      )
    );
  end if;

  insert into user_starter (user_id, species, nickname, level)
    values (p_user_id, p_species, v_clean, 1);

  select * into v_existing from user_starter where user_id = p_user_id;
  return json_build_object(
    'ok', true,
    'starter', json_build_object(
      'species',   v_existing.species,
      'nickname',  v_existing.nickname,
      'level',     v_existing.level,
      'caught_at', v_existing.caught_at
    )
  );
end;
$$;

grant execute on function pick_my_starter(uuid, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
