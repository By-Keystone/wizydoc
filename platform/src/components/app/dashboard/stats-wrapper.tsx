import { Welcome } from "./welcome";
import type { ReactNode } from "react";

interface Props {
  actions?: ReactNode;
  children: ReactNode;
}

export function StatisticsWrapper({ actions, children }: Props) {
  return (
    <>
      <Welcome />
      {actions}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {children}
      </div>
    </>
  );
}
