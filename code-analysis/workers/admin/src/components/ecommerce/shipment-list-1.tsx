"use client";

import {
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  Ellipsis,
  MapPin,
  Package,
  Plus,
  Search,
  Settings2,
  Truck,
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

type ShipmentTab = "all" | "pending" | "arrived" | "canceled";
type DateRangeFilter = "all" | "last-3-days" | "last-7-days";
type ShipmentStatus = "Pending" | "Draft" | "Arrived" | "Canceled";
type ServiceFilter = "all" | "express" | "standard" | "economy" | "signature";
type SortDirection = "asc" | "desc";
type SortKey =
  | "shipmentId"
  | "status"
  | "expectedArrivalValue"
  | "orderId"
  | "carrier";
type ColumnKey =
  | "shipmentId"
  | "event"
  | "status"
  | "expectedArrival"
  | "order"
  | "carrier";

export type EcommerceShipmentList1SearchParams = {
  columns?: string | string[];
  direction?: string | string[];
  query?: string | string[];
  range?: string | string[];
  service?: string | string[];
  sort?: string | string[];
  tab?: string | string[];
};

type ShipmentRow = {
  id: string;
  shipmentId: string;
  status: ShipmentStatus;
  expectedArrivalLabel: string;
  expectedArrivalValue: number;
  orderId: string;
  carrier: string;
  service: "Express" | "Standard" | "Economy" | "Signature";
  currentStep: number;
  stageSummary: string;
  needsAttention?: boolean;
  exceptionLabel?: string;
};

const shipments: ShipmentRow[] = [
  {
    id: "shipment-01",
    shipmentId: "SHP-8801",
    status: "Pending",
    expectedArrivalLabel: "Mar 24, 2026",
    expectedArrivalValue: 20260324,
    orderId: "ORD-52108",
    carrier: "ParcelFlow",
    service: "Express",
    currentStep: 1,
    stageSummary: "Label confirmed, awaiting carrier pickup",
    needsAttention: true,
  },
  {
    id: "shipment-02",
    shipmentId: "SHP-8800",
    status: "Draft",
    expectedArrivalLabel: "Mar 24, 2026",
    expectedArrivalValue: 20260324,
    orderId: "ORD-52103",
    carrier: "FedEx",
    service: "Standard",
    currentStep: 0,
    stageSummary: "Shipment draft saved before label purchase",
  },
  {
    id: "shipment-03",
    shipmentId: "SHP-8799",
    status: "Arrived",
    expectedArrivalLabel: "Mar 23, 2026",
    expectedArrivalValue: 20260323,
    orderId: "ORD-52097",
    carrier: "DHL",
    service: "Express",
    currentStep: 3,
    stageSummary: "Delivered to the customer doorstep",
  },
  {
    id: "shipment-04",
    shipmentId: "SHP-8798",
    status: "Canceled",
    expectedArrivalLabel: "Mar 23, 2026",
    expectedArrivalValue: 20260323,
    orderId: "ORD-52091",
    carrier: "Northline",
    service: "Economy",
    currentStep: 1,
    stageSummary: "Canceled after carrier handoff was voided",
  },
  {
    id: "shipment-05",
    shipmentId: "SHP-8797",
    status: "Pending",
    expectedArrivalLabel: "Mar 22, 2026",
    expectedArrivalValue: 20260322,
    orderId: "ORD-52088",
    carrier: "UPS",
    service: "Signature",
    currentStep: 2,
    stageSummary: "Linehaul in progress across the west region",
  },
  {
    id: "shipment-06",
    shipmentId: "SHP-8796",
    status: "Pending",
    expectedArrivalLabel: "Mar 22, 2026",
    expectedArrivalValue: 20260322,
    orderId: "ORD-52084",
    carrier: "TNT",
    service: "Express",
    currentStep: 2,
    stageSummary: "Sorting hub scan complete, last-mile next",
    exceptionLabel: "Delay",
  },
  {
    id: "shipment-07",
    shipmentId: "SHP-8795",
    status: "Arrived",
    expectedArrivalLabel: "Mar 21, 2026",
    expectedArrivalValue: 20260321,
    orderId: "ORD-52072",
    carrier: "ParcelFlow",
    service: "Standard",
    currentStep: 3,
    stageSummary: "Received by customer with proof of delivery",
  },
  {
    id: "shipment-08",
    shipmentId: "SHP-8794",
    status: "Draft",
    expectedArrivalLabel: "Mar 21, 2026",
    expectedArrivalValue: 20260321,
    orderId: "ORD-52061",
    carrier: "FedEx",
    service: "Economy",
    currentStep: 0,
    stageSummary: "Awaiting packaging confirmation from warehouse",
  },
  {
    id: "shipment-09",
    shipmentId: "SHP-8793",
    status: "Pending",
    expectedArrivalLabel: "Mar 20, 2026",
    expectedArrivalValue: 20260320,
    orderId: "ORD-52044",
    carrier: "Aramex",
    service: "Standard",
    currentStep: 1,
    stageSummary: "Picked up and queued for regional transfer",
  },
  {
    id: "shipment-10",
    shipmentId: "SHP-8792",
    status: "Pending",
    expectedArrivalLabel: "Mar 20, 2026",
    expectedArrivalValue: 20260320,
    orderId: "ORD-52039",
    carrier: "UPS",
    service: "Signature",
    currentStep: 2,
    stageSummary: "Out for final-mile routing",
  },
  {
    id: "shipment-11",
    shipmentId: "SHP-8791",
    status: "Arrived",
    expectedArrivalLabel: "Mar 19, 2026",
    expectedArrivalValue: 20260319,
    orderId: "ORD-52028",
    carrier: "Northline",
    service: "Economy",
    currentStep: 3,
    stageSummary: "Delivered to lobby receiving desk",
  },
  {
    id: "shipment-12",
    shipmentId: "SHP-8790",
    status: "Arrived",
    expectedArrivalLabel: "Mar 18, 2026",
    expectedArrivalValue: 20260318,
    orderId: "ORD-52015",
    carrier: "DHL",
    service: "Express",
    currentStep: 3,
    stageSummary: "Express delivery completed ahead of ETA",
  },
];

const shipmentTabs: ShipmentTab[] = ["all", "pending", "arrived", "canceled"];
const shipmentDateRanges: DateRangeFilter[] = [
  "all",
  "last-3-days",
  "last-7-days",
];
const shipmentServices: ServiceFilter[] = [
  "all",
  "express",
  "standard",
  "economy",
  "signature",
];
const shipmentSortKeys: SortKey[] = [
  "shipmentId",
  "status",
  "expectedArrivalValue",
  "orderId",
  "carrier",
];
const shipmentColumnKeys: ColumnKey[] = [
  "shipmentId",
  "event",
  "status",
  "expectedArrival",
  "order",
  "carrier",
];
const defaultVisibleColumns: Record<ColumnKey, boolean> = {
  shipmentId: true,
  event: true,
  status: true,
  expectedArrival: true,
  order: true,
  carrier: true,
};
const dateRangeOptions = [
  { value: "all", label: "All time", maxDays: Number.POSITIVE_INFINITY },
  { value: "last-3-days", label: "Last 3 days", maxDays: 3 },
  { value: "last-7-days", label: "Last 7 days", maxDays: 7 },
] as const;

const serviceOptions = [
  { value: "all", label: "Advanced Filters" },
  { value: "express", label: "Express" },
  { value: "standard", label: "Standard" },
  { value: "economy", label: "Economy" },
  { value: "signature", label: "Signature" },
] as const;

function parseDateValue(dateValue: number) {
  const year = Math.trunc(dateValue / 10000);
  const month = Math.trunc((dateValue % 10000) / 100) - 1;
  const day = dateValue % 100;

  return new Date(year, month, day);
}

const latestShipmentDate = Math.max(
  ...shipments.map((shipment) => shipment.expectedArrivalValue),
);

type ShipmentListState = {
  dateRange: DateRangeFilter;
  search: string;
  serviceFilter: ServiceFilter;
  sortDirection: SortDirection;
  sortKey: SortKey;
  tab: ShipmentTab;
  visibleColumns: Record<ColumnKey, boolean>;
};

function getSearchParamValue(
  source: EcommerceShipmentList1SearchParams | URLSearchParams | undefined,
  key: keyof EcommerceShipmentList1SearchParams,
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
    typeof value === "string" && shipmentSortKeys.includes(value as SortKey)
  );
}

