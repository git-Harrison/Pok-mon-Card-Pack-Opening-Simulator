"use client";

import PokeLoader from "./PokeLoader";
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
  MAX_MAIN_CARDS,
  setCharacter as rpcSetCharacter,
  setMainCards as rpcSetMainCards,
  updateDisplayName as rpcUpdateDisplayName,
  type CharacterDef,
  type ProfileMainCard,
  type ProfileSnapshot,
} from "@/lib/profile";
import { getCard, SETS } from "@/lib/sets";
import { getAllCatalogCards } from "@/lib/pokedex";
import { RARITY_STYLE } from "@/lib/rarity";
import PageHeader from "./PageHeader";
import PageBackdrop from "./PageBackdrop";
import PclSlab from "./PclSlab";
import Portal from "./Portal";

export default function ProfileView() {
  const { user, refreshMe, logout } = useAuth();
  const [profile, setProfile] = useState<ProfileSnapshot | null>(null);
  const [pcl, setPcl] = useState<PclGradingWithDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingChar, setSavingChar] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const [nameOpen, setNameOpen] = useState(false);
  const [tauntOpen, setTauntOpen] = useState(false);

  const userId = user?.id ?? null;
  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const [p, g] = await Promise.all([
      fetchProfile(userId),
      fetchAllGradingsWithDisplay(userId),
    ]);
    setProfile(p);
    setPcl(g);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const characterDef = useMemo(
    () => getCharacter(profile?.character ?? null),
    [profile?.character]
  );

  const filledSlots: (ProfileMainCard | null)[] = useMemo(() => {
    const ids = profile?.main_card_ids ?? [];
    const cards = profile?.main_cards ?? [];
    const byId = new Map(cards.map((c) => [c.id, c]));
    const out: (ProfileMainCard | null)[] = [];
    for (let i = 0; i < MAX_MAIN_CARDS; i++) {
      out.push(i < ids.length ? byId.get(ids[i]) ?? null : null);
    }
    return out;
  }, [profile]);

  // 펫 등록 후보 — 본인 PCL10 슬랩 중 전시 중이 아닌 것만 노출.
  // 전시 중 슬랩은 picker 에서 아예 보이지 않도록 (서버도 상호배타
  // 거부하므로 클라 필터는 UX 일관성 + 라운드트립 절감).
  const eligibleSlabs = useMemo(
    () => pcl.filter((g) => g.grade === 10 && !g.displayed),
    [pcl]
  );
  // 전시 중인 슬랩 ID — 위에서 이미 필터되긴 하지만, 동시 등록
  // 레이스(다른 탭에서 전시 시도) 대비로 picker 에 disabled 표시도
  // 같이 유지.
  const displayedIds = useMemo(
    () => new Set(pcl.filter((g) => g.displayed).map((g) => g.id)),
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
      await refresh();
    },
    [user, profile?.character_locked, refresh, savingChar]
  );

  // 펫 등록/해제 시 항상 "살아있는" 슬랩 ID 만 base 로 사용한다. main_card_ids
  // 에는 소실된 슬랩(예: 도감 일괄 등록 / 선물 / 일괄 판매로 사라진 PCL
  // 기록) UUID 가 잔존할 수 있는데, 그대로 다시 보내면 서버 set_main_cards
  // 의 "본인 PCL10 슬랩만 등록 가능" 검증에서 통째로 거부되어 펫 등록이
  // 영구 실패하던 회귀의 원인. main_cards 는 get_profile 이 살아있는 PCL10
  // 만 반환하므로 그 id 집합을 신뢰 소스로 사용.
  const aliveIds = useMemo(
    () =>
      (profile?.main_card_ids ?? []).filter((id) =>
        (profile?.main_cards ?? []).some((c) => c.id === id)
      ),
    [profile]
  );

  const onSelectSlab = useCallback(
    async (slot: number, gradingId: string) => {
      if (!user || !profile) return;
      // 클라이언트 사이드 가드 — 서버도 거부하지만 UX 즉시 안내.
      if (displayedIds.has(gradingId)) {
        setError(
          "센터에 전시 중인 슬랩이에요. 센터에서 전시 해제 후 다시 시도하세요."
        );
        return;
      }
      const ids = [...aliveIds];
      if (ids.includes(gradingId)) {
        setError("이미 다른 슬롯에 등록된 슬랩이에요.");
        return;
      }
      // slot 위치에 끼워 넣되 최대 10 cap. 빈 자리(slot >= length) 면 push.
      if (slot >= ids.length) ids.push(gradingId);
      else ids.splice(slot, 0, gradingId);
      if (ids.length > MAX_MAIN_CARDS) ids.length = MAX_MAIN_CARDS;
      setError(null);
      const res = await rpcSetMainCards(user.id, ids);
      if (!res.ok) {
        setError(res.error ?? "펫을 등록하지 못했어요.");
        return;
      }
      setPickerSlot(null);
      await refresh();
    },
    [user, profile, aliveIds, displayedIds, refresh]
  );

  const onRemoveSlot = useCallback(
    async (slot: number) => {
      if (!user || !profile) return;
      const ids = [...aliveIds];
      if (slot >= ids.length) return;
      const ok = window.confirm("이 펫을 슬롯에서 빼시겠어요?");
      if (!ok) return;
      ids.splice(slot, 1);
      setError(null);
      const res = await rpcSetMainCards(user.id, ids);
      if (!res.ok) {
        setError(res.error ?? "펫을 해제하지 못했어요.");
        return;
      }
      await refresh();
    },
    [user, profile, aliveIds, refresh]
  );

  return (
    <div className="relative max-w-3xl mx-auto px-4 md:px-6 py-3 md:py-6 fade-in">
      <PageBackdrop tone="sky" />
      <PageHeader
        title="내 프로필"
        subtitle="트레이너 캐릭터를 고르고 자랑할 슬랩을 펫으로 등록하세요"
      />

      {loading ? (
        <div className="mt-12 flex items-center justify-center">
          <PokeLoader size="md" label="불러오는 중..." />
        </div>
      ) : (
        <>
          <ProfileBanner
            character={characterDef}
            displayName={user?.display_name ?? ""}
            slotsUsed={filledSlots.filter(Boolean).length}
            centerPower={profile?.center_power ?? 0}
            pokedexCount={profile?.pokedex_count ?? 0}
            onEditName={() => setNameOpen(true)}
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

          <section className="mt-8">
            <div className="flex items-end justify-between gap-2 flex-wrap">
              <div>
                <h2 className="text-sm font-bold text-white inline-flex items-center gap-1.5">
                  <span aria-hidden>🐾</span>내 펫 슬롯
                </h2>
                <p className="mt-1 text-[11px] text-zinc-400">
                  PCL10 슬랩만 등록할 수 있어요. 슬롯을 눌러 변경하세요.
                </p>
              </div>
              <span className="text-[11px] text-zinc-400 tabular-nums">
                {filledSlots.filter(Boolean).length} / {MAX_MAIN_CARDS} 슬롯
              </span>
            </div>

            <LayoutGroup>
              <div className="mt-3 grid grid-cols-5 md:grid-cols-10 gap-1.5 md:gap-2">
                {filledSlots.map((slot, i) => (
                  <PetSlot
                    key={slot ? slot.id : `empty-${i}`}
                    index={i}
                    card={slot}
                    onPick={() => setPickerSlot(i)}
                    onRemove={() => onRemoveSlot(i)}
                  />
                ))}
              </div>
            </LayoutGroup>

            {eligibleSlabs.length === 0 && (
              <p className="mt-3 text-[11px] text-amber-200/80">
                아직 등록 가능한 PCL10 슬랩이 없어요. 감별에서 10등급을
                노려보세요.
              </p>
            )}
          </section>

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
        {pickerSlot !== null && profile && (
          <SlabPicker
            slabs={eligibleSlabs}
            disabledIds={new Set(profile.main_card_ids)}
            displayedIds={displayedIds}
            slotIndex={pickerSlot}
            onClose={() => setPickerSlot(null)}
            onPick={(id) => onSelectSlab(pickerSlot, id)}
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
}: {
  character: CharacterDef | null;
  displayName: string;
  slotsUsed: number;
  centerPower: number;
  pokedexCount: number;
  onEditName: () => void;
}) {
  const reduce = useReducedMotion();
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
          {character ? (
            <span className="mt-0.5 inline-block text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-400 text-zinc-900">
              {character.name}
            </span>
          ) : (
            <p className="mt-0.5 text-[10px] text-zinc-400">
              캐릭터를 선택해주세요
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
              {" "}/ {MAX_MAIN_CARDS}
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
        <span className="absolute bottom-0.5 right-0.5 text-[8px] font-black px-1 py-0.5 rounded leading-none bg-amber-300 text-zinc-950 tabular-nums">
          {card.grade}
        </span>
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
  displayedIds,
  slotIndex,
  onClose,
  onPick,
}: {
  slabs: PclGradingWithDisplay[];
  disabledIds: Set<string>;
  displayedIds: Set<string>;
  slotIndex: number;
  onClose: () => void;
  onPick: (id: string) => void;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

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
              슬롯 {slotIndex + 1} 펫 선택
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

          <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
            {slabs.length === 0 ? (
              <p className="px-2 py-10 text-center text-sm text-zinc-400">
                등록 가능한 PCL10 슬랩이 없어요.
                <br />
                감별 페이지에서 도전해보세요.
              </p>
            ) : (
              <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {slabs.map((g) => {
                  const card = getCard(g.card_id);
                  if (!card) return null;
                  const taken = disabledIds.has(g.id);
                  const onShowcase = displayedIds.has(g.id);
                  const blocked = taken || onShowcase;
                  return (
                    <li key={g.id}>
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
                          taken
                            ? "이미 펫으로 등록된 슬랩이에요."
                            : onShowcase
                            ? "센터에 전시 중인 슬랩이에요. 전시 해제 후 등록 가능."
                            : undefined
                        }
                      >
                        <PclSlab card={card} grade={g.grade} size="sm" />
                        <p className="mt-1 px-1 text-[10px] text-zinc-400 truncate">
                          {SETS[card.setCode].name} · #{card.number}
                        </p>
                        {taken && (
                          <span className="absolute top-2 left-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-300 ring-1 ring-white/10">
                            등록됨
                          </span>
                        )}
                        {!taken && onShowcase && (
                          <span className="absolute top-2 left-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/90 text-zinc-950 ring-1 ring-amber-300/60">
                            전시 중
                          </span>
                        )}
                      </button>
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
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
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
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
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
