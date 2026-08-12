/* eslint-disable @typescript-eslint/no-unused-vars, @next/next/no-img-element */
"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Box,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  CircleDollarSign,
  ClipboardList,
  Copy,
  CreditCard,
  Download,
  Eye,
  Filter,
  Globe,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Truck,
  User,
  Users,
  Wallet,
  X,
} from "lucide-react";
import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Tooltip,
  TooltipContentProps,
  XAxis,
  YAxis,
} from "recharts";

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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

type Segment = {
  name: string;
  value: number;
  color: string;
};

type Channel = {
  name: string;
  number: number;
  changePercent: number;
  isPositive: boolean;
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

const segments: Segment[] = [
  { name: "Online", value: 62000, color: palette.primary },
  { name: "In-Store", value: 24000, color: palette.secondary.light },
  { name: "Marketplace", value: 12300, color: palette.tertiary.light },
];

const channelsData: Channel[] = [
  { name: "Website", number: 4821, changePercent: 18.3, isPositive: true },
  { name: "Mobile App", number: 3147, changePercent: 12.7, isPositive: true },
  { name: "Email", number: 1893, changePercent: 8.4, isPositive: false },
  { name: "Social", number: 762, changePercent: 31.2, isPositive: true },
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
  if (period === "6months") {
    return fullYearData.slice(0, 6);
  }
  return fullYearData;
}

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

const PAGE_SIZE_OPTIONS = [10, 25, 50];

const revenueChartConfig = {
  thisYear: { label: "This Year", color: palette.primary },
  prevYear: { label: "Previous Year", theme: palette.secondary },
} satisfies ChartConfig;

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
  const hasChildren = (item.children?.length ?? 0) > 0;

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
    <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4 lg:gap-6">
      {statsData.map((stat) => {
        const formatter =
          stat.format === "currency" ? currencyFormatter : numberFormatter;

        return (
          <div
            key={stat.title}
            className="bg-card flex flex-col gap-3 rounded-xl border p-4 sm:p-5 lg:p-6"
          >
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
                <ArrowUpRight className="size-3 shrink-0 text-emerald-600 sm:size-3.5" />
              ) : (
                <ArrowDownRight className="size-3 shrink-0 text-red-600 sm:size-3.5" />
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
        );
      })}
    </div>
  );
};

