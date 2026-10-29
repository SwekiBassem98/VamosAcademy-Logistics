"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";
import { Button } from "./ui";

export function PrintButton({ auto = false, label = "Imprimer" }: { auto?: boolean; label?: string }) {
  useEffect(() => {
    if (auto) setTimeout(() => window.print(), 300);
  }, [auto]);
  return <Button variant="secondary" onClick={() => window.print()}><Printer className="size-4" /> {label}</Button>;
}
