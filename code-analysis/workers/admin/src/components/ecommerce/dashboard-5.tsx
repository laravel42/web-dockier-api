/* eslint-disable @typescript-eslint/no-unused-vars, @next/next/no-img-element */
"use client";

import {
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
  MoreHorizontal,
  Package,
  RotateCcw,
  Search,
  Settings,
  Truck,
  User,
  Users,
} from "lucide-react";
import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
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
  DropdownMenuCheckboxItem,
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

type TimePeriod = "6months" | "year";

type StatGridItem = {
  label: string;
  value: number;
  format: "currency" | "number" | "percent" | "days" | "compact";
  change: number;
  invertColor: boolean;
};

type FulfillmentItem = {
  order: string;
  shipped: Date;
  progress: number;
  segments: number[];
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
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
});
const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1,
});
const oneDecimalFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});
const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
});
const monthDayFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});
const shippedDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const formatStatValue = (stat: StatGridItem) => {
  switch (stat.format) {
    case "currency":
      return currencyFormatter.format(stat.value);
    case "percent":
      return percentFormatter.format(stat.value);
    case "days":
      return `${oneDecimalFormatter.format(stat.value)} days`;
    case "compact":
      return compactNumberFormatter.format(stat.value);
    default:
      return numberFormatter.format(stat.value);
  }
};

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

