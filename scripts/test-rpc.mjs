import { createClient } from "@supabase/supabase-js";

const client = createClient(
  "https://vdprfnhwdbrwdbjmbjfy.supabase.co",
  "sb_publishable_wYsTQ7Og_BeMclYN8ZFSNg_3EwX1GPB"
);

const { data, error } = await client.rpc("auth_login", {
  p_user_id: "hun",
  p_password: "hun94!@#",
});
console.log("data:", data);
console.log("error:", error);
