"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { buttonClass } from "./ui";

export function CopyButton({ text, label = "Copier" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className={buttonClass({ variant: "secondary", size: "sm" })}
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* presse-papiers indisponible */ }
      }}>
      {done ? <Check className="text-success-600" aria-hidden /> : <Copy aria-hidden />} <span aria-live="polite">{done ? "Copié" : label}</span>
    </button>
  );
}
