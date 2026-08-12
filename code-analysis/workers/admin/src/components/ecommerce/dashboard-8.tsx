/* eslint-disable @typescript-eslint/no-unused-vars, @next/next/no-img-element */
"use client";

import { useMotionValueEvent, useSpring } from "framer-motion";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Box,
  ChevronRight,
  ChevronsUpDown,
  ClipboardList,
  Globe,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Package,
  RotateCcw,
  Search,
  Settings,
  Truck,
  User,
  Users,
  Wallet,
} from "lucide-react";
import { JetBrains_Mono } from "next/font/google";
import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  Tooltip,
  TooltipContentProps,
  XAxis,
  YAxis,
} from "recharts";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  BlockTooltip,
  BlockTooltipContent,
  BlockTooltipProvider,
  BlockTooltipTrigger,
} from "@/components/ui/block-tooltip";
import { Button } from "@/components/ui/button";
import { type ChartConfig, ChartContainer } from "@/components/ui/chart";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// ============================================================================
// Color Palette
// ============================================================================

const mixBase = "var(--background)";

const palette = {
  primary: "var(--primary)",
  secondary: {
    light: `color-mix(in oklch, var(--primary) 75%, ${mixBase})`,
    dark: `color-mix(in oklch, var(--primary) 85%, ${mixBase})`,
  },
  tertiary: {
    light: `color-mix(in oklch, var(--primary) 55%, ${mixBase})`,
    dark: `color-mix(in oklch, var(--primary) 65%, ${mixBase})`,
  },
  quaternary: {
    light: `color-mix(in oklch, var(--primary) 40%, ${mixBase})`,
    dark: `color-mix(in oklch, var(--primary) 45%, ${mixBase})`,
  },
  quinary: {
    light: `color-mix(in oklch, var(--primary) 25%, ${mixBase})`,
    dark: `color-mix(in oklch, var(--primary) 30%, ${mixBase})`,
  },
};

const chartScaffold = {
  line: "var(--muted-foreground)",
  tagFill: "var(--muted)",
  tagText: "var(--foreground)",
};

const getActiveChartIndex = (rawIndex: unknown): number | undefined => {
  if (typeof rawIndex === "number" && Number.isInteger(rawIndex)) {
    return rawIndex;
  }

  if (typeof rawIndex === "string") {
    if (rawIndex.trim() === "") {
      return undefined;
    }
    const parsedIndex = Number(rawIndex);
    if (Number.isInteger(parsedIndex)) {
      return parsedIndex;
    }
  }

  return undefined;
};

const getRetentionColor = (percent: number): string => {
  const mix = Math.max(5, Math.round(percent * 0.85));
  return `color-mix(in oklch, var(--primary) ${mix}%, ${mixBase})`;
};

// ============================================================================
// Types
// ============================================================================

type NavItem = {
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  href: string;
  isActive?: boolean;
  children?: NavItem[];
};

type NavGroup = {
  title: string;
  items: NavItem[];
  defaultOpen?: boolean;
};

type UserData = {
  name: string;
  email: string;
  avatar: string;
};

type SidebarData = {
  logo: {
    src: string;
    alt: string;
    title: string;
    description: string;
  };
  navGroups: NavGroup[];
  user?: UserData;
};

type KPIStat = {
  title: string;
  value: number;
  change: number;
  format: "currency" | "percent" | "number";
};

type Segment = {
  name: string;
  value: number;
  color: string;
  change: number;
};

type Channel = {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  name: string;
  count: number;
  change: number;
};

type CohortRow = {
  label: string;
  retentionByMonth: number[];
};

// ============================================================================
// Formatters
// ============================================================================

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const compactCurrencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const numberFormatter = new Intl.NumberFormat("en-US");

const compactNumberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2,
});

// ============================================================================
// Hooks
// ============================================================================

function useHoverHighlight<T extends string | number>() {
  const [active, setActive] = React.useState<T | null>(null);

  const handleHover = React.useCallback((value: T | null) => {
    setActive(value);
  }, []);

  return { active, handleHover };
}

// ============================================================================
// Mock Data
// ============================================================================

