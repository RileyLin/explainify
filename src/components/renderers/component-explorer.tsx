"use client";

import { useState, useCallback, useMemo } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  type Node,
  type Edge,
} from "@xyflow/react";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";
import type { ComponentExplorerData, ExplorerComponent } from "@/lib/schemas/explorer";
import { DiagramSettingsProvider, useDiagramSettings } from "@/components/editor/diagram-settings";
import { SettingsBar } from "@/components/editor/settings-bar";
import { ExploreButton } from "./explore-button";

import "@xyflow/react/dist/style.css";

// ── Category colors ─────────────────────────────────────────────
const DEFAULT_COLORS = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#8b5cf6", // purple
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
];

function getCategoryColor(
  categoryId: string | undefined,
  categories: ComponentExplorerData["categories"],
): string {
  if (!categoryId) return DEFAULT_COLORS[0];
  const cat = categories?.find((c) => c.id === categoryId);
  if (cat?.color) return cat.color;
  // Consistent hash-based color
  let hash = 0;
  for (let i = 0; i < categoryId.length; i++) {
    hash = categoryId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return DEFAULT_COLORS[Math.abs(hash) % DEFAULT_COLORS.length];
}

// ── Custom Node ─────────────────────────────────────────────────
interface ExplorerNodeData {
  label: string;
  description: string;
  nodeId: string;
  color: string;
  categoryName?: string;
  selected: boolean;
  highlighted: boolean;
}

function ExplorerNode({ data }: { data: ExplorerNodeData }) {
  return (
    <div
      className={`group px-4 py-3 rounded-xl border-2 bg-background min-w-[140px] max-w-[200px] transition-all relative overflow-visible ${
        data.selected
          ? "shadow-lg shadow-blue-500/20"
          : data.highlighted
            ? "shadow-md"
            : ""
      }`}
      style={{
        borderColor: data.selected
          ? data.color
          : data.highlighted
            ? data.color + "80"
            : data.color + "40",
      }}
    >
      <Handle type="target" position={Position.Top} className="!bg-border !w-2 !h-2" />
      {data.categoryName && (
        <div
          className="text-[10px] font-medium uppercase tracking-wider mb-1 opacity-70"
          style={{ color: data.color }}
        >
          {data.categoryName}
        </div>
      )}
      <div className="flex items-start justify-between gap-1">
        <div className="text-sm font-semibold text-foreground truncate">{data.label}</div>
        <div onClick={(e) => e.stopPropagation()} className="shrink-0 -mt-0.5">
          <ExploreButton
            nodeId={data.nodeId}
            nodeTitle={data.label}
            nodeDescription={data.description}
          />
        </div>
      </div>
      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{data.description}</div>
      <Handle type="source" position={Position.Bottom} className="!bg-border !w-2 !h-2" />
    </div>
  );
}

const nodeTypes = { explorer: ExplorerNode };

// ── Edge type colors ────────────────────────────────────────────
const EDGE_TYPE_STYLES: Record<string, { stroke: string; strokeDasharray?: string }> = {
  data: { stroke: "#3b82f6" },
  control: { stroke: "#f59e0b", strokeDasharray: "5,5" },
  dependency: { stroke: "#8b5cf6", strokeDasharray: "2,4" },
};

// ── Layout helpers ──────────────────────────────────────────────
function autoLayout(
  components: ExplorerComponent[],
  direction: "LR" | "TB" = "LR",
  density: "compact" | "normal" | "spread" = "normal"
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const densityMultiplier = density === "compact" ? 0.65 : density === "spread" ? 1.5 : 1.0;
  const colSpacing = Math.round(260 * densityMultiplier);
  const rowSpacing = Math.round(160 * densityMultiplier);

  const cols = direction === "LR"
    ? Math.ceil(Math.sqrt(components.length))
    : Math.max(1, Math.ceil(components.length / Math.ceil(Math.sqrt(components.length))));

  components.forEach((comp, idx) => {
    if (comp.position) {
      positions.set(comp.id, comp.position);
    } else {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      positions.set(comp.id, { x: col * colSpacing, y: row * rowSpacing });
    }
  });
  return positions;
}

// ── Main Component ──────────────────────────────────────────────
interface ComponentExplorerProps {
  data: ComponentExplorerData;
}

function ComponentExplorerInner({ data }: ComponentExplorerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const { settings } = useDiagramSettings();

  // Connected node ids for highlighting
  const connectedIds = useMemo(() => {
    const active = hoveredId || selectedId;
    if (!active) return new Set<string>();
    const ids = new Set<string>();
    data.connections.forEach((conn) => {
      if (conn.from === active) ids.add(conn.to);
      if (conn.to === active) ids.add(conn.from);
    });
    return ids;
  }, [hoveredId, selectedId, data.connections]);

  const positions = useMemo(
    () => autoLayout(data.components, settings.direction, settings.density),
    [data.components, settings.direction, settings.density]
  );

  const nodes: Node[] = useMemo(
    () =>
      data.components.map((comp) => {
        const pos = positions.get(comp.id) || { x: 0, y: 0 };
        const color = getCategoryColor(comp.category, data.categories);
        const cat = data.categories?.find((c) => c.id === comp.category);
        return {
          id: comp.id,
          type: "explorer",
          position: pos,
          data: {
            label: comp.name,
            description: settings.showDescriptions ? comp.description : "",
            nodeId: comp.id,
            color,
            categoryName: cat?.name,
            selected: selectedId === comp.id,
            highlighted: connectedIds.has(comp.id),
          },
        };
      }),
    [data.components, data.categories, positions, selectedId, connectedIds, settings.showDescriptions],
  );

  const edges: Edge[] = useMemo(
    () =>
      data.connections.map((conn, idx) => {
        const style = EDGE_TYPE_STYLES[conn.type || "data"] || EDGE_TYPE_STYLES.data;
        const isHighlighted =
          hoveredId === conn.from ||
          hoveredId === conn.to ||
          selectedId === conn.from ||
          selectedId === conn.to;
        return {
          id: `e-${idx}`,
          source: conn.from,
          target: conn.to,
          label: settings.showEdgeLabels ? conn.label : undefined,
          animated: isHighlighted,
          style: {
            ...style,
            strokeWidth: isHighlighted ? 2.5 : 1.5,
            opacity: hoveredId && !isHighlighted ? 0.2 : 1,
          },
        };
      }),
    [data.connections, hoveredId, selectedId, settings.showEdgeLabels],
  );

  const selectedComponent = data.components.find((c) => c.id === selectedId);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedId((prev) => (prev === node.id ? null : node.id));
  }, []);

  const onNodeMouseEnter = useCallback((_: React.MouseEvent, node: Node) => {
    setHoveredId(node.id);
  }, []);

  const onNodeMouseLeave = useCallback(() => {
    setHoveredId(null);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-foreground">{data.meta.title}</h2>
        <p className="text-muted-foreground">{data.meta.summary}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
            {data.meta.difficulty}
          </span>
          {data.categories?.map((cat) => (
            <span
              key={cat.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-muted/50 text-muted-foreground"
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: getCategoryColor(cat.id, data.categories) }}
              />
              {cat.name}
            </span>
          ))}
        </div>
      </div>

      {/* Canvas + Detail panel */}
      <div className="relative flex gap-4">
        {/* React Flow canvas */}
        <div className="flex-1 h-[500px] rounded-xl border border-border overflow-hidden bg-card relative">
          {/* Settings bar overlay — top right inside canvas */}
          <div className="absolute top-3 right-3 z-10 bg-card/80 backdrop-blur-sm border border-border rounded-lg px-2 py-1.5 shadow-lg">
            <SettingsBar features={{ direction: true, density: true, edgeLabels: true, descriptions: true }} />
          </div>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodeClick={onNodeClick}
            onNodeMouseEnter={onNodeMouseEnter}
            onNodeMouseLeave={onNodeMouseLeave}
            fitView
            minZoom={0.3}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={20} size={1} />
            <Controls showInteractive={false} />
            <MiniMap
              nodeStrokeWidth={3}
              pannable
              zoomable
              style={{ background: "var(--background)" }}
            />
          </ReactFlow>
        </div>

        {/* Detail panel */}
        <AnimatePresence>
          {selectedComponent && (
            <motion.div
              initial={{ opacity: 0, x: 20, width: 0 }}
              animate={{ opacity: 1, x: 0, width: 300 }}
              exit={{ opacity: 0, x: 20, width: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden shrink-0"
            >
              <div className="w-[300px] h-[500px] rounded-xl border border-border bg-card p-4 space-y-3 overflow-y-auto">
                <div className="flex items-start justify-between">
                  <h3 className="text-lg font-semibold text-foreground">{selectedComponent.name}</h3>
                  <button
                    onClick={() => setSelectedId(null)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X size={16} />
                  </button>
                </div>

                {selectedComponent.category && (
                  <span
                    className="inline-block px-2 py-0.5 rounded text-xs font-medium"
                    style={{
                      backgroundColor: getCategoryColor(selectedComponent.category, data.categories) + "20",
                      color: getCategoryColor(selectedComponent.category, data.categories),
                    }}
                  >
                    {data.categories?.find((c) => c.id === selectedComponent.category)?.name ||
                      selectedComponent.category}
                  </span>
                )}

                <p className="text-sm text-muted-foreground">{selectedComponent.description}</p>

                {selectedComponent.details && (
                  <div className="p-3 rounded-lg bg-muted/50 text-sm text-foreground/80 leading-relaxed">
                    {selectedComponent.details}
                  </div>
                )}

                {/* Connected components */}
                {connectedIds.size > 0 && (
                  <div className="space-y-2 pt-2 border-t border-border">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Connected to
                    </p>
                    {Array.from(connectedIds).map((id) => {
                      const comp = data.components.find((c) => c.id === id);
                      const conn = data.connections.find(
                        (c) =>
                          (c.from === selectedId && c.to === id) ||
                          (c.to === selectedId && c.from === id),
                      );
                      return (
                        <button
                          key={id}
                          onClick={() => setSelectedId(id)}
                          className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-muted/50 transition-colors text-sm"
                        >
                          <span className="text-foreground">{comp?.name || id}</span>
                          {conn?.label && (
                            <span className="text-muted-foreground ml-1.5">({conn.label})</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function ComponentExplorer({ data }: ComponentExplorerProps) {
  return (
    <DiagramSettingsProvider initialDirection="LR">
      <ReactFlowProvider>
        <ComponentExplorerInner data={data} />
      </ReactFlowProvider>
    </DiagramSettingsProvider>
  );
}
