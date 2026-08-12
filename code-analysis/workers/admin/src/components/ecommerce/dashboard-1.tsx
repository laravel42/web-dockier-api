/* eslint-disable @typescript-eslint/no-unused-vars, @next/next/no-img-element */
"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Box,
  ChevronRight,
  ChevronsUpDown,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  Globe,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  MoreHorizontal,
  Package,
  RotateCcw,
  Settings,
  Truck,
  User,
  Users,
  Wallet,
} from "lucide-react";
import * as React from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  Sector,
  Tooltip,
  TooltipContentProps,
  XAxis,
  YAxis,
} from "recharts";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  footerGroup: NavGroup;
  user?: UserData;
};

type StatItem = {
  title: string;
  previousValue: number;
  value: number;
  changePercent: number;
  isPositive: boolean;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  format: "currency" | "number";
};

// ============================================================================
// Formatting Helpers
// ============================================================================

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const numberFormatter = new Intl.NumberFormat("en-US");

const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 0,
});

const compactCurrencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 0,
});

const monthLabel = (monthIndex: number) =>
  new Intl.DateTimeFormat("en-US", { month: "short" }).format(
    new Date(2025, monthIndex, 1),
  );

// ============================================================================
// Chart Palette (color-mix from primary)
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
};

// ============================================================================
// Mock Data
// ============================================================================

const sidebarData: SidebarData = {
  logo: {
    src: "/images/block/logos/shadcnblocks-logo.svg",
    alt: "Acme Store",
    title: "Acme Store",
    description: "Ecommerce",
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
  ],
  footerGroup: {
    title: "Settings",
    items: [{ label: "Settings", icon: Settings, href: "#" }],
  },
  user: {
    name: "John Doe",
    email: "john@acme.store",
    avatar: "/images/block/avatar-1.webp",
  },
};

const statsData: StatItem[] = [
  {
    title: "Monthly revenue",
    previousValue: 148230,
    value: 189540.75,
    changePercent: 27.86,
    isPositive: true,
    icon: CircleDollarSign,
    format: "currency",
  },
  {
    title: "Orders fulfilled",
    previousValue: 18452,
    value: 21847,
    changePercent: 18.4,
    isPositive: true,
    icon: ClipboardList,
    format: "number",
  },
  {
    title: "New customers",
    previousValue: 4120,
    value: 4975,
    changePercent: 20.8,
    isPositive: true,
    icon: Users,
    format: "number",
  },
  {
    title: "Refunds issued",
    previousValue: 9821,
    value: 8473,
    changePercent: 13.73,
    isPositive: false,
    icon: CreditCard,
    format: "currency",
  },
];

const channelRevenueData = [
  {
    month: monthLabel(0),
    online: 42000,
    inStore: 18000,
    wholesale: 12000,
    marketplace: 8000,
  },
  {
    month: monthLabel(1),
    online: 38000,
    inStore: 21000,
    wholesale: 14000,
    marketplace: 9500,
  },
  {
    month: monthLabel(2),
    online: 51000,
    inStore: 19000,
    wholesale: 11000,
    marketplace: 7200,
  },
  {
    month: monthLabel(3),
    online: 45000,
    inStore: 22000,
    wholesale: 15000,
    marketplace: 10800,
  },
  {
    month: monthLabel(4),
    online: 58000,
    inStore: 24000,
    wholesale: 13000,
    marketplace: 11500,
  },
  {
    month: monthLabel(5),
    online: 62000,
    inStore: 20000,
    wholesale: 16000,
    marketplace: 12300,
  },
];

const fullYearData = [
  { month: "Jan", thisYear: 42000, prevYear: 38000 },
  { month: "Feb", thisYear: 38000, prevYear: 45000 },
  { month: "Mar", thisYear: 52000, prevYear: 41000 },
  { month: "Apr", thisYear: 45000, prevYear: 48000 },
  { month: "May", thisYear: 58000, prevYear: 44000 },
  { month: "Jun", thisYear: 41000, prevYear: 52000 },
  { month: "Jul", thisYear: 55000, prevYear: 47000 },
  { month: "Aug", thisYear: 48000, prevYear: 53000 },
  { month: "Sep", thisYear: 62000, prevYear: 49000 },
  { month: "Oct", thisYear: 54000, prevYear: 58000 },
  { month: "Nov", thisYear: 67000, prevYear: 52000 },
  { month: "Dec", thisYear: 71000, prevYear: 61000 },
];

