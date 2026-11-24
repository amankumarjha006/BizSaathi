import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ModulePlaceholderProps {
  title: string;
  description: string;
  phase: string;
  icon: ReactNode;
  plannedCapabilities: string[];
  architectureNote: string;
}

export function ModulePlaceholder({
  title,
  description,
  phase,
  icon,
  plannedCapabilities,
  architectureNote,
}: ModulePlaceholderProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#353535] text-[#F0B03B]">
            {icon}
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-[#353535]">
                {title}
              </h1>
              <Badge variant="amber">{phase} · Planned</Badge>
            </div>
            <p className="mt-1 text-sm text-[#756F69]">{description}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Planned Module Capabilities</CardTitle>
              <CardDescription>
                This route is part of the Phase 1 navigation shell. Business logic
                will be wired in {phase}.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5 text-sm text-[#353535]">
              {plannedCapabilities.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2.5 rounded-xl border border-[#E3DFD6] bg-[#E3DFD6]/25 px-3.5 py-2.5"
                >
                  <span
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#F0B03B]"
                    aria-hidden="true"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Architecture Readiness</CardTitle>
              <CardDescription>Backend &amp; database alignment</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-[#756F69]">
            <p className="leading-relaxed">{architectureNote}</p>
            <div className="rounded-xl border border-[#D5CFC4] bg-[#E3DFD6]/35 p-3 text-xs text-[#353535]">
              All mutations in this module will require explicit user confirmation
              and execute through server-side services with Prisma transactions.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
