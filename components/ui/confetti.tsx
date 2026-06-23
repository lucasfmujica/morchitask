"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

const COLORS = ["#0d9488", "#ea580c", "#7c3aed", "#db2777", "#2563eb", "#16a34a"];

type Piece = {
  id: number;
  left: number;
  delay: number;
  drift: number;
  rotate: number;
  duration: number;
  color: string;
};

/**
 * A lightweight one-shot confetti burst (no dependency). Pieces are generated
 * once on mount (in an effect, so render stays pure), then `onDone` fires so
 * the parent can unmount it. Skipped entirely under reduced-motion.
 */
export function Confetti({ onDone }: { onDone?: () => void }) {
  const reduce = useReducedMotion();
  const [pieces, setPieces] = useState<Piece[]>([]);

  useEffect(() => {
    if (reduce) {
      onDone?.();
      return;
    }
    setPieces(
      Array.from({ length: 42 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.25,
        drift: (Math.random() - 0.5) * 180,
        rotate: Math.random() * 540,
        duration: 1.3 + Math.random() * 0.9,
        color: COLORS[i % COLORS.length],
      })),
    );
    const t = setTimeout(() => onDone?.(), 2600);
    return () => clearTimeout(t);
    // Runs once on mount; onDone just flips a stable setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce]);

  if (reduce || pieces.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden" aria-hidden>
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="absolute top-0 h-2.5 w-1.5 rounded-[1px]"
          style={{ left: `${p.left}%`, backgroundColor: p.color }}
          initial={{ y: -24, opacity: 1, rotate: 0 }}
          animate={{ y: "105vh", x: p.drift, rotate: p.rotate, opacity: [1, 1, 0.9, 0] }}
          transition={{ duration: p.duration, delay: p.delay, ease: "easeIn" }}
        />
      ))}
    </div>
  );
}