const chartDates = Array.from({ length: 28 }, (_, index) => {
  return `Feb ${String(index + 1).padStart(2, "0")}`;
});

const aovValues = [
  680, 920, 760, 1040, 820, 1180, 720, 980, 1120, 740, 960, 1080, 700, 940,
  1200, 860, 780, 1160, 820, 1100, 980, 760, 1260, 880, 1140, 960, 1220, 1080,
];

const aovData = chartDates.map((date, index) => ({
  date,
  value: aovValues[index],
}));

const aovAverage =
  aovValues.reduce((total, value) => total + value, 0) / aovValues.length;
const averageOrderValue = Math.round(aovAverage);

const averageSalesThisMonth = [
  640, 720, 680, 740, 790, 820, 760, 700, 780, 850, 830, 790, 760, 720, 800,
  880, 840, 820, 860, 900, 870, 910, 950, 980, 1000, 1020, 980, 1040,
];

const averageSalesLastMonth = [
  560, 600, 590, 620, 640, 700, 660, 630, 650, 720, 740, 700, 680, 660, 690,
  740, 710, 700, 730, 760, 740, 780, 820, 850, 870, 890, 860, 900,
];

const averageSalesData = chartDates.map((date, index) => ({
  date,
  thisMonth: averageSalesThisMonth[index],
  lastMonth: averageSalesLastMonth[index],
}));
const averageSalesValue = Math.round(
  averageSalesThisMonth.reduce((total, value) => total + value, 0) /
    averageSalesThisMonth.length,
);

const channelMixBase = [
  { name: "Electronics", value: 38, color: palette.primary },
  {
    name: "Clothing",
    value: 27,
    color: `color-mix(in oklch, var(--primary) 80%, ${mixBase})`,
  },
  {
    name: "Home & Garden",
    value: 21,
    color: `color-mix(in oklch, var(--primary) 60%, ${mixBase})`,
  },
  {
    name: "Sports",
    value: 14,
    color: `color-mix(in oklch, var(--primary) 42%, ${mixBase})`,
  },
];

const topChannel = channelMixBase.reduce((top, item) =>
  item.value > top.value ? item : top,
);

// ============================================================================
// Chart Configs
// ============================================================================

const revenueFlowChartConfig = {
  thisYear: { label: "This Year", color: palette.primary },
  prevYear: { label: "Previous Year", theme: palette.secondary },
} satisfies ChartConfig;

const aovChartConfig = {
  value: { label: "Order Value", color: palette.primary },
  reference: { label: "Average", theme: palette.secondary },
} satisfies ChartConfig;

const averageSalesChartConfig = {
  thisMonth: { label: "This Month", color: palette.primary },
  lastMonth: { label: "Last Month", theme: palette.secondary },
} satisfies ChartConfig;

const channelChartConfig = {
  online: { label: "Online", color: palette.primary },
  inStore: { label: "In-Store", theme: palette.secondary },
  wholesale: { label: "Wholesale", theme: palette.tertiary },
  marketplace: { label: "Marketplace", theme: palette.quaternary },
} satisfies ChartConfig;

const channelMixChartConfig = {
  electronics: { label: "Electronics", color: palette.primary },
  clothing: { label: "Clothing", theme: palette.secondary },
  homeGarden: { label: "Home & Garden", theme: palette.tertiary },
  sports: { label: "Sports", theme: palette.quaternary },
} satisfies ChartConfig;

// ============================================================================
// Sidebar Components
// ============================================================================

const SidebarLogo = ({ logo }: { logo: SidebarData["logo"] }) => {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" tooltip={logo.title}>
          <div className="bg-primary flex aspect-square size-8 items-center justify-center rounded-sm">
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
                <SidebarMenuSubButton asChild isActive={child.isActive}>
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
    <Avatar className="size-8 rounded-lg">
      <AvatarImage src={user.avatar} alt={user.name} />
      <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
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
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
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
    <Sidebar variant="inset" collapsible="icon" {...props}>
      <SidebarHeader>
        <div className="flex items-center gap-2 group-data-[collapsible=icon]:flex-col">
          <SidebarLogo logo={sidebarData.logo} />
          <SidebarTrigger className="ml-auto group-data-[collapsible=icon]:ml-0" />
        </div>
      </SidebarHeader>
      <SidebarContent>
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
      </SidebarContent>
      <SidebarFooter>
        {sidebarData.user && <NavUser user={sidebarData.user} />}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
};

