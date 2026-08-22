import { Welcome } from "./welcome";
import { ReactNode } from "react";
import { CopyButton } from "./copy-button";

interface Props {
  children: ReactNode;
}

export function StatisticsWrapper({ children }: Props) {
  return (
    <>
      <Welcome />
      <CopyButton />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {children}
      </div>
    </>
  );
}
