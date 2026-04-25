"use client";

import PokeLoader from "./PokeLoader";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import { useAuth } from "@/lib/auth";
import {
  fetchAllGradingsWithDisplay,
  type PsaGradingWithDisplay,
} from "@/lib/db";
import {
  CHARACTERS,
  DISPLAY_NAME_MAX,
  DISPLAY_NAME_MIN,
  fetchProfile,
  getCharacter,
  MAX_MAIN_CARDS,
  MAX_PET_SCORE,
  setCharacter as rpcSetCharacter,
  setMainCards as rpcSetMainCards,
  updateDisplayName as rpcUpdateDisplayName,
  type CharacterDef,
  type ProfileMainCard,
  type ProfileSnapshot,
} from "@/lib/profile";
import { getCard, SETS } from "@/lib/sets";
import { RARITY_STYLE } from "@/lib/rarity";
import PageHeader from "./PageHeader";
import PsaSlab from "./PsaSlab";
import Portal from "./Portal";

export default function ProfileView() {
  const { user, refreshMe, logout } = useAuth();
  const [profile, setProfile] = useState<ProfileSnapshot | null>(null);
  const [psa, setPsa] = useState<PsaGradingWithDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingChar, setSavingChar] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const [nameOpen, setNameOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [p, g] = await Promise.all([
      fetchProfile(user.id),
      fetchAllGradingsWithDisplay(user.id),
    ]);
    setProfile(p);
    setPsa(g);
    setLoading(false);
  }, [user]);

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

  const eligibleSlabs = useMemo(
    () => psa.filter((g) => g.grade === 10),
    [psa]
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

  const onSelectSlab = useCallback(
    async (slot: number, gradingId: string) => {
      if (!user || !profile) return;
      const ids = [...profile.main_card_ids];
      if (ids.includes(gradingId) && ids[slot] !== gradingId) {
        setError("이미 다른 슬롯에 등록된 슬랩이에요.");
        return;
      }
      while (ids.length < slot) ids.push("");
      ids[slot] = gradingId;
      const cleaned = ids.filter((x) => x);
      setError(null);
      const res = await rpcSetMainCards(user.id, cleaned);
      if (!res.ok) {
        setError(res.error ?? "펫을 등록하지 못했어요.");
        return;
      }
      setPickerSlot(null);
      await refresh();
    },
    [user, profile, refresh]
  );

  const onRemoveSlot = useCallback(
    async (slot: number) => {
      if (!user || !profile) return;
      const ids = [...profile.main_card_ids];
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
    [user, profile, refresh]
  );

  const petScore = profile?.pet_score ?? 0;
  const scorePct = Math.min(100, (petScore / MAX_PET_SCORE) * 100);

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-3 md:py-6 fade-in">
      <PageHeader
        title="내 프로필"
        subtitle="트레이너 캐릭터를 고르고 자랑할 슬랩을 펫으로 등록하세요"
      />

      {loading ? (
        <div className="mt-16 flex justify-center">
          <PokeLoader size="md" />
        </div>
      ) : (
        <>
          <ProfileBanner
            character={characterDef}
            displayName={user?.display_name ?? ""}
            petScore={petScore}
            scorePct={scorePct}
            slotsUsed={filledSlots.filter(Boolean).length}
            centerPower={profile?.center_power ?? 0}
            pokedexCount={profile?.pokedex_count ?? 0}
            onEditName={() => setNameOpen(true)}
          />

          <section className="mt-4 grid grid-cols-2 gap-2.5">
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

            <div className="mt-3 grid grid-cols-5 gap-1.5 md:gap-2">
              {filledSlots.map((slot, i) => (
                <PetSlot
                  key={i}
                  index={i}
                  card={slot}
                  onPick={() => setPickerSlot(i)}
                  onRemove={() => onRemoveSlot(i)}
                />
              ))}
            </div>

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
      </AnimatePresence>
    </div>
  );
}

function ProfileBanner({
  character,
  displayName,
  petScore,
  scorePct,
  slotsUsed,
  centerPower,
  pokedexCount,
  onEditName,
}: {
  character: CharacterDef | null;
  displayName: string;
  petScore: number;
  scorePct: number;
  slotsUsed: number;
  centerPower: number;
  pokedexCount: number;
  onEditName: () => void;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 via-white/[0.02] to-transparent p-3 md:p-4">
      <div className="flex items-center gap-3">
        {character ? (
          <CharacterAvatar def={character} size="md" />
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
            {centerPower.toLocaleString("ko-KR")}
          </div>
        </div>
        <div className="min-h-[68px] flex flex-col items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-2 py-1.5 text-center">
          <div className="text-[9px] uppercase tracking-wider text-emerald-300/80">
            📔 도감
          </div>
          <div className="mt-0.5 text-sm md:text-base font-black tabular-nums text-emerald-200 leading-tight">
            {pokedexCount.toLocaleString("ko-KR")}
            <span className="text-[9px] text-emerald-300/60 font-semibold">
              {" "}장
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
          <div className="text-[9px] text-amber-300/60 tabular-nums">
            점수 {petScore.toLocaleString("ko-KR")}
          </div>
        </div>
      </div>
      <div className="mt-1.5 h-1 rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500"
          style={{ width: `${scorePct}%` }}
        />
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
      ? "w-10 h-10"
      : size === "lg"
      ? "w-20 h-20 md:w-24 md:h-24"
      : "w-16 h-16";
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
  if (!card) {
    return (
      <button
        type="button"
        onClick={onPick}
        style={{ touchAction: "manipulation" }}
        className="relative aspect-[5/7] rounded-xl border-2 border-dashed border-white/15 bg-white/[0.02] hover:bg-white/5 hover:border-amber-300/50 transition flex flex-col items-center justify-center gap-0.5 p-1 text-zinc-400 hover:text-amber-200"
      >
        <span className="text-lg leading-none" aria-hidden>+</span>
        <span className="text-[8px] font-semibold uppercase tracking-wider">
          {index + 1}
        </span>
      </button>
    );
  }
  const cardDef = getCard(card.card_id);
  if (!cardDef) {
    return (
      <button
        type="button"
        onClick={onRemove}
        className="aspect-[5/7] rounded-2xl bg-rose-500/10 border border-rose-500/40 text-rose-200 text-xs p-2"
      >
        카드 정보 없음 — 눌러서 해제
      </button>
    );
  }
  const rstyle = RARITY_STYLE[cardDef.rarity];
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onPick}
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
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label="해제"
        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-500 hover:bg-rose-400 text-white text-[10px] font-black shadow-lg flex items-center justify-center ring-2 ring-zinc-950"
        style={{ touchAction: "manipulation" }}
      >
        ✕
      </button>
    </div>
  );
}

function SlabPicker({
  slabs,
  disabledIds,
  slotIndex,
  onClose,
  onPick,
}: {
  slabs: PsaGradingWithDisplay[];
  disabledIds: Set<string>;
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
                  return (
                    <li key={g.id}>
                      <button
                        type="button"
                        disabled={taken}
                        onClick={() => onPick(g.id)}
                        style={{ touchAction: "manipulation" }}
                        className={clsx(
                          "relative block w-full text-left rounded-xl p-1 transition",
                          taken
                            ? "opacity-40 cursor-not-allowed"
                            : "hover:bg-white/5 active:scale-[0.98]"
                        )}
                      >
                        <PsaSlab card={card} grade={g.grade} size="sm" />
                        <p className="mt-1 px-1 text-[10px] text-zinc-400 truncate">
                          {SETS[card.setCode].name} · #{card.number}
                        </p>
                        {taken && (
                          <span className="absolute top-2 left-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-300 ring-1 ring-white/10">
                            등록됨
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
