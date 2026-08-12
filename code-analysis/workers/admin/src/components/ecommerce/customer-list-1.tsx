"use client";

import {
  CalendarDays,
  ChevronDown,
  DollarSign,
  Ellipsis,
  Mail,
  Plus,
  RefreshCcw,
  Search,
  Settings2,
  Star,
  TriangleAlert,
  UserPlus,
  Users,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { getCustomerEditHref } from "@/lib/ecommerce-edit-customers";
import { cn } from "@/lib/utils";

type CustomerTab = "all" | "active" | "vip";
type ValueFilter = "all" | "high" | "mid" | "entry";
type DateRange = "30d" | "90d" | "365d";
type CustomerStatus = "Active" | "VIP" | "At Risk";
type SortDirection = "asc" | "desc";
type SortKey =
  | "customerId"
  | "name"
  | "orders"
  | "lifetimeValue"
  | "averageOrderValue"
  | "status"
  | "lastOrderDateValue";
type ColumnKey =
  | "customerId"
  | "name"
  | "orders"
  | "lifetimeValue"
  | "averageOrderValue"
  | "status"
  | "lastOrder";

export type EcommerceCustomerList1SearchParams = {
  columns?: string | string[];
  direction?: string | string[];
  query?: string | string[];
  range?: string | string[];
  sort?: string | string[];
  tab?: string | string[];
  value?: string | string[];
};

type CustomerRow = {
  id: string;
  customerId: string;
  name: string;
  email: string;
  orders: number;
  lifetimeValue: number;
  averageOrderValue: number;
  status: CustomerStatus;
  lastOrderLabel: string;
  lastOrderDateValue: number;
  lastOrderDays: number;
  avatar: string;
};

type CustomerMetric = {
  id: string;
  label: string;
  value: string;
  delta: string;
  positive: boolean;
  icon: React.ComponentType<{ className?: string }>;
  points: number[];
};

const customers: CustomerRow[] = [
  {
    id: "customer-01",
    customerId: "CUS-7102",
    name: "Avery Brooks",
    email: "avery.brooks@northmail.co",
    orders: 42,
    lifetimeValue: 6124,
    averageOrderValue: 146,
    status: "Active",
    lastOrderLabel: "Mar 20, 2026",
    lastOrderDateValue: 20260320,
    lastOrderDays: 2,
    avatar: "/avatars/avatar-1.png",
  },
  {
    id: "customer-02",
    customerId: "CUS-8431",
    name: "Camila Hart",
    email: "camila.hart@northmail.co",
    orders: 13,
    lifetimeValue: 2148,
    averageOrderValue: 165,
    status: "Active",
    lastOrderLabel: "Mar 19, 2026",
    lastOrderDateValue: 20260319,
    lastOrderDays: 3,
    avatar: "/avatars/avatar-2.png",
  },
  {
    id: "customer-03",
    customerId: "CUS-2844",
    name: "Miles Yoon",
    email: "miles.yoon@brightlane.co",
    orders: 67,
    lifetimeValue: 12480,
    averageOrderValue: 186,
    status: "VIP",
    lastOrderLabel: "Mar 18, 2026",
    lastOrderDateValue: 20260318,
    lastOrderDays: 4,
    avatar: "/avatars/avatar-3.png",
  },
  {
    id: "customer-04",
    customerId: "CUS-5290",
    name: "Nora Castillo",
    email: "nora.castillo@brightlane.co",
    orders: 8,
    lifetimeValue: 1386,
    averageOrderValue: 173,
    status: "At Risk",
    lastOrderLabel: "Jan 26, 2026",
    lastOrderDateValue: 20260126,
    lastOrderDays: 56,
    avatar: "/avatars/avatar-4.png",
  },
  {
    id: "customer-05",
    customerId: "CUS-1742",
    name: "Theo Hammond",
    email: "theo.hammond@caldwell.app",
    orders: 96,
    lifetimeValue: 18410,
    averageOrderValue: 192,
    status: "VIP",
    lastOrderLabel: "Mar 21, 2026",
    lastOrderDateValue: 20260321,
    lastOrderDays: 1,
    avatar: "/avatars/avatar-5.png",
  },
  {
    id: "customer-06",
    customerId: "CUS-6619",
    name: "Zara Quinn",
    email: "zara.quinn@caldwell.app",
    orders: 21,
    lifetimeValue: 3822,
    averageOrderValue: 182,
    status: "Active",
    lastOrderLabel: "Mar 14, 2026",
    lastOrderDateValue: 20260314,
    lastOrderDays: 8,
    avatar: "/avatars/avatar-6.png",
  },
  {
    id: "customer-07",
    customerId: "CUS-9051",
    name: "Julian Porter",
    email: "julian.porter@commoner.co",
    orders: 5,
    lifetimeValue: 624,
    averageOrderValue: 125,
    status: "At Risk",
    lastOrderLabel: "Dec 12, 2025",
    lastOrderDateValue: 20251212,
    lastOrderDays: 100,
    avatar: "/avatars/avatar-black-1.png",
  },
  {
    id: "customer-08",
    customerId: "CUS-3378",
    name: "Leila Forde",
    email: "leila.forde@commoner.co",
    orders: 58,
    lifetimeValue: 9040,
    averageOrderValue: 156,
    status: "VIP",
    lastOrderLabel: "Mar 17, 2026",
    lastOrderDateValue: 20260317,
    lastOrderDays: 5,
    avatar: "/avatars/avatar-black-2.png",
  },
  {
    id: "customer-09",
    customerId: "CUS-4926",
    name: "Rory Bennett",
    email: "rory.bennett@waxwing.io",
    orders: 17,
    lifetimeValue: 2895,
    averageOrderValue: 170,
    status: "Active",
    lastOrderLabel: "Feb 27, 2026",
    lastOrderDateValue: 20260227,
    lastOrderDays: 23,
    avatar: "/avatars/avatar-black-3.png",
  },
  {
    id: "customer-10",
    customerId: "CUS-1287",
    name: "Imani Rhodes",
    email: "imani.rhodes@waxwing.io",
    orders: 31,
    lifetimeValue: 5180,
    averageOrderValue: 167,
    status: "Active",
    lastOrderLabel: "Mar 08, 2026",
    lastOrderDateValue: 20260308,
    lastOrderDays: 14,
    avatar: "/avatars/avatar-black-4.png",
  },
  {
    id: "customer-11",
    customerId: "CUS-7306",
    name: "Elias Mercer",
    email: "elias.mercer@meridianhq.co",
    orders: 11,
    lifetimeValue: 1742,
    averageOrderValue: 158,
    status: "At Risk",
    lastOrderLabel: "Jan 14, 2026",
    lastOrderDateValue: 20260114,
    lastOrderDays: 68,
    avatar: "/avatars/avatar-black-5.png",
  },
  {
    id: "customer-12",
    customerId: "CUS-2465",
    name: "Sienna Blair",
    email: "sienna.blair@meridianhq.co",
    orders: 74,
    lifetimeValue: 11130,
    averageOrderValue: 150,
    status: "VIP",
    lastOrderLabel: "Mar 20, 2026",
    lastOrderDateValue: 20260320,
    lastOrderDays: 2,
    avatar: "/avatars/avatar-black-6.png",
  },
];

const customerMetrics: CustomerMetric[] = [
  {
    id: "metric-total",
    label: "Customers",
    value: "1,864",
    delta: "+4.8%",
    positive: true,
    icon: Users,
    points: [18, 22, 25, 24, 29, 33, 37, 42, 45, 51],
  },
  {
    id: "metric-new",
    label: "New customers",
    value: "214",
    delta: "+11.2%",
    positive: true,
    icon: UserPlus,
    points: [8, 7, 7, 9, 9, 11, 12, 12, 14, 15],
  },
  {
    id: "metric-repeat",
    label: "Repeat rate",
    value: "63.8%",
    delta: "+2.1%",
    positive: true,
    icon: RefreshCcw,
    points: [30, 29, 31, 32, 31, 34, 33, 35, 36, 37],
  },
  {
    id: "metric-value",
    label: "Lifetime value",
    value: "$1,184",
    delta: "+6.4%",
    positive: true,
    icon: DollarSign,
    points: [14, 16, 16, 18, 20, 21, 24, 25, 29, 31],
  },
];

const customerTabs: CustomerTab[] = ["all", "active", "vip"];
const customerDateRanges: DateRange[] = ["30d", "90d", "365d"];
const customerValueFilters: ValueFilter[] = ["all", "high", "mid", "entry"];
const customerSortKeys: SortKey[] = [
  "customerId",
  "name",
  "orders",
  "lifetimeValue",
  "averageOrderValue",
  "status",
  "lastOrderDateValue",
];
const customerColumnKeys: ColumnKey[] = [
  "customerId",
  "name",
  "orders",
  "lifetimeValue",
  "averageOrderValue",
  "status",
  "lastOrder",
];
const defaultVisibleColumns: Record<ColumnKey, boolean> = {
  customerId: true,
  name: true,
  orders: true,
  lifetimeValue: true,
  averageOrderValue: true,
  status: true,
  lastOrder: true,
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const dateRangeOptions: Array<{ value: DateRange; label: string }> = [
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "365d", label: "This year" },
];

const valueFilterOptions: Array<{ value: ValueFilter; label: string }> = [
  { value: "all", label: "All values" },
  { value: "high", label: "High value" },
  { value: "mid", label: "Mid value" },
  { value: "entry", label: "Entry value" },
];

type CustomerListState = {
  dateRange: DateRange;
  search: string;
  sortDirection: SortDirection;
  sortKey: SortKey;
  tab: CustomerTab;
  valueFilter: ValueFilter;
  visibleColumns: Record<ColumnKey, boolean>;
};

function getSearchParamValue(
  source: EcommerceCustomerList1SearchParams | URLSearchParams | undefined,
  key: keyof EcommerceCustomerList1SearchParams,
) {
  if (!source) return undefined;
  if (source instanceof URLSearchParams) {
    return source.get(key) ?? undefined;
  }

  const value = source[key];
  return Array.isArray(value) ? value[0] : value;
}

function isSortKey(value: string | undefined): value is SortKey {
  return (
    typeof value === "string" && customerSortKeys.includes(value as SortKey)
  );
}

function isSortDirection(value: string | undefined): value is SortDirection {
  return value === "asc" || value === "desc";
}

function isColumnKey(value: string): value is ColumnKey {
  return customerColumnKeys.includes(value as ColumnKey);
}

function parseVisibleColumns(
  value: string | undefined,
): Record<ColumnKey, boolean> {
  if (!value) return { ...defaultVisibleColumns };

  if (value === "none") {
    return customerColumnKeys.reduce(
      (columns, column) => ({ ...columns, [column]: false }),
      {} as Record<ColumnKey, boolean>,
    );
  }

  const selectedColumns = value.split(",").filter(isColumnKey);

  if (selectedColumns.length === 0) {
    return { ...defaultVisibleColumns };
  }

  return customerColumnKeys.reduce(
    (columns, column) => ({
      ...columns,
      [column]: selectedColumns.includes(column),
    }),
    {} as Record<ColumnKey, boolean>,
  );
}

function getInitialCustomerListState(
  searchParams?: EcommerceCustomerList1SearchParams | URLSearchParams,
): CustomerListState {
  const tab = getSearchParamValue(searchParams, "tab");
  const query = getSearchParamValue(searchParams, "query") ?? "";
  const range = getSearchParamValue(searchParams, "range");
  const value = getSearchParamValue(searchParams, "value");
  const sort = getSearchParamValue(searchParams, "sort");
  const direction = getSearchParamValue(searchParams, "direction");
  const columns = getSearchParamValue(searchParams, "columns");

  return {
    tab:
      tab && customerTabs.includes(tab as CustomerTab)
        ? (tab as CustomerTab)
        : "all",
    search: query,
    dateRange:
      range && customerDateRanges.includes(range as DateRange)
        ? (range as DateRange)
        : "90d",
    valueFilter:
      value && customerValueFilters.includes(value as ValueFilter)
        ? (value as ValueFilter)
        : "all",
    sortKey: isSortKey(sort) ? sort : "lastOrderDateValue",
    sortDirection: isSortDirection(direction) ? direction : "desc",
    visibleColumns: parseVisibleColumns(columns),
  };
}

function getVisibleColumnsQuery(
  visibleColumns: Record<ColumnKey, boolean>,
): string | undefined {
  const selectedColumns = customerColumnKeys.filter(
    (column) => visibleColumns[column],
  );

  if (selectedColumns.length === customerColumnKeys.length) {
    return undefined;
  }

  if (selectedColumns.length === 0) {
    return "none";
  }

  return selectedColumns.join(",");
}

function getValueBand(customer: CustomerRow): Exclude<ValueFilter, "all"> {
  if (customer.lifetimeValue >= 8000) return "high";
  if (customer.lifetimeValue >= 3000) return "mid";
  return "entry";
}

function TrendSparkline({
  points,
  positive,
}: {
  points: number[];
  positive: boolean;
}) {
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const coordinates = points
    .map((point, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * 100;
      const y = 100 - ((point - min) / range) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox="0 0 100 100" className="h-9 w-20" aria-hidden="true">
      <polyline
        fill="none"
        stroke={positive ? "currentColor" : "currentColor"}
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={coordinates}
        className={cn(positive ? "text-sky-500" : "text-amber-500")}
      />
    </svg>
  );
}

function CustomerMetricGrid() {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:hidden">
        {customerMetrics.map((metric) => {
          const Icon = metric.icon;

          return (
            <div key={metric.id} className="rounded-2xl border p-4">
              <div className="text-muted-foreground flex items-center gap-2 text-xs">
                <Icon className="size-4 shrink-0" />
                <span className="truncate whitespace-nowrap">
                  {metric.label}
                </span>
              </div>
              <div className="mt-3 flex items-end justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-lg font-semibold">{metric.value}</span>
                  <span
                    className={cn(
                      "text-xs font-medium",
                      metric.positive ? "text-emerald-600" : "text-rose-600",
                    )}
                  >
                    {metric.delta}
                  </span>
                </div>
                <TrendSparkline
                  points={metric.points}
                  positive={metric.positive}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="hidden overflow-hidden rounded-lg border md:grid md:grid-cols-4">
        {customerMetrics.map((metric, index) => {
          const Icon = metric.icon;

          return (
            <div
              key={metric.id}
              className={cn(
                "flex min-h-28 items-end justify-between gap-3 p-5",
                index < customerMetrics.length - 1 && "border-r",
              )}
            >
              <div className="flex min-w-0 flex-col gap-3">
                <div className="text-muted-foreground flex items-center gap-2 text-xs lg:text-sm">
                  <Icon className="size-4 shrink-0" />
                  <span className="truncate whitespace-nowrap">
                    {metric.label}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-semibold">{metric.value}</span>
                  <span
                    className={cn(
                      "text-sm font-medium",
                      metric.positive ? "text-emerald-600" : "text-rose-600",
                    )}
                  >
                    {metric.delta}
                  </span>
                </div>
              </div>
              <TrendSparkline
                points={metric.points}
                positive={metric.positive}
              />
            </div>
          );
        })}
      </div>
    </>
  );
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

function CustomerStatusBadge({ status }: { status: CustomerStatus }) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        "font-normal",
        status === "Active" &&
          "bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
        status === "VIP" && "bg-amber-50 text-amber-700 hover:bg-amber-50",
        status === "At Risk" && "bg-rose-50 text-rose-700 hover:bg-rose-50",
      )}
    >
      {status === "VIP" ? <Star className="mr-1 size-3.5" /> : null}
      {status === "At Risk" ? (
        <TriangleAlert className="mr-1 size-3.5" />
      ) : null}
      {status}
    </Badge>
  );
}

function CustomerActions({ customer }: { customer: CustomerRow }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground size-8 rounded-full"
          aria-label={`Open actions for ${customer.name}`}
        >
          <Ellipsis className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem asChild>
          <Link href="/ecommerce/customer-detail-1">View Profile</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={getCustomerEditHref(customer.customerId)}>
            Edit customer
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Mail className="size-4" aria-hidden="true" />
          Send Email
        </DropdownMenuItem>
        <DropdownMenuItem>Add Note</DropdownMenuItem>
        <DropdownMenuItem>Create Segment</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CustomerIdentity({ customer }: { customer: CustomerRow }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar className="size-9">
        <AvatarImage src={customer.avatar} alt={customer.name} />
        <AvatarFallback>
          {customer.name
            .split(" ")
            .map((part) => part[0])
            .join("")
            .slice(0, 2)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <Link
          href="/ecommerce/customer-detail-1"
          className="block truncate text-sm font-medium hover:underline"
        >
          {customer.name}
        </Link>
        <p className="text-muted-foreground truncate text-xs">
          {customer.email}
        </p>
      </div>
    </div>
  );
}

function MobileCustomerCard({ customer }: { customer: CustomerRow }) {
  return (
    <article className="rounded-2xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/ecommerce/customer-detail-1"
            className="text-muted-foreground text-xs hover:underline"
          >
            {customer.customerId}
          </Link>
          <div className="mt-2">
            <CustomerIdentity customer={customer} />
          </div>
        </div>
        <CustomerActions customer={customer} />
      </div>

      <div className="mt-4">
        <CustomerStatusBadge status={customer.status} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Orders</span>
          <span className="text-sm font-medium">{customer.orders}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Lifetime value</span>
          <span className="text-sm font-medium">
            {currencyFormatter.format(customer.lifetimeValue)}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Avg. order</span>
          <span className="text-sm font-medium">
            {currencyFormatter.format(customer.averageOrderValue)}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Last order</span>
          <span className="text-sm">{customer.lastOrderLabel}</span>
        </div>
      </div>
    </article>
  );
}

export function EcommerceCustomerList1({
  initialSearchParams,
}: {
  initialSearchParams?: EcommerceCustomerList1SearchParams;
}) {
  const initialState = React.useMemo(
    () => getInitialCustomerListState(initialSearchParams),
    [initialSearchParams],
  );
  const [tab, setTab] = React.useState<CustomerTab>(initialState.tab);
  const [search, setSearch] = React.useState(initialState.search);
  const [dateRange, setDateRange] = React.useState<DateRange>(
    initialState.dateRange,
  );
  const [valueFilter, setValueFilter] = React.useState<ValueFilter>(
    initialState.valueFilter,
  );
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
      const nextState = getInitialCustomerListState(
        new URLSearchParams(window.location.search),
      );

      setTab(nextState.tab);
      setSearch(nextState.search);
      setDateRange(nextState.dateRange);
      setValueFilter(nextState.valueFilter);
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

    if (dateRange !== "90d") {
      params.set("range", dateRange);
    } else {
      params.delete("range");
    }

    if (valueFilter !== "all") {
      params.set("value", valueFilter);
    } else {
      params.delete("value");
    }

    if (sortKey !== "lastOrderDateValue") {
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
    search,
    sortDirection,
    sortKey,
    tab,
    valueFilter,
    visibleColumns,
  ]);

  const visibleColumnCount = React.useMemo(
    () => customerColumnKeys.filter((column) => visibleColumns[column]).length,
    [visibleColumns],
  );
  const tableColSpan = visibleColumnCount + 1;

  const filteredCustomers = React.useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    const nextCustomers = customers.filter((customer) => {
      const matchesTab =
        tab === "all" ||
        (tab === "active" && customer.status === "Active") ||
        (tab === "vip" && customer.status === "VIP");

      const maxDays = dateRange === "30d" ? 30 : dateRange === "90d" ? 90 : 365;
      const matchesDate = customer.lastOrderDays <= maxDays;

      const matchesValue =
        valueFilter === "all" || getValueBand(customer) === valueFilter;

      const matchesSearch =
        normalizedSearch.length === 0 ||
        [customer.customerId, customer.name, customer.email, customer.status]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);

      return matchesTab && matchesDate && matchesValue && matchesSearch;
    });

    nextCustomers.sort((left, right) => {
      const modifier = sortDirection === "asc" ? 1 : -1;

      if (
        sortKey === "orders" ||
        sortKey === "lifetimeValue" ||
        sortKey === "averageOrderValue" ||
        sortKey === "lastOrderDateValue"
      ) {
        return (left[sortKey] - right[sortKey]) * modifier;
      }

      return left[sortKey].localeCompare(right[sortKey]) * modifier;
    });

    return nextCustomers;
  }, [dateRange, search, sortDirection, sortKey, tab, valueFilter]);

  function handleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection(nextKey === "lastOrderDateValue" ? "desc" : "asc");
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-col p-6 md:p-8">
        <div className="flex flex-col gap-4 pb-8 md:hidden">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-foreground font-medium">Acme Store</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-foreground font-medium">Customers</span>
          </div>

          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-medium tracking-tight">Customers</h1>
            <p className="text-muted-foreground text-sm">
              Track retention, value, and recent purchase activity.
            </p>
          </div>

          <Button asChild className="h-11 w-full rounded-xl px-5 shadow-none">
            <Link href="/ecommerce/add-customer">
              <Plus className="size-4" aria-hidden="true" />
              Create Customer
            </Link>
          </Button>
        </div>

        <div className="hidden gap-4 pb-8 md:flex lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-medium tracking-tight">Customers</h1>
            <p className="text-muted-foreground text-sm">
              Track retention, value, and recent purchase activity.
            </p>
          </div>

          <Button asChild className="h-10 rounded-md px-5 shadow-none">
            <Link href="/ecommerce/add-customer">
              <Plus className="size-4" aria-hidden="true" />
              Create Customer
            </Link>
          </Button>
        </div>

        <CustomerMetricGrid />

        <div className="flex flex-col pt-6">
          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value as CustomerTab)}
            className="pb-1"
          >
            <div className="border-b">
              <TabsList className="h-auto bg-transparent p-0">
                <TabsTrigger
                  value="all"
                  className="data-[state=active]:border-foreground rounded-none border-b-2 border-transparent px-1 pt-0 pb-3 text-sm data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  All Customers
                </TabsTrigger>
                <TabsTrigger
                  value="active"
                  className="data-[state=active]:border-foreground rounded-none border-b-2 border-transparent px-4 pt-0 pb-3 text-sm data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  Active
                </TabsTrigger>
                <TabsTrigger
                  value="vip"
                  className="data-[state=active]:border-foreground rounded-none border-b-2 border-transparent px-4 pt-0 pb-3 text-sm data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  VIP
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
                placeholder="Search customers"
                aria-label="Search customers"
                className="h-12 rounded-2xl pl-9"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Select
                value={dateRange}
                onValueChange={(value) => setDateRange(value as DateRange)}
              >
                <SelectTrigger
                  className="h-11 rounded-2xl"
                  aria-label="Filter customers by date range"
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
                value={valueFilter}
                onValueChange={(value) => setValueFilter(value as ValueFilter)}
              >
                <SelectTrigger
                  className="h-11 rounded-2xl"
                  aria-label="Filter customers by value band"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {valueFilterOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
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
                {(
                  [
                    ["customerId", "Customer ID"],
                    ["name", "Name"],
                    ["orders", "Orders"],
                    ["lifetimeValue", "Total spend"],
                    ["averageOrderValue", "Avg. order value"],
                    ["status", "Status"],
                    ["lastOrder", "Last order"],
                  ] as Array<[ColumnKey, string]>
                ).map(([key, label]) => (
                  <DropdownMenuCheckboxItem
                    key={key}
                    checked={visibleColumns[key]}
                    onCheckedChange={(checked) =>
                      setVisibleColumns((current) => ({
                        ...current,
                        [key]: !!checked,
                      }))
                    }
                  >
                    {label}
                  </DropdownMenuCheckboxItem>
                ))}
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
                  placeholder="Search customers"
                  aria-label="Search customers"
                  className="h-10 w-[220px] rounded-lg pl-9"
                />
              </div>

              <Select
                value={dateRange}
                onValueChange={(value) => setDateRange(value as DateRange)}
              >
                <SelectTrigger
                  className="h-10 w-[160px] rounded-lg"
                  aria-label="Filter customers by date range"
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
                value={valueFilter}
                onValueChange={(value) => setValueFilter(value as ValueFilter)}
              >
                <SelectTrigger
                  className="h-10 w-[160px] rounded-lg"
                  aria-label="Filter customers by value band"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {valueFilterOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-10 rounded-lg px-4">
                    <Settings2 className="size-4" />
                    Manage Table
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {(
                    [
                      ["customerId", "Customer ID"],
                      ["name", "Name"],
                      ["orders", "Orders"],
                      ["lifetimeValue", "Total spend"],
                      ["averageOrderValue", "Avg. order value"],
                      ["status", "Status"],
                      ["lastOrder", "Last order"],
                    ] as Array<[ColumnKey, string]>
                  ).map(([key, label]) => (
                    <DropdownMenuCheckboxItem
                      key={key}
                      checked={visibleColumns[key]}
                      onCheckedChange={(checked) =>
                        setVisibleColumns((current) => ({
                          ...current,
                          [key]: !!checked,
                        }))
                      }
                    >
                      {label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 pt-4 md:hidden">
          {filteredCustomers.length > 0 ? (
            filteredCustomers.map((customer) => (
              <MobileCustomerCard key={customer.id} customer={customer} />
            ))
          ) : (
            <div className="text-muted-foreground rounded-2xl border p-8 text-center text-sm">
              No customers found for the current filters.
            </div>
          )}
        </div>

        <div className="hidden overflow-x-auto pt-4 md:block">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                {visibleColumns.customerId && (
                  <TableHead>
                    <SortHeader
                      label="Customer ID"
                      active={sortKey === "customerId"}
                      direction={sortDirection}
                      onClick={() => handleSort("customerId")}
                    />
                  </TableHead>
                )}
                {visibleColumns.name && (
                  <TableHead>
                    <SortHeader
                      label="Name"
                      active={sortKey === "name"}
                      direction={sortDirection}
                      onClick={() => handleSort("name")}
                    />
                  </TableHead>
                )}
                {visibleColumns.orders && (
                  <TableHead>
                    <SortHeader
                      label="Orders"
                      active={sortKey === "orders"}
                      direction={sortDirection}
                      onClick={() => handleSort("orders")}
                    />
                  </TableHead>
                )}
                {visibleColumns.lifetimeValue && (
                  <TableHead>
                    <SortHeader
                      label="Total spend"
                      active={sortKey === "lifetimeValue"}
                      direction={sortDirection}
                      onClick={() => handleSort("lifetimeValue")}
                    />
                  </TableHead>
                )}
                {visibleColumns.averageOrderValue && (
                  <TableHead>
                    <SortHeader
                      label="Avg. order value"
                      active={sortKey === "averageOrderValue"}
                      direction={sortDirection}
                      onClick={() => handleSort("averageOrderValue")}
                    />
                  </TableHead>
                )}
                {visibleColumns.status && (
                  <TableHead>
                    <SortHeader
                      label="Status"
                      active={sortKey === "status"}
                      direction={sortDirection}
                      onClick={() => handleSort("status")}
                    />
                  </TableHead>
                )}
                {visibleColumns.lastOrder && (
                  <TableHead>
                    <SortHeader
                      label="Last order"
                      active={sortKey === "lastOrderDateValue"}
                      direction={sortDirection}
                      onClick={() => handleSort("lastOrderDateValue")}
                    />
                  </TableHead>
                )}
                <TableHead className="w-[48px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCustomers.length > 0 ? (
                filteredCustomers.map((customer) => (
                  <TableRow key={customer.id}>
                    {visibleColumns.customerId && (
                      <TableCell>
                        <Link
                          href="/ecommerce/customer-detail-1"
                          className="text-sm font-medium hover:underline"
                        >
                          {customer.customerId}
                        </Link>
                      </TableCell>
                    )}
                    {visibleColumns.name && (
                      <TableCell>
                        <CustomerIdentity customer={customer} />
                      </TableCell>
                    )}
                    {visibleColumns.orders && (
                      <TableCell className="text-sm">
                        {customer.orders}
                      </TableCell>
                    )}
                    {visibleColumns.lifetimeValue && (
                      <TableCell className="text-sm">
                        {currencyFormatter.format(customer.lifetimeValue)}
                      </TableCell>
                    )}
                    {visibleColumns.averageOrderValue && (
                      <TableCell className="text-sm">
                        {currencyFormatter.format(customer.averageOrderValue)}
                      </TableCell>
                    )}
                    {visibleColumns.status && (
                      <TableCell>
                        <CustomerStatusBadge status={customer.status} />
                      </TableCell>
                    )}
                    {visibleColumns.lastOrder && (
                      <TableCell className="text-sm">
                        {customer.lastOrderLabel}
                      </TableCell>
                    )}
                    <TableCell>
                      <CustomerActions customer={customer} />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={tableColSpan}
                    className="text-muted-foreground h-24 text-center"
                  >
                    No customers found for the current filters.
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
