"use client";

import { Check } from "lucide-react";

export interface ThemeColor {
  name: string;
  value: string;
}

export const PRESET_COLORS: ThemeColor[] = [
  { name: "Blue", value: "#3b82f6" },
  { name: "Purple", value: "#8b5cf6" },
  { name: "Green", value: "#10b981" },
  { name: "Orange", value: "#f59e0b" },
  { name: "Red", value: "#ef4444" },
  { name: "Teal", value: "#14b8a6" },
  { name: "Pink", value: "#ec4899" },
  { name: "Indigo", value: "#6366f1" },
];

interface ColorThemePickerProps {
  selected: string;
  onSelect: (color: string) => void;
}

export function ColorThemePicker({ selected, onSelect }: ColorThemePickerProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground mr-1">Accent:</span>
      {PRESET_COLORS.map((color) => (
        <button
          key={color.value}
          onClick={() => onSelect(color.value)}
          className="relative w-6 h-6 rounded-full transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background"
          style={{ backgroundColor: color.value, focusRingColor: color.value } as React.CSSProperties}
          title={color.name}
        >
          {selected === color.value && (
            <Check size={14} className="absolute inset-0 m-auto text-white drop-shadow" />
          )}
        </button>
      ))}
    </div>
  );
}
