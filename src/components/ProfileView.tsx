"use client";

import PokeLoader, { CenteredPokeLoader } from "./PokeLoader";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AnimatePresence,
  LayoutGroup,
  animate,
  motion,
  useReducedMotion,
} from "framer-motion";
import clsx from "clsx";
import { useAuth } from "@/lib/auth";
import {
  fetchAllGradingsWithDisplay,
  fetchTauntHistory,
  type PclGradingWithDisplay,
  type TauntEntry,
} from "@/lib/db";
import {
  CHARACTERS,
  DISPLAY_NAME_MAX,
  DISPLAY_NAME_MIN,
  fetchProfile,
  getCharacter,
  PETS_PER_TYPE,
  setCharacter as rpcSetCharacter,
  setPetForType,
  updateDisplayName as rpcUpdateDisplayName,
  type CharacterDef,
  type ProfileMainCard,
  type ProfileSnapshot,
} from "@/lib/profile";
import { getCard, SETS } from "@/lib/sets";
import { getAllCatalogCards } from "@/lib/pokedex";
import { RARITY_STYLE, compareRarity } from "@/lib/rarity";
import type { Rarity } from "@/lib/types";
import PageHeader from "./PageHeader";
import PageBackdrop from "./PageBackdrop";
import PclSlab from "./PclSlab";
import Portal from "./Portal";
import GymMedalIcon from "./GymMedalIcon";
import { fetchUserGymMedals } from "@/lib/gym/db";
import type { UserGymMedal } from "@/lib/gym/types";
import { resolveCardType } from "@/lib/wild/name-to-type";
import {
  getCardSecondaryType,
  getCardPrimaryOverride,
} from "@/lib/wild/card-secondary";
import { TYPE_STYLE, type WildType } from "@/lib/wild/types";
import { groupGradings } from "@/lib/cards/group-gradings";
import { lockBodyScroll } from "@/lib/useBodyScrollLock";

