"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import clsx from "clsx";
import { useAuth } from "@/lib/auth";
import {
  computeUserCenterPower,
  fetchMyPets,
  setGymDefenseDeck,
  type RawPetGrading,
} from "@/lib/gym/db";
import type { DefenderPokemonInfo, Gym } from "@/lib/gym/types";
import { effectiveness } from "@/lib/wild/typechart";
import { TYPE_STYLE, type WildType } from "@/lib/wild/types";
import { resolveCardType as resolvePetType } from "@/lib/wild/name-to-type";
import {
  getCardSecondaryType,
  getCardPrimaryOverride,
} from "@/lib/wild/card-secondary";
import { getCard } from "@/lib/sets";
import { RARITY_STYLE } from "@/lib/rarity";
import { slabStats } from "@/lib/wild/stats";
import Portal from "./Portal";
import { lockBodyScroll } from "@/lib/useBodyScrollLock";

interface MyPet {
  grading_id: string;
  card_id: string;
  card_name: string;
  rarity: keyof typeof RARITY_STYLE;
  grade: number;
  type: WildType | null;
  /** MUR 보조 속성 (없으면 null). 매칭/배지 모두 두 속성 고려. */
  type2: WildType | null;
  imageUrl?: string;
  baseHp: number;
  baseAtk: number;
}

// resolvePetType 은 lib/wild/name-to-type.ts 의 resolveCardType alias —
// 별도 구현 폐기 (DEX_TO_TYPE fallback + 메가 prefix 제거 통합).

/** rarity 가 null/undefined/invalid 이거나 RARITY_STYLE 에 없으면
 *  안전하게 'C' 로 폴백 — `RARITY_STYLE[undefined].frame` 같은 런타임
 *  TypeError 방지(iOS Safari 가 React 렌더 throw 를 페이지 크래시로
 *  올리는 경우 있음). */
function safeRarity(value: unknown): keyof typeof RARITY_STYLE {
  if (typeof value === "string" && value in RARITY_STYLE) {
    return value as keyof typeof RARITY_STYLE;
  }
  return "C";
}

function mergePet(g: RawPetGrading): MyPet | null {
  const card = getCard(g.card_id);
  const rarity = safeRarity(card?.rarity ?? g.rarity);
  const name = card?.name ?? g.card_id;
  const grade = g.grade ?? 10;
  const stats = slabStats(rarity, grade);
  // 1차 속성: 8 MUR 재지정분은 override, 그 외는 카드명 기반.
  const primaryOverride = getCardPrimaryOverride(g.card_id);
  const primary = primaryOverride ?? (card ? resolvePetType(card.name) : null);
  return {
    grading_id: g.grading_id,
    card_id: g.card_id,
    card_name: name,
    rarity,
    grade,
    type: primary,
    // 보조 속성: MUR/UR 매핑 모두 lookup. 없으면 null (SAR 등 단일).
    type2: getCardSecondaryType(g.card_id),
    imageUrl: card?.imageUrl,
    baseHp: stats.hp,
    baseAtk: stats.atk,
  };
}

/** 기존 방어덱 슬랩(defender_pokemon) 을 MyPet 으로 변환. main_card_ids
 *  에서 빠진 슬랩이라 fetchMyPets 결과엔 안 들어옴 — 풀 합치기 위해. */
function mergeFromDefender(d: DefenderPokemonInfo): MyPet | null {
  if (!d.grading_id) return null;
  // stale 슬롯 (server 가 card_id null 반환) 은 pet 풀에 머지해도
  // 의미 없으므로 skip — 사용자가 set 시 정상 슬랩으로 교체.
  if (!d.card_id) return null;
  const card = getCard(d.card_id);
  const rarity = safeRarity(card?.rarity ?? d.rarity);
  const name = card?.name ?? d.card_id ?? "?";
  const grade = d.grade ?? 10;
  const stats = slabStats(rarity, grade);
  return {
    grading_id: d.grading_id,
    card_id: d.card_id ?? "",
    card_name: name,
    rarity,
    grade,
    // 서버 저장된 type 우선, 없으면 카드명 기준 lookup.
    // 서버 저장된 type 우선, 없으면 override → 카드명 lookup.
    type:
      d.type ??
      getCardPrimaryOverride(d.card_id) ??
      (card ? resolvePetType(card.name) : null),
    // 서버가 wild_type_2 를 함께 내려줌. 없으면 클라 매핑 fallback.
    // MUR/UR 모두 매핑에서 lookup, SAR 이하는 매핑 미존재 → null.
    type2:
      (d.wild_type_2 as WildType | null) ??
      getCardSecondaryType(d.card_id),
    imageUrl: card?.imageUrl,
    baseHp: stats.hp,
    baseAtk: stats.atk,
  };
}

