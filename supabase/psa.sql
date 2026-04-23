-- ============================================================
-- PSA grading migration
-- Idempotent: safe to re-run.
-- ============================================================

create table if not exists psa_gradings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  card_id text not null,
  grade int not null check (grade between 1 and 10),
  graded_at timestamptz not null default now()
);

create index if not exists psa_gradings_user_idx
  on psa_gradings(user_id, graded_at desc);

-- ------------------------------------------------------------
-- RPC: submit_psa_grading
-- Consumes 1 copy of the user's card, rolls a 1-10 grade with
-- a bell-ish distribution, and logs the result.
-- Probability table (total = 100%):
--   10  5%   9 12%   8 18%   7 22%   6 18%
--    5 12%   4  6%   3  4%   2  2%   1  1%
-- ------------------------------------------------------------
create or replace function submit_psa_grading(
  p_user_id uuid,
  p_card_id text
) returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_count int;
  v_grade int;
  v_roll numeric;
begin
  select count into v_count from card_ownership
    where user_id = p_user_id and card_id = p_card_id;
  if not found or coalesce(v_count, 0) < 1 then
    return json_build_object('ok', false, 'error', '보유하지 않은 카드입니다.');
  end if;

  update card_ownership set count = count - 1, last_pulled_at = now()
    where user_id = p_user_id and card_id = p_card_id;
  delete from card_ownership
    where user_id = p_user_id and card_id = p_card_id and count = 0;

  v_roll := random() * 100;
  v_grade := case
    when v_roll < 1 then 1
    when v_roll < 3 then 2
    when v_roll < 7 then 3
    when v_roll < 13 then 4
    when v_roll < 25 then 5
    when v_roll < 43 then 6
    when v_roll < 65 then 7
    when v_roll < 83 then 8
    when v_roll < 95 then 9
    else 10
  end;

  insert into psa_gradings (user_id, card_id, grade)
    values (p_user_id, p_card_id, v_grade);

  return json_build_object('ok', true, 'grade', v_grade);
end;
$$;

-- ------------------------------------------------------------
-- Grants
-- ------------------------------------------------------------
grant select, insert on psa_gradings to anon, authenticated;
grant execute on function submit_psa_grading(uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';
