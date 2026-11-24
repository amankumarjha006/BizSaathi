import { Mic } from "lucide-react";
import { ModulePlaceholder } from "@/components/ui/ModulePlaceholder";

export default function VoicePage() {
  return (
    <ModulePlaceholder
      title="Voice Assistant"
      description="Speak naturally in Hindi, English, or Hinglish to record sales, check stock, or query customer Udhaar."
      phase="Phase 4"
      icon={<Mic className="h-5 w-5" />}
      plannedCapabilities={[
        "Provider-abstracted browser speech recognition with text-input fallback.",
        "Hindi, English, and Hinglish transcript understanding via Gemini intent extraction.",
        "Structured command validation and explicit confirmation card before execution.",
        "Unified execution through transactionService and inventoryService.",
      ]}
      architectureNote="Backed by server-only voiceService and Gemini structured outputs. Voice commands never mutate database tables directly without user confirmation."
    />
  );
}
