import { Settings } from "lucide-react";
import { ModulePlaceholder } from "@/components/ui/ModulePlaceholder";

export default function SettingsPage() {
  return (
    <ModulePlaceholder
      title="Settings"
      description="Configure business profile, preferred language, low-stock defaults, and environment integrations."
      phase="Phase 1+"
      icon={<Settings className="h-5 w-5" />}
      plannedCapabilities={[
        "Edit Business name, businessType, phone, and preferredLanguage (EN / HI / HINGLISH).",
        "Manage multi-business switching and owner profile settings in future phases.",
        "Review system health and AI integration readiness via /api/health.",
      ]}
      architectureNote="Backed by User and Business models in PostgreSQL. Authentication and multi-business access controls are deferred beyond Phase 1."
    />
  );
}
