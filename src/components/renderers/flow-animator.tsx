"use client";

import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type EdgeProps,
  useReactFlow,
  ReactFlowProvider,
  Handle,
  Position,
  type NodeProps,
  getSmoothStepPath,
  BaseEdge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { motion, AnimatePresence } from "motion/react";
import { ChevronLeft, ChevronRight, X, Play, Pause } from "lucide-react";
import * as LucideIcons from "lucide-react";
import type { FlowAnimatorData, FlowNode as FlowNodeType } from "@/lib/schemas/flow";
import { useAnimationSpeed } from "@/components/editor/animation-speed";
import dagre from "dagre";

// ── Layer color helper ─────────────────────────────────────────────
function getLayerColor(id: string): string {
  const lower = id.toLowerCase();
  if (/client|user|browser|app/.test(lower))                    return "#94a3b8";
  if (/gateway|proxy|load|edge|cdn/.test(lower))                return "#3b82f6";
  if (/auth|iam|cognito|token|key/.test(lower))                 return "#f59e0b";
  if (/lambda|function|worker|compute|service|api/.test(lower)) return "#8b5cf6";
  if (/db|database|dynamo|redis|postgres|storage|s3/.test(lower)) return "#10b981";
  if (/queue|sns|sqs|event|stream/.test(lower))                 return "#f97316";
  return "#3b82f6";
}

// ── Dagre auto-layout ──────────────────────────────────────────────
function computeDagreLayout(
  nodes: FlowNodeType[],
  connections: FlowAnimatorData["connections"],
  direction: "LR" | "TB" = "LR"
): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, ranksep: direction === "LR" ? 140 : 120, nodesep: direction === "LR" ? 60 : 80 });

  nodes.forEach((n) => {
    g.setNode(n.id, { width: 220, height: 80 });
  });

  connections.forEach((c) => {
    g.setEdge(c.from, c.to);
  });

  dagre.layout(g);

  const positions = new Map<string, { x: number; y: number }>();
  nodes.forEach((n) => {
    const node = g.node(n.id);
    if (node) {
      // dagre positions are center-based; ReactFlow expects top-left
      positions.set(n.id, { x: node.x - 110, y: node.y - 40 });
    }
  });
  return positions;
}

// ── Icon resolver ──────────────────────────────────────────────────
function getIcon(name?: string) {
  if (!name) return null;
  const pascalName = name
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("") as keyof typeof LucideIcons;
  const Icon = LucideIcons[pascalName];
  if (typeof Icon === "function") return Icon as React.ComponentType<{ className?: string; size?: number; style?: React.CSSProperties }>;
  return null;
}

// ── Stable icon wrapper — uses React.createElement to avoid lint rule ──
function NodeIcon({ name, className, size, style }: { name?: string; className?: string; size?: number; style?: React.CSSProperties }) {
  const Icon = getIcon(name);
  if (!Icon) return null;
  // Use createElement to avoid JSX dynamic component lint error
  return React.createElement(Icon, { className, size, style });
}

// ── Animated Packet Edge ───────────────────────────────────────────
function AnimatedPacketEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  data,
  label,
  labelStyle,
}: EdgeProps) {
  const edgeData = data as { isActive?: boolean; color?: string } | undefined;
  const isActive = edgeData?.isActive ?? false;
  const color = edgeData?.color ?? "#3b82f6";

  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={style}
        markerEnd={markerEnd}
        label={label}
        labelStyle={labelStyle}
      />
      {isActive && (
        <circle r="5" fill={color} style={{ filter: `drop-shadow(0 0 4px ${color})` }}>
          <animateMotion dur="0.4s" fill="freeze" repeatCount="1">
            <mpath href={`#${id}-path`} />
          </animateMotion>
        </circle>
      )}
      {/* Hidden path for animateMotion reference */}
      {isActive && (
        <path id={`${id}-path`} d={edgePath} fill="none" stroke="none" />
      )}
    </>
  );
}

