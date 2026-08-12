"use client";

import {
  ChevronUp,
  MoreHorizontal,
  Package,
  Plus,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { ChartConfig, ChartContainer } from "@/components/ui/chart";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getProductDetailHref,
  getProductEditHref,
} from "@/lib/ecommerce-edit-products";
import { cn } from "@/lib/utils";

type MetricKey = "sales" | "views" | "stock";

type ProductListStat = {
  title: string;
  value: string;
  delta: number;
  context: string;
};

type ProductCardItem = {
  name: string;
  category: string;
  image: string;
  price: string;
  stock: string;
  defaultMetric: MetricKey;
  metrics: Record<MetricKey, string>;
};

const productListStats: ProductListStat[] = [
  {
    title: "Total Products",
    value: "248",
    delta: 12.4,
    context: "vs last month",
  },
  {
    title: "Active Listings",
    value: "186",
    delta: 4.8,
    context: "vs last month",
  },
  {
    title: "Low Stock Items",
    value: "19",
    delta: -6.1,
    context: "vs last month",
  },
  {
    title: "Monthly Revenue",
    value: "$89,440",
    delta: 8.2,
    context: "vs last month",
  },
];

const productCards: ProductCardItem[] = [
  {
    name: "Radiance Ritual Set",
    category: "Skincare Set",
    image:
      "/images/block/ecommerce/skin-care-product/pexels-amelie-chen-243775000-12352170-3.jpg",
    price: "$389.00",
    stock: "48 units",
    defaultMetric: "sales",
    metrics: {
      sales: "$12.8k",
      views: "8.4k",
      stock: "48 units",
    },
  },
  {
    name: "Timeless Renewal Cream",
    category: "Cream",
    image:
      "/images/block/ecommerce/skin-care-product/pexels-carlos-diaz-216017-18350286-3.jpg",
    price: "$199.00",
    stock: "32 units",
    defaultMetric: "views",
    metrics: {
      sales: "$8.9k",
      views: "12.6k",
      stock: "32 units",
    },
  },
  {
    name: "Radiant Lock Mist",
    category: "Serum",
    image:
      "/images/block/ecommerce/skin-care-product/pexels-rdne-8903695-3.jpg",
    price: "$69.00",
    stock: "67 units",
    defaultMetric: "stock",
    metrics: {
      sales: "$6.4k",
      views: "18.2k",
      stock: "67 units",
    },
  },
  {
    name: "HydraBloom Night Cream",
    category: "Cream",
    image:
      "/images/block/ecommerce/skin-care-product/pexels-volkerthimm-19049367-3.jpg",
    price: "$99.00",
    stock: "24 units",
    defaultMetric: "sales",
    metrics: {
      sales: "$7.1k",
      views: "7.9k",
      stock: "24 units",
    },
  },
  {
    name: "PureEssence Soap Trio",
    category: "Soap",
    image:
      "/images/block/ecommerce/skin-care-product/pexels-shkrabaanthony-6187540-3.jpg",
    price: "$59.00",
    stock: "81 units",
    defaultMetric: "views",
    metrics: {
      sales: "$5.2k",
      views: "10.4k",
      stock: "81 units",
    },
  },
  {
    name: "Radiance Boost Serum",
    category: "Serum",
    image:
      "/images/block/ecommerce/skin-care-product/kadarius-seegars-Mxy5gokl8mE-unsplash-3.jpg",
    price: "$199.00",
    stock: "19 units",
    defaultMetric: "sales",
    metrics: {
      sales: "$11.4k",
      views: "6.8k",
      stock: "19 units",
    },
  },
  {
    name: "Barrier Repair Drops",
    category: "Treatment",
    image:
      "/images/block/ecommerce/skin-care-product/pexels-karolina-grabowska-4938448-3.jpg",
    price: "$84.00",
    stock: "12 units",
    defaultMetric: "stock",
    metrics: {
      sales: "$4.9k",
      views: "5.4k",
      stock: "12 units",
    },
  },
  {
    name: "Dew Reset Essence",
    category: "Essence",
    image:
      "/images/block/ecommerce/skin-care-product/nora-hutton-AjU6Z5k_uBI-unsplash-3.jpg",
    price: "$74.00",
    stock: "55 units",
    defaultMetric: "views",
    metrics: {
      sales: "$6.1k",
      views: "9.8k",
      stock: "55 units",
    },
  },
  {
    name: "Velvet Cleanse Balm",
    category: "Cleanser",
    image:
      "/images/block/ecommerce/skin-care-product/pexels-amelie-chen-243775000-12352170-3.jpg",
    price: "$64.00",
    stock: "38 units",
    defaultMetric: "sales",
    metrics: {
      sales: "$5.8k",
      views: "6.4k",
      stock: "38 units",
    },
  },
  {
    name: "Overnight Recovery Mask",
    category: "Mask",
    image:
      "/images/block/ecommerce/skin-care-product/pexels-carlos-diaz-216017-18350286-3.jpg",
    price: "$112.00",
    stock: "21 units",
    defaultMetric: "views",
    metrics: {
      sales: "$7.6k",
      views: "11.1k",
      stock: "21 units",
    },
  },
  {
    name: "Daily Barrier Lotion",
    category: "Moisturizer",
    image:
      "/images/block/ecommerce/skin-care-product/pexels-karolina-grabowska-4938448-3.jpg",
    price: "$58.00",
    stock: "73 units",
    defaultMetric: "stock",
    metrics: {
      sales: "$4.7k",
      views: "7.2k",
      stock: "73 units",
    },
  },
  {
    name: "Cloud Silk Toner",
    category: "Toner",
    image:
      "/images/block/ecommerce/skin-care-product/pexels-volkerthimm-19049367-3.jpg",
    price: "$46.00",
    stock: "64 units",
    defaultMetric: "views",
    metrics: {
      sales: "$3.9k",
      views: "8.7k",
      stock: "64 units",
    },
  },
  {
    name: "Micro Peel Serum",
    category: "Serum",
    image:
      "/images/block/ecommerce/skin-care-product/pexels-rdne-8903695-3.jpg",
    price: "$88.00",
    stock: "29 units",
    defaultMetric: "sales",
    metrics: {
      sales: "$6.9k",
      views: "9.1k",
      stock: "29 units",
    },
  },
  {
    name: "Botanical Body Polish",
    category: "Body Care",
    image:
      "/images/block/ecommerce/skin-care-product/pexels-shkrabaanthony-6187540-3.jpg",
    price: "$52.00",
    stock: "47 units",
    defaultMetric: "views",
    metrics: {
      sales: "$4.3k",
      views: "7.6k",
      stock: "47 units",
    },
  },
];

