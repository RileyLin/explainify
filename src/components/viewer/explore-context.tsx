"use client";

import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

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
const CHANGE_EVENT = "explainify:explore-mode-change";

/**
 * Reads ?explore= param from the URL without useSearchParams
 * (avoids Next.js Suspense boundary requirement).
 */
function getUrlExploreOverride(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("explore");
}

function readStoredExploreState(): boolean {
  const urlOverride = getUrlExploreOverride();
  if (urlOverride === "false") return false;
  if (urlOverride === "true") return true;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === null ? true : stored === "true";
  } catch {
    return true;
  }
}

function subscribeToStoredExploreState(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

interface ExploreProviderProps {
  children: ReactNode;
  /** Pre-fetched children map from server component */
  childrenMap?: ChildrenMap;
  /** Override initial explore state (e.g. false for landing page demos) */
  initialEnabled?: boolean;
}

export function ExploreProvider({ children, childrenMap = {}, initialEnabled }: ExploreProviderProps) {
  const storedEnabled = useSyncExternalStore(
    subscribeToStoredExploreState,
    readStoredExploreState,
    () => true,
  );
  const [explicitEnabled, setExplicitEnabled] = useState(initialEnabled ?? true);
  const enabled = initialEnabled === undefined ? storedEnabled : explicitEnabled;

  const toggleExplore = () => {
    if (initialEnabled !== undefined) {
      setExplicitEnabled((current) => !current);
      return;
    }
    const next = !storedEnabled;
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
      window.dispatchEvent(new Event(CHANGE_EVENT));
    } catch {
      // localStorage unavailable
    }
  };

  const value = { exploreEnabled: enabled, toggleExplore, childrenMap };

  return (
    <ExploreContext.Provider value={value}>
      {children}
    </ExploreContext.Provider>
  );
}
