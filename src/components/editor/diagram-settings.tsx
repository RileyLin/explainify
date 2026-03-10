"use client";
import React, { createContext, useContext, useState, useCallback } from "react";

export interface DiagramSettings {
  direction: "LR" | "TB";
  density: "compact" | "normal" | "spread";
  showEdgeLabels: boolean;
  showDescriptions: boolean;
  nodeStyle: "card" | "minimal";
}

const defaultSettings: DiagramSettings = {
  direction: "LR",
  density: "normal",
  showEdgeLabels: true,
  showDescriptions: true,
  nodeStyle: "card",
};

interface DiagramSettingsContextType {
  settings: DiagramSettings;
  update: (patch: Partial<DiagramSettings>) => void;
  reset: () => void;
}

const DiagramSettingsContext = createContext<DiagramSettingsContextType>({
  settings: defaultSettings,
  update: () => {},
  reset: () => {},
});

export function DiagramSettingsProvider({
  children,
  initialDirection = "LR",
}: {
  children: React.ReactNode;
  initialDirection?: "LR" | "TB";
}) {
  const [settings, setSettings] = useState<DiagramSettings>({
    ...defaultSettings,
    direction: initialDirection,
  });

  const update = useCallback((patch: Partial<DiagramSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const reset = useCallback(() => {
    setSettings({ ...defaultSettings, direction: initialDirection });
  }, [initialDirection]);

  return (
    <DiagramSettingsContext.Provider value={{ settings, update, reset }}>
      {children}
    </DiagramSettingsContext.Provider>
  );
}

export function useDiagramSettings() {
  return useContext(DiagramSettingsContext);
}
