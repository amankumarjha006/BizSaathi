"use client";

import { formatInr } from "@/lib/api-client";
import type { PaymentBreakdownMap } from "@/server/services/analytics/sales-analytics.service";

const SEGMENTS: Array<{
  key: keyof PaymentBreakdownMap;
  label: string;
  color: string;
}> = [
  { key: "UPI", label: "UPI", color: "#22B55B" },
  { key: "CASH", label: "Cash", color: "#F0B03B" },
  { key: "BANK_TRANSFER", label: "Bank Transfer", color: "#4285F4" },
  { key: "OTHER", label: "Other", color: "#756F69" },
];

export function PaymentDonutChart({
  distribution,
}: {
  distribution: PaymentBreakdownMap;
}) {
  const total =
    distribution.CASH +
    distribution.UPI +
    distribution.BANK_TRANSFER +
    distribution.OTHER;

  const radius = 52;
  const circumference = 2 * Math.PI * radius;

  // Compute cumulative segment offsets without mutating during render
  const segmentData = SEGMENTS.reduce<
    Array<{
      key: keyof PaymentBreakdownMap;
      label: string;
      color: string;
      value: number;
      pct: number;
      dashLength: number;
      offset: number;
    }>
  >((acc, seg) => {
    const value = distribution[seg.key];
    const prevOffset =
      acc.length > 0
        ? acc[acc.length - 1].offset + acc[acc.length - 1].dashLength
        : 0;
    const fraction = total > 0 ? value / total : 0;
    acc.push({
      ...seg,
      value,
      pct: total > 0 ? Math.round(fraction * 100) : 0,
      dashLength: fraction * circumference,
      offset: prevOffset,
    });
    return acc;
  }, []);

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <div className="relative h-36 w-36 shrink-0">
        <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke="#E3DFD6"
            strokeWidth="18"
          />
          {total > 0 &&
            segmentData.map(
              (seg) =>
                seg.dashLength > 0 && (
                  <circle
                    key={seg.key}
                    cx="70"
                    cy="70"
                    r={radius}
                    fill="none"
                    stroke={seg.color}
                    strokeWidth="18"
                    strokeDasharray={`${seg.dashLength} ${circumference}`}
                    strokeDashoffset={-seg.offset}
                  />
                )
            )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[10px] uppercase tracking-wider text-[#756F69]">
            Collected
          </span>
          <span className="text-sm font-bold text-[#353535] tabular-nums">
            {formatInr(total)}
          </span>
        </div>
      </div>

      <div className="w-full flex-1 space-y-2">
        {segmentData.map((seg) => (
          <div
            key={seg.key}
            className="flex items-center justify-between text-xs"
          >
            <span className="flex items-center gap-2 text-[#353535]">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: seg.color }}
                aria-hidden="true"
              />
              <span>{seg.label}</span>
            </span>
            <span className="font-semibold text-[#353535] tabular-nums">
              {formatInr(seg.value)}{" "}
              <span className="font-normal text-[#756F69]">({seg.pct}%)</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
