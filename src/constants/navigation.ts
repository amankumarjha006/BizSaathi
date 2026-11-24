export interface NavItem {
  label: string;
  href: string;
  iconName:
    | "layout-dashboard"
    | "package"
    | "file-text"
    | "mic"
    | "arrow-left-right"
    | "users"
    | "bar-chart-3"
    | "settings";
  phase: string;
}

export const DASHBOARD_NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    iconName: "layout-dashboard",
    phase: "Phase 1",
  },
  {
    label: "Inventory",
    href: "/inventory",
    iconName: "package",
    phase: "Phase 2",
  },
  {
    label: "Documents",
    href: "/documents",
    iconName: "file-text",
    phase: "Phase 3",
  },
  {
    label: "Voice Assistant",
    href: "/voice",
    iconName: "mic",
    phase: "Phase 4",
  },
  {
    label: "Transactions",
    href: "/transactions",
    iconName: "arrow-left-right",
    phase: "Phase 2",
  },
  {
    label: "Customers & Khata",
    href: "/customers",
    iconName: "users",
    phase: "Phase 2",
  },
  {
    label: "Reports",
    href: "/reports",
    iconName: "bar-chart-3",
    phase: "Phase 5",
  },
  {
    label: "Settings",
    href: "/settings",
    iconName: "settings",
    phase: "Phase 1+",
  },
];

export const LANGUAGE_OPTIONS = [
  { code: "HINGLISH", label: "Hinglish" },
  { code: "HI", label: "हिंदी" },
  { code: "EN", label: "English" },
] as const;

export type LanguageCode = (typeof LANGUAGE_OPTIONS)[number]["code"];
