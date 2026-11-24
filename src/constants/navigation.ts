export interface NavItem {
  label: string;
  href: string;
  iconName:
    | "layout-dashboard"
    | "shopping-cart"
    | "truck"
    | "package"
    | "file-text"
    | "mic"
    | "arrow-left-right"
    | "users"
    | "building-2"
    | "bar-chart-3"
    | "settings";
  phase?: string;
}

export const DASHBOARD_NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    iconName: "layout-dashboard",
  },
  {
    label: "Sales & Billing",
    href: "/billing",
    iconName: "shopping-cart",
  },
  {
    label: "Purchases",
    href: "/purchases",
    iconName: "truck",
  },
  {
    label: "Inventory",
    href: "/inventory",
    iconName: "package",
  },
  {
    label: "Transactions",
    href: "/transactions",
    iconName: "arrow-left-right",
  },
  {
    label: "Customers & Khata",
    href: "/customers",
    iconName: "users",
  },
  {
    label: "Suppliers",
    href: "/suppliers",
    iconName: "building-2",
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
    label: "Reports",
    href: "/reports",
    iconName: "bar-chart-3",
    phase: "Phase 5",
  },
  {
    label: "Settings",
    href: "/settings",
    iconName: "settings",
  },
];

export const LANGUAGE_OPTIONS = [
  { code: "HINGLISH", label: "Hinglish" },
  { code: "HI", label: "हिंदी" },
  { code: "EN", label: "English" },
] as const;

export type LanguageCode = (typeof LANGUAGE_OPTIONS)[number]["code"];
