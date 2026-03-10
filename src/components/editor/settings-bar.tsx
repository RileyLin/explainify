"use client";
import React from "react";
import {
  ArrowRightLeft,
  ArrowDownUp,
  Minimize2,
  Maximize2,
  Tag,
  Square,
  Circle,
  Type,
} from "lucide-react";
import { useDiagramSettings } from "./diagram-settings";

interface SettingsBarProps {
  features: {
    direction?: boolean;
    density?: boolean;
    edgeLabels?: boolean;
    descriptions?: boolean;
    nodeStyle?: boolean;
  };
}

function Btn({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`h-7 px-2 flex items-center gap-1 rounded-md text-xs font-medium transition-colors ${
        active
          ? "bg-foreground/20 text-foreground border border-foreground/30 shadow-sm"
          : "text-muted-foreground/60 hover:text-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

export function SettingsBar({ features }: SettingsBarProps) {
  const { settings, update } = useDiagramSettings();

  const hasSeparator =
    (features.direction || features.density) &&
    (features.edgeLabels || features.descriptions || features.nodeStyle);

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {/* Direction toggle */}
      {features.direction && (
        <div className="flex items-center rounded-lg border border-border bg-card/50 p-0.5">
          <Btn
            active={settings.direction === "LR"}
            onClick={() => update({ direction: "LR" })}
            title="Left to right"
          >
            <ArrowRightLeft size={12} /> LR
          </Btn>
          <Btn
            active={settings.direction === "TB"}
            onClick={() => update({ direction: "TB" })}
            title="Top to bottom"
          >
            <ArrowDownUp size={12} /> TB
          </Btn>
        </div>
      )}

      {/* Density toggle */}
      {features.density && (
        <div className="flex items-center rounded-lg border border-border bg-card/50 p-0.5">
          <Btn
            active={settings.density === "compact"}
            onClick={() => update({ density: "compact" })}
            title="Compact layout"
          >
            <Minimize2 size={12} />
          </Btn>
          <Btn
            active={settings.density === "normal"}
            onClick={() => update({ density: "normal" })}
            title="Normal layout"
          >
            <Square size={12} />
          </Btn>
          <Btn
            active={settings.density === "spread"}
            onClick={() => update({ density: "spread" })}
            title="Spread layout"
          >
            <Maximize2 size={12} />
          </Btn>
        </div>
      )}

      {/* Divider */}
      {hasSeparator && <div className="w-px h-5 bg-border mx-0.5" />}

      {/* Edge labels toggle */}
      {features.edgeLabels && (
        <Btn
          active={settings.showEdgeLabels}
          onClick={() => update({ showEdgeLabels: !settings.showEdgeLabels })}
          title={settings.showEdgeLabels ? "Hide edge labels" : "Show edge labels"}
        >
          <Tag size={12} /> Labels
        </Btn>
      )}

      {/* Descriptions toggle */}
      {features.descriptions && (
        <Btn
          active={settings.showDescriptions}
          onClick={() => update({ showDescriptions: !settings.showDescriptions })}
          title={settings.showDescriptions ? "Hide descriptions" : "Show descriptions"}
        >
          <Type size={12} /> Details
        </Btn>
      )}

      {/* Node style toggle */}
      {features.nodeStyle && (
        <div className="flex items-center rounded-lg border border-border bg-card/50 p-0.5">
          <Btn
            active={settings.nodeStyle === "card"}
            onClick={() => update({ nodeStyle: "card" })}
            title="Card style nodes"
          >
            <Square size={12} />
          </Btn>
          <Btn
            active={settings.nodeStyle === "minimal"}
            onClick={() => update({ nodeStyle: "minimal" })}
            title="Minimal style nodes"
          >
            <Circle size={12} />
          </Btn>
        </div>
      )}
    </div>
  );
}