const chartLabels: Record<MetricKey, string> = {
  sales: "Sales",
  views: "Views",
  stock: "Stock",
};

const productUpdatedWithinDays: Record<string, number> = {
  "Radiance Ritual Set": 5,
  "Timeless Renewal Cream": 12,
  "Radiant Lock Mist": 23,
  "HydraBloom Night Cream": 44,
  "PureEssence Soap Trio": 72,
  "Radiance Boost Serum": 8,
  "Barrier Repair Drops": 18,
  "Dew Reset Essence": 29,
  "Velvet Cleanse Balm": 36,
  "Overnight Recovery Mask": 58,
  "Daily Barrier Lotion": 9,
  "Cloud Silk Toner": 26,
  "Micro Peel Serum": 34,
  "Botanical Body Polish": 67,
};

const rangeOptions = [
  { value: "all-time", label: "All time", maxDays: Number.POSITIVE_INFINITY },
  { value: "last-7-days", label: "Last 7 days", maxDays: 7 },
  { value: "last-30-days", label: "Last 30 days", maxDays: 30 },
  { value: "last-quarter", label: "Last quarter", maxDays: 90 },
] as const;

const sortOptions = [
  { value: "newest", label: "Newest" },
  { value: "best-selling", label: "Best selling" },
  { value: "low-stock", label: "Low stock" },
] as const;

const stockFilterOptions = [
  { value: "all", label: "All stock" },
  { value: "high", label: "High stock" },
  { value: "low", label: "Low stock" },
] as const;

type RangeOption = (typeof rangeOptions)[number]["value"];
type SortOption = (typeof sortOptions)[number]["value"];
type StockFilterOption = (typeof stockFilterOptions)[number]["value"];

function getStockUnits(stock: string) {
  return Number.parseInt(stock, 10);
}

function getSalesValue(value: string) {
  return Number.parseFloat(value.replace(/[$k,]/g, "")) * 1000;
}

const miniChartConfig = {
  value: {
    label: "Value",
    color: "var(--primary)",
  },
} satisfies ChartConfig;

function getMetricSeries(metric: MetricKey, seed: number) {
  const presets: Record<MetricKey, number[]> = {
    sales: [22, 16, 30, 18, 32, 20, 28, 23, 27, 19, 24, 31, 18, 26, 20],
    views: [10, 16, 12, 18, 15, 21, 19, 24, 18, 22, 26, 21],
    stock: [72, 69, 71, 66, 63, 60, 58, 55, 53, 50, 48, 45],
  };

  return presets[metric].map((value, index) => {
    const modifier = ((seed + index) % 5) - 2;
    return {
      label: `${index + 1}`,
      value: Math.max(8, value + modifier * (metric === "stock" ? 1 : 2)),
    };
  });
}

