/* eslint-disable @typescript-eslint/no-unused-vars, @next/next/no-img-element */
"use client";

import {
  ArrowUpRight,
  BarChart3,
  Bell,
  Box,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  Download,
  Filter,
  Globe,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  MoreHorizontal,
  Package,
  PieChartIcon,
  Plus,
  RotateCcw,
  Search,
  Settings,
  ShoppingCart,
  Truck,
  User,
  Users,
  Wallet,
} from "lucide-react";
import * as React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  Sector,
  Tooltip,
  TooltipContentProps,
  XAxis,
  YAxis,
} from "recharts";
import type { PieSectorDataItem } from "recharts/types/polar/Pie";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  BlockTooltip as ShadTooltip,
  BlockTooltipContent as ShadTooltipContent,
  BlockTooltipProvider as ShadTooltipProvider,
  BlockTooltipTrigger as ShadTooltipTrigger,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

type StatItem = {
  title: string;
  previousValue: number;
  value: number;
  changePercent: number;
  isPositive: boolean;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  format: "currency" | "number";
};

type SalesCategoryItem = {
  name: string;
  value: number;
  percent: number;
  color: string;
};

type RevenueFlowColors = {
  thisYear: string;
  prevYear: string;
};

type OrderStatus = "Processing" | "Shipped" | "Delivered" | "Cancelled";

type Order = {
  id: string;
  orderNumber: string;
  customer: string;
  customerInitials: string;
  products: string[];
  productCount: number;
  status: OrderStatus;
  total: number;
  date: string;
};

type ActivityItem = {
  title: string;
  detail: string;
  time: string;
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const numberFormatter = new Intl.NumberFormat("en-US");

const compactCurrencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 0,
});

/**
 * Custom hook for hover highlight interaction.
 * Provides stable callback to prevent unnecessary re-renders in chart components.
 */
function useHoverHighlight<T extends string | number>() {
  const [active, setActive] = React.useState<T | null>(null);

  const handleHover = React.useCallback((value: T | null) => {
    setActive(value);
  }, []);

  return { active, handleHover };
}

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

const salesCategoryChartConfig = {
  electronics: { label: "Electronics", color: palette.primary },
  accessories: { label: "Accessories", theme: palette.secondary },
  software: { label: "Software", theme: palette.tertiary },
  other: { label: "Other", theme: palette.quaternary },
} satisfies ChartConfig;