// ============================================================================
// Stats Cards
// ============================================================================

const StatsCards = () => {
  return (
    <div className="bg-card grid grid-cols-2 gap-3 rounded-xl border p-4 sm:gap-4 sm:p-5 lg:grid-cols-4 lg:gap-6 lg:p-6">
      {statsData.map((stat, index) => {
        const formatter =
          stat.format === "currency" ? currencyFormatter : numberFormatter;

        return (
          <div key={stat.title} className="flex items-start">
            <div className="flex-1 space-y-1 sm:space-y-2 lg:space-y-3">
              <div className="text-muted-foreground flex items-center gap-1.5 sm:gap-2">
                <stat.icon className="size-3.5 sm:size-4" aria-hidden="true" />
                <span className="truncate text-[10px] font-medium sm:text-xs lg:text-sm">
                  {stat.title}
                </span>
              </div>
              <p className="text-muted-foreground/70 hidden text-[10px] sm:block sm:text-xs">
                {formatter.format(stat.previousValue)} previous month
              </p>
              <p className="text-xl leading-tight font-semibold tracking-tight sm:text-2xl lg:text-[28px]">
                {formatter.format(stat.value)}
              </p>
              <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[10px] sm:text-xs">
                {stat.isPositive ? (
                  <ArrowUpRight
                    className="size-3 shrink-0 text-emerald-600 sm:size-3.5"
                    aria-hidden="true"
                  />
                ) : (
                  <ArrowDownRight
                    className="size-3 shrink-0 text-red-600 sm:size-3.5"
                    aria-hidden="true"
                  />
                )}
                <span
                  className={cn(
                    "whitespace-nowrap",
                    stat.isPositive ? "text-emerald-600" : "text-red-600",
                  )}
                >
                  {stat.isPositive ? "+" : "-"}
                  {stat.changePercent.toFixed(1)}%
                </span>
                <span className="text-muted-foreground whitespace-nowrap">
                  vs last month
                </span>
              </div>
            </div>
            {index < statsData.length - 1 && (
              <div className="bg-border mx-4 hidden h-full w-px lg:block xl:mx-6" />
            )}
          </div>
        );
      })}
    </div>
  );
};

// ============================================================================
// Channel Revenue Chart
// ============================================================================

function ChannelTooltip({
  active,
  payload,
  label,
}: Partial<TooltipContentProps<number, string>>) {
  if (!active || !payload?.length) return null;

  const total = payload.reduce(
    (sum, entry) => sum + Number(entry.value ?? 0),
    0,
  );

  return (
    <div className="border-border bg-popover rounded-lg border px-3 py-2 shadow-lg">
      <p className="text-foreground mb-1.5 text-xs font-medium">{label}</p>
      <div className="space-y-1">
        {payload.map((entry) => {
          const dataKey = String(entry.dataKey ?? "");
          const configEntry =
            dataKey in channelChartConfig
              ? channelChartConfig[dataKey as keyof typeof channelChartConfig]
              : undefined;
          const label = configEntry?.label ?? entry.name ?? dataKey;
          return (
            <div key={dataKey} className="flex items-center gap-2">
              <div
                className="size-2 rounded-full"
                style={{ backgroundColor: String(entry.color) }}
              />
              <span className="text-muted-foreground text-[10px] sm:text-xs">
                {label}:
              </span>
              <span className="text-foreground text-[10px] font-medium sm:text-xs">
                {compactCurrencyFormatter.format(Number(entry.value))}
              </span>
            </div>
          );
        })}
        <div className="border-border border-t pt-1">
          <span className="text-foreground text-[10px] font-medium sm:text-xs">
            Total: {compactCurrencyFormatter.format(total)}
          </span>
        </div>
      </div>
    </div>
  );
}

