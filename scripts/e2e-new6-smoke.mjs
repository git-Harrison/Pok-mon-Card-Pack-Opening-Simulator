// 신규 6팩 추가 후 핵심 플로우 스모크 테스트.
//   node scripts/e2e-new6-smoke.mjs
//
// 사전 조건: dev server 가 http://localhost:3000 에서 실행 중이어야 함.

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const SESSION_KEY = "pokemon-tcg-sim:session:v3";

// 1) supabase auth_login 으로 유저 객체 확보 → 2) page.addInitScript 로
// localStorage 에 직접 주입 → 3) 페이지 로드 시 auth gate 통과.
const sb = createClient(
  "https://vdprfnhwdbrwdbjmbjfy.supabase.co",
  "sb_publishable_wYsTQ7Og_BeMclYN8ZFSNg_3EwX1GPB"
);
const { data: loginData, error: loginErr } = await sb.rpc("auth_login", {
  p_user_id: "hun",
  p_password: "hun94!@#",
});
if (loginErr || !loginData?.user) {
  console.error("auth_login 실패:", loginErr?.message ?? "no user");
  process.exit(1);
}
const dbUser = loginData.user;
console.log("auth ok — user:", dbUser.user_id);

const results = [];
const fail = [];
function record(name, ok, detail = "") {
  const r = { name, ok, detail };
  results.push(r);
  if (!ok) fail.push(r);
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? "  — " + detail : ""}`);
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 412, height: 915 }, // 모바일 우선 — Pixel 7 사이즈
  userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 7) Mobile",
});
const page = await ctx.newPage();

// UI 로그인.
await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
await page.waitForSelector('input[autocomplete="username"]', { timeout: 10000 });
await page.fill('input[autocomplete="username"]', "hun");
await page.fill('input[type="password"]', "hun94!@#");
await page.screenshot({ path: "/tmp/before-submit.png" });
await page.click('button[type="submit"]');
await page.waitForTimeout(3000);
await page.screenshot({ path: "/tmp/after-submit.png" });
console.log("DEBUG after submit url:", page.url());
const errorText = await page.locator(".text-rose-400").textContent().catch(() => null);
if (errorText) console.log("DEBUG login error:", errorText);
if (page.url().includes("login")) {
  // 로그인 안 됨 — abort.
  console.error("로그인 실패. 화면 확인 /tmp/after-submit.png");
  process.exit(1);
}

// 콘솔 에러 수집 (auth 관련 expected 한 것 제외).
const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
page.on("console", (msg) => {
  if (msg.type() === "error") {
    const t = msg.text();
    if (!/auth|supabase|Failed to load resource: the server responded with a status of 401/i.test(t)) {
      consoleErrors.push(`console: ${t}`);
    }
  }
});

try {
  // 1. 이미 / 에 있음. content 까지 대기.
  record("/ 도달", page.url().endsWith("/"), `url=${page.url()}`);

  // SectionTitle("팩 선택") 가 mount 될 때까지 대기.
  await page.waitForSelector('h2:has-text("팩 선택")', { timeout: 15000 });

  // 디버그.
  const h1 = await page.locator("h1, h2").allInnerTexts().catch(() => []);
  console.log("DEBUG h1/h2:", h1.slice(0, 8));

  // 2. 팩 선택 섹션 존재.
  const packSection = await page.locator('section:has(h2:has-text("팩 선택"))').first();
  record("팩 선택 섹션 존재", await packSection.count() > 0);

  // 3. SWSH 칩 존재 + 6종 표기.
  const swshChip = page.locator('button[role="tab"]:has-text("SWSH")');
  const swshCount = await swshChip.count();
  if (swshCount > 0) {
    const txt = await swshChip.first().innerText();
    record("SWSH 칩 노출 + 6종", /SWSH/.test(txt) && /6/.test(txt), `text="${txt.replace(/\n/g, " ")}"`);
  } else {
    record("SWSH 칩 노출 + 6종", false, "칩 미발견 (auth gate?)");
  }

  // 4. 전체 칩 = 19종.
  const allChip = page.locator('button[role="tab"]:has-text("전체")');
  if (await allChip.count() > 0) {
    const txt = await allChip.first().innerText();
    record("전체 칩 = 19종", /19/.test(txt), `text="${txt.replace(/\n/g, " ")}"`);
  } else {
    record("전체 칩 = 19종", false, "칩 미발견");
  }

  // 5. 검색 input 존재.
  const search = page.locator('input[type="search"]');
  record("검색 input 존재", await search.count() > 0);

  // 6. 검색 동작 — "클라이맥스" 입력 시 s8b 만 매치되는지.
  if (await search.count() > 0) {
    await search.fill("클라이맥스");
    await page.waitForTimeout(400);
    const tiles = page.locator('a[href^="/set/"]');
    const c = await tiles.count();
    record("검색 '클라이맥스' → 1팩만 매치", c === 1, `tile 개수=${c}`);
    await search.fill("");
    await page.waitForTimeout(300);
  }

  // 7. set 상세 페이지 (s8b VMAX 클라이맥스).
  const s8bResp = await page.goto(BASE + "/set/s8b", { waitUntil: "domcontentloaded", timeout: 15000 });
  record("/set/s8b 응답 200", s8bResp && s8bResp.status() < 400, `status=${s8bResp?.status()}`);
  await page.waitForTimeout(2000);

  // 8. set s8b 페이지에 "VMAX 클라이맥스" 텍스트.
  const titleHit = await page.locator('text=/VMAX 클라이맥스/').count();
  record("/set/s8b 에 'VMAX 클라이맥스' 노출", titleHit > 0);

  // 9. set s4a 페이지 (샤이니스타 V).
  await page.goto(BASE + "/set/s4a", { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForTimeout(2000);
  const s4aHit = await page.locator('text=/샤이니스타/').count();
  record("/set/s4a 에 '샤이니스타' 노출", s4aHit > 0);

  // 10. set s8ap (25주년).
  await page.goto(BASE + "/set/s8ap", { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForTimeout(2000);
  const s8apHit = await page.locator('text=/25주년/').count();
  record("/set/s8ap 에 '25주년' 노출", s8apHit > 0);

  // 11. 카드 이미지 - sample 1장 (s8b 001 카드 image URL HEAD 체크는 직접 fetch).
  const sampleImage = "https://den-cards.pokellector.com/338/Weedle.S8B.1.41281.png"; // s8b 001 (recon JSON 기반)
  const imgResp = await page.request.get(sampleImage, { timeout: 10000 }).catch((e) => ({ status: () => 0, _err: e.message }));
  const imgStatus = imgResp.status?.() ?? 0;
  record("Pokellector 카드 이미지 외부 URL 작동", imgStatus === 200, `status=${imgStatus}`);

  // 12. 콘솔 에러.
  record(`콘솔 에러 ${consoleErrors.length}건`, consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
} catch (e) {
  record("EXCEPTION", false, e.message);
}

await browser.close();

console.log("\n" + "─".repeat(72));
console.log(`총 ${results.length} / 통과 ${results.length - fail.length} / 실패 ${fail.length}`);
if (fail.length) {
  console.log("\n실패 항목:");
  for (const f of fail) console.log(`  ✗ ${f.name}  — ${f.detail}`);
  process.exit(1);
}
