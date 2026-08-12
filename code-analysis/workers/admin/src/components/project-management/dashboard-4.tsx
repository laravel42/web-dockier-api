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
import { motion } from "framer-motion";
import {
  Bell,
  CalendarDays,
  CalendarPlus,
  ChevronDown,
  ChevronRight,
  Download,
  Filter,
  Flag,
  ListTodo,
  MoreHorizontal,
  Plus,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useTheme } from "next-themes";
import * as React from "react";

import { Logo } from "@/components/logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const spring = {
  type: "spring",
  stiffness: 120,
  damping: 20,
} as const;

const statusStyles = {
  "On Track": {
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
    border: "border-emerald-500/80",
    wash: "bg-emerald-500/5",
  },
  "At Risk": {
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    border: "border-amber-500/80",
    wash: "bg-amber-500/5",
  },
  Blocked: {
    dot: "bg-red-500",
    text: "text-red-600 dark:text-red-400",
    border: "border-red-500/80",
    wash: "bg-red-500/5",
  },
  Dependency: {
    dot: "bg-muted-foreground",
    text: "text-muted-foreground",
    border: "border-border",
    wash: "bg-muted/20",
  },
} as const;

type ProgramStatus = keyof typeof statusStyles;

type Program = {
  id: string;
  name: string;
  type: "Project" | "Dependency";
  status: ProgramStatus;
  owner: string;
  ownerAvatar: string;
  dueDate: string;
  progress: number;
  openIssues: number;
  priority: "High" | "Medium" | "Low";
  milestone: string;
  x: number;
  y: number;
  w: number;
};

type ProgramNodeData = Record<string, unknown> & {
  program: Program;
};

type ProgramNode = Node<ProgramNodeData, "program">;

const programs: Program[] = [
  {
    id: "mobile",
    name: "Mobile App Redesign",
    type: "Project",
    status: "On Track",
    owner: "James Lee",
    ownerAvatar: "/avatars/avatar-3.png",
    dueDate: "May 24, 2026",
    progress: 72,
    openIssues: 8,
    priority: "High",
    milestone: "Design signoff",
    x: 86,
    y: 72,
    w: 230,
  },
  {
    id: "api",
    name: "API Stabilization",
    type: "Dependency",
    status: "Blocked",
    owner: "Ava Reed",
    ownerAvatar: "/avatars/avatar-black-1.png",
    dueDate: "May 20, 2026",
    progress: 44,
    openIssues: 13,
    priority: "High",
    milestone: "Error budget review",
    x: 46,
    y: 250,
    w: 225,
  },
  {
    id: "launch",
    name: "Launch Readiness",
    type: "Project",
    status: "On Track",
    owner: "Olivia Bennett",
    ownerAvatar: "/avatars/avatar-1.png",
    dueDate: "Jun 3, 2026",
    progress: 68,
    openIssues: 6,
    priority: "High",
    milestone: "Beta release",
    x: 410,
    y: 232,
    w: 245,
  },
  {
    id: "design-system",
    name: "Design System Rollout",
    type: "Dependency",
    status: "Dependency",
    owner: "Kiara Laras",
    ownerAvatar: "/avatars/avatar-2.png",
    dueDate: "May 29, 2026",
    progress: 58,
    openIssues: 4,
    priority: "Medium",
    milestone: "Component audit",
    x: 730,
    y: 72,
    w: 220,
  },
  {
    id: "qa",
    name: "QA Regression Pass",
    type: "Dependency",
    status: "At Risk",
    owner: "Michael Chen",
    ownerAvatar: "/avatars/avatar-4.png",
    dueDate: "May 31, 2026",
    progress: 51,
    openIssues: 11,
    priority: "High",
    milestone: "Regression freeze",
    x: 790,
    y: 250,
    w: 230,
  },
  {
    id: "onboarding",
    name: "Customer Onboarding Flow",
    type: "Project",
    status: "At Risk",
    owner: "Sophia Martinez",
    ownerAvatar: "/avatars/avatar-5.png",
    dueDate: "May 27, 2026",
    progress: 39,
    openIssues: 9,
    priority: "Medium",
    milestone: "Usability review",
    x: 120,
    y: 420,
    w: 270,
  },
  {
    id: "billing",
    name: "Billing Migration",
    type: "Dependency",
    status: "Dependency",
    owner: "Ben Lewis",
    ownerAvatar: "/avatars/avatar-black-3.png",
    dueDate: "Jun 7, 2026",
    progress: 63,
    openIssues: 5,
    priority: "Low",
    milestone: "Sandbox cutover",
    x: 665,
    y: 400,
    w: 225,
  },
];

