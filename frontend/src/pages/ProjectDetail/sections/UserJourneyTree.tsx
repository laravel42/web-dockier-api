import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Handle,
  type Node,
  type Edge,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { UserJourneyNode } from "../../../components/DeployWizard/types";
import { cardCls } from "../../../utils/styles";

interface Props {
  journey: UserJourneyNode;
}

const DEPTH_COLORS = ["#6366f1", "#3b82f6", "#f59e0b", "#10b981", "#a855f7"];
const DEPTH_BG = ["#eef2ff", "#eff6ff", "#fffbeb", "#ecfdf5", "#faf5ff"];

function JourneyNodeComponent({ data }: { data: { label: string; depth: number } }) {
  const color = DEPTH_COLORS[Math.min(data.depth, DEPTH_COLORS.length - 1)];
  const bg = DEPTH_BG[Math.min(data.depth, DEPTH_BG.length - 1)];
  return (
    <div
      className="rounded-lg border px-4 py-2 shadow-sm"
      style={{ backgroundColor: bg, borderColor: color + "60", minWidth: 130 }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div className="text-xs/snug font-medium " style={{ color }}>{data.label}</div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

const nodeTypes = { journey: JourneyNodeComponent };

function countNodes(node: UserJourneyNode): number {
  let c = 1;
  if (node.children) for (const ch of node.children) c += countNodes(ch);
  return c;
}

// Horizontal tree layout: root on left, children extend right
function buildHorizontalTree(root: UserJourneyNode): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  let idCounter = 0;
  const xSpacing = 230;
  const nodeHeight = 40; // approximate rendered height including padding
  const yGap = 16; // gap between sibling nodes

  // First: compute subtree sizes (number of leaves) for spacing
  function leafCount(node: UserJourneyNode): number {
    if (!node.children?.length) return 1;
    return node.children.reduce((sum, ch) => sum + leafCount(ch), 0);
  }

  // Recursive layout: returns the y-center of the placed subtree
  function layout(node: UserJourneyNode, depth: number, yStart: number, parentId: string | null): number {
    const id = `j-${idCounter++}`;
    const children = node.children || [];

    if (children.length === 0) {
      // Leaf node
      const y = yStart;
      nodes.push({
        id, type: "journey",
        position: { x: depth * xSpacing, y },
        data: { label: node.label, depth },
      });
      if (parentId) {
        edges.push({
          id: `e-${parentId}-${id}`, source: parentId, target: id, type: "smoothstep",
          style: { stroke: DEPTH_COLORS[Math.min(depth, DEPTH_COLORS.length - 1)] + "80", strokeWidth: 2 },
        });
      }
      return y;
    }

    // Place children first, then center parent
    let currentY = yStart;
    const childCenters: number[] = [];
    for (const child of children) {
      const center = layout(child, depth + 1, currentY, id);
      childCenters.push(center);
      const leaves = leafCount(child);
      currentY += leaves * (nodeHeight + yGap);
    }

    const parentY = (childCenters[0] + childCenters[childCenters.length - 1]) / 2;
    nodes.push({
      id, type: "journey",
      position: { x: depth * xSpacing, y: parentY },
      data: { label: node.label, depth },
    });
    if (parentId) {
      edges.push({
        id: `e-${parentId}-${id}`, source: parentId, target: id, type: "smoothstep",
        style: { stroke: DEPTH_COLORS[Math.min(depth, DEPTH_COLORS.length - 1)] + "80", strokeWidth: 2 },
      });
    }

    return parentY;
  }

  layout(root, 0, 0, null);
  return { nodes, edges };
}

export default function UserJourneyTree({ journey }: Props) {
  const hasJourney = Boolean(journey?.label);
  const total = useMemo(() => (hasJourney ? countNodes(journey) : 0), [hasJourney, journey]);
  const { nodes, edges } = useMemo(
    () => (hasJourney ? buildHorizontalTree(journey) : { nodes: [], edges: [] }),
    [hasJourney, journey],
  );

  const padding = 20;
  const graphHeight = useMemo(() => {
    if (!nodes.length) return 200;
    const ys = nodes.map((n) => n.position.y);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return Math.max(200, maxY - minY + 40 + padding * 2);
  }, [nodes]);

  if (!hasJourney) return null;

  return (
    <div className={`${cardCls} mb-6 overflow-hidden`}>
      <div className="h-1 bg-linear-to-r from-blue-500 via-indigo-400 to-purple-400" />
      <div className="px-5 py-4">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="size-7  rounded-md bg-indigo-100 flex items-center justify-center">
            <svg className="size-4  text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-text">User Journey</h2>
            <p className="text-[11px] text-text-muted">{total} steps</p>
          </div>
        </div>
      </div>
      <div style={{ height: graphHeight }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.05 }}
          minZoom={0.3}
          maxZoom={2}
          nodesDraggable={false}
          nodesConnectable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} color="var(--color-border)" />
        </ReactFlow>
      </div>
    </div>
  );
}
