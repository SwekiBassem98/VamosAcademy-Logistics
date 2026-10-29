"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";
import { Button } from "./ui";

export function PrintButton({ auto = false, label = "Imprimer" }: { auto?: boolean; label?: string }) {
  useEffect(() => {
    // une seule impression automatique par page (le mode strict de React rejoue les effets en développement)
    const w = window as unknown as { __vamosAutoPrinted?: string };
    if (!auto || w.__vamosAutoPrinted === location.href) return;
    const t = setTimeout(() => {
      w.__vamosAutoPrinted = location.href;
      window.print();
    }, 300);
    return () => clearTimeout(t);
  }, [auto]);
  return <Button variant="secondary" onClick={() => window.print()}><Printer className="size-4" /> {label}</Button>;
}