const dependencies = [
  { from: "mobile", to: "launch", tone: "default" },
  { from: "launch", to: "qa", tone: "default" },
  { from: "launch", to: "design-system", tone: "default" },
  { from: "api", to: "onboarding", tone: "blocked" },
  { from: "billing", to: "launch", tone: "default" },
] as const;

const dependencyEdgeColor = "rgb(113 113 122)";
const blockedEdgeColor = "rgb(239 68 68)";

const initialNodes: ProgramNode[] = programs.map((program) => ({
  id: program.id,
  type: "program",
  position: { x: program.x, y: program.y },
  data: { program },
  style: { width: program.w },
}));

const initialEdges: Edge[] = dependencies.map((dependency) => ({
  id: `${dependency.from}-${dependency.to}`,
  source: dependency.from,
  target: dependency.to,
  type: "smoothstep",
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color:
      dependency.tone === "blocked" ? blockedEdgeColor : dependencyEdgeColor,
  },
  style: {
    stroke:
      dependency.tone === "blocked" ? blockedEdgeColor : dependencyEdgeColor,
    strokeDasharray: "6 6",
    strokeWidth: 1.5,
  },
}));

const healthItems: Array<{ label: ProgramStatus; value: number }> = [
  { label: "On Track", value: 2 },
  { label: "At Risk", value: 1 },
  { label: "Blocked", value: 1 },
  { label: "Dependency", value: 3 },
];

const criticalPath = [programs[1], programs[5], programs[2], programs[4]];

const shortcutTasks = [
  { label: "Create issue", icon: ListTodo },
  { label: "Schedule milestone", icon: Flag },
  { label: "Plan sprint", icon: CalendarPlus },
  { label: "Add project", icon: Plus },
] as const;

function Panel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.section
      variants={{
        hidden: { opacity: 0, y: 14 },
        show: { opacity: 1, y: 0, transition: spring },
      }}
      className={cn(
        "bg-card rounded-[8px] border shadow-sm shadow-zinc-200/40 dark:border-white/10 dark:bg-[#161616] dark:shadow-none",
        className,
      )}
    >
      {children}
    </motion.section>
  );
}

