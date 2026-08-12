"use client";

import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Ellipsis,
  Plus,
  Search,
  Settings2,
  Store,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type OrderTab = "all" | "unfulfilled" | "paid";
type DateRangeFilter = "all" | "last-3-days" | "last-7-days";
type SortKey =
  | "orderId"
  | "total"
  | "customerName"
  | "orderDateValue"
  | "channel";
type SortDirection = "asc" | "desc";
type PaymentStatus = "Paid" | "Pending" | "Canceled";
type FulfillmentStatus = "Fulfilled" | "Unfulfilled";
type ColumnKey =
  | "orderId"
  | "total"
  | "status"
  | "customer"
  | "orderDate"
  | "channel";
type PaymentStatusFilter = "all" | PaymentStatus;
type FulfillmentStatusFilter = "all" | FulfillmentStatus;

export type EcommerceOrderList1SearchParams = {
  columns?: string | string[];
  direction?: string | string[];
  fulfillment?: string | string[];
  payment?: string | string[];
  query?: string | string[];
  range?: string | string[];
  sort?: string | string[];
  tab?: string | string[];
};

type OrderRow = {
  id: string;
  orderId: string;
  total: number;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  customerName: string;
  customerCode: string;
  orderDateLabel: string;
  orderDateValue: number;
  channel: string;
  needsAttention?: boolean;
};

const orders: OrderRow[] = [
  {
    id: "order-01",
    orderId: "ORD-34021",
    total: 1248.5,
    paymentStatus: "Paid",
    fulfillmentStatus: "Unfulfilled",
    customerName: "Maya Collins",
    customerCode: "CUS-812",
    orderDateLabel: "Tue 18 Mar, 2026",
    orderDateValue: 20260318,
    channel: "Online Store",
    needsAttention: true,
  },
  {
    id: "order-02",
    orderId: "ORD-34020",
    total: 486.75,
    paymentStatus: "Paid",
    fulfillmentStatus: "Unfulfilled",
    customerName: "Jordan Reyes",
    customerCode: "CUS-447",
    orderDateLabel: "Tue 18 Mar, 2026",
    orderDateValue: 20260318,
    channel: "Subscription",
    needsAttention: true,
  },
  {
    id: "order-03",
    orderId: "ORD-34019",
    total: 0,
    paymentStatus: "Canceled",
    fulfillmentStatus: "Unfulfilled",
    customerName: "Elaine Wu",
    customerCode: "CUS-229",
    orderDateLabel: "Mon 17 Mar, 2026",
    orderDateValue: 20260317,
    channel: "Retail Partner",
  },
  {
    id: "order-04",
    orderId: "ORD-34018",
    total: 932.4,
    paymentStatus: "Paid",
    fulfillmentStatus: "Fulfilled",
    customerName: "Noah Bennett",
    customerCode: "CUS-590",
    orderDateLabel: "Sun 16 Mar, 2026",
    orderDateValue: 20260316,
    channel: "Online Store",
  },
  {
    id: "order-05",
    orderId: "ORD-34017",
    total: 211.3,
    paymentStatus: "Paid",
    fulfillmentStatus: "Unfulfilled",
    customerName: "Priya Menon",
    customerCode: "CUS-731",
    orderDateLabel: "Sun 16 Mar, 2026",
    orderDateValue: 20260316,
    channel: "Marketplace",
    needsAttention: true,
  },
  {
    id: "order-06",
    orderId: "ORD-34016",
    total: 3150.2,
    paymentStatus: "Pending",
    fulfillmentStatus: "Unfulfilled",
    customerName: "Omar Haddad",
    customerCode: "CUS-144",
    orderDateLabel: "Sat 15 Mar, 2026",
    orderDateValue: 20260315,
    channel: "Wholesale",
    needsAttention: true,
  },
  {
    id: "order-07",
    orderId: "ORD-34015",
    total: 128.9,
    paymentStatus: "Paid",
    fulfillmentStatus: "Unfulfilled",
    customerName: "Lena Hart",
    customerCode: "CUS-963",
    orderDateLabel: "Sat 15 Mar, 2026",
    orderDateValue: 20260315,
    channel: "Online Store",
    needsAttention: true,
  },
  {
    id: "order-08",
    orderId: "ORD-34014",
    total: 764.2,
    paymentStatus: "Paid",
    fulfillmentStatus: "Unfulfilled",
    customerName: "Tobias Green",
    customerCode: "CUS-308",
    orderDateLabel: "Fri 14 Mar, 2026",
    orderDateValue: 20260314,
    channel: "Retail POS",
  },
  {
    id: "order-09",
    orderId: "ORD-34013",
    total: 542.1,
    paymentStatus: "Paid",
    fulfillmentStatus: "Unfulfilled",
    customerName: "Sofia Alvarez",
    customerCode: "CUS-625",
    orderDateLabel: "Fri 14 Mar, 2026",
    orderDateValue: 20260314,
    channel: "Marketplace",
    needsAttention: true,
  },
  {
    id: "order-10",
    orderId: "ORD-34012",
    total: 97.5,
    paymentStatus: "Paid",
    fulfillmentStatus: "Fulfilled",
    customerName: "Nina Park",
    customerCode: "CUS-518",
    orderDateLabel: "Thu 13 Mar, 2026",
    orderDateValue: 20260313,
    channel: "Subscription",
  },
  {
    id: "order-11",
    orderId: "ORD-34011",
    total: 166.4,
    paymentStatus: "Paid",
    fulfillmentStatus: "Fulfilled",
    customerName: "Caleb Moore",
    customerCode: "CUS-277",
    orderDateLabel: "Thu 13 Mar, 2026",
    orderDateValue: 20260313,
    channel: "Wholesale",
  },
  {
    id: "order-12",
    orderId: "ORD-34010",
    total: 0,
    paymentStatus: "Canceled",
    fulfillmentStatus: "Unfulfilled",
    customerName: "Harper James",
    customerCode: "CUS-804",
    orderDateLabel: "Wed 12 Mar, 2026",
    orderDateValue: 20260312,
    channel: "Retail Partner",
  },
];

