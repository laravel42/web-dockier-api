/* eslint-disable @typescript-eslint/no-unused-vars, @next/next/no-img-element */
"use client";

import {
  BarChart3,
  Bell,
  Box,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  ClipboardList,
  Copy,
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
  RotateCcw,
  Search,
  Settings,
  Truck,
  User,
  Users,
  X,
} from "lucide-react";
import * as React from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
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
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  date: Date;
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
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
const dateFormatter = new Intl.DateTimeFormat("en-US", {
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

function getCategoryColor(
  config: (typeof categoryChartConfig)[keyof typeof categoryChartConfig],
): string {
  if ("color" in config && config.color) return config.color;
  if ("theme" in config && config.theme) {
    const theme = config.theme as { light: string; dark: string };
    return theme.light;
  }
  return "var(--primary)";
}

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
    date: new Date(2024, 0, 28),
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
    date: new Date(2024, 0, 27),
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
    date: new Date(2024, 0, 27),
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
    date: new Date(2024, 0, 26),
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
    date: new Date(2024, 0, 26),
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
    date: new Date(2024, 0, 25),
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
    date: new Date(2024, 0, 25),
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
    date: new Date(2024, 0, 24),
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
    date: new Date(2024, 0, 24),
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
    date: new Date(2024, 0, 23),
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
    date: new Date(2024, 0, 23),
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
    date: new Date(2024, 0, 22),
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
    date: new Date(2024, 0, 22),
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
    date: new Date(2024, 0, 21),
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
    date: new Date(2024, 0, 21),
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
    date: new Date(2024, 0, 20),
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
    date: new Date(2024, 0, 20),
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
    date: new Date(2024, 0, 19),
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
    date: new Date(2024, 0, 19),
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
    date: new Date(2024, 0, 18),
  },
];

const PAGE_SIZE_OPTIONS = [10, 25, 50];

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

const StatsCardsGrid = () => {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {statsGridData.map((stat) => {
        const isPositive = stat.invertColor ? stat.change < 0 : stat.change > 0;

        return (
          <div
            key={stat.label}
            className="bg-card flex flex-col rounded-xl border p-4 sm:p-5"
          >
            <span className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {formatStatValue(stat)}
            </span>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-muted-foreground text-xs sm:text-sm">
                {stat.label}
              </span>
              <span
                className={cn(
                  "text-[10px] font-medium sm:text-xs",
                  isPositive
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400",
                )}
              >
                {stat.change > 0 ? "+" : ""}
                {stat.change.toFixed(1)}%
              </span>
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
                  style={{ backgroundColor: getCategoryColor(config) }}
                  aria-hidden="true"
                />
                <span className="text-muted-foreground text-[10px]">
                  {config.label}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div
          className="bg-muted/50 flex items-center gap-0.5 rounded-lg border p-0.5"
          role="tablist"
          aria-label="Category performance period"
        >
          <button
            onClick={() => setTab("week")}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-colors",
              tab === "week"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            id="category-tab-week"
            role="tab"
            aria-selected={tab === "week"}
            aria-controls="category-chart-panel"
            aria-label="Show week view"
          >
            Week
          </button>
          <button
            onClick={() => setTab("month")}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-colors",
              tab === "month"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            id="category-tab-month"
            role="tab"
            aria-selected={tab === "month"}
            aria-controls="category-chart-panel"
            aria-label="Show month view"
          >
            Month
          </button>
        </div>
      </div>

      <div
        id="category-chart-panel"
        role="tabpanel"
        aria-labelledby={
          tab === "week" ? "category-tab-week" : "category-tab-month"
        }
        className="h-[240px] w-full min-w-0 sm:h-[280px]"
      >
        <ChartContainer config={categoryChartConfig} className="h-full w-full">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
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
              type="linear"
              dataKey="electronics"
              stroke="var(--color-electronics)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
            <Line
              type="linear"
              dataKey="clothing"
              stroke="var(--color-clothing)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
            <Line
              type="linear"
              dataKey="homeGarden"
              stroke="var(--color-homeGarden)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
            <Line
              type="linear"
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
                  {dateFormatter.format(row.shipped)}
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

const tableHeadClass = "text-xs font-medium text-muted-foreground sm:text-sm";

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
            <ClipboardList
              className="text-muted-foreground size-4 sm:size-[18px]"
              aria-hidden="true"
            />
          </Button>
          <h2 className="text-sm font-medium text-pretty sm:text-base">
            Recent Orders
          </h2>
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
              <X className="size-2.5 sm:size-3" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      <div className="overflow-x-auto px-3 pb-3 sm:px-6 sm:pb-4">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className={cn("w-[40px]", tableHeadClass)}>
                #
              </TableHead>
              <TableHead className={cn("min-w-[160px]", tableHeadClass)}>
                Order
              </TableHead>
              <TableHead
                className={cn(
                  "hidden min-w-[140px] md:table-cell",
                  tableHeadClass,
                )}
              >
                Customer
              </TableHead>
              <TableHead className={cn("min-w-[100px]", tableHeadClass)}>
                Status
              </TableHead>
              <TableHead className={cn("min-w-[90px]", tableHeadClass)}>
                Total
              </TableHead>
              <TableHead className={cn("hidden sm:table-cell", tableHeadClass)}>
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
                    {dateFormatter.format(order.date)}
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
                          <MoreHorizontal
                            className="size-3.5 sm:size-4"
                            aria-hidden="true"
                          />
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
            <ChevronsLeft className="size-4" aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1}
            aria-label="Go to previous page"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
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
                  aria-label={`Go to page ${pageNum}`}
                  aria-current={currentPage === pageNum ? "page" : undefined}
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
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => goToPage(totalPages)}
            disabled={currentPage === totalPages}
            aria-label="Go to last page"
          >
            <ChevronsRight className="size-4" aria-hidden="true" />
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
      className="bg-background w-full flex-1 space-y-4 overflow-auto p-3 sm:p-4 md:p-6"
    >
      <StatsCardsGrid />
      <div className="flex flex-col gap-4 xl:flex-row">
        <CategoryPerformanceChart />
        <FulfillmentPanel />
      </div>
      <RecentOrdersTable />
    </main>
  );
};

export function EcommerceDashboard6({ className }: { className?: string }) {
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