const revenueChartConfig = {
  thisYear: { label: "This Year", color: palette.primary },
  prevYear: { label: "Previous Year", theme: palette.secondary },
} satisfies ChartConfig;

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
        { label: "Customers", icon: Users, href: "#" },
      ],
    },
    {
      title: "Analytics",
      defaultOpen: true,
      items: [
        { label: "Analytics", icon: BarChart3, href: "#" },
        { label: "Reports", icon: Globe, href: "#" },
      ],
    },
    {
      title: "Other",
      defaultOpen: false,
      items: [
        { label: "Shipping", icon: Truck, href: "#" },
        { label: "Messages", icon: MessageSquare, href: "#" },
        { label: "Returns", icon: RotateCcw, href: "#" },
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

const periodLabels: Record<TimePeriod, string> = {
  "6months": "Last 6 Months",
  year: "Last Year",
};

function getDataForPeriod(period: TimePeriod) {
  if (period === "6months") return fullYearData.slice(0, 6);
  return fullYearData;
}

const statsGridData: StatGridItem[] = [
  {
    label: "Total Revenue",
    value: 1_800_000,
    format: "currency",
    change: 12.0,
    invertColor: false,
  },
  {
    label: "Avg. Fulfillment",
    value: 2.4,
    format: "days",
    change: -5.0,
    invertColor: false,
  },
  {
    label: "Orders",
    value: 9420,
    format: "number",
    change: 18.0,
    invertColor: false,
  },
  {
    label: "Conversion Rate",
    value: 0.042,
    format: "percent",
    change: 1.2,
    invertColor: false,
  },
  {
    label: "Return Rate",
    value: 0.031,
    format: "percent",
    change: -11.0,
    invertColor: true,
  },
  {
    label: "Page Views",
    value: 184_000,
    format: "compact",
    change: 22.0,
    invertColor: false,
  },
];

const categoryWeekData = [
  {
    day: weekdayFormatter.format(new Date(2025, 0, 6)),
    electronics: 180,
    clothing: 220,
    homeGarden: 280,
    sports: 350,
  },
  {
    day: weekdayFormatter.format(new Date(2025, 0, 7)),
    electronics: 420,
    clothing: 550,
    homeGarden: 380,
    sports: 280,
  },
  {
    day: weekdayFormatter.format(new Date(2025, 0, 8)),
    electronics: 280,
    clothing: 380,
    homeGarden: 520,
    sports: 450,
  },
  {
    day: weekdayFormatter.format(new Date(2025, 0, 9)),
    electronics: 550,
    clothing: 280,
    homeGarden: 420,
    sports: 620,
  },
  {
    day: weekdayFormatter.format(new Date(2025, 0, 10)),
    electronics: 323,
    clothing: 729,
    homeGarden: 506,
    sports: 490,
  },
  {
    day: weekdayFormatter.format(new Date(2025, 0, 11)),
    electronics: 480,
    clothing: 420,
    homeGarden: 280,
    sports: 380,
  },
  {
    day: weekdayFormatter.format(new Date(2025, 0, 12)),
    electronics: 220,
    clothing: 550,
    homeGarden: 450,
    sports: 320,
  },
];

const categoryMonthData = [
  {
    day: monthDayFormatter.format(new Date(2025, 0, 1)),
    electronics: 180,
    clothing: 220,
    homeGarden: 280,
    sports: 350,
  },
  {
    day: monthDayFormatter.format(new Date(2025, 0, 5)),
    electronics: 420,
    clothing: 550,
    homeGarden: 380,
    sports: 280,
  },
  {
    day: monthDayFormatter.format(new Date(2025, 0, 9)),
    electronics: 280,
    clothing: 380,
    homeGarden: 520,
    sports: 450,
  },
  {
    day: monthDayFormatter.format(new Date(2025, 0, 13)),
    electronics: 550,
    clothing: 280,
    homeGarden: 420,
    sports: 620,
  },
  {
    day: monthDayFormatter.format(new Date(2025, 0, 15)),
    electronics: 323,
    clothing: 729,
    homeGarden: 506,
    sports: 490,
  },
  {
    day: monthDayFormatter.format(new Date(2025, 0, 17)),
    electronics: 480,
    clothing: 420,
    homeGarden: 280,
    sports: 380,
  },
  {
    day: monthDayFormatter.format(new Date(2025, 0, 21)),
    electronics: 220,
    clothing: 550,
    homeGarden: 450,
    sports: 320,
  },
  {
    day: monthDayFormatter.format(new Date(2025, 0, 25)),
    electronics: 380,
    clothing: 320,
    homeGarden: 580,
    sports: 480,
  },
  {
    day: monthDayFormatter.format(new Date(2025, 0, 30)),
    electronics: 520,
    clothing: 450,
    homeGarden: 350,
    sports: 420,
  },
];

const categoryChartConfig = {
  electronics: { label: "Electronics", color: palette.primary },
  clothing: {
    label: "Clothing",
    theme: palette.secondary,
  },
  homeGarden: {
    label: "Home & Garden",
    theme: palette.tertiary,
  },
  sports: {
    label: "Sports",
    theme: palette.quaternary,
  },
} satisfies ChartConfig;

const fulfillmentData: FulfillmentItem[] = [
  {
    order: "ORD-4821",
    shipped: new Date(2025, 0, 27),
    progress: 92,
    segments: [
      0.9, 0.7, 1.0, 0.8, 0.6, 0.9, 1.0, 0.7, 0.5, 0.8, 0.9, 1.0, 0.6, 0.7, 0.8,
      0.9, 1.0, 0.5, 0.7, 0.8, 0.9, 0.6, 1.0, 0.8, 0.7, 0.3, 0.2, 0.1, 0.1, 0.1,
    ],
  },
  {
    order: "ORD-4819",
    shipped: new Date(2025, 0, 26),
    progress: 78,
    segments: [
      0.8, 0.6, 0.9, 0.7, 1.0, 0.5, 0.8, 0.9, 0.6, 0.7, 1.0, 0.8, 0.5, 0.9, 0.7,
      0.6, 0.8, 1.0, 0.7, 0.5, 0.2, 0.1, 0.15, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1,
      0.1,
    ],
  },
  {
    order: "ORD-4815",
    shipped: new Date(2025, 0, 25),
    progress: 100,
    segments: [
      1.0, 0.9, 0.8, 1.0, 0.7, 0.9, 1.0, 0.8, 0.6, 0.9, 1.0, 0.7, 0.8, 0.9, 1.0,
      0.6, 0.8, 0.9, 1.0, 0.7, 0.9, 0.8, 1.0, 0.6, 0.9, 0.7, 1.0, 0.8, 0.9, 1.0,
    ],
  },
  {
    order: "ORD-4812",
    shipped: new Date(2025, 0, 24),
    progress: 65,
    segments: [
      0.9, 1.0, 0.7, 0.8, 0.6, 0.9, 0.5, 0.8, 1.0, 0.7, 0.9, 0.6, 0.8, 0.5, 0.7,
      1.0, 0.6, 0.9, 0.8, 0.2, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1,
    ],
  },
  {
    order: "ORD-4808",
    shipped: new Date(2025, 0, 23),
    progress: 43,
    segments: [
      0.8, 0.7, 1.0, 0.6, 0.9, 0.8, 0.5, 0.7, 1.0, 0.9, 0.6, 0.8, 0.7, 0.1, 0.1,
      0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1,
    ],
  },
  {
    order: "ORD-4805",
    shipped: new Date(2025, 0, 22),
    progress: 100,
    segments: [
      0.9, 0.8, 1.0, 0.7, 0.9, 0.6, 1.0, 0.8, 0.7, 0.9, 1.0, 0.8, 0.6, 0.9, 0.7,
      1.0, 0.8, 0.9, 0.7, 1.0, 0.8, 0.9, 0.6, 1.0, 0.7, 0.8, 0.9, 1.0, 0.8, 0.9,
    ],
  },
  {
    order: "ORD-4801",
    shipped: new Date(2025, 0, 21),
    progress: 88,
    segments: [
      1.0, 0.8, 0.7, 0.9, 0.6, 1.0, 0.8, 0.5, 0.9, 0.7, 1.0, 0.8, 0.6, 0.9, 0.7,
      0.8, 1.0, 0.6, 0.5, 0.3, 0.2, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1,
    ],
  },
  {
    order: "ORD-4798",
    shipped: new Date(2025, 0, 20),
    progress: 55,
    segments: [
      0.7, 0.9, 1.0, 0.6, 0.8, 0.9, 0.7, 1.0, 0.5, 0.8, 0.6, 0.9, 0.1, 0.1, 0.1,
      0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1,
    ],
  },
  {
    order: "ORD-4794",
    shipped: new Date(2025, 0, 19),
    progress: 100,
    segments: [
      0.8, 1.0, 0.9, 0.7, 0.8, 1.0, 0.6, 0.9, 0.8, 1.0, 0.7, 0.9, 0.8, 1.0, 0.6,
      0.9, 0.7, 1.0, 0.8, 0.9, 0.7, 1.0, 0.8, 0.6, 0.9, 1.0, 0.7, 0.8, 0.9, 1.0,
    ],
  },
  {
    order: "ORD-4790",
    shipped: new Date(2025, 0, 18),
    progress: 71,
    segments: [
      0.9, 0.6, 0.8, 1.0, 0.7, 0.9, 0.5, 0.8, 1.0, 0.6, 0.9, 0.7, 0.8, 0.5, 0.3,
      0.2, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1,
    ],
  },
  {
    order: "ORD-4786",
    shipped: new Date(2025, 0, 17),
    progress: 35,
    segments: [
      1.0, 0.8, 0.9, 0.7, 0.6, 0.8, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1,
      0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1,
    ],
  },
  {
    order: "ORD-4782",
    shipped: new Date(2025, 0, 16),
    progress: 96,
    segments: [
      0.8, 0.9, 1.0, 0.7, 0.8, 0.9, 1.0, 0.6, 0.8, 0.9, 1.0, 0.7, 0.9, 0.8, 1.0,
      0.6, 0.9, 0.7, 1.0, 0.8, 0.9, 0.6, 1.0, 0.8, 0.7, 0.9, 1.0, 0.8, 0.3, 0.1,
    ],
  },
];

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
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="size-8 rounded-lg">
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback className="rounded-lg">
                  {user.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="text-muted-foreground truncate text-xs">
                  {user.email}
                </span>
              </div>
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
                <Avatar className="size-8 rounded-lg">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className="rounded-lg">
                    {user.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {user.email}
                  </span>
                </div>
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

function CustomTooltip({
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
  const percentage = prevYear ? Math.round((diff / Number(prevYear)) * 100) : 0;
  const currentYear = new Date().getFullYear();

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
            {diff >= 0 ? "+" : ""}
            {percentage}% vs last year
          </span>
        </div>
      </div>
    </div>
  );
}

const RevenueFlowChart = () => {
  const [period, setPeriod] = React.useState<TimePeriod>("6months");

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const nextPeriod = params.get("period");
    if (nextPeriod === "6months" || nextPeriod === "year") {
      setPeriod(nextPeriod);
    }
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (period !== "6months") {
      params.set("period", period);
    } else {
      params.delete("period");
    }
    const nextQuery = params.toString();
    const nextUrl = nextQuery
      ? `${window.location.pathname}?${nextQuery}`
      : window.location.pathname;
    window.history.replaceState(null, "", nextUrl);
  }, [period]);

  const chartData = getDataForPeriod(period);
  const totalRevenue = chartData.reduce((acc, item) => acc + item.thisYear, 0);

  return (
    <div className="bg-card flex min-w-0 flex-1 flex-col gap-4 rounded-xl border p-4 sm:gap-6 sm:p-6">
      <div className="flex flex-wrap items-center gap-2 sm:gap-4">
        <div className="flex flex-1 flex-col gap-1">
          <p className="text-xl leading-tight font-semibold tracking-tight sm:text-2xl">
            {currencyFormatter.format(totalRevenue)}
          </p>
          <p className="text-muted-foreground text-xs">
            Total Revenue ({periodLabels[period]})
          </p>
        </div>
        <div className="hidden items-center gap-3 sm:flex sm:gap-5">
          <div className="flex items-center gap-1.5">
            <div
              className="size-2.5 rounded-full sm:size-3"
              style={{ backgroundColor: palette.primary }}
            />
            <span className="text-muted-foreground text-[10px] sm:text-xs">
              This Year
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div
              className="size-2.5 rounded-full sm:size-3"
              style={{ backgroundColor: palette.secondary.light }}
            />
            <span className="text-muted-foreground text-[10px] sm:text-xs">
              Prev Year
            </span>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 sm:size-8"
              aria-label="Select time period"
            >
              <MoreHorizontal className="size-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Time Period</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {(Object.keys(periodLabels) as TimePeriod[]).map((key) => (
              <DropdownMenuCheckboxItem
                key={key}
                checked={period === key}
                onCheckedChange={() => setPeriod(key)}
              >
                {periodLabels[key]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="h-[200px] w-full min-w-0 sm:h-[240px] lg:h-[280px]">
        <ChartContainer config={revenueChartConfig} className="h-full w-full">
          <BarChart data={chartData} barGap={2}>
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
              tickFormatter={(value) => compactCurrencyFormatter.format(value)}
              width={40}
            />
            <Tooltip
              content={
                <CustomTooltip
                  colors={{
                    primary: "var(--color-thisYear)",
                    secondary: "var(--color-prevYear)",
                  }}
                />
              }
              cursor={{ fillOpacity: 0.05, radius: 4 }}
            />
            <Bar
              dataKey="thisYear"
              fill="var(--color-thisYear)"
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
            />
            <Bar
              dataKey="prevYear"
              fill="var(--color-prevYear)"
              fillOpacity={0.4}
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
            />
          </BarChart>
        </ChartContainer>
      </div>
    </div>
  );
};

const StatsCardsGrid = () => {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:w-[420px] xl:grid-cols-2">
      {statsGridData.map((stat) => {
        const isPositive = stat.invertColor ? stat.change < 0 : stat.change > 0;

        return (
          <div
            key={stat.label}
            className="bg-card flex flex-col rounded-xl border p-4 sm:p-5"
          >
            <div className="flex items-start justify-between">
              <span className="text-muted-foreground text-xs sm:text-sm">
                {stat.label}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground -mt-1 -mr-2 size-6"
                aria-label={`More options for ${stat.label}`}
              >
                <MoreHorizontal className="size-3.5" aria-hidden="true" />
              </Button>
            </div>
            <span className="mt-3 text-lg font-semibold tracking-tight sm:text-xl">
              {formatStatValue(stat)}
            </span>
            <div className="mt-1 flex items-center gap-2 text-[10px] sm:text-xs">
              <span
                className={cn(
                  "font-medium",
                  isPositive
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400",
                )}
              >
                {stat.change > 0 ? "+" : ""}
                {stat.change.toFixed(1)}%
              </span>
              <span className="text-muted-foreground">vs last month</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const CategoryPerformanceChart = () => {
  const [tab, setTab] = React.useState<"week" | "month">("week");

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const nextTab = params.get("categoryTab");
    if (nextTab === "week" || nextTab === "month") {
      setTab(nextTab);
    }
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (tab !== "week") {
      params.set("categoryTab", tab);
    } else {
      params.delete("categoryTab");
    }
    const nextQuery = params.toString();
    const nextUrl = nextQuery
      ? `${window.location.pathname}?${nextQuery}`
      : window.location.pathname;
    window.history.replaceState(null, "", nextUrl);
  }, [tab]);

  const chartData = tab === "week" ? categoryWeekData : categoryMonthData;
  const totalOrders = chartData.reduce(
    (acc, item) =>
      acc + item.electronics + item.clothing + item.homeGarden + item.sports,
    0,
  );

  return (
    <div className="bg-card flex min-w-0 flex-1 flex-col gap-4 rounded-xl border p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium text-pretty">
            Category Performance
          </h2>
          <span className="text-2xl font-bold tracking-tight">
            {numberFormatter.format(totalOrders)}
          </span>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
            {Object.entries(categoryChartConfig).map(([key, config]) => (
              <div key={key} className="flex items-center gap-1.5">
                <div
                  className="size-2 rounded-full"
                  style={{
                    backgroundColor:
                      "color" in config ? config.color : config.theme.light,
                  }}
                />
                <span className="text-muted-foreground text-[10px]">
                  {config.label}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-muted/50 flex items-center gap-0.5 rounded-lg border p-0.5">
          {(["week", "month"] as const).map((value) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                tab === value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {value.charAt(0).toUpperCase() + value.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[240px] w-full min-w-0 sm:h-[280px]">
        <ChartContainer config={categoryChartConfig} className="h-full w-full">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="day"
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
              domain={[0, 1000]}
              width={32}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="border-border bg-popover rounded-lg border p-2 shadow-lg">
                    <p className="text-foreground mb-1 text-xs font-medium">
                      {label}
                    </p>
                    {payload.map((entry, index) => (
                      <div
                        key={String(entry.dataKey ?? index)}
                        className="flex items-center gap-1.5 text-[10px]"
                      >
                        <div
                          className="size-2 rounded-full"
                          style={{ backgroundColor: entry.color }}
                        />
                        <span className="text-muted-foreground">
                          {categoryChartConfig[
                            entry.dataKey as keyof typeof categoryChartConfig
                          ]?.label ?? entry.dataKey}
                          :
                        </span>
                        <span className="text-foreground font-medium">
                          {numberFormatter.format(Number(entry.value))}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="electronics"
              stroke="var(--color-electronics)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
            <Line
              type="monotone"
              dataKey="clothing"
              stroke="var(--color-clothing)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
            <Line
              type="monotone"
              dataKey="homeGarden"
              stroke="var(--color-homeGarden)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
            <Line
              type="monotone"
              dataKey="sports"
              stroke="var(--color-sports)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          </LineChart>
        </ChartContainer>
      </div>
    </div>
  );
};

const FulfillmentPanel = () => {
  return (
    <div className="bg-card flex flex-col gap-4 rounded-xl border p-5 xl:w-[420px]">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-pretty">Order Fulfillment</h2>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Refresh"
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label="Options"
              >
                <MoreHorizontal className="size-3.5" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>Export CSV</DropdownMenuItem>
              <DropdownMenuItem>View All Orders</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div>
        <div className="text-muted-foreground flex items-center border-b pr-3 pb-2 text-[10px]">
          <span className="w-20 shrink-0">Order</span>
          <span className="w-24 shrink-0">Shipped</span>
          <span className="flex-1">Status</span>
          <span className="w-8 shrink-0 text-right">Del[%]</span>
        </div>
        <ScrollArea className="h-[280px]">
          <div className="divide-y pr-3">
            {fulfillmentData.map((row) => (
              <div
                key={row.order}
                className="flex items-center gap-2 py-2.5 text-xs"
              >
                <span className="w-20 shrink-0 font-medium">{row.order}</span>
                <span className="text-muted-foreground w-24 shrink-0">
                  {shippedDateFormatter.format(row.shipped)}
                </span>
                <div className="flex min-w-0 flex-1 items-center gap-px overflow-hidden">
                  {row.segments.slice(0, 15).map((opacity, i) => {
                    const filled = i < Math.round((row.progress / 100) * 15);
                    return (
                      <div
                        key={i}
                        className="h-2 w-1.5 shrink-0 rounded-[1px]"
                        style={{
                          backgroundColor: filled
                            ? palette.primary
                            : "var(--muted)",
                          opacity: filled ? opacity : 0.2,
                        }}
                      />
                    );
                  })}
                </div>
                <span className="w-8 shrink-0 text-right font-medium">
                  {row.progress}
                </span>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};

const DashboardContent = () => {
  return (
    <main
      id="dashboard-main"
      tabIndex={-1}
      className="bg-background w-full flex-1 space-y-4 overflow-auto p-3 sm:p-4 md:p-6"
    >
      <div className="flex flex-col gap-4 xl:flex-row">
        <RevenueFlowChart />
        <StatsCardsGrid />
      </div>
      <div className="flex flex-col gap-4 xl:flex-row">
        <CategoryPerformanceChart />
        <FulfillmentPanel />
      </div>
    </main>
  );
};

export function EcommerceDashboard5({ className }: { className?: string }) {
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
}
