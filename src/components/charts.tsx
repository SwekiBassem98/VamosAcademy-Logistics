"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/format";

// Palette validée (scripts dataviz) : bleu #3b63c4, rouge #c1272d — séparation CVD ΔE 23,7.
export const SERIES_COLORS = ["#3b63c4", "#c1272d"] as const;

type Unit = "money" | "percent" | "count";
type Datum = { label: string; values: number[] };
const fmt = (v: number, unit: Unit) => (unit === "money" ? formatMoney(v) : unit === "percent" ? `${Math.round(v)} %` : String(v));
const short = (v: number, unit: Unit) =>
  unit === "money" ? `${Math.round(v / 1000).toLocaleString("fr-FR")}` : unit === "percent" ? `${Math.round(v)}` : String(v);

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v)!;
}

/** Tracé SVG ; la largeur logique W fixe la taille réelle du texte (360 sur téléphone, 640 au-delà). */
function Bars({ data, series, unit, height, caption, W, hover, setHover, className }: {
  data: Datum[]; series: { name: string }[]; unit: Unit; height: number; caption: string; W: number;
  hover: number | null; setHover: (i: number | null) => void; className?: string;
}) {
  const max = unit === "percent" ? 100 : niceMax(Math.max(0, ...data.flatMap((d) => d.values)));
  const H = height, padL = 40, padB = 24, padT = 10;
  const plotW = W - padL - 6, plotH = H - padB - padT;
  const band = plotW / Math.max(1, data.length);
  const barW = Math.max(4, Math.min(22, (band - 8) / series.length - 2));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const y = (v: number) => padT + plotH - (v / max) * plotH;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label={caption} onMouseLeave={() => setHover(null)}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - 6} y1={y(t)} y2={y(t)} stroke="#e2e5eb" strokeWidth={1} />
          <text x={padL - 6} y={y(t) + 3.5} textAnchor="end" fontSize={11} fill="#5b6475">{short(t, unit)}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const x0 = padL + i * band + (band - (barW + 2) * series.length) / 2;
        return (
          <g key={d.label} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onClick={() => setHover(hover === i ? null : i)} tabIndex={0}
            aria-label={`${d.label} : ${series.map((s, j) => `${s.name} ${fmt(d.values[j], unit)}`).join(", ")}`} className="cursor-pointer outline-none">
            <rect x={padL + i * band} y={padT} width={band} height={plotH} fill={hover === i ? "#eef0f4" : "transparent"} />
            {d.values.map((v, j) => {
              const h = Math.max(0, (v / max) * plotH);
              const r = Math.min(4, h / 2, barW / 2);
              const x = x0 + j * (barW + 2), top = padT + plotH - h;
              return h > 0 ? (
                <path key={j} fill={SERIES_COLORS[j]}
                  d={`M${x},${padT + plotH} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${padT + plotH} Z`} />
              ) : null;
            })}
            <text x={padL + i * band + band / 2} y={H - 7} textAnchor="middle" fontSize={11} fill="#5b6475">{d.label}</text>
          </g>
        );
      })}
      <line x1={padL} x2={W - 6} y1={padT + plotH} y2={padT + plotH} stroke="#cbd1db" strokeWidth={1} />
    </svg>
  );
}

/**
 * Barres verticales groupées, un seul axe. Survol, focus clavier ou toucher : info-bulle ; tableau des données accessible.
 * Sur téléphone, seules les `mobileLast` dernières périodes sont tracées (texte lisible, pas de miniature illisible).
 */
export function BarChart({ data, series, unit, height = 220, caption, mobileLast = 6 }: {
  data: Datum[];
  series: { name: string }[];
  unit: Unit;
  height?: number;
  caption: string;
  mobileLast?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [hoverM, setHoverM] = useState<number | null>(null);
  const mobile = data.slice(-mobileLast);
  const tip = (d: Datum | undefined) => d && (
    <div className="mt-2 rounded-md border border-line bg-surface px-3 py-2 text-xs" aria-live="polite">
      <p className="mb-1 font-semibold capitalize text-navy">{d.label}</p>
      {series.map((s, j) => (
        <p key={s.name} className="flex items-center gap-1.5 text-ink-soft">
          <span className="size-2 rounded-sm" style={{ background: SERIES_COLORS[j] }} />{s.name} : <strong className="tabular-nums">{fmt(d.values[j], unit)}</strong>
        </p>
      ))}
    </div>
  );

  return (
    <figure className="relative">
      {series.length > 1 && (
        <figcaption className="mb-2 flex flex-wrap gap-4 text-xs text-ink-soft">
          {series.map((s, i) => <span key={s.name} className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: SERIES_COLORS[i] }} />{s.name}</span>)}
        </figcaption>
      )}
      <div className="sm:hidden">
        <Bars data={mobile} series={series} unit={unit} height={Math.round(height * 0.9)} caption={caption} W={360} hover={hoverM} setHover={setHoverM} className="w-full" />
        {hoverM !== null ? tip(mobile[hoverM]) : <p className="mt-1 text-[11px] text-muted">Touchez une barre pour le détail.{data.length > mobile.length && ` ${mobile.length} dernières périodes.`}</p>}
      </div>
      <div className="hidden sm:block">
        <Bars data={data} series={series} unit={unit} height={height} caption={caption} W={640} hover={hover} setHover={setHover} className="w-full" />
        {hover !== null && (
          <div className="pointer-events-none absolute top-6 rounded-md border border-line bg-white px-3 py-2 text-xs shadow-md"
            style={{ left: `${Math.min(70, ((40 + hover * ((640 - 46) / Math.max(1, data.length)) + 40) / 640) * 100)}%` }}>
            <p className="mb-1 font-semibold capitalize text-navy">{data[hover].label}</p>
            {series.map((s, j) => (
              <p key={s.name} className="flex items-center gap-1.5 text-ink-soft">
                <span className="size-2 rounded-sm" style={{ background: SERIES_COLORS[j] }} />{s.name} : <strong className="tabular-nums">{fmt(data[hover].values[j], unit)}</strong>
              </p>
            ))}
          </div>
        )}
      </div>
      <details className="mt-2 text-xs text-muted">
        <summary className="inline-flex min-h-9 cursor-pointer items-center font-medium">Voir les données</summary>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full">
            <thead><tr><th className="py-1 text-left">Période</th>{series.map((s) => <th key={s.name} className="py-1 text-right">{s.name}</th>)}</tr></thead>
            <tbody>{data.map((d) => <tr key={d.label} className="border-t border-line"><td className="py-1 capitalize">{d.label}</td>{d.values.map((v, j) => <td key={j} className="py-1 text-right tabular-nums">{fmt(v, unit)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/** Barres horizontales simples (une série) : remplissage, effectifs, occupation. */
export function HBars({ rows, unit }: { rows: { label: string; value: number; max?: number; hint?: string; display?: string }[]; unit: Unit }) {
  const top = Math.max(1, ...rows.map((r) => r.max ?? r.value));
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,8rem)_1fr_auto] items-center gap-3 text-sm" title={r.hint}>
          <span className="truncate">{r.label}</span>
          <span className="h-2.5 rounded-full bg-surface-2" role="presentation">
            <span className="block h-full rounded-full" style={{ width: `${Math.min(100, (r.value / (r.max ?? top)) * 100)}%`, background: SERIES_COLORS[0] }} />
          </span>
          <span className="text-right text-xs tabular-nums text-ink-soft">{r.display ?? (r.max ? `${r.value}/${r.max}` : fmt(r.value, unit))}</span>
        </li>
      ))}
    </ul>
  );
}
