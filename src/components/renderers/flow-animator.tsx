"use client";

import { useState, useCallback, useMemo, useRef } from "react";
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
import { ChevronLeft, ChevronRight, X } from "lucide-react";
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

// ── Custom Node with pulse/glow animation ──────────────────────────
function CustomFlowNode({ data }: NodeProps) {
  const nodeData = data as FlowNodeType & { isActive: boolean; isPulsing: boolean; onClick: () => void };
  const Icon = getIcon(nodeData.icon);

  return (
    <div
      onClick={nodeData.onClick}
      className={`
        cursor-pointer rounded-xl border-2 px-4 py-3 min-w-[160px] max-w-[220px] transition-all duration-300 shadow-md relative
        ${nodeData.isActive
          ? "border-blue-500 bg-blue-50 dark:bg-blue-950/50 shadow-blue-500/25 shadow-lg"
          : "border-border bg-card hover:border-blue-300 hover:shadow-lg"
        }
      `}
    >
      {/* Pulse glow ring */}
      {nodeData.isPulsing && (
        <motion.div
          initial={{ opacity: 0.8, scale: 0.95 }}
          animate={{ opacity: 0, scale: 1.15 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="absolute inset-0 rounded-xl border-2 border-blue-400 pointer-events-none"
          style={{ boxShadow: "0 0 20px rgba(59, 130, 246, 0.4)" }}
        />
      )}
      <Handle type="target" position={Position.Top} className="!bg-blue-500 !w-2 !h-2" />
      <motion.div
        animate={nodeData.isPulsing ? { scale: [1, 1.05, 1] } : { scale: 1 }}
        transition={{ duration: 0.35, ease: "easeInOut" }}
      >
        <div className="flex items-center gap-2 mb-1">
          {Icon && <Icon className={`${nodeData.isActive ? "text-blue-500" : "text-muted-foreground"}`} size={18} />}
          <span className="font-semibold text-sm text-foreground">{nodeData.label}</span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{nodeData.description}</p>
      </motion.div>
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
  const { setCenter } = useReactFlow();
  const [activeStep, setActiveStep] = useState(0);
  const [selectedNode, setSelectedNode] = useState<FlowNodeType | null>(null);
  const [pulsingNodeId, setPulsingNodeId] = useState<string | null>(null);
  const [glowingEdgeKey, setGlowingEdgeKey] = useState<string | null>(null);
  const prevStepRef = useRef(0);

  const stepOrder = useMemo(
    () => data.stepOrder ?? data.nodes.map((n) => n.id),
    [data.stepOrder, data.nodes]
  );
  const activeNodeId = stepOrder[activeStep] ?? null;

  // Build React Flow nodes
  const rfNodes: Node[] = useMemo(
    () =>
      data.nodes.map((n, i) => ({
        id: n.id,
        type: "custom",
        position: n.position ?? { x: 250, y: i * 140 },
        data: {
          ...n,
          isActive: n.id === activeNodeId,
          isPulsing: n.id === pulsingNodeId,
          onClick: () => setSelectedNode(n),
        },
      })),
    [data.nodes, activeNodeId, pulsingNodeId]
  );

  // Build edges with glow effect on transitioning edge
  const rfEdges: Edge[] = useMemo(
    () =>
      data.connections.map((c, i) => {
        const edgeKey = `${c.from}->${c.to}`;
        const isGlowing = edgeKey === glowingEdgeKey;
        const isActive = c.from === activeNodeId || c.to === activeNodeId;
        return {
          id: `e-${i}`,
          source: c.from,
          target: c.to,
          label: c.label,
          animated: c.animated ?? true,
          style: {
            stroke: isGlowing ? "#60a5fa" : isActive ? "#3b82f6" : "#64748b",
            strokeWidth: isGlowing ? 4 : isActive ? 2.5 : 1.5,
            transition: "stroke 0.3s ease, stroke-width 0.3s ease",
            filter: isGlowing ? "drop-shadow(0 0 6px rgba(59, 130, 246, 0.6))" : "none",
          },
          labelStyle: { fontSize: 11, fill: "#94a3b8" },
        };
      }),
    [data.connections, activeNodeId, glowingEdgeKey]
  );

  const goStep = useCallback(
    (dir: 1 | -1) => {
      setActiveStep((prev) => {
        const next = Math.max(0, Math.min(stepOrder.length - 1, prev + dir));
        if (next === prev) return prev;

        const prevNodeId = stepOrder[prev];
        const nextNodeId = stepOrder[next];

        // Find edge between prev and next nodes to glow
        const edgeKey = dir === 1
          ? `${prevNodeId}->${nextNodeId}`
          : `${nextNodeId}->${prevNodeId}`;
        
        // Also check reverse direction for the edge
        const reverseKey = dir === 1
          ? `${nextNodeId}->${prevNodeId}`
          : `${prevNodeId}->${nextNodeId}`;
        
        const matchingEdge = data.connections.find(
          (c) => `${c.from}->${c.to}` === edgeKey || `${c.from}->${c.to}` === reverseKey
        );

        if (matchingEdge) {
          setGlowingEdgeKey(`${matchingEdge.from}->${matchingEdge.to}`);
          setTimeout(() => setGlowingEdgeKey(null), 500);
        }

        // Delay the pulse animation slightly after edge glow starts
        setTimeout(() => {
          setPulsingNodeId(nextNodeId);
          setTimeout(() => setPulsingNodeId(null), 600);
        }, 150);

        // Center on the active node
        const node = data.nodes.find((n) => n.id === nextNodeId);
        if (node) {
          const pos = node.position ?? { x: 250, y: next * 140 };
          setTimeout(() => setCenter(pos.x + 100, pos.y + 40, { zoom: 1.2, duration: 500 }), 50);
        }

        prevStepRef.current = prev;
        return next;
      });
    },
    [stepOrder, data.nodes, data.connections, setCenter]
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