function isSortDirection(value: string | undefined): value is SortDirection {
  return value === "asc" || value === "desc";
}

function isColumnKey(value: string): value is ColumnKey {
  return shipmentColumnKeys.includes(value as ColumnKey);
}

function parseVisibleColumns(
  value: string | undefined,
): Record<ColumnKey, boolean> {
  if (!value) return { ...defaultVisibleColumns };

  if (value === "none") {
    return shipmentColumnKeys.reduce(
      (columns, column) => ({ ...columns, [column]: false }),
      {} as Record<ColumnKey, boolean>,
    );
  }

  const selectedColumns = value.split(",").filter(isColumnKey);

  if (selectedColumns.length === 0) {
    return { ...defaultVisibleColumns };
  }

  return shipmentColumnKeys.reduce(
    (columns, column) => ({
      ...columns,
      [column]: selectedColumns.includes(column),
    }),
    {} as Record<ColumnKey, boolean>,
  );
}

function getInitialShipmentListState(
  searchParams?: EcommerceShipmentList1SearchParams | URLSearchParams,
): ShipmentListState {
  const tab = getSearchParamValue(searchParams, "tab");
  const query = getSearchParamValue(searchParams, "query") ?? "";
  const range = getSearchParamValue(searchParams, "range");
  const service = getSearchParamValue(searchParams, "service");
  const sort = getSearchParamValue(searchParams, "sort");
  const direction = getSearchParamValue(searchParams, "direction");
  const columns = getSearchParamValue(searchParams, "columns");

  return {
    tab:
      tab && shipmentTabs.includes(tab as ShipmentTab)
        ? (tab as ShipmentTab)
        : "all",
    search: query,
    dateRange:
      range && shipmentDateRanges.includes(range as DateRangeFilter)
        ? (range as DateRangeFilter)
        : "all",
    serviceFilter:
      service && shipmentServices.includes(service as ServiceFilter)
        ? (service as ServiceFilter)
        : "all",
    sortKey: isSortKey(sort) ? sort : "expectedArrivalValue",
    sortDirection: isSortDirection(direction) ? direction : "desc",
    visibleColumns: parseVisibleColumns(columns),
  };
}

