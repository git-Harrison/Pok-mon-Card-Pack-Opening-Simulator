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
  const s = typeof data === "object" ? JSON.stringify(data) : String(data);
  console.log(`✓ ${label}:`, s.slice(0, 130));
  return data;
}

// Login hun
const login = await call(
  "login hun",
  sb.rpc("auth_login", { p_user_id: "hun", p_password: "hun94!@#" })
);
const hunId = login.user.id;

// Fetch me (points)
await call(
  "fetchMe hun",
  sb.from("users").select("id, user_id, points").eq("id", hunId).single()
);

// Give hun a card to sell
await call(
  "seed pull (sv8-136 UR × 1)",
  sb.rpc("record_pack_pull", {
    p_user_id: hunId,
    p_set_code: "sv8",
    p_card_ids: ["sv8-136"],
  })
);

// Merchant initial state
const m = await call(
  "get_merchant_state",
  sb.rpc("get_merchant_state", { p_user_id: hunId })
);

// If no card, set one
if (!m.card_id) {
  await call(
    "refresh_merchant to sv8-136 (UR = 6000p)",
    sb.rpc("refresh_merchant", {
      p_user_id: hunId,
      p_new_card_id: "sv8-136",
      p_price: 6000,
    })
  );
} else {
  // Force to sv8-136 to test selling
  await call(
    "refresh_merchant override to sv8-136 (UR = 6000p)",
    sb.rpc("refresh_merchant", {
      p_user_id: hunId,
      p_new_card_id: "sv8-136",
      p_price: 6000,
    })
  );
}

// Check state
await call(
  "merchant state after refresh",
  sb.rpc("get_merchant_state", { p_user_id: hunId })
);

// Sell
await call(
  "sell_to_merchant sv8-136",
  sb.rpc("sell_to_merchant", { p_user_id: hunId, p_card_id: "sv8-136" })
);

// Check points
await call(
  "fetchMe hun (after sell)",
  sb.from("users").select("points").eq("id", hunId).single()
);

// Test gift flow: hun gifts another card to min with 200p price
const minLogin = await call(
  "login min",
  sb.rpc("auth_login", { p_user_id: "min", p_password: "min94!@#" })
);
const minId = minLogin.user.id;

// Ensure hun has a card first
await call(
  "seed hun pull (m2-094)",
  sb.rpc("record_pack_pull", {
    p_user_id: hunId,
    p_set_code: "m2",
    p_card_ids: ["m2-094"],
  })
);

const giftRes = await call(
  "create_gift hun → min (m2-094, 200p)",
  sb.rpc("create_gift", {
    p_from_id: hunId,
    p_to_user_id: "min",
    p_card_id: "m2-094",
    p_price_points: 200,
  })
);
const giftId = giftRes.gift_id;

// min accepts (min has 500p by default, enough)
await call(
  "accept_gift",
  sb.rpc("accept_gift", { p_gift_id: giftId, p_user_id: minId })
);

// Verify points transfer
await call(
  "hun points (should +200)",
  sb.from("users").select("points").eq("id", hunId).single()
);
await call(
  "min points (should -200)",
  sb.from("users").select("points").eq("id", minId).single()
);

// Verify card ownership
await call(
  "min card_ownership (m2-094)",
  sb.from("card_ownership").select("card_id, count").eq("user_id", minId).eq("card_id", "m2-094")
);

// Test decline flow
await call(
  "seed hun another m2-094",
  sb.rpc("record_pack_pull", {
    p_user_id: hunId,
    p_set_code: "m2",
    p_card_ids: ["m2-094"],
  })
);
const gift2 = await call(
  "create gift #2 (100p) for decline test",
  sb.rpc("create_gift", {
    p_from_id: hunId,
    p_to_user_id: "min",
    p_card_id: "m2-094",
    p_price_points: 100,
  })
);
await call(
  "decline_gift",
  sb.rpc("decline_gift", { p_gift_id: gift2.gift_id, p_user_id: minId })
);
await call(
  "hun owns m2-094 (should be refunded)",
  sb.from("card_ownership").select("card_id, count").eq("user_id", hunId).eq("card_id", "m2-094")
);

// Test insufficient points
// Try to give min something worth more than her points
await call(
  "huge price gift (should fail on accept)",
  sb.rpc("create_gift", {
    p_from_id: hunId,
    p_to_user_id: "min",
    p_card_id: "m2-094",
    p_price_points: 999999,
  })
);

console.log("\n--- Summary ---");
await call(
  "merchant_state",
  sb.rpc("get_merchant_state", { p_user_id: hunId })
);
