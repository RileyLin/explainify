"use client";

import React, { useState, useCallback, useMemo, useRef, useEffect, useId } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
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
import { DiagramSettingsProvider, useDiagramSettings } from "@/components/editor/diagram-settings";
import { SettingsBar } from "@/components/editor/settings-bar";
import { ExploreButton } from "./explore-button";
import dagre from "dagre";

// ── Layer color helper ─────────────────────────────────────────────
function getLayerColor(id: string): string {
  const lower = id.toLowerCase();
  if (/client|user|browser|app/.test(lower))                           return "#94a3b8";
  if (/gateway|api[-_]?gw|ingress|proxy|load/.test(lower))            return "#3b82f6";
  if (/auth|iam|cognito|token|key|security/.test(lower))              return "#f59e0b";
  if (/user|profile|account|identity/.test(lower))                    return "#8b5cf6";
  if (/order|cart|checkout|purchase/.test(lower))                     return "#10b981";
  if (/pay|billing|stripe|invoice/.test(lower))                       return "#ef4444";
  if (/inventory|stock|warehouse|catalog/.test(lower))                return "#f97316";
  if (/notif|email|sms|push|alert|message/.test(lower))              return "#06b6d4";
  if (/queue|broker|kafka|rabbit|event|stream|sns|sqs/.test(lower))  return "#ec4899";
  if (/db|database|dynamo|redis|postgres|storage|s3/.test(lower))    return "#10b981";
  if (/cache|cdn|edge/.test(lower))                                   return "#6366f1";
  if (/lambda|function|worker|compute|service|api/.test(lower))      return "#8b5cf6";
  return "#3b82f6";
}

// ── Dedup bidirectional connections ───────────────────────────────
// Collapses A→B + B→A pairs into a single forward edge (keeps the first one,
// merges labels). Prevents spaghetti layout from round-trip edges.
function deduplicateConnections(
  connections: FlowAnimatorData["connections"]
): FlowAnimatorData["connections"] {
  const seen = new Map<string, number>(); // canonical key → index in result
  const result: FlowAnimatorData["connections"] = [];

  for (const c of connections) {
    const canonical = [c.from, c.to].sort().join("||");
    if (seen.has(canonical)) {
      // Merge this label into the existing edge
      const existingIdx = seen.get(canonical)!;
      const existing = result[existingIdx];
      if (c.label && existing.label && c.label !== existing.label) {
        result[existingIdx] = {
          ...existing,
          label: `${existing.label} / ${c.label}`,
        };
      }
    } else {
      seen.set(canonical, result.length);
      result.push(c);
    }
  }

  return result;
}

// ── Sequential layout (for renderHint: "sequential") ──────────────
// Places nodes in a snake/grid pattern wrapping into rows.
// ≤4 nodes: single row. 5-8: 2 rows. 9+: 3+ rows (max 4 per row).
function computeSequentialLayout(
  nodes: FlowNodeType[],
  stepOrder: string[],
  nodeStyle: "card" | "minimal" = "card",
  showDescriptions: boolean = true
): Map<string, { x: number; y: number }> {
  const nodeWidth = nodeStyle === "minimal" ? 120 : 220;
  const nodeHeight = nodeStyle === "minimal" ? 48 : (showDescriptions ? 100 : 72);
  const gapX = 120; // horizontal gap between nodes
  const gapY = 100; // vertical gap between rows
  const positions = new Map<string, { x: number; y: number }>();

  const orderedIds = stepOrder.length > 0 ? stepOrder : nodes.map((n) => n.id);
  const total = orderedIds.length;

  // Determine columns per row: max 4, but try to keep rows balanced
  const COLS = total <= 4 ? total : total <= 8 ? Math.ceil(total / 2) : 4;

  orderedIds.forEach((id, i) => {
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    // Snake pattern: even rows go L→R, odd rows go R→L for visual flow
    const nodesInRow = Math.min(COLS, total - row * COLS);
    const effectiveCol = row % 2 === 0 ? col : nodesInRow - 1 - col;
    positions.set(id, {
      x: effectiveCol * (nodeWidth + gapX),
      y: row * (nodeHeight + gapY),
    });
  });

  // Any nodes not in stepOrder get placed below
  const extraRows = Math.ceil(total / COLS);
  let extra = 0;
  nodes.forEach((n) => {
    if (!positions.has(n.id)) {
      positions.set(n.id, {
        x: (extra % COLS) * (nodeWidth + gapX),
        y: (extraRows + Math.floor(extra / COLS)) * (nodeHeight + gapY),
      });
      extra++;
    }
  });

  return positions;
}