const sidebarData: SidebarData = {
  logo: {
    src: "/images/block/logos/shadcnblocks-logo.svg",
    alt: "Acme Store",
    title: "Acme Store",
    description: "Dashboard",
  },
  navGroups: [
    {
      title: "Main",
      defaultOpen: true,
      items: [
        {
          label: "Dashboard",
          icon: LayoutDashboard,
          href: "#",
          isActive: true,
        },
        { label: "Orders", icon: ClipboardList, href: "#" },
        { label: "Returns", icon: RotateCcw, href: "#" },
      ],
    },
    {
      title: "Catalog",
      defaultOpen: true,
      items: [
        {
          label: "Products",
          icon: Box,
          href: "#",
          children: [
            { label: "All Products", icon: Package, href: "#" },
            { label: "Categories", icon: Package, href: "#" },
            { label: "Inventory", icon: Package, href: "#" },
          ],
        },
        { label: "Shipping", icon: Truck, href: "#" },
      ],
    },
    {
      title: "Customers",
      defaultOpen: false,
      items: [
        { label: "All Customers", icon: Users, href: "#" },
        { label: "Messages", icon: MessageSquare, href: "#" },
      ],
    },
    {
      title: "Analytics",
      defaultOpen: false,
      items: [
        { label: "Overview", icon: Globe, href: "#" },
        { label: "Reports", icon: BarChart3, href: "#" },
        { label: "Finances", icon: Wallet, href: "#" },
      ],
    },
    {
      title: "Settings",
      defaultOpen: false,
      items: [{ label: "Settings", icon: Settings, href: "#" }],
    },
  ],
  user: {
    name: "John Doe",
    email: "john@acmestore.com",
    avatar: "https://github.com/shadcn.png",
  },
};

const kpiStats: KPIStat[] = [
  { title: "Total Revenue", value: 485000, change: -12.5, format: "currency" },
  { title: "Conversion Rate", value: 18.5, change: -12.5, format: "percent" },
  { title: "Total Orders", value: 92, change: 25, format: "number" },
  { title: "Active Customers", value: 38, change: 25, format: "number" },
  { title: "New Customers", value: 12, change: 25, format: "number" },
];

const monthlyRevenueData = [
  { month: "JAN", revenue: 72000 },
  { month: "FEB", revenue: 128000 },
  { month: "MAR", revenue: 103000 },
  { month: "APR", revenue: 176000 },
  { month: "MAY", revenue: 230000 },
  { month: "JUN", revenue: 142000 },
  { month: "JUL", revenue: 310000 },
  { month: "AUG", revenue: 640000 },
  { month: "SEP", revenue: 410000 },
  { month: "OCT", revenue: 210000 },
  { month: "NOV", revenue: 98000 },
  { month: "DEC", revenue: 260000 },
];

const segments: Segment[] = [
  { name: "Enterprise", value: 1074, color: palette.primary, change: 3.2 },
  { name: "SMB", value: 836, color: palette.secondary.light, change: -1.5 },
  {
    name: "Individual",
    value: 478,
    color: palette.tertiary.light,
    change: 5.8,
  },
];

const customerTrendData = [
  { day: "Mon", customers: 1850 },
  { day: "Tue", customers: 2150 },
  { day: "Wed", customers: 1720 },
  { day: "Thu", customers: 2480 },
  { day: "Fri", customers: 1890 },
  { day: "Sat", customers: 2320 },
  { day: "Sun", customers: 2388 },
];

const channelsData: Channel[] = [
  { icon: Users, name: "Facebook", count: 2341, change: 25 },
  { icon: MessageSquare, name: "Twitter", count: 1231, change: -25 },
  { icon: Globe, name: "Google", count: 1123, change: -25 },
  { icon: Box, name: "Instagram", count: 125, change: 25 },
];

const cohortRetentionData: CohortRow[] = [
  { label: "Jun", retentionByMonth: [100, 65, 51, 43, 37, 32, 28] },
  { label: "Jul", retentionByMonth: [100, 71, 59, 50, 43, 37] },
  { label: "Aug", retentionByMonth: [100, 73, 60, 51, 44] },
  { label: "Sep", retentionByMonth: [100, 69, 55, 46] },
  { label: "Oct", retentionByMonth: [100, 75, 62] },
  { label: "Nov", retentionByMonth: [100, 67] },
  { label: "Dec", retentionByMonth: [100] },
];

const storeVisitsData = [
  { date: "Jan", visits: 245 },
  { date: "Feb", visits: 654 },
  { date: "Mar", visits: 387 },
  { date: "Apr", visits: 521 },
  { date: "May", visits: 412 },
  { date: "Jun", visits: 598 },
  { date: "Jul", visits: 312 },
  { date: "Aug", visits: 743 },
  { date: "Sep", visits: 489 },
  { date: "Oct", visits: 476 },
  { date: "Nov", visits: 687 },
  { date: "Dec", visits: 198 },
];

// ============================================================================
// Chart Configs
// ============================================================================

const revenueChartConfig = {
  revenue: {
    label: "Revenue",
    color: palette.secondary.light,
  },
} satisfies ChartConfig;

const visitsChartConfig = {
  visits: {
    label: "Visits",
    color: palette.secondary.light,
  },
} satisfies ChartConfig;

const customerChartConfig = {
  customers: {
    label: "Customers",
    color: palette.secondary.light,
  },
} satisfies ChartConfig;

