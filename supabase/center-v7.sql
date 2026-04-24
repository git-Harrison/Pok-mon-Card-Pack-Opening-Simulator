-- ============================================================
-- CENTER v7 — lower showcase prices
--   basic     30,000 → 10,000
--   glass    100,000 → 30,000
--   premium  300,000 → 100,000
--   legendary 1,000,000 → 300,000
-- ============================================================

create or replace function showcase_price(p_type text) returns int
language sql immutable as $$
  select case p_type
    when 'basic'     then 10000
    when 'glass'     then 30000
    when 'premium'   then 100000
    when 'legendary' then 300000
    else null
  end
$$;

notify pgrst, 'reload schema';
