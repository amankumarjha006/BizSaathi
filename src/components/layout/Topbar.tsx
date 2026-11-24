"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, ChevronDown, Globe, Menu, Mic, Store, User } from "lucide-react";
import { LANGUAGE_OPTIONS, type LanguageCode } from "@/constants/navigation";

interface TopbarProps {
  onOpenMobileMenu: () => void;
}

export function Topbar({ onOpenMobileMenu }: TopbarProps) {
  const [language, setLanguage] = useState<LanguageCode>("HINGLISH");
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-[#D5CFC4] bg-white/95 backdrop-blur-sm">
      <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Left: Mobile menu + Business profile */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="rounded-xl border border-[#D5CFC4] p-2 text-[#353535] hover:bg-[#E3DFD6]/50 lg:hidden"
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-2.5 min-w-0">
            <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#E3DFD6] text-[#353535] sm:flex">
              <Store className="h-4.5 w-4.5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold text-[#353535]">
                  Shree Ganesh Kirana Store
                </p>
                <span className="hidden rounded-full bg-[#F0B03B]/20 px-2 py-0.5 text-[11px] font-medium text-[#8A5A00] sm:inline-block">
                  Sample Business
                </span>
              </div>
              <p className="truncate text-xs text-[#756F69]">
                Kirana &amp; General Retail · Foundation Preview
              </p>
            </div>
          </div>
        </div>

        {/* Right: Voice action, Language selector, notifications, user profile */}
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/voice"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#F0B03B] px-3 py-1.5 text-xs font-bold text-[#353535] shadow-sm transition-colors hover:bg-[#DDA02D]"
            aria-label="Open Voice Assistant"
          >
            <Mic className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden md:inline">Voice Saathi</span>
          </Link>

          {/* Language selector */}
          <div className="flex items-center gap-1.5 rounded-xl border border-[#D5CFC4] bg-[#E3DFD6]/40 px-2.5 py-1.5">
            <Globe className="h-4 w-4 text-[#756F69]" aria-hidden="true" />
            <label htmlFor="language-select" className="sr-only">
              Preferred language
            </label>
            <select
              id="language-select"
              value={language}
              onChange={(e) => setLanguage(e.target.value as LanguageCode)}
              className="bg-transparent text-xs font-medium text-[#353535] focus:outline-none cursor-pointer"
            >
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Notifications */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowNotifications((prev) => !prev);
                setShowProfileMenu(false);
              }}
              className="relative rounded-xl border border-[#D5CFC4] bg-white p-2 text-[#353535] hover:bg-[#E3DFD6]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0B03B]"
              aria-label="Notifications"
              aria-expanded={showNotifications}
            >
              <Bell className="h-4.5 w-4.5" />
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-[#D5CFC4] bg-white p-4 shadow-lg">
                <p className="text-sm font-semibold text-[#353535]">
                  Notifications
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-[#756F69]">
                  Low-stock alerts, invoice review prompts, and Udhaar reminders
                  will appear here in Phase 2+.
                </p>
              </div>
            )}
          </div>

          {/* User profile menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowProfileMenu((prev) => !prev);
                setShowNotifications(false);
              }}
              className="flex items-center gap-2 rounded-xl border border-[#D5CFC4] bg-white px-2.5 py-1.5 text-left hover:bg-[#E3DFD6]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0B03B]"
              aria-expanded={showProfileMenu}
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#353535] text-white">
                <User className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="hidden sm:block">
                <p className="text-xs font-semibold text-[#353535]">
                  Ramesh Kumar
                </p>
                <p className="text-[11px] text-[#756F69]">Owner (Demo)</p>
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-[#756F69]" aria-hidden="true" />
            </button>

            {showProfileMenu && (
              <div className="absolute right-0 mt-2 w-60 rounded-2xl border border-[#D5CFC4] bg-white p-3 shadow-lg">
                <p className="text-xs font-semibold text-[#353535]">
                  Ramesh Kumar
                </p>
                <p className="text-[11px] text-[#756F69]">
                  demo@bizsaathi.local
                </p>
                <div className="mt-2.5 border-t border-[#E3DFD6] pt-2.5 text-[11px] text-[#756F69]">
                  Authentication &amp; multi-business switching will be enabled in
                  a later phase.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
