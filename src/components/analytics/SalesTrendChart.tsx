"use client";

import { formatInr } from "@/lib/api-client";
import type { SalesTrendPoint } from "@/server/services/analytics/sales-analytics.service";

export function SalesTrendChart({
  data,
  groupBy,
  onGroupByChange,
}: {
  data: SalesTrendPoint[];
  groupBy?: "daily" | "weekly" | "monthly";
  onGroupByChange?: (next: "daily" | "weekly" | "monthly") => void;
}) {
  const hasAnySales = data.some((d) => d.netSales > 0);
  const maxVal = Math.max(1, ...data.map((d) => d.netSales));

  const width = 560;
  const height = 190;
  const padX = 28;
  const padY = 20;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;

  const points = data.map((d, idx) => {
    const x =
      data.length <= 1
        ? padX + plotW / 2
        : padX + (idx / (data.length - 1)) * plotW;
    const y = padY + plotH - (d.netSales / maxVal) * plotH;
    return { x, y, ...d };
  });

  const linePath =
    points.length > 0
      ? points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")
      : "";

  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[points.length - 1].x} ${
          padY + plotH
        } L ${points[0].x} ${padY + plotH} Z`
      : "";

  return (
    <div className="space-y-3">
      {groupBy && onGroupByChange && (
        <div className="flex justify-end gap-1">
          {(["daily", "weekly", "monthly"] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => onGroupByChange(g)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium capitalize ${
                groupBy === g
                  ? "bg-[#353535] text-white"
                  : "border border-[#D5CFC4] bg-white text-[#756F69] hover:text-[#353535]"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      {data.length === 0 || !hasAnySales ? (
        <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-[#D5CFC4] text-sm text-[#756F69]">
          No confirmed sales recorded in this date range.
        </div>
      ) : (
        <div className="space-y-2">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full overflow-visible"
            role="img"
            aria-label="Sales trend chart"
          >
            {[0, 0.5, 1].map((t) => {
              const y = padY + plotH * (1 - t);
              return (
                <line
                  key={t}
                  x1={padX}
                  x2={width - padX}
                  y1={y}
                  y2={y}
                  stroke="#E3DFD6"
                  strokeDasharray="3 3"
                />
              );
            })}

            {areaPath && (
              <path d={areaPath} fill="#F0B03B" fillOpacity="0.18" />
            )}
            {linePath && (
              <path
                d={linePath}
                fill="none"
                stroke="#353535"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {points.map((p) => (
              <g key={p.bucket}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="4"
                  fill="#F0B03B"
                  stroke="#353535"
                  strokeWidth="1.5"
                >
                  <title>{`${p.bucket}: ${formatInr(p.netSales)} (${p.count} bills)`}</title>
                </circle>
              </g>
            ))}
          </svg>

          <div className="flex items-center justify-between px-2 text-[11px] font-mono text-[#756F69]">
            <span>{data[0]?.bucket}</span>
            <span>Peak: {formatInr(maxVal)}</span>
            <span>{data[data.length - 1]?.bucket}</span>
          </div>
        </div>
      )}
    </div>
  );
}
