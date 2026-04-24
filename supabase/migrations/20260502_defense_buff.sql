-- ============================================================
-- Showcase defense buff — raise defense so legendary feels safe.
-- basic  0%  → 5%
-- glass  2%  → 12%
-- premium 5% → 22%
-- legendary 10% → 28%
--
-- Sabotage success rate = max(0, 0.30 - defense%). So effective
-- success against legendary drops to ~2%, premium ~8%, glass ~18%,
-- basic ~25%.
-- ============================================================

create or replace function showcase_defense(p_type text) returns numeric
language sql immutable as $$
  select case p_type
    when 'basic'     then 0.05
    when 'glass'     then 0.12
    when 'premium'   then 0.22
    when 'legendary' then 0.28
    else 0.00
  end
$$;

notify pgrst, 'reload schema';