// ============================================================================
// Sidebar Components
// ============================================================================

const SidebarLogo = ({ logo }: { logo: SidebarData["logo"] }) => {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" tooltip={logo.title}>
          <div className="bg-primary flex aspect-square size-8 items-center justify-center">
            <img
              src={logo.src}
              alt={logo.alt}
              width={24}
              height={24}
              className="text-primary-foreground size-6 invert dark:invert-0"
            />
          </div>
          <div className="flex flex-col gap-0.5 leading-none">
            <span className="font-medium">{logo.title}</span>
            <span className="text-muted-foreground text-xs">
              {logo.description}
            </span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
};

const NavMenuItem = ({ item }: { item: NavItem }) => {
  const Icon = item.icon;
  const hasChildren = item.children && item.children.length > 0;

  if (!hasChildren) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          isActive={item.isActive}
          tooltip={item.label}
        >
          <a href={item.href}>
            <Icon className="size-4" aria-hidden="true" />
            <span>{item.label}</span>
          </a>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <Collapsible asChild defaultOpen className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton isActive={item.isActive} tooltip={item.label}>
            <Icon className="size-4" aria-hidden="true" />
            <span>{item.label}</span>
            <ChevronRight
              className="ml-auto size-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
              aria-hidden="true"
            />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {item.children!.map((child) => (
              <SidebarMenuSubItem key={child.label}>
                <SidebarMenuSubButton
                  asChild
                  isActive={child.isActive}
                  className={
                    child.isActive
                      ? "before:bg-primary relative overflow-visible before:absolute before:top-0 before:-left-2.5 before:z-10 before:h-full before:w-px before:content-['']"
                      : ""
                  }
                >
                  <a href={child.href}>{child.label}</a>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
};

const NavUser = ({ user }: { user: UserData }) => {
  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("");

  const userAvatar = (
    <Avatar className="size-8 rounded-none">
      <AvatarImage src={user.avatar} alt={user.name} />
      <AvatarFallback className="rounded-none">{initials}</AvatarFallback>
    </Avatar>
  );

  const userInfo = (
    <div className="grid flex-1 text-left text-sm leading-tight">
      <span className="truncate font-medium">{user.name}</span>
      <span className="text-muted-foreground truncate text-xs">
        {user.email}
      </span>
    </div>
  );

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              {userAvatar}
              {userInfo}
              <ChevronsUpDown className="ml-auto size-4" aria-hidden="true" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-none"
            side="bottom"
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                {userAvatar}
                {userInfo}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <User className="mr-2 size-4" aria-hidden="true" />
              Account
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <LogOut className="mr-2 size-4" aria-hidden="true" />
              Log Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
};

const AppSidebar = ({ ...props }: React.ComponentProps<typeof Sidebar>) => {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <div className="flex items-center gap-2 group-data-[collapsible=icon]:flex-col">
          <SidebarLogo logo={sidebarData.logo} />
          <SidebarTrigger className="ml-auto group-data-[collapsible=icon]:ml-0" />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <ScrollArea className="h-full">
          {sidebarData.navGroups.map((group) => (
            <SidebarGroup key={group.title}>
              <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <NavMenuItem key={item.label} item={item} />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </ScrollArea>
      </SidebarContent>
      <SidebarFooter>
        {sidebarData.user && <NavUser user={sidebarData.user} />}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
};

// ============================================================================
// Dashboard Content Components
// ============================================================================

// Growth section component (vertical layout for SalesRevenueCard header)
const GrowthSection = ({
  label,
  change,
}: {
  label: string;
  change: number;
}) => {
  const isPositive = change >= 0;
  return (
    <div className="bg-muted/30 flex items-center gap-1.5 border px-2 py-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span
        className={cn(
          jetBrainsMono.className,
          "flex items-center gap-0.5 text-xs font-medium",
          isPositive ? "text-emerald-600" : "text-red-600",
        )}
      >
        {isPositive ? (
          <ArrowUpRight className="size-3" aria-hidden="true" />
        ) : (
          <ArrowDownRight className="size-3" aria-hidden="true" />
        )}
        {isPositive ? "+" : ""}
        {change}%
      </span>
    </div>
  );
};

// KPI Stat Card
const KPIStatCard = ({ stat }: { stat: KPIStat }) => {
  const isPositive = stat.change >= 0;

  const formatValue = (value: number, format: KPIStat["format"]) => {
    switch (format) {
      case "currency":
        return currencyFormatter.format(value);
      case "percent":
        return `${value}%`;
      case "number":
        return numberFormatter.format(value);
    }
  };

  return (
    <div className="bg-card flex flex-col gap-1 border p-4">
      <span className="text-muted-foreground text-xs">{stat.title}</span>
      <div className="flex items-baseline gap-2">
        <span className={cn(jetBrainsMono.className, "text-2xl font-semibold")}>
          {formatValue(stat.value, stat.format)}
        </span>
      </div>
      <div className="flex items-center gap-1 text-xs">
        {isPositive ? (
          <ArrowUpRight
            className="size-3.5 text-emerald-600"
            aria-hidden="true"
          />
        ) : (
          <ArrowDownRight
            className="size-3.5 text-red-600"
            aria-hidden="true"
          />
        )}
        <span
          className={cn(
            jetBrainsMono.className,
            isPositive ? "text-emerald-600" : "text-red-600",
          )}
        >
          {isPositive ? "+" : ""}
          {stat.change}%
        </span>
        <span className="text-muted-foreground">vs Last Month</span>
      </div>
    </div>
  );
};

// KPI Stats Row
const KPIStatsRow = () => {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {kpiStats.map((stat) => (
        <KPIStatCard key={stat.title} stat={stat} />
      ))}
    </div>
  );
};

// ============================================================================
// Animated Reference Line Components
// ============================================================================

interface CustomReferenceLabelProps {
  viewBox?: { x?: number; y?: number };
  value: number;
}

const CustomReferenceLabel: React.FC<CustomReferenceLabelProps> = (props) => {
  const { viewBox, value } = props;
  const y = viewBox?.y ?? 0;

  const width = React.useMemo(() => {
    const characterWidth = 8;
    const padding = 10;
    return value.toString().length * characterWidth + padding;
  }, [value]);

  return (
    <>
      <rect
        x={0}
        y={y - 9}
        width={width}
        height={18}
        fill={chartScaffold.tagFill}
        rx={0}
      />
      <text
        fontWeight={600}
        fontFamily={jetBrainsMono.style.fontFamily}
        x={6}
        y={y + 4}
        fill={chartScaffold.tagText}
      >
        {value}
      </text>
    </>
  );
};

// Revenue Bar Chart Tooltip
function RevenueBarTooltip({
  active,
  payload,
  label,
}: Partial<TooltipContentProps<number, string>>) {
  if (!active || !payload?.length) return null;

  const value = payload[0]?.value || 0;

  return (
    <div className="border-border bg-popover border p-2 shadow-lg sm:p-3">
      <p className="text-foreground mb-1.5 text-xs font-medium sm:mb-2 sm:text-sm">
        {label}
      </p>
      <div className="flex items-center gap-1.5 sm:gap-2">
        <div className="bg-primary size-2 rounded-full sm:size-2.5" />
        <span className="text-muted-foreground text-[10px] sm:text-sm">
          Revenue:
        </span>
        <span
          className={cn(
            jetBrainsMono.className,
            "text-foreground text-[10px] font-medium sm:text-sm",
          )}
        >
          {currencyFormatter.format(Number(value))}
        </span>
      </div>
    </div>
  );
}

function CustomersAreaTooltip({
  active,
  payload,
  label,
}: Partial<TooltipContentProps<number, string>>) {
  if (!active || !payload?.length) return null;

  const value = Number(payload[0]?.value ?? 0);
  const pointIndex = customerTrendData.findIndex(
    (entry) => entry.day === label,
  );
  const previousValue =
    pointIndex > 0 ? customerTrendData[pointIndex - 1].customers : value;
  const delta =
    previousValue === 0 ? 0 : ((value - previousValue) / previousValue) * 100;
  const isPositive = delta >= 0;

  return (
    <div className="border-border bg-popover border p-2 shadow-lg sm:p-3">
      <p className="text-foreground mb-1.5 text-xs font-medium sm:mb-2 sm:text-sm">
        {label}
      </p>
      <div className="flex items-center gap-1.5 sm:gap-2">
        <div
          className="size-2 rounded-full sm:size-2.5"
          style={{ backgroundColor: "var(--color-customers)" }}
        />
        <span className="text-muted-foreground text-[10px] sm:text-sm">
          Customers:
        </span>
        <span
          className={cn(
            jetBrainsMono.className,
            "text-foreground text-[10px] font-medium sm:text-sm",
          )}
        >
          {numberFormatter.format(value)}
        </span>
      </div>
      <p
        className={cn(
          jetBrainsMono.className,
          "mt-1.5 text-[10px] sm:text-xs",
          isPositive ? "text-emerald-600" : "text-red-600",
        )}
      >
        {isPositive ? "+" : "-"}
        {Math.abs(delta).toFixed(1)}%
      </p>
    </div>
  );
}

// Sales Revenue Card with Animated Value Line Bar Chart
const SalesRevenueCard = () => {
  const changePercent = 8.2;

  // Track which bar is being hovered
  const [activeIndex, setActiveIndex] = React.useState<number | undefined>(
    undefined,
  );

  // Calculate the currently tracked value (hovered bar or max bar)
  const maxValueData = React.useMemo(() => {
    if (activeIndex !== undefined) {
      return {
        index: activeIndex,
        value: monthlyRevenueData[activeIndex].revenue,
      };
    }
    return monthlyRevenueData.reduce(
      (max, data, index) =>
        data.revenue > max.value ? { index, value: data.revenue } : max,
      { index: 0, value: 0 },
    );
  }, [activeIndex]);

  const isPositive = changePercent >= 0;

  // Spring animation for the reference line value
  const valueSpring = useSpring(maxValueData.value, {
    stiffness: 100,
    damping: 20,
  });
  const [springyValue, setSpringyValue] = React.useState(maxValueData.value);

  useMotionValueEvent(valueSpring, "change", (latest) => {
    setSpringyValue(Number(latest.toFixed(0)));
  });

  React.useEffect(() => {
    valueSpring.set(maxValueData.value);
  }, [maxValueData.value, valueSpring]);

  return (
    <div className="bg-card flex min-w-0 flex-1 flex-col gap-4 border p-4 sm:gap-5 sm:p-5 lg:col-span-2">
      <div className="flex items-start justify-between gap-4">
        {/* Left: Title + Value + Change */}
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Sales Revenue</span>
          <span
            className={cn(
              jetBrainsMono.className,
              "text-2xl font-semibold tabular-nums sm:text-3xl",
            )}
          >
            {currencyFormatter.format(maxValueData.value)}
          </span>
          <div className="flex items-center gap-1">
            <span
              className={cn(
                jetBrainsMono.className,
                "text-sm font-medium",
                isPositive ? "text-emerald-600" : "text-red-600",
              )}
            >
              {isPositive ? "+" : ""}
              {changePercent}%
            </span>
            {isPositive ? (
              <ArrowUpRight
                className="size-3.5 text-emerald-600"
                aria-hidden="true"
              />
            ) : (
              <ArrowDownRight
                className="size-3.5 text-red-600"
                aria-hidden="true"
              />
            )}
            <span className="text-muted-foreground text-sm">vs Last month</span>
          </div>
        </div>

        {/* Right: Growth sections */}
        <div className="flex flex-wrap gap-2">
          <GrowthSection label="4w" change={11.6} />
          <GrowthSection label="13w" change={7.9} />
          <GrowthSection label="12m" change={-3.4} />
        </div>
      </div>

      <div className="h-[180px] w-full min-w-0 sm:h-[220px]">
        <ChartContainer
          config={revenueChartConfig}
          className="aspect-auto h-full w-full"
        >
          <BarChart
            data={monthlyRevenueData}
            onMouseMove={(state) => {
              setActiveIndex(
                getActiveChartIndex(
                  state.activeTooltipIndex ?? state.activeIndex,
                ),
              );
            }}
            onMouseLeave={() => setActiveIndex(undefined)}
          >
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10 }}
              dy={8}
            />
            <YAxis hide />
            <Tooltip
              content={<RevenueBarTooltip />}
              cursor={{ fillOpacity: 0.05 }}
            />
            <Bar dataKey="revenue" radius={0}>
              {monthlyRevenueData.map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  className="duration-200"
                  opacity={index === maxValueData.index ? 1 : 0.2}
                  fill={
                    index === maxValueData.index
                      ? palette.secondary.light
                      : palette.tertiary.light
                  }
                />
              ))}
            </Bar>
            <ReferenceLine
              opacity={0.35}
              y={springyValue}
              stroke={chartScaffold.line}
              strokeWidth={1}
              strokeDasharray="3 3"
              label={<CustomReferenceLabel value={maxValueData.value} />}
            />
          </BarChart>
        </ChartContainer>
      </div>
    </div>
  );
};

// Segmentation Card (Conversion Rate Style)
const SegmentationCard = () => {
  const [activeCustomerIndex, setActiveCustomerIndex] = React.useState<
    number | undefined
  >(undefined);

  const trackedCustomerPoint = React.useMemo(() => {
    if (
      activeCustomerIndex !== undefined &&
      activeCustomerIndex >= 0 &&
      activeCustomerIndex < customerTrendData.length
    ) {
      return {
        index: activeCustomerIndex,
        ...customerTrendData[activeCustomerIndex],
      };
    }

    const fallbackIndex = customerTrendData.length - 1;
    return { index: fallbackIndex, ...customerTrendData[fallbackIndex] };
  }, [activeCustomerIndex]);

  const previousCustomerPoint = React.useMemo(() => {
    const previousIndex = Math.max(0, trackedCustomerPoint.index - 1);
    return customerTrendData[previousIndex];
  }, [trackedCustomerPoint.index]);

  const totalCustomers = trackedCustomerPoint.customers;
  const totalChange =
    previousCustomerPoint.customers === 0
      ? 0
      : ((totalCustomers - previousCustomerPoint.customers) /
          previousCustomerPoint.customers) *
        100;
  const formattedChange = Math.abs(totalChange).toFixed(1);
  const comparisonLabel =
    trackedCustomerPoint.index === 0
      ? "vs start of week"
      : `vs ${previousCustomerPoint.day}`;
  const isPositive = totalChange >= 0;

  return (
    <div className="bg-card flex min-w-0 flex-col gap-4 border p-4 sm:gap-5 sm:p-5">
      {/* Header - matches Sales Revenue layout */}
      <div className="flex items-start justify-between gap-4">
        {/* Left: Label + Value + Change */}
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Total Customers</span>
          <span
            className={cn(
              jetBrainsMono.className,
              "text-2xl font-semibold tabular-nums sm:text-3xl",
            )}
          >
            {numberFormatter.format(totalCustomers)}
          </span>
          <span
            className={cn(
              jetBrainsMono.className,
              "text-muted-foreground text-[11px] tracking-wide uppercase",
            )}
          >
            {trackedCustomerPoint.day}
          </span>
          <div className="flex items-center gap-1">
            <span
              className={cn(
                jetBrainsMono.className,
                "text-sm font-medium",
                isPositive ? "text-emerald-600" : "text-red-600",
              )}
            >
              {isPositive ? "+" : "-"}
              {formattedChange}%
            </span>
            {isPositive ? (
              <ArrowUpRight
                className="size-3.5 text-emerald-600"
                aria-hidden="true"
              />
            ) : (
              <ArrowDownRight
                className="size-3.5 text-red-600"
                aria-hidden="true"
              />
            )}
            <span className="text-muted-foreground text-sm">
              {comparisonLabel}
            </span>
          </div>
        </div>

        {/* Right: Details button */}
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs">
          Details
        </Button>
      </div>

      {/* Segment metrics rows */}
      <div className="flex flex-col gap-3">
        {segments.map((segment) => {
          const isPositive = segment.change >= 0;
          return (
            <div
              key={segment.name}
              className="flex items-center justify-between"
            >
              <span className="text-muted-foreground text-sm">
                {segment.name}
              </span>
              <div className="flex items-center gap-4">
                <span
                  className={cn(
                    jetBrainsMono.className,
                    "text-sm font-medium tabular-nums",
                  )}
                >
                  {numberFormatter.format(segment.value)}
                </span>
                <div
                  className={cn(
                    jetBrainsMono.className,
                    "flex items-center gap-0.5 text-xs",
                    isPositive ? "text-emerald-600" : "text-red-600",
                  )}
                >
                  {isPositive ? (
                    <ArrowUpRight className="size-3" aria-hidden="true" />
                  ) : (
                    <ArrowDownRight className="size-3" aria-hidden="true" />
                  )}
                  {isPositive ? "+" : ""}
                  {segment.change}%
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Area chart */}
      <div className="h-[120px] w-full">
        <ChartContainer config={customerChartConfig} className="h-full w-full">
          <AreaChart
            data={customerTrendData}
            onMouseMove={(state) => {
              setActiveCustomerIndex(
                getActiveChartIndex(
                  state.activeTooltipIndex ?? state.activeIndex,
                ),
              );
            }}
            onMouseLeave={() => setActiveCustomerIndex(undefined)}
          >
            <defs>
              <linearGradient id="customerGradient" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--color-customers)"
                  stopOpacity={0.3}
                />
                <stop
                  offset="100%"
                  stopColor="var(--color-customers)"
                  stopOpacity={0.05}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={true}
              horizontal={true}
              stroke="hsl(var(--muted-foreground) / 0.3)"
            />
            <XAxis
              dataKey="day"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10 }}
              dy={5}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 9 }}
              width={30}
              tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`}
            />
            <Tooltip
              content={<CustomersAreaTooltip />}
              cursor={{
                stroke: "var(--color-customers)",
                strokeDasharray: "3 3",
                strokeOpacity: 0.35,
              }}
            />
            <ReferenceLine
              x={trackedCustomerPoint.day}
              stroke="var(--color-customers)"
              strokeDasharray="3 3"
              strokeOpacity={0.2}
            />
            <Area
              type="linear"
              dataKey="customers"
              stroke="var(--color-customers)"
              strokeWidth={1}
              fill="url(#customerGradient)"
              activeDot={{
                r: 3.5,
                fill: "var(--color-customers)",
                strokeWidth: 0,
              }}
            />
          </AreaChart>
        </ChartContainer>
      </div>
    </div>
  );
};

// User Retention Cohort Heatmap Card
const UserRetentionCard = () => {
  const maxMonths = 7;

  return (
    <div className="bg-card flex min-w-0 flex-col gap-4 border p-4 sm:gap-5 sm:p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">User Retention</span>
          <span
            className={cn(
              jetBrainsMono.className,
              "text-2xl font-semibold sm:text-3xl",
            )}
          >
            24%
          </span>
          <div className="flex items-center gap-1">
            <span
              className={cn(
                jetBrainsMono.className,
                "text-sm font-medium text-emerald-600",
              )}
            >
              +2.0%
            </span>
            <ArrowUpRight
              className="size-3.5 text-emerald-600"
              aria-hidden="true"
            />
          </div>
        </div>
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs">
          Details
        </Button>
      </div>

      {/* Heatmap */}
      <div className="flex flex-col gap-px">
        {cohortRetentionData.map((cohort) => (
          <div
            key={cohort.label}
            className="grid gap-px"
            style={{
              gridTemplateColumns: `repeat(${maxMonths}, minmax(0, 1fr))`,
            }}
          >
            {cohort.retentionByMonth.map((value, monthIndex) => (
              <BlockTooltipProvider key={monthIndex}>
                <BlockTooltip>
                  <BlockTooltipTrigger asChild>
                    <div
                      className="hover:ring-foreground/20 h-5 cursor-default transition-shadow hover:ring-1"
                      style={{
                        backgroundColor: getRetentionColor(value),
                      }}
                    />
                  </BlockTooltipTrigger>
                  <BlockTooltipContent>
                    <span className={cn(jetBrainsMono.className, "text-xs")}>
                      {cohort.label} — Month {monthIndex + 1}: {value}%
                    </span>
                  </BlockTooltipContent>
                </BlockTooltip>
              </BlockTooltipProvider>
            ))}
          </div>
        ))}
      </div>

      {/* X-axis labels */}
      <div
        className="grid gap-px"
        style={{
          gridTemplateColumns: `repeat(${maxMonths}, minmax(0, 1fr))`,
        }}
      >
        {Array.from({ length: maxMonths }, (_, i) => (
          <span
            key={i}
            className={cn(
              jetBrainsMono.className,
              "text-muted-foreground text-center text-[10px]",
            )}
          >
            {i + 1}
          </span>
        ))}
      </div>
    </div>
  );
};

const StoreVisitsTargetLineChart = () => {
  const chartWrapperRef = React.useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = React.useState(0);
  const [axis, setAxis] = React.useState(0);

  const lastVisitValue =
    storeVisitsData[storeVisitsData.length - 1]?.visits ?? 0;

  const axisSpring = useSpring(0, {
    stiffness: 100,
    damping: 30,
  });
  const valueSpring = useSpring(lastVisitValue, {
    stiffness: 100,
    damping: 30,
  });
  const [springyValue, setSpringyValue] = React.useState(lastVisitValue);

  useMotionValueEvent(axisSpring, "change", (latest) => {
    setAxis(Number(latest));
  });

  useMotionValueEvent(valueSpring, "change", (latest) => {
    setSpringyValue(Number(Number(latest).toFixed(0)));
  });

  React.useEffect(() => {
    const el = chartWrapperRef.current;
    if (!el) return;

    const updateWidth = () => {
      const nextWidth = Math.max(
        0,
        Math.floor(el.getBoundingClientRect().width),
      );
      setChartWidth(nextWidth);
      setAxis((prev) => (prev === 0 ? nextWidth : prev));
    };

    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(el);

    return () => {
      ro.disconnect();
    };
  }, []);

  React.useEffect(() => {
    valueSpring.set(lastVisitValue);
  }, [lastVisitValue, valueSpring]);

  const safeAxis =
    chartWidth > 0 ? Math.min(Math.max(axis, 0), chartWidth) : axis;
  const rightInset = chartWidth > 0 ? Math.max(0, chartWidth - safeAxis) : 0;
  const clipPath =
    chartWidth > 0 ? `inset(0px ${rightInset}px 0px 0px)` : undefined;

  const tagWidth = 56;
  const tagHeight = 18;
  const tagHalfWidth = tagWidth / 2;
  const tagX =
    chartWidth > 0
      ? Math.min(Math.max(safeAxis - tagWidth, 0), chartWidth - tagWidth)
      : 0;
  const textX =
    chartWidth > 0
      ? Math.min(
          Math.max(safeAxis - tagHalfWidth, tagHalfWidth),
          chartWidth - tagHalfWidth,
        )
      : 0;

  return (
    <div ref={chartWrapperRef} className="h-full w-full min-w-0">
      <ChartContainer config={visitsChartConfig} className="h-full w-full">
        <AreaChart
          className="overflow-visible"
          data={storeVisitsData}
          margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
          onMouseMove={(state) => {
            const x = state.activeCoordinate?.x;
            const activeIndex = getActiveChartIndex(
              state.activeTooltipIndex ?? state.activeIndex,
            );
            const dataValue =
              typeof activeIndex === "number" && Number.isInteger(activeIndex)
                ? storeVisitsData[activeIndex]?.visits
                : undefined;

            if (typeof x === "number" && dataValue !== undefined) {
              axisSpring.set(x);
              valueSpring.set(Number(dataValue));
            }
          }}
          onMouseLeave={() => {
            if (chartWidth > 0) axisSpring.set(chartWidth);
            valueSpring.set(lastVisitValue);
          }}
        >
          <defs>
            <linearGradient id="visitsGradient" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="var(--color-visits)"
                stopOpacity={0.3}
              />
              <stop
                offset="100%"
                stopColor="var(--color-visits)"
                stopOpacity={0.05}
              />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10 }}
            dy={8}
            interval={0}
            padding={{ left: 12, right: 12 }}
          />
          {/* Recharts 3 only updates active hover state for this chart when a Tooltip is mounted. */}
          <Tooltip
            cursor={false}
            content={() => null}
            wrapperStyle={{ display: "none" }}
          />

          <Area
            type="monotone"
            dataKey="visits"
            stroke="var(--color-visits)"
            strokeWidth={1}
            fill="url(#visitsGradient)"
            fillOpacity={0.4}
            clipPath={clipPath}
          />
          <line
            x1={safeAxis}
            y1={0}
            x2={safeAxis}
            y2="85%"
            stroke="var(--color-visits)"
            strokeDasharray="3 3"
            strokeLinecap="round"
            strokeOpacity={0.2}
          />
          <rect
            x={tagX}
            y={0}
            width={tagWidth}
            height={tagHeight}
            fill="var(--secondary-foreground)"
          />
          <text
            x={textX}
            fontWeight={600}
            y={13}
            textAnchor="middle"
            fill="var(--primary-foreground)"
          >
            {compactNumberFormatter.format(springyValue)}
          </text>
          <Area
            type="monotone"
            dataKey="visits"
            stroke="var(--color-visits)"
            strokeOpacity={0.1}
            fill="none"
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
};

// Store Visits Card with Area Chart
const StoreVisitsCard = () => {
  const totalVisits = 701340000;
  const changePercent = -12.5;

  return (
    <div className="bg-card flex min-w-0 flex-col gap-4 border p-4 sm:gap-5 sm:p-5 lg:col-span-2">
      <div className="flex items-start justify-between gap-4">
        {/* Left: Title + Value + Change */}
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Store Visits</span>
          <span
            className={cn(
              jetBrainsMono.className,
              "text-2xl font-semibold sm:text-3xl",
            )}
          >
            {compactNumberFormatter.format(totalVisits)}
          </span>
          <div className="flex items-center gap-1">
            <span
              className={cn(
                jetBrainsMono.className,
                "text-sm font-medium text-red-600",
              )}
            >
              {changePercent}%
            </span>
            <ArrowDownRight
              className="size-3.5 text-red-600"
              aria-hidden="true"
            />
            <span className="text-muted-foreground text-sm">vs Last month</span>
          </div>
        </div>

        {/* Right: Growth sections */}
        <div className="flex flex-wrap gap-2">
          <GrowthSection label="3m" change={25} />
          <GrowthSection label="6m" change={25} />
          <GrowthSection label="1y" change={-12.5} />
        </div>
      </div>

      <div className="h-[140px] w-full min-w-0 sm:h-[160px]">
        <StoreVisitsTargetLineChart />
      </div>
    </div>
  );
};

// Main Dashboard Content
const DashboardContent = () => {
  return (
    <main
      id="dashboard-main"
      className="flex h-full w-full flex-1 flex-col gap-4 overflow-auto p-4 sm:gap-6 sm:p-6"
    >
      {/* KPI Stats Row */}
      <KPIStatsRow />

      {/* Middle Row: Sales Revenue + Segmentation */}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
        <SalesRevenueCard />
        <SegmentationCard />
      </div>

      {/* Bottom Row: User Retention + Store Visits */}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
        <UserRetentionCard />
        <StoreVisitsCard />
      </div>
    </main>
  );
};

// ============================================================================
// Main Dashboard Component
// ============================================================================

export function EcommerceDashboard8({ className }: { className?: string }) {
  return (
    <div
      className={cn("flex w-full flex-1 flex-col overflow-hidden", className)}
    >
      <a
        href="#dashboard-main"
        className="focus:bg-background focus:text-foreground focus:ring-ring sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-3 focus:py-2 focus:text-sm focus:ring-2"
      >
        Skip to main content
      </a>
      <DashboardContent />
    </div>
  );
}