const orderTabs: OrderTab[] = ["all", "unfulfilled", "paid"];
const dateRangeFilters: DateRangeFilter[] = [
  "all",
  "last-3-days",
  "last-7-days",
];
const paymentStatusOptions = ["all", "Paid", "Pending", "Canceled"];
const fulfillmentOptions = ["all", "Fulfilled", "Unfulfilled"];
const orderSortKeys: SortKey[] = [
  "orderId",
  "total",
  "customerName",
  "orderDateValue",
  "channel",
];
const orderColumnKeys: ColumnKey[] = [
  "orderId",
  "total",
  "status",
  "customer",
  "orderDate",
  "channel",
];
const defaultVisibleColumns: Record<ColumnKey, boolean> = {
  orderId: true,
  total: true,
  status: true,
  customer: true,
  orderDate: true,
  channel: true,
};
const dateRangeOptions = [
  { value: "all", label: "All time", maxDays: Number.POSITIVE_INFINITY },
  { value: "last-3-days", label: "Last 3 days", maxDays: 3 },
  { value: "last-7-days", label: "Last 7 days", maxDays: 7 },
] as const;

function parseDateValue(dateValue: number) {
  const year = Math.trunc(dateValue / 10000);
  const month = Math.trunc((dateValue % 10000) / 100) - 1;
  const day = dateValue % 100;

  return new Date(year, month, day);
}

const latestOrderDate = Math.max(
  ...orders.map((order) => order.orderDateValue),
);