// ── Dagre auto-layout ──────────────────────────────────────────────
function computeDagreLayout(
  nodes: FlowNodeType[],
  connections: FlowAnimatorData["connections"],
  direction: "LR" | "TB" = "LR",
  density: "compact" | "normal" | "spread" = "normal",
  nodeStyle: "card" | "minimal" = "card",
  showDescriptions: boolean = true
): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));

  const nodeCount = nodes.length;
  // Generous fixed spacing — let fitView handle the zoom, not cramped nodes
  const ranksepBase = direction === "LR" ? 100 : 80;
  const nodesepBase = direction === "LR" ? 60 : 60;

  // Apply density multiplier (Phase 1: settings bar)
  const densityMultiplier = density === "compact" ? 0.6 : density === "spread" ? 1.5 : 1.0;
  const ranksep = Math.round(ranksepBase * densityMultiplier);
  const nodesep = Math.round(nodesepBase * densityMultiplier);

  g.setGraph({ rankdir: direction, ranksep, nodesep });

  // Use actual node dimensions matching the render
  const nodeWidth = nodeStyle === "minimal" ? 120 : 220;
  const nodeHeight = nodeStyle === "minimal" ? 48 : (showDescriptions ? 100 : 72);

  nodes.forEach((n) => {
    g.setNode(n.id, { width: nodeWidth, height: nodeHeight });
  });

  connections.forEach((c) => {
    g.setEdge(c.from, c.to);
  });

  dagre.layout(g);

  const positions = new Map<string, { x: number; y: number }>();
  nodes.forEach((n) => {
    const node = g.node(n.id);
    if (node) {
      positions.set(n.id, { x: node.x - 110, y: node.y - 40 });
    }
  });
  return positions;
}

// ── Layer → fallback icon mapping ─────────────────────────────────
function getLayerFallbackIcon(nodeId: string): string {
  const lower = nodeId.toLowerCase();
  if (/client|user|browser|app/.test(lower))                    return "Monitor";
  if (/gateway|proxy|load|edge|cdn/.test(lower))                return "ArrowLeftRight";
  if (/auth|iam|cognito|token|key/.test(lower))                 return "ShieldCheck";
  if (/lambda|function|worker|compute/.test(lower))             return "Zap";
  if (/service|api/.test(lower))                                return "Server";
  if (/db|database|dynamo|redis|postgres|storage|s3/.test(lower)) return "Database";
  if (/queue|sns|sqs|event|stream/.test(lower))                 return "Layers";
  return "Box";
}

// ── Icon resolver ──────────────────────────────────────────────────
function getIcon(name?: string, fallbackId?: string): React.ComponentType<{ className?: string; size?: number; style?: React.CSSProperties }> | null {
  const tryName = (n: string) => {
    const pascalName = n
      .split("-")
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join("") as keyof typeof LucideIcons;
    const Icon = LucideIcons[pascalName];
    if (Icon && (typeof Icon === "function" || (typeof Icon === "object" && Icon !== null))) {
      return Icon as React.ComponentType<{ className?: string; size?: number; style?: React.CSSProperties }>;
    }
    return null;
  };

  if (name) {
    const found = tryName(name);
    if (found) return found;
    const aliases: Record<string, string> = {
      key: "KeyRound", lock: "LockKeyhole", shield: "ShieldCheck",
      server: "Server", database: "Database", monitor: "Monitor",
      cloud: "Cloud", cpu: "Cpu", zap: "Zap", layers: "Layers",
      box: "Box", network: "Network", terminal: "Terminal", code: "Code2",
      "git-branch": "GitBranch", "refresh-cw": "RefreshCw", api: "Server",
      queue: "MessageSquareMore", stream: "Workflow", user: "User",
      browser: "Globe", auth: "ShieldCheck", gateway: "ArrowLeftRight",
    };
    const aliased = aliases[name.toLowerCase()];
    if (aliased) {
      const found2 = tryName(aliased);
      if (found2) return found2;
    }
  }

  if (fallbackId) {
    const fallback = tryName(getLayerFallbackIcon(fallbackId));
    if (fallback) return fallback;
  }

  return tryName("Box");
}