export default function ProfileView() {
  const { user, refreshMe, logout } = useAuth();
  const [profile, setProfile] = useState<ProfileSnapshot | null>(null);
  const [pcl, setPcl] = useState<PclGradingWithDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingChar, setSavingChar] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 신구조 picker state — { type, slot } 로 어느 타입의 어느 슬롯을
  // 채우려는지 식별. 구조 변경 (spec 2-1) 후엔 이 상태만 사용.
  const [picker, setPicker] = useState<
    { type: WildType; slot: number } | null
  >(null);
  const [nameOpen, setNameOpen] = useState(false);
  const [tauntOpen, setTauntOpen] = useState(false);

  const userId = user?.id ?? null;
  // refresh — opts.silent=true 시 loading 토글 안 함 → CenteredPokeLoader
  // 안 뜨고 컨텐츠 unmount/remount 없어 스크롤 위치 유지. mutation 후
  // (펫 등록/해제, 캐릭터 확정 등) 재조회에 사용. 초기 mount 만 비-silent.
  const refresh = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!userId) return;
      const silent = opts?.silent ?? false;
      if (!silent) setLoading(true);
      const [p, g] = await Promise.all([
        fetchProfile(userId),
        fetchAllGradingsWithDisplay(userId),
      ]);
      setProfile(p);
      setPcl(g);
      if (!silent) setLoading(false);
    },
    [userId]
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 자동 마이그레이션 — 기존 main_card_ids 의 펫을 속성별 구조로 이동.
  // 1회 실행: main_cards_by_type 가 비어있고 main_card_ids 에 카드가
  // 있을 때만. 카드 type 은 resolveCardType (CARD_NAME_TO_TYPE +
  // DEX_TO_TYPE fallback) 로 분류. 같은 type 에 카드가 3개 초과면
  // 희귀도 내림차순 상위 3개만 채택.
  const migratedRef = useRef(false);
  useEffect(() => {
    if (migratedRef.current) return;
    if (!user || !profile) return;
    const byType = profile.main_cards_by_type ?? {};
    const hasNew = Object.values(byType).some((arr) => arr.length > 0);
    const oldCards = profile.main_cards ?? [];
    if (hasNew || oldCards.length === 0) return;

    migratedRef.current = true;
    (async () => {
      // 카드별 type 분류.
      const groups = new Map<WildType, ProfileMainCard[]>();
      for (const c of oldCards) {
        const card = getCard(c.card_id);
        if (!card) continue;
        const t = resolveCardType(card.name);
        if (!t) continue;
        const bucket = groups.get(t) ?? [];
        bucket.push(c);
        groups.set(t, bucket);
      }
      // 각 type 별 상위 PETS_PER_TYPE 만 채택, 희귀도 내림차순.
      for (const [type, bucket] of groups) {
        bucket.sort((a, b) =>
          compareRarity(a.rarity as Rarity, b.rarity as Rarity)
        );
        const ids = bucket.slice(0, PETS_PER_TYPE).map((c) => c.id);
        if (ids.length > 0) {
          await setPetForType(user.id, type, ids);
        }
      }
      await refresh({ silent: true });
    })();
  }, [user, profile, refresh]);

  const characterDef = useMemo(
    () => getCharacter(profile?.character ?? null),
    [profile?.character]
  );

  // 속성별 펫 슬롯 — { type: [slot1, slot2, slot3] } 형태. 빈 슬롯은
  // null. spec 2-1 (속성별 최대 3마리). hydrated card 정보는 server 의
  // get_profile main_cards_by_type 응답에서.
  const slotsByType: Record<string, (ProfileMainCard | null)[]> = useMemo(() => {
    const data = profile?.main_cards_by_type ?? {};
    const out: Record<string, (ProfileMainCard | null)[]> = {};
    for (const [type, cards] of Object.entries(data)) {
      const sorted = [...cards].sort((a, b) =>
        compareRarity(a.rarity as Rarity, b.rarity as Rarity)
      );
      const arr: (ProfileMainCard | null)[] = sorted.slice(0, PETS_PER_TYPE);
      while (arr.length < PETS_PER_TYPE) arr.push(null);
      out[type] = arr;
    }
    return out;
  }, [profile]);

  // 모든 등록 펫 평탄화 (헤더 카운트, breakdown 등에 사용).
  const allRegisteredPets: ProfileMainCard[] = useMemo(() => {
    const data = profile?.main_cards_by_type ?? {};
    const flat: ProfileMainCard[] = [];
    for (const cards of Object.values(data)) {
      for (const c of cards) flat.push(c);
    }
    return flat.sort((a, b) =>
      compareRarity(a.rarity as Rarity, b.rarity as Rarity)
    );
  }, [profile]);

  // 펫 등록 후보 — 본인 PCL10 슬랩 전체 (전시/방어덱 슬랩 포함).
  // 같은 카드 묶음 카운트 (xN) 가 보유 수량 그대로 보여야 사용자가
  // "5장 보유, 1장 전시 → 4장 사용 가능" 을 정확히 인지함. 사용 중
  // 인스턴스 차단은 SlabPicker 가 group.all 안에서 사용가능 슬랩
  // 카운트로 판단 (displayedIds/defenseIds/disabledIds 활용).
  // 희귀도 내림차순(MUR → C) 정렬.
  const eligibleSlabs = useMemo(
    () =>
      pcl
        .filter((g) => g.grade === 10)
        .sort((a, b) => {
          const ra = getCard(a.card_id)?.rarity;
          const rb = getCard(b.card_id)?.rarity;
          if (!ra || !rb) return 0;
          return compareRarity(ra, rb);
        }),
    [pcl]
  );
  // 전시 중인 슬랩 ID — 위에서 이미 필터되긴 하지만, 동시 등록
  // 레이스(다른 탭에서 전시 시도) 대비로 picker 에 disabled 표시도
  // 같이 유지.
  const displayedIds = useMemo(
    () => new Set(pcl.filter((g) => g.displayed).map((g) => g.id)),
    [pcl]
  );
  // 체육관 방어 덱에 등록된 슬랩 — picker 에서 "방어 덱" 라벨 + disabled.
  const defenseIds = useMemo(
    () => new Set(pcl.filter((g) => g.in_defense_deck).map((g) => g.id)),
    [pcl]
  );

  const onPickCharacter = useCallback(
    async (def: CharacterDef) => {
      if (!user || savingChar) return;
      if (profile?.character_locked) {
        setError("캐릭터는 한 번 선택하면 변경할 수 없어요.");
        return;
      }
      const ok = window.confirm(
        `${def.name}(으)로 확정할까요?\n\n⚠️ 한 번 선택하면 변경할 수 없어요.`
      );
      if (!ok) return;
      setSavingChar(true);
      setError(null);
      const res = await rpcSetCharacter(user.id, def.key);
      setSavingChar(false);
      if (!res.ok) {
        setError(res.error ?? "캐릭터를 저장하지 못했어요.");
        return;
      }
      await refresh({ silent: true });
    },
    [user, profile?.character_locked, refresh, savingChar]
  );

  // 속성별 펫 등록 — 한 type 슬롯의 한 자리를 새 카드로 교체.
  // 서버 set_pet_for_type 에 type 의 ids 배열 통째로 전달.
  // 등록 성공 후 picker 닫음 — 사용자가 다른 슬롯 누르면 새로 mount.
  // (이전 advance 자동 이동 시도가 사용자 입장에서 무반응처럼 보여 revert.)
  const onSelectSlabForType = useCallback(
    async (type: WildType, slot: number, gradingId: string) => {
      if (!user) {
        setError("로그인 후 다시 시도하세요.");
        return;
      }
      if (!profile) {
        setError("프로필 로딩 중이에요. 잠시 후 다시 시도하세요.");
        return;
      }
      if (displayedIds.has(gradingId)) {
        setError("센터에 전시 중인 슬랩이에요. 전시 해제 후 다시 시도하세요.");
        return;
      }
      if (defenseIds.has(gradingId)) {
        setError("방어 덱에 등록된 슬랩이에요. 방어 덱에서 제외 후 등록하세요.");
        return;
      }
      // 같은 type 에 이미 등록된 ID 들에서, 해당 슬롯 자리에 새 ID 삽입.
      const current = (profile.main_cards_by_type[type] ?? []).map((c) => c.id);
      const filtered = current.filter((id) => id !== gradingId);
      while (filtered.length <= slot) filtered.push("");
      filtered[slot] = gradingId;
      const cleaned = Array.from(
        new Set(filtered.filter((id) => id !== ""))
      ).slice(0, PETS_PER_TYPE);
      setError(null);
      const res = await setPetForType(user.id, type, cleaned);
      if (!res.ok) {
        setError(res.error ?? "펫을 등록하지 못했어요.");
        return;
      }
      setPicker(null);
      await refresh({ silent: true });
    },
    [user, profile, displayedIds, defenseIds, refresh]
  );

  const onRemoveSlotForType = useCallback(
    async (type: WildType, gradingId: string) => {
      if (!user || !profile) return;
      const current = (profile.main_cards_by_type[type] ?? []).map((c) => c.id);
      const next = current.filter((id) => id !== gradingId);
      if (next.length === current.length) return;
      const ok = window.confirm("이 펫을 슬롯에서 빼시겠어요?");
      if (!ok) return;
      setError(null);
      const res = await setPetForType(user.id, type, next);
      if (!res.ok) {
        setError(res.error ?? "펫을 해제하지 못했어요.");
        return;
      }
      await refresh({ silent: true });
    },
    [user, profile, refresh]
  );

  return (
    <div className="relative max-w-3xl mx-auto px-4 md:px-6 py-3 md:py-6 fade-in">
      <PageBackdrop tone="sky" />
      <PageHeader
        title="내 프로필"
        subtitle="트레이너 캐릭터를 고르고 자랑할 슬랩을 펫으로 등록하세요"
      />

      {loading ? (
        <CenteredPokeLoader label="불러오는 중..." />
      ) : (
        <>
          <ProfileBanner
            character={characterDef}
            displayName={user?.display_name ?? ""}
            slotsUsed={allRegisteredPets.length}
            centerPower={profile?.center_power ?? 0}
            pokedexCount={profile?.pokedex_count ?? 0}
            onEditName={() => setNameOpen(true)}
            userId={userId}
          />

          <section className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <Link
              href="/wallet"
              className="rounded-2xl p-3 border border-amber-400/30 bg-amber-400/5 hover:bg-amber-400/10 transition flex items-center gap-3"
            >
              <span className="text-2xl">💼</span>
              <div className="min-w-0">
                <div className="text-sm font-bold text-amber-100">내 지갑</div>
                <div className="text-[10px] text-amber-200/70">
                  카드 · PCL 슬랩
                </div>
              </div>
            </Link>
            <Link
              href="/center"
              className="rounded-2xl p-3 border border-fuchsia-400/30 bg-fuchsia-400/5 hover:bg-fuchsia-400/10 transition flex items-center gap-3"
            >
              <span className="text-2xl">🏛️</span>
              <div className="min-w-0">
                <div className="text-sm font-bold text-fuchsia-100">
                  내 센터
                </div>
                <div className="text-[10px] text-fuchsia-200/70">
                  보관함 · 전시
                </div>
              </div>
            </Link>
            <button
              type="button"
              onClick={() => setTauntOpen(true)}
              style={{ touchAction: "manipulation" }}
              className="col-span-2 sm:col-span-1 rounded-2xl p-3 border border-rose-400/30 bg-rose-400/5 hover:bg-rose-400/10 transition flex items-center gap-3 text-left active:scale-[0.98]"
            >
              <span className="text-2xl">🔥</span>
              <div className="min-w-0">
                <div className="text-sm font-bold text-rose-100">조롱 기록</div>
                <div className="text-[10px] text-rose-200/70">
                  보낸 · 받은 조롱
                </div>
              </div>
            </button>
          </section>

          {error && (
            <div className="mt-4 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/40 text-rose-200 text-xs">
              {error}
            </div>
          )}

          {!profile?.character_locked && (
          <section className="mt-7">
            <h2 className="text-sm font-bold text-white inline-flex items-center gap-1.5">
              <span aria-hidden>🎭</span>캐릭터 선택
            </h2>
            <p className="mt-1 text-[11px] text-rose-300 font-semibold">
              ⚠️ 캐릭터는 한 번 선택하면 변경할 수 없어요. 신중하게 골라주세요.
            </p>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {CHARACTERS.map((def) => {
                const active = profile?.character === def.key;
                const locked = profile?.character_locked && !active;
                return (
                  <button
                    key={def.key}
                    type="button"
                    onClick={() => onPickCharacter(def)}
                    disabled={savingChar || locked}
                    style={{ touchAction: "manipulation" }}
                    className={clsx(
                      "relative rounded-2xl p-3 border transition text-left",
                      active
                        ? "bg-white text-zinc-900 border-white shadow-[0_0_28px_-6px_rgba(255,255,255,0.55)]"
                        : locked
                        ? "bg-white/5 border-white/10 text-zinc-500 opacity-50 cursor-not-allowed"
                        : "bg-white/5 border-white/10 text-zinc-200 hover:bg-white/10"
                    )}
                  >
                    <CharacterAvatar def={def} size="md" />
                    <div className="mt-2 flex items-center justify-between gap-1">
                      <span className="text-sm font-bold">{def.name}</span>
                      <span
                        className={clsx(
                          "text-[10px] font-semibold px-1.5 py-0.5 rounded",
                          active
                            ? "bg-zinc-900 text-white"
                            : "bg-white/10 text-zinc-300"
                        )}
                      >
                        {def.gender}
                      </span>
                    </div>
                    {active && (
                      <span className="absolute top-1.5 right-1.5 text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-400 text-zinc-900">
                        ✓ 선택됨
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
          )}

          <PetSlotsByTypeSection
            slotsByType={slotsByType}
            allRegisteredPets={allRegisteredPets}
            eligibleSlabs={eligibleSlabs}
            onPick={(type, slot) => setPicker({ type, slot })}
            onRemove={onRemoveSlotForType}
          />

          <section className="mt-10 mb-6 flex justify-center">
            <button
              type="button"
              onClick={() => {
                if (window.confirm("로그아웃 할까요?")) logout();
              }}
              className="text-[11px] text-zinc-500 hover:text-rose-300 underline underline-offset-2"
              style={{ touchAction: "manipulation" }}
            >
              로그아웃
            </button>
          </section>
        </>
      )}

      <AnimatePresence>
        {picker && profile && (
          <SlabPicker
            slabs={eligibleSlabs}
            disabledIds={
              new Set(allRegisteredPets.map((c) => c.id))
            }
            defenseIds={defenseIds}
            lockedCardIds={
              new Set(allRegisteredPets.map((c) => c.card_id))
            }
            displayedIds={displayedIds}
            slotIndex={picker.slot}
            forcedType={picker.type}
            error={error}
            onClose={() => {
              setError(null);
              setPicker(null);
            }}
            onPick={(id) => onSelectSlabForType(picker.type, picker.slot, id)}
          />
        )}
        {nameOpen && user && (
          <NicknameModal
            current={user.display_name ?? ""}
            onClose={() => setNameOpen(false)}
            onSaved={async () => {
              await refreshMe();
              setNameOpen(false);
            }}
            onSubmit={async (next) => {
              const res = await rpcUpdateDisplayName(user.id, next);
              return res;
            }}
          />
        )}
        {tauntOpen && user && (
          <TauntHistoryModal
            userId={user.id}
            onClose={() => setTauntOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function CountUp({
  value,
  className,
  duration = 0.6,
}: {
  value: number;
  className?: string;
  duration?: number;
}) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(reduce ? value : 0);
  const playedRef = useRef(false);

  useEffect(() => {
    if (playedRef.current) {
      // After first play, snap to current value on subsequent updates.
      setDisplay(value);
      return;
    }
    playedRef.current = true;
    if (reduce) {
      setDisplay(value);
      return;
    }
    const controls = animate(0, value, {
      duration,
      ease: [0.4, 0, 0.2, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [value, reduce, duration]);

  return (
    <span className={className}>
      {display.toLocaleString("ko-KR")}
    </span>
  );
}

function ProfileBanner({
  character,
  displayName,
  slotsUsed,
  centerPower,
  pokedexCount,
  onEditName,
  userId,
}: {
  character: CharacterDef | null;
  displayName: string;
  slotsUsed: number;
  centerPower: number;
  pokedexCount: number;
  onEditName: () => void;
  userId: string | null;
}) {
  const reduce = useReducedMotion();
  const [medals, setMedals] = useState<UserGymMedal[]>([]);
  useEffect(() => {
    if (!userId) {
      setMedals([]);
      return;
    }
    let alive = true;
    fetchUserGymMedals(userId).then((m) => {
      if (alive) setMedals(m);
    });
    return () => {
      alive = false;
    };
  }, [userId]);
  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 via-white/[0.02] to-transparent p-3 md:p-4">
      <div className="flex items-center gap-3">
        {character ? (
          <motion.div
            initial={reduce ? { opacity: 0 } : { scale: 0.7, opacity: 0, rotate: -6 }}
            animate={reduce ? { opacity: 1 } : { scale: 1, opacity: 1, rotate: 0 }}
            transition={
              reduce
                ? { duration: 0.2 }
                : { type: "spring", stiffness: 320, damping: 18 }
            }
          >
            <CharacterAvatar def={character} size="md" />
          </motion.div>
        ) : (
          <div className="shrink-0 w-14 h-14 rounded-xl bg-white/5 border border-dashed border-white/20 flex items-center justify-center text-2xl">
            ❓
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h2 className="text-base md:text-lg font-black text-white truncate">
              {displayName || "이름 없음"}
            </h2>
            <button
              type="button"
              onClick={onEditName}
              aria-label="닉네임 변경"
              className="shrink-0 w-7 h-7 rounded-full bg-white/10 hover:bg-white/15 text-zinc-100 border border-white/10 inline-flex items-center justify-center text-xs"
              style={{ touchAction: "manipulation" }}
            >
              ✏️
            </button>
          </div>
          {medals.length > 0 ? (
            <div className="mt-1 flex items-center gap-1 flex-wrap">
              {medals.map((m) => (
                <span
                  key={m.gym_id}
                  className="inline-flex items-center gap-0.5 pl-0.5 pr-1.5 py-0.5 rounded-full bg-amber-400/15 border border-amber-400/40 text-amber-100"
                  title={`${m.gym_name} (${m.gym_type}) — ${m.gym_difficulty}`}
                >
                  <GymMedalIcon type={m.gym_type} size={18} />
                  <span className="text-[10px] font-black">{m.medal_name}</span>
                </span>
              ))}
            </div>
          ) : !character ? (
            <p className="mt-0.5 text-[10px] text-zinc-400">
              캐릭터를 선택해주세요
            </p>
          ) : (
            <p className="mt-1 text-[10px] text-zinc-500">
              아직 보유한 체육관 메달이 없어요
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <div className="min-h-[68px] flex flex-col items-center justify-center rounded-lg bg-rose-500/10 border border-rose-500/30 px-2 py-1.5 text-center">
          <div className="text-[9px] uppercase tracking-wider text-rose-300/80">
            ⚔️ 전투력
          </div>
          <div className="mt-0.5 text-sm md:text-base font-black tabular-nums text-rose-200 leading-tight">
            <CountUp value={centerPower} />
          </div>
        </div>
        <div className="min-h-[68px] flex flex-col items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-2 py-1.5 text-center">
          <div className="text-[9px] uppercase tracking-wider text-emerald-300/80">
            📔 도감
          </div>
          <div className="mt-0.5 text-sm md:text-base font-black tabular-nums text-emerald-200 leading-tight">
            <CountUp value={pokedexCount} />
            <span className="text-[9px] text-emerald-300/60 font-semibold">
              {" "}/ {getAllCatalogCards().length.toLocaleString("ko-KR")}
            </span>
          </div>
        </div>
        <div className="min-h-[68px] flex flex-col items-center justify-center rounded-lg bg-amber-400/10 border border-amber-400/30 px-2 py-1.5 text-center">
          <div className="text-[9px] uppercase tracking-wider text-amber-300/80">
            🐾 펫
          </div>
          <div className="mt-0.5 text-sm md:text-base font-black tabular-nums text-amber-200 leading-tight">
            {slotsUsed}
            <span className="text-[9px] text-amber-300/60 font-semibold">
              마리
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CharacterAvatar({
  def,
  size = "md",
}: {
  def: CharacterDef;
  size?: "xs" | "sm" | "md" | "lg";
}) {
  const dim =
    size === "xs"
      ? "w-7 h-7"
      : size === "sm"
      ? "w-12 h-12"
      : size === "lg"
      ? "w-24 h-24 md:w-28 md:h-28"
      : "w-20 h-20 md:w-24 md:h-24";
  const [broken, setBroken] = useState(false);
  return (
    <div
      className={clsx(
        "shrink-0 rounded-2xl overflow-hidden ring-2 relative",
        def.ring,
        "bg-gradient-to-br",
        def.gradient,
        dim
      )}
    >
      {!broken ? (
        <img
          src={def.spriteUrl}
          alt={def.name}
          loading="lazy"
          draggable={false}
          onError={() => setBroken(true)}
          style={{ imageRendering: "pixelated" }}
          className={clsx(
            "absolute inset-0 w-full h-full object-contain p-1.5 select-none pointer-events-none",
            def.motion === "css-bob" && "animate-avatar-bob"
          )}
        />
      ) : (
        <div
          className="absolute inset-0 flex items-center justify-center text-2xl animate-avatar-bob"
          aria-hidden
        >
          {def.emoji}
        </div>
      )}
    </div>
  );
}

/** 등록된 펫의 속성 분포 — type 별 count 칩 (풀 3 · 물 2 · 전기 5). */
/** spec 2-1: 속성별 펫 슬롯 섹션. 18 type 중 사용자가 (a) 등록했거나
 *  (b) eligible PCL10 카드를 보유한 type 만 노출 — 18 type 모두 항상
 *  보여주면 모바일에서 스크롤 부담. */
function PetSlotsByTypeSection({
  slotsByType,
  allRegisteredPets,
  eligibleSlabs,
  onPick,
  onRemove,
}: {
  slotsByType: Record<string, (ProfileMainCard | null)[]>;
  allRegisteredPets: ProfileMainCard[];
  eligibleSlabs: PclGradingWithDisplay[];
  onPick: (type: WildType, slot: number) => void;
  onRemove: (type: WildType, gradingId: string) => void;
}) {
  // type 우선 순서 — 8 gym type 먼저, 나머지 10 type 뒤로.
  const TYPE_ORDER: WildType[] = [
    "풀", "불꽃", "물", "전기", "얼음", "바위", "땅", "에스퍼",
    "격투", "독", "비행", "벌레", "고스트", "드래곤", "악", "강철", "페어리", "노말",
  ];

  // 보유 PCL10 의 type 별 카운트 — eligible 카드 중 type 로 분류 가능한 것.
  // dual-type: MUR/UR 은 1차+2차 모두 카운트 (양쪽 type 슬롯에 모두 노출).
  const eligibleByType = useMemo(() => {
    const m = new Map<WildType, number>();
    const bump = (t: WildType | null) => {
      if (!t) return;
      m.set(t, (m.get(t) ?? 0) + 1);
    };
    for (const g of eligibleSlabs) {
      const card = getCard(g.card_id);
      if (!card) continue;
      const t1 =
        getCardPrimaryOverride(card.id) ?? resolveCardType(card.name);
      const t2 = getCardSecondaryType(card.id);
      bump(t1);
      bump(t2);
    }
    return m;
  }, [eligibleSlabs]);

  // 노출 type — 등록 1+ OR eligible 1+.
  const allVisibleTypes = TYPE_ORDER.filter(
    (t) =>
      (slotsByType[t]?.some(Boolean) ?? false) ||
      (eligibleByType.get(t) ?? 0) > 0
  );

  // 속성 필터 — "전체" or 단일 type. 사용자 요청: 18 type 카드가 너무
  // 많아 스크롤 부담 → chip 으로 풀 누르면 풀만, 등으로 토글.
  const [filterType, setFilterType] = useState<WildType | "ALL">("ALL");
  const visibleTypes =
    filterType === "ALL"
      ? allVisibleTypes
      : allVisibleTypes.filter((t) => t === filterType);

  return (
    <section className="mt-8">
      <div className="flex items-end justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-sm font-bold text-white inline-flex items-center gap-1.5">
            <span aria-hidden>🐾</span>속성별 펫 슬롯
          </h2>
          <p className="mt-1 text-[11px] text-zinc-400">
            속성별 최대 {PETS_PER_TYPE}마리 · PCL 10 만 등록 가능.
            등록 등급별 펫 등록 전투력: MUR 40k · UR 20k · SAR 12k · SR 7k.
          </p>
        </div>
        <span className="text-[11px] text-zinc-400 tabular-nums">
          총 {allRegisteredPets.length}마리 등록
        </span>
      </div>

      {/* 속성 필터 chip — 가로 스크롤. "전체" + 노출 type 만. */}
      {allVisibleTypes.length > 0 && (
        <div className="mt-2 flex items-center gap-1 overflow-x-auto no-scrollbar -mx-1 px-1">
          <button
            type="button"
            onClick={() => setFilterType("ALL")}
            style={{ touchAction: "manipulation" }}
            className={clsx(
              "shrink-0 h-7 px-2.5 rounded-full text-[10px] font-bold border transition",
              filterType === "ALL"
                ? "bg-white text-zinc-900 border-white"
                : "bg-white/5 text-zinc-300 border-white/10 hover:bg-white/10"
            )}
          >
            전체
            <span className="ml-1 text-[9px] opacity-75 tabular-nums">
              {allVisibleTypes.length}
            </span>
          </button>
          {allVisibleTypes.map((t) => {
            const ts = TYPE_STYLE[t];
            const filled = (slotsByType[t] ?? []).filter(Boolean).length;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setFilterType(t)}
                style={{ touchAction: "manipulation" }}
                className={clsx(
                  "shrink-0 h-7 px-2.5 rounded-full text-[10px] font-bold border transition inline-flex items-center gap-1",
                  filterType === t
                    ? clsx("border-white", ts.badge)
                    : "bg-white/5 text-zinc-300 border-white/10 hover:bg-white/10"
                )}
              >
                {t}
                {filled > 0 && (
                  <span className="text-[8px] opacity-90 tabular-nums">
                    {filled}/{PETS_PER_TYPE}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {visibleTypes.length === 0 ? (
        <p className="mt-3 text-[11px] text-amber-200/80">
          {filterType === "ALL"
            ? "아직 등록 가능한 PCL10 슬랩이 없어요. 감별에서 10등급을 노려보세요."
            : `${filterType} 속성 PCL10 슬랩이 없어요.`}
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {visibleTypes.map((t) => {
            const slots = slotsByType[t] ?? [null, null, null];
            const filled = slots.filter(Boolean).length;
            const ts = TYPE_STYLE[t];
            const eligibleCount = eligibleByType.get(t) ?? 0;
            return (
              <div
                key={t}
                className="rounded-xl border border-white/10 bg-zinc-900/40"
              >
                <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/5">
                  <span
                    className={clsx(
                      "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black",
                      ts.badge
                    )}
                  >
                    {t}
                  </span>
                  <span className="ml-auto text-[10px] text-zinc-400 tabular-nums">
                    {filled}/{PETS_PER_TYPE}
                    {eligibleCount > 0 && (
                      <span className="ml-1 text-zinc-500">
                        · 보유 {eligibleCount}장
                      </span>
                    )}
                  </span>
                </div>
                <LayoutGroup>
                  <div className="grid grid-cols-3 gap-1.5 p-2">
                    {slots.map((slot, i) => (
                      <PetSlot
                        key={slot ? slot.id : `empty-${t}-${i}`}
                        index={i}
                        card={slot}
                        onPick={() => onPick(t, i)}
                        onRemove={
                          slot ? () => onRemove(t, slot.id) : () => undefined
                        }
                      />
                    ))}
                  </div>
                </LayoutGroup>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function PetTypeBreakdown({
  slots,
}: {
  slots: (ProfileMainCard | null)[];
}) {
  const counts = useMemo(() => {
    const map = new Map<WildType, number>();
    for (const s of slots) {
      if (!s) continue;
      const card = getCard(s.card_id);
      if (!card) continue;
      const t = resolveCardType(card.name);
      if (!t) continue;
      map.set(t, (map.get(t) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [slots]);

  if (counts.length === 0) return null;
  return (
    <div className="mt-2 flex items-center gap-1 flex-wrap">
      {counts.map(([type, count]) => (
        <span
          key={type}
          className={clsx(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-black",
            TYPE_STYLE[type].badge
          )}
        >
          {type}
          <span className="font-mono tabular-nums opacity-90">{count}</span>
        </span>
      ))}
    </div>
  );
}

function PetSlot({
  index,
  card,
  onPick,
  onRemove,
}: {
  index: number;
  card: ProfileMainCard | null;
  onPick: () => void;
  onRemove: () => void;
}) {
  const reduce = useReducedMotion();
  const layoutProps = reduce
    ? {}
    : {
        layout: true as const,
        transition: { type: "spring" as const, stiffness: 380, damping: 30 },
      };
  if (!card) {
    return (
      <motion.button
        {...layoutProps}
        type="button"
        onClick={onPick}
        whileTap={{ scale: 0.96 }}
        style={{ touchAction: "manipulation" }}
        className="relative aspect-[5/7] rounded-xl border-2 border-dashed border-white/15 bg-white/[0.02] hover:bg-white/5 hover:border-amber-300/50 transition-colors flex flex-col items-center justify-center gap-0.5 p-1 text-zinc-400 hover:text-amber-200"
      >
        <span className="text-lg leading-none" aria-hidden>+</span>
        <span className="text-[8px] font-semibold uppercase tracking-wider">
          {index + 1}
        </span>
      </motion.button>
    );
  }
  const cardDef = getCard(card.card_id);
  if (!cardDef) {
    return (
      <motion.button
        {...layoutProps}
        type="button"
        onClick={onRemove}
        className="aspect-[5/7] rounded-2xl bg-rose-500/10 border border-rose-500/40 text-rose-200 text-xs p-2"
      >
        카드 정보 없음 — 눌러서 해제
      </motion.button>
    );
  }
  const rstyle = RARITY_STYLE[cardDef.rarity];
  return (
    <motion.div
      {...layoutProps}
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.85, y: 8 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.85 }}
      className="relative"
    >
      <motion.button
        type="button"
        onClick={onPick}
        whileHover={reduce ? undefined : { scale: 1.04 }}
        whileTap={{ scale: 0.97 }}
        aria-label={`${cardDef.name} 펫 변경`}
        style={{ touchAction: "manipulation" }}
        className={clsx(
          "relative block w-full aspect-[5/7] rounded-xl overflow-hidden ring-2 bg-zinc-900",
          rstyle.frame,
          rstyle.glow
        )}
      >
        {cardDef.imageUrl ? (
          <img
            src={cardDef.imageUrl}
            alt=""
            draggable={false}
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          />
        ) : (
          <div className="absolute inset-0 bg-zinc-800" />
        )}
        <span
          className={clsx(
            "absolute top-0.5 left-0.5 text-[8px] font-black px-1 py-0.5 rounded leading-none",
            rstyle.badge
          )}
        >
          {cardDef.rarity}
        </span>
        {(() => {
          // 1차: MUR 8 재지정 override 우선, 그 외 카드명 lookup.
          const ptype = getCardPrimaryOverride(cardDef.id) ?? resolveCardType(cardDef.name);
          // 2차: MUR/UR 매핑에서 (SAR 이하는 매핑 미존재 → null).
          const ptype2 = getCardSecondaryType(cardDef.id);
          if (!ptype && !ptype2) return null;
          return (
            <div className="absolute bottom-1 right-1 flex flex-col items-end gap-0.5">
              {ptype && (
                <span
                  className={clsx(
                    "text-[10px] md:text-[11px] font-black px-1.5 py-0.5 rounded leading-none shadow",
                    TYPE_STYLE[ptype].badge
                  )}
                >
                  {ptype}
                </span>
              )}
              {ptype2 && (
                <span
                  className={clsx(
                    "text-[9px] md:text-[10px] font-black px-1.5 py-0.5 rounded leading-none shadow",
                    TYPE_STYLE[ptype2].badge
                  )}
                >
                  {ptype2}
                </span>
              )}
            </div>
          );
        })()}
      </motion.button>
      <button
        type="button"
        onClick={onRemove}
        aria-label="해제"
        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-500 hover:bg-rose-400 text-white text-[10px] font-black shadow-lg flex items-center justify-center ring-2 ring-zinc-950 transition active:scale-90"
        style={{ touchAction: "manipulation" }}
      >
        ✕
      </button>
    </motion.div>
  );
}

function SlabPicker({
  slabs,
  disabledIds,
  lockedCardIds,
  displayedIds,
  defenseIds,
  slotIndex,
  forcedType = null,
  error = null,
  onClose,
  onPick,
}: {
  slabs: PclGradingWithDisplay[];
  disabledIds: Set<string>;
  lockedCardIds: Set<string>;
  displayedIds: Set<string>;
  defenseIds: Set<string>;
  slotIndex: number;
  /** 속성별 슬롯에서 호출되면 type 강제. filter chip 숨김 + 초기값 고정. */
  forcedType?: WildType | null;
  /** 등록 시도 후 서버에서 받은 에러 메시지. 모달 안에서 노출. */
  error?: string | null;
  onClose: () => void;
  onPick: (id: string) => void;
}) {
  // 페이징 + 타입 필터 + 무한 스크롤 — 큰 슬랩 풀에서 렉 제거.
  const PAGE_SIZE = 12;
  const [typeFilter, setTypeFilter] = useState<WildType | "ALL">(
    forcedType ?? "ALL"
  );
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const releaseLock = lockBodyScroll();
    return releaseLock;
  }, []);

  // 타입별 카운트 — 칩 옆 표기 + 필터 가용성.
  // dual-type: MUR/UR 은 1차+2차 모두 카운트 (필터 칩에 양쪽 노출).
  const typeCounts = useMemo(() => {
    const m = new Map<WildType, number>();
    const bump = (t: WildType | null) => {
      if (!t) return;
      m.set(t, (m.get(t) ?? 0) + 1);
    };
    for (const g of slabs) {
      const card = getCard(g.card_id);
      if (!card) continue;
      const t1 =
        getCardPrimaryOverride(card.id) ?? resolveCardType(card.name);
      const t2 = getCardSecondaryType(card.id);
      bump(t1);
      bump(t2);
    }
    return m;
  }, [slabs]);
  const sortedTypes = useMemo(
    () =>
      (Array.from(typeCounts.entries()) as [WildType, number][])
        .sort((a, b) => b[1] - a[1]),
    [typeCounts]
  );

  // 필터 적용된 풀. dual-type either-type 매칭.
  const filteredSlabs = useMemo(() => {
    if (typeFilter === "ALL") return slabs;
    return slabs.filter((g) => {
      const card = getCard(g.card_id);
      if (!card) return false;
      const t1 =
        getCardPrimaryOverride(card.id) ?? resolveCardType(card.name);
      const t2 = getCardSecondaryType(card.id);
      return t1 === typeFilter || t2 === typeFilter;
    });
  }, [slabs, typeFilter]);

  // 필터 변경 시 페이지 reset.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [typeFilter]);

  // 같은 카드의 같은 PCL 등급 슬랩들을 한 칸으로 묶음. 사용 가능한
  // 첫 슬랩을 rep 로 선택 (펫 등록은 카드당 1장만 가능하므로 그룹
  // 클릭은 사실상 그 카드 등록).
  const slabGroups = useMemo(
    () =>
      groupGradings(filteredSlabs, (g) => ({
        cardId: g.card_id,
        grade: g.grade,
      })),
    [filteredSlabs]
  );
  const visibleGroups = slabGroups.slice(0, visibleCount);
  const hasMore = visibleCount < slabGroups.length;

  // 무한 스크롤 — scroll 이벤트 + IntersectionObserver(sentinel)
  // + ResizeObserver(레이아웃 변경) 조합. 첫 mount(motion.div spring
  // 애니메이션 직후) 에 layout 이 채 settle 되지 않은 케이스를 모두
  // 커버하기 위해 multi-trigger.
  // - scroll: 사용자 스크롤
  // - IO(sentinel, root=scrollEl): sentinel 가 가까워지면 자동 페이지
  // - RO(scrollEl): 레이아웃 변경(애니메이션, 이미지 로드) 후 재체크
  // - rAF + setTimeout: 첫 commit 직후 + 후속 다중 체크
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let cancelled = false;
    const check = () => {
      if (cancelled || !hasMore) return;
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (scrollHeight <= clientHeight + 40) {
        setVisibleCount((v) => v + PAGE_SIZE);
        return;
      }
      if (scrollTop + clientHeight >= scrollHeight - 240) {
        setVisibleCount((v) => v + PAGE_SIZE);
      }
    };
    el.addEventListener("scroll", check, { passive: true });

    let io: IntersectionObserver | null = null;
    const sentinel = sentinelRef.current;
    if (sentinel && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        (entries) => {
          if (cancelled || !hasMore) return;
          if (entries.some((e) => e.isIntersecting)) {
            setVisibleCount((v) => v + PAGE_SIZE);
          }
        },
        { root: el, rootMargin: "240px 0px" }
      );
      io.observe(sentinel);
    }

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(check);
      ro.observe(el);
    }

    const t1 = requestAnimationFrame(check);
    const t2 = setTimeout(check, 100);
    const t3 = setTimeout(check, 350);
    const t4 = setTimeout(check, 800);
    return () => {
      cancelled = true;
      el.removeEventListener("scroll", check);
      io?.disconnect();
      ro?.disconnect();
      cancelAnimationFrame(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [hasMore, visibleCount, filteredSlabs.length, typeFilter]);

  return (
    <Portal>
      <motion.div
        className="fixed inset-0 z-[160] bg-black/85 backdrop-blur-md flex items-end md:items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          paddingTop: "max(env(safe-area-inset-top, 0px), 12px)",
          paddingBottom: "max(env(safe-area-inset-bottom, 0px), 12px)",
          paddingLeft: 12,
          paddingRight: 12,
        }}
      >
        <motion.div
          className="relative w-full max-w-lg bg-zinc-950 border border-white/10 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
          style={{ maxHeight: "calc(100dvh - 24px)" }}
          initial={{ y: 32, opacity: 0, scale: 0.97 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 32, opacity: 0, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 220, damping: 24 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="shrink-0 flex items-center justify-between gap-3 px-4 h-12 border-b border-white/10 bg-gradient-to-r from-amber-500/10 via-fuchsia-500/10 to-indigo-500/10">
            <h2 className="text-sm font-bold text-white inline-flex items-center gap-1.5">
              <span aria-hidden>🐾</span>
              {forcedType
                ? `${forcedType} 속성 슬롯 ${slotIndex + 1} 펫 선택`
                : `슬롯 ${slotIndex + 1} 펫 선택`}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white inline-flex items-center justify-center"
            >
              ✕
            </button>
          </div>

          {/* 타입 필터 칩 — forcedType 있으면 숨김 (이미 픽되어 있어
              사용자가 다른 type 으로 바꿀 수 없게). */}
          {!forcedType && (
            <div className="shrink-0 px-3 py-2 border-b border-white/10 bg-black/40">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
                <button
                  type="button"
                  onClick={() => setTypeFilter("ALL")}
                  style={{ touchAction: "manipulation" }}
                  className={clsx(
                    "shrink-0 h-8 px-2.5 rounded-full text-[11px] font-bold border transition",
                    typeFilter === "ALL"
                      ? "bg-white text-zinc-900 border-white"
                      : "bg-white/5 text-zinc-300 border-white/10 hover:bg-white/10"
                  )}
                >
                  전체
                  <span className="ml-1 text-[9px] opacity-75 tabular-nums">
                    {slabs.length}
                  </span>
                </button>
                {sortedTypes.map(([t, n]) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTypeFilter(t)}
                    style={{ touchAction: "manipulation" }}
                    className={clsx(
                      "shrink-0 h-8 px-2.5 rounded-full text-[11px] font-bold border transition inline-flex items-center gap-1",
                      typeFilter === t
                        ? clsx("border-white", TYPE_STYLE[t].badge)
                        : "bg-white/5 text-zinc-300 border-white/10 hover:bg-white/10"
                    )}
                  >
                    {t}
                    <span className="text-[9px] opacity-80 tabular-nums">{n}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div
            ref={scrollRef}
            className="flex-1 min-h-0 overflow-y-auto px-3 py-3"
          >
            {filteredSlabs.length === 0 ? (
              <p className="px-2 py-10 text-center text-sm text-zinc-400">
                {typeFilter === "ALL"
                  ? "등록 가능한 PCL10 슬랩이 없어요."
                  : `${typeFilter} 속성의 PCL10 슬랩이 없어요.`}
              </p>
            ) : (
              <>
                <ul className="grid grid-cols-3 gap-2">
                  {visibleGroups.map((group) => {
                    // 그룹 내 사용가능 인스턴스 수량 계산 — 1+ 면 등록 가능.
                    // displayed/defense/이미 펫 인스턴스 제외한 나머지가
                    // "사용 가능 수량".
                    const usableInGroup = group.all.filter(
                      (s) =>
                        !disabledIds.has(s.id) &&
                        !displayedIds.has(s.id) &&
                        !defenseIds.has(s.id)
                    );
                    const totalCount = group.count;
                    const usableCount = usableInGroup.length;
                    // 클릭 시 보낼 슬랩 — 사용가능 첫 슬랩. 없으면 rep
                    // (어차피 disabled 라 onPick 안 불림).
                    const usable = usableInGroup[0] ?? group.rep;
                    const g = usable;
                    const card = getCard(g.card_id);
                    if (!card) return null;
                    // 같은 card_id 가 다른 슬롯에 이미 펫으로 등록돼 있으면
                    // 중복 등록 spec 으로 차단 (서버 set_pet_for_type 도 동일).
                    const sameCardTaken = lockedCardIds.has(g.card_id);
                    // 그룹 단위 차단 — 사용가능 0 또는 같은 카드 중복.
                    const blocked = usableCount === 0 || sameCardTaken;
                    // 라벨 우선순위 — 중복 > 모두 잠김(전시/방어덱/펫) > 일반.
                    const allOnShowcase =
                      usableCount === 0 &&
                      group.all.every((s) => displayedIds.has(s.id));
                    const allOnDefense =
                      usableCount === 0 &&
                      group.all.every((s) => defenseIds.has(s.id));
                    const allTaken =
                      usableCount === 0 &&
                      group.all.every((s) => disabledIds.has(s.id));
                    return (
                      <li key={`${g.card_id}@${g.grade}`}>
                        <button
                          type="button"
                          disabled={blocked}
                          onClick={() => onPick(g.id)}
                          style={{ touchAction: "manipulation" }}
                          className={clsx(
                            "relative block w-full text-left rounded-xl p-1 transition",
                            blocked
                              ? "opacity-40 cursor-not-allowed"
                              : "hover:bg-white/5 active:scale-[0.98]"
                          )}
                          title={
                            sameCardTaken
                              ? "이미 같은 카드가 펫으로 등록돼 있어요."
                              : allTaken
                              ? "모든 인스턴스가 이미 펫으로 등록됨."
                              : allOnShowcase
                              ? "보유 인스턴스 모두 센터에 전시 중. 전시 해제 후 등록 가능."
                              : allOnDefense
                              ? "보유 인스턴스 모두 방어 덱에 등록됨. 방어덱 해제 후 등록 가능."
                              : usableCount < totalCount
                              ? `${totalCount}장 보유 / 사용 가능 ${usableCount}장`
                              : totalCount > 1
                              ? `${totalCount}장 보유`
                              : undefined
                          }
                        >
                          <PclSlab
                            card={card}
                            grade={g.grade}
                            size="sm"
                            quantity={totalCount}
                          />
                          {/* 사용가능 < 보유 일 때 작은 사용량 라벨 노출. */}
                          {usableCount > 0 && usableCount < totalCount && (
                            <span className="absolute bottom-7 right-1 text-[9px] font-bold px-1 py-0.5 rounded bg-emerald-500/85 text-zinc-950 ring-1 ring-emerald-300/60">
                              사용 {usableCount}
                            </span>
                          )}
                          <p className="mt-1 px-1 text-[10px] font-bold text-white truncate">
                            {card.name}
                          </p>
                          <p className="px-1 text-[9px] text-zinc-500 truncate">
                            {SETS[card.setCode]?.name ?? card.setCode} · #{card.number}
                          </p>
                          {/* 1차 + 2차 속성 배지 (MUR/UR 만 2차 노출) */}
                          {(() => {
                            const t1 =
                              getCardPrimaryOverride(card.id) ??
                              resolveCardType(card.name);
                            const t2 = getCardSecondaryType(card.id);
                            if (!t1 && !t2) return null;
                            return (
                              <div className="mt-0.5 px-1 flex items-center gap-0.5 flex-wrap">
                                {t1 && (
                                  <span
                                    className={clsx(
                                      "text-[8px] font-black px-1 py-[1px] rounded leading-none",
                                      TYPE_STYLE[t1].badge
                                    )}
                                  >
                                    {t1}
                                  </span>
                                )}
                                {t2 && (
                                  <span
                                    className={clsx(
                                      "text-[8px] font-black px-1 py-[1px] rounded leading-none",
                                      TYPE_STYLE[t2].badge
                                    )}
                                  >
                                    {t2}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                          {allTaken && (
                            <span className="absolute top-2 left-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-300 ring-1 ring-white/10">
                              등록됨
                            </span>
                          )}
                          {!allTaken && allOnShowcase && (
                            <span className="absolute top-2 left-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/90 text-zinc-950 ring-1 ring-amber-300/60">
                              전시 중
                            </span>
                          )}
                          {!allTaken && !allOnShowcase && allOnDefense && (
                            <span className="absolute top-2 left-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-fuchsia-500/90 text-white ring-1 ring-fuchsia-300/60">
                              방어 덱
                            </span>
                          )}
                          {sameCardTaken && usableCount > 0 && (
                            <span className="absolute top-2 left-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-fuchsia-500/90 text-white ring-1 ring-fuchsia-300/60">
                              중복
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {hasMore && (
                  <div
                    ref={sentinelRef}
                    className="py-4 flex items-center justify-center text-[11px] text-zinc-500"
                  >
                    더 불러오는 중... ({visibleGroups.length}/{slabGroups.length})
                  </div>
                )}
                {!hasMore && slabGroups.length > PAGE_SIZE && (
                  <p className="py-3 text-center text-[11px] text-zinc-500">
                    모두 표시됨 ({filteredSlabs.length}장 · {slabGroups.length}종)
                  </p>
                )}
              </>
            )}
          </div>

          {error && (
            <div className="shrink-0 mx-3 mb-2 px-3 py-2 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-200 text-[12px] leading-snug">
              {error}
            </div>
          )}

          <div className="shrink-0 border-t border-white/10 p-3 bg-black/40">
            <button
              type="button"
              onClick={onClose}
              className="w-full h-11 rounded-xl bg-white text-zinc-900 font-bold text-sm active:scale-[0.98]"
              style={{ touchAction: "manipulation" }}
            >
              닫기
            </button>
          </div>
        </motion.div>
      </motion.div>
    </Portal>
  );
}

function NicknameModal({
  current,
  onClose,
  onSubmit,
  onSaved,
}: {
  current: string;
  onClose: () => void;
  onSubmit: (
    next: string
  ) => Promise<{ ok: boolean; error?: string; display_name?: string }>;
  onSaved: () => void | Promise<void>;
}) {
  const [value, setValue] = useState(current);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const releaseLock = lockBodyScroll();
    return releaseLock;
  }, []);

  const trimmed = value.trim();
  const tooShort = trimmed.length < DISPLAY_NAME_MIN;
  const tooLong = trimmed.length > DISPLAY_NAME_MAX;
  const same = trimmed === current.trim();
  const disabled = saving || tooShort || tooLong || same;

  const submit = async () => {
    if (disabled) return;
    setSaving(true);
    setErr(null);
    const res = await onSubmit(trimmed);
    setSaving(false);
    if (!res.ok) {
      setErr(res.error ?? "닉네임을 변경하지 못했어요.");
      return;
    }
    await onSaved();
  };

  return (
    <Portal>
      <motion.div
        className="fixed inset-0 z-[170] bg-black/85 backdrop-blur-md flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          paddingTop: "max(env(safe-area-inset-top, 0px), 12px)",
          paddingBottom: "max(env(safe-area-inset-bottom, 0px), 12px)",
          paddingLeft: 12,
          paddingRight: 12,
        }}
      >
        <motion.div
          className="relative w-full max-w-sm bg-zinc-950 border border-white/10 rounded-2xl overflow-hidden shadow-2xl"
          initial={{ y: 24, opacity: 0, scale: 0.97 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 24, opacity: 0, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 220, damping: 24 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-3 px-4 h-12 border-b border-white/10 bg-gradient-to-r from-amber-500/10 via-fuchsia-500/10 to-indigo-500/10">
            <h2 className="text-sm font-bold text-white inline-flex items-center gap-1.5">
              <span aria-hidden>✏️</span>닉네임 변경
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white inline-flex items-center justify-center"
            >
              ✕
            </button>
          </div>

          <div className="p-4 space-y-3">
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              랭킹 · 선물 · 도촬에서 보일 새 닉네임을 입력하세요.
              <br />
              {DISPLAY_NAME_MIN}~{DISPLAY_NAME_MAX}자, 다른 사용자와 중복 불가.
            </p>
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              maxLength={DISPLAY_NAME_MAX + 4}
              placeholder="새 닉네임"
              autoFocus
              className="w-full h-11 px-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:border-amber-300/60 focus:bg-white/10"
            />
            <div className="flex items-center justify-between text-[10px] text-zinc-500 tabular-nums">
              <span>
                {tooShort
                  ? `${DISPLAY_NAME_MIN}자 이상 입력해주세요`
                  : tooLong
                  ? `${DISPLAY_NAME_MAX}자 이하로 입력해주세요`
                  : same
                  ? "현재 닉네임과 동일해요"
                  : "사용 가능"}
              </span>
              <span>
                {trimmed.length} / {DISPLAY_NAME_MAX}
              </span>
            </div>
            {err && (
              <div className="px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/40 text-rose-200 text-xs">
                {err}
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-white/10 p-3 bg-black/40 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 h-11 rounded-xl bg-white/10 hover:bg-white/15 text-zinc-100 font-bold text-sm active:scale-[0.98] disabled:opacity-50"
              style={{ touchAction: "manipulation" }}
            >
              취소
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={disabled}
              className={clsx(
                "flex-1 h-11 rounded-xl font-bold text-sm active:scale-[0.98]",
                disabled
                  ? "bg-white/20 text-zinc-400 cursor-not-allowed"
                  : "bg-amber-300 text-zinc-900 hover:bg-amber-200"
              )}
              style={{ touchAction: "manipulation" }}
            >
              {saving ? "저장 중…" : "변경"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </Portal>
  );
}

function formatTauntTime(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금";
  if (mins < 60) return `${mins}분 전`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}시간 전`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "어제";
  if (days < 7) return `${days}일 전`;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function TauntHistoryModal({
  userId,
  onClose,
}: {
  userId: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"sent" | "received">("received");
  const [loading, setLoading] = useState(true);
  const [sent, setSent] = useState<TauntEntry[]>([]);
  const [received, setReceived] = useState<TauntEntry[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const releaseLock = lockBodyScroll();
    return releaseLock;
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchTauntHistory(userId).then((res) => {
      if (!alive) return;
      if (!res.ok) {
        setErr(res.error ?? "조롱 기록을 불러오지 못했어요.");
      } else {
        setSent(res.sent);
        setReceived(res.received);
      }
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  const list = tab === "sent" ? sent : received;
  const emptyText =
    tab === "sent"
      ? "아직 보낸 조롱이 없어요"
      : "아직 받은 조롱이 없어요";

  return (
    <Portal>
      <motion.div
        className="fixed inset-0 z-[150] bg-black/85 backdrop-blur-md flex items-end md:items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          paddingTop: "max(env(safe-area-inset-top, 0px), 12px)",
          paddingBottom: "max(env(safe-area-inset-bottom, 0px), 12px)",
          paddingLeft: 12,
          paddingRight: 12,
        }}
      >
        <motion.div
          className="relative w-full max-w-lg bg-zinc-950 border border-white/10 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
          style={{ maxHeight: "calc(100dvh - 24px)" }}
          initial={{ y: 32, opacity: 0, scale: 0.97 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 32, opacity: 0, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 220, damping: 24 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="shrink-0 flex items-center justify-between gap-3 px-4 h-12 border-b border-white/10 bg-gradient-to-r from-rose-500/15 via-fuchsia-500/10 to-indigo-500/10">
            <h2 className="text-sm font-bold text-white inline-flex items-center gap-1.5 truncate">
              <span aria-hidden>🔥</span>
              <span className="truncate">
                조롱 기록 (보낸 {sent.length} · 받은 {received.length})
              </span>
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="shrink-0 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white inline-flex items-center justify-center"
            >
              ✕
            </button>
          </div>

          <div className="shrink-0 grid grid-cols-2 gap-1 px-3 pt-3 pb-2 bg-black/30 border-b border-white/5">
            <button
              type="button"
              onClick={() => setTab("received")}
              style={{ touchAction: "manipulation" }}
              className={clsx(
                "h-9 rounded-lg text-xs font-bold transition",
                tab === "received"
                  ? "bg-rose-500/20 text-rose-100 ring-1 ring-rose-400/40"
                  : "bg-white/5 text-zinc-400 hover:bg-white/10"
              )}
            >
              받은 조롱 {received.length > 0 && `· ${received.length}`}
            </button>
            <button
              type="button"
              onClick={() => setTab("sent")}
              style={{ touchAction: "manipulation" }}
              className={clsx(
                "h-9 rounded-lg text-xs font-bold transition",
                tab === "sent"
                  ? "bg-amber-400/20 text-amber-100 ring-1 ring-amber-300/40"
                  : "bg-white/5 text-zinc-400 hover:bg-white/10"
              )}
            >
              보낸 조롱 {sent.length > 0 && `· ${sent.length}`}
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-3">
            {loading ? (
              <div className="py-10 flex justify-center">
                <PokeLoader size="sm" />
              </div>
            ) : err ? (
              <div className="px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/40 text-rose-200 text-xs">
                {err}
              </div>
            ) : list.length === 0 ? (
              <p className="py-12 text-center text-sm text-zinc-400">
                {emptyText}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {list.map((t) => {
                  const who =
                    tab === "sent"
                      ? `→ ${t.to_name}`
                      : `${t.from_name} →`;
                  return (
                    <li
                      key={t.id}
                      className={clsx(
                        "flex items-start gap-3 rounded-lg border px-3 py-2",
                        tab === "sent"
                          ? "bg-amber-400/5 border-amber-400/20"
                          : "bg-rose-500/5 border-rose-500/20"
                      )}
                    >
                      <span
                        className={clsx(
                          "shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full text-base mt-0.5",
                          tab === "sent"
                            ? "bg-amber-400/20 text-amber-200"
                            : "bg-rose-500/20 text-rose-200"
                        )}
                        aria-hidden
                      >
                        🔥
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-bold text-white truncate">
                            {who}
                          </p>
                          <span className="shrink-0 text-[10px] text-zinc-500 tabular-nums">
                            {formatTauntTime(t.created_at)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[12px] text-zinc-200 leading-snug whitespace-pre-wrap break-words">
                          {t.message}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="shrink-0 border-t border-white/10 p-3 bg-black/40">
            <button
              type="button"
              onClick={onClose}
              className="w-full h-11 rounded-xl bg-white text-zinc-900 font-bold text-sm active:scale-[0.98]"
              style={{ touchAction: "manipulation" }}
            >
              닫기
            </button>
          </div>
        </motion.div>
      </motion.div>
    </Portal>
  );
}
