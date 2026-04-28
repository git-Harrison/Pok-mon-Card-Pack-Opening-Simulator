import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  "https://vdprfnhwdbrwdbjmbjfy.supabase.co",
  "sb_publishable_wYsTQ7Og_BeMclYN8ZFSNg_3EwX1GPB"
);

async function call(label, promise) {
  const { data, error } = await promise;
  if (error) {
    console.log(`✗ ${label}:`, error.message);
    return null;
  }
  console.log(`✓ ${label}:`, JSON.stringify(data).slice(0, 120));
  return data;
}

// 1. Login as hun
const login = await call(
  "login hun",
  sb.rpc("auth_login", { p_user_id: "hun", p_password: "hun94!@#" })
);
const hunId = login?.user?.id;

// 2. Login as min
const login2 = await call(
  "login min",
  sb.rpc("auth_login", { p_user_id: "min", p_password: "min94!@#" })
);
const minId = login2?.user?.id;

// 3. Record pack pull for hun (3 cards from m2)
await call(
  "record pack pull (m2 × 3 cards)",
  sb.rpc("record_pack_pull", {
    p_user_id: hunId,
    p_set_code: "m2",
    p_card_ids: ["m2-001", "m2-094", "m2-116"],
  })
);

// 4. Check hun's wallet — 결과는 콘솔 로그만, 변수는 보관 X.
await call(
  "fetch card_ownership for hun",
  sb.from("card_ownership").select("card_id, count").eq("user_id", hunId)
);

// 5. Gift one card to min
await call(
  "gift m2-116 from hun → min",
  sb.rpc("gift_card", {
    p_from_id: hunId,
    p_to_user_id: "min",
    p_card_id: "m2-116",
  })
);

// 6. Check min's wallet
await call(
  "fetch card_ownership for min",
  sb.from("card_ownership").select("card_id, count").eq("user_id", minId)
);

// 7. Check gifts table
await call(
  "recent gifts",
  sb
    .from("gifts")
    .select("from_user_id, to_user_id, card_id, created_at")
    .order("created_at", { ascending: false })
    .limit(3)
);

// 8. Test wrong password
await call(
  "wrong password",
  sb.rpc("auth_login", { p_user_id: "hun", p_password: "wrong" })
);

// 9. Test duplicate signup
await call(
  "duplicate signup",
  sb.rpc("auth_signup", { p_user_id: "hun", p_password: "x", p_age: 20 })
);