// ── Stable icon wrapper ────────────────────────────────────────────
function NodeIcon({ name, nodeId, className, size, style }: { name?: string; nodeId?: string; className?: string; size?: number; style?: React.CSSProperties }) {
  const Icon = getIcon(name, nodeId);
  if (!Icon) return null;
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
  data,
}: EdgeProps) {
  const edgeData = data as { isActive?: boolean; color?: string; isBursting?: boolean; packetDurationMultiplier?: number; label?: string; showEdgeLabels?: boolean } | undefined;
  const isActive = edgeData?.isActive ?? false;
  const isBursting = edgeData?.isBursting ?? false;
  const color = edgeData?.color ?? "#3b82f6";
  const label = edgeData?.label ?? "";
  const showEdgeLabels = edgeData?.showEdgeLabels ?? true;
  const packetDurationMultiplier = edgeData?.packetDurationMultiplier ?? 1;
  const hex = color.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const markerId = `arrow-${hex}-${id}`;

  const idleDur = `${(1.4 * packetDurationMultiplier).toFixed(2)}s`;
  const activeDur = `${(0.9 * packetDurationMultiplier).toFixed(2)}s`;
  const burstDur = "0.3s";

  const [edgePath] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
    borderRadius: 12,
  });

  const midX = (sourceX + targetX) / 2;
  const midY = (sourceY + targetY) / 2;

  const staggerOffsets = ["0s", "0.4s", "0.8s"];

  return (
    <>
      <defs>
        <marker id={markerId} markerWidth="9" markerHeight="6" refX="9" refY="3" orient="auto">
          <polygon
            points="0 0, 9 3, 0 6"
            fill={isActive ? color : `rgba(100,116,139,0.65)`}
            opacity={isActive ? 0.9 : 0.65}
          />
        </marker>
      </defs>

      <path
        id={`${id}-path`}
        d={edgePath}
        fill="none"
        stroke={isActive ? color : "rgba(100,116,139,0.35)"}
        strokeWidth={isActive ? 2.5 : 1.8}
        strokeDasharray={isActive ? "none" : "6 10"}
        markerEnd={`url(#${markerId})`}
        style={
          isActive
            ? { filter: `drop-shadow(0 0 3px ${color}) drop-shadow(0 0 8px rgba(${r},${g},${b},0.4))` }
            : { animation: "edgeDrift 2.8s linear infinite" }
        }
      />

      {/* Edge label at midpoint — only when showEdgeLabels is true */}
      {showEdgeLabels && label && label.trim() && (
        <g>
          <rect
            x={midX - label.length * 3.2}
            y={midY - 9}
            width={label.length * 6.4}
            height={14}
            rx={5}
            fill="rgba(10,10,20,0.7)"
            stroke={isActive ? `rgba(${r},${g},${b},0.4)` : "rgba(100,116,139,0.2)"}
            strokeWidth={0.8}
          />
          <text
            x={midX}
            y={midY + 2}
            textAnchor="middle"
            fontSize={10}
            fontFamily="inherit"
            fontWeight={500}
            fill={isActive ? "white" : "rgba(148,163,184,0.75)"}
            style={{ pointerEvents: "none", userSelect: "none", transition: "fill 0.3s ease" }}
          >
            {label}
          </text>
        </g>
      )}

      {staggerOffsets.map((beginOffset, idx) => (
        <circle
          key={idx}
          r={isActive ? 5 : 3}
          fill={isActive ? color : "rgba(148,163,184,0.4)"}
          style={{
            opacity: isActive ? 0.85 : 0.25,
            filter: isActive
              ? `drop-shadow(0 0 5px ${color}) drop-shadow(0 0 10px rgba(${r},${g},${b},0.6))`
              : "none",
            transition: "opacity 0.4s ease, r 0.4s ease",
          }}
        >
          <animateMotion
            dur={isActive ? activeDur : idleDur}
            repeatCount="indefinite"
            rotate="auto"
            begin={beginOffset}
          >
            <mpath href={`#${id}-path`} />
          </animateMotion>
        </circle>
      ))}

      {(isActive || isBursting) && (
        <circle
          r="6"
          fill={color}
          style={{
            filter: `drop-shadow(0 0 8px ${color}) drop-shadow(0 0 16px rgba(${r},${g},${b},0.8))`,
            opacity: 0.9,
          }}
        >
          <animateMotion
            dur={burstDur}
            repeatCount="1"
            rotate="auto"
            begin="0s"
          >
            <mpath href={`#${id}-path`} />
          </animateMotion>
        </circle>
      )}
    </>
  );
}