/** 점령자가 자기 펫 3마리로 방어 덱 셋업하는 모달.
 *  GymChallengeOverlay 의 PickerPhase 와 거의 동일한 UX 지만, 도전이
 *  아니라 set_gym_defense_deck RPC 를 호출. 실패해도 챌린지 락은 안
 *  잡으므로 더 가벼움. */
export default function GymDefenseDeckModal({
  gym,
  onClose,
  onSaved,
}: {
  gym: Gym;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const reduce = useReducedMotion();

  const [pets, setPets] = useState<MyPet[]>([]);
  const [loading, setLoading] = useState(true);
  const [centerPower, setCenterPower] = useState<number>(0);
  const [order, setOrder] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      const [raw, cp] = await Promise.all([
        fetchMyPets(userId),
        computeUserCenterPower(userId),
      ]);
      if (!alive) return;
      const merged = raw.map(mergePet).filter((p): p is MyPet => p !== null);

      // 기존 방어덱 슬랩도 풀에 합침 — main_card_ids 에선 빠진 상태라
      // 이걸 안 합치면 펫 슬롯이 비어있을 때 편집 자체가 불가.
      const existing = gym.ownership?.defender_pokemon ?? [];
      const knownIds = new Set(merged.map((p) => p.grading_id));
      for (const d of existing) {
        if (!d.grading_id || knownIds.has(d.grading_id)) continue;
        const pet = mergeFromDefender(d);
        if (pet) merged.push(pet);
      }

      setPets(merged);
      setCenterPower(cp);

      // 이미 셋업된 방어덱이 있으면 슬롯 순서대로 pre-select.
      if (existing.length === 3) {
        const ids = existing
          .filter((d) => d.grading_id)
          .map((d) => d.grading_id as string);
        if (ids.length === 3) setOrder(ids);
      }

      setLoading(false);
    })();
    return () => {
      alive = false;
    };
    // gym.id 가 같으면 재실행 안 함.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, gym.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const releaseLock = lockBodyScroll();
    return () => {
      window.removeEventListener("keydown", onKey);
      releaseLock();
    };
  }, [onClose]);

  const togglePet = useCallback((id: string) => {
    setOrder((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  }, []);

  const movePet = useCallback((id: string, dir: -1 | 1) => {
    setOrder((prev) => {
      const idx = prev.indexOf(id);
      if (idx < 0) return prev;
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      const t = next[target];
      next[target] = next[idx];
      next[idx] = t;
      return next;
    });
  }, []);

  // 체육관 속성 매칭 강제 — 두 속성 중 하나라도 일치하면 노출 (MUR 만
  // type2 보유, UR/SAR 는 null 이므로 단일 속성 동작 그대로).
  const matchingPets = useMemo(
    () =>
      pets.filter((p) => p.type === gym.type || p.type2 === gym.type),
    [pets, gym.type]
  );
  const insufficient = !loading && matchingPets.length < 3;

  const orderedPets = useMemo(() => {
    const map = new Map(pets.map((p) => [p.grading_id, p]));
    return order
      .map((id) => map.get(id))
      .filter((p): p is MyPet => Boolean(p));
  }, [order, pets]);

  const previewBonus = useCallback(
    (slot: number, basePet: MyPet) => {
      const ratio = slot === 1 ? 0.10 : slot === 2 ? 0.08 : 0.06;
      const raw = Math.round((centerPower ?? 0) * ratio);
      const cap = Math.round(basePet.baseAtk * 1.5);
      return Math.min(raw, cap);
    },
    [centerPower]
  );

  const onSave = useCallback(async () => {
    if (!userId) return;
    if (order.length !== 3) {
      setError("펫 3마리를 선택해주세요.");
      return;
    }
    setError(null);
    setSaving(true);

    const idMap = new Map(pets.map((p) => [p.grading_id, p]));
    const selected = order
      .map((id) => idMap.get(id))
      .filter((p): p is MyPet => Boolean(p));
    if (selected.length !== 3) {
      setError("펫 정보가 일치하지 않아요.");
      setSaving(false);
      return;
    }

    const gradingIds = selected.map((p) => p.grading_id);
    // 서버가 어차피 gym.type 으로 정규화하지만, 클라가 보내는 값도 일관되게.
    // (MUR 가 wild_type_2 로 매칭된 경우 p.type !== gym.type 이라도 OK.)
    const petTypes = selected.map(() => gym.type);
    const res = await setGymDefenseDeck(userId, gym.id, gradingIds, petTypes);
    setSaving(false);
    if (!res.ok) {
      setError(res.error ?? "방어 덱 설정 실패");
      return;
    }
    onSaved();
  }, [userId, order, pets, gym.id, onSaved]);

  return (
    <Portal>
      <motion.div
        className="fixed inset-0 z-[110] bg-black/90 flex items-end md:items-center justify-center px-2 md:px-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="relative w-full max-w-md bg-zinc-950 border border-white/10 rounded-2xl flex flex-col overflow-hidden max-h-[92vh]"
          onClick={(e) => e.stopPropagation()}
          initial={reduce ? false : { y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { y: 24, opacity: 0 }}
        >
          <div className="px-3 py-2 border-b border-white/10 flex items-center gap-2">
            <span aria-hidden className="text-base">🛡️</span>
            <h2 className="text-sm font-black text-white truncate flex-1">
              {gym.name} · 방어 덱 설정
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-white/80 text-sm"
              aria-label="닫기"
              style={{ touchAction: "manipulation" }}
            >
              ✕
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-3 md:p-4 space-y-3">
            <div className="rounded-xl border border-fuchsia-400/30 bg-fuchsia-400/[0.06] px-3 py-2 text-[11px] text-fuchsia-100 leading-snug">
              내 펫 3마리를 골라 슬롯을 정하세요. 다른 트레이너가 도전하면
              관장 NPC 포켓몬 대신 이 3마리가 적으로 등장합니다. 패배 시
              덱은 자동 초기화돼요.
            </div>
            <div className="rounded-xl border border-amber-400/40 bg-amber-400/[0.08] px-3 py-2 text-[11px] text-amber-100 leading-snug">
              ⚡ <b className="text-white">{gym.type}</b> 속성 체육관 — 방어
              펫 3마리 모두 <b>{gym.type}</b> 속성이어야 합니다.
              {!loading && (
                <span className="ml-1 text-amber-200/85">
                  (보유 {gym.type} 펫 {matchingPets.length}/3+)
                </span>
              )}
            </div>

            {/* 출전 순서 */}
            <section className="rounded-xl border border-amber-400/30 bg-amber-400/[0.06] p-2.5">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[11px] uppercase tracking-wider text-amber-200">
                  방어 순서 ({order.length}/3)
                </p>
                <p className="text-[10px] text-zinc-400 tabular-nums">
                  내 전투력 {centerPower.toLocaleString("ko-KR")}
                </p>
              </div>
              {orderedPets.length === 0 && (
                <p className="text-[11px] text-zinc-500 text-center py-2">
                  아래에서 펫 3마리를 선택하세요.
                </p>
              )}
              <ul className="flex flex-col gap-1">
                {orderedPets.map((p, idx) => {
                  const slot = idx + 1;
                  const bonus = previewBonus(slot, p);
                  return (
                    <li
                      key={p.grading_id}
                      className="rounded-lg bg-zinc-900/70 border border-white/10 px-2 py-1.5 flex items-center gap-2"
                    >
                      <span className="text-[10px] font-black text-amber-200 w-6 text-center">
                        #{slot}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-bold text-white truncate">
                          {p.card_name}
                        </p>
                        <p className="text-[9px] text-zinc-400">
                          HP {p.baseHp} · ATK {p.baseAtk}
                          {bonus > 0 && (
                            <span className="text-amber-300"> (+{bonus})</span>
                          )}
                          {p.type && (
                            <>
                              {" · "}
                              <span className="text-zinc-200">{p.type}</span>
                              {p.type2 && (
                                <span className="text-amber-200">
                                  {" / "}
                                  {p.type2}
                                </span>
                              )}
                            </>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => movePet(p.grading_id, -1)}
                          disabled={idx === 0}
                          className="w-6 h-6 rounded bg-white/5 disabled:opacity-30 text-white text-[10px]"
                          aria-label="앞 슬롯으로"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          onClick={() => movePet(p.grading_id, +1)}
                          disabled={idx === orderedPets.length - 1}
                          className="w-6 h-6 rounded bg-white/5 disabled:opacity-30 text-white text-[10px]"
                          aria-label="뒤 슬롯으로"
                        >
                          ▼
                        </button>
                        <button
                          type="button"
                          onClick={() => togglePet(p.grading_id)}
                          className="w-6 h-6 rounded bg-rose-500/30 hover:bg-rose-500/50 text-white text-[10px]"
                          aria-label="제거"
                        >
                          ✕
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* 펫 풀 — 체육관 속성과 일치하는 펫만 */}
            <section className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
              <p className="text-[11px] uppercase tracking-wider text-zinc-400 mb-1.5">
                {gym.type} 속성 펫 (PCL10 · 펫 등록)
              </p>
              {loading ? (
                <p className="text-[11px] text-zinc-500 py-3 text-center">로딩 중...</p>
              ) : insufficient ? (
                <p className="text-[11px] text-rose-300 py-3 text-center leading-snug">
                  등록된 {gym.type} 속성 PCL10 펫이 부족해요 ({matchingPets.length}/3).<br/>
                  프로필에서 {gym.type} 속성 펫을 더 등록한 뒤 다시 시도하세요.
                </p>
              ) : (
                <ul className="grid grid-cols-2 gap-1.5">
                  {matchingPets.map((p) => {
                    const idx = order.indexOf(p.grading_id);
                    const selected = idx >= 0;
                    const eff = p.type ? effectiveness(p.type, gym.type) : 1;
                    return (
                      <li key={p.grading_id}>
                        <button
                          type="button"
                          onClick={() => togglePet(p.grading_id)}
                          style={{ touchAction: "manipulation" }}
                          className={clsx(
                            "relative w-full rounded-lg border p-1.5 text-left flex items-center gap-1.5 transition active:scale-[0.98]",
                            selected
                              ? "border-fuchsia-400/60 bg-fuchsia-400/10"
                              : "border-white/10 bg-zinc-900/60 hover:bg-white/5"
                          )}
                        >
                          {selected && (
                            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-fuchsia-500 text-white text-[10px] font-black flex items-center justify-center">
                              {idx + 1}
                            </span>
                          )}
                          <div
                            className={clsx(
                              "w-8 h-11 rounded overflow-hidden ring-1 bg-zinc-900 shrink-0",
                              RARITY_STYLE[p.rarity].frame
                            )}
                          >
                            {p.imageUrl && (
                              <img
                                src={p.imageUrl}
                                alt=""
                                loading="lazy"
                                decoding="async"
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                  e.currentTarget.style.display = "none";
                                }}
                                className="w-full h-full object-contain"
                                draggable={false}
                              />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-bold text-white truncate">
                              {p.card_name}
                            </p>
                            <p className="text-[9px] text-zinc-400 leading-tight">
                              HP {p.baseHp} · ATK {p.baseAtk}
                            </p>
                            <div className="flex items-center gap-0.5 mt-0.5 flex-wrap">
                              {p.type ? (
                                <span
                                  className={clsx(
                                    "px-1 py-[1px] rounded text-[8px] font-black",
                                    TYPE_STYLE[p.type].badge
                                  )}
                                >
                                  {p.type}
                                </span>
                              ) : (
                                <span className="text-[8px] text-zinc-500">無속성</span>
                              )}
                              {/* MUR 보조 속성 — 두 번째 배지 */}
                              {p.type2 && (
                                <span
                                  className={clsx(
                                    "px-1 py-[1px] rounded text-[8px] font-black",
                                    TYPE_STYLE[p.type2].badge
                                  )}
                                >
                                  {p.type2}
                                </span>
                              )}
                              {p.type && eff !== 1 && (
                                <span
                                  className={clsx(
                                    "text-[8px] font-black",
                                    eff > 1 ? "text-emerald-300" : "text-rose-300"
                                  )}
                                >
                                  ×{eff}
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {error && (
              <p className="text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
          </div>

          <div className="border-t border-white/10 p-3 bg-zinc-950/95">
            <button
              type="button"
              onClick={onSave}
              disabled={order.length !== 3 || saving}
              style={{ touchAction: "manipulation" }}
              className={clsx(
                "w-full h-11 rounded-xl font-black text-sm",
                order.length === 3 && !saving
                  ? "bg-gradient-to-r from-fuchsia-500 to-violet-500 text-white active:scale-[0.98]"
                  : "bg-white/5 text-zinc-500 cursor-not-allowed"
              )}
            >
              {saving ? "저장 중..." : "🛡️ 방어 덱 저장"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </Portal>
  );
}