const ChannelRevenueChart = () => {
  return (
    <div className="bg-card flex min-w-0 flex-col rounded-xl border xl:w-[410px]">
      <div className="flex h-14 items-center justify-between border-b px-4 sm:px-5">
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="icon"
            className="size-7 sm:size-8"
            aria-label="Revenue by Channel"
          >
            <BarChart3
              className="text-muted-foreground size-4 sm:size-[18px]"
              aria-hidden="true"
            />
          </Button>
          <h2 className="text-sm font-medium text-pretty sm:text-base">
            Revenue by Channel
          </h2>
        </div>
      </div>

      <div className="flex flex-col gap-2 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3 sm:gap-5">
          {[
            { label: "Online", color: palette.primary },
            { label: "In-Store", color: palette.secondary.light },
            { label: "Wholesale", color: palette.tertiary.light },
            { label: "Marketplace", color: palette.quaternary.light },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-1.5">
              <div
                className="size-2 rounded-full sm:size-2.5"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-muted-foreground text-[10px] sm:text-xs">
                {item.label}
              </span>
            </div>
          ))}
        </div>

        <div className="h-[240px] w-full min-w-0 sm:h-[280px]">
          <ChartContainer config={channelChartConfig} className="h-full w-full">
            <BarChart
              layout="vertical"
              data={channelRevenueData}
              barSize={24}
              margin={{ top: 0, right: 0, bottom: 0, left: -9 }}
            >
              <XAxis
                type="number"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => compactCurrencyFormatter.format(v)}
              />
              <YAxis
                type="category"
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10 }}
                width={36}
              />
              <Tooltip
                content={<ChannelTooltip />}
                cursor={{ fillOpacity: 0.05 }}
              />
              <Bar
                dataKey="online"
                stackId="channel"
                fill="var(--color-online)"
                radius={[4, 0, 0, 4]}
              />
              <Bar
                dataKey="inStore"
                stackId="channel"
                fill="var(--color-inStore)"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="wholesale"
                stackId="channel"
                fill="var(--color-wholesale)"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="marketplace"
                stackId="channel"
                fill="var(--color-marketplace)"
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ChartContainer>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Total Revenue Chart (from Dashboard9)
// ============================================================================

function RevenueTooltip({
  active,
  payload,
  label,
  colors,
}: Partial<TooltipContentProps<number, string>> & {
  colors: { primary: string; secondary: string };
}) {
  if (!active || !payload?.length) return null;

  const thisYear = payload.find((p) => p.dataKey === "thisYear")?.value || 0;
  const prevYear = payload.find((p) => p.dataKey === "prevYear")?.value || 0;
  const diff = Number(thisYear) - Number(prevYear);
  const percentage = prevYear ? diff / Number(prevYear) : 0;
  const currentYear = new Date().getFullYear();
  const formattedDelta = `${diff >= 0 ? "+" : ""}${percentFormatter.format(
    Math.abs(percentage),
  )}`;

  return (
    <div className="border-border bg-popover rounded-lg border p-2 shadow-lg sm:p-3">
      <p className="text-foreground mb-1.5 text-xs font-medium sm:mb-2 sm:text-sm">
        {label}, {currentYear}
      </p>
      <div className="space-y-1 sm:space-y-1.5">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div
            className="size-2 rounded-full sm:size-2.5"
            style={{ backgroundColor: colors.primary }}
          />
          <span className="text-muted-foreground text-[10px] sm:text-sm">
            This Year:
          </span>
          <span className="text-foreground text-[10px] font-medium sm:text-sm">
            {currencyFormatter.format(Number(thisYear))}
          </span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div
            className="size-2 rounded-full sm:size-2.5"
            style={{ backgroundColor: colors.secondary }}
          />
          <span className="text-muted-foreground text-[10px] sm:text-sm">
            Prev Year:
          </span>
          <span className="text-foreground text-[10px] font-medium sm:text-sm">
            {currencyFormatter.format(Number(prevYear))}
          </span>
        </div>
        <div className="border-border mt-1 border-t pt-1">
          <span
            className={cn(
              "text-[10px] font-medium sm:text-xs",
              diff >= 0 ? "text-emerald-500" : "text-red-500",
            )}
          >
            {formattedDelta} vs last year
          </span>
        </div>
      </div>
    </div>
  );
}

