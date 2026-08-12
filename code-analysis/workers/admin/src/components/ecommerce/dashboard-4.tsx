/* eslint-disable @typescript-eslint/no-unused-vars, @next/next/no-img-element */
"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Box,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  CircleDollarSign,
  ClipboardList,
  Clock,
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
  ShoppingCart,
  Truck,
  User,
  Users,
  Wallet,
  X,
  XCircle,
} from "lucide-react";
import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
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

type TransactionStatus = "completed" | "pending" | "failed" | "refunded";

type TransactionType = "Sale" | "Refund" | "Subscription";

type Transaction = {
  id: string;
  txnId: string;
  amount: number;
  customerName: string;
  customerInitials: string;
  type: TransactionType;
  paymentMethod: "Credit Card" | "Debit Card" | "PayPal" | "Bank Transfer";
  date: string;
  status: TransactionStatus;
};

type PeriodKey = "30days" | "3months" | "1year";

type RevenueDataPoint = {
  month: string;
  revenue: number;
};

type CostDataPoint = {
  month: string;
  cogs: number;
  operatingExpenses: number;
};

type PeriodSummary = {
  total: number;
  change: number;
  isPositive: boolean;
};

type StatItem = {
  title: string;
  previousValue: number;
  value: number;
  changePercent: number;
  isPositive: boolean;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  format: "currency" | "percentage";
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const compactCurrencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 0,
});

const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const mixBase = "var(--background)";

const palette = {
  primary: "var(--primary)",
  secondary: {
    light: `color-mix(in oklch, var(--primary) 75%, ${mixBase})`,
    dark: `color-mix(in oklch, var(--primary) 85%, ${mixBase})`,
  },
};

const revenueChartConfig = {
  revenue: { label: "Revenue", color: palette.primary },
} satisfies ChartConfig;