// ── Custom Node with pulse/glow animation ──────────────────────────
function CustomFlowNode({ data }: NodeProps) {
  const nodeData = data as FlowNodeType & {
    isActive: boolean;
    isPulsing: boolean;
    accentColor: string;
    onClick: () => void;
  };
  const accentColor = nodeData.accentColor ?? "#3b82f6";

  return (
    <div
      onClick={nodeData.onClick}
      className="cursor-pointer rounded-xl border-2 px-4 py-3 min-w-[160px] max-w-[220px] transition-all duration-300 shadow-md relative bg-card"
      style={{
        borderColor: nodeData.isActive ? accentColor : undefined,
        boxShadow: nodeData.isActive
          ? `0 4px 24px ${accentColor}33, 0 1px 4px rgba(0,0,0,0.1)`
          : undefined,
      }}
    >
      {/* Pulse glow ring */}
      {nodeData.isPulsing && (
        <motion.div
          initial={{ opacity: 0.8, scale: 0.95 }}
          animate={{ opacity: 0, scale: 1.15 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="absolute inset-0 rounded-xl border-2 pointer-events-none"
          style={{ borderColor: accentColor, boxShadow: `0 0 20px ${accentColor}66` }}
        />
      )}
      <Handle type="target" position={Position.Top} style={{ background: accentColor }} className="!w-2 !h-2" />
      <motion.div
        animate={nodeData.isPulsing ? { scale: [1, 1.05, 1] } : { scale: 1 }}
        transition={{ duration: 0.35, ease: "easeInOut" }}
      >
        <div className="flex items-center gap-2 mb-1">
          <NodeIcon
            name={nodeData.icon}
            style={{ color: nodeData.isActive ? accentColor : undefined }}
            className={nodeData.isActive ? "" : "text-muted-foreground"}
            size={18}
          />
          <span className="font-semibold text-sm text-foreground">{nodeData.label}</span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{nodeData.description}</p>
      </motion.div>
      <Handle type="source" position={Position.Bottom} style={{ background: accentColor }} className="!w-2 !h-2" />
    </div>
  );
}

const nodeTypes = { custom: CustomFlowNode };
const edgeTypes = { animatedPacket: AnimatedPacketEdge };

// ── Detail Panel ───────────────────────────────────────────────────
function DetailPanel({ node, onClose }: { node: FlowNodeType; onClose: () => void }) {
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
        <NodeIcon name={node.icon} className="text-blue-500" size={22} />
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

// ── Speed → interval ms mapping ────────────────────────────────────
const SPEED_INTERVALS: Record<string, number> = {
  slow: 3000,
  normal: 1800,
  fast: 900,
};

// ── Inner Flow (needs ReactFlowProvider ancestor) ──────────────────
function FlowAnimatorInner({ data, autoPlay = false, hideControls = false }: { data: FlowAnimatorData; autoPlay?: boolean; hideControls?: boolean }) {
  const { setCenter } = useReactFlow();
  const { speed } = useAnimationSpeed();

  const [activeStep, setActiveStep] = useState(0);
  const [selectedNode, setSelectedNode] = useState<FlowNodeType | null>(null);
  const [pulsingNodeId, setPulsingNodeId] = useState<string | null>(null);
  const [activeEdgeId, setActiveEdgeId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [layoutDirection, setLayoutDirection] = useState<"LR" | "TB">("LR");

  const prevStepRef = useRef(0);

  const stepOrder = useMemo(
    () => data.stepOrder ?? data.nodes.map((n) => n.id),
    [data.stepOrder, data.nodes]
  );
  const activeNodeId = stepOrder[activeStep] ?? null;

  // ── Dagre layout (memoized per data + direction) ──────────────────
  const dagrePositions = useMemo(
    () => computeDagreLayout(data.nodes, data.connections, layoutDirection),
    [data.nodes, data.connections, layoutDirection]
  );

  // ── Build React Flow nodes ─────────────────────────────────────────
  const rfNodes: Node[] = useMemo(
    () =>
      data.nodes.map((n) => ({
        id: n.id,
        type: "custom",
        position: n.position ?? dagrePositions.get(n.id) ?? { x: 250, y: 100 },
        data: {
          ...n,
          isActive: n.id === activeNodeId,
          isPulsing: n.id === pulsingNodeId,
          accentColor: getLayerColor(n.id),
          onClick: () => setSelectedNode(n),
        },
      })),
    [data.nodes, activeNodeId, pulsingNodeId, dagrePositions]
  );

  // ── Build edges with traveling packet ─────────────────────────────
  const rfEdges: Edge[] = useMemo(
    () =>
      data.connections.map((c, i) => {
        const edgeId = `e-${i}`;
        const isPacketActive = edgeId === activeEdgeId;
        const isActive = c.from === activeNodeId || c.to === activeNodeId;
        const sourceColor = getLayerColor(c.from);
        return {
          id: edgeId,
          source: c.from,
          target: c.to,
          type: "animatedPacket",
          label: c.label,
          animated: c.animated ?? false,
          style: {
            stroke: isPacketActive ? sourceColor : isActive ? sourceColor : "#64748b",
            strokeWidth: isPacketActive ? 4 : isActive ? 2.5 : 1.5,
            transition: "stroke 0.3s ease, stroke-width 0.3s ease",
            filter: isPacketActive ? `drop-shadow(0 0 6px ${sourceColor}99)` : "none",
          },
          labelStyle: { fontSize: 11, fill: "#94a3b8" },
          data: {
            isActive: isPacketActive,
            color: sourceColor,
          },
        };
      }),
    [data.connections, activeNodeId, activeEdgeId]
  );

  // ── goStep ─────────────────────────────────────────────────────────
  const goStep = useCallback(
    (dir: 1 | -1, fromAutoplay = false) => {
      // Pause autoplay if manually triggered
      if (!fromAutoplay) {
        setIsPlaying(false);
      }

      setActiveStep((prev) => {
        const next = Math.max(0, Math.min(stepOrder.length - 1, prev + dir));
        if (next === prev) {
          // Reached the boundary — loop back to start if autoPlay mode, else stop
          if (fromAutoplay && dir === 1) {
            if (autoPlay) {
              // Loop: reset to step 0 after a brief pause
              setTimeout(() => setActiveStep(0), 800);
            } else {
              setIsPlaying(false);
            }
          }
          return prev;
        }

        const prevNodeId = stepOrder[prev];
        const nextNodeId = stepOrder[next];

        // Find edge between prev→next (or next→prev for backwards)
        const forwardKey = `${prevNodeId}->${nextNodeId}`;
        const reverseKey = `${nextNodeId}->${prevNodeId}`;

        const matchingIdx = data.connections.findIndex(
          (c) =>
            `${c.from}->${c.to}` === forwardKey ||
            `${c.from}->${c.to}` === reverseKey
        );

        if (matchingIdx !== -1) {
          const newEdgeId = `e-${matchingIdx}`;
          setActiveEdgeId(newEdgeId);
          setTimeout(() => setActiveEdgeId(null), 450);
        }

        // Delay pulse animation slightly after edge glow starts
        setTimeout(() => {
          setPulsingNodeId(nextNodeId);
          setTimeout(() => setPulsingNodeId(null), 600);
        }, 150);

        // Center on the active node
        const node = data.nodes.find((n) => n.id === nextNodeId);
        if (node) {
          const pos = node.position ?? dagrePositions.get(nextNodeId) ?? { x: 250, y: 100 };
          setTimeout(() => setCenter(pos.x + 110, pos.y + 40, { zoom: 1.2, duration: 500 }), 50);
        }

        prevStepRef.current = prev;
        return next;
      });
    },
    [stepOrder, data.nodes, data.connections, dagrePositions, setCenter]
  );

  // ── Autoplay ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isPlaying) return;

    const intervalMs = SPEED_INTERVALS[speed] ?? 1800;
    const id = setInterval(() => {
      goStep(1, true);
    }, intervalMs);

    return () => clearInterval(id);
  }, [isPlaying, speed, goStep]);

  // ── Transition callout data ────────────────────────────────────────
  const transitionCallout = useMemo(() => {
    if (activeStep === 0) return null;
    const fromId = stepOrder[activeStep - 1];
    const toId = stepOrder[activeStep];
    const edge = data.connections.find(
      (c) => c.from === fromId && c.to === toId
    );
    const destNode = data.nodes.find((n) => n.id === toId);
    const hasContent =
      (edge?.label && edge.label.trim()) ||
      (destNode?.details && destNode.details.trim());

    if (!hasContent) return null;
    return {
      edgeLabel: edge?.label ?? null,
      details: destNode?.details ?? null,
      destLabel: destNode?.label ?? null,
    };
  }, [activeStep, stepOrder, data.connections, data.nodes]);

  return (
    <div className="flex flex-col gap-0">
      <div className="relative w-full h-[420px] bg-background rounded-xl border border-border overflow-hidden">
        {/* Step controls */}
        {!hideControls && <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-card/90 backdrop-blur-sm border border-border rounded-lg px-3 py-2 shadow-lg">
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
          {/* Play / Pause */}
          <div className="w-px h-4 bg-border mx-1" />
          <button
            onClick={() => setIsPlaying((p) => !p)}
            disabled={activeStep === stepOrder.length - 1 && !isPlaying}
            className="p-1 rounded hover:bg-muted disabled:opacity-30 text-foreground"
            aria-label={isPlaying ? "Pause autoplay" : "Start autoplay"}
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
          </button>
          {/* Layout toggle */}
          <div className="w-px h-4 bg-border mx-1" />
          <div className="flex items-center gap-1">
            <button
              onClick={() => setLayoutDirection("LR")}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                layoutDirection === "LR"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              title="Left-to-right layout"
              aria-pressed={layoutDirection === "LR"}
            >
              ↔ LR
            </button>
            <button
              onClick={() => setLayoutDirection("TB")}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                layoutDirection === "TB"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              title="Top-to-bottom layout"
              aria-pressed={layoutDirection === "TB"}
            >
              ↕ TB
            </button>
          </div>
        </div>}

        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          proOptions={{ hideAttribution: true }}
          minZoom={0.3}
          maxZoom={2}
        >
          <Background gap={20} size={1} />
          <Controls
            showInteractive={false}
            style={{
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "8px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
            }}
          />
          <MiniMap
            nodeColor={(n) => {
              const color = getLayerColor(n.id);
              return n.id === activeNodeId ? "#ffffff" : color;
            }}
            nodeStrokeWidth={0}
            style={{
              background: "#0f172a",
              border: "1px solid #334155",
              borderRadius: "8px",
              width: 140,
              height: 90,
            }}
            maskColor="rgba(15,23,42,0.6)"
            zoomable
            pannable
          />
        </ReactFlow>

        <AnimatePresence>
          {selectedNode && <DetailPanel node={selectedNode} onClose={() => setSelectedNode(null)} />}
        </AnimatePresence>
      </div>

      {/* Transition Callout Card */}
      {!hideControls && <AnimatePresence mode="wait">
        {transitionCallout && (
          <motion.div
            key={activeStep}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="mt-2 rounded-xl border border-border bg-card/95 px-4 py-3 shadow-md"
          >
            <div className="flex items-start gap-3">
              {transitionCallout.edgeLabel && (
                <span
                  className="mt-0.5 shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold text-white"
                  style={{ backgroundColor: getLayerColor(stepOrder[activeStep - 1] ?? "") }}
                >
                  {transitionCallout.edgeLabel}
                </span>
              )}
              <div className="flex flex-col gap-0.5">
                {transitionCallout.destLabel && (
                  <p className="text-xs font-semibold text-foreground">{transitionCallout.destLabel}</p>
                )}
                {transitionCallout.details && (
                  <p className="text-xs text-muted-foreground leading-relaxed">{transitionCallout.details}</p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>}
    </div>
  );
}

// ── Exported component ─────────────────────────────────────────────
export function FlowAnimator({ data, autoPlay = false, hideHeader = false, hideControls = false }: { data: FlowAnimatorData; autoPlay?: boolean; hideHeader?: boolean; hideControls?: boolean }) {
  return (
    <div>
      {!hideHeader && (
        <div className="mb-4">
          <h2 className="text-2xl font-bold text-foreground">{data.meta.title}</h2>
          <p className="text-muted-foreground mt-1">{data.meta.summary}</p>
        </div>
      )}
      <ReactFlowProvider>
        <FlowAnimatorInner data={data} autoPlay={autoPlay} hideControls={hideControls} />
      </ReactFlowProvider>
    </div>
  );
}