const TotalRevenueChart = () => {
  const totalRevenue = fullYearData.reduce(
    (acc, item) => acc + item.thisYear,
    0,
  );

  const legendDotClass = "size-2 rounded-full sm:size-2.5";

  return (
    <div className="bg-card flex min-w-0 flex-1 flex-col rounded-xl border">
      <div className="flex h-14 items-center justify-between border-b px-4 sm:px-5">
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="icon"
            className="size-7 sm:size-8"
            aria-label="Revenue"
          >
            <BarChart3
              className="text-muted-foreground size-4 sm:size-[18px]"
              aria-hidden="true"
            />
          </Button>
          <h2 className="text-sm font-medium text-pretty sm:text-base">
            Total Revenue
          </h2>
        </div>
        <div className="flex items-center gap-3 sm:gap-5">
          <div className="flex items-center gap-1.5">
            <div
              className={legendDotClass}
              style={{ backgroundColor: palette.primary }}
            />
            <span className="text-muted-foreground text-[10px] sm:text-xs">
              This Year
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div
              className={legendDotClass}
              style={{ backgroundColor: palette.secondary.light }}
            />
            <span className="text-muted-foreground text-[10px] sm:text-xs">
              Prev Year
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-4 sm:gap-5 sm:p-5">
        <div className="flex flex-col gap-1">
          <p className="text-xl leading-tight font-semibold tracking-tight sm:text-2xl">
            {currencyFormatter.format(totalRevenue)}
          </p>
          <p className="text-muted-foreground text-[10px] tracking-wider uppercase sm:text-xs">
            This year vs last year
          </p>
        </div>
        <div className="h-[200px] w-full min-w-0 sm:h-[240px] lg:h-[280px]">
          <ChartContainer
            config={revenueFlowChartConfig}
            className="h-full w-full"
          >
            <ComposedChart data={fullYearData}>
              <CartesianGrid strokeDasharray="0" vertical={false} />
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10 }}
                dy={8}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10 }}
                dx={-5}
                tickFormatter={(v) => compactCurrencyFormatter.format(v)}
                width={40}
              />
              <Tooltip
                content={
                  <RevenueTooltip
                    colors={{
                      primary: "var(--color-thisYear)",
                      secondary: "var(--color-prevYear)",
                    }}
                  />
                }
                cursor={{ strokeOpacity: 0.2 }}
              />
              <Line
                type="linear"
                dataKey="thisYear"
                stroke="var(--color-thisYear)"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={{ fill: "var(--color-thisYear)", strokeWidth: 0, r: 2 }}
                activeDot={{ r: 3.5, fill: "var(--color-thisYear)" }}
              />
              <Area
                type="linear"
                dataKey="prevYear"
                stroke="var(--color-prevYear)"
                strokeWidth={1.5}
                strokeOpacity={0.5}
                fill="var(--color-prevYear)"
                fillOpacity={0.08}
              />
            </ComposedChart>
          </ChartContainer>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Mini Chart Cards
// ============================================================================

type MiniChartCardProps = {
  title: string;
  value: string;
  changePercent: number;
  isPositive: boolean;
  helper: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  legend?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
};

const MiniChartCard = ({
  title,
  value,
  changePercent,
  isPositive,
  helper,
  icon: Icon,
  legend,
  footer,
  children,
}: MiniChartCardProps) => {
  return (
    <div className="bg-card flex flex-col gap-3 rounded-xl border p-4 sm:p-5">
      <div className="flex min-h-[64px] items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="bg-muted/40 flex size-8 items-center justify-center rounded-md border">
            <Icon className="text-muted-foreground size-4" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs font-medium">{title}</p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-foreground text-lg font-semibold">
                {value}
              </span>
              <span
                className={cn(
                  "flex items-center gap-1 text-xs font-medium",
                  isPositive ? "text-emerald-600" : "text-red-600",
                )}
              >
                {isPositive ? (
                  <ArrowUpRight className="size-3" aria-hidden="true" />
                ) : (
                  <ArrowDownRight className="size-3" aria-hidden="true" />
                )}
                {Math.abs(changePercent).toFixed(1)}%
              </span>
              <span className="text-muted-foreground text-[10px] sm:text-xs">
                {helper}
              </span>
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={`${title} actions`}
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </Button>
      </div>

      {legend && (
        <div className="text-muted-foreground flex min-h-[20px] items-center gap-4 overflow-x-auto text-[10px] whitespace-nowrap sm:text-xs">
          {legend}
        </div>
      )}

      <div className="min-h-[144px] w-full flex-1">{children}</div>

      {footer ? (
        <div className="text-muted-foreground min-h-[20px] text-[10px] sm:text-xs">
          {footer}
        </div>
      ) : (
        <div className="text-muted-foreground flex min-h-[20px] items-center justify-between text-[10px] sm:text-xs">
          <span>{chartDates[0]}</span>
          <span>{chartDates[chartDates.length - 1]}</span>
        </div>
      )}
    </div>
  );
};

