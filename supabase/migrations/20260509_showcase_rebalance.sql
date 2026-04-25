-- ============================================================
-- Showcase rebalance — lower defense and adjust prices.
--
-- Defense:
--   basic     5%  → 3%
--   glass     12% → 5%
--   premium   22% → 10%
--   legendary 28% → 15%
--
-- Price:
--   basic     20,000   →   10,000
--   glass     70,000   →  100,000
--   premium   250,000  →  300,000
--   legendary 700,000  → 1,000,000
--
-- Sabotage success rate stays max(0, 0.30 - defense), so effective
-- attack success becomes ~27% / 25% / 20% / 15% by tier.
-- ============================================================

create or replace function showcase_defense(p_type text) returns numeric
language sql immutable as $$
  select case p_type
    when 'basic'     then 0.03
    when 'glass'     then 0.05
    when 'premium'   then 0.10
    when 'legendary' then 0.15
    else 0.00
  end
$$;

create or replace function showcase_price(p_type text) returns int
language sql immutable as $$
  select case p_type
    when 'basic'     then   10000
    when 'glass'     then  100000
    when 'premium'   then  300000
    when 'legendary' then 1000000
    else null
  end
$$;

notify pgrst, 'reload schema';
