-- ============================================================
-- CENTER v10 — every showcase holds exactly 1 slab
-- Tiers still differ by price + defense; capacity is unified.
-- Any slabs currently displayed in slot_index >= 1 are released
-- (the showcase_cards row is dropped; the underlying psa_gradings
-- row survives and surfaces in the owner's wallet again).
-- ============================================================

create or replace function showcase_capacity(p_type text) returns int
language sql immutable as $$
  select case p_type
    when 'basic'     then 1
    when 'glass'     then 1
    when 'premium'   then 1
    when 'legendary' then 1
    else null
  end
$$;

delete from showcase_cards where slot_index >= 1;

notify pgrst, 'reload schema';
