"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyButton({ text, label = "Copier" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="inline-flex items-center gap-1 text-xs text-navy hover:text-brand"
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* presse-papiers indisponible */ }
      }}>
      {done ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />} {done ? "Copié" : label}
    </button>
  );
}
