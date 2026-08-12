"use client";

import "@xyflow/react/dist/style.css";

import {
  addEdge,
  Background,
  type Connection,
  Controls,
  type Edge,
  Handle,
  MarkerType,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  File,
  FileText,
  GitBranch,
  Info,
  Lightbulb,
  Link2,
  MoreHorizontal,
  Package,
  Settings,
  Share2,
  Star,
  Users,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import { ProjectManagementIssueGantt1 } from "./issue-gantt-1";
import { ProjectManagementIssueKanban1 } from "./issue-kanban-1";
import { ProjectManagementIssueSpreadsheet1 } from "./issue-spreadsheet-1";

const backlogItems = [
  "Automate status reports",
  "Advanced search and filters",
  "Timesheet enhancements",
  "Resource planning view",
  "Mobile notifications",
];

const contributors = [
  {
    name: "Marcus Chen",
    role: "Program Lead",
    avatar: "/avatars/avatar-3.png",
  },
  {
    name: "Priya Shah",
    role: "Product Manager",
    avatar: "/avatars/avatar-2.png",
  },
];

const tabs = [
  "Overview",
  "Tasks",
  "Issues",
  "Dependencies",
  "Timeline",
  "Activity",
  "Comments",
] as const;

type DetailTab = (typeof tabs)[number];

const activityRows = [
  {
    title: "Requirements.xlsx uploaded",
    detail: "Priya Shah added the latest requirements export.",
    date: "Today",
  },
  {
    title: "Database schema moved forward",
    detail: "Marcus Chen marked the schema review as in progress.",
    date: "Yesterday",
  },
  {
    title: "Client assets requested",
    detail: "Waiting on source files before design validation can complete.",
    date: "08 Jan",
  },
];

const comments = [
  {
    author: "Marcus Chen",
    text: "Need the client asset pack before design validation can close.",
    time: "10:42 AM",
  },
  {
    author: "Priya Shah",
    text: "Requirements are updated. I added notes for reporting and permissions.",
    time: "Yesterday",
  },
];

const flowMetrics = [
  { label: "Issues", value: "6" },
  { label: "In progress", value: "1" },
  { label: "Links sent", value: "3" },
  { label: "Blocked", value: "1" },
  { label: "Done", value: "1" },
];

const flowRates = [
  { x: 24, label: "17%" },
  { x: 45, label: "50%" },
  { x: 64, label: "33%" },
  { x: 84, label: "17%" },
];

type DependencyStatus = "on-track" | "at-risk" | "blocked" | "external";

type DependencyProgram = {
  id: string;
  label: string;
  status: DependencyStatus;
  x: number;
  y: number;
  w: number;
  avatars?: string[];
  extra?: string;
  meta?: string;
};

type DependencyNodeData = Record<string, unknown> & {
  program: DependencyProgram;
};

type DependencyNodeType = Node<DependencyNodeData, "dependency">;

const dependencyPrograms: DependencyProgram[] = [
  {
    id: "discovery",
    label: "Initial discovery & alignment",
    status: "on-track",
    x: 40,
    y: 70,
    w: 250,
    avatars: ["/avatars/avatar-3.png", "/avatars/avatar-2.png"],
    extra: "+1",
  },
  {
    id: "assets",
    label: "Client assets and files",
    status: "external",
    x: 40,
    y: 270,
    w: 240,
    meta: "External",
  },
  {
    id: "core",
    label: "Internal PM System",
    status: "at-risk",
    x: 360,
    y: 175,
    w: 260,
    avatars: ["/avatars/avatar-3.png", "/avatars/avatar-2.png"],
    extra: "+1",
  },
  {
    id: "design",
    label: "Design & validation",
    status: "at-risk",
    x: 760,
    y: 40,
    w: 260,
    avatars: ["/avatars/avatar-1.png", "/avatars/avatar-4.png"],
  },
  {
    id: "engineering",
    label: "Engineering delivery",
    status: "on-track",
    x: 760,
    y: 170,
    w: 260,
    avatars: ["/avatars/avatar-black-3.png", "/avatars/avatar-black-2.png"],
    extra: "+2",
  },
  {
    id: "notes",
    label: "Stakeholder notes",
    status: "external",
    x: 760,
    y: 315,
    w: 260,
    meta: "External",
  },
  {
    id: "rollout",
    label: "QA and rollout",
    status: "at-risk",
    x: 1080,
    y: 185,
    w: 190,
    avatars: ["/avatars/avatar-3.png", "/avatars/avatar-5.png"],
  },
];

const statusClass = {
  "on-track": "bg-chart-1",
  "at-risk": "bg-chart-2",
  blocked: "bg-destructive",
  external: "bg-muted-foreground/50",
};

const dependencyEdgeColor = "var(--muted-foreground)";

const dependencyLinks = [
  { from: "discovery", to: "core" },
  { from: "assets", to: "core" },
  { from: "core", to: "design" },
  { from: "core", to: "engineering" },
  { from: "core", to: "notes" },
  { from: "design", to: "rollout" },
  { from: "engineering", to: "rollout" },
  { from: "notes", to: "rollout" },
];

function MiniAvatarStack({
  avatars = [],
  extra,
}: {
  avatars?: string[];
  extra?: string;
}) {
  if (!avatars.length && !extra) return null;

  return (
    <div className="mt-3 flex items-center">
      {avatars.map((avatar, index) => (
        <Avatar key={avatar} className="border-background -mr-1 size-5 border">
          <AvatarImage src={avatar} alt="" />
          <AvatarFallback>{index + 1}</AvatarFallback>
        </Avatar>
      ))}
      {extra ? (
        <span className="bg-muted text-muted-foreground ml-2 grid size-5 place-items-center rounded-full text-[10px]">
          {extra}
        </span>
      ) : null}
    </div>
  );
}

function DependencyFlowNode({ data, selected }: NodeProps<DependencyNodeType>) {
  const { program } = data;

  return (
    <div
      className={`group bg-background relative rounded-md border px-4 py-3 shadow-sm ${
        selected || program.id === "core"
          ? "border-primary ring-primary ring-1"
          : "border-border"
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-muted-foreground !size-2 !border-0 !opacity-0 transition-opacity group-hover:!opacity-100"
      />
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-muted-foreground !size-2 !border-0 !opacity-0 transition-opacity group-hover:!opacity-100"
      />
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={`size-2.5 shrink-0 rounded-full ${statusClass[program.status]}`}
        />
        <p className="truncate text-sm font-medium">{program.label}</p>
      </div>
      {program.meta ? (
        <div className="text-muted-foreground mt-3 flex items-center gap-2 text-xs">
          <Package className="size-3.5" />
          {program.meta}
        </div>
      ) : (
        <MiniAvatarStack avatars={program.avatars} extra={program.extra} />
      )}
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-muted-foreground !size-2 !border-0 !opacity-0 transition-opacity group-hover:!opacity-100"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-muted-foreground !size-2 !border-0 !opacity-0 transition-opacity group-hover:!opacity-100"
      />
    </div>
  );
}

const nodeTypes = {
  dependency: DependencyFlowNode,
};

function DependencyCanvas() {
  const { resolvedTheme } = useTheme();
  const [isMounted, setIsMounted] = useState(false);
  const flowColorMode = resolvedTheme === "dark" ? "dark" : "light";
  const backgroundDotColor =
    resolvedTheme === "dark"
      ? "color-mix(in oklab, var(--muted-foreground) 42%, transparent)"
      : "hsl(var(--border))";

  const initialNodes = useMemo<DependencyNodeType[]>(
    () =>
      dependencyPrograms.map((program) => ({
        id: program.id,
        type: "dependency",
        position: { x: program.x, y: program.y },
        data: { program },
        style: { width: program.w },
      })),
    [],
  );

  const initialEdges = useMemo<Edge[]>(
    () =>
      dependencyLinks.map((dependency) => ({
        id: `${dependency.from}-${dependency.to}`,
        source: dependency.from,
        target: dependency.to,
        type: "smoothstep",
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: dependencyEdgeColor,
        },
        style: {
          stroke: dependencyEdgeColor,
          strokeDasharray: "6 6",
          strokeWidth: 1.5,
        },
      })),
    [],
  );

  const [nodes, _setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((currentEdges) =>
        addEdge(
          {
            ...connection,
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: dependencyEdgeColor,
            },
            style: {
              stroke: dependencyEdgeColor,
              strokeDasharray: "6 6",
              strokeWidth: 1.5,
            },
            type: "smoothstep",
          },
          currentEdges,
        ),
      );
    },
    [setEdges],
  );

  return (
    <section className="bg-background overflow-hidden border-y">
      <div className="relative h-[320px] overflow-hidden sm:h-[360px]">
        {isMounted ? (
          <ReactFlow
            colorMode={flowColorMode}
            connectionLineStyle={{
              stroke: dependencyEdgeColor,
              strokeDasharray: "6 6",
              strokeWidth: 1.5,
            }}
            defaultEdgeOptions={{
              markerEnd: { type: MarkerType.ArrowClosed },
              style: {
                stroke: dependencyEdgeColor,
                strokeDasharray: "6 6",
                strokeWidth: 1.5,
              },
              type: "smoothstep",
            }}
            edges={edges}
            fitView
            fitViewOptions={{ padding: 0.12 }}
            maxZoom={1.5}
            minZoom={0.32}
            nodes={nodes}
            nodeTypes={nodeTypes}
            onConnect={onConnect}
            onEdgesChange={onEdgesChange}
            onNodesChange={onNodesChange}
            panOnDrag
            proOptions={{ hideAttribution: true }}
            className="!bg-background [&_.react-flow__controls]:!bg-background [&_.react-flow__controls-button]:!border-border [&_.react-flow__controls-button]:!bg-background [&_.react-flow__controls-button]:!text-foreground [&_.react-flow__attribution]:hidden [&_.react-flow__controls]:!flex [&_.react-flow__controls]:!flex-row [&_.react-flow__controls]:!overflow-hidden [&_.react-flow__controls]:!rounded-md [&_.react-flow__controls]:!border [&_.react-flow__controls]:!shadow-sm [&_.react-flow__controls-button]:!size-8 [&_.react-flow__panel]:!m-3 sm:[&_.react-flow__panel]:!m-5"
          >
            <Background color={backgroundDotColor} gap={16} size={1} />
            <Controls position="top-right" showInteractive />
          </ReactFlow>
        ) : (
          <div className="grid size-full place-items-center">
            <div className="text-muted-foreground text-xs">
              Loading dependency canvas...
            </div>
          </div>
        )}
      </div>
      <div className="flex min-h-14 flex-wrap items-center gap-x-5 gap-y-2 border-t px-4 py-3 text-sm sm:px-5">
        {[
          ["On Track", "bg-chart-1"],
          ["At Risk", "bg-chart-2"],
          ["Blocked", "bg-destructive"],
          ["External", "bg-muted-foreground/50"],
        ].map(([label, color]) => (
          <span key={label} className="flex items-center gap-2">
            <span className={`size-3 rounded-full ${color}`} />
            {label}
          </span>
        ))}
        <span className="flex items-center gap-2">
          <span className="border-muted-foreground h-px w-8 border-t border-dashed" />
          Dependency
        </span>
      </div>
    </section>
  );
}

function OverviewPanel() {
  return (
    <section className="grid gap-4 lg:grid-cols-3">
      <div className="rounded-md border p-5">
        <h2 className="font-semibold">Outcomes</h2>
        <div className="mt-4 space-y-3 text-sm">
          {[
            "Reduce weekly status prep to 20 minutes",
            "Centralize blockers before standup",
            "Improve delivery predictability",
          ].map((item) => (
            <div key={item} className="flex gap-3">
              <CheckCircle2 className="text-primary mt-0.5 size-4 shrink-0" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-md border p-5">
        <h2 className="font-semibold">Scope</h2>
        <div className="mt-4 space-y-3 text-sm">
          {[
            "Project intake",
            "Issue planning",
            "Role permissions",
            "Delivery reporting",
          ].map((item) => (
            <div key={item} className="flex items-center justify-between gap-3">
              <span>{item}</span>
              <Badge variant="secondary" className="rounded-md">
                In scope
              </Badge>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-md border p-5">
        <h2 className="font-semibold">Health notes</h2>
        <p className="text-muted-foreground mt-4 text-sm leading-6">
          Timeline is at risk because client assets are still blocking design
          validation. Engineering can continue schema and API work while the
          asset dependency is resolved.
        </p>
      </div>
    </section>
  );
}

function ActivityPanel() {
  return (
    <section className="rounded-md border p-5">
      <div className="space-y-5">
        {activityRows.map((item, index) => (
          <div key={item.title} className="grid grid-cols-[24px_1fr] gap-3">
            <div className="relative flex justify-center pt-1.5">
              <span
                className={
                  index === 0
                    ? "bg-foreground size-2.5 rounded-full"
                    : "bg-muted-foreground/40 size-2.5 rounded-full"
                }
              />
              {index < activityRows.length - 1 ? (
                <span className="bg-border absolute top-5 bottom-[-22px] w-px" />
              ) : null}
            </div>
            <div>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-semibold">{item.title}</p>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {item.date}
                </span>
              </div>
              <p className="text-muted-foreground mt-1 text-sm leading-6">
                {item.detail}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CommentsPanel() {
  return (
    <section className="space-y-3">
      {comments.map((comment) => (
        <div
          key={`${comment.author}-${comment.time}`}
          className="rounded-md border p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">{comment.author}</p>
            <span className="text-muted-foreground text-xs">
              {comment.time}
            </span>
          </div>
          <p className="text-muted-foreground mt-2 text-sm leading-6">
            {comment.text}
          </p>
        </div>
      ))}
      <div className="text-muted-foreground rounded-md border border-dashed p-4 text-sm">
        Add a comment...
      </div>
    </section>
  );
}

function TabPanel({ activeTab }: { activeTab: DetailTab }) {
  if (activeTab === "Overview") return <OverviewPanel />;
  if (activeTab === "Tasks")
    return (
      <section className="border-border h-[560px] overflow-hidden border-y">
        <ProjectManagementIssueKanban1 embedded openBoard />
      </section>
    );
  if (activeTab === "Issues")
    return (
      <section className="border-border h-[560px] overflow-hidden border-y">
        <ProjectManagementIssueSpreadsheet1 embedded />
      </section>
    );
  if (activeTab === "Timeline")
    return (
      <section className="border-border h-[560px] overflow-hidden border-y">
        <ProjectManagementIssueGantt1 embedded />
      </section>
    );
  if (activeTab === "Activity") return <ActivityPanel />;
  if (activeTab === "Comments") return <CommentsPanel />;

  return <DependencyCanvas />;
}

function DeliveryFlowPanel() {
  return (
    <section className="bg-background overflow-hidden rounded-[14px] border">
      <div className="md:hidden">
        <div className="grid grid-cols-6 border-b">
          {flowMetrics.map((metric, index) => (
            <div
              key={metric.label}
              className={`border-border min-h-20 px-4 py-3 ${
                index < 3
                  ? `col-span-2 border-b ${index < 2 ? "border-r" : ""}`
                  : `col-span-3 ${index === 3 ? "border-r" : ""}`
              }`}
            >
              <p className="text-muted-foreground text-xs">{metric.label}</p>
              <p className="mt-1 text-xl font-semibold tracking-tight">
                {metric.value}
              </p>
            </div>
          ))}
        </div>

        <div className="relative h-32 border-b">
          <svg
            className="pointer-events-none absolute inset-x-0 top-6 h-20 w-full"
            viewBox="0 0 1000 150"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient
                id="project-detail-flow-gradient-mobile"
                x1="0"
                y1="0"
                x2="1"
                y2="0"
              >
                <stop
                  offset="0%"
                  stopColor="var(--primary)"
                  stopOpacity="0.06"
                />
                <stop
                  offset="22%"
                  stopColor="var(--primary)"
                  stopOpacity="0.1"
                />
                <stop
                  offset="45%"
                  stopColor="var(--primary)"
                  stopOpacity="0.18"
                />
                <stop
                  offset="70%"
                  stopColor="var(--primary)"
                  stopOpacity="0.34"
                />
                <stop
                  offset="100%"
                  stopColor="var(--primary)"
                  stopOpacity="0.62"
                />
              </linearGradient>
            </defs>
            <path
              d="M0 38 C62 29 112 31 158 39 C206 48 238 58 300 61 C354 64 382 55 430 56 C486 58 524 70 586 73 C646 76 684 68 742 69 C804 70 838 82 900 85 C942 87 972 84 1000 85 L1000 106 C940 105 902 111 846 112 C792 113 758 104 704 103 C640 102 600 112 538 111 C476 110 434 100 376 100 C318 100 276 111 216 109 C158 107 120 97 66 100 C38 101 16 105 0 106 Z"
              fill="url(#project-detail-flow-gradient-mobile)"
            />
          </svg>

          <div className="pointer-events-none absolute inset-x-4 top-[62px]">
            {flowRates.map((rate) => (
              <span
                key={rate.x}
                className="bg-background text-muted-foreground absolute -translate-x-1/2 rounded-full border px-1.5 py-0.5 text-[11px] font-medium shadow-sm"
                style={{ left: `${rate.x}%` }}
              >
                {rate.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="relative hidden min-h-[230px] md:grid md:grid-cols-5">
        {flowMetrics.map((metric) => (
          <div
            key={metric.label}
            className="min-h-[230px] border-b p-4 md:border-r md:border-b-0 md:last:border-r-0"
          >
            <p className="text-muted-foreground text-sm">{metric.label}</p>
            <p className="mt-2 text-lg font-semibold tracking-tight">
              {metric.value}
            </p>
          </div>
        ))}

        <svg
          className="pointer-events-none absolute inset-x-0 top-16 bottom-0 h-[150px] w-full"
          viewBox="0 0 1000 150"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient
              id="project-detail-flow-gradient"
              x1="0"
              y1="0"
              x2="1"
              y2="0"
            >
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.06" />
              <stop offset="22%" stopColor="var(--primary)" stopOpacity="0.1" />
              <stop
                offset="45%"
                stopColor="var(--primary)"
                stopOpacity="0.18"
              />
              <stop
                offset="70%"
                stopColor="var(--primary)"
                stopOpacity="0.34"
              />
              <stop
                offset="100%"
                stopColor="var(--primary)"
                stopOpacity="0.62"
              />
            </linearGradient>
          </defs>
          <path
            d="M0 38 C62 29 112 31 158 39 C206 48 238 58 300 61 C354 64 382 55 430 56 C486 58 524 70 586 73 C646 76 684 68 742 69 C804 70 838 82 900 85 C942 87 972 84 1000 85 L1000 106 C940 105 902 111 846 112 C792 113 758 104 704 103 C640 102 600 112 538 111 C476 110 434 100 376 100 C318 100 276 111 216 109 C158 107 120 97 66 100 C38 101 16 105 0 106 Z"
            fill="url(#project-detail-flow-gradient)"
          />
        </svg>

        <div className="pointer-events-none absolute inset-x-0 top-[126px]">
          {flowRates.map((rate) => (
            <span
              key={rate.x}
              className="bg-background text-muted-foreground absolute -translate-x-1/2 rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm"
              style={{ left: `${rate.x}%` }}
            >
              {rate.label} →
            </span>
          ))}
        </div>
      </div>

      <div className="text-muted-foreground flex flex-wrap items-center gap-2 border-t px-4 py-3 text-sm">
        <Lightbulb className="text-primary size-4" />
        <span>
          <span className="text-primary font-medium">Insight:</span> 1 blocker
          is slowing delivery validation.
        </span>
        <span className="text-border hidden sm:inline">•</span>
        <button className="text-primary font-medium">
          Review dependency path
        </button>
      </div>
    </section>
  );
}

function RightRail() {
  return (
    <aside className="border-border bg-card text-card-foreground flex min-h-0 w-full min-w-0 shrink-0 flex-col overflow-hidden xl:w-[340px]">
      <div className="divide-border flex min-h-0 flex-1 flex-col divide-y overflow-y-auto">
        <section className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold">
              <ClipboardList className="size-4" />
              Backlog
            </h2>
            <span className="bg-muted rounded-full px-2 py-0.5 text-xs">5</span>
          </div>
          <div className="mt-4 space-y-3">
            {backlogItems.map((item) => (
              <div key={item} className="flex items-center gap-3 text-sm">
                <span className="text-muted-foreground">⠿</span>
                <span className="min-w-0 flex-1 truncate">{item}</span>
                <ChevronRight className="text-muted-foreground size-4" />
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 h-8 rounded-md px-2.5 text-xs shadow-none"
          >
            View full backlog
            <ChevronRight className="size-3.5" />
          </Button>
        </section>

        <section className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold">
              <Users className="size-4" />
              Contributors
            </h2>
            <span className="bg-muted rounded-full px-2 py-0.5 text-xs">2</span>
          </div>
          <div className="mt-4 space-y-4">
            {contributors.map((person) => (
              <div key={person.name} className="flex items-center gap-3">
                <div className="relative">
                  <Avatar className="size-9">
                    <AvatarImage src={person.avatar} alt={person.name} />
                    <AvatarFallback>{person.name.slice(0, 2)}</AvatarFallback>
                  </Avatar>
                  <span className="border-background bg-primary absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border" />
                </div>
                <div>
                  <p className="text-sm font-medium">{person.name}</p>
                  <p className="text-muted-foreground text-sm">{person.role}</p>
                </div>
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 h-8 rounded-md px-2.5 text-xs shadow-none"
          >
            View contributors
            <ChevronRight className="size-3.5" />
          </Button>
        </section>

        <section className="p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <Clock3 className="size-4" />
            Time
          </h2>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Start date</span>
              <span>02 Jan 2024</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Target date</span>
              <span>02 Feb 2024</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Last updated</span>
              <span>Just now</span>
            </div>
          </div>
        </section>

        <section className="p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <FileText className="size-4" />
            Notes
          </h2>
          <p className="mt-4 text-sm leading-5">
            Waiting on client assets to unblock design validation.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-5 h-8 rounded-md px-2.5 text-xs shadow-none"
          >
            Add note
            <ChevronRight className="size-3.5" />
          </Button>
        </section>
      </div>
    </aside>
  );
}

export function ProjectManagementProjectDetail2() {
  const [activeTab, setActiveTab] = useState<DetailTab>("Dependencies");
  const [isRailOpen, setIsRailOpen] = useState(false);

  return (
    <main className="bg-background flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 w-full max-w-full flex-1 flex-col overflow-x-hidden overflow-y-auto xl:flex-row xl:overflow-hidden">
        <div className="flex max-w-full min-w-0 flex-1 flex-col xl:overflow-hidden">
          <div className="border-border flex min-h-14 items-center justify-between gap-3 border-b px-4 sm:px-6 lg:px-8">
            <div className="text-muted-foreground flex min-w-0 items-center gap-2 text-sm sm:gap-3">
              <span className="shrink-0">Projects</span>
              <ChevronRight className="size-4 shrink-0" />
              <span className="hidden shrink-0 min-[390px]:inline">
                Program
              </span>
              <ChevronRight className="hidden size-4 shrink-0 min-[390px]:inline" />
              <span className="hidden shrink-0 sm:inline">Build track</span>
              <ChevronRight className="hidden size-4 shrink-0 sm:inline" />
              <span className="text-foreground truncate font-medium">
                Internal PM System
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="size-9 rounded-md"
              >
                <Star className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="hidden h-9 gap-2 rounded-md min-[390px]:inline-flex"
              >
                <Share2 className="size-4" />
                Share
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-9 rounded-md"
                onClick={() => setIsRailOpen(true)}
                aria-label="Open project details"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1 xl:overflow-y-auto">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-5 sm:gap-5 sm:px-6 sm:py-6 lg:px-8">
              <section className="space-y-4">
                <h1 className="text-2xl leading-tight font-semibold tracking-tight sm:text-3xl">
                  Internal PM System
                </h1>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-primary/10 text-primary hover:bg-primary/10 border-none">
                    Build track
                  </Badge>
                  <Badge variant="outline" className="gap-1.5 rounded-md">
                    <Users className="size-3.5" />2 contributors
                  </Badge>
                  <Badge variant="outline" className="gap-1.5 rounded-md">
                    <Settings className="size-3.5" />
                    Ops system
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:flex sm:flex-wrap sm:items-center sm:gap-x-8">
                  <span className="flex min-w-0 items-center gap-2">
                    <FileText className="text-muted-foreground size-4 shrink-0" />
                    <span className="truncate">PM-OPS-02</span>
                  </span>
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="border-chart-2 size-3 shrink-0 rounded-full border-2" />
                    <span className="truncate">Medium</span>
                  </span>
                  <span className="text-muted-foreground flex min-w-0 items-center gap-2">
                    <Link2 className="size-4 shrink-0" />
                    <span className="text-foreground truncate">
                      United States
                    </span>
                  </span>
                  <span className="text-muted-foreground flex min-w-0 items-center gap-2">
                    <GitBranch className="size-4 shrink-0" />
                    <span className="text-foreground truncate">
                      Improvement 4 weeks
                    </span>
                  </span>
                  <span className="text-muted-foreground flex min-w-0 items-center gap-2">
                    <Clock3 className="size-4 shrink-0" />
                    <span className="text-foreground truncate">Just now</span>
                  </span>
                </div>
              </section>

              <section className="bg-muted overflow-hidden rounded-[14px] border p-1">
                <div className="grid grid-cols-2 gap-1 md:grid-cols-4">
                  <div className="bg-background flex min-h-24 flex-col justify-between rounded-[10px] border p-3.5 sm:p-4">
                    <div className="text-muted-foreground flex items-center gap-2 text-sm">
                      Timeline health
                      <Info className="size-3.5" />
                    </div>
                    <div className="flex items-end justify-between gap-3">
                      <p className="text-2xl font-semibold tracking-tight">
                        20
                        <span className="text-muted-foreground text-sm">%</span>
                      </p>
                      <span className="bg-muted text-muted-foreground grid size-5 place-items-center rounded-full">
                        <GitBranch className="size-3" />
                      </span>
                    </div>
                  </div>
                  <div className="bg-background flex min-h-24 flex-col justify-between rounded-[10px] border p-3.5 sm:p-4">
                    <p className="text-muted-foreground flex items-center gap-2 text-sm">
                      <CalendarDays className="size-4" />
                      Due date
                    </p>
                    <div className="flex items-end justify-between gap-3">
                      <p className="text-2xl font-semibold tracking-tight">
                        02 Feb
                      </p>
                      <Clock3 className="text-muted-foreground size-4" />
                    </div>
                  </div>
                  <div className="bg-background flex min-h-24 flex-col justify-between rounded-[10px] border p-3.5 sm:p-4">
                    <p className="text-muted-foreground flex items-center gap-2 text-sm">
                      <CheckCircle2 className="size-4" />
                      Tasks closed
                    </p>
                    <div className="flex items-end justify-between gap-3">
                      <p className="text-2xl font-semibold tracking-tight">
                        1
                        <span className="text-muted-foreground text-sm">
                          {" "}
                          / 6
                        </span>
                      </p>
                      <CheckCircle2 className="text-muted-foreground size-4" />
                    </div>
                  </div>
                  <div className="bg-background flex min-h-24 flex-col justify-between rounded-[10px] border p-3.5 sm:p-4">
                    <p className="text-muted-foreground flex items-center gap-2 text-sm">
                      <File className="size-4" />
                      Project files
                    </p>
                    <div className="flex items-end justify-between gap-3">
                      <p className="text-2xl font-semibold tracking-tight">6</p>
                      <FileText className="text-muted-foreground size-4" />
                    </div>
                  </div>
                </div>
                <div className="bg-background text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-1 rounded-[10px] border px-4 py-2.5 text-sm">
                  <span>
                    Delivery confidence:{" "}
                    <span className="text-foreground font-medium">At risk</span>
                  </span>
                  <span>Due in 5 days</span>
                  <span>17% completed</span>
                </div>
              </section>

              <DeliveryFlowPanel />

              <div className="flex items-center gap-6 overflow-x-auto border-b px-1 text-sm sm:gap-8 sm:px-3">
                {tabs.map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    aria-pressed={activeTab === tab}
                    onClick={() => setActiveTab(tab)}
                    className={`shrink-0 border-b-2 py-3 ${
                      activeTab === tab
                        ? "border-foreground font-semibold"
                        : "text-muted-foreground border-transparent"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <TabPanel activeTab={activeTab} />
            </div>
          </div>
        </div>

        <div className="hidden xl:flex">
          <RightRail />
        </div>

        <Sheet open={isRailOpen} onOpenChange={setIsRailOpen}>
          <SheetContent
            side="right"
            className="flex w-[86vw] max-w-sm flex-col gap-0 p-0"
          >
            <SheetHeader className="border-b px-5 py-4 pr-12 text-left">
              <SheetTitle>Project details</SheetTitle>
              <SheetDescription>
                Backlog, contributors, time, and notes
              </SheetDescription>
            </SheetHeader>
            <RightRail />
          </SheetContent>
        </Sheet>
      </div>
    </main>
  );
}
