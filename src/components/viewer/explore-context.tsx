"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

/** Existing child explainer info */
export interface ExistingChild {
  slug: string;
  title: string;
}

/** Map of nodeId → existing child explainer */
export type ChildrenMap = Record<string, ExistingChild>;

interface ExploreContextValue {
  exploreEnabled: boolean;
  toggleExplore: () => void;
  /** Map of nodeId → existing child explainer for explored-node indicators */
  childrenMap: ChildrenMap;
}

const ExploreContext = createContext<ExploreContextValue>({
  exploreEnabled: true,
  toggleExplore: () => {},
  childrenMap: {},
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

interface ExploreProviderProps {
  children: ReactNode;
  /** Pre-fetched children map from server component */
  childrenMap?: ChildrenMap;
}

export function ExploreProvider({ children, childrenMap = {} }: ExploreProviderProps) {
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

  const value = { exploreEnabled: hydrated ? enabled : true, toggleExplore, childrenMap };

  return (
    <ExploreContext.Provider value={value}>
      {children}
    </ExploreContext.Provider>
  );
}
