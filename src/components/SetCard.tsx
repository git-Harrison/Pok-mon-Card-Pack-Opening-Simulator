"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import type { SetInfo } from "@/lib/types";

export default function SetCard({ set }: { set: SetInfo }) {
  return (
    <Link
      href={`/set/${set.code}`}
      className="group relative block rounded-3xl overflow-hidden bg-zinc-900/60 border border-white/10 shadow-xl hover:border-white/20 transition"
      style={{
        boxShadow: `0 14px 40px -20px ${set.primaryColor}88`,
      }}
    >
      <div
        className="absolute inset-0 opacity-60 transition-opacity group-hover:opacity-90 pointer-events-none"
        style={{
          background: `radial-gradient(120% 80% at 50% 0%, ${set.primaryColor}55 0%, transparent 60%)`,
        }}
      />
      <motion.div
        className="relative w-full aspect-[3/2] p-4 md:p-6"
        whileHover={{ y: -4 }}
        transition={{ type: "spring", stiffness: 220, damping: 18 }}
      >
        <div className="relative w-full h-full animate-bob">
          <Image
            src={set.boxImage}
            alt={`${set.name} 박스`}
            fill
            sizes="(max-width: 768px) 90vw, 33vw"
            // `mix-blend-mode: multiply` erases the retail-photo white
            // background so the box looks like it's floating on the
            // dark app surface.
            className="object-contain drop-shadow-2xl select-none pointer-events-none"
            style={{ mixBlendMode: "multiply" }}
            priority
            draggable={false}
          />
        </div>
      </motion.div>
      <div className="relative p-5 border-t border-white/5 bg-black/40">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg md:text-xl font-bold text-white leading-tight">
              {set.name}
            </h3>
            <p className="text-xs text-zinc-400 mt-1">{set.subtitle}</p>
          </div>
          <span
            className="shrink-0 text-[11px] px-2 py-1 rounded-full border"
            style={{
              color: set.accentColor,
              borderColor: `${set.primaryColor}66`,
              background: `${set.primaryColor}22`,
            }}
          >
            {set.releaseDate.slice(0, 4)}
          </span>
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Stat label="팩당" value={`${set.cardsPerPack}장`} />
          <Stat label="박스당" value={`${set.packsPerBox}팩`} />
          <Stat label="총" value={`${set.totalCards}종`} />
        </dl>
      </div>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/5 py-2 px-1 border border-white/5">
      <dt className="text-[10px] uppercase tracking-wider text-zinc-500">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-semibold text-white">{value}</dd>
    </div>
  );
}
