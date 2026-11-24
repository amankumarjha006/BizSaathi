import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "neutral" | "amber" | "success" | "info" | "alert";

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  neutral: "bg-[#E3DFD6] text-[#353535] border-[#D5CFC4]",
  amber: "bg-[#F0B03B]/20 text-[#8A5A00] border-[#F0B03B]/40",
  success: "bg-[#22B55B]/12 text-[#16793D] border-[#22B55B]/30",
  info: "bg-[#4285F4]/12 text-[#1D5BC4] border-[#4285F4]/30",
  alert: "bg-[#FF4F78]/12 text-[#B81D43] border-[#FF4F78]/30",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({
  className,
  variant = "neutral",
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        VARIANT_CLASSES[variant],
        className
      )}
      {...props}
    />
  );
}