// ── Layer badge label ──────────────────────────────────────────────
function getLayerBadge(id: string): string {
  const lower = id.toLowerCase();
  if (/client|browser|app/.test(lower))                               return "CLIENT";
  if (/gateway|api[-_]?gw|ingress|proxy|load/.test(lower))           return "GATEWAY";
  if (/auth|iam|cognito|token|key|security/.test(lower))             return "AUTH";
  if (/user|profile|account|identity/.test(lower))                   return "USER";
  if (/order|cart|checkout|purchase/.test(lower))                    return "ORDERS";
  if (/pay|billing|stripe|invoice/.test(lower))                      return "PAYMENT";
  if (/inventory|stock|warehouse|catalog/.test(lower))               return "INVENTORY";
  if (/notif|email|sms|push|alert|message/.test(lower))             return "NOTIFY";
  if (/queue|broker|kafka|rabbit|event|stream|sns|sqs/.test(lower)) return "QUEUE";
  if (/db|database|dynamo|redis|postgres|storage|s3/.test(lower))   return "DATABASE";
  if (/cache|cdn|edge/.test(lower))                                  return "CACHE";
  if (/lambda|function|worker|compute/.test(lower))                  return "λ FUNC";
  if (/service|api/.test(lower))                                     return "SERVICE";
  return "SERVICE";
}

