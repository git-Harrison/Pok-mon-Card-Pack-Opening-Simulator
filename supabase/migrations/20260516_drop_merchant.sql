-- ============================================================
-- Drop merchant feature.
--
-- The 카드 상인 page was retired — too much overlap with bulk
-- sell + gifts and the inventory mechanic was confusing. This
-- removes the RPCs and the merchant_state table. Idempotent so
-- the CI ledger can re-apply if checksums change.
-- ============================================================

drop function if exists sell_to_merchant(uuid, text);
drop function if exists refresh_merchant(uuid, text, int);
drop function if exists get_merchant_state(uuid);

do $$
begin
  if exists (select 1 from pg_class where relname = 'merchant_state') then
    execute 'drop function if exists _merchant_recharge(merchant_state) cascade';
  end if;
exception when others then
  -- best effort
  null;
end $$;

drop table if exists merchant_state cascade;

notify pgrst, 'reload schema';