const revenueFlowChartConfig = {
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

type TimePeriod = "6months" | "year";

const periodLabels: Record<TimePeriod, string> = {
  "6months": "Last 6 Months",
  year: "Last Year",
};

function getDataForPeriod(period: TimePeriod) {
  if (period === "6months") return fullYearData.slice(0, 6);
  return fullYearData;
}

const orderStatusData = {
  total: 1247,
  processing: { count: 156, percent: 12.5 },
  shipped: { count: 423, percent: 33.9 },
  delivered: { count: 668, percent: 53.6 },
};

const salesCategoryData: SalesCategoryItem[] = [
  {
    name: "Electronics",
    value: 145200,
    percent: 58,
    color: palette.primary,
  },
  {
    name: "Accessories",
    value: 62400,
    percent: 25,
    color: `color-mix(in oklch, var(--primary) 80%, ${mixBase})`,
  },
  {
    name: "Software",
    value: 32500,
    percent: 13,
    color: `color-mix(in oklch, var(--primary) 60%, ${mixBase})`,
  },
  {
    name: "Other",
    value: 10000,
    percent: 4,
    color: `color-mix(in oklch, var(--primary) 42%, ${mixBase})`,
  },
];

const orderStatuses: OrderStatus[] = [
  "Processing",
  "Shipped",
  "Delivered",
  "Cancelled",
];

const orders: Order[] = [
  {
    id: "1",
    orderNumber: "ORD-2024-001",
    customer: "Sarah Johnson",
    customerInitials: "SJ",
    products: ["MacBook Pro 14", "Magic Mouse"],
    productCount: 2,
    status: "Delivered",
    total: 2499.0,
    date: "Jan 28, 2024",
  },
  {
    id: "2",
    orderNumber: "ORD-2024-002",
    customer: "Michael Chen",
    customerInitials: "MC",
    products: ["iPhone 15 Pro", "AirPods Pro"],
    productCount: 2,
    status: "Shipped",
    total: 1348.0,
    date: "Jan 27, 2024",
  },
  {
    id: "3",
    orderNumber: "ORD-2024-003",
    customer: "Emma Wilson",
    customerInitials: "EW",
    products: ["iPad Air", "Apple Pencil", "Smart Keyboard"],
    productCount: 3,
    status: "Processing",
    total: 1198.0,
    date: "Jan 27, 2024",
  },
  {
    id: "4",
    orderNumber: "ORD-2024-004",
    customer: "James Rodriguez",
    customerInitials: "JR",
    products: ["Apple Watch Ultra"],
    productCount: 1,
    status: "Delivered",
    total: 799.0,
    date: "Jan 26, 2024",
  },
  {
    id: "5",
    orderNumber: "ORD-2024-005",
    customer: "Lisa Park",
    customerInitials: "LP",
    products: ["Mac Mini M2"],
    productCount: 1,
    status: "Cancelled",
    total: 599.0,
    date: "Jan 26, 2024",
  },
  {
    id: "6",
    orderNumber: "ORD-2024-006",
    customer: "David Kim",
    customerInitials: "DK",
    products: ["Studio Display", "Mac Studio"],
    productCount: 2,
    status: "Shipped",
    total: 5498.0,
    date: "Jan 25, 2024",
  },
  {
    id: "7",
    orderNumber: "ORD-2024-007",
    customer: "Anna Martinez",
    customerInitials: "AM",
    products: ["MacBook Air M2"],
    productCount: 1,
    status: "Delivered",
    total: 1199.0,
    date: "Jan 25, 2024",
  },
  {
    id: "8",
    orderNumber: "ORD-2024-008",
    customer: "Robert Taylor",
    customerInitials: "RT",
    products: ["iPhone 15", "MagSafe Charger"],
    productCount: 2,
    status: "Processing",
    total: 878.0,
    date: "Jan 24, 2024",
  },
  {
    id: "9",
    orderNumber: "ORD-2024-009",
    customer: "Jennifer Lee",
    customerInitials: "JL",
    products: ["AirPods Max"],
    productCount: 1,
    status: "Shipped",
    total: 549.0,
    date: "Jan 24, 2024",
  },
  {
    id: "10",
    orderNumber: "ORD-2024-010",
    customer: "William Brown",
    customerInitials: "WB",
    products: ["iPad Pro 12.9", "Magic Keyboard"],
    productCount: 2,
    status: "Delivered",
    total: 1648.0,
    date: "Jan 23, 2024",
  },
  {
    id: "11",
    orderNumber: "ORD-2024-011",
    customer: "Sophia Davis",
    customerInitials: "SD",
    products: ["MacBook Pro 16"],
    productCount: 1,
    status: "Processing",
    total: 2499.0,
    date: "Jan 23, 2024",
  },
  {
    id: "12",
    orderNumber: "ORD-2024-012",
    customer: "Daniel Garcia",
    customerInitials: "DG",
    products: ["Apple TV 4K", "HomePod mini"],
    productCount: 2,
    status: "Cancelled",
    total: 278.0,
    date: "Jan 22, 2024",
  },
  {
    id: "13",
    orderNumber: "ORD-2024-013",
    customer: "Olivia White",
    customerInitials: "OW",
    products: ["iPhone 15 Pro Max"],
    productCount: 1,
    status: "Delivered",
    total: 1199.0,
    date: "Jan 22, 2024",
  },
  {
    id: "14",
    orderNumber: "ORD-2024-014",
    customer: "Thomas Anderson",
    customerInitials: "TA",
    products: ["Mac Pro", "Pro Display XDR"],
    productCount: 2,
    status: "Shipped",
    total: 12498.0,
    date: "Jan 21, 2024",
  },
  {
    id: "15",
    orderNumber: "ORD-2024-015",
    customer: "Emily Thompson",
    customerInitials: "ET",
    products: ["iPad mini", "Apple Pencil"],
    productCount: 2,
    status: "Delivered",
    total: 648.0,
    date: "Jan 21, 2024",
  },
  {
    id: "16",
    orderNumber: "ORD-2024-016",
    customer: "Christopher Moore",
    customerInitials: "CM",
    products: ["AirPods Pro 2"],
    productCount: 1,
    status: "Processing",
    total: 249.0,
    date: "Jan 20, 2024",
  },
  {
    id: "17",
    orderNumber: "ORD-2024-017",
    customer: "Isabella Jackson",
    customerInitials: "IJ",
    products: ["Apple Watch Series 9"],
    productCount: 1,
    status: "Shipped",
    total: 399.0,
    date: "Jan 20, 2024",
  },
  {
    id: "18",
    orderNumber: "ORD-2024-018",
    customer: "Matthew Harris",
    customerInitials: "MH",
    products: ["MacBook Air 15"],
    productCount: 1,
    status: "Delivered",
    total: 1299.0,
    date: "Jan 19, 2024",
  },
  {
    id: "19",
    orderNumber: "ORD-2024-019",
    customer: "Ava Clark",
    customerInitials: "AC",
    products: ["iPhone SE", "EarPods"],
    productCount: 2,
    status: "Cancelled",
    total: 448.0,
    date: "Jan 19, 2024",
  },
  {
    id: "20",
    orderNumber: "ORD-2024-020",
    customer: "Joshua Lewis",
    customerInitials: "JL",
    products: ["Mac Mini M2 Pro"],
    productCount: 1,
    status: "Processing",
    total: 1299.0,
    date: "Jan 18, 2024",
  },
];

const recentActivity: ActivityItem[] = [
  {
    title: "New user registration",
    detail: "Alex Morgan",
    time: "2 minutes ago",
  },
  {
    title: "New Order Placed",
    detail: "Alex Morgan",
    time: "2 minutes ago",
  },
  {
    title: "Payment Received",
    detail: "Alex Morgan",
    time: "2 minutes ago",
  },
  {
    title: "Invoice Sent",
    detail: "Jamie Lee",
    time: "6 minutes ago",
  },
  {
    title: "Subscription Upgraded",
    detail: "Noah Roberts",
    time: "12 minutes ago",
  },
  {
    title: "Refund Issued",
    detail: "Olivia White",
    time: "18 minutes ago",
  },
  {
    title: "Password Reset",
    detail: "Ethan Parker",
    time: "24 minutes ago",
  },
  {
    title: "New Comment",
    detail: "Sophia Davis",
    time: "32 minutes ago",
  },
  {
    title: "Support Ticket Closed",
    detail: "Michael Chen",
    time: "45 minutes ago",
  },
  {
    title: "Payout Processed",
    detail: "Emma Wilson",
    time: "1 hour ago",
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
            <Icon className="size-4" />
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
            <Icon className="size-4" />
            <span>{item.label}</span>
            <ChevronRight className="ml-auto size-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
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

const WelcomeSection = () => {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
      <div className="space-y-2 sm:space-y-5">
        <h2 className="text-lg leading-relaxed font-semibold sm:text-[22px]">
          Welcome Back, John!
        </h2>
        <p className="text-muted-foreground text-sm sm:text-base">
          Today you have{" "}
          <span className="text-foreground font-medium">12 orders</span> to
          fulfill,{" "}
          <span className="text-foreground font-medium">3 returns</span> pending
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-2 sm:h-9"
          aria-label="Export"
        >
          <Download className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">Export</span>
        </Button>
        <Button size="sm" className="h-8 gap-2 sm:h-9" aria-label="Add Product">
          <Plus className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">Add Product</span>
        </Button>
      </div>
    </div>
  );
};

const StatsCards = () => {
  return (
    <div className="bg-card rounded-xl border">
      <div className="divide-border grid grid-cols-1 divide-x-0 divide-y sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
        {statsData.map((stat) => {
          const formatter =
            stat.format === "currency" ? currencyFormatter : numberFormatter;

          return (
            <div key={stat.title} className="space-y-4 p-4 sm:p-6">
              <div className="text-muted-foreground flex items-center gap-1.5">
                <stat.icon
                  className="size-4 sm:size-[18px]"
                  aria-hidden="true"
                />
                <span className="text-xs font-medium sm:text-sm">
                  {stat.title}
                </span>
              </div>
              <p className="text-2xl font-semibold tracking-tight sm:text-[28px]">
                {formatter.format(stat.value)}
              </p>
              <div className="flex flex-wrap items-center gap-2 text-[10px] sm:text-xs xl:flex-nowrap">
                <span
                  className={cn(
                    "font-medium",
                    stat.isPositive
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400",
                  )}
                >
                  {stat.isPositive ? "+" : "-"}
                  {stat.changePercent.toFixed(1)}%
                  <span className="hidden sm:inline">
                    (
                    {formatter.format(
                      Math.abs(stat.value - stat.previousValue),
                    )}
                    )
                  </span>
                </span>
                <span className="text-muted-foreground hidden items-center gap-2 sm:inline-flex">
                  <span className="bg-muted-foreground size-1 rounded-full" />
                  <span className="xl:whitespace-nowrap">vs Last Month</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const OrderStatusChart = () => {
  const { active: activeSegment, handleHover } = useHoverHighlight<number>();

  const orderStatusItems = [
    {
      key: "processing",
      label: "Processing",
      ...orderStatusData.processing,
      color: palette.primary,
    },
    {
      key: "shipped",
      label: "Shipped",
      ...orderStatusData.shipped,
      color: palette.secondary.light,
    },
    {
      key: "delivered",
      label: "Delivered",
      ...orderStatusData.delivered,
      color: palette.tertiary.light,
    },
  ];

  return (
    <div className="bg-card flex flex-col gap-4 rounded-xl border p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-2.5">
          <Button
            variant="outline"
            size="icon"
            className="size-7 sm:size-8"
            aria-label="Order status"
          >
            <ShoppingCart className="text-muted-foreground size-4 sm:size-[18px]" />
          </Button>
          <div>
            <span className="text-sm font-medium sm:text-base">
              Order Status
            </span>
            <p className="text-muted-foreground text-[10px] sm:text-xs">
              {numberFormatter.format(orderStatusData.total)} Orders This Month
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 sm:size-8"
          aria-label="More options"
        >
          <MoreHorizontal className="text-muted-foreground size-4" />
        </Button>
      </div>

      <div className="space-y-3">
        <div className="flex h-3 w-full overflow-hidden rounded-full sm:h-4">
          {orderStatusItems.map((item, index) => (
            <ShadTooltipProvider key={item.key}>
              <ShadTooltip>
                <ShadTooltipTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "h-full border-0 p-0 transition-opacity duration-200 motion-reduce:transition-none",
                      activeSegment !== null &&
                        activeSegment !== index &&
                        "opacity-40",
                    )}
                    style={{
                      width: `${item.percent}%`,
                      backgroundColor: item.color,
                    }}
                    onPointerEnter={() => handleHover(index)}
                    onPointerLeave={() => handleHover(null)}
                    onFocus={() => handleHover(index)}
                    onBlur={() => handleHover(null)}
                    aria-label={`${item.label}: ${numberFormatter.format(item.count)} orders (${item.percent}%)`}
                  />
                </ShadTooltipTrigger>
                <ShadTooltipContent
                  side="top"
                  sideOffset={8}
                  className="px-3 py-2"
                >
                  <div className="grid gap-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="font-medium">{item.label}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {item.percent}%
                      </span>
                    </div>
                    <span className="text-muted-foreground tabular-nums">
                      {numberFormatter.format(item.count)} orders
                    </span>
                  </div>
                </ShadTooltipContent>
              </ShadTooltip>
            </ShadTooltipProvider>
          ))}
        </div>

        <div className="flex items-center justify-between text-[10px] sm:text-xs">
          {orderStatusItems.map((item, index) => (
            <span
              key={item.key}
              className={cn(
                "text-muted-foreground tabular-nums transition-opacity duration-200 motion-reduce:transition-none",
                activeSegment !== null &&
                  activeSegment !== index &&
                  "opacity-40",
              )}
            >
              {item.percent}%
            </span>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          {orderStatusItems.map((item, index) => (
            <ShadTooltipProvider key={item.key}>
              <ShadTooltip>
                <ShadTooltipTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "flex items-center gap-1.5 border-0 bg-transparent p-0 transition-opacity duration-200 motion-reduce:transition-none",
                      activeSegment !== null &&
                        activeSegment !== index &&
                        "opacity-40",
                    )}
                    onPointerEnter={() => handleHover(index)}
                    onPointerLeave={() => handleHover(null)}
                    onFocus={() => handleHover(index)}
                    onBlur={() => handleHover(null)}
                  >
                    <span
                      className="size-2.5 rounded-full sm:size-3"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-muted-foreground text-[10px] sm:text-xs">
                      {item.label}
                    </span>
                  </button>
                </ShadTooltipTrigger>
                <ShadTooltipContent
                  side="top"
                  sideOffset={8}
                  className="px-3 py-2"
                >
                  <div className="grid gap-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="font-medium">{item.label}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {item.percent}%
                      </span>
                    </div>
                    <span className="text-muted-foreground tabular-nums">
                      {numberFormatter.format(item.count)} orders
                    </span>
                  </div>
                </ShadTooltipContent>
              </ShadTooltip>
            </ShadTooltipProvider>
          ))}
        </div>
      </div>
    </div>
  );
};

const renderActiveShape = (props: PieSectorDataItem) => {
  const {
    cx = 0,
    cy = 0,
    innerRadius = 0,
    outerRadius = 0,
    startAngle = 0,
    endAngle = 0,
    fill = "currentColor",
  } = props;
  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 6}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
    </g>
  );
};

const renderSalesCategoryShape = (
  props: PieSectorDataItem,
  isActive: boolean,
) => {
  if (isActive) {
    return renderActiveShape(props);
  }

  const {
    cx = 0,
    cy = 0,
    innerRadius = 0,
    outerRadius = 0,
    startAngle = 0,
    endAngle = 0,
    fill = "currentColor",
  } = props;

  return (
    <Sector
      cx={cx}
      cy={cy}
      innerRadius={innerRadius}
      outerRadius={outerRadius}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
    />
  );
};

const SalesByCategoryChart = () => {
  const { active: activeSlice, handleHover: setHoveredSlice } =
    useHoverHighlight<number>();
  const totalSales = salesCategoryData.reduce(
    (acc, item) => acc + item.value,
    0,
  );

  return (
    <div className="bg-card flex flex-1 flex-col gap-4 rounded-xl border p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-2.5">
          <Button
            variant="outline"
            size="icon"
            className="size-7 sm:size-8"
            aria-label="Sales by category"
          >
            <PieChartIcon className="text-muted-foreground size-4 sm:size-[18px]" />
          </Button>
          <div>
            <span className="text-sm font-medium sm:text-base">
              Sales by Category
            </span>
            <p className="text-muted-foreground flex items-center gap-1 text-[10px] sm:text-xs">
              <ArrowUpRight
                className="size-3 text-emerald-600"
                aria-hidden="true"
              />
              <span className="text-emerald-600">+8.4%</span>
              <span>vs last month</span>
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 sm:size-8"
          aria-label="More options"
        >
          <MoreHorizontal className="text-muted-foreground size-4" />
        </Button>
      </div>

      <div className="flex flex-1 items-center gap-4 sm:gap-6">
        <div className="relative size-[100px] shrink-0 sm:size-[120px]">
          <ChartContainer
            config={salesCategoryChartConfig}
            className="h-full w-full"
          >
            <PieChart>
              <Pie
                data={salesCategoryData}
                cx="50%"
                cy="50%"
                innerRadius="55%"
                outerRadius="90%"
                paddingAngle={2}
                dataKey="value"
                strokeWidth={0}
                shape={(props, index) =>
                  renderSalesCategoryShape(props, index === activeSlice)
                }
                onMouseEnter={(_: unknown, index: number) =>
                  setHoveredSlice(index)
                }
                onMouseLeave={() => setHoveredSlice(null)}
              >
                {salesCategoryData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-sm font-semibold sm:text-base">
              {compactCurrencyFormatter.format(totalSales)}
            </span>
            <span className="text-muted-foreground text-[8px] sm:text-[10px]">
              Total
            </span>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-2 sm:gap-3">
          {salesCategoryData.map((item, index) => (
            <button
              key={item.name}
              type="button"
              className={cn(
                "focus-visible:ring-ring flex items-center justify-between gap-2 rounded-md border-0 bg-transparent p-0 text-left transition-opacity duration-200 focus-visible:ring-2 focus-visible:outline-none motion-reduce:transition-none",
                activeSlice !== null && activeSlice !== index && "opacity-50",
              )}
              onPointerEnter={() => setHoveredSlice(index)}
              onPointerLeave={() => setHoveredSlice(null)}
              onFocus={() => setHoveredSlice(index)}
              onBlur={() => setHoveredSlice(null)}
              aria-label={`${item.name}: ${compactCurrencyFormatter.format(item.value)} (${item.percent}%)`}
            >
              <div className="flex items-center gap-2">
                <div
                  className="size-2 rounded-full sm:size-2.5"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-muted-foreground text-[10px] sm:text-xs">
                  {item.name}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px] sm:text-xs">
                <span className="font-medium tabular-nums">
                  {compactCurrencyFormatter.format(item.value)}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {item.percent}%
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

const SideChartsSection = () => {
  return (
    <div className="flex w-full flex-col gap-4 xl:w-[410px]">
      <OrderStatusChart />
      <SalesByCategoryChart />
    </div>
  );
};

function CustomTooltip({
  active,
  payload,
  label,
  colors,
}: Partial<TooltipContentProps<number, string>> & {
  colors: RevenueFlowColors;
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
            style={{ backgroundColor: colors.thisYear }}
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
            style={{ backgroundColor: colors.prevYear }}
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
  const { active: activeSeries, handleHover } = useHoverHighlight<
    "thisYear" | "prevYear"
  >();

  const legendItems = [
    { key: "thisYear", label: "This Year", color: palette.primary },
    { key: "prevYear", label: "Prev Year", color: palette.secondary.light },
  ] as const;

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
          {legendItems.map((item) => (
            <div
              key={item.key}
              className={cn(
                "flex items-center gap-1.5 transition-opacity duration-200 motion-reduce:transition-none",
                activeSeries !== null &&
                  activeSeries !== item.key &&
                  "opacity-40",
              )}
              onMouseEnter={() => handleHover(item.key)}
              onMouseLeave={() => handleHover(null)}
            >
              <div
                className="size-2.5 rounded-full sm:size-3"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-muted-foreground text-[10px] sm:text-xs">
                {item.label}
              </span>
            </div>
          ))}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 sm:size-8"
              aria-label="Select time period"
            >
              <MoreHorizontal className="size-4" />
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
        <ChartContainer
          config={revenueFlowChartConfig}
          className="h-full w-full"
        >
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="thisYearGradient" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--color-thisYear)"
                  stopOpacity={0.3}
                />
                <stop
                  offset="100%"
                  stopColor="var(--color-thisYear)"
                  stopOpacity={0.05}
                />
              </linearGradient>
              <linearGradient id="prevYearGradient" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--color-prevYear)"
                  stopOpacity={0.2}
                />
                <stop
                  offset="100%"
                  stopColor="var(--color-prevYear)"
                  stopOpacity={0.02}
                />
              </linearGradient>
            </defs>
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
                    thisYear: "var(--color-thisYear)",
                    prevYear: "var(--color-prevYear)",
                  }}
                />
              }
              cursor={{ strokeOpacity: 0.2 }}
            />
            <Area
              type="monotone"
              dataKey="thisYear"
              stroke="var(--color-thisYear)"
              strokeWidth={activeSeries === "thisYear" ? 3 : 2}
              fill="url(#thisYearGradient)"
              fillOpacity={
                activeSeries === null || activeSeries === "thisYear" ? 1 : 0.3
              }
              strokeOpacity={
                activeSeries === null || activeSeries === "thisYear" ? 1 : 0.3
              }
            />
            <Area
              type="monotone"
              dataKey="prevYear"
              stroke="var(--color-prevYear)"
              strokeWidth={activeSeries === "prevYear" ? 3 : 2}
              fill="url(#prevYearGradient)"
              fillOpacity={
                activeSeries === null || activeSeries === "prevYear" ? 1 : 0.3
              }
              strokeOpacity={
                activeSeries === null || activeSeries === "prevYear" ? 1 : 0.3
              }
            />
          </AreaChart>
        </ChartContainer>
      </div>
    </div>
  );
};

const statusStyles: Record<OrderStatus, string> = {
  Processing:
    "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-900/30 dark:text-amber-400 dark:ring-amber-400/20",
  Shipped:
    "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-700/10 dark:bg-blue-900/30 dark:text-blue-400 dark:ring-blue-400/20",
  Delivered:
    "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-900/30 dark:text-emerald-400 dark:ring-emerald-400/20",
  Cancelled:
    "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/10 dark:bg-red-900/30 dark:text-red-400 dark:ring-red-400/20",
};

const RecentTransactionsTable = ({ className }: { className?: string }) => {
  const [statusFilter, setStatusFilter] = React.useState<OrderStatus | "all">(
    "all",
  );
  const [currentPage, setCurrentPage] = React.useState(1);
  const [isHydrated, setIsHydrated] = React.useState(false);
  const pageSize = 6;

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const nextStatus = params.get("status");
    if (
      nextStatus &&
      (nextStatus === "all" ||
        orderStatuses.includes(nextStatus as OrderStatus))
    ) {
      setStatusFilter(nextStatus as OrderStatus | "all");
    }
    const nextPage = Number(params.get("page"));
    if (!Number.isNaN(nextPage) && nextPage > 0) {
      setCurrentPage(nextPage);
    }
    setIsHydrated(true);
  }, []);

  const filteredOrders = React.useMemo(() => {
    if (statusFilter === "all") return orders;
    return orders.filter((order) => order.status === statusFilter);
  }, [statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));

  const paginatedOrders = React.useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredOrders.slice(startIndex, startIndex + pageSize);
  }, [filteredOrders, currentPage, pageSize]);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter]);

  React.useEffect(() => {
    if (!isHydrated || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (statusFilter !== "all") {
      params.set("status", statusFilter);
    } else {
      params.delete("status");
    }
    if (currentPage > 1) {
      params.set("page", String(currentPage));
    } else {
      params.delete("page");
    }
    const nextQuery = params.toString();
    const nextUrl = nextQuery
      ? `${window.location.pathname}?${nextQuery}`
      : window.location.pathname;
    window.history.replaceState(null, "", nextUrl);
  }, [statusFilter, currentPage, isHydrated]);

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const startRow = filteredOrders.length ? (currentPage - 1) * pageSize + 1 : 0;
  const endRow = Math.min(currentPage * pageSize, filteredOrders.length);

  return (
    <div className={cn("bg-card rounded-xl border", className)}>
      <div className="flex items-center justify-between gap-3 px-4 pt-4 sm:px-6">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="size-7 shrink-0 sm:size-8"
            aria-label="Recent transactions"
          >
            <ClipboardList className="text-muted-foreground size-4 sm:size-[18px]" />
          </Button>
          <span className="text-sm font-medium sm:text-base">
            Recent Transactions
          </span>
          <span className="ml-1 inline-flex items-center rounded-md bg-gray-50 px-2 py-1 text-[10px] font-medium text-gray-600 ring-1 ring-gray-500/10 ring-inset sm:text-xs dark:bg-gray-800/50 dark:text-gray-400 dark:ring-gray-400/20">
            {filteredOrders.length}
          </span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 sm:h-9 sm:gap-2"
            >
              <Filter className="size-3.5 sm:size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Filter</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[180px]">
            <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={statusFilter === "all"}
              onCheckedChange={() => setStatusFilter("all")}
            >
              All Statuses
            </DropdownMenuCheckboxItem>
            {orderStatuses.map((status) => (
              <DropdownMenuCheckboxItem
                key={status}
                checked={statusFilter === status}
                onCheckedChange={() => setStatusFilter(status)}
              >
                {status}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="px-4 pt-3 pb-4 sm:px-6">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="text-muted-foreground text-xs font-medium sm:text-sm">
                Order Ref
              </TableHead>
              <TableHead className="text-muted-foreground text-xs font-medium sm:text-sm">
                Buyer
              </TableHead>
              <TableHead className="text-muted-foreground text-xs font-medium sm:text-sm">
                Total
              </TableHead>
              <TableHead className="text-muted-foreground text-xs font-medium sm:text-sm">
                Status
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedOrders.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-muted-foreground h-20 text-center text-sm"
                >
                  No transactions found.
                </TableCell>
              </TableRow>
            ) : (
              paginatedOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="text-muted-foreground text-xs font-medium sm:text-sm">
                    {order.orderNumber}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs sm:text-sm">
                    {order.customer}
                  </TableCell>
                  <TableCell className="text-foreground text-xs tabular-nums sm:text-sm">
                    {currencyFormatter.format(order.total)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-md px-2 py-1 text-[10px] font-medium sm:text-xs",
                        statusStyles[order.status],
                      )}
                    >
                      {order.status}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="text-muted-foreground flex items-center justify-between border-t px-4 py-3 text-[10px] sm:px-6 sm:text-xs">
        <span>
          {startRow}-{endRow} of {filteredOrders.length}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="size-7"
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1}
            aria-label="Go to previous page"
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-7"
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            aria-label="Go to next page"
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
};

const RecentActivity = ({ className }: { className?: string }) => {
  return (
    <div className={cn("bg-card rounded-xl border", className)}>
      <div className="flex items-center justify-between gap-3 px-4 pt-4 sm:px-6">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="size-7 shrink-0 sm:size-8"
            aria-label="Recent activity"
          >
            <Bell className="text-muted-foreground size-4 sm:size-[18px]" />
          </Button>
          <span className="text-sm font-medium sm:text-base">
            Recent Activity
          </span>
        </div>
      </div>

      <ScrollArea className="h-[360px] px-4 pt-2 pb-4 text-xs sm:px-6 sm:text-sm">
        <div className="divide-y">
          {recentActivity.map((item) => (
            <div key={`${item.title}-${item.time}`} className="py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-foreground font-medium">
                  {item.title}
                </span>
                <span className="text-muted-foreground text-[10px] sm:text-xs">
                  {item.time}
                </span>
              </div>
              <span className="text-muted-foreground text-[10px] sm:text-xs">
                {item.detail}
              </span>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

const DashboardContent = () => {
  return (
    <main
      id="dashboard-main"
      tabIndex={-1}
      className="bg-background w-full flex-1 space-y-4 overflow-auto p-3 sm:space-y-6 sm:p-4 md:p-6"
    >
      <WelcomeSection />
      <StatsCards />
      <div className="flex flex-col gap-4 sm:gap-6 xl:flex-row">
        <RevenueFlowChart />
        <SideChartsSection />
      </div>
      <div className="flex flex-col gap-4 xl:flex-row">
        <RecentTransactionsTable className="flex-1" />
        <RecentActivity className="xl:w-[360px]" />
      </div>
    </main>
  );
};

export function EcommerceDashboard3({ className }: { className?: string }) {
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