// ── Custom Node ────────────────────────────────────────────────────
function CustomFlowNode({ data }: NodeProps) {
  const nodeData = data as FlowNodeType & {
    isActive: boolean;
    isPulsing: boolean;
    accentColor: string;
    nodeIndex: number;
    showDescriptions: boolean;
    nodeStyle: "card" | "minimal";
    onClick: () => void;
  };
  const accentColor = nodeData.accentColor ?? "#3b82f6";
  const id = useId();
  const badge = getLayerBadge(nodeData.id ?? "");
  const showDescriptions = nodeData.showDescriptions ?? true;
  const nodeStyle = nodeData.nodeStyle ?? "card";
  const isMinimal = nodeStyle === "minimal";

  const hex = accentColor.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);

  const heartbeatDelay = 0.4 + (nodeData.nodeIndex ?? 0) * 0.08 + 0.4;

  // Minimal style: 120x48, no description
  const nodeWidth = isMinimal ? 120 : 220;
  const nodeHeight = isMinimal ? 48 : (showDescriptions ? 100 : 72);

  return (
    <motion.div
      onClick={nodeData.onClick}
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={
        nodeData.isActive
          ? {
              opacity: 1, y: 0,
              scale: [1, 1.012, 1],
              boxShadow: [
                `0 0 0 1px rgba(${r},${g},${b},0.4), 0 4px 28px rgba(${r},${g},${b},0.3)`,
                `0 0 0 1px rgba(${r},${g},${b},0.7), 0 4px 40px rgba(${r},${g},${b},0.5), 0 0 80px rgba(${r},${g},${b},0.1)`,
                `0 0 0 1px rgba(${r},${g},${b},0.4), 0 4px 28px rgba(${r},${g},${b},0.3)`,
              ],
            }
          : {
              opacity: 1, y: 0, scale: 1,
              boxShadow: [
                `0 0 0 1px rgba(${r},${g},${b},0.08), 0 2px 12px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.05)`,
                `0 0 0 1px rgba(${r},${g},${b},0.18), 0 2px 16px rgba(${r},${g},${b},0.12), inset 0 1px 0 rgba(255,255,255,0.05)`,
                `0 0 0 1px rgba(${r},${g},${b},0.08), 0 2px 12px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.05)`,
              ],
            }
      }
      transition={
        nodeData.isActive
          ? { opacity: { duration: 0.4, delay: (nodeData.nodeIndex ?? 0) * 0.08, ease: [0.34, 1.56, 0.64, 1] },
              y: { duration: 0.4, delay: (nodeData.nodeIndex ?? 0) * 0.08, ease: [0.34, 1.56, 0.64, 1] },
              scale: { duration: 1.2, repeat: Infinity, ease: "easeInOut", delay: heartbeatDelay },
              boxShadow: { duration: 1.2, repeat: Infinity, ease: "easeInOut", delay: heartbeatDelay } }
          : { opacity: { duration: 0.4, delay: (nodeData.nodeIndex ?? 0) * 0.08, ease: [0.34, 1.56, 0.64, 1] },
              y: { duration: 0.4, delay: (nodeData.nodeIndex ?? 0) * 0.08, ease: [0.34, 1.56, 0.64, 1] },
              scale: { duration: 0.4, delay: (nodeData.nodeIndex ?? 0) * 0.08 },
              boxShadow: { duration: 3, repeat: Infinity, ease: "easeInOut", delay: heartbeatDelay } }
      }
      className="group cursor-pointer relative overflow-visible"
      style={{
        width: nodeWidth,
        minHeight: nodeHeight,
        borderRadius: 14,
        padding: isMinimal ? "8px 12px" : "14px 16px 14px 19px",
        background: "rgba(255,255,255,0.04)",
        border: `1px solid rgba(${r},${g},${b},${nodeData.isActive ? 0.4 : 0.15})`,
        borderLeft: `3px solid ${accentColor}`,
        backdropFilter: "blur(8px)",
      }}
    >
      {!isMinimal && (
        <div
          className="absolute top-0 left-0 right-0 pointer-events-none"
          style={{
            height: "45%",
            borderRadius: "14px 14px 0 0",
            background: `linear-gradient(135deg, rgba(${r},${g},${b},0.08) 0%, transparent 65%)`,
          }}
        />
      )}

      {!isMinimal && (
        <div
          className="absolute top-2.5 right-2.5 text-[9px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded-full"
          style={{
            background: `rgba(${r},${g},${b},0.12)`,
            color: accentColor,
            letterSpacing: "0.08em",
          }}
        >
          {badge}
        </div>
      )}

      {/* Explore button — top-right corner, above badge on non-minimal */}
      <div
        className="absolute z-20 pointer-events-auto"
        style={{ top: isMinimal ? -14 : -14, right: isMinimal ? 0 : 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <ExploreButton
          nodeId={nodeData.id ?? ""}
          nodeTitle={nodeData.label ?? ""}
          nodeDescription={nodeData.description ?? ""}
        />
      </div>

      <Handle type="target" position={Position.Left} style={{ opacity: 0, width: 4, height: 4 }} />

      <div className={`relative z-10 ${isMinimal ? "flex items-center gap-2" : ""}`}>
        <div
          className={`${isMinimal ? "w-5 h-5 shrink-0" : "w-7 h-7 mb-2"} rounded-lg flex items-center justify-center`}
          style={{ background: `rgba(${r},${g},${b},0.12)` }}
        >
          <NodeIcon name={nodeData.icon} nodeId={nodeData.id} size={isMinimal ? 12 : 14} style={{ color: accentColor }} />
        </div>
        <p className={`font-semibold ${isMinimal ? "text-xs" : "text-sm"} text-foreground leading-tight ${isMinimal ? "" : "mb-1"}`}>
          {nodeData.label}
        </p>
        {!isMinimal && showDescriptions && (
          <p className="text-[11px] text-muted-foreground leading-relaxed">{nodeData.description}</p>
        )}
      </div>

      {nodeData.isPulsing && (
        <motion.div
          initial={{ opacity: 0.7, scale: 0.95 }}
          animate={{ opacity: 0, scale: 1.12 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          className="absolute inset-0 rounded-[14px] pointer-events-none"
          style={{ border: `2px solid ${accentColor}`, boxShadow: `0 0 18px ${accentColor}88` }}
        />
      )}

      <Handle type="source" position={Position.Right} style={{ opacity: 0, width: 4, height: 4 }} />
    </motion.div>
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
        <NodeIcon name={node.icon} nodeId={node.id} className="text-blue-500" size={22} />
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
  const { settings } = useDiagramSettings();

  const [activeStep, setActiveStep] = useState(0);
  const [selectedNode, setSelectedNode] = useState<FlowNodeType | null>(null);
  const [pulsingNodeId, setPulsingNodeId] = useState<string | null>(null);
  const [activeEdgeId, setActiveEdgeId] = useState<string | null>(null);
  const [burstingEdgeId, setBurstingEdgeId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(autoPlay);

  const prevStepRef = useRef(0);

  const stepOrder = useMemo(
    () => data.stepOrder ?? data.nodes.map((n) => n.id),
    [data.stepOrder, data.nodes]
  );
  const activeNodeId = stepOrder[activeStep] ?? null;

  // ── Deduplicate bidirectional connections ──────────────────────
  const dedupedConnections = useMemo(
    () => deduplicateConnections(data.connections),
    [data.connections]
  );

  // ── Layout: sequential vs graph vs hierarchy ───────────────────
  const isSequential = data.renderHint === "sequential";
  const dagrePositions = useMemo(
    () => isSequential
      ? computeSequentialLayout(data.nodes, stepOrder, settings.nodeStyle, settings.showDescriptions)
      : computeDagreLayout(data.nodes, dedupedConnections, settings.direction, settings.density, settings.nodeStyle, settings.showDescriptions),
    [isSequential, data.nodes, dedupedConnections, stepOrder, settings.direction, settings.density, settings.nodeStyle, settings.showDescriptions]
  );

  // ── Adaptive fitPadding (Phase 2) ──────────────────────────────
  const fitPadding = data.nodes.length > 8 ? 0.12 : data.nodes.length > 4 ? 0.15 : 0.2;

  // ── Build React Flow nodes ────────────────────────────────────────
  const rfNodes: Node[] = useMemo(
    () => {
      const sorted = [...data.nodes].sort((a, b) => {
        const ax = dagrePositions.get(a.id)?.x ?? 0;
        const bx = dagrePositions.get(b.id)?.x ?? 0;
        return ax - bx;
      });
      return data.nodes.map((n) => ({
        id: n.id,
        type: "custom",
        position: n.position ?? dagrePositions.get(n.id) ?? { x: 250, y: 100 },
        data: {
          ...n,
          isActive: n.id === activeNodeId,
          isPulsing: n.id === pulsingNodeId,
          accentColor: getLayerColor(n.id),
          nodeIndex: sorted.findIndex((s) => s.id === n.id),
          showDescriptions: settings.showDescriptions,
          nodeStyle: settings.nodeStyle,
          onClick: () => setSelectedNode(n),
        },
      }));
    },
    [data.nodes, activeNodeId, pulsingNodeId, dagrePositions, settings.showDescriptions, settings.nodeStyle]
  );

  // ── Build edges ───────────────────────────────────────────────────
  const rfEdges: Edge[] = useMemo(
    () =>
      dedupedConnections.map((c, i) => {
        const edgeId = `e-${i}`;
        const isPacketActive = edgeId === activeEdgeId;
        const isBursting = edgeId === burstingEdgeId;
        const isActive = c.from === activeNodeId || c.to === activeNodeId;
        const sourceColor = getLayerColor(c.from);
        const packetDurationMultiplier = isPlaying ? 0.8 : 1;
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
            isBursting,
            color: sourceColor,
            packetDurationMultiplier,
            label: c.label,
            showEdgeLabels: settings.showEdgeLabels,
          },
        };
      }),
    [dedupedConnections, activeNodeId, activeEdgeId, burstingEdgeId, isPlaying, settings.showEdgeLabels]
  );

  // ── goStep ──────────────────────────────────────────────────────
  const goStep = useCallback(
    (dir: 1 | -1, fromAutoplay = false) => {
      if (!fromAutoplay) {
        setIsPlaying(false);
      }

      setActiveStep((prev) => {
        const next = Math.max(0, Math.min(stepOrder.length - 1, prev + dir));
        if (next === prev) {
          if (fromAutoplay && dir === 1) {
            if (autoPlay) {
              setTimeout(() => setActiveStep(0), 800);
            } else {
              setIsPlaying(false);
            }
          }
          return prev;
        }

        const prevNodeId = stepOrder[prev];
        const nextNodeId = stepOrder[next];

        const forwardKey = `${prevNodeId}->${nextNodeId}`;
        const reverseKey = `${nextNodeId}->${prevNodeId}`;

        const matchingIdx = dedupedConnections.findIndex(
          (c) =>
            `${c.from}->${c.to}` === forwardKey ||
            `${c.from}->${c.to}` === reverseKey
        );

        if (matchingIdx !== -1) {
          const newEdgeId = `e-${matchingIdx}`;
          setActiveEdgeId(newEdgeId);
          setBurstingEdgeId(newEdgeId);
          setTimeout(() => setActiveEdgeId(null), 450);
          setTimeout(() => setBurstingEdgeId(null), 500);
        }

        setTimeout(() => {
          setPulsingNodeId(nextNodeId);
          setTimeout(() => setPulsingNodeId(null), 600);
        }, 150);

        const node = data.nodes.find((n) => n.id === nextNodeId);
        if (node) {
          const pos = node.position ?? dagrePositions.get(nextNodeId) ?? { x: 250, y: 100 };
          setTimeout(() => setCenter(pos.x + 110, pos.y + 40, { zoom: 1.2, duration: 500 }), 50);
        }

        prevStepRef.current = prev;
        return next;
      });
    },
    [stepOrder, data.nodes, dedupedConnections, dagrePositions, setCenter]
  );

  // ── Autoplay ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isPlaying) return;

    const intervalMs = SPEED_INTERVALS[speed] ?? 1800;
    const id = setInterval(() => {
      goStep(1, true);
    }, intervalMs);

    return () => clearInterval(id);
  }, [isPlaying, speed, goStep]);

  // ── Transition callout data ─────────────────────────────────────
  const transitionCallout = useMemo(() => {
    if (activeStep === 0) return null;
    const fromId = stepOrder[activeStep - 1];
    const toId = stepOrder[activeStep];
    const edge = dedupedConnections.find(
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
  }, [activeStep, stepOrder, dedupedConnections, data.nodes]);

  return (
    <div className="flex flex-col gap-0">
      <div className="relative w-full h-[500px] md:h-[520px] bg-background rounded-xl border border-border overflow-hidden">
        {/* Step controls + settings bar */}
        {!hideControls && (
          <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-card/80 backdrop-blur-sm border border-border rounded-lg px-3 py-2 shadow-lg flex-wrap">
            <button
              onClick={() => goStep(-1)}
              disabled={activeStep === 0}
              className="p-1 rounded hover:bg-muted disabled:opacity-30 text-foreground"
              aria-label="Previous step"
              title="Previous step"
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
              aria-label="Next step"
              title="Next step"
            >
              <ChevronRight size={18} />
            </button>
            <div className="w-px h-4 bg-border mx-1" />
            <button
              onClick={() => setIsPlaying((p) => !p)}
              disabled={activeStep === stepOrder.length - 1 && !isPlaying}
              className="p-1 rounded hover:bg-muted disabled:opacity-30 text-foreground"
              aria-label={isPlaying ? "Pause autoplay" : "Start autoplay"}
            >
              {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <div className="w-px h-4 bg-border mx-1" />
            {/* Settings bar replaces old LR/TB toggle */}
            <SettingsBar features={{ direction: true, density: true, edgeLabels: true, descriptions: true, nodeStyle: true }} />
          </div>
        )}

        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: fitPadding, minZoom: 0.1, maxZoom: 1.5 }}
          proOptions={{ hideAttribution: true }}
          minZoom={0.1}
          maxZoom={2}
        >
          <Background variant={BackgroundVariant.Lines} gap={40} color="rgba(148,163,184,0.06)" />
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

        <div
          className="pointer-events-none absolute inset-0 rounded-xl"
          style={{ background: "radial-gradient(ellipse 88% 88% at 50% 50%, transparent 42%, var(--background) 100%)" }}
        />

        <AnimatePresence>
          {selectedNode && <DetailPanel node={selectedNode} onClose={() => setSelectedNode(null)} />}
        </AnimatePresence>
      </div>

      {!hideControls && (
        <AnimatePresence mode="wait">
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
        </AnimatePresence>
      )}
    </div>
  );
}

// ── FlowAnimatorWithSettings wraps inner with context ─────────────
function FlowAnimatorWithSettings({ data, autoPlay = false, hideControls = false }: { data: FlowAnimatorData; autoPlay?: boolean; hideControls?: boolean }) {
  return (
    <DiagramSettingsProvider initialDirection="LR">
      <FlowAnimatorInner data={data} autoPlay={autoPlay} hideControls={hideControls} />
    </DiagramSettingsProvider>
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
        <FlowAnimatorWithSettings data={data} autoPlay={autoPlay} hideControls={hideControls} />
      </ReactFlowProvider>
    </div>
  );
}
