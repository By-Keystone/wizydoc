"use client";

import { UserMembership } from "@/lib/api/memberships/types";
import { Me } from "@/lib/auth/me";
import { createContext, ReactNode, useContext, useMemo } from "react";

type AppContextType = {
  membership: UserMembership;
  user: Me;
};

export const AppContext = createContext<AppContextType | null>(null);

interface AppProviderProps {
  children: ReactNode;
  membership: UserMembership;
  user: Me;
}

export function AppProvider({ membership, user, children }: AppProviderProps) {
  return (
    <AppContext.Provider value={{ membership, user }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);

  if (!context) throw new Error("useApp must be used within ResourceProvider");

  return context;
}
