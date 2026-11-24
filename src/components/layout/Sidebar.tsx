"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  BarChart3,
  FileText,
  LayoutDashboard,
  Mic,
  Package,
  Settings,
  Store,
  Users,
  X,
} from "lucide-react";
import { DASHBOARD_NAV_ITEMS, type NavItem } from "@/constants/navigation";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<NavItem["iconName"], typeof LayoutDashboard> = {
  "layout-dashboard": LayoutDashboard,
  package: Package,
  "file-text": FileText,
  mic: Mic,
  "arrow-left-right": ArrowLeftRight,
  users: Users,
  "bar-chart-3": BarChart3,
  settings: Settings,
};

interface SidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({ mobileOpen, onCloseMobile }: SidebarProps) {
  const pathname = usePathname();

  const navContent = (
    <div className="flex h-full flex-col bg-[#353535] text-white">
      {/* Brand header */}
      <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-5">
        <Link
          href="/dashboard"
          onClick={onCloseMobile}
          className="flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0B03B] rounded-lg"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F0B03B] text-[#353535] shadow-sm">
            <Store className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <span className="block font-[family-name:var(--font-display)] text-lg font-bold tracking-tight text-white">
              BizSaathi
            </span>
            <span className="block text-[11px] leading-snug text-white/70">
              Your Business. Your Language. Your Saathi.
            </span>
          </div>
        </Link>
        <button
          type="button"
          onClick={onCloseMobile}
          className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white lg:hidden"
          aria-label="Close navigation menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Navigation links */}
      <nav aria-label="Main navigation" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {DASHBOARD_NAV_ITEMS.map((item) => {
          const Icon = ICON_MAP[item.iconName];
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onCloseMobile}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "group flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-[#F0B03B] text-[#353535] font-semibold shadow-sm"
                  : "text-white/80 hover:bg-white/10 hover:text-white"
              )}
            >
              <span className="flex items-center gap-3">
                <Icon
                  className={cn(
                    "h-4.5 w-4.5 shrink-0",
                    isActive ? "text-[#353535]" : "text-white/70 group-hover:text-white"
                  )}
                  aria-hidden="true"
                />
                <span>{item.label}</span>
              </span>
              {item.phase !== "Phase 1" && (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-medium",
                    isActive
                      ? "bg-[#353535]/15 text-[#353535]"
                      : "bg-white/10 text-white/60"
                  )}
                >
                  {item.phase}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Foundation status footer */}
      <div className="border-t border-white/10 p-4">
        <div className="rounded-xl bg-white/8 p-3 text-xs text-white/80">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-white">Phase 1 Foundation</span>
            <span className="h-2 w-2 rounded-full bg-[#22B55B]" aria-hidden="true" />
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-white/65">
            Architecture, schema, and UI shell ready for Phase 2 core modules.
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-72 shrink-0 lg:block">{navContent}</aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-[#353535]/60"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-72 max-w-[85vw] shadow-xl">
            {navContent}
          </aside>
        </div>
      )}
    </>
  );
}
