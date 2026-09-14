"use client";

import { ReactNode, useState } from "react";

type TabId = "history" | "record";

interface Props {
  history: ReactNode;
  record: ReactNode;
}

const TABS: { id: TabId; label: string }[] = [
  { id: "history", label: "Historial de citas" },
  { id: "record", label: "Ficha" },
];

export function PatientTabs({ history, record }: Props) {
  const [active, setActive] = useState<TabId>("history");

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" className="flex gap-1 border-b border-gray-200">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={active === tab.id}
            onClick={() => setActive(tab.id)}
            className={`-mb-px rounded-t-md border-b-2 px-3 py-2 text-sm transition ${
              active === tab.id
                ? "border-brand-teal font-semibold text-brand-teal"
                : "border-transparent text-brand-gray hover:text-brand-ink"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" hidden={active !== "history"}>
        {history}
      </div>
      <div role="tabpanel" hidden={active !== "record"}>
        {record}
      </div>
    </div>
  );
}