const SegmentationPanel = () => {
  const { active: activeSegment, handleHover } = useHoverHighlight<string>();
  const totalRevenue = segments.reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="bg-card flex min-w-0 flex-col rounded-xl border xl:w-[410px]">
      <div className="flex h-14 items-center px-4 sm:px-5">
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="icon"
            className="size-7 sm:size-8"
            aria-label="Revenue Channels"
          >
            <Users
              className="text-muted-foreground size-4 sm:size-[18px]"
              aria-hidden="true"
            />
          </Button>
          <h2 className="text-sm font-medium text-pretty sm:text-base">
            Revenue Channels
          </h2>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold sm:text-3xl">
            {compactCurrencyFormatter.format(totalRevenue)}
          </span>
          <span className="text-muted-foreground text-sm">total revenue</span>
        </div>

        <div className="flex h-2.5 gap-1 sm:h-3">
          {segments.map((segment, index) => (
            <ShadTooltipProvider key={segment.name}>
              <ShadTooltip>
                <ShadTooltipTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "h-full border-0 p-0 transition-opacity duration-200 motion-reduce:transition-none",
                      index === 0 && "rounded-l-full",
                      index === segments.length - 1 && "rounded-r-full",
                      activeSegment !== null &&
                        activeSegment !== segment.name &&
                        "opacity-40",
                    )}
                    style={{
                      flex: segment.value,
                      backgroundColor: segment.color,
                    }}
                    onPointerEnter={() => handleHover(segment.name)}
                    onPointerLeave={() => handleHover(null)}
                    onFocus={() => handleHover(segment.name)}
                    onBlur={() => handleHover(null)}
                    aria-label={`${segment.name}: ${currencyFormatter.format(segment.value)} (${Math.round((segment.value / totalRevenue) * 100)}%)`}
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
                        style={{ backgroundColor: segment.color }}
                      />
                      <span className="font-medium">{segment.name}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {Math.round((segment.value / totalRevenue) * 100)}%
                      </span>
                    </div>
                    <span className="text-muted-foreground tabular-nums">
                      {currencyFormatter.format(segment.value)}
                    </span>
                  </div>
                </ShadTooltipContent>
              </ShadTooltip>
            </ShadTooltipProvider>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 sm:gap-5">
          {segments.map((segment) => (
            <ShadTooltipProvider key={segment.name}>
              <ShadTooltip>
                <ShadTooltipTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "flex items-center gap-1.5 border-0 bg-transparent p-0 transition-opacity duration-200 motion-reduce:transition-none",
                      activeSegment !== null &&
                        activeSegment !== segment.name &&
                        "opacity-40",
                    )}
                    onPointerEnter={() => handleHover(segment.name)}
                    onPointerLeave={() => handleHover(null)}
                    onFocus={() => handleHover(segment.name)}
                    onBlur={() => handleHover(null)}
                  >
                    <span
                      className="size-2 rounded-full sm:size-2.5"
                      style={{ backgroundColor: segment.color }}
                    />
                    <span className="text-muted-foreground text-xs">
                      {segment.name}
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
                        style={{ backgroundColor: segment.color }}
                      />
                      <span className="font-medium">{segment.name}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {Math.round((segment.value / totalRevenue) * 100)}%
                      </span>
                    </div>
                    <span className="text-muted-foreground tabular-nums">
                      {currencyFormatter.format(segment.value)}
                    </span>
                  </div>
                </ShadTooltipContent>
              </ShadTooltip>
            </ShadTooltipProvider>
          ))}
        </div>

        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-4">
          <span className="text-muted-foreground text-xs">Channels</span>
          <span className="text-muted-foreground text-xs">Number</span>
          <span className="text-muted-foreground text-xs">Total</span>
        </div>

        <div className="flex flex-col gap-3">
          {channelsData.map((channel) => (
            <div
              key={channel.name}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-4"
            >
              <div className="flex items-center gap-2.5">
                <div className="bg-muted flex size-7 items-center justify-center rounded-full">
                  <span className="text-muted-foreground text-xs font-medium">
                    {channel.name[0]}
                  </span>
                </div>
                <span className="text-sm font-medium">{channel.name}</span>
              </div>
              <span className="text-sm tabular-nums">
                {numberFormatter.format(channel.number)}
              </span>
              <div
                className={cn(
                  "flex items-center gap-0.5 text-xs",
                  channel.isPositive ? "text-emerald-600" : "text-red-600",
                )}
              >
                {channel.isPositive ? (
                  <ArrowUpRight className="size-3.5" />
                ) : (
                  <ArrowDownRight className="size-3.5" />
                )}
                {channel.changePercent}%
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
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

const RecentOrdersTable = () => {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [currentPage, setCurrentPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);
  const [isHydrated, setIsHydrated] = React.useState(false);
  const skipNextReset = React.useRef(true);

  const hasActiveFilters = statusFilter !== "all";

  const clearFilters = () => {
    setStatusFilter("all");
  };

  const filteredOrders = React.useMemo(() => {
    return orders.filter((order) => {
      const matchesSearch =
        order.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.customer.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === "all" || order.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [searchQuery, statusFilter]);

  const totalPages = Math.ceil(filteredOrders.length / pageSize);

  const paginatedOrders = React.useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredOrders.slice(startIndex, endIndex);
  }, [filteredOrders, currentPage, pageSize]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const statusParam = params.get("status");
    const pageParam = Number.parseInt(params.get("page") ?? "", 10);
    const pageSizeParam = Number.parseInt(params.get("pageSize") ?? "", 10);

    setSearchQuery(params.get("q") ?? "");
    setStatusFilter(
      statusParam && orderStatuses.includes(statusParam as OrderStatus)
        ? statusParam
        : "all",
    );
    setCurrentPage(Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1);
    setPageSize(PAGE_SIZE_OPTIONS.includes(pageSizeParam) ? pageSizeParam : 10);
    setIsHydrated(true);
  }, []);

  React.useEffect(() => {
    if (!isHydrated) return;
    if (skipNextReset.current) {
      skipNextReset.current = false;
      return;
    }
    setCurrentPage(1);
  }, [searchQuery, statusFilter, pageSize, isHydrated]);

  React.useEffect(() => {
    if (!isHydrated) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);

    if (searchQuery) {
      params.set("q", searchQuery);
    } else {
      params.delete("q");
    }

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

    if (pageSize !== PAGE_SIZE_OPTIONS[0]) {
      params.set("pageSize", String(pageSize));
    } else {
      params.delete("pageSize");
    }

    const nextQuery = params.toString();
    const nextUrl = nextQuery
      ? `${window.location.pathname}?${nextQuery}`
      : window.location.pathname;
    window.history.replaceState(null, "", nextUrl);
  }, [searchQuery, statusFilter, currentPage, pageSize, isHydrated]);

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  return (
    <div className="bg-card rounded-xl border">
      <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:gap-4 sm:px-6 sm:py-3.5">
        <div className="flex flex-1 items-center gap-2 sm:gap-2.5">
          <Button
            variant="outline"
            size="icon"
            className="size-7 shrink-0 sm:size-8"
            aria-label="Recent orders"
          >
            <ClipboardList className="text-muted-foreground size-4 sm:size-[18px]" />
          </Button>
          <span className="text-sm font-medium sm:text-base">
            Recent Orders
          </span>
          <span className="ml-1 inline-flex items-center rounded-md bg-gray-50 px-2 py-1 text-[10px] font-medium text-gray-600 ring-1 ring-gray-500/10 ring-inset sm:text-xs dark:bg-gray-800/50 dark:text-gray-400 dark:ring-gray-400/20">
            {filteredOrders.length}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 sm:flex-none">
            <Search
              className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2 sm:size-5"
              aria-hidden="true"
            />
            <Input
              placeholder="Search orders… (e.g., ORD-2024-002)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              name="orders-search"
              inputMode="search"
              autoComplete="off"
              aria-label="Search orders"
              className="h-8 w-full pl-9 text-sm sm:h-9 sm:w-[160px] sm:pl-10 lg:w-[200px]"
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-8 gap-1.5 sm:h-9 sm:gap-2",
                  hasActiveFilters && "border-primary",
                )}
                aria-label="Filter orders"
              >
                <Filter className="size-3.5 sm:size-4" aria-hidden="true" />
                <span className="hidden sm:inline">Filter</span>
                {hasActiveFilters && (
                  <span className="bg-primary size-1.5 rounded-full sm:size-2" />
                )}
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

              {hasActiveFilters && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={clearFilters}
                    className="text-destructive"
                  >
                    <X className="mr-2 size-4" aria-hidden="true" />
                    Clear filters
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 px-3 pb-3 sm:px-6">
          <span className="text-muted-foreground text-[10px] sm:text-xs">
            Filters:
          </span>
          {statusFilter !== "all" && (
            <button
              type="button"
              className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-gray-50 px-2 py-1 text-[10px] font-medium text-gray-600 ring-1 ring-gray-500/10 ring-inset sm:text-xs dark:bg-gray-800/50 dark:text-gray-400 dark:ring-gray-400/20"
              onClick={() => setStatusFilter("all")}
              aria-label={`Clear ${statusFilter} filter`}
            >
              {statusFilter}
              <X className="size-2.5 sm:size-3" />
            </button>
          )}
        </div>
      )}

      <div className="overflow-x-auto px-3 pb-3 sm:px-6 sm:pb-4">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="text-muted-foreground w-[40px] text-xs font-medium sm:text-sm">
                #
              </TableHead>
              <TableHead className="text-muted-foreground min-w-[160px] text-xs font-medium sm:text-sm">
                Order
              </TableHead>
              <TableHead className="text-muted-foreground hidden min-w-[140px] text-xs font-medium sm:text-sm md:table-cell">
                Customer
              </TableHead>
              <TableHead className="text-muted-foreground min-w-[100px] text-xs font-medium sm:text-sm">
                Status
              </TableHead>
              <TableHead className="text-muted-foreground min-w-[90px] text-xs font-medium sm:text-sm">
                Total
              </TableHead>
              <TableHead className="text-muted-foreground hidden text-xs font-medium sm:table-cell sm:text-sm">
                Date
              </TableHead>
              <TableHead className="w-[40px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedOrders.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-muted-foreground h-24 text-center text-sm"
                >
                  No orders found matching your filters.
                </TableCell>
              </TableRow>
            ) : (
              paginatedOrders.map((order, index) => (
                <TableRow key={order.id}>
                  <TableCell className="text-xs font-medium sm:text-sm">
                    {(currentPage - 1) * pageSize + index + 1}
                  </TableCell>
                  <TableCell>
                    <div className="min-w-0">
                      <span className="block truncate text-xs font-medium sm:text-sm">
                        {order.orderNumber}
                      </span>
                      <span className="text-muted-foreground text-[10px] sm:text-xs">
                        {order.productCount}{" "}
                        {order.productCount === 1 ? "item" : "items"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex items-center gap-2">
                      <Avatar className="bg-muted size-6">
                        <AvatarFallback className="text-muted-foreground text-[8px] font-semibold uppercase">
                          {order.customerInitials}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-muted-foreground text-xs sm:text-sm">
                        {order.customer}
                      </span>
                    </div>
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
                  <TableCell className="text-foreground text-xs tabular-nums sm:text-sm">
                    {currencyFormatter.format(order.total)}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden text-xs sm:table-cell sm:text-sm">
                    {order.date}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-foreground size-7 sm:size-8"
                          aria-label={`Open actions for ${order.orderNumber}`}
                        >
                          <MoreHorizontal className="size-3.5 sm:size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                          <Eye className="mr-2 size-4" aria-hidden="true" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Pencil className="mr-2 size-4" aria-hidden="true" />
                          Edit Order
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Copy className="mr-2 size-4" aria-hidden="true" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onSelect={(event) => {
                            event.preventDefault();
                            if (typeof window === "undefined") return;
                            window.confirm(
                              "Cancel this order? This cannot be undone.",
                            );
                          }}
                        >
                          <X className="mr-2 size-4" aria-hidden="true" />
                          Cancel Order
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col items-center justify-between gap-3 border-t px-3 py-3 sm:flex-row sm:px-6">
        <div className="text-muted-foreground flex items-center gap-2 text-xs sm:text-sm">
          <span className="hidden sm:inline">Rows per page:</span>
          <Select
            value={pageSize.toString()}
            onValueChange={(value) => setPageSize(Number(value))}
          >
            <SelectTrigger className="h-8 w-[70px]" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={size.toString()}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground">
            {(currentPage - 1) * pageSize + 1}-
            {Math.min(currentPage * pageSize, filteredOrders.length)} of{" "}
            {filteredOrders.length}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => goToPage(1)}
            disabled={currentPage === 1}
            aria-label="Go to first page"
          >
            <ChevronsLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1}
            aria-label="Go to previous page"
          >
            <ChevronLeft className="size-4" />
          </Button>

          <div className="flex items-center gap-1 px-2">
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }

              return (
                <Button
                  key={pageNum}
                  variant={currentPage === pageNum ? "default" : "ghost"}
                  size="icon"
                  className="size-8"
                  onClick={() => goToPage(pageNum)}
                >
                  {pageNum}
                </Button>
              );
            })}
          </div>

          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            aria-label="Go to next page"
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => goToPage(totalPages)}
            disabled={currentPage === totalPages}
            aria-label="Go to last page"
          >
            <ChevronsRight className="size-4" />
          </Button>
        </div>
      </div>
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
        <SegmentationPanel />
      </div>
      <RecentOrdersTable />
    </main>
  );
};

export function EcommerceDashboard2({ className }: { className?: string }) {
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