function getVisibleColumnsQuery(
  visibleColumns: Record<ColumnKey, boolean>,
): string | undefined {
  const selectedColumns = shipmentColumnKeys.filter(
    (column) => visibleColumns[column],
  );

  if (selectedColumns.length === shipmentColumnKeys.length) {
    return undefined;
  }

  if (selectedColumns.length === 0) {
    return "none";
  }

  return selectedColumns.join(",");
}

function getRelativeShipmentAgeInDays(dateValue: number) {
  const millisecondsPerDay = 1000 * 60 * 60 * 24;

  return Math.round(
    (parseDateValue(latestShipmentDate).getTime() -
      parseDateValue(dateValue).getTime()) /
      millisecondsPerDay,
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

function ShipmentActions({ shipmentId }: { shipmentId: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground size-8 rounded-full"
          aria-label={`Open actions for ${shipmentId}`}
        >
          <Ellipsis className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem asChild>
          <Link href="/ecommerce/shipment-detail-1">View shipment</Link>
        </DropdownMenuItem>
        <DropdownMenuItem>Notify customer</DropdownMenuItem>
        <DropdownMenuItem>Update status</DropdownMenuItem>
        <DropdownMenuItem>Print label</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ShipmentStatusBadge({
  status,
  exceptionLabel,
}: {
  status: ShipmentStatus;
  exceptionLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge
        variant="secondary"
        className={cn(
          "font-normal",
          status === "Pending" && "bg-blue-50 text-blue-700 hover:bg-blue-50",
          status === "Draft" &&
            "bg-slate-100 text-slate-700 hover:bg-slate-100",
          status === "Arrived" &&
            "bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
          status === "Canceled" && "bg-rose-50 text-rose-700 hover:bg-rose-50",
        )}
      >
        {status}
      </Badge>
      {exceptionLabel ? (
        <Badge
          variant="secondary"
          className="bg-amber-50 text-amber-700 hover:bg-amber-50"
        >
          {exceptionLabel}
        </Badge>
      ) : null}
    </div>
  );
}

function ShipmentEventRail({
  status,
  currentStep,
}: {
  status: ShipmentStatus;
  currentStep: number;
}) {
  const steps = [
    { id: 0, icon: Package },
    { id: 1, icon: ClipboardCheck },
    { id: 2, icon: Truck },
    { id: 3, icon: MapPin },
  ];

  return (
    <div className="flex min-w-[140px] items-center">
      {steps.map(({ id, icon: Icon }, index) => {
        const isComplete =
          status === "Arrived" || (status !== "Draft" && id < currentStep);
        const isCurrent =
          status !== "Draft" &&
          status !== "Canceled" &&
          status !== "Arrived" &&
          id === currentStep;
        const isCanceledCurrent =
          status === "Canceled" && id === Math.min(currentStep, 1);

        return (
          <React.Fragment key={id}>
            {index > 0 ? (
              <span
                className={cn(
                  "h-[2px] flex-1 rounded-full",
                  status === "Draft" && "bg-border/70",
                  status === "Canceled" &&
                    id <= Math.min(currentStep, 1) &&
                    "bg-rose-300",
                  status === "Canceled" &&
                    id > Math.min(currentStep, 1) &&
                    "bg-border/70",
                  status !== "Draft" &&
                    status !== "Canceled" &&
                    id <= currentStep &&
                    "bg-foreground",
                  status !== "Draft" &&
                    status !== "Canceled" &&
                    id > currentStep &&
                    "bg-border/70",
                )}
              />
            ) : null}
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-full border",
                isComplete && "border-foreground bg-foreground",
                isCurrent && "border-foreground bg-background",
                isCanceledCurrent && "bg-background border-rose-500",
                !isComplete &&
                  !isCurrent &&
                  !isCanceledCurrent &&
                  "border-border bg-background",
              )}
            >
              <Icon
                className={cn(
                  "size-3.5",
                  isComplete && "text-background",
                  isCurrent && "text-foreground",
                  isCanceledCurrent && "text-rose-500",
                  !isComplete &&
                    !isCurrent &&
                    !isCanceledCurrent &&
                    "text-muted-foreground/40",
                )}
              />
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function CarrierBadge({
  carrier,
  service,
}: {
  carrier: string;
  service: ShipmentRow["service"];
}) {
  const accent =
    {
      DHL: "bg-yellow-500",
      FedEx: "bg-violet-600",
      UPS: "bg-amber-700",
      TNT: "bg-orange-500",
      Aramex: "bg-rose-500",
      Northline: "bg-slate-700",
      ParcelFlow: "bg-sky-500",
    }[carrier] ?? "bg-slate-500";

  return (
    <div className="border-border/70 inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs">
      <span className={cn("size-2 rounded-full", accent)} />
      <span className="font-medium">{carrier}</span>
      <span className="text-muted-foreground">{service}</span>
    </div>
  );
}

function MobileShipmentCard({ shipment }: { shipment: ShipmentRow }) {
  return (
    <article className="border-border/70 bg-card rounded-2xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {shipment.needsAttention ? (
              <span className="size-2 rounded-full bg-rose-500" />
            ) : null}
            <Link
              href="/ecommerce/shipment-detail-1"
              className="truncate text-base font-medium hover:underline"
            >
              {shipment.shipmentId}
            </Link>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {shipment.orderId}
          </p>
        </div>
        <ShipmentActions shipmentId={shipment.shipmentId} />
      </div>

      <div className="mt-4">
        <ShipmentStatusBadge
          status={shipment.status}
          exceptionLabel={shipment.exceptionLabel}
        />
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <ShipmentEventRail
          status={shipment.status}
          currentStep={shipment.currentStep}
        />
        <p className="text-muted-foreground text-sm">{shipment.stageSummary}</p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">
            Expected arrival
          </span>
          <span className="text-sm font-medium">
            {shipment.expectedArrivalLabel}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Carrier</span>
          <span className="text-sm font-medium">{shipment.carrier}</span>
        </div>
      </div>

      <div className="mt-4">
        <CarrierBadge carrier={shipment.carrier} service={shipment.service} />
      </div>
    </article>
  );
}

export function EcommerceShipmentList1({
  initialSearchParams,
}: {
  initialSearchParams?: EcommerceShipmentList1SearchParams;
}) {
  const initialState = React.useMemo(
    () => getInitialShipmentListState(initialSearchParams),
    [initialSearchParams],
  );
  const [tab, setTab] = React.useState<ShipmentTab>(initialState.tab);
  const [search, setSearch] = React.useState(initialState.search);
  const [dateRange, setDateRange] = React.useState<DateRangeFilter>(
    initialState.dateRange,
  );
  const [serviceFilter, setServiceFilter] = React.useState<ServiceFilter>(
    initialState.serviceFilter,
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
      const nextState = getInitialShipmentListState(
        new URLSearchParams(window.location.search),
      );

      setTab(nextState.tab);
      setSearch(nextState.search);
      setDateRange(nextState.dateRange);
      setServiceFilter(nextState.serviceFilter);
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

    if (serviceFilter !== "all") {
      params.set("service", serviceFilter);
    } else {
      params.delete("service");
    }

    if (sortKey !== "expectedArrivalValue") {
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
    serviceFilter,
    sortDirection,
    sortKey,
    tab,
    visibleColumns,
  ]);

  const visibleColumnCount = React.useMemo(
    () => shipmentColumnKeys.filter((column) => visibleColumns[column]).length,
    [visibleColumns],
  );
  const tableColSpan = visibleColumnCount + 1;

  const filteredShipments = React.useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const selectedDateRange =
      dateRangeOptions.find((option) => option.value === dateRange) ??
      dateRangeOptions[0];

    const nextShipments = shipments.filter((shipment) => {
      const matchesTab =
        tab === "all" ||
        (tab === "pending" &&
          (shipment.status === "Pending" || shipment.status === "Draft")) ||
        (tab === "arrived" && shipment.status === "Arrived") ||
        (tab === "canceled" && shipment.status === "Canceled");

      const matchesSearch =
        normalizedSearch.length === 0 ||
        [
          shipment.shipmentId,
          shipment.orderId,
          shipment.carrier,
          shipment.service,
          shipment.status,
          shipment.stageSummary,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);

      const matchesDate =
        getRelativeShipmentAgeInDays(shipment.expectedArrivalValue) <=
        selectedDateRange.maxDays;

      const matchesService =
        serviceFilter === "all" ||
        shipment.service.toLowerCase() === serviceFilter;

      return matchesTab && matchesSearch && matchesDate && matchesService;
    });

    nextShipments.sort((left, right) => {
      const modifier = sortDirection === "asc" ? 1 : -1;

      if (sortKey === "expectedArrivalValue") {
        return (
          (left.expectedArrivalValue - right.expectedArrivalValue) * modifier
        );
      }

      return left[sortKey].localeCompare(right[sortKey]) * modifier;
    });

    return nextShipments;
  }, [dateRange, search, serviceFilter, sortDirection, sortKey, tab]);

  function handleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection(nextKey === "expectedArrivalValue" ? "desc" : "asc");
  }

  function renderColumnToggle(key: ColumnKey, label: string) {
    return (
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
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-col p-6 md:p-8">
        <div className="flex flex-col gap-4 pb-8 md:hidden">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-foreground font-medium">Acme Store</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-foreground font-medium">Shipments</span>
          </div>

          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-medium tracking-tight">Shipments</h1>
            <p className="text-muted-foreground text-sm">
              Track carrier progress, arrivals, and delivery exceptions.
            </p>
          </div>

          <Button className="h-11 w-full rounded-xl px-5 shadow-none" asChild>
            <Link href="/ecommerce/add-shipping">
              <Plus className="size-4" aria-hidden="true" />
              Add Shipment
            </Link>
          </Button>
        </div>

        <div className="hidden gap-4 pb-8 md:flex lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-medium tracking-tight">Shipments</h1>
            <p className="text-muted-foreground text-sm">
              Track carrier progress, arrivals, and delivery exceptions.
            </p>
          </div>

          <Button className="h-10 rounded-md px-5 shadow-none" asChild>
            <Link href="/ecommerce/add-shipping">
              <Plus className="size-4" aria-hidden="true" />
              Add Shipment
            </Link>
          </Button>
        </div>

        <div className="flex flex-col">
          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value as ShipmentTab)}
            className="pt-2 pb-1"
          >
            <div className="border-b">
              <TabsList className="h-auto bg-transparent p-0">
                <TabsTrigger
                  value="all"
                  className="data-[state=active]:border-foreground rounded-none border-b-2 border-transparent px-1 pt-0 pb-3 text-sm data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  All Shipments
                </TabsTrigger>
                <TabsTrigger
                  value="pending"
                  className="data-[state=active]:border-foreground rounded-none border-b-2 border-transparent px-4 pt-0 pb-3 text-sm data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  Pending
                </TabsTrigger>
                <TabsTrigger
                  value="arrived"
                  className="data-[state=active]:border-foreground rounded-none border-b-2 border-transparent px-4 pt-0 pb-3 text-sm data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  Arrived
                </TabsTrigger>
                <TabsTrigger
                  value="canceled"
                  className="data-[state=active]:border-foreground rounded-none border-b-2 border-transparent px-4 pt-0 pb-3 text-sm data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  Canceled
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
                placeholder="Search shipments"
                aria-label="Search shipments"
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
                  aria-label="Filter shipments by date range"
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
                value={serviceFilter}
                onValueChange={(value) =>
                  setServiceFilter(value as ServiceFilter)
                }
              >
                <SelectTrigger
                  className="h-11 rounded-2xl"
                  aria-label="Filter shipments by service"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {serviceOptions.map((option) => (
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
                {renderColumnToggle("shipmentId", "Shipment ID")}
                {renderColumnToggle("expectedArrival", "Expected arrival")}
                {renderColumnToggle("status", "Status")}
                {renderColumnToggle("order", "Order")}
                {renderColumnToggle("event", "Shipment Event")}
                {renderColumnToggle("carrier", "Carrier")}
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
                  placeholder="Search shipments"
                  aria-label="Search shipments"
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
                  aria-label="Filter shipments by date range"
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
                value={serviceFilter}
                onValueChange={(value) =>
                  setServiceFilter(value as ServiceFilter)
                }
              >
                <SelectTrigger
                  className="h-10 w-[170px] rounded-lg"
                  aria-label="Filter shipments by service"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {serviceOptions.map((option) => (
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
                  {renderColumnToggle("shipmentId", "Shipment ID")}
                  {renderColumnToggle("expectedArrival", "Expected arrival")}
                  {renderColumnToggle("status", "Status")}
                  {renderColumnToggle("order", "Order")}
                  {renderColumnToggle("event", "Shipment Event")}
                  {renderColumnToggle("carrier", "Carrier")}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 pt-4 md:hidden">
          {filteredShipments.length > 0 ? (
            filteredShipments.map((shipment) => (
              <MobileShipmentCard key={shipment.id} shipment={shipment} />
            ))
          ) : (
            <div className="text-muted-foreground rounded-2xl border p-8 text-center text-sm">
              No shipments found for the current filters.
            </div>
          )}
        </div>

        <div className="hidden overflow-x-auto pt-4 md:block">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                {visibleColumns.shipmentId ? (
                  <TableHead>
                    <SortHeader
                      label="Shipment ID"
                      active={sortKey === "shipmentId"}
                      direction={sortDirection}
                      onClick={() => handleSort("shipmentId")}
                    />
                  </TableHead>
                ) : null}
                {visibleColumns.expectedArrival ? (
                  <TableHead>
                    <SortHeader
                      label="Expected arrival"
                      active={sortKey === "expectedArrivalValue"}
                      direction={sortDirection}
                      onClick={() => handleSort("expectedArrivalValue")}
                    />
                  </TableHead>
                ) : null}
                {visibleColumns.status ? (
                  <TableHead>
                    <SortHeader
                      label="Status"
                      active={sortKey === "status"}
                      direction={sortDirection}
                      onClick={() => handleSort("status")}
                    />
                  </TableHead>
                ) : null}
                {visibleColumns.order ? (
                  <TableHead>
                    <SortHeader
                      label="Order"
                      active={sortKey === "orderId"}
                      direction={sortDirection}
                      onClick={() => handleSort("orderId")}
                    />
                  </TableHead>
                ) : null}
                {visibleColumns.event ? (
                  <TableHead>Shipment Event</TableHead>
                ) : null}
                {visibleColumns.carrier ? (
                  <TableHead>
                    <SortHeader
                      label="Carrier"
                      active={sortKey === "carrier"}
                      direction={sortDirection}
                      onClick={() => handleSort("carrier")}
                    />
                  </TableHead>
                ) : null}
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredShipments.length > 0 ? (
                filteredShipments.map((shipment) => (
                  <TableRow key={shipment.id}>
                    {visibleColumns.shipmentId ? (
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {shipment.needsAttention ? (
                            <span className="size-1.5 rounded-full bg-rose-500" />
                          ) : null}
                          <Link
                            href="/ecommerce/shipment-detail-1"
                            className="font-medium hover:underline"
                          >
                            {shipment.shipmentId}
                          </Link>
                        </div>
                      </TableCell>
                    ) : null}
                    {visibleColumns.expectedArrival ? (
                      <TableCell>{shipment.expectedArrivalLabel}</TableCell>
                    ) : null}
                    {visibleColumns.status ? (
                      <TableCell>
                        <ShipmentStatusBadge
                          status={shipment.status}
                          exceptionLabel={shipment.exceptionLabel}
                        />
                      </TableCell>
                    ) : null}
                    {visibleColumns.order ? (
                      <TableCell>
                        <span className="font-medium">{shipment.orderId}</span>
                      </TableCell>
                    ) : null}
                    {visibleColumns.event ? (
                      <TableCell>
                        <ShipmentEventRail
                          status={shipment.status}
                          currentStep={shipment.currentStep}
                        />
                      </TableCell>
                    ) : null}
                    {visibleColumns.carrier ? (
                      <TableCell>
                        <CarrierBadge
                          carrier={shipment.carrier}
                          service={shipment.service}
                        />
                      </TableCell>
                    ) : null}
                    <TableCell>
                      <ShipmentActions shipmentId={shipment.shipmentId} />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={tableColSpan}
                    className="text-muted-foreground py-10 text-center text-sm"
                  >
                    No shipments found for the current filters.
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