const renderActiveShape = (props: unknown) => {
  const p = props as {
    cx: number;
    cy: number;
    innerRadius: number;
    outerRadius: number;
    startAngle: number;
    endAngle: number;
    fill: string;
  };
  return (
    <g>
      <Sector
        cx={p.cx}
        cy={p.cy}
        innerRadius={p.innerRadius}
        outerRadius={p.outerRadius + 6}
        startAngle={p.startAngle}
        endAngle={p.endAngle}
        fill={p.fill}
      />
    </g>
  );
};

const renderChannelMixShape = (props: unknown, isActive: boolean) => {
  if (isActive) {
    return renderActiveShape(props);
  }

  const p = props as {
    cx: number;
    cy: number;
    innerRadius: number;
    outerRadius: number;
    startAngle: number;
    endAngle: number;
    fill: string;
  };

  return (
    <Sector
      cx={p.cx}
      cy={p.cy}
      innerRadius={p.innerRadius}
      outerRadius={p.outerRadius}
      startAngle={p.startAngle}
      endAngle={p.endAngle}
      fill={p.fill}
    />
  );
};

const MiniChartsSection = () => {
  const [activeSlice, setActiveSlice] = React.useState<number | null>(null);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <MiniChartCard
        title="Average Order Value"
        value={currencyFormatter.format(averageOrderValue)}
        changePercent={2.4}
        isPositive
        helper="vs last month"
        icon={CircleDollarSign}
      >
        <ChartContainer config={aovChartConfig} className="h-full w-full">
          <BarChart data={aovData}>
            <CartesianGrid strokeDasharray="4 4" vertical={false} />
            <XAxis dataKey="date" hide />
            <YAxis hide />
            <ReferenceLine
              y={aovAverage}
              stroke="var(--color-reference)"
              strokeDasharray="4 4"
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const value = payload[0].value as number;
                const diff = value - aovAverage;
                const diffPercent = ((diff / aovAverage) * 100).toFixed(1);
                return (
                  <div className="border-border bg-popover rounded-lg border px-3 py-2 shadow-lg">
                    <p className="text-foreground mb-1 text-xs font-medium">
                      {label}
                    </p>
                    <p className="text-foreground text-sm font-semibold">
                      {currencyFormatter.format(value)}
                    </p>
                    <p className="text-muted-foreground text-[10px]">
                      {diff >= 0 ? "+" : ""}
                      {diffPercent}% vs avg
                    </p>
                  </div>
                );
              }}
              cursor={{ fillOpacity: 0.05 }}
            />
            <Bar
              dataKey="value"
              fill="var(--color-value)"
              fillOpacity={1}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </MiniChartCard>

      <MiniChartCard
        title="Average Sales"
        value={numberFormatter.format(averageSalesValue)}
        changePercent={1.3}
        isPositive
        helper="vs last month"
        icon={BarChart3}
        legend={
          <>
            <span className="flex items-center gap-1">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: palette.primary }}
              />
              This month
            </span>
            <span className="flex items-center gap-1">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: palette.secondary.light }}
              />
              Last month
            </span>
          </>
        }
      >
        <ChartContainer
          config={averageSalesChartConfig}
          className="h-full w-full"
        >
          <LineChart data={averageSalesData}>
            <XAxis dataKey="date" hide />
            <YAxis hide />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const thisMonth = payload.find((p) => p.dataKey === "thisMonth")
                  ?.value as number;
                const lastMonth = payload.find((p) => p.dataKey === "lastMonth")
                  ?.value as number;
                const diff = thisMonth - lastMonth;
                const diffPercent = ((diff / lastMonth) * 100).toFixed(1);
                return (
                  <div className="border-border bg-popover rounded-lg border px-3 py-2 shadow-lg">
                    <p className="text-foreground mb-1.5 text-xs font-medium">
                      {label}
                    </p>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5 text-[10px]">
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: palette.primary }}
                        />
                        <span className="text-muted-foreground">
                          This month:
                        </span>
                        <span className="text-foreground font-medium">
                          {numberFormatter.format(thisMonth)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px]">
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: palette.secondary.light }}
                        />
                        <span className="text-muted-foreground">
                          Last month:
                        </span>
                        <span className="text-foreground font-medium">
                          {numberFormatter.format(lastMonth)}
                        </span>
                      </div>
                    </div>
                    <p className="text-muted-foreground mt-1.5 text-[10px]">
                      {diff >= 0 ? "+" : ""}
                      {diffPercent}% change
                    </p>
                  </div>
                );
              }}
              cursor={{ strokeOpacity: 0.2 }}
            />
            <Line
              type="monotone"
              dataKey="thisMonth"
              stroke="var(--color-thisMonth)"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="lastMonth"
              stroke="var(--color-lastMonth)"
              strokeWidth={2}
              strokeOpacity={0.5}
              dot={false}
            />
          </LineChart>
        </ChartContainer>
      </MiniChartCard>

      <div className="bg-card flex flex-col gap-3 rounded-xl border p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-muted/40 flex size-8 items-center justify-center rounded-md border">
              <Package
                className="text-muted-foreground size-4"
                aria-hidden="true"
              />
            </div>
            <span className="text-sm font-medium">Product Categories</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Product categories actions"
          >
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </Button>
        </div>

        <div className="flex flex-1 items-center justify-center gap-4 sm:gap-6">
          <div className="relative size-[170px] shrink-0 sm:size-[190px]">
            <ChartContainer
              config={channelMixChartConfig}
              className="h-full w-full"
            >
              <PieChart>
                <Pie
                  data={channelMixBase}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="38%"
                  outerRadius="68%"
                  paddingAngle={3}
                  strokeWidth={0}
                  shape={(_, index) =>
                    renderChannelMixShape(_, index === activeSlice)
                  }
                  onMouseEnter={(_: unknown, index: number) =>
                    setActiveSlice(index)
                  }
                  onMouseLeave={() => setActiveSlice(null)}
                >
                  {channelMixBase.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-semibold">{topChannel.value}%</span>
              <span className="text-muted-foreground text-[9px]">
                {topChannel.name}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            {channelMixBase.map((item, index) => (
              <button
                key={item.name}
                type="button"
                className={cn(
                  "focus-visible:ring-ring flex cursor-pointer items-center gap-2.5 rounded-md border-0 bg-transparent p-0 text-left transition-opacity focus-visible:ring-2 focus-visible:outline-none",
                  activeSlice !== null && activeSlice !== index && "opacity-50",
                )}
                onPointerEnter={() => setActiveSlice(index)}
                onPointerLeave={() => setActiveSlice(null)}
                onFocus={() => setActiveSlice(index)}
                onBlur={() => setActiveSlice(null)}
                aria-label={`${item.name}: ${item.value}%`}
              >
                <div
                  className="h-4 w-1 shrink-0 rounded-sm"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-muted-foreground flex-1 text-xs">
                  {item.name}
                </span>
                <span className="text-xs font-semibold tabular-nums">
                  {item.value}%
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="text-muted-foreground text-[10px] sm:text-xs">
          Last 28 days
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Dashboard Content
// ============================================================================

const DashboardContent = () => {
  return (
    <main
      id="dashboard-main"
      tabIndex={-1}
      className="bg-background w-full flex-1 space-y-4 overflow-auto p-3 sm:space-y-6 sm:p-4 md:p-6"
    >
      <StatsCards />
      <div className="flex flex-col gap-4 sm:gap-6 xl:flex-row">
        <TotalRevenueChart />
        <ChannelRevenueChart />
      </div>
      <MiniChartsSection />
    </main>
  );
};

// ============================================================================
// Main Dashboard Component
// ============================================================================

const EcommerceDashboard1 = ({ className }: { className?: string }) => {
  return (
    <div
      className={cn("flex w-full flex-1 flex-col overflow-hidden", className)}
    >
      <a
        href="#dashboard-main"
        className="focus:bg-background focus:text-foreground focus:ring-ring sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:px-3 focus:py-2 focus:text-sm focus:ring-2"
      >
        Skip to main content
      </a>
      <DashboardContent />
    </div>
  );
};

export { EcommerceDashboard1 };
