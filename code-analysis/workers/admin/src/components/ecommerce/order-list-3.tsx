"use client";

import {
  CalendarDays,
  CheckCircle2,
  DollarSign,
  FileText,
  MoreHorizontal,
  Package,
  Plus,
  RotateCcw,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  Store,
  Tags,
  Truck,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { inventoryCards } from "@/lib/ecommerce-product-catalog";
import {
  getSalesOrderDetailHref,
  type PaymentState,
  type SalesOrder,
  salesOrders,
  type SalesOrderStatus,
} from "@/lib/ecommerce-sales-orders";
import { cn } from "@/lib/utils";

type SortOption =
  | "recent"
  | "oldest"
  | "amount-high"
  | "amount-low"
  | "progress-high"
  | "progress-low";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const productLookup = new Map(
  inventoryCards.map((product) => [product.name, product]),
);

const sortOptions: { label: string; value: SortOption }[] = [
  { label: "Most recent", value: "recent" },
  { label: "Oldest first", value: "oldest" },
  { label: "Amount: high to low", value: "amount-high" },
  { label: "Amount: low to high", value: "amount-low" },
  { label: "Progress: high to low", value: "progress-high" },
  { label: "Progress: low to high", value: "progress-low" },
];

const sourceOptions = [
  "all",
  ...new Set(salesOrders.map((order) => order.source)),
];

const locationOptions = [
  "all",
  ...new Set(salesOrders.map((order) => order.location)),
];

function parseOptionalNumber(value: string) {
  if (value.trim().length === 0) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function statusCountLabel(filter: SalesOrderStatus) {
  if (filter === "all") {
    return salesOrders.length;
  }

  return salesOrders.filter((order) => order.status === filter).length;
}

function paymentBadgeClassName(paymentState: PaymentState) {
  if (paymentState === "paid") {
    return "bg-emerald-500/12 text-emerald-700 hover:bg-emerald-500/12";
  }

  if (paymentState === "partial") {
    return "bg-amber-500/12 text-amber-700 hover:bg-amber-500/12";
  }

  return "bg-rose-500/12 text-rose-700 hover:bg-rose-500/12";
}

function formatPaymentState(paymentState: PaymentState) {
  if (paymentState === "paid") {
    return "Paid";
  }

  if (paymentState === "partial") {
    return "Partial";
  }

  return "Unpaid";
}

function getJourneyHeadline(order: SalesOrder) {
  if (order.status === "shipment") {
    return "Order is on shipping";
  }

  if (order.status === "started") {
    return "Product in packaging";
  }

  if (order.status === "fulfilled") {
    return "Order delivered";
  }

  return "New quote";
}

function getJourneyAction(order: SalesOrder) {
  if (order.status === "shipment") {
    return "Track shipment";
  }

  if (order.status === "started") {
    return "View packing";
  }

  if (order.status === "fulfilled") {
    return "Open proof";
  }

  return "Review quote";
}

function sortOrders(orders: SalesOrder[], sortBy: SortOption) {
  return [...orders].sort((left, right) => {
    if (sortBy === "recent") {
      return left.daysAgo - right.daysAgo;
    }

    if (sortBy === "oldest") {
      return right.daysAgo - left.daysAgo;
    }

    if (sortBy === "amount-high") {
      return right.amount - left.amount;
    }

    if (sortBy === "amount-low") {
      return left.amount - right.amount;
    }

    if (sortBy === "progress-high") {
      return right.progress - left.progress;
    }

    return left.progress - right.progress;
  });
}

function StatusButton({
  active,
  count,
  last,
  label,
  onClick,
}: {
  active: boolean;
  count: number;
  last?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-11 w-full items-center justify-between px-3.5 py-2.5 text-left transition-colors",
        !last && "border-border/60 border-b",
        active
          ? "bg-foreground/[0.045] text-foreground"
          : "text-foreground/80 hover:bg-muted/20 hover:text-foreground",
      )}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "border-border/80 bg-background h-2 w-2 rounded-full border",
            active && "border-foreground/70 bg-foreground/70",
          )}
        />
        <span className="text-[13px] font-medium">{label}</span>
      </div>
      <span
        className={cn(
          "text-foreground/65 text-[13px] font-medium",
          active && "text-foreground",
        )}
      >
        {count}
      </span>
    </button>
  );
}

function SidebarSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-border/60 flex flex-col gap-3 border-b border-dotted pb-5 last:border-none last:pb-0">
      <h2 className="text-foreground/85 text-[13px] font-medium tracking-normal">
        {title}
      </h2>
      {children}
    </section>
  );
}

function JourneyTrack({
  progress,
  status,
}: {
  progress: number;
  status: Exclude<SalesOrderStatus, "all">;
}) {
  const steps = [
    { label: "Quote", icon: FileText },
    { label: "Pack", icon: Package },
    { label: "Ship", icon: Truck },
    { label: "Done", icon: CheckCircle2 },
  ];
  const activeIndex =
    status === "quote"
      ? 0
      : status === "started"
        ? 1
        : status === "shipment"
          ? 2
          : 3;

  return (
    <div className="grid gap-2.5 sm:gap-3">
      <div className="grid grid-cols-[repeat(4,minmax(0,1fr))] items-center gap-2 sm:gap-3">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const active = index <= activeIndex;
          const isLast = index === steps.length - 1;

          return (
            <div
              key={step.label}
              className="flex items-center gap-1.5 sm:gap-2"
            >
              <div
                className={cn(
                  "bg-background flex h-5 w-5 shrink-0 items-center justify-center rounded-md border sm:h-6 sm:w-6",
                  active
                    ? "border-foreground text-foreground"
                    : "border-border/70 text-muted-foreground",
                )}
              >
                <Icon className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
              </div>
              {isLast ? null : (
                <div className="bg-border/70 h-1 flex-1 overflow-hidden rounded-full">
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width]",
                      active ? "bg-foreground" : "bg-transparent",
                    )}
                    style={{
                      width:
                        index < activeIndex
                          ? "100%"
                          : index === activeIndex
                            ? `${Math.max(progress - activeIndex * 25, 18)}%`
                            : "0%",
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="text-muted-foreground hidden grid-cols-4 gap-3 text-[10px] font-medium sm:grid">
        {steps.map((step) => (
          <span key={step.label} className="text-center">
            {step.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function RowActions({ order }: { order: SalesOrder }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground size-10 rounded-lg"
          aria-label={`Open actions for ${order.code}`}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem asChild>
          <Link href={getSalesOrderDetailHref(order.code)}>Open order</Link>
        </DropdownMenuItem>
        <DropdownMenuItem>Duplicate quote</DropdownMenuItem>
        <DropdownMenuItem>Send update</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function OrderListRow({ order }: { order: SalesOrder }) {
  const product = productLookup.get(order.productName);

  return (
    <article className="border-border/70 bg-background hover:bg-muted/10 rounded-xl border p-3.5 transition-colors sm:p-4">
      <div className="grid gap-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold tracking-[0.02em]">
                  {order.code}
                </span>
                <Badge
                  className={cn(
                    "rounded-md px-2 py-0.5 text-xs",
                    paymentBadgeClassName(order.paymentState),
                  )}
                >
                  {formatPaymentState(order.paymentState)}
                </Badge>
                {order.hasInvoice ? (
                  <Badge
                    variant="secondary"
                    className="rounded-md px-2 py-0.5 text-xs"
                  >
                    Invoice
                  </Badge>
                ) : null}
              </div>
              <div className="shrink-0 md:hidden">
                <RowActions order={order} />
              </div>
            </div>

            <Link
              href={getSalesOrderDetailHref(order.code)}
              className="mt-2 block min-w-0 text-[1.15rem] font-semibold tracking-tight hover:underline"
            >
              {order.productName} / {order.variant} x{order.quantity}
            </Link>

            <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span>{order.location}</span>
              <span className="text-border">•</span>
              <span>{order.customerName}</span>
              <span className="text-border">•</span>
              <span>{order.source}</span>
              <span className="text-border">•</span>
              <span>{order.accountManager}</span>
            </div>
          </div>

          <div className="flex items-end justify-between gap-3 md:shrink-0 md:items-start md:justify-end">
            <div className="border-border/70 bg-muted/40 hidden h-11 w-11 overflow-hidden rounded-full border md:block">
              {product ? (
                <div className="relative h-full w-full">
                  <Image
                    src={product.image}
                    alt={order.productName}
                    fill
                    sizes="44px"
                    className="object-cover"
                  />
                </div>
              ) : null}
            </div>
            <div className="flex flex-col items-start gap-2 md:items-end">
              <div className="text-left md:text-right">
                <p className="text-xl leading-none font-semibold">
                  {currencyFormatter.format(order.amount)}
                </p>
                <p className="text-muted-foreground mt-1 text-sm">
                  {order.orderDateLabel}
                </p>
              </div>
              <div className="hidden md:block">
                <RowActions order={order} />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-muted/20 border-border/60 rounded-xl border px-4 py-3">
          <div className="flex flex-col gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {getJourneyHeadline(order)}
              </p>
              <p className="text-muted-foreground text-sm">{order.summary}</p>
            </div>

            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
              <JourneyTrack progress={order.progress} status={order.status} />
              <Button
                asChild
                variant="outline"
                size="sm"
                className="h-9 w-full justify-center rounded-md px-3 text-sm md:h-8 md:w-auto md:justify-self-end md:px-2.5"
              >
                <Link href={getSalesOrderDetailHref(order.code)}>
                  {getJourneyAction(order)}
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export function EcommerceOrderList3() {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] =
    React.useState<SalesOrderStatus>("all");
  const [sourceFilter, setSourceFilter] = React.useState("all");
  const [locationFilter, setLocationFilter] = React.useState("all");
  const [dateFilter, setDateFilter] = React.useState("all");
  const [minimumAmount, setMinimumAmount] = React.useState("");
  const [maximumAmount, setMaximumAmount] = React.useState("");
  const [invoiceOnly, setInvoiceOnly] = React.useState(false);
  const [sortBy, setSortBy] = React.useState<SortOption>("recent");
  const deferredSearchQuery = React.useDeferredValue(searchQuery);
  const normalizedSearchQuery = deferredSearchQuery.trim().toLowerCase();

  const filteredOrders = React.useMemo(() => {
    const minimum = parseOptionalNumber(minimumAmount);
    const maximum = parseOptionalNumber(maximumAmount);

    const nextOrders = salesOrders.filter((order) => {
      const searchTarget = [
        order.code,
        order.customerName,
        order.productName,
        order.variant,
        order.location,
        order.source,
        order.accountManager,
      ]
        .join(" ")
        .toLowerCase();
      const matchesSearch =
        normalizedSearchQuery.length === 0 ||
        searchTarget.includes(normalizedSearchQuery);
      const matchesStatus =
        statusFilter === "all" || order.status === statusFilter;
      const matchesSource =
        sourceFilter === "all" || order.source === sourceFilter;
      const matchesLocation =
        locationFilter === "all" || order.location === locationFilter;
      const matchesDate =
        dateFilter === "all" || order.daysAgo <= Number(dateFilter);
      const matchesMinimum = minimum === null || order.amount >= minimum;
      const matchesMaximum = maximum === null || order.amount <= maximum;
      const matchesInvoice = !invoiceOnly || order.hasInvoice;

      return (
        matchesSearch &&
        matchesStatus &&
        matchesSource &&
        matchesLocation &&
        matchesDate &&
        matchesMinimum &&
        matchesMaximum &&
        matchesInvoice
      );
    });

    return sortOrders(nextOrders, sortBy);
  }, [
    dateFilter,
    invoiceOnly,
    locationFilter,
    maximumAmount,
    minimumAmount,
    normalizedSearchQuery,
    sortBy,
    sourceFilter,
    statusFilter,
  ]);

  const totalSales = filteredOrders.reduce(
    (sum, order) => sum + order.amount,
    0,
  );

  function resetFilters() {
    setSearchQuery("");
    setStatusFilter("all");
    setSourceFilter("all");
    setLocationFilter("all");
    setDateFilter("all");
    setMinimumAmount("");
    setMaximumAmount("");
    setInvoiceOnly(false);
    setSortBy("recent");
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-auto xl:overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col gap-6 p-4 md:p-6">
        <section className="border-border/70 border-b border-dashed pb-4">
          <div className="flex flex-col gap-4 md:hidden">
            <div className="border-border/70 bg-background flex size-10 shrink-0 items-center justify-center rounded-xl border">
              <ShoppingCart className="text-muted-foreground size-4.5" />
            </div>

            <div className="flex flex-col gap-1.5">
              <h1 className="text-xl font-semibold tracking-tight">
                Sales Orders
              </h1>
              <p className="text-muted-foreground max-w-[18rem] text-sm leading-6">
                A denser sales-order list with sidebar filters and
                progress-aware rows.
              </p>
            </div>

            <Button className="h-11 w-full rounded-lg shadow-none">
              <Plus className="size-4" />
              New sales order
            </Button>
          </div>

          <div className="hidden gap-4 md:flex md:flex-row md:items-start md:justify-between xl:items-center">
            <div className="flex items-start gap-3">
              <div className="border-border/70 bg-background flex size-10 shrink-0 items-center justify-center rounded-xl border">
                <ShoppingCart className="text-muted-foreground size-4.5" />
              </div>
              <div className="flex flex-col gap-1">
                <h1 className="text-lg font-semibold tracking-tight md:text-xl">
                  Sales Orders
                </h1>
                <p className="text-muted-foreground text-sm">
                  Sidebar-driven sales pipeline filtering with dense order rows.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start">
              <Button className="h-10 rounded-lg px-4 shadow-none">
                <Plus className="size-4" />
                New sales order
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:min-h-0 xl:flex-1 xl:grid-cols-[284px_minmax(0,1fr)] xl:overflow-hidden">
          <aside className="xl:border-border/60 flex min-h-0 flex-col gap-5 xl:h-full xl:border-r xl:border-dotted xl:pr-3">
            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-1 pb-4 xl:pr-2">
              <div className="relative">
                <Search className="text-muted-foreground absolute top-1/2 left-4 size-4 -translate-y-1/2" />
                <Input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search sales orders..."
                  className="border-border/60 h-11 rounded-lg bg-transparent pr-4 pl-11 shadow-none"
                />
              </div>

              <SidebarSection title="Order status">
                <div className="border-border/60 bg-background/70 overflow-hidden rounded-xl border">
                  <StatusButton
                    active={statusFilter === "all"}
                    count={statusCountLabel("all")}
                    last={false}
                    label="All"
                    onClick={() => setStatusFilter("all")}
                  />
                  <StatusButton
                    active={statusFilter === "quote"}
                    count={statusCountLabel("quote")}
                    last={false}
                    label="Quote"
                    onClick={() => setStatusFilter("quote")}
                  />
                  <StatusButton
                    active={statusFilter === "started"}
                    count={statusCountLabel("started")}
                    last={false}
                    label="Started"
                    onClick={() => setStatusFilter("started")}
                  />
                  <StatusButton
                    active={statusFilter === "shipment"}
                    count={statusCountLabel("shipment")}
                    last={false}
                    label="Shipment"
                    onClick={() => setStatusFilter("shipment")}
                  />
                  <StatusButton
                    active={statusFilter === "fulfilled"}
                    count={statusCountLabel("fulfilled")}
                    last
                    label="Fulfilled"
                    onClick={() => setStatusFilter("fulfilled")}
                  />
                </div>
              </SidebarSection>

              <SidebarSection title="Order source">
                <Select value={sourceFilter} onValueChange={setSourceFilter}>
                  <SelectTrigger className="border-border/50 h-10 rounded-md bg-transparent px-3.5 shadow-none">
                    <SelectValue placeholder="All sources" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {sourceOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option === "all" ? "All sources" : option}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </SidebarSection>

              <SidebarSection title="Order date">
                <Select value={dateFilter} onValueChange={setDateFilter}>
                  <SelectTrigger className="border-border/50 h-10 rounded-md bg-transparent px-3.5 shadow-none">
                    <SelectValue placeholder="All dates" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="all">All dates</SelectItem>
                      <SelectItem value="7">Last 7 days</SelectItem>
                      <SelectItem value="30">Last 30 days</SelectItem>
                      <SelectItem value="90">Last 90 days</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </SidebarSection>

              <SidebarSection title="Location">
                <Select
                  value={locationFilter}
                  onValueChange={setLocationFilter}
                >
                  <SelectTrigger className="border-border/50 h-10 rounded-md bg-transparent px-3.5 shadow-none">
                    <SelectValue placeholder="All locations" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {locationOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option === "all" ? "All locations" : option}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </SidebarSection>

              <SidebarSection title="Amount">
                <div className="flex flex-col gap-2">
                  <div className="relative">
                    <DollarSign className="text-muted-foreground absolute top-1/2 left-4 size-4 -translate-y-1/2" />
                    <Input
                      inputMode="decimal"
                      value={minimumAmount}
                      onChange={(event) => setMinimumAmount(event.target.value)}
                      placeholder="Minimum amount"
                      className="border-border/50 h-10 rounded-md bg-transparent pr-3.5 pl-10 shadow-none"
                    />
                  </div>
                  <div className="relative">
                    <DollarSign className="text-muted-foreground absolute top-1/2 left-4 size-4 -translate-y-1/2" />
                    <Input
                      inputMode="decimal"
                      value={maximumAmount}
                      onChange={(event) => setMaximumAmount(event.target.value)}
                      placeholder="Maximum amount"
                      className="border-border/50 h-10 rounded-md bg-transparent pr-3.5 pl-10 shadow-none"
                    />
                  </div>
                </div>
              </SidebarSection>

              <SidebarSection title="Invoice">
                <div className="border-border/50 flex items-center justify-between rounded-md border px-3.5 py-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium">
                      Invoice attached
                    </span>
                    <span className="text-muted-foreground text-xs">
                      Only show orders with invoices
                    </span>
                  </div>
                  <Switch
                    checked={invoiceOnly}
                    onCheckedChange={setInvoiceOnly}
                  />
                </div>
              </SidebarSection>

              <Button
                type="button"
                variant="ghost"
                className="text-muted-foreground hover:text-foreground hover:bg-muted/40 h-10 w-full justify-start gap-2 rounded-md px-3 shadow-none"
                onClick={resetFilters}
              >
                <RotateCcw className="size-4" />
                <span className="text-sm font-medium">Reset filters</span>
              </Button>
            </div>
          </aside>

          <div className="flex min-h-0 min-w-0 flex-col gap-4 xl:pl-2">
            <div className="border-border/60 flex flex-col gap-3 border-b border-dotted py-4 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-6">
              <div className="flex max-w-2xl flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="rounded-md px-2.5 py-1">
                    {filteredOrders.length} orders
                  </Badge>
                  <Badge variant="outline" className="rounded-md px-2.5 py-1">
                    {currencyFormatter.format(totalSales)} total
                  </Badge>
                </div>
                <p className="text-muted-foreground text-sm">
                  Sales-order rows tuned to match the tighter `product-list-4`
                  composition and interaction density.
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Select
                  value={sortBy}
                  onValueChange={(value) => setSortBy(value as SortOption)}
                >
                  <SelectTrigger className="border-border/60 text-foreground h-10 w-full min-w-0 rounded-xl bg-transparent px-4 shadow-none sm:min-w-[220px]">
                    <SelectValue placeholder="Sort orders" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {sortOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="border-border/60 text-muted-foreground hover:text-foreground h-10 w-full rounded-xl p-0 shadow-none sm:size-10 sm:w-10 sm:shrink-0"
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuGroup>
                      <DropdownMenuItem>
                        <SlidersHorizontal className="size-4" />
                        Refine View
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Tags className="size-4" />
                        Apply labels
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <CalendarDays className="size-4" />
                        Schedule export
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Store className="size-4" />
                        Channel summary
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {filteredOrders.length > 0 ? (
              <div className="min-h-0 flex-1 overflow-y-auto xl:pr-3">
                <div className="flex flex-col gap-4">
                  {filteredOrders.map((order) => (
                    <OrderListRow key={order.id} order={order} />
                  ))}
                </div>
              </div>
            ) : (
              <div className="border-border/60 flex min-h-64 items-center justify-center border border-dashed px-6 py-10 text-center">
                <div className="flex max-w-sm flex-col gap-2">
                  <p className="text-base font-medium">No sales orders found</p>
                  <p className="text-muted-foreground text-sm">
                    Adjust one of the sidebar filters and the sales-order feed
                    will repopulate here.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
