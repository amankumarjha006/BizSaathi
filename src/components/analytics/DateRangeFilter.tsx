"use client";

import { Calendar } from "lucide-react";
import type { DateRangePreset } from "@/server/services/analytics/date-range";

export interface DateRangeSelection {
  preset: DateRangePreset;
  from: string;
  to: string;
}

const PRESET_OPTIONS: Array<{ value: DateRangePreset; label: string }> = [
  { value: "TODAY", label: "Today" },
  { value: "YESTERDAY", label: "Yesterday" },
  { value: "LAST_7_DAYS", label: "Last 7 Days" },
  { value: "LAST_30_DAYS", label: "Last 30 Days" },
  { value: "THIS_MONTH", label: "This Month" },
  { value: "PREVIOUS_MONTH", label: "Previous Month" },
  { value: "CUSTOM", label: "Custom Range" },
];

export function DateRangeFilter({
  value,
  onChange,
}: {
  value: DateRangeSelection;
  onChange: (next: DateRangeSelection) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5 rounded-xl border border-[#D5CFC4] bg-white px-3 py-2 text-xs font-semibold text-[#353535]">
        <Calendar className="h-3.5 w-3.5 text-[#756F69]" aria-hidden="true" />
        <select
          value={value.preset}
          onChange={(e) =>
            onChange({
              ...value,
              preset: e.target.value as DateRangePreset,
            })
          }
          aria-label="Select date range preset"
          className="bg-transparent focus:outline-none cursor-pointer"
        >
          {PRESET_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {value.preset === "CUSTOM" && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={value.from}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
            aria-label="From date"
            className="rounded-xl border border-[#D5CFC4] bg-white px-2.5 py-1.5 text-xs text-[#353535]"
          />
          <span className="text-xs text-[#756F69]">to</span>
          <input
            type="date"
            value={value.to}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
            aria-label="To date"
            className="rounded-xl border border-[#D5CFC4] bg-white px-2.5 py-1.5 text-xs text-[#353535]"
          />
        </div>
      )}
    </div>
  );
}
