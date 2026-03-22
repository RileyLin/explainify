"use client";

import { motion } from "motion/react";
import { Compass } from "lucide-react";
import { useExplore } from "./explore-context";

/**
 * Toggle button for Explore mode.
 * Amber when on, muted stone when off.
 * Placed in the viewer header near layout controls.
 */
export function ExploreToggle() {
  const { exploreEnabled, toggleExplore } = useExplore();

  return (
    <motion.button
      onClick={toggleExplore}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      title={exploreEnabled ? "Explore mode on — click nodes to dive deeper" : "Explore mode off"}
      aria-label={`${exploreEnabled ? "Disable" : "Enable"} explore mode`}
      className={[
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors border cursor-pointer",
        exploreEnabled
          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/25"
          : "bg-stone-100 dark:bg-stone-800 text-stone-400 dark:text-stone-500 border-stone-200 dark:border-stone-700 hover:text-stone-600 dark:hover:text-stone-300",
      ].join(" ")}
    >
      <Compass size={13} className={exploreEnabled ? "text-amber-500" : ""} />
      <span className="hidden sm:inline">Explore</span>
    </motion.button>
  );
}
