"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

interface ExploreContextValue {
  exploreEnabled: boolean;
  toggleExplore: () => void;
}

const ExploreContext = createContext<ExploreContextValue>({
  exploreEnabled: true,
  toggleExplore: () => {},
});

export function useExplore() {
  return useContext(ExploreContext);
}

const STORAGE_KEY = "vizbrief-explore-mode";

export function ExploreProvider({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const urlOverride = searchParams.get("explore");

  const [enabled, setEnabled] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage on mount, then apply URL override
  useEffect(() => {
    if (urlOverride === "false") {
      setEnabled(false);
    } else if (urlOverride === "true") {
      setEnabled(true);
    } else {
      // No URL override — use localStorage
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored !== null) setEnabled(stored === "true");
      } catch {
        // localStorage unavailable
      }
    }
    setHydrated(true);
  }, [urlOverride]);

  const toggleExplore = () => {
    setEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // localStorage unavailable
      }
      return next;
    });
  };

  // Avoid flash — default to true on server, hydrate on client
  if (!hydrated) {
    return (
      <ExploreContext.Provider value={{ exploreEnabled: true, toggleExplore }}>
        {children}
      </ExploreContext.Provider>
    );
  }

  return (
    <ExploreContext.Provider value={{ exploreEnabled: enabled, toggleExplore }}>
      {children}
    </ExploreContext.Provider>
  );
}
