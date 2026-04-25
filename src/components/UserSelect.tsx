"use client";

import PokeLoader from "./PokeLoader";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import { useAuth } from "@/lib/auth";
import { fetchAllUsers, type UserListEntry } from "@/lib/db";
import { getCharacter } from "@/lib/profile";
import Portal from "./Portal";
import { CharacterAvatar } from "./ProfileView";

export interface UserSelectValue {
  id: string;
  user_id: string;
  display_name: string;
  character: string | null;
}

interface Props {
  value: string | null;
  onChange: (user: UserSelectValue) => void;
  excludeSelf?: boolean;
  placeholder?: string;
  disabled?: boolean;
}

let USERS_CACHE: UserListEntry[] | null = null;
let USERS_INFLIGHT: Promise<UserListEntry[]> | null = null;

async function loadUsers(): Promise<UserListEntry[]> {
  if (USERS_CACHE) return USERS_CACHE;
  if (!USERS_INFLIGHT) {
    USERS_INFLIGHT = fetchAllUsers().then((rows) => {
      USERS_CACHE = rows;
      USERS_INFLIGHT = null;
      return rows;
    });
  }
  return USERS_INFLIGHT;
}

export default function UserSelect({
  value,
  onChange,
  excludeSelf,
  placeholder = "사용자 선택",
  disabled,
}: Props) {
  const { user: me } = useAuth();
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<UserListEntry[]>(USERS_CACHE ?? []);
  const [loading, setLoading] = useState(!USERS_CACHE);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let alive = true;
    loadUsers().then((rows) => {
      if (!alive) return;
      setUsers(rows);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    setQuery("");
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      clearTimeout(t);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = users;
    if (excludeSelf && me) {
      list = list.filter((u) => u.id !== me.id);
    }
    if (!q) return list;
    return list.filter(
      (u) =>
        u.display_name.toLowerCase().includes(q) ||
        u.user_id.toLowerCase().includes(q)
    );
  }, [users, query, excludeSelf, me]);

  const selected = useMemo(
    () => users.find((u) => u.user_id === value) ?? null,
    [users, value]
  );

  const pick = useCallback(
    (u: UserListEntry) => {
      onChange({
        id: u.id,
        user_id: u.user_id,
        display_name: u.display_name,
        character: u.character ?? null,
      });
      setOpen(false);
    },
    [onChange]
  );

  const selectedChar = getCharacter(selected?.character ?? null);

  return (
    <>
      <button
        type="button"
        onClick={() => !disabled && setOpen(true)}
        disabled={disabled}
        style={{ touchAction: "manipulation" }}
        className={clsx(
          "w-full h-12 px-3 rounded-lg bg-black/40 border text-left flex items-center gap-2 transition focus:outline-none focus:ring-2 focus:ring-amber-400/60",
          disabled
            ? "border-white/5 text-zinc-600 cursor-not-allowed"
            : selected
            ? "border-amber-400/40 text-white hover:bg-black/60"
            : "border-white/10 text-zinc-400 hover:bg-black/60"
        )}
      >
        {selected ? (
          <>
            {selectedChar ? (
              <CharacterAvatar def={selectedChar} size="xs" />
            ) : (
              <span
                className="shrink-0 w-7 h-7 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-[11px] text-zinc-300"
                aria-hidden
              >
                ?
              </span>
            )}
            <span className="flex-1 min-w-0 truncate text-sm font-bold text-white">
              {selected.display_name}
              <span className="ml-1.5 text-[10px] text-zinc-500 font-normal">
                @{selected.user_id}
              </span>
            </span>
            <span className="text-[10px] text-zinc-500">변경</span>
          </>
        ) : (
          <>
            <span
              className="shrink-0 w-7 h-7 rounded-2xl bg-white/5 border border-dashed border-white/15 flex items-center justify-center text-zinc-500"
              aria-hidden
            >
              👤
            </span>
            <span className="flex-1 truncate text-sm">{placeholder}</span>
            <span className="text-[10px] text-zinc-500">선택</span>
          </>
        )}
      </button>

      <Portal>
        <AnimatePresence>
          {open && (
            <motion.div
              key="user-select-backdrop"
              className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-md flex items-end md:items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              style={{
                paddingTop: "max(env(safe-area-inset-top, 0px), 12px)",
                paddingBottom: "max(env(safe-area-inset-bottom, 0px), 12px)",
                paddingLeft: "12px",
                paddingRight: "12px",
              }}
            >
              <motion.div
                onClick={(e) => e.stopPropagation()}
                className="relative w-full md:max-w-md bg-zinc-950/95 border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
                style={{ maxHeight: "calc(100dvh - 24px)" }}
                initial={{ y: 24, scale: 0.96, opacity: 0 }}
                animate={{ y: 0, scale: 1, opacity: 1 }}
                exit={{ y: 24, scale: 0.96, opacity: 0 }}
                transition={{
                  type: "tween",
                  ease: [0.2, 0.8, 0.2, 1],
                  duration: 0.22,
                }}
              >
                <div className="flex items-center gap-2 px-4 pt-4 pb-2">
                  <h3 className="flex-1 text-base font-black text-white">
                    {placeholder}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="닫기"
                    className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
                    style={{ touchAction: "manipulation" }}
                  >
                    ✕
                  </button>
                </div>

                <div className="px-4 pb-2">
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="닉네임 또는 아이디 검색"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    style={{ fontSize: "16px" }}
                    className="w-full h-11 px-3 rounded-lg bg-black/40 border border-white/10 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-400/60"
                  />
                </div>

                <div className="flex-1 overflow-y-auto overscroll-contain min-h-0 px-2 pb-3">
                  {loading ? (
                    <div className="py-12 flex justify-center">
                      <PokeLoader size="sm" />
                    </div>
                  ) : filtered.length === 0 ? (
                    <p className="py-12 text-center text-sm text-zinc-500">
                      {query.trim()
                        ? "검색 결과가 없어요."
                        : "표시할 사용자가 없어요."}
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {filtered.map((u) => {
                        const def = getCharacter(u.character);
                        const isSelected = u.user_id === value;
                        return (
                          <li key={u.id}>
                            <button
                              type="button"
                              onClick={() => pick(u)}
                              style={{
                                touchAction: "manipulation",
                                minHeight: 44,
                              }}
                              className={clsx(
                                "w-full flex items-center gap-3 px-3 py-2 rounded-lg border transition text-left",
                                isSelected
                                  ? "bg-amber-400/10 border-amber-400/40"
                                  : "bg-white/[0.02] border-white/5 hover:bg-white/10 hover:border-white/15"
                              )}
                            >
                              {def ? (
                                <CharacterAvatar def={def} size="xs" />
                              ) : (
                                <span
                                  className="shrink-0 w-7 h-7 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-[11px] text-zinc-300"
                                  aria-hidden
                                >
                                  ?
                                </span>
                              )}
                              <span className="flex-1 min-w-0">
                                <span className="block text-sm font-bold text-white truncate">
                                  {u.display_name}
                                </span>
                                <span className="block text-[10px] text-zinc-500 truncate">
                                  @{u.user_id}
                                </span>
                              </span>
                              {isSelected && (
                                <span className="text-amber-300 text-xs font-bold">
                                  ✓
                                </span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </Portal>
    </>
  );
}
