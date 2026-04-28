/**
 * 모든 카드 (id, name, rarity) 를 walk 해서 resolveCardType 으로 type
 * 결정한 뒤 SQL seed 마이그레이션을 stdout 으로 출력. 한 번 돌려서 그
 * 결과를 supabase/migrations/ 에 저장하면 카드↔속성 mapping 이 DB
 * 영구화됨.
 *
 * 사용법:
 *   npx tsx scripts/dump-card-types.mts > supabase/migrations/20260642_card_types_seed.sql
 */
// tsx 가 .ts 파일을 CJS 로 로드하면 named export 가 module.exports 에 들어감.
// 양쪽 경로를 모두 fallback 처리.
const setsMod = await import("../src/lib/sets/index");
const wildMod = await import("../src/lib/wild/name-to-type");

type SetInfoLite = { cards: Array<{ id: string; name: string; rarity: string }> };
const SETS: Record<string, SetInfoLite> =
  (setsMod as { SETS?: Record<string, SetInfoLite> }).SETS ||
  (setsMod as Record<string, { SETS?: Record<string, SetInfoLite> }>)[
    "module.exports"
  ]?.SETS ||
  {};

const resolveCardType: (name: string) => string | null =
  (wildMod as { resolveCardType?: (name: string) => string | null })
    .resolveCardType ||
  (
    wildMod as Record<string, { resolveCardType?: (name: string) => string | null }>
  )["module.exports"]?.resolveCardType ||
  ((_: string) => null);

interface Row {
  id: string;
  type: string | null;
  rarity: string;
  name: string;
}

const rows: Row[] = [];
for (const [code, set] of Object.entries(SETS)) {
  for (const card of set.cards) {
    const t = resolveCardType(card.name);
    rows.push({
      id: card.id,
      type: t,
      rarity: card.rarity,
      name: card.name,
    });
  }
  void code;
}

const total = rows.length;
const typed = rows.filter((r) => r.type !== null).length;
const nulls = total - typed;

const header = `-- ============================================================
-- card_types — 카드 ID → wild type 영구 lookup 테이블
--
-- ${new Date().toISOString().slice(0, 10)} 자동 생성: scripts/dump-card-types.mts
-- 출처: src/lib/sets/* + resolveCardType (name-to-type / dex chain)
--
-- 통계:
--   전체 ${total} 장
--   속성 보유: ${typed} 장 (포켓몬)
--   속성 null: ${nulls} 장 (트레이너/에너지/굿즈/스타디움)
--
-- 사용 예 — hun 의 풀 속성 PCL10 카드 조회:
--   select g.id, c.rarity
--     from psa_gradings g
--     join card_types ct on ct.card_id = g.card_id
--    where g.user_id = (select id from users where user_id = 'hun')
--      and g.grade = 10
--      and ct.wild_type = '풀';
-- ============================================================

create table if not exists card_types (
  card_id   text primary key,
  wild_type text,
  rarity    text not null
);

-- 멱등 — 재시드 시 type/rarity 갱신.
`;

const inserts: string[] = [];
const ROWS_PER = 100;
for (let i = 0; i < rows.length; i += ROWS_PER) {
  const chunk = rows.slice(i, i + ROWS_PER);
  const values = chunk
    .map((r) => {
      const id = r.id.replace(/'/g, "''");
      const type = r.type ? `'${r.type.replace(/'/g, "''")}'` : "null";
      const rarity = r.rarity.replace(/'/g, "''");
      return `  ('${id}', ${type}, '${rarity}')`;
    })
    .join(",\n");
  inserts.push(
    `insert into card_types (card_id, wild_type, rarity) values\n${values}\non conflict (card_id) do update\n  set wild_type = excluded.wild_type,\n      rarity    = excluded.rarity;`
  );
}

const footer = `

create index if not exists card_types_type_idx on card_types(wild_type);

notify pgrst, 'reload schema';
`;

process.stdout.write(header + inserts.join("\n\n") + footer);