function getRelativeOrderAgeInDays(dateValue: number) {
  const millisecondsPerDay = 1000 * 60 * 60 * 24;

  return Math.round(
    (parseDateValue(latestOrderDate).getTime() -
      parseDateValue(dateValue).getTime()) /
      millisecondsPerDay,
  );
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

type OrderListState = {
  dateRange: DateRangeFilter;
  fulfillmentStatus: FulfillmentStatusFilter;
  paymentStatus: PaymentStatusFilter;
  search: string;
  sortDirection: SortDirection;
  sortKey: SortKey;
  tab: OrderTab;
  visibleColumns: Record<ColumnKey, boolean>;
};

function getSearchParamValue(
  source: EcommerceOrderList1SearchParams | URLSearchParams | undefined,
  key: keyof EcommerceOrderList1SearchParams,
) {
  if (!source) return undefined;
  if (source instanceof URLSearchParams) {
    return source.get(key) ?? undefined;
  }

  const value = source[key];
  return Array.isArray(value) ? value[0] : value;
}

function isSortKey(value: string | undefined): value is SortKey {
  return typeof value === "string" && orderSortKeys.includes(value as SortKey);
}

function isSortDirection(value: string | undefined): value is SortDirection {
  return value === "asc" || value === "desc";
}

function isColumnKey(value: string): value is ColumnKey {
  return orderColumnKeys.includes(value as ColumnKey);
}

function parseVisibleColumns(
  value: string | undefined,
): Record<ColumnKey, boolean> {
  if (!value) return { ...defaultVisibleColumns };

  if (value === "none") {
    return orderColumnKeys.reduce(
      (columns, column) => ({ ...columns, [column]: false }),
      {} as Record<ColumnKey, boolean>,
    );
  }

  const selectedColumns = value.split(",").filter(isColumnKey);

  if (selectedColumns.length === 0) {
    return { ...defaultVisibleColumns };
  }

  return orderColumnKeys.reduce(
    (columns, column) => ({
      ...columns,
      [column]: selectedColumns.includes(column),
    }),
    {} as Record<ColumnKey, boolean>,
  );
}

function getInitialOrderListState(
  searchParams?: EcommerceOrderList1SearchParams | URLSearchParams,
): OrderListState {
  const tab = getSearchParamValue(searchParams, "tab");
  const query = getSearchParamValue(searchParams, "query") ?? "";
  const range = getSearchParamValue(searchParams, "range");
  const payment = getSearchParamValue(searchParams, "payment");
  const fulfillment = getSearchParamValue(searchParams, "fulfillment");
  const sort = getSearchParamValue(searchParams, "sort");
  const direction = getSearchParamValue(searchParams, "direction");
  const columns = getSearchParamValue(searchParams, "columns");

  return {
    tab: tab && orderTabs.includes(tab as OrderTab) ? (tab as OrderTab) : "all",
    search: query,
    dateRange:
      range && dateRangeFilters.includes(range as DateRangeFilter)
        ? (range as DateRangeFilter)
        : "all",
    paymentStatus:
      payment && paymentStatusOptions.includes(payment)
        ? (payment as PaymentStatusFilter)
        : "all",
    fulfillmentStatus:
      fulfillment && fulfillmentOptions.includes(fulfillment)
        ? (fulfillment as FulfillmentStatusFilter)
        : "all",
    sortKey: isSortKey(sort) ? sort : "orderDateValue",
    sortDirection: isSortDirection(direction) ? direction : "desc",
    visibleColumns: parseVisibleColumns(columns),
  };
}

function getVisibleColumnsQuery(
  visibleColumns: Record<ColumnKey, boolean>,
): string | undefined {
  const selectedColumns = orderColumnKeys.filter(
    (column) => visibleColumns[column],
  );

  if (selectedColumns.length === orderColumnKeys.length) {
    return undefined;
  }

  if (selectedColumns.length === 0) {
    return "none";
  }

  return selectedColumns.join(",");
}

function SortHeader({
  label,
  active,
  direction,
  onClick,
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs font-medium"
    >
      <span>{label}</span>
      <ChevronDown
        className={cn(
          "size-3 transition-transform",
          active && direction === "asc" && "rotate-180",
        )}
      />
    </button>
  );
}

function OrderActions({ orderId }: { orderId: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground size-8 rounded-full"
          aria-label={`Open actions for ${orderId}`}
        >
          <Ellipsis className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem asChild>
          <Link href="/ecommerce/order-detail-1">View Order</Link>
        </DropdownMenuItem>
        <DropdownMenuItem>Mark Fulfilled</DropdownMenuItem>
        <DropdownMenuItem>Print Invoice</DropdownMenuItem>
        <DropdownMenuItem>Contact Customer</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StatusBadges({
  paymentStatus,
  fulfillmentStatus,
}: {
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge
        variant="secondary"
        className={cn(
          "font-normal",
          paymentStatus === "Paid" &&
            "bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
          paymentStatus === "Pending" &&
            "bg-amber-50 text-amber-700 hover:bg-amber-50",
          paymentStatus === "Canceled" &&
            "bg-rose-50 text-rose-700 hover:bg-rose-50",
        )}
      >
        {paymentStatus === "Canceled" ? (
          <XCircle className="mr-1 size-3.5" />
        ) : (
          <CheckCircle2 className="mr-1 size-3.5" />
        )}
        {paymentStatus}
      </Badge>
      <Badge
        variant="secondary"
        className={cn(
          "font-normal",
          fulfillmentStatus === "Fulfilled" &&
            "bg-blue-50 text-blue-700 hover:bg-blue-50",
          fulfillmentStatus === "Unfulfilled" &&
            "bg-slate-100 text-slate-700 hover:bg-slate-100",
        )}
      >
        {fulfillmentStatus}
      </Badge>
    </div>
  );
}

function ChannelCell({ channel }: { channel: string }) {
  return (
    <div className="border-border/70 text-muted-foreground inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs">
      <Store className="size-3.5" />
      <span className="truncate">{channel}</span>
    </div>
  );
}

function MobileOrderCard({ order }: { order: OrderRow }) {
  return (
    <article className="border-border/70 bg-card rounded-2xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {order.needsAttention && (
              <span className="size-2 rounded-full bg-rose-500" />
            )}
            <Link
              href="/ecommerce/order-detail-1"
              className="truncate text-base font-medium hover:underline"
            >
              {order.orderId}
            </Link>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {order.customerName}
          </p>
        </div>
        <OrderActions orderId={order.orderId} />
      </div>

      <div className="mt-4">
        <StatusBadges
          paymentStatus={order.paymentStatus}
          fulfillmentStatus={order.fulfillmentStatus}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Total</span>
          <span className="text-sm font-medium">
            {currencyFormatter.format(order.total)}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Customer</span>
          <span className="text-sm font-medium">{order.customerCode}</span>
        </div>
        <div className="col-span-2 flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Order date</span>
          <span className="text-sm">{order.orderDateLabel}</span>
        </div>
      </div>

      <div className="mt-4">
        <ChannelCell channel={order.channel} />
      </div>
    </article>
  );
}

export function EcommerceOrderList1({
  initialSearchParams,
}: {
  initialSearchParams?: EcommerceOrderList1SearchParams;
}) {
  const initialState = React.useMemo(
    () => getInitialOrderListState(initialSearchParams),
    [initialSearchParams],
  );
  const [tab, setTab] = React.useState<OrderTab>(initialState.tab);
  const [search, setSearch] = React.useState(initialState.search);
  const [dateRange, setDateRange] = React.useState<DateRangeFilter>(
    initialState.dateRange,
  );
  const [paymentStatus, setPaymentStatus] = React.useState<PaymentStatusFilter>(
    initialState.paymentStatus,
  );
  const [fulfillmentStatus, setFulfillmentStatus] =
    React.useState<FulfillmentStatusFilter>(initialState.fulfillmentStatus);
  const [sortKey, setSortKey] = React.useState<SortKey>(initialState.sortKey);
  const [sortDirection, setSortDirection] = React.useState<SortDirection>(
    initialState.sortDirection,
  );
  const [visibleColumns, setVisibleColumns] = React.useState<
    Record<ColumnKey, boolean>
  >(initialState.visibleColumns);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const syncStateFromUrl = () => {
      const nextState = getInitialOrderListState(
        new URLSearchParams(window.location.search),
      );

      setTab(nextState.tab);
      setSearch(nextState.search);
      setDateRange(nextState.dateRange);
      setPaymentStatus(nextState.paymentStatus);
      setFulfillmentStatus(nextState.fulfillmentStatus);
      setSortKey(nextState.sortKey);
      setSortDirection(nextState.sortDirection);
      setVisibleColumns(nextState.visibleColumns);
    };

    window.addEventListener("popstate", syncStateFromUrl);
    return () => window.removeEventListener("popstate", syncStateFromUrl);
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);

    if (tab !== "all") {
      params.set("tab", tab);
    } else {
      params.delete("tab");
    }

    if (search.trim()) {
      params.set("query", search.trim());
    } else {
      params.delete("query");
    }

    if (dateRange !== "all") {
      params.set("range", dateRange);
    } else {
      params.delete("range");
    }

    if (paymentStatus !== "all") {
      params.set("payment", paymentStatus);
    } else {
      params.delete("payment");
    }

    if (fulfillmentStatus !== "all") {
      params.set("fulfillment", fulfillmentStatus);
    } else {
      params.delete("fulfillment");
    }

    if (sortKey !== "orderDateValue") {
      params.set("sort", sortKey);
    } else {
      params.delete("sort");
    }

    if (sortDirection !== "desc") {
      params.set("direction", sortDirection);
    } else {
      params.delete("direction");
    }

    const visibleColumnsQuery = getVisibleColumnsQuery(visibleColumns);
    if (visibleColumnsQuery) {
      params.set("columns", visibleColumnsQuery);
    } else {
      params.delete("columns");
    }

    const nextQuery = params.toString();
    const nextUrl = nextQuery
      ? `${window.location.pathname}?${nextQuery}`
      : window.location.pathname;

    window.history.replaceState(window.history.state, "", nextUrl);
  }, [
    dateRange,
    fulfillmentStatus,
    paymentStatus,
    search,
    sortDirection,
    sortKey,
    tab,
    visibleColumns,
  ]);

  const visibleColumnCount = React.useMemo(
    () => orderColumnKeys.filter((column) => visibleColumns[column]).length,
    [visibleColumns],
  );
  const tableColSpan = visibleColumnCount + 1;

  const filteredOrders = React.useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const selectedDateRange =
      dateRangeOptions.find((option) => option.value === dateRange) ??
      dateRangeOptions[0];

    const nextOrders = orders.filter((order) => {
      const matchesTab =
        tab === "all" ||
        (tab === "unfulfilled" && order.fulfillmentStatus === "Unfulfilled") ||
        (tab === "paid" && order.paymentStatus === "Paid");

      const matchesSearch =
        normalizedSearch.length === 0 ||
        [
          order.orderId,
          order.customerName,
          order.customerCode,
          order.channel,
          order.paymentStatus,
          order.fulfillmentStatus,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);

      const matchesDate =
        getRelativeOrderAgeInDays(order.orderDateValue) <=
        selectedDateRange.maxDays;

      const matchesPayment =
        paymentStatus === "all" || order.paymentStatus === paymentStatus;

      const matchesFulfillment =
        fulfillmentStatus === "all" ||
        order.fulfillmentStatus === fulfillmentStatus;

      return (
        matchesTab &&
        matchesSearch &&
        matchesDate &&
        matchesPayment &&
        matchesFulfillment
      );
    });

    nextOrders.sort((left, right) => {
      const modifier = sortDirection === "asc" ? 1 : -1;

      if (sortKey === "total" || sortKey === "orderDateValue") {
        return (left[sortKey] - right[sortKey]) * modifier;
      }

      return left[sortKey].localeCompare(right[sortKey]) * modifier;
    });

    return nextOrders;
  }, [
    dateRange,
    fulfillmentStatus,
    paymentStatus,
    search,
    sortDirection,
    sortKey,
    tab,
  ]);

  function handleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection(nextKey === "orderDateValue" ? "desc" : "asc");
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-col p-6 md:p-8">
        <div className="flex flex-col gap-4 pb-8 md:hidden">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-foreground font-medium">Acme Store</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-foreground font-medium">Orders</span>
          </div>

          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-medium tracking-tight">Orders List</h1>
            <p className="text-muted-foreground text-sm">
              Track payments, fulfillment, and customer activity.
            </p>
          </div>

          <Button className="h-11 w-full rounded-xl px-5 shadow-none" asChild>
            <Link href="/ecommerce/add-order">
              <Plus className="size-4" aria-hidden="true" />
              Create Order
            </Link>
          </Button>
        </div>

        <div className="hidden gap-4 pb-8 md:flex lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-medium tracking-tight">Orders List</h1>
            <p className="text-muted-foreground text-sm">
              Track payments, fulfillment, and customer activity.
            </p>
          </div>

          <Button className="h-10 rounded-md px-5 shadow-none" asChild>
            <Link href="/ecommerce/add-order">
              <Plus className="size-4" aria-hidden="true" />
              Create Order
            </Link>
          </Button>
        </div>

        <div className="flex flex-col">
          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value as OrderTab)}
            className="pt-2 pb-1"
          >
            <div className="border-b">
              <TabsList className="h-auto bg-transparent p-0">
                <TabsTrigger
                  value="all"
                  className="data-[state=active]:border-foreground rounded-none border-b-2 border-transparent px-1 pt-0 pb-3 text-sm data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  All Orders
                </TabsTrigger>
                <TabsTrigger
                  value="unfulfilled"
                  className="data-[state=active]:border-foreground rounded-none border-b-2 border-transparent px-4 pt-0 pb-3 text-sm data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  Unfulfilled
                </TabsTrigger>
                <TabsTrigger
                  value="paid"
                  className="data-[state=active]:border-foreground rounded-none border-b-2 border-transparent px-4 pt-0 pb-3 text-sm data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  Paid
                </TabsTrigger>
              </TabsList>
            </div>
          </Tabs>

          <div className="flex flex-col gap-4 pt-3 md:hidden">
            <div className="relative">
              <Search
                className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
                aria-hidden="true"
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                type="search"
                placeholder="Search orders"
                aria-label="Search orders"
                className="h-12 rounded-2xl pl-9"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Select
                value={dateRange}
                onValueChange={(value) =>
                  setDateRange(value as DateRangeFilter)
                }
              >
                <SelectTrigger
                  className="h-11 rounded-2xl"
                  aria-label="Filter orders by date range"
                >
                  <div className="flex items-center gap-2">
                    <CalendarDays className="size-4" aria-hidden="true" />
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {dateRangeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={paymentStatus}
                onValueChange={(value) =>
                  setPaymentStatus(value as PaymentStatusFilter)
                }
              >
                <SelectTrigger
                  className="h-11 rounded-2xl"
                  aria-label="Filter orders by payment status"
                >
                  <SelectValue placeholder="Payment Status" />
                </SelectTrigger>
                <SelectContent>
                  {paymentStatusOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option === "all" ? "Payment Status" : option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={fulfillmentStatus}
                onValueChange={(value) =>
                  setFulfillmentStatus(value as FulfillmentStatusFilter)
                }
              >
                <SelectTrigger
                  className="h-11 rounded-2xl"
                  aria-label="Filter orders by fulfillment status"
                >
                  <SelectValue placeholder="Fulfillment" />
                </SelectTrigger>
                <SelectContent>
                  {fulfillmentOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option === "all" ? "Fulfillment" : option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-11 w-full rounded-2xl">
                  <Settings2 className="size-4" />
                  Manage Table
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuCheckboxItem
                  checked={visibleColumns.orderId}
                  onCheckedChange={(checked) =>
                    setVisibleColumns((current) => ({
                      ...current,
                      orderId: !!checked,
                    }))
                  }
                >
                  Order ID
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={visibleColumns.total}
                  onCheckedChange={(checked) =>
                    setVisibleColumns((current) => ({
                      ...current,
                      total: !!checked,
                    }))
                  }
                >
                  Total
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={visibleColumns.status}
                  onCheckedChange={(checked) =>
                    setVisibleColumns((current) => ({
                      ...current,
                      status: !!checked,
                    }))
                  }
                >
                  Status
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={visibleColumns.customer}
                  onCheckedChange={(checked) =>
                    setVisibleColumns((current) => ({
                      ...current,
                      customer: !!checked,
                    }))
                  }
                >
                  Customer
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={visibleColumns.orderDate}
                  onCheckedChange={(checked) =>
                    setVisibleColumns((current) => ({
                      ...current,
                      orderDate: !!checked,
                    }))
                  }
                >
                  Order Date
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={visibleColumns.channel}
                  onCheckedChange={(checked) =>
                    setVisibleColumns((current) => ({
                      ...current,
                      channel: !!checked,
                    }))
                  }
                >
                  Channels
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="hidden gap-4 pt-2 md:flex md:flex-col lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search
                  className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
                  aria-hidden="true"
                />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  type="search"
                  placeholder="Search orders"
                  aria-label="Search orders"
                  className="h-10 w-[220px] rounded-lg pl-9"
                />
              </div>

              <Select
                value={dateRange}
                onValueChange={(value) =>
                  setDateRange(value as DateRangeFilter)
                }
              >
                <SelectTrigger
                  className="h-10 w-[150px] rounded-lg"
                  aria-label="Filter orders by date range"
                >
                  <div className="flex items-center gap-2">
                    <CalendarDays className="size-4" aria-hidden="true" />
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {dateRangeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={paymentStatus}
                onValueChange={(value) =>
                  setPaymentStatus(value as PaymentStatusFilter)
                }
              >
                <SelectTrigger
                  className="h-10 w-[160px] rounded-lg"
                  aria-label="Filter orders by payment status"
                >
                  <SelectValue placeholder="Payment Status" />
                </SelectTrigger>
                <SelectContent>
                  {paymentStatusOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option === "all" ? "Payment Status" : option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={fulfillmentStatus}
                onValueChange={(value) =>
                  setFulfillmentStatus(value as FulfillmentStatusFilter)
                }
              >
                <SelectTrigger
                  className="h-10 w-[150px] rounded-lg"
                  aria-label="Filter orders by fulfillment status"
                >
                  <SelectValue placeholder="Fulfillment" />
                </SelectTrigger>
                <SelectContent>
                  {fulfillmentOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option === "all" ? "Fulfillment" : option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-10 rounded-lg px-4">
                  <Settings2 className="size-4" />
                  Manage Table
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuCheckboxItem
                  checked={visibleColumns.orderId}
                  onCheckedChange={(checked) =>
                    setVisibleColumns((current) => ({
                      ...current,
                      orderId: !!checked,
                    }))
                  }
                >
                  Order ID
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={visibleColumns.total}
                  onCheckedChange={(checked) =>
                    setVisibleColumns((current) => ({
                      ...current,
                      total: !!checked,
                    }))
                  }
                >
                  Total
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={visibleColumns.status}
                  onCheckedChange={(checked) =>
                    setVisibleColumns((current) => ({
                      ...current,
                      status: !!checked,
                    }))
                  }
                >
                  Status
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={visibleColumns.customer}
                  onCheckedChange={(checked) =>
                    setVisibleColumns((current) => ({
                      ...current,
                      customer: !!checked,
                    }))
                  }
                >
                  Customer
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={visibleColumns.orderDate}
                  onCheckedChange={(checked) =>
                    setVisibleColumns((current) => ({
                      ...current,
                      orderDate: !!checked,
                    }))
                  }
                >
                  Order Date
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={visibleColumns.channel}
                  onCheckedChange={(checked) =>
                    setVisibleColumns((current) => ({
                      ...current,
                      channel: !!checked,
                    }))
                  }
                >
                  Channels
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex flex-col gap-4 pt-3 md:hidden">
          {filteredOrders.length > 0 ? (
            filteredOrders.map((order) => (
              <MobileOrderCard key={order.id} order={order} />
            ))
          ) : (
            <div className="border-border/70 text-muted-foreground flex min-h-40 items-center justify-center rounded-2xl border border-dashed text-center text-sm">
              No orders found.
            </div>
          )}
        </div>

        <div className="hidden overflow-x-auto pt-3 md:block">
          <Table className="min-w-[1040px]">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                {visibleColumns.orderId && (
                  <TableHead>
                    <SortHeader
                      label="Order ID"
                      active={sortKey === "orderId"}
                      direction={sortDirection}
                      onClick={() => handleSort("orderId")}
                    />
                  </TableHead>
                )}
                {visibleColumns.total && (
                  <TableHead>
                    <SortHeader
                      label="Total"
                      active={sortKey === "total"}
                      direction={sortDirection}
                      onClick={() => handleSort("total")}
                    />
                  </TableHead>
                )}
                {visibleColumns.status && <TableHead>Status</TableHead>}
                {visibleColumns.customer && (
                  <TableHead>
                    <SortHeader
                      label="Customer"
                      active={sortKey === "customerName"}
                      direction={sortDirection}
                      onClick={() => handleSort("customerName")}
                    />
                  </TableHead>
                )}
                {visibleColumns.orderDate && (
                  <TableHead>
                    <SortHeader
                      label="Order Date"
                      active={sortKey === "orderDateValue"}
                      direction={sortDirection}
                      onClick={() => handleSort("orderDateValue")}
                    />
                  </TableHead>
                )}
                {visibleColumns.channel && (
                  <TableHead>
                    <SortHeader
                      label="Channels"
                      active={sortKey === "channel"}
                      direction={sortDirection}
                      onClick={() => handleSort("channel")}
                    />
                  </TableHead>
                )}
                <TableHead className="w-[48px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrders.length > 0 ? (
                filteredOrders.map((order) => (
                  <TableRow key={order.id}>
                    {visibleColumns.orderId && (
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {order.needsAttention && (
                            <span className="size-2 rounded-full bg-rose-500" />
                          )}
                          <Link
                            href="/ecommerce/order-detail-1"
                            className="text-sm font-medium hover:underline"
                          >
                            {order.orderId}
                          </Link>
                        </div>
                      </TableCell>
                    )}
                    {visibleColumns.total && (
                      <TableCell className="text-sm">
                        {currencyFormatter.format(order.total)}
                      </TableCell>
                    )}
                    {visibleColumns.status && (
                      <TableCell>
                        <StatusBadges
                          paymentStatus={order.paymentStatus}
                          fulfillmentStatus={order.fulfillmentStatus}
                        />
                      </TableCell>
                    )}
                    {visibleColumns.customer && (
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">
                            {order.customerName}
                          </span>
                          <Badge variant="outline" className="font-normal">
                            {order.customerCode}
                          </Badge>
                        </div>
                      </TableCell>
                    )}
                    {visibleColumns.orderDate && (
                      <TableCell className="text-sm">
                        {order.orderDateLabel}
                      </TableCell>
                    )}
                    {visibleColumns.channel && (
                      <TableCell>
                        <ChannelCell channel={order.channel} />
                      </TableCell>
                    )}
                    <TableCell>
                      <OrderActions orderId={order.orderId} />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={tableColSpan}
                    className="text-muted-foreground h-24 text-center"
                  >
                    No orders found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
