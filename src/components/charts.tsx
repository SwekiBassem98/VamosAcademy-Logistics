"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/format";

// Palette validée (scripts dataviz) : bleu #3b63c4, rouge #c1272d — séparation CVD ΔE 23,7.
export const SERIES_COLORS = ["#3b63c4", "#c1272d"] as const;

type Unit = "money" | "percent" | "count";
const fmt = (v: number, unit: Unit) => (unit === "money" ? formatMoney(v) : unit === "percent" ? `${Math.round(v)} %` : String(v));
const short = (v: number, unit: Unit) =>
  unit === "money" ? `${Math.round(v / 1000).toLocaleString("fr-FR")}` : unit === "percent" ? `${Math.round(v)}` : String(v);

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v)!;
}

/** Barres verticales groupées, un seul axe. Survol : info-bulle ; tableau des données accessible. */
export function BarChart({ data, series, unit, height = 220, caption }: {
  data: { label: string; values: number[] }[];
  series: { name: string }[];
  unit: Unit;
  height?: number;
  caption: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = unit === "percent" ? 100 : niceMax(Math.max(0, ...data.flatMap((d) => d.values)));
  const W = 640, H = height, padL = 44, padB = 26, padT = 10;
  const plotW = W - padL - 8, plotH = H - padB - padT;
  const band = plotW / Math.max(1, data.length);
  const barW = Math.min(22, (band - 10) / series.length - 2);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const y = (v: number) => padT + plotH - (v / max) * plotH;

  return (
    <figure className="relative">
      {series.length > 1 && (
        <figcaption className="mb-2 flex flex-wrap gap-4 text-xs text-gray-600">
          {series.map((s, i) => <span key={s.name} className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: SERIES_COLORS[i] }} />{s.name}</span>)}
        </figcaption>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={caption} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - 8} y1={y(t)} y2={y(t)} stroke="#e5e7eb" strokeWidth={1} />
            <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="#6b7280">{short(t, unit)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x0 = padL + i * band + (band - (barW + 2) * series.length) / 2;
          return (
            <g key={d.label} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} className="outline-none">
              <rect x={padL + i * band} y={padT} width={band} height={plotH} fill={hover === i ? "#f3f4f6" : "transparent"} />
              {d.values.map((v, j) => {
                const h = Math.max(0, (v / max) * plotH);
                const r = Math.min(4, h / 2, barW / 2);
                const x = x0 + j * (barW + 2), top = padT + plotH - h;
                return h > 0 ? (
                  <path key={j} fill={SERIES_COLORS[j]}
                    d={`M${x},${padT + plotH} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${padT + plotH} Z`} />
                ) : null;
              })}
              <text x={padL + i * band + band / 2} y={H - 8} textAnchor="middle" fontSize={10} fill="#6b7280">{d.label}</text>
            </g>
          );
        })}
        <line x1={padL} x2={W - 8} y1={padT + plotH} y2={padT + plotH} stroke="#9ca3af" strokeWidth={1} />
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute top-0 rounded-md border border-line bg-white px-3 py-2 text-xs shadow-md"
          style={{ left: `${Math.min(75, ((padL + hover * band + band) / W) * 100)}%` }}>
          <p className="mb-1 font-semibold capitalize text-navy">{data[hover].label}</p>
          {series.map((s, j) => (
            <p key={s.name} className="flex items-center gap-1.5 text-gray-700">
              <span className="size-2 rounded-sm" style={{ background: SERIES_COLORS[j] }} />{s.name} : <strong className="tabular-nums">{fmt(data[hover].values[j], unit)}</strong>
            </p>
          ))}
        </div>
      )}
      <details className="mt-1 text-xs text-muted">
        <summary className="cursor-pointer">Voir les données</summary>
        <table className="mt-2 w-full">
          <thead><tr><th className="text-left">Période</th>{series.map((s) => <th key={s.name} className="text-right">{s.name}</th>)}</tr></thead>
          <tbody>{data.map((d) => <tr key={d.label}><td className="capitalize">{d.label}</td>{d.values.map((v, j) => <td key={j} className="text-right tabular-nums">{fmt(v, unit)}</td>)}</tr>)}</tbody>
        </table>
      </details>
    </figure>
  );
}

/** Barres horizontales simples (une série) : remplissage, effectifs. */
export function HBars({ rows, unit }: { rows: { label: string; value: number; max?: number; hint?: string }[]; unit: Unit }) {
  const top = Math.max(1, ...rows.map((r) => r.max ?? r.value));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm" title={r.hint}>
          <span className="truncate">{r.label}</span>
          <span className="h-2.5 rounded-full bg-gray-100">
            <span className="block h-full rounded-full" style={{ width: `${Math.min(100, (r.value / (r.max ?? top)) * 100)}%`, background: SERIES_COLORS[0] }} />
          </span>
          <span className="text-right text-xs tabular-nums text-gray-700">{r.max ? `${r.value}/${r.max}` : fmt(r.value, unit)}</span>
        </li>
      ))}
    </ul>
  );
}
