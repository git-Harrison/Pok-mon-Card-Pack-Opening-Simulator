create or replace function is_psa_eligible_rarity(p_rarity text)
returns boolean
language sql
immutable
as $$
  select p_rarity in ('C', 'U', 'R', 'RR', 'AR', 'SR', 'MA', 'SAR', 'UR', 'MUR');
$$;
notify pgrst, 'reload schema';