const costsChartConfig = {
  cogs: { label: "COGS", color: palette.primary },
  operatingExpenses: {
    label: "Operating Expenses",
    theme: palette.secondary,
  },
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
      defaultOpen: true,
      items: [
        { label: "Overview", icon: Globe, href: "#" },
        { label: "Reports", icon: BarChart3, href: "#" },
        {
          label: "Finances",
          icon: Wallet,
          href: "#",
          isActive: true,
        },
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

const revenueData: Record<PeriodKey, RevenueDataPoint[]> = {
  "30days": [
    { month: "Week 1", revenue: 87500 },
    { month: "Week 2", revenue: 95200 },
    { month: "Week 3", revenue: 102800 },
    { month: "Week 4", revenue: 91400 },
    { month: "Week 5", revenue: 110600 },
  ],
  "3months": [
    { month: "Oct", revenue: 342000 },
    { month: "Nov", revenue: 378000 },
    { month: "Dec", revenue: 456000 },
    { month: "Jan", revenue: 398000 },
    { month: "Feb", revenue: 412000 },
    { month: "Mar", revenue: 445000 },
  ],
  "1year": [
    { month: "Jan", revenue: 285000 },
    { month: "Feb", revenue: 312000 },
    { month: "Mar", revenue: 338000 },
    { month: "Apr", revenue: 356000 },
    { month: "May", revenue: 342000 },
    { month: "Jun", revenue: 378000 },
    { month: "Jul", revenue: 395000 },
    { month: "Aug", revenue: 418000 },
    { month: "Sep", revenue: 432000 },
    { month: "Oct", revenue: 456000 },
    { month: "Nov", revenue: 478000 },
    { month: "Dec", revenue: 512000 },
  ],
};

const costsData: Record<PeriodKey, CostDataPoint[]> = {
  "30days": [
    { month: "Week 1", cogs: 31500, operatingExpenses: 18200 },
    { month: "Week 2", cogs: 34100, operatingExpenses: 19800 },
    { month: "Week 3", cogs: 37000, operatingExpenses: 20500 },
    { month: "Week 4", cogs: 32800, operatingExpenses: 19100 },
    { month: "Week 5", cogs: 39800, operatingExpenses: 21600 },
  ],
  "3months": [
    { month: "Oct", cogs: 123100, operatingExpenses: 68400 },
    { month: "Nov", cogs: 136100, operatingExpenses: 75600 },
    { month: "Dec", cogs: 164200, operatingExpenses: 91200 },
    { month: "Jan", cogs: 143300, operatingExpenses: 79600 },
    { month: "Feb", cogs: 148300, operatingExpenses: 82400 },
    { month: "Mar", cogs: 160200, operatingExpenses: 89000 },
  ],
  "1year": [
    { month: "Jan", cogs: 102600, operatingExpenses: 57000 },
    { month: "Feb", cogs: 112300, operatingExpenses: 62400 },
    { month: "Mar", cogs: 121700, operatingExpenses: 67600 },
    { month: "Apr", cogs: 128200, operatingExpenses: 71200 },
    { month: "May", cogs: 123100, operatingExpenses: 68400 },
    { month: "Jun", cogs: 136100, operatingExpenses: 75600 },
    { month: "Jul", cogs: 142200, operatingExpenses: 79000 },
    { month: "Aug", cogs: 150500, operatingExpenses: 83600 },
    { month: "Sep", cogs: 155500, operatingExpenses: 86400 },
    { month: "Oct", cogs: 164200, operatingExpenses: 91200 },
    { month: "Nov", cogs: 172100, operatingExpenses: 95600 },
    { month: "Dec", cogs: 184300, operatingExpenses: 102400 },
  ],
};

const revenueSummary: Record<PeriodKey, PeriodSummary> = {
  "30days": { total: 487500, change: 14.2, isPositive: true },
  "3months": { total: 2431000, change: 11.8, isPositive: true },
  "1year": { total: 4702000, change: 18.5, isPositive: true },
};

const costsSummary: Record<PeriodKey, PeriodSummary> = {
  "30days": { total: 274400, change: 8.6, isPositive: false },
  "3months": { total: 1361400, change: 9.3, isPositive: false },
  "1year": { total: 2705800, change: 12.1, isPositive: false },
};

const statsData: StatItem[] = [
  {
    title: "Gross Revenue",
    previousValue: 426800,
    value: 487500,
    changePercent: 14.2,
    isPositive: true,
    icon: CircleDollarSign,
    format: "currency",
  },
  {
    title: "Net Profit",
    previousValue: 168200,
    value: 213100,
    changePercent: 26.7,
    isPositive: true,
    icon: Wallet,
    format: "currency",
  },
  {
    title: "Refund Rate",
    previousValue: 0.042,
    value: 0.031,
    changePercent: 26.2,
    isPositive: true,
    icon: RotateCcw,
    format: "percentage",
  },
  {
    title: "Avg Transaction",
    previousValue: 68.4,
    value: 74.2,
    changePercent: 8.5,
    isPositive: true,
    icon: CreditCard,
    format: "currency",
  },
];

const transactionRecords: Transaction[] = [
  {
    id: "1",
    txnId: "TXN-100201",
    amount: 129.99,
    customerName: "Sarah Johnson",
    customerInitials: "SJ",
    type: "Sale",
    paymentMethod: "Credit Card",
    date: "Today",
    status: "completed",
  },
  {
    id: "2",
    txnId: "TXN-100202",
    amount: 84.5,
    customerName: "Michael Chen",
    customerInitials: "MC",
    type: "Sale",
    paymentMethod: "PayPal",
    date: "Today",
    status: "completed",
  },
  {
    id: "3",
    txnId: "TXN-100203",
    amount: 249.0,
    customerName: "Emma Wilson",
    customerInitials: "EW",
    type: "Subscription",
    paymentMethod: "Credit Card",
    date: "Today",
    status: "pending",
  },
  {
    id: "4",
    txnId: "TXN-100204",
    amount: 45.99,
    customerName: "James Rodriguez",
    customerInitials: "JR",
    type: "Refund",
    paymentMethod: "Debit Card",
    date: "Today",
    status: "refunded",
  },
  {
    id: "5",
    txnId: "TXN-100205",
    amount: 312.0,
    customerName: "Lisa Park",
    customerInitials: "LP",
    type: "Sale",
    paymentMethod: "Bank Transfer",
    date: "Today",
    status: "failed",
  },
  {
    id: "6",
    txnId: "TXN-100206",
    amount: 67.25,
    customerName: "David Kim",
    customerInitials: "DK",
    type: "Sale",
    paymentMethod: "Credit Card",
    date: "1 day ago",
    status: "completed",
  },
  {
    id: "7",
    txnId: "TXN-100207",
    amount: 189.99,
    customerName: "Anna Martinez",
    customerInitials: "AM",
    type: "Subscription",
    paymentMethod: "PayPal",
    date: "1 day ago",
    status: "completed",
  },
  {
    id: "8",
    txnId: "TXN-100208",
    amount: 95.0,
    customerName: "Robert Taylor",
    customerInitials: "RT",
    type: "Sale",
    paymentMethod: "Debit Card",
    date: "1 day ago",
    status: "pending",
  },
  {
    id: "9",
    txnId: "TXN-100209",
    amount: 156.5,
    customerName: "Jennifer Lee",
    customerInitials: "JL",
    type: "Refund",
    paymentMethod: "Credit Card",
    date: "1 day ago",
    status: "refunded",
  },
  {
    id: "10",
    txnId: "TXN-100210",
    amount: 78.99,
    customerName: "William Brown",
    customerInitials: "WB",
    type: "Sale",
    paymentMethod: "PayPal",
    date: "2 days ago",
    status: "completed",
  },
  {
    id: "11",
    txnId: "TXN-100211",
    amount: 425.0,
    customerName: "Sophia Davis",
    customerInitials: "SD",
    type: "Subscription",
    paymentMethod: "Credit Card",
    date: "2 days ago",
    status: "completed",
  },
  {
    id: "12",
    txnId: "TXN-100212",
    amount: 34.99,
    customerName: "Daniel Garcia",
    customerInitials: "DG",
    type: "Sale",
    paymentMethod: "Debit Card",
    date: "2 days ago",
    status: "failed",
  },
  {
    id: "13",
    txnId: "TXN-100213",
    amount: 210.0,
    customerName: "Olivia White",
    customerInitials: "OW",
    type: "Sale",
    paymentMethod: "Bank Transfer",
    date: "3 days ago",
    status: "completed",
  },
  {
    id: "14",
    txnId: "TXN-100214",
    amount: 149.99,
    customerName: "Thomas Anderson",
    customerInitials: "TA",
    type: "Sale",
    paymentMethod: "Credit Card",
    date: "3 days ago",
    status: "completed",
  },
  {
    id: "15",
    txnId: "TXN-100215",
    amount: 62.5,
    customerName: "Emily Thompson",
    customerInitials: "ET",
    type: "Refund",
    paymentMethod: "PayPal",
    date: "3 days ago",
    status: "refunded",
  },
  {
    id: "16",
    txnId: "TXN-100216",
    amount: 299.0,
    customerName: "Christopher Moore",
    customerInitials: "CM",
    type: "Subscription",
    paymentMethod: "Credit Card",
    date: "4 days ago",
    status: "completed",
  },
  {
    id: "17",
    txnId: "TXN-100217",
    amount: 88.75,
    customerName: "Isabella Jackson",
    customerInitials: "IJ",
    type: "Sale",
    paymentMethod: "Debit Card",
    date: "4 days ago",
    status: "pending",
  },
  {
    id: "18",
    txnId: "TXN-100218",
    amount: 175.0,
    customerName: "Matthew Harris",
    customerInitials: "MH",
    type: "Sale",
    paymentMethod: "Bank Transfer",
    date: "5 days ago",
    status: "completed",
  },
  {
    id: "19",
    txnId: "TXN-100219",
    amount: 42.99,
    customerName: "Ava Clark",
    customerInitials: "AC",
    type: "Sale",
    paymentMethod: "PayPal",
    date: "5 days ago",
    status: "failed",
  },
  {
    id: "20",
    txnId: "TXN-100220",
    amount: 520.0,
    customerName: "Joshua Lewis",
    customerInitials: "JL",
    type: "Subscription",
    paymentMethod: "Credit Card",
    date: "5 days ago",
    status: "completed",
  },
  {
    id: "21",
    txnId: "TXN-100221",
    amount: 37.5,
    customerName: "Mia Robinson",
    customerInitials: "MR",
    type: "Refund",
    paymentMethod: "Debit Card",
    date: "6 days ago",
    status: "refunded",
  },
  {
    id: "22",
    txnId: "TXN-100222",
    amount: 165.0,
    customerName: "Ethan Walker",
    customerInitials: "EW",
    type: "Sale",
    paymentMethod: "Credit Card",
    date: "6 days ago",
    status: "completed",
  },
  {
    id: "23",
    txnId: "TXN-100223",
    amount: 99.99,
    customerName: "Charlotte Hall",
    customerInitials: "CH",
    type: "Sale",
    paymentMethod: "PayPal",
    date: "7 days ago",
    status: "pending",
  },
  {
    id: "24",
    txnId: "TXN-100224",
    amount: 284.0,
    customerName: "Alexander Young",
    customerInitials: "AY",
    type: "Sale",
    paymentMethod: "Bank Transfer",
    date: "7 days ago",
    status: "completed",
  },
  {
    id: "25",
    txnId: "TXN-100225",
    amount: 55.99,
    customerName: "Amelia King",
    customerInitials: "AK",
    type: "Sale",
    paymentMethod: "Debit Card",
    date: "8 days ago",
    status: "completed",
  },
  {
    id: "26",
    txnId: "TXN-100226",
    amount: 399.0,
    customerName: "Benjamin Wright",
    customerInitials: "BW",
    type: "Subscription",
    paymentMethod: "Credit Card",
    date: "8 days ago",
    status: "completed",
  },
  {
    id: "27",
    txnId: "TXN-100227",
    amount: 72.25,
    customerName: "Harper Lopez",
    customerInitials: "HL",
    type: "Refund",
    paymentMethod: "PayPal",
    date: "9 days ago",
    status: "refunded",
  },
  {
    id: "28",
    txnId: "TXN-100228",
    amount: 198.0,
    customerName: "Lucas Hill",
    customerInitials: "LH",
    type: "Sale",
    paymentMethod: "Credit Card",
    date: "10 days ago",
    status: "failed",
  },
  {
    id: "29",
    txnId: "TXN-100229",
    amount: 145.5,
    customerName: "Evelyn Scott",
    customerInitials: "ES",
    type: "Sale",
    paymentMethod: "Debit Card",
    date: "10 days ago",
    status: "completed",
  },
  {
    id: "30",
    txnId: "TXN-100230",
    amount: 89.99,
    customerName: "Henry Green",
    customerInitials: "HG",
    type: "Sale",
    paymentMethod: "Bank Transfer",
    date: "12 days ago",
    status: "completed",
  },
  {
    id: "31",
    txnId: "TXN-100231",
    amount: 349.0,
    customerName: "Abigail Adams",
    customerInitials: "AA",
    type: "Subscription",
    paymentMethod: "Credit Card",
    date: "12 days ago",
    status: "completed",
  },
  {
    id: "32",
    txnId: "TXN-100232",
    amount: 27.99,
    customerName: "Sebastian Baker",
    customerInitials: "SB",
    type: "Sale",
    paymentMethod: "PayPal",
    date: "14 days ago",
    status: "pending",
  },
  {
    id: "33",
    txnId: "TXN-100233",
    amount: 462.0,
    customerName: "Ella Nelson",
    customerInitials: "EN",
    type: "Sale",
    paymentMethod: "Credit Card",
    date: "14 days ago",
    status: "completed",
  },
  {
    id: "34",
    txnId: "TXN-100234",
    amount: 58.5,
    customerName: "Jack Carter",
    customerInitials: "JC",
    type: "Refund",
    paymentMethod: "Debit Card",
    date: "15 days ago",
    status: "refunded",
  },
  {
    id: "35",
    txnId: "TXN-100235",
    amount: 225.0,
    customerName: "Scarlett Mitchell",
    customerInitials: "SM",
    type: "Sale",
    paymentMethod: "Bank Transfer",
    date: "16 days ago",
    status: "completed",
  },
  {
    id: "36",
    txnId: "TXN-100236",
    amount: 134.75,
    customerName: "Owen Perez",
    customerInitials: "OP",
    type: "Sale",
    paymentMethod: "Credit Card",
    date: "16 days ago",
    status: "completed",
  },
  {
    id: "37",
    txnId: "TXN-100237",
    amount: 499.0,
    customerName: "Grace Roberts",
    customerInitials: "GR",
    type: "Subscription",
    paymentMethod: "PayPal",
    date: "18 days ago",
    status: "completed",
  },
  {
    id: "38",
    txnId: "TXN-100238",
    amount: 82.0,
    customerName: "Liam Turner",
    customerInitials: "LT",
    type: "Sale",
    paymentMethod: "Debit Card",
    date: "18 days ago",
    status: "failed",
  },
  {
    id: "39",
    txnId: "TXN-100239",
    amount: 178.5,
    customerName: "Chloe Phillips",
    customerInitials: "CP",
    type: "Sale",
    paymentMethod: "Credit Card",
    date: "20 days ago",
    status: "completed",
  },
  {
    id: "40",
    txnId: "TXN-100240",
    amount: 93.99,
    customerName: "Noah Campbell",
    customerInitials: "NC",
    type: "Refund",
    paymentMethod: "Bank Transfer",
    date: "20 days ago",
    status: "refunded",
  },
  {
    id: "41",
    txnId: "TXN-100241",
    amount: 267.0,
    customerName: "Lily Parker",
    customerInitials: "LP",
    type: "Sale",
    paymentMethod: "Credit Card",
    date: "22 days ago",
    status: "completed",
  },
  {
    id: "42",
    txnId: "TXN-100242",
    amount: 149.0,
    customerName: "Mason Evans",
    customerInitials: "ME",
    type: "Subscription",
    paymentMethod: "PayPal",
    date: "22 days ago",
    status: "completed",
  },
  {
    id: "43",
    txnId: "TXN-100243",
    amount: 41.25,
    customerName: "Zoe Edwards",
    customerInitials: "ZE",
    type: "Sale",
    paymentMethod: "Debit Card",
    date: "25 days ago",
    status: "pending",
  },
  {
    id: "44",
    txnId: "TXN-100244",
    amount: 315.0,
    customerName: "Aiden Collins",
    customerInitials: "AC",
    type: "Sale",
    paymentMethod: "Credit Card",
    date: "25 days ago",
    status: "completed",
  },
  {
    id: "45",
    txnId: "TXN-100245",
    amount: 68.99,
    customerName: "Nora Stewart",
    customerInitials: "NS",
    type: "Sale",
    paymentMethod: "Bank Transfer",
    date: "28 days ago",
    status: "completed",
  },
  {
    id: "46",
    txnId: "TXN-100246",
    amount: 599.0,
    customerName: "Logan Sanchez",
    customerInitials: "LS",
    type: "Subscription",
    paymentMethod: "Credit Card",
    date: "28 days ago",
    status: "completed",
  },
  {
    id: "47",
    txnId: "TXN-100247",
    amount: 112.5,
    customerName: "Aria Morris",
    customerInitials: "AM",
    type: "Refund",
    paymentMethod: "PayPal",
    date: "30 days ago",
    status: "refunded",
  },
  {
    id: "48",
    txnId: "TXN-100248",
    amount: 246.0,
    customerName: "Carter Rogers",
    customerInitials: "CR",
    type: "Sale",
    paymentMethod: "Debit Card",
    date: "30 days ago",
    status: "failed",
  },
  {
    id: "49",
    txnId: "TXN-100249",
    amount: 79.99,
    customerName: "Penelope Reed",
    customerInitials: "PR",
    type: "Sale",
    paymentMethod: "Credit Card",
    date: "33 days ago",
    status: "completed",
  },
  {
    id: "50",
    txnId: "TXN-100250",
    amount: 189.0,
    customerName: "Caleb Cook",
    customerInitials: "CC",
    type: "Sale",
    paymentMethod: "Bank Transfer",
    date: "36 days ago",
    status: "completed",
  },
];

const PAGE_SIZE_OPTIONS = [5, 10, 20];

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
              aria-hidden="true"
              className="ml-auto size-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
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

const periodLabels: Record<PeriodKey, string> = {
  "1year": "1 Year",
  "3months": "3 Months",
  "30days": "30 Days",
};

const PeriodTabs = ({
  activePeriod,
  onPeriodChange,
}: {
  activePeriod: PeriodKey;
  onPeriodChange: (period: PeriodKey) => void;
}) => {
  return (
    <div className="bg-muted flex items-center gap-1 rounded-lg p-1">
      {(Object.keys(periodLabels) as PeriodKey[]).map((key) => (
        <button
          key={key}
          onClick={() => onPeriodChange(key)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-all sm:text-sm",
            activePeriod === key
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {periodLabels[key]}
        </button>
      ))}
    </div>
  );
};

function RevenueTooltip({
  active,
  payload,
  label,
}: Partial<TooltipContentProps<number, string>>) {
  if (!active || !payload?.length) return null;

  const value = payload[0]?.value || 0;

  return (
    <div className="border-border bg-popover rounded-lg border p-2 shadow-lg sm:p-3">
      <p className="text-foreground mb-1.5 text-xs font-medium sm:mb-2 sm:text-sm">
        {label}
      </p>
      <div className="flex items-center gap-1.5 sm:gap-2">
        <div className="bg-foreground size-2 rounded-full sm:size-2.5" />
        <span className="text-muted-foreground text-[10px] sm:text-sm">
          Revenue:
        </span>
        <span className="text-foreground text-[10px] font-medium sm:text-sm">
          {currencyFormatter.format(Number(value))}
        </span>
      </div>
    </div>
  );
}

const RevenueChart = ({ period }: { period: PeriodKey }) => {
  const data = revenueData[period];
  const summary = revenueSummary[period];

  return (
    <div className="bg-card flex min-w-0 flex-1 flex-col gap-4 rounded-xl border p-4 sm:gap-5 sm:p-5">
      <div className="flex flex-col gap-1">
        <p className="text-muted-foreground text-xs sm:text-sm">
          Revenue Overview
        </p>
        <div className="flex items-center gap-2">
          <p className="text-xl leading-tight font-semibold tracking-tight sm:text-2xl">
            {currencyFormatter.format(summary.total)}
          </p>
          <div className="flex items-center gap-0.5">
            {summary.isPositive ? (
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
                "text-xs font-medium",
                summary.isPositive ? "text-emerald-600" : "text-red-600",
              )}
            >
              {summary.isPositive ? "+" : "-"}
              {summary.change}%
            </span>
          </div>
        </div>
      </div>

      <div className="h-[180px] w-full min-w-0 sm:h-[220px]">
        <ChartContainer config={revenueChartConfig} className="h-full w-full">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--color-revenue)"
                  stopOpacity={0.15}
                />
                <stop
                  offset="100%"
                  stopColor="var(--color-revenue)"
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
              content={<RevenueTooltip />}
              cursor={{ strokeOpacity: 0.2 }}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="var(--color-revenue)"
              strokeWidth={2}
              fill="url(#revenueGradient)"
            />
          </AreaChart>
        </ChartContainer>
      </div>
    </div>
  );
};

function CostsTooltip({
  active,
  payload,
  label,
  colors,
}: Partial<TooltipContentProps<number, string>> & {
  colors: { primary: string; secondary: string };
}) {
  if (!active || !payload?.length) return null;

  const cogs = payload.find((p) => p.dataKey === "cogs")?.value || 0;
  const operatingExpenses =
    payload.find((p) => p.dataKey === "operatingExpenses")?.value || 0;
  const total = Number(cogs) + Number(operatingExpenses);

  return (
    <div className="border-border bg-popover rounded-lg border p-2 shadow-lg sm:p-3">
      <p className="text-foreground mb-1.5 text-xs font-medium sm:mb-2 sm:text-sm">
        {label}
      </p>
      <div className="space-y-1 sm:space-y-1.5">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div
            className="size-2 rounded-full sm:size-2.5"
            style={{ backgroundColor: colors.primary }}
          />
          <span className="text-muted-foreground text-[10px] sm:text-sm">
            COGS:
          </span>
          <span className="text-foreground text-[10px] font-medium sm:text-sm">
            {currencyFormatter.format(Number(cogs))}
          </span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div
            className="size-2 rounded-full sm:size-2.5"
            style={{ backgroundColor: colors.secondary }}
          />
          <span className="text-muted-foreground text-[10px] sm:text-sm">
            Operating:
          </span>
          <span className="text-foreground text-[10px] font-medium sm:text-sm">
            {currencyFormatter.format(Number(operatingExpenses))}
          </span>
        </div>
        <div className="border-border mt-1 border-t pt-1">
          <span className="text-foreground text-[10px] font-medium sm:text-xs">
            Total: {currencyFormatter.format(total)}
          </span>
        </div>
      </div>
    </div>
  );
}

const CostsChart = ({ period }: { period: PeriodKey }) => {
  const data = costsData[period];
  const summary = costsSummary[period];

  return (
    <div className="bg-card flex min-w-0 flex-1 flex-col gap-4 rounded-xl border p-4 sm:gap-5 sm:p-5">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-xs sm:text-sm">
            Costs Breakdown
          </p>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div
                className="size-2 rounded-full"
                style={{ backgroundColor: "var(--color-cogs)" }}
              />
              <span className="text-muted-foreground text-[10px] sm:text-xs">
                COGS
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div
                className="size-2 rounded-full"
                style={{ backgroundColor: "var(--color-operatingExpenses)" }}
              />
              <span className="text-muted-foreground text-[10px] sm:text-xs">
                Operating Expenses
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-xl leading-tight font-semibold tracking-tight sm:text-2xl">
            {currencyFormatter.format(summary.total)}
          </p>
          <div className="flex items-center gap-0.5">
            {summary.isPositive ? (
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
                "text-xs font-medium",
                summary.isPositive ? "text-emerald-600" : "text-red-600",
              )}
            >
              {summary.isPositive ? "+" : "-"}
              {summary.change}%
            </span>
          </div>
        </div>
      </div>

      <div className="h-[180px] w-full min-w-0 sm:h-[220px]">
        <ChartContainer config={costsChartConfig} className="h-full w-full">
          <BarChart data={data}>
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
                <CostsTooltip
                  colors={{
                    primary: "var(--color-cogs)",
                    secondary: "var(--color-operatingExpenses)",
                  }}
                />
              }
              cursor={{ fillOpacity: 0.05 }}
            />
            <Bar
              dataKey="cogs"
              stackId="costs"
              fill="var(--color-cogs)"
              radius={[0, 0, 0, 0]}
            />
            <Bar
              dataKey="operatingExpenses"
              stackId="costs"
              fill="var(--color-operatingExpenses)"
              radius={[3, 3, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </div>
    </div>
  );
};

const StatsCards = () => {
  return (
    <div className="bg-card grid grid-cols-2 gap-3 rounded-xl border p-4 sm:gap-4 sm:p-5 lg:grid-cols-4 lg:gap-6 lg:p-6">
      {statsData.map((stat, index) => {
        const formatter =
          stat.format === "currency" ? currencyFormatter : percentFormatter;

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

const transactionStatusStyles: Record<TransactionStatus, string> = {
  completed:
    "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-900/30 dark:text-emerald-400 dark:ring-emerald-400/20",
  pending:
    "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-900/30 dark:text-amber-400 dark:ring-amber-400/20",
  failed:
    "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20 dark:bg-red-900/30 dark:text-red-400 dark:ring-red-400/20",
  refunded:
    "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-700/10 dark:bg-blue-900/30 dark:text-blue-400 dark:ring-blue-400/20",
};

const transactionStatusIcons: Record<
  TransactionStatus,
  React.ComponentType<React.SVGProps<SVGSVGElement>>
> = {
  completed: CheckCircle2,
  pending: Clock,
  failed: XCircle,
  refunded: RotateCcw,
};

const transactionStatusLabels: Record<TransactionStatus, string> = {
  completed: "Completed",
  pending: "Pending",
  failed: "Failed",
  refunded: "Refunded",
};

const allTransactionStatuses: TransactionStatus[] = [
  "completed",
  "pending",
  "failed",
  "refunded",
];

const allPaymentMethods = [
  "Credit Card",
  "Debit Card",
  "PayPal",
  "Bank Transfer",
] as const;

const dateFilterOptions = [
  { label: "All", value: "all" },
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "Last 7 days", value: "7days" },
  { label: "Last 30 days", value: "30days" },
];

const filterChipClassName =
  "inline-flex h-5 cursor-pointer items-center gap-1 rounded-md bg-gray-50 px-2 text-[10px] font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10 sm:h-6 sm:text-xs dark:bg-gray-800/50 dark:text-gray-400 dark:ring-gray-400/20";

const TransactionsTable = () => {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [dateFilter, setDateFilter] = React.useState<string>("all");
  const [paymentMethodFilter, setPaymentMethodFilter] =
    React.useState<string>("all");
  const [currentPage, setCurrentPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);
  const [isHydrated, setIsHydrated] = React.useState(false);

  const hasActiveFilters =
    statusFilter !== "all" ||
    dateFilter !== "all" ||
    paymentMethodFilter !== "all";

  const clearFilters = () => {
    setStatusFilter("all");
    setDateFilter("all");
    setPaymentMethodFilter("all");
  };

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setSearchQuery(params.get("q") ?? "");

    const nextStatus = params.get("status");
    if (
      nextStatus &&
      (nextStatus === "all" ||
        allTransactionStatuses.includes(nextStatus as TransactionStatus))
    ) {
      setStatusFilter(nextStatus);
    }

    const nextDate = params.get("date");
    if (
      nextDate &&
      dateFilterOptions.some((option) => option.value === nextDate)
    ) {
      setDateFilter(nextDate);
    }

    const nextPayment = params.get("payment");
    if (
      nextPayment &&
      (nextPayment === "all" ||
        allPaymentMethods.includes(
          nextPayment as (typeof allPaymentMethods)[number],
        ))
    ) {
      setPaymentMethodFilter(nextPayment);
    }

    const nextPage = Number(params.get("page"));
    if (!Number.isNaN(nextPage) && nextPage > 0) {
      setCurrentPage(nextPage);
    }

    const nextPageSize = Number(params.get("pageSize"));
    if (
      !Number.isNaN(nextPageSize) &&
      PAGE_SIZE_OPTIONS.includes(nextPageSize)
    ) {
      setPageSize(nextPageSize);
    }

    setIsHydrated(true);
  }, []);

  const filteredTransactions = React.useMemo(() => {
    const query = searchQuery.toLowerCase();
    return transactionRecords.filter((txn) => {
      const matchesSearch =
        txn.txnId.toLowerCase().includes(query) ||
        txn.customerName.toLowerCase().includes(query);

      const matchesStatus =
        statusFilter === "all" || txn.status === statusFilter;

      const matchesPaymentMethod =
        paymentMethodFilter === "all" ||
        txn.paymentMethod === paymentMethodFilter;

      let matchesDate = true;
      const pd = txn.date.toLowerCase();
      switch (dateFilter) {
        case "today":
          matchesDate = pd === "today";
          break;
        case "yesterday":
          matchesDate = pd === "1 day ago";
          break;
        case "7days":
          matchesDate =
            pd === "today" ||
            pd.includes("day ago") ||
            (pd.includes("days ago") && parseInt(pd) <= 7);
          break;
        case "30days":
          matchesDate =
            pd === "today" ||
            pd.includes("day ago") ||
            (pd.includes("days ago") && parseInt(pd) <= 30);
          break;
      }

      return (
        matchesSearch && matchesStatus && matchesPaymentMethod && matchesDate
      );
    });
  }, [searchQuery, statusFilter, dateFilter, paymentMethodFilter]);

  const totalPages = Math.ceil(filteredTransactions.length / pageSize);

  const paginatedTransactions = React.useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredTransactions.slice(startIndex, endIndex);
  }, [filteredTransactions, currentPage, pageSize]);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, dateFilter, paymentMethodFilter, pageSize]);

  React.useEffect(() => {
    if (!isHydrated || typeof window === "undefined") return;
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

    if (dateFilter !== "all") {
      params.set("date", dateFilter);
    } else {
      params.delete("date");
    }

    if (paymentMethodFilter !== "all") {
      params.set("payment", paymentMethodFilter);
    } else {
      params.delete("payment");
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
  }, [
    searchQuery,
    statusFilter,
    dateFilter,
    paymentMethodFilter,
    currentPage,
    pageSize,
    isHydrated,
  ]);

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
            aria-label="Transactions"
          >
            <ShoppingCart className="text-muted-foreground size-4 sm:size-[18px]" />
          </Button>
          <span className="text-sm font-medium sm:text-base">Transactions</span>
          <span className="ml-1 inline-flex items-center rounded-md bg-gray-50 px-2 py-1 text-[10px] font-medium text-gray-600 ring-1 ring-gray-500/10 ring-inset sm:text-xs dark:bg-gray-800/50 dark:text-gray-400 dark:ring-gray-400/20">
            {filteredTransactions.length}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 sm:flex-none">
            <Search
              className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2 sm:size-5"
              aria-hidden="true"
            />
            <Input
              type="search"
              name="transactions-search"
              inputMode="search"
              autoComplete="off"
              aria-label="Search transactions"
              placeholder="Search transactions… (e.g., TXN-100201)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-full pl-9 text-sm sm:h-9 sm:w-[160px] sm:pl-10 lg:w-[200px]"
            />
          </div>

          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger
              className="h-8 w-[120px] text-xs sm:h-9 sm:w-[140px] sm:text-sm"
              aria-label="Filter by date"
            >
              <SelectValue placeholder="Date" />
            </SelectTrigger>
            <SelectContent>
              {dateFilterOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-8 gap-1.5 sm:h-9 sm:gap-2",
                  statusFilter !== "all" && "border-primary",
                )}
                aria-label="Filter by status"
              >
                <Filter className="size-3.5 sm:size-4" aria-hidden="true" />
                <span className="hidden sm:inline">Status</span>
                {statusFilter !== "all" && (
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
              {allTransactionStatuses.map((status) => (
                <DropdownMenuCheckboxItem
                  key={status}
                  checked={statusFilter === status}
                  onCheckedChange={() => setStatusFilter(status)}
                >
                  {transactionStatusLabels[status]}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-8 gap-1.5 sm:h-9 sm:gap-2",
                  paymentMethodFilter !== "all" && "border-primary",
                )}
                aria-label="Filter by payment method"
              >
                <Wallet className="size-3.5 sm:size-4" aria-hidden="true" />
                <span className="hidden sm:inline">Method</span>
                {paymentMethodFilter !== "all" && (
                  <span className="bg-primary size-1.5 rounded-full sm:size-2" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[200px]">
              <DropdownMenuLabel>Payment Method</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={paymentMethodFilter === "all"}
                onCheckedChange={() => setPaymentMethodFilter("all")}
              >
                All Methods
              </DropdownMenuCheckboxItem>
              {allPaymentMethods.map((method) => (
                <DropdownMenuCheckboxItem
                  key={method}
                  checked={paymentMethodFilter === method}
                  onCheckedChange={() => setPaymentMethodFilter(method)}
                >
                  {method}
                </DropdownMenuCheckboxItem>
              ))}
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
              className={filterChipClassName}
              onClick={() => setStatusFilter("all")}
              aria-label={`Clear ${transactionStatusLabels[statusFilter as TransactionStatus]} filter`}
            >
              {transactionStatusLabels[statusFilter as TransactionStatus]}
              <X className="size-2.5 sm:size-3" aria-hidden="true" />
            </button>
          )}
          {dateFilter !== "all" && (
            <button
              type="button"
              className={filterChipClassName}
              onClick={() => setDateFilter("all")}
              aria-label={`Clear ${dateFilterOptions.find((o) => o.value === dateFilter)?.label} filter`}
            >
              {dateFilterOptions.find((o) => o.value === dateFilter)?.label}
              <X className="size-2.5 sm:size-3" aria-hidden="true" />
            </button>
          )}
          {paymentMethodFilter !== "all" && (
            <button
              type="button"
              className={filterChipClassName}
              onClick={() => setPaymentMethodFilter("all")}
              aria-label={`Clear ${paymentMethodFilter} filter`}
            >
              {paymentMethodFilter}
              <X className="size-2.5 sm:size-3" aria-hidden="true" />
            </button>
          )}
          <button
            onClick={clearFilters}
            className="text-destructive text-[10px] hover:underline sm:text-xs"
          >
            Clear all
          </button>
        </div>
      )}

      <div className="overflow-x-auto px-3 pb-3 sm:px-6 sm:pb-4">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="text-muted-foreground min-w-[100px] text-xs font-medium sm:text-sm">
                Transaction ID
              </TableHead>
              <TableHead className="text-muted-foreground hidden min-w-[140px] text-xs font-medium sm:text-sm md:table-cell">
                Customer
              </TableHead>
              <TableHead className="text-muted-foreground min-w-[100px] text-xs font-medium sm:text-sm">
                Amount
              </TableHead>
              <TableHead className="text-muted-foreground hidden min-w-[100px] text-xs font-medium sm:text-sm lg:table-cell">
                Type
              </TableHead>
              <TableHead className="text-muted-foreground hidden min-w-[120px] text-xs font-medium sm:text-sm md:table-cell">
                Payment Method
              </TableHead>
              <TableHead className="text-muted-foreground hidden text-xs font-medium sm:table-cell sm:text-sm">
                Date
              </TableHead>
              <TableHead className="text-muted-foreground min-w-[100px] text-xs font-medium sm:text-sm">
                Status
              </TableHead>
              <TableHead className="w-[40px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedTransactions.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-muted-foreground h-24 text-center text-sm"
                >
                  No transactions found matching your filters.
                </TableCell>
              </TableRow>
            ) : (
              paginatedTransactions.map((txn) => {
                const StatusIcon = transactionStatusIcons[txn.status];
                return (
                  <TableRow key={txn.id}>
                    <TableCell className="text-xs font-medium sm:text-sm">
                      {txn.txnId}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex items-center gap-2">
                        <Avatar className="bg-muted size-6">
                          <AvatarFallback className="text-muted-foreground text-[8px] font-semibold uppercase">
                            {txn.customerInitials}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-muted-foreground text-xs sm:text-sm">
                          {txn.customerName}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-foreground text-xs tabular-nums sm:text-sm">
                      {currencyFormatter.format(txn.amount)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="text-muted-foreground inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-normal sm:text-xs">
                        {txn.type}
                      </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-muted-foreground inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-normal sm:text-xs">
                        {txn.paymentMethod}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-xs sm:table-cell sm:text-sm">
                      {txn.date}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium sm:text-xs",
                          transactionStatusStyles[txn.status],
                        )}
                      >
                        <StatusIcon className="size-3" aria-hidden="true" />
                        {transactionStatusLabels[txn.status]}
                      </span>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-foreground size-7 sm:size-8"
                            aria-label={`Open actions for ${txn.txnId}`}
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
                            <Pencil
                              className="mr-2 size-4"
                              aria-hidden="true"
                            />
                            Edit Transaction
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
                                "Void this transaction? This cannot be undone.",
                              );
                            }}
                          >
                            <X className="mr-2 size-4" aria-hidden="true" />
                            Void Transaction
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
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
            <SelectTrigger className="h-8 w-[70px]">
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
            {filteredTransactions.length === 0
              ? "0"
              : `${(currentPage - 1) * pageSize + 1}-${Math.min(
                  currentPage * pageSize,
                  filteredTransactions.length,
                )}`}{" "}
            of {filteredTransactions.length}
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
            disabled={currentPage === totalPages || totalPages === 0}
            aria-label="Go to next page"
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => goToPage(totalPages)}
            disabled={currentPage === totalPages || totalPages === 0}
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
  const [period, setPeriod] = React.useState<PeriodKey>("1year");

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const nextPeriod = params.get("period");
    if (
      nextPeriod === "1year" ||
      nextPeriod === "3months" ||
      nextPeriod === "30days"
    ) {
      setPeriod(nextPeriod);
    }
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (period !== "1year") {
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

  return (
    <main
      id="dashboard-main"
      tabIndex={-1}
      className="bg-background w-full flex-1 space-y-4 overflow-auto p-3 sm:space-y-6 sm:p-4 md:p-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PeriodTabs activePeriod={period} onPeriodChange={setPeriod} />
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
          <Button
            size="sm"
            className="h-8 gap-2 sm:h-9"
            aria-label="New Transaction"
          >
            <Plus className="size-4" />
            <span className="hidden sm:inline">New Transaction</span>
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:gap-6 lg:flex-row">
        <RevenueChart period={period} />
        <CostsChart period={period} />
      </div>

      <StatsCards />

      <TransactionsTable />
    </main>
  );
};

export function EcommerceDashboard4({ className }: { className?: string }) {
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
