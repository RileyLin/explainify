"use client";

import React, { useState, useMemo, useId, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import * as LucideIcons from "lucide-react";
import type { FlowAnimatorData, FlowNode } from "@/lib/schemas/flow";

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

function getLayerFallbackIcon(nodeId: string): string {
  const lower = nodeId.toLowerCase();
  if (/client|user|browser|app/.test(lower))                      return "Monitor";
  if (/gateway|proxy|load|edge|cdn/.test(lower))                  return "ArrowLeftRight";
  if (/auth|iam|cognito|token|key/.test(lower))                   return "ShieldCheck";
  if (/lambda|function|worker|compute/.test(lower))               return "Zap";
  if (/service|api/.test(lower))                                  return "Server";
  if (/db|database|dynamo|redis|postgres|storage|s3/.test(lower)) return "Database";
  if (/queue|sns|sqs|event|stream/.test(lower))                   return "Layers";
  return "Box";
}

function getIcon(name?: string, fallbackId?: string): React.ComponentType<{ size?: number; style?: React.CSSProperties }> | null {
  const tryName = (n: string) => {
    const pascal = n.split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join("") as keyof typeof LucideIcons;
    const Icon = LucideIcons[pascal];
    if (Icon && (typeof Icon === "function" || (typeof Icon === "object" && Icon !== null))) {
      return Icon as React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
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
      api: "Server", queue: "MessageSquareMore", stream: "Workflow",
      user: "User", browser: "Globe", auth: "ShieldCheck", gateway: "ArrowLeftRight",
    };
    const aliased = aliases[name.toLowerCase()];
    if (aliased) { const f = tryName(aliased); if (f) return f; }
  }
  if (fallbackId) { const f = tryName(getLayerFallbackIcon(fallbackId)); if (f) return f; }
  return tryName("Box");
}

function NodeIcon({ name, nodeId, size, style }: { name?: string; nodeId?: string; size?: number; style?: React.CSSProperties }) {
  const Icon = getIcon(name, nodeId);
  if (!Icon) return null;
  return React.createElement(Icon, { size, style });
}

// ── Parse hex color to rgb components ────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// ── Layout computation ────────────────────────────────────────────
interface NodePosition { x: number; y: number }

function computeLayout(nodes: FlowNode[], connections: FlowAnimatorData["connections"]): Map<string, NodePosition> {
  const positions = new Map<string, NodePosition>();
  if (nodes.length === 0) return positions;

  const CX = 400, CY = 250;
  const centerNode = nodes[0];
  positions.set(centerNode.id, { x: CX, y: CY });

  // Find nodes directly connected to center
  const centerConnected = new Set<string>();
  connections.forEach((c) => {
    if (c.from === centerNode.id) centerConnected.add(c.to);
    if (c.to === centerNode.id) centerConnected.add(c.from);
  });

  const ring1Nodes = nodes.slice(1).filter((n) => centerConnected.has(n.id));
  const ring2Nodes = nodes.slice(1).filter((n) => !centerConnected.has(n.id));

  const r1Base = 160;
  const r1 = ring1Nodes.length > 8 ? r1Base * (ring1Nodes.length / 8) : r1Base;

  // Build initial equal-angle positions for ring-1
  const ring1Angles = ring1Nodes.map((_, i) => (i / ring1Nodes.length) * 2 * Math.PI - Math.PI / 2);

  // Force-aware nudge: pairs of ring-1 nodes that share a connection get nudged closer
  for (let iter = 0; iter < 3; iter++) {
    for (let a = 0; a < ring1Nodes.length; a++) {
      for (let b = a + 1; b < ring1Nodes.length; b++) {
        const connected = connections.some(
          (c) =>
            (c.from === ring1Nodes[a].id && c.to === ring1Nodes[b].id) ||
            (c.from === ring1Nodes[b].id && c.to === ring1Nodes[a].id)
        );
        if (connected) {
          // Nudge both angles 10% toward each other
          const mid = (ring1Angles[a] + ring1Angles[b]) / 2;
          ring1Angles[a] = ring1Angles[a] + (mid - ring1Angles[a]) * 0.2;
          ring1Angles[b] = ring1Angles[b] + (mid - ring1Angles[b]) * 0.2;
        }
      }
    }
  }

  ring1Nodes.forEach((n, i) => {
    positions.set(n.id, { x: CX + r1 * Math.cos(ring1Angles[i]), y: CY + r1 * Math.sin(ring1Angles[i]) });
  });

  // Ring-2: place OUTSIDE their ring-1 parent (away from center)
  ring2Nodes.forEach((n, i) => {
    // Find a ring-1 parent this node is connected to
    let parentPos: NodePosition | undefined;
    for (const c of connections) {
      if (c.from === n.id && positions.has(c.to) && ring1Nodes.some((r) => r.id === c.to)) {
        parentPos = positions.get(c.to); break;
      }
      if (c.to === n.id && positions.has(c.from) && ring1Nodes.some((r) => r.id === c.from)) {
        parentPos = positions.get(c.from); break;
      }
    }
    if (parentPos) {
      // Direction from center → parent, then extend further outward
      const dirX = parentPos.x - CX;
      const dirY = parentPos.y - CY;
      const len = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
      const unitX = dirX / len;
      const unitY = dirY / len;
      // Offset from parent outward; siblings of same parent fan out ±30°
      const siblingOffset = (i % 3 - 1) * 0.35; // angle nudge
      const cosO = Math.cos(siblingOffset);
      const sinO = Math.sin(siblingOffset);
      const rotX = unitX * cosO - unitY * sinO;
      const rotY = unitX * sinO + unitY * cosO;
      const dist = 120;
      positions.set(n.id, {
        x: parentPos.x + rotX * dist,
        y: parentPos.y + rotY * dist,
      });
    } else {
      const angle = (i / Math.max(ring2Nodes.length, 1)) * 2 * Math.PI - Math.PI / 2;
      const r2 = r1 + 130;
      positions.set(n.id, { x: CX + r2 * Math.cos(angle), y: CY + r2 * Math.sin(angle) });
    }
  });

  return positions;
}

// ── Detail Panel ───────────────────────────────────────────────────
function DetailPanel({ node, onClose }: { node: FlowNode; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="absolute right-4 top-4 bottom-4 w-72 bg-card border border-border rounded-xl shadow-2xl p-5 overflow-y-auto z-20"
    >
      <button onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground">
        <X size={18} />
      </button>
      <div className="flex items-center gap-2 mb-3">
        <NodeIcon name={node.icon} nodeId={node.id} size={22} style={{ color: getLayerColor(node.id) }} />
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

// ── Connection line with arrowhead + label ─────────────────────────
function ConnectionLine({
  fromPos, toPos, color, id, isActive, label, pulsing,
}: {
  fromPos: NodePosition; toPos: NodePosition; color: string; id: string; isActive: boolean; label?: string; pulsing?: boolean;
}) {
  const [r, g, b] = hexToRgb(color);
  const pathD = `M ${fromPos.x} ${fromPos.y} L ${toPos.x} ${toPos.y}`;
  const pathId = `mol-path-${id}`;
  const markerId = `mol-arrow-${id}`;

  // Midpoint and angle for label
  const mx = (fromPos.x + toPos.x) / 2;
  const my = (fromPos.y + toPos.y) / 2;
  const dx = toPos.x - fromPos.x;
  const dy = toPos.y - fromPos.y;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  // Flip label if it would be upside-down
  const labelAngle = angle > 90 || angle < -90 ? angle + 180 : angle;

  return (
    <>
      <defs>
        {/* Subtle chevron arrowhead — thin, not filled triangle */}
        <marker
          id={markerId}
          markerWidth="8"
          markerHeight="8"
          refX="6"
          refY="4"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <polyline
            points="1,1 6,4 1,7"
            fill="none"
            stroke={isActive ? color : `rgba(${r},${g},${b},0.4)`}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </marker>
      </defs>

      <path
        id={pathId}
        d={pathD}
        fill="none"
        stroke={isActive ? color : `rgba(${r},${g},${b},0.25)`}
        strokeWidth={isActive ? 2 : 1.2}
        markerEnd={`url(#${markerId})`}
        style={
          isActive
            ? { filter: `drop-shadow(0 0 4px rgba(${r},${g},${b},0.6))` }
            : undefined
        }
      />

      {/* 2 staggered glowing packets */}
      {[0, 1].map((i) => (
        <circle
          key={i}
          r={isActive ? 4 : 2.5}
          fill={isActive ? color : `rgba(${r},${g},${b},0.35)`}
          style={{
            filter: isActive ? `drop-shadow(0 0 5px ${color})` : "none",
            opacity: isActive ? 0.9 : 0.5,
          }}
        >
          <animateMotion dur="1.6s" repeatCount="indefinite" begin={`${i * 0.8}s`}>
            <mpath href={`#${pathId}`} />
          </animateMotion>
        </circle>
      ))}

      {/* Connection label at midpoint */}
      {label && label.trim() && (
        <g transform={`translate(${mx}, ${my}) rotate(${labelAngle})`}>
          {/* Dark pill background */}
          <rect
            x={-label.length * 3}
            y={-8}
            width={label.length * 6}
            height={13}
            rx={4}
            fill="rgba(0,0,0,0.55)"
            style={{ backdropFilter: "blur(4px)" }}
          />
          <text
            x={0}
            y={3}
            textAnchor="middle"
            fontSize={9}
            fill="white"
            opacity={isActive ? 0.95 : 0.65}
            style={{ pointerEvents: "none", userSelect: "none", fontWeight: 500 }}
          >
            {label}
          </text>
        </g>
      )}

      {/* Pulse animation for connected nodes on select — driven by parent */}
      {pulsing && (
        <circle
          cx={toPos.x}
          cy={toPos.y}
          r={48}
          fill="none"
          stroke={color}
          strokeWidth={2}
          opacity={0}
        >
          <animate attributeName="r" from="38" to="60" dur="0.3s" fill="freeze" />
          <animate attributeName="opacity" values="0.5;0" dur="0.3s" fill="freeze" />
        </circle>
      )}
    </>
  );
}

// ── Single molecule node ───────────────────────────────────────────
function MoleculeNode({
  node, pos, isCenter, isSelected, isPulsing, index, onClick,
}: {
  node: FlowNode; pos: NodePosition; isCenter: boolean; isSelected: boolean; isPulsing: boolean; index: number; onClick: () => void;
}) {
  const color = getLayerColor(node.id);
  const [r, g, b] = hexToRgb(color);
  const radius = isCenter ? 46 : 38;
  const badge = getLayerBadge(node.id);
  const breathDelay = index * 0.5;

  return (
    <motion.g
      onClick={onClick}
      style={{ cursor: "pointer" }}
      initial={{ opacity: 0, scale: 0 }}
      animate={
        isPulsing
          ? { opacity: 1, scale: [1, 1.1, 1] }
          : { opacity: 1, scale: 1 }
      }
      transition={
        isPulsing
          ? { duration: 0.3, ease: "easeOut" }
          : { duration: 0.5, delay: index * 0.06, ease: [0.34, 1.56, 0.64, 1] }
      }
    >
      {/* Breathing pulse — idle scale animation */}
      <motion.g
        animate={{ scale: isSelected ? [1, 1.08, 1] : [1, 1.05, 1] }}
        transition={{
          duration: isSelected ? 1.2 : 3,
          repeat: Infinity,
          ease: "easeInOut",
          delay: breathDelay,
        }}
        style={{ transformOrigin: `${pos.x}px ${pos.y}px` }}
      >
        {/* Outer glow ring when selected */}
        {isSelected && (
          <circle
            cx={pos.x} cy={pos.y}
            r={radius + 8}
            fill="none"
            stroke={color}
            strokeWidth={2}
            opacity={0.6}
            style={{ filter: `drop-shadow(0 0 8px ${color})` }}
          />
        )}

        {/* Main circle — background fill */}
        <circle
          cx={pos.x} cy={pos.y}
          r={radius}
          fill={`rgba(${r},${g},${b},0.12)`}
          stroke={color}
          strokeWidth={isCenter ? 3 : 2}
          opacity={isSelected ? 1 : 0.85}
          style={
            isSelected
              ? { filter: `drop-shadow(0 0 10px rgba(${r},${g},${b},0.5))` }
              : { filter: `drop-shadow(0 0 4px rgba(${r},${g},${b},0.2))` }
          }
        />

        {/* Subtle radial gradient overlay */}
        <circle
          cx={pos.x - radius * 0.25}
          cy={pos.y - radius * 0.25}
          r={radius * 0.6}
          fill={`rgba(${r},${g},${b},0.06)`}
        />

        {/* Icon via foreignObject */}
        <foreignObject
          x={pos.x - 9} y={pos.y - 9}
          width={18} height={18}
          style={{ overflow: "visible", pointerEvents: "none" }}
        >
          <NodeIcon name={node.icon} nodeId={node.id} size={18} style={{ color, display: "block" }} />
        </foreignObject>
      </motion.g>

      {/* Layer badge pill — above the circle */}
      <foreignObject
        x={pos.x - 28} y={pos.y - radius - 20}
        width={56} height={16}
        style={{ overflow: "visible", pointerEvents: "none" }}
      >
        <div
          style={{
            fontSize: 8,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color,
            background: `rgba(${r},${g},${b},0.15)`,
            borderRadius: 6,
            padding: "1px 5px",
            whiteSpace: "nowrap",
            textAlign: "center",
            border: `1px solid rgba(${r},${g},${b},0.3)`,
          }}
        >
          {badge}
        </div>
      </foreignObject>

      {/* Label below the circle */}
      <text
        x={pos.x}
        y={pos.y + radius + 16}
        textAnchor="middle"
        fontSize={12}
        fontWeight={600}
        fill="white"
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        {node.label}
      </text>
    </motion.g>
  );
}

// ── Main MoleculeRenderer ──────────────────────────────────────────
export function MoleculeRenderer({ data }: { data: FlowAnimatorData }) {
  const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null);
  const [pulsingNodes, setPulsingNodes] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  const positions = useMemo(
    () => computeLayout(data.nodes, data.connections),
    [data.nodes, data.connections]
  );

  // Compute bounding box of all nodes with padding for labels/badges
  const bounds = useMemo(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    positions.forEach((pos) => {
      minX = Math.min(minX, pos.x - 60);
      minY = Math.min(minY, pos.y - 70); // extra for badge
      maxX = Math.max(maxX, pos.x + 60);
      maxY = Math.max(maxY, pos.y + 60); // extra for label
    });
    const pad = 40;
    return {
      x: minX - pad,
      y: minY - pad,
      width: (maxX - minX) + pad * 2,
      height: (maxY - minY) + pad * 2,
    };
  }, [positions]);

  // Pan + zoom state
  const [viewBox, setViewBox] = useState(bounds);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, vbX: 0, vbY: 0 });

  // Animated viewBox for smooth re-center
  const animFrameRef = useRef<number | null>(null);

  // Reset viewBox when bounds change (new data)
  useEffect(() => { setViewBox(bounds); }, [bounds]);

  const fitView = useCallback(() => {
    setSelectedNode(null);
    animateViewBox(bounds);
  }, [bounds]); // eslint-disable-line react-hooks/exhaustive-deps

  // Smooth viewBox animation via requestAnimationFrame
  const animateViewBox = useCallback((target: typeof bounds) => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    const start = performance.now();
    const duration = 350;

    setViewBox((current) => {
      const from = { ...current };

      const step = (now: number) => {
        const t = Math.min((now - start) / duration, 1);
        // ease-in-out cubic
        const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        setViewBox({
          x: from.x + (target.x - from.x) * ease,
          y: from.y + (target.y - from.y) * ease,
          width: from.width + (target.width - from.width) * ease,
          height: from.height + (target.height - from.height) * ease,
        });
        if (t < 1) animFrameRef.current = requestAnimationFrame(step);
      };

      animFrameRef.current = requestAnimationFrame(step);
      return from; // keep current until RAF kicks in
    });
  }, []);

  useEffect(() => () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); }, []);

  const zoom = useCallback((factor: number) => {
    setViewBox((vb) => {
      const cx = vb.x + vb.width / 2;
      const cy = vb.y + vb.height / 2;
      const newW = vb.width * factor;
      const newH = vb.height * factor;
      return { x: cx - newW / 2, y: cy - newH / 2, width: newW, height: newH };
    });
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    zoom(factor);
  }, [zoom]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    panStartRef.current = { x: e.clientX, y: e.clientY, vbX: viewBox.x, vbY: viewBox.y };
  }, [viewBox]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const scaleX = viewBox.width / rect.width;
    const scaleY = viewBox.height / rect.height;
    const dx = (e.clientX - panStartRef.current.x) * scaleX;
    const dy = (e.clientY - panStartRef.current.y) * scaleY;
    setViewBox((vb) => ({
      ...vb,
      x: panStartRef.current.vbX - dx,
      y: panStartRef.current.vbY - dy,
    }));
  }, [isPanning, viewBox.width, viewBox.height]);

  const handleMouseUp = useCallback(() => { setIsPanning(false); }, []);

  // Build a set of active connection ids and connected node ids when a node is selected
  const { activeConnectionIds, connectedNodeIds } = useMemo(() => {
    if (!selectedNode) return { activeConnectionIds: new Set<string>(), connectedNodeIds: new Set<string>() };
    const connIds = new Set<string>();
    const nodeIds = new Set<string>();
    data.connections.forEach((c, i) => {
      if (c.from === selectedNode.id || c.to === selectedNode.id) {
        connIds.add(`${i}`);
        nodeIds.add(c.from);
        nodeIds.add(c.to);
      }
    });
    return { activeConnectionIds: connIds, connectedNodeIds: nodeIds };
  }, [selectedNode, data.connections]);

  // Handle node click: re-center + pulse connected nodes
  const handleNodeClick = useCallback((node: FlowNode) => {
    if (selectedNode?.id === node.id) {
      // Deselect — fit view back
      setSelectedNode(null);
      animateViewBox(bounds);
      return;
    }

    setSelectedNode(node);

    // Re-center viewBox on clicked node
    const pos = positions.get(node.id);
    if (pos) {
      const w = viewBox.width;
      const h = viewBox.height;
      animateViewBox({ x: pos.x - w / 2, y: pos.y - h / 2, width: w, height: h });
    }

    // Pulse connected nodes
    const connected = new Set<string>();
    data.connections.forEach((c) => {
      if (c.from === node.id) connected.add(c.to);
      if (c.to === node.id) connected.add(c.from);
    });
    setPulsingNodes(connected);
    setTimeout(() => setPulsingNodes(new Set()), 350);
  }, [selectedNode, positions, viewBox.width, viewBox.height, data.connections, bounds, animateViewBox]);

  const viewBoxStr = `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`;

  return (
    <div>
      {/* Header */}
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-foreground">{data.meta.title}</h2>
        <p className="text-muted-foreground mt-1">{data.meta.summary}</p>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="relative w-full bg-background rounded-xl border border-border overflow-hidden"
        style={{ height: 480, cursor: isPanning ? "grabbing" : "grab" }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Zoom controls */}
        <div className="absolute top-3 left-3 z-10 flex flex-col gap-1">
          <button
            onClick={() => zoom(0.8)}
            className="w-7 h-7 flex items-center justify-center rounded-md bg-card/90 border border-border hover:bg-muted text-foreground"
            title="Zoom in"
          >
            <ZoomIn size={14} />
          </button>
          <button
            onClick={() => zoom(1.25)}
            className="w-7 h-7 flex items-center justify-center rounded-md bg-card/90 border border-border hover:bg-muted text-foreground"
            title="Zoom out"
          >
            <ZoomOut size={14} />
          </button>
          <button
            onClick={fitView}
            className="w-7 h-7 flex items-center justify-center rounded-md bg-card/90 border border-border hover:bg-muted text-foreground"
            title="Fit view"
          >
            <Maximize2 size={14} />
          </button>
        </div>

        <svg
          viewBox={viewBoxStr}
          width="100%"
          height="100%"
          style={{ display: "block", userSelect: "none" }}
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Subtle radial bg glow */}
          <defs>
            <radialGradient id="mol-bg-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(59,130,246,0.04)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0)" />
            </radialGradient>
          </defs>
          <rect x={viewBox.x} y={viewBox.y} width={viewBox.width} height={viewBox.height} fill="url(#mol-bg-glow)" />

          {/* Grid dots */}
          <pattern id="mol-grid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
            <circle cx="20" cy="20" r="0.8" fill="rgba(148,163,184,0.08)" />
          </pattern>
          <rect x={viewBox.x} y={viewBox.y} width={viewBox.width} height={viewBox.height} fill="url(#mol-grid)" />

          {/* Connection lines (drawn first, behind nodes) */}
          {data.connections.map((c, i) => {
            const fromPos = positions.get(c.from);
            const toPos = positions.get(c.to);
            if (!fromPos || !toPos) return null;
            const color = getLayerColor(c.from);
            const isActive = activeConnectionIds.has(`${i}`);
            return (
              <ConnectionLine
                key={i}
                id={`${i}`}
                fromPos={fromPos}
                toPos={toPos}
                color={color}
                isActive={isActive}
                label={c.label}
              />
            );
          })}

          {/* Nodes */}
          {data.nodes.map((node, i) => {
            const pos = positions.get(node.id);
            if (!pos) return null;
            const isCenter = i === 0;
            const isSelected = selectedNode?.id === node.id;
            const isPulsing = pulsingNodes.has(node.id);
            return (
              <MoleculeNode
                key={node.id}
                node={node}
                pos={pos}
                isCenter={isCenter}
                isSelected={isSelected}
                isPulsing={isPulsing}
                index={i}
                onClick={() => handleNodeClick(node)}
              />
            );
          })}
        </svg>

        {/* Vignette */}
        <div
          className="pointer-events-none absolute inset-0 rounded-xl"
          style={{ background: "radial-gradient(ellipse 88% 88% at 50% 50%, transparent 50%, var(--background) 100%)" }}
        />

        {/* Detail panel */}
        <AnimatePresence>
          {selectedNode && (
            <DetailPanel node={selectedNode} onClose={() => { setSelectedNode(null); animateViewBox(bounds); }} />
          )}
        </AnimatePresence>
      </div>

      {/* Click hint */}
      <p className="text-xs text-muted-foreground text-center mt-2">
        Click any node to explore it · Click again to deselect
      </p>
    </div>
  );
}
