"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

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

/**
 * Reads ?explore= param from the URL without useSearchParams
 * (avoids Next.js Suspense boundary requirement).
 */
function getUrlExploreOverride(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("explore");
}

export function ExploreProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from URL param → localStorage on mount
  useEffect(() => {
    const urlOverride = getUrlExploreOverride();

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
  }, []);

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