function MiniLineChart({ data }: { data: ReturnType<typeof getMetricSeries> }) {
  return (
    <ChartContainer
      config={miniChartConfig}
      className="aspect-auto h-20 w-full"
    >
      <LineChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" hide />
        <YAxis hide />
        <Line
          dataKey="value"
          type="monotone"
          stroke="var(--color-value)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  );
}

function MiniBarChart({ data }: { data: ReturnType<typeof getMetricSeries> }) {
  return (
    <ChartContainer
      config={miniChartConfig}
      className="aspect-auto h-20 w-full"
    >
      <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" hide />
        <YAxis hide />
        <Bar
          dataKey="value"
          fill="var(--color-value)"
          radius={[4, 4, 0, 0]}
          barSize={12}
        />
      </BarChart>
    </ChartContainer>
  );
}

function MiniAreaChart({ data }: { data: ReturnType<typeof getMetricSeries> }) {
  return (
    <ChartContainer
      config={miniChartConfig}
      className="aspect-auto h-20 w-full"
    >
      <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" hide />
        <YAxis hide />
        <Area
          dataKey="value"
          type="monotone"
          stroke="var(--color-value)"
          strokeWidth={2}
          fill="var(--color-value)"
          fillOpacity={0.14}
        />
      </AreaChart>
    </ChartContainer>
  );
}

const percentFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function EcommerceProductList3() {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [rangeFilter, setRangeFilter] = React.useState<RangeOption>("all-time");
  const [sortBy, setSortBy] = React.useState<SortOption>("newest");
  const [stockFilter, setStockFilter] =
    React.useState<StockFilterOption>("all");
  const deferredSearchQuery = React.useDeferredValue(searchQuery);
  const normalizedSearchQuery = deferredSearchQuery.trim().toLowerCase();
  const selectedStockFilterLabel =
    stockFilterOptions.find((option) => option.value === stockFilter)?.label ??
    stockFilterOptions[0].label;

  const filteredProducts = React.useMemo(() => {
    const selectedRange =
      rangeOptions.find((option) => option.value === rangeFilter) ??
      rangeOptions[0];

    const nextProducts = productCards.filter((product) => {
      const searchTarget = [
        product.name,
        product.category,
        product.price,
        product.stock,
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        normalizedSearchQuery.length === 0 ||
        searchTarget.includes(normalizedSearchQuery);
      const matchesRange =
        (productUpdatedWithinDays[product.name] ?? Number.MAX_SAFE_INTEGER) <=
        selectedRange.maxDays;
      const stockUnits = getStockUnits(product.stock);
      const matchesStock =
        stockFilter === "all" ||
        (stockFilter === "high" && stockUnits >= 50) ||
        (stockFilter === "low" && stockUnits < 50);

      return matchesSearch && matchesRange && matchesStock;
    });

    nextProducts.sort((left, right) => {
      if (sortBy === "best-selling") {
        return (
          getSalesValue(right.metrics.sales) - getSalesValue(left.metrics.sales)
        );
      }

      if (sortBy === "low-stock") {
        return getStockUnits(left.stock) - getStockUnits(right.stock);
      }

      return (
        (productUpdatedWithinDays[left.name] ?? Number.MAX_SAFE_INTEGER) -
        (productUpdatedWithinDays[right.name] ?? Number.MAX_SAFE_INTEGER)
      );
    });

    return nextProducts;
  }, [normalizedSearchQuery, rangeFilter, sortBy, stockFilter]);

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-auto">
      <div className="flex flex-col gap-6 p-4 md:p-6">
        <section className="border-border/70 border-b border-dashed pb-4">
          <div className="flex flex-col gap-4 md:hidden">
            <div className="border-border/70 bg-background flex size-10 shrink-0 items-center justify-center rounded-2xl border">
              <Package className="text-muted-foreground size-4.5" />
            </div>

            <div className="space-y-1.5">
              <h1 className="text-xl font-semibold tracking-tight">
                My Products
              </h1>
              <p className="text-muted-foreground max-w-[18rem] text-sm leading-6">
                Manage and collaborate on your product listings.
              </p>
            </div>

            <Button className="h-11 w-full rounded-xl shadow-none" asChild>
              <a href="/ecommerce/add-product">
                <Plus className="size-4" />
                New Products
              </a>
            </Button>
          </div>

          <div className="hidden gap-3 md:flex xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-start gap-3">
              <div className="border-border/70 bg-background flex size-10 shrink-0 items-center justify-center rounded-2xl border">
                <Package className="text-muted-foreground size-4.5" />
              </div>
              <div className="space-y-1">
                <h1 className="text-lg font-semibold tracking-tight md:text-xl">
                  My Products
                </h1>
                <p className="text-muted-foreground text-sm">
                  Manage and collaborate on your product listings.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start">
              <Button className="h-10 rounded-xl px-4 shadow-none" asChild>
                <a href="/ecommerce/add-product">
                  <Plus className="size-4" />
                  New Products
                </a>
              </Button>
            </div>
          </div>
        </section>

        <section className="border-border/70 hidden border-b border-dashed py-2 pb-6 md:block">
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4 xl:gap-0">
            {productListStats.map((stat, index) => {
              const isPositive = stat.delta >= 0;
              const deltaLabel = `${isPositive ? "+" : ""}${percentFormatter.format(
                stat.delta,
              )}%`;

              return (
                <section
                  key={stat.title}
                  className={cn(
                    "space-y-2 py-2 sm:py-1",
                    index > 0 && "xl:border-border/70 xl:border-l",
                    index === 0 && "xl:pr-8",
                    index > 0 &&
                      index < productListStats.length - 1 &&
                      "xl:px-8",
                    index === productListStats.length - 1 && "xl:pl-8",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-muted-foreground text-sm">
                      {stat.title}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <p className="text-3xl leading-none font-semibold tracking-tight tabular-nums">
                        {stat.value}
                      </p>
                      <span
                        className={cn(
                          "text-sm",
                          isPositive ? "text-emerald-600" : "text-rose-600",
                        )}
                      >
                        {deltaLabel}
                      </span>
                    </div>
                    <span className="text-muted-foreground block text-sm">
                      {stat.context}
                    </span>
                  </div>
                </section>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 md:hidden">
            <div className="relative min-w-0">
              <Search className="text-muted-foreground absolute top-1/2 left-4 size-4 -translate-y-1/2" />
              <Input
                type="search"
                placeholder="Search products..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="border-border/70 bg-background h-12 rounded-2xl pl-11 text-sm shadow-none"
              />
            </div>

            <div className="flex min-w-0 items-center gap-2">
              <Select
                value={rangeFilter}
                onValueChange={(value) => setRangeFilter(value as RangeOption)}
              >
                <SelectTrigger className="border-border/70 bg-background h-10 min-w-0 flex-1 rounded-2xl px-3 shadow-none">
                  <SelectValue placeholder="Last 7 days" />
                </SelectTrigger>
                <SelectContent>
                  {rangeOptions.map((option) => (
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
                    className="border-border/70 h-10 shrink-0 rounded-2xl px-3 shadow-none"
                  >
                    <SlidersHorizontal className="size-4" />
                    {selectedStockFilterLabel}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuRadioGroup
                    value={stockFilter}
                    onValueChange={(value) =>
                      setStockFilter(value as StockFilterOption)
                    }
                  >
                    {stockFilterOptions.map((option) => (
                      <DropdownMenuRadioItem
                        key={option.value}
                        value={option.value}
                      >
                        {option.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="hidden gap-3 md:grid md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_auto_auto_auto] xl:items-center">
            <div className="relative min-w-0 md:col-span-2 xl:col-span-1">
              <Search className="text-muted-foreground absolute top-1/2 left-4 size-4 -translate-y-1/2" />
              <Input
                type="search"
                placeholder="Search products..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="border-border/70 bg-background h-12 rounded-2xl pl-11 text-sm shadow-none"
              />
            </div>

            <Select
              value={rangeFilter}
              onValueChange={(value) => setRangeFilter(value as RangeOption)}
            >
              <SelectTrigger className="border-border/70 bg-background h-12 w-full min-w-[156px] rounded-2xl shadow-none">
                <SelectValue placeholder="Last 7 days" />
              </SelectTrigger>
              <SelectContent>
                {rangeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={sortBy}
              onValueChange={(value) => setSortBy(value as SortOption)}
            >
              <SelectTrigger className="border-border/70 bg-background h-12 w-full min-w-[132px] rounded-2xl shadow-none">
                <SelectValue placeholder="Newest" />
              </SelectTrigger>
              <SelectContent>
                {sortOptions.map((option) => (
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
                  className="border-border/70 h-12 rounded-2xl px-4 shadow-none md:w-fit"
                >
                  <SlidersHorizontal className="size-4" />
                  {selectedStockFilterLabel}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuRadioGroup
                  value={stockFilter}
                  onValueChange={(value) =>
                    setStockFilter(value as StockFilterOption)
                  }
                >
                  {stockFilterOptions.map((option) => (
                    <DropdownMenuRadioItem
                      key={option.value}
                      value={option.value}
                    >
                      {option.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {filteredProducts.length > 0 ? (
            <div className="columns-1 [column-gap:1rem] sm:columns-2 xl:columns-4">
              {filteredProducts.map((product, index) => (
                <article
                  key={product.name}
                  className="mb-4 inline-block w-full break-inside-avoid rounded-xl"
                >
                  <div className="bg-muted/20 relative aspect-[0.9] overflow-hidden overscroll-auto rounded-t-xl">
                    <Image
                      src={product.image}
                      alt={product.name}
                      fill
                      sizes="(min-width: 1536px) 20vw, (min-width: 640px) 40vw, 100vw"
                      className="object-cover"
                    />

                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-3 right-3 size-8 rounded-full bg-black/20 text-white hover:bg-black/30 hover:text-white"
                      aria-label={`More options for ${product.name}`}
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </div>

                  <Accordion
                    type="single"
                    collapsible
                    defaultValue={index === 0 ? "details" : undefined}
                    className="-mt-px"
                  >
                    <AccordionItem
                      value="details"
                      className="group/accordion border-border/60 bg-card overflow-hidden overscroll-auto rounded-b-xl border border-t-0"
                    >
                      <AccordionTrigger className="items-start gap-3 px-4 py-3 hover:no-underline focus-visible:ring-0 focus-visible:outline-hidden [&>svg]:hidden">
                        <div className="min-w-0 flex-1 text-left">
                          <h2 className="truncate text-[1rem] font-medium tracking-tight">
                            {product.name}
                          </h2>
                          <p className="text-muted-foreground mt-1 text-sm">
                            {product.category}
                          </p>
                        </div>
                        <div className="text-muted-foreground mt-1 shrink-0">
                          <ChevronUp className="size-4 transition-transform duration-200 group-data-[state=closed]/accordion:rotate-180" />
                        </div>
                      </AccordionTrigger>

                      <AccordionContent className="overscroll-auto px-4 pt-0 pb-4">
                        <div className="border-border/70 grid grid-cols-2 gap-3 border-t border-dashed pt-4">
                          <div className="space-y-1">
                            <p className="text-muted-foreground text-xs">
                              Price
                            </p>
                            <p className="text-sm font-medium">
                              {product.price}
                            </p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-muted-foreground text-xs">
                              Stock
                            </p>
                            <p className="text-sm font-medium">
                              {product.stock}
                              <span className="ml-1 text-emerald-600">↗</span>
                            </p>
                          </div>
                        </div>

                        <Tabs
                          defaultValue={product.defaultMetric}
                          className="mt-4"
                        >
                          <TabsList className="h-8 w-full p-0.5">
                            {(["sales", "views", "stock"] as MetricKey[]).map(
                              (metric) => (
                                <TabsTrigger
                                  key={metric}
                                  value={metric}
                                  className="flex-1 px-2 py-1 text-xs"
                                >
                                  {chartLabels[metric]}
                                </TabsTrigger>
                              ),
                            )}
                          </TabsList>

                          <TabsContent
                            value="sales"
                            className="mt-3 focus-visible:ring-0"
                          >
                            <MiniLineChart
                              data={getMetricSeries("sales", index)}
                            />
                          </TabsContent>

                          <TabsContent
                            value="views"
                            className="mt-3 focus-visible:ring-0"
                          >
                            <MiniBarChart
                              data={getMetricSeries("views", index)}
                            />
                          </TabsContent>

                          <TabsContent
                            value="stock"
                            className="mt-3 focus-visible:ring-0"
                          >
                            <MiniAreaChart
                              data={getMetricSeries("stock", index)}
                            />
                          </TabsContent>
                        </Tabs>

                        <div className="mt-2 flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-9 rounded-lg px-4 shadow-none"
                            asChild
                          >
                            <Link href={getProductDetailHref(product.name)}>
                              View
                            </Link>
                          </Button>
                          <Button className="h-9 flex-1 rounded-lg" asChild>
                            <Link href={getProductEditHref(product.name)}>
                              Edit Product
                            </Link>
                          </Button>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </article>
              ))}
            </div>
          ) : (
            <div className="border-border/70 bg-muted/10 flex min-h-52 items-center justify-center rounded-2xl border border-dashed px-6 py-10 text-center">
              <div className="space-y-2">
                <p className="text-base font-medium">No products found</p>
                <p className="text-muted-foreground text-sm">
                  Try a different product name or category.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
