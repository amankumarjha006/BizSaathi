"use client";

import { formatInr } from "@/lib/api-client";

export function SalesByDayChart({
  data,
}: {
  data: Array<{ day: string; sales: number; count: number }>;
}) {
  const maxSales = Math.max(1, ...data.map((d) => d.sales));
  const hasData = data.some((d) => d.sales > 0);

  if (!hasData) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-[#D5CFC4] text-sm text-[#756F69]">
        No sales distribution by weekday yet.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-7 items-end gap-2 pt-4">
      {data.map((d) => {
        const heightPct = Math.max(6, Math.round((d.sales / maxSales) * 100));
        return (
          <div key={d.day} className="flex flex-col items-center gap-1.5">
            <span className="text-[10px] font-medium text-[#756F69] tabular-nums">
              {d.sales > 0 ? formatInr(d.sales) : "—"}
            </span>
            <div className="flex h-28 w-full items-end justify-center rounded-lg bg-[#E3DFD6]/40 p-1">
              <div
                className="w-full rounded-md bg-[#F0B03B] transition-all"
                style={{ height: `${d.sales > 0 ? heightPct : 0}%` }}
                title={`${d.day}: ${formatInr(d.sales)} (${d.count} bills)`}
              />
            </div>
            <span className="text-xs font-semibold text-[#353535]">{d.day}</span>
          </div>
        );
      })}
    </div>
  );
}
