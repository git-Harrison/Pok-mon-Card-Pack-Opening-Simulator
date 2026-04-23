-- Grant EXECUTE + table access to anon so the publishable key can reach
-- our RPCs and direct queries (wallet list, gifts list).
-- Security is enforced via SECURITY DEFINER functions that scope by user_id.

grant usage on schema public to anon, authenticated;

grant execute on function auth_signup(text, text, int) to anon, authenticated;
grant execute on function auth_login(text, text) to anon, authenticated;
grant execute on function record_pack_pull(uuid, text, text[]) to anon, authenticated;
grant execute on function gift_card(uuid, text, text) to anon, authenticated;

grant select on users to anon, authenticated;
grant select, insert, update, delete on pack_opens to anon, authenticated;
grant select, insert, update, delete on pulls to anon, authenticated;
grant select, insert, update, delete on card_ownership to anon, authenticated;
grant select, insert, update, delete on gifts to anon, authenticated;

-- Trigger PostgREST to reload its schema cache so new routes appear.
notify pgrst, 'reload schema';
