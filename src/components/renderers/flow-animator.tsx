"use client";

import { useState, useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  useReactFlow,
  ReactFlowProvider,
  Handle,
  Position,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { motion, AnimatePresence } from "motion/react";
import { ChevronLeft, ChevronRight, X, Play, Pause } from "lucide-react";
import * as LucideIcons from "lucide-react";
import type { FlowAnimatorData, FlowNode as FlowNodeType } from "@/lib/schemas/flow";

// ── Icon resolver ──────────────────────────────────────────────────
function getIcon(name?: string) {
  if (!name) return null;
  const pascalName = name
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("") as keyof typeof LucideIcons;
  const Icon = LucideIcons[pascalName];
  if (typeof Icon === "function") return Icon as React.ComponentType<{ className?: string; size?: number }>;
  return null;
}

// ── Custom Node ────────────────────────────────────────────────────
function CustomFlowNode({ data }: NodeProps) {
  const nodeData = data as FlowNodeType & { isActive: boolean; onClick: () => void };
  const Icon = getIcon(nodeData.icon);

  return (
    <div
      onClick={nodeData.onClick}
      className={`
        cursor-pointer rounded-xl border-2 px-4 py-3 min-w-[160px] max-w-[220px] transition-all duration-300 shadow-md
        ${nodeData.isActive
          ? "border-blue-500 bg-blue-50 dark:bg-blue-950/50 shadow-blue-500/25 shadow-lg scale-105"
          : "border-border bg-card hover:border-blue-300 hover:shadow-lg"
        }
      `}
    >
      <Handle type="target" position={Position.Top} className="!bg-blue-500 !w-2 !h-2" />
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon className={`${nodeData.isActive ? "text-blue-500" : "text-muted-foreground"}`} size={18} />}
        <span className="font-semibold text-sm text-foreground">{nodeData.label}</span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{nodeData.description}</p>
      <Handle type="source" position={Position.Bottom} className="!bg-blue-500 !w-2 !h-2" />
    </div>
  );
}

const nodeTypes = { custom: CustomFlowNode };

// ── Detail Panel ───────────────────────────────────────────────────
function DetailPanel({ node, onClose }: { node: FlowNodeType; onClose: () => void }) {
  const Icon = getIcon(node.icon);
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="absolute right-4 top-4 bottom-4 w-80 bg-card border border-border rounded-xl shadow-2xl p-5 overflow-y-auto z-20"
    >
      <button onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground">
        <X size={18} />
      </button>
      <div className="flex items-center gap-2 mb-3">
        {Icon && <Icon className="text-blue-500" size={22} />}
        <h3 className="font-bold text-lg text-foreground">{node.label}</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-4">{node.description}</p>
      {node.details && (
        <div className="mb-4">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">Details</h4>
          <p className="text-sm text-foreground leading-relaxed">{node.details}</p>
        </div>
      )}
      {node.codeSnippet && (
        <div>
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">Code</h4>
          <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto font-mono text-foreground">
            {node.codeSnippet}
          </pre>
        </div>
      )}
    </motion.div>
  );
}

// ── Inner Flow (needs ReactFlowProvider ancestor) ──────────────────
function FlowAnimatorInner({ data }: { data: FlowAnimatorData }) {
  const { fitView, setCenter } = useReactFlow();
  const [activeStep, setActiveStep] = useState(0);
  const [selectedNode, setSelectedNode] = useState<FlowNodeType | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const stepOrder = useMemo(
    () => data.stepOrder ?? data.nodes.map((n) => n.id),
    [data.stepOrder, data.nodes]
  );
  const activeNodeId = stepOrder[activeStep] ?? null;

  // Build React Flow nodes with auto-layout if no positions
  const rfNodes: Node[] = useMemo(
    () =>
      data.nodes.map((n, i) => ({
        id: n.id,
        type: "custom",
        position: n.position ?? { x: 250, y: i * 140 },
        data: {
          ...n,
          isActive: n.id === activeNodeId,
          onClick: () => setSelectedNode(n),
        },
      })),
    [data.nodes, activeNodeId]
  );

  const rfEdges: Edge[] = useMemo(
    () =>
      data.connections.map((c, i) => ({
        id: `e-${i}`,
        source: c.from,
        target: c.to,
        label: c.label,
        animated: c.animated ?? true,
        style: {
          stroke: c.from === activeNodeId || c.to === activeNodeId ? "#3b82f6" : "#64748b",
          strokeWidth: c.from === activeNodeId || c.to === activeNodeId ? 2.5 : 1.5,
        },
        labelStyle: { fontSize: 11, fill: "#94a3b8" },
      })),
    [data.connections, activeNodeId]
  );

  const goStep = useCallback(
    (dir: 1 | -1) => {
      setActiveStep((prev) => {
        const next = Math.max(0, Math.min(stepOrder.length - 1, prev + dir));
        // Center on the active node
        const node = data.nodes.find((n) => n.id === stepOrder[next]);
        if (node) {
          const pos = node.position ?? { x: 250, y: next * 140 };
          setTimeout(() => setCenter(pos.x + 100, pos.y + 40, { zoom: 1.2, duration: 500 }), 50);
        }
        return next;
      });
    },
    [stepOrder, data.nodes, setCenter]
  );

  return (
    <div className="relative w-full h-[600px] bg-background rounded-xl border border-border overflow-hidden">
      {/* Step controls */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-card/90 backdrop-blur-sm border border-border rounded-lg px-3 py-2 shadow-lg">
        <button
          onClick={() => goStep(-1)}
          disabled={activeStep === 0}
          className="p-1 rounded hover:bg-muted disabled:opacity-30 text-foreground"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="text-xs font-medium text-muted-foreground min-w-[60px] text-center">
          {activeStep + 1} / {stepOrder.length}
        </span>
        <button
          onClick={() => goStep(1)}
          disabled={activeStep === stepOrder.length - 1}
          className="p-1 rounded hover:bg-muted disabled:opacity-30 text-foreground"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.3}
        maxZoom={2}
      >
        <Background gap={20} size={1} />
        <Controls showInteractive={false} className="!bg-card !border-border !shadow-lg" />
        <MiniMap
          nodeColor={(n) => (n.id === activeNodeId ? "#3b82f6" : "#94a3b8")}
          className="!bg-card !border-border"
        />
      </ReactFlow>

      <AnimatePresence>
        {selectedNode && <DetailPanel node={selectedNode} onClose={() => setSelectedNode(null)} />}
      </AnimatePresence>
    </div>
  );
}

// ── Exported component ─────────────────────────────────────────────
export function FlowAnimator({ data }: { data: FlowAnimatorData }) {
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-foreground">{data.meta.title}</h2>
        <p className="text-muted-foreground mt-1">{data.meta.summary}</p>
      </div>
      <ReactFlowProvider>
        <FlowAnimatorInner data={data} />
      </ReactFlowProvider>
    </div>
  );
}
