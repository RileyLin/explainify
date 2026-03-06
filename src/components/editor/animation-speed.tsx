"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

export type SpeedLevel = "slow" | "normal" | "fast";

interface AnimationSpeedContextType {
  speed: SpeedLevel;
  setSpeed: (speed: SpeedLevel) => void;
  /** Get a duration multiplier based on current speed */
  multiplier: number;
}

const AnimationSpeedContext = createContext<AnimationSpeedContextType>({
  speed: "normal",
  setSpeed: () => {},
  multiplier: 1,
});

const SPEED_MULTIPLIERS: Record<SpeedLevel, number> = {
  slow: 2,
  normal: 1,
  fast: 0.5,
};

export function AnimationSpeedProvider({ children }: { children: ReactNode }) {
  const [speed, setSpeed] = useState<SpeedLevel>("normal");
  const multiplier = SPEED_MULTIPLIERS[speed];

  return (
    <AnimationSpeedContext.Provider value={{ speed, setSpeed, multiplier }}>
      {children}
    </AnimationSpeedContext.Provider>
  );
}

export function useAnimationSpeed() {
  return useContext(AnimationSpeedContext);
}

export function SpeedToggle() {
  const { speed, setSpeed } = useAnimationSpeed();
  const levels: SpeedLevel[] = ["slow", "normal", "fast"];

  return (
    <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
      {levels.map((level) => (
        <button
          key={level}
          onClick={() => setSpeed(level)}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all capitalize ${
            speed === level
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {level}
        </button>
      ))}
    </div>
  );
}