function HeaderBar() {
  return (
    <header className="bg-background min-w-0 border-b px-3 py-3 sm:px-4 lg:px-6">
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <span className="text-muted-foreground">Projects</span>
          <span className="text-muted-foreground">/</span>
          <span className="truncate font-medium">Product Launch Portfolio</span>
        </div>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 lg:flex lg:items-center">
          <div className="relative min-w-0 lg:w-[260px]">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              className="h-9 rounded-[6px] pl-9"
              placeholder="Search projects..."
            />
          </div>
          <Button variant="ghost" size="icon" className="size-9 rounded-[6px]">
            <Bell className="size-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}

function ProgramFlowNode({ data, selected }: NodeProps<ProgramNode>) {
  const { program } = data;
  const style = statusStyles[program.status] ?? statusStyles.Dependency;

  return (
    <div
      className={cn(
        "bg-card/95 group relative rounded-[7px] border p-3 shadow-sm backdrop-blur transition-shadow dark:bg-[#161616]/95",
        selected && "ring-primary/30 ring-2",
        style.border,
        style.wash,
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-muted-foreground !size-2 !border-0 !opacity-0 transition-opacity group-hover:!opacity-100"
      />
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-muted-foreground !size-2 !border-0 !opacity-0 transition-opacity group-hover:!opacity-100"
      />
      <p className="truncate text-xs font-medium">{program.name}</p>
      <p className="text-muted-foreground mt-1 text-[11px]">
        {program.type} · {program.progress}%
      </p>
      <div className="mt-3 flex items-center gap-2">
        <span className={cn("size-2 rounded-full", style.dot)} />
        <span className={cn("text-xs", style.text)}>{program.status}</span>
        <span className="text-muted-foreground ml-auto text-[11px]">
          {program.openIssues} issues
        </span>
      </div>
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
  program: ProgramFlowNode,
};

function DependencyGraph() {
  const [nodes, _setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [isMounted, setIsMounted] = React.useState(false);
  const { resolvedTheme } = useTheme();
  const flowColorMode = resolvedTheme === "dark" ? "dark" : "light";
  const backgroundDotColor =
    resolvedTheme === "dark"
      ? "color-mix(in oklab, var(--muted-foreground) 42%, transparent)"
      : "hsl(var(--border))";

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  const onConnect = React.useCallback(
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
    <Panel className="p-3 sm:p-4">
      <div className="bg-background relative h-[360px] overflow-hidden rounded-[8px] border sm:h-[500px] lg:h-[620px]">
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
            fitViewOptions={{ padding: 0.16 }}
            maxZoom={1.6}
            minZoom={0.35}
            nodes={nodes}
            nodeTypes={nodeTypes}
            onConnect={onConnect}
            onEdgesChange={onEdgesChange}
            onNodesChange={onNodesChange}
            panOnDrag
            proOptions={{ hideAttribution: true }}
            className="!bg-background [&_.react-flow__controls-button]:!border-border [&_.react-flow__controls-button]:!bg-card [&_.react-flow__controls-button]:!text-foreground [&_.react-flow__attribution]:hidden [&_.react-flow__panel]:!m-3 sm:[&_.react-flow__panel]:!m-5"
          >
            <Background color={backgroundDotColor} gap={24} size={1} />
            <Controls
              className="overflow-hidden rounded-[6px] border shadow-sm"
              position="top-left"
              showInteractive={false}
            />
          </ReactFlow>
        ) : (
          <div className="grid size-full place-items-center">
            <div className="text-muted-foreground text-xs">
              Loading project canvas...
            </div>
          </div>
        )}

        <div className="absolute right-3 bottom-3 left-3 flex max-h-24 flex-wrap items-center gap-x-4 gap-y-2 overflow-hidden border-t pt-3 text-xs sm:right-6 sm:bottom-6 sm:left-6 sm:max-h-none sm:gap-5 sm:pt-4">
          {healthItems.map((item) => (
            <span key={item.label} className="flex items-center gap-2">
              <span
                className={cn(
                  "size-2 rounded-full",
                  statusStyles[item.label].dot,
                )}
              />
              <span className="text-muted-foreground">{item.label}</span>
            </span>
          ))}
          <span className="text-muted-foreground flex items-center gap-2 sm:ml-auto">
            <span className="inline-block h-px w-7 border-t border-dashed" />
            Dependency
          </span>
        </div>
      </div>
    </Panel>
  );
}

function ProgramHealthCard() {
  return (
    <Panel className="p-4">
      <h2 className="text-base font-semibold">Project Health</h2>
      <div className="mt-5 grid grid-cols-[112px_minmax(0,1fr)] items-center gap-4 sm:grid-cols-[132px_minmax(0,1fr)]">
        <div className="relative size-28 sm:size-32">
          <svg viewBox="0 0 120 120" className="size-full -rotate-90">
            <circle
              cx="60"
              cy="60"
              r="42"
              fill="none"
              stroke="hsl(var(--muted))"
              strokeWidth="18"
            />
            <circle
              cx="60"
              cy="60"
              r="42"
              fill="none"
              stroke="rgb(34 197 94)"
              strokeWidth="18"
              strokeDasharray="75 264"
              strokeDashoffset="0"
            />
            <circle
              cx="60"
              cy="60"
              r="42"
              fill="none"
              stroke="rgb(245 158 11)"
              strokeWidth="18"
              strokeDasharray="38 264"
              strokeDashoffset="-75"
            />
            <circle
              cx="60"
              cy="60"
              r="42"
              fill="none"
              stroke="rgb(239 68 68)"
              strokeWidth="18"
              strokeDasharray="38 264"
              strokeDashoffset="-113"
            />
          </svg>
          <div className="absolute inset-0 grid place-items-center text-center">
            <div>
              <p className="text-2xl font-semibold">7</p>
              <p className="text-muted-foreground text-[11px]">Total</p>
            </div>
          </div>
        </div>
        <div className="space-y-3">
          {healthItems.map((item) => (
            <div key={item.label} className="flex items-center gap-3 text-xs">
              <span
                className={cn(
                  "size-2.5 rounded-full",
                  statusStyles[item.label].dot,
                )}
              />
              <span className="text-muted-foreground min-w-0 flex-1">
                {item.label}
              </span>
              <span className="font-medium">{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function CriticalPathCard() {
  return (
    <Panel className="p-4">
      <h2 className="text-base font-semibold">Critical Path</h2>
      <div className="mt-5 space-y-2">
        {criticalPath.map((program, index) => (
          <div key={program.id}>
            <div className="flex gap-3">
              <span
                className={cn(
                  "mt-1.5 size-2.5 rounded-full",
                  statusStyles[program.status].dot,
                )}
              />
              <div className="min-w-0">
                <p className="truncate text-xs">{program.name}</p>
                <p
                  className={cn(
                    "mt-1 text-xs",
                    statusStyles[program.status].text,
                  )}
                >
                  {program.milestone} · {program.status}
                </p>
              </div>
            </div>
            {index < criticalPath.length - 1 ? (
              <div className="text-muted-foreground ml-1 h-6 border-l" />
            ) : null}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function InsightsCard() {
  return (
    <Panel className="p-4">
      <h2 className="text-base font-semibold">Needs Attention</h2>
      <div className="mt-5 rounded-[7px] border border-red-500/20 bg-red-500/5 p-3">
        <p className="text-sm font-medium text-red-600 dark:text-red-400">
          API Stabilization is blocked
        </p>
        <p className="text-muted-foreground mt-2 text-xs leading-5">
          13 open issues are delaying Customer Onboarding Flow and the next
          launch readiness review.
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="mt-3 h-8 rounded-[6px] px-2 text-xs text-red-600 dark:text-red-400"
        >
          View details
          <ChevronRight className="size-3.5" />
        </Button>
      </div>
    </Panel>
  );
}

function ProgramsTable() {
  return (
    <Panel className="overflow-hidden p-0">
      <div className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <h2 className="text-base font-semibold">Active Projects (7)</h2>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <div className="relative min-w-0 sm:w-[220px]">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              className="h-8 rounded-[6px] pl-9 text-xs"
              placeholder="Search projects..."
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-[6px] px-3 text-xs shadow-none"
          >
            View all
          </Button>
        </div>
      </div>
      <div className="horizontal-scrollbar overflow-x-auto border-t">
        <table className="bg-background w-full min-w-[980px] border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="bg-muted h-11 min-w-[320px] border-r border-b px-4 text-left text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
                Projects
              </th>
              <th className="bg-muted h-11 min-w-36 border-r border-b px-4 text-left text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
                Status
              </th>
              <th className="bg-muted h-11 min-w-32 border-r border-b px-4 text-left text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
                Priority
              </th>
              <th className="bg-muted h-11 min-w-44 border-r border-b px-4 text-left text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
                Owner
              </th>
              <th className="bg-muted h-11 min-w-36 border-b px-4 text-left text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
                Due date
              </th>
            </tr>
          </thead>
          <tbody>
            {programs.map((program) => (
              <tr key={program.id} className="group">
                <td className="bg-background group-hover:bg-muted h-11 min-w-[320px] border-r border-b px-4 align-middle transition-colors">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-3">
                        <span className="shrink-0 text-[11px] font-medium tracking-[0.12em] text-zinc-500 uppercase dark:text-zinc-400">
                          {program.id.slice(0, 3)}
                        </span>
                        <span className="truncate text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
                          {program.name}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground size-7 rounded-md opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </div>
                </td>
                <SpreadsheetCell>
                  <ProjectStatusBadge status={program.status} />
                </SpreadsheetCell>
                <SpreadsheetCell>
                  <div className="inline-flex items-center gap-2">
                    <Flag className="text-muted-foreground size-3.5" />
                    <span>{program.priority}</span>
                  </div>
                </SpreadsheetCell>
                <SpreadsheetCell>
                  <div className="inline-flex items-center gap-2">
                    <Avatar className="size-6">
                      <AvatarImage
                        src={program.ownerAvatar}
                        alt={program.owner}
                      />
                      <AvatarFallback className="text-[10px]">
                        {program.owner.slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate text-[13px]">
                      {program.owner}
                    </span>
                  </div>
                </SpreadsheetCell>
                <SpreadsheetCell className="border-r-0">
                  <div className="inline-flex items-center gap-2">
                    <CalendarDays className="text-muted-foreground size-3.5" />
                    <span>{program.dueDate}</span>
                  </div>
                </SpreadsheetCell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function ProjectStatusBadge({ status }: { status: ProgramStatus }) {
  const style = statusStyles[status];

  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium",
        style.border,
        style.text,
        style.wash,
      )}
    >
      <span className={cn("size-1.5 rounded-full", style.dot)} />
      <span>{status}</span>
    </span>
  );
}

function SpreadsheetCell(props: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "group-hover:bg-muted/60 h-11 border-r border-b px-4 align-middle text-sm text-zinc-700 transition-colors dark:text-zinc-300",
        props.className,
      )}
    >
      {props.children}
    </td>
  );
}

function TaskShortcuts() {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
      {shortcutTasks.map((task) => (
        <Panel key={task.label} className="p-3 sm:p-4">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <span className="bg-muted text-muted-foreground grid size-8 shrink-0 place-items-center rounded-[6px] sm:size-9">
              <task.icon className="size-4" />
            </span>
            <span className="min-w-0 text-[13px] leading-tight font-medium sm:text-sm">
              {task.label}
            </span>
          </div>
        </Panel>
      ))}
    </div>
  );
}

export function ProjectManagementDashboard4({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-background flex min-h-[calc(100dvh-1px)] w-full overflow-hidden",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <HeaderBar />
        <motion.main
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.04 } },
          }}
          initial="hidden"
          animate="show"
          className="dark:bg-background min-w-0 flex-1 overflow-auto bg-zinc-100/50 px-3 pt-3 pb-20 sm:px-4 sm:pt-4 md:px-6 md:pt-5"
        >
          <div className="mx-auto max-w-[1700px] space-y-3 sm:space-y-4">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-muted-foreground flex items-center gap-2 text-xs">
                  <Logo className="size-4" width={16} height={16} />
                  <span>Shadcnblocks</span>
                  <span>/</span>
                  <span>Project Delivery</span>
                </div>
                <h1 className="mt-2 text-2xl leading-tight font-semibold tracking-tight">
                  Project Dependency Map
                </h1>
                <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
                  Track delivery risk, owners, blockers, and dependent
                  milestones across active projects.
                </p>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-[6px] px-3 text-xs shadow-none"
                >
                  <Filter className="size-4" />
                  Filter
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-[6px] px-3 text-xs shadow-none"
                >
                  <SlidersHorizontal className="size-4" />
                  View options
                  <ChevronDown className="size-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-[6px] px-3 text-xs shadow-none"
                >
                  <Download className="size-4" />
                  Export
                </Button>
              </div>
            </div>

            <TaskShortcuts />

            <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="min-w-0 space-y-4">
                <DependencyGraph />
                <ProgramsTable />
              </div>
              <div className="min-w-0 space-y-4">
                <ProgramHealthCard />
                <CriticalPathCard />
                <InsightsCard />
              </div>
            </div>
          </div>
        </motion.main>
      </div>
    </div>
  );
}
