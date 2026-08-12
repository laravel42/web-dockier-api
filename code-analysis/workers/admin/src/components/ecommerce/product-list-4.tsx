"use client";

import {
  DollarSign,
  MoreHorizontal,
  Package,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Tags,
  TriangleAlert,
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
import {
  getProductDetailHref,
  getProductEditHref,
} from "@/lib/ecommerce-edit-products";
import {
  inventoryCards,
  type ProductInventoryCard,
} from "@/lib/ecommerce-product-catalog";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "active" | "inactive" | "draft";
type ProductTypeFilter = "all" | "Retail" | "Wholesale";
type StockAlertFilter = "all" | "high" | "low";
type SortOption =
  | "alphabetical-asc"
  | "alphabetical-desc"
  | "price-low"
  | "price-high"
  | "stock-low"
  | "stock-high";

const sortOptions: { label: string; value: SortOption }[] = [
  { label: "Alphabetical: A-Z", value: "alphabetical-asc" },
  { label: "Alphabetical: Z-A", value: "alphabetical-desc" },
  { label: "Price: low to high", value: "price-low" },
  { label: "Price: high to low", value: "price-high" },
  { label: "Stock: low to high", value: "stock-low" },
  { label: "Stock: high to low", value: "stock-high" },
];

const categoryOptions = [
  "all",
  ...new Set(inventoryCards.map((product) => product.category)),
];

function getPriceFloor(value: string) {
  const matches = value.match(/\d+(\.\d+)?/g);

  if (!matches || matches.length === 0) {
    return 0;
  }

  return Number(matches[0]);
}

function parseOptionalNumber(value: string) {
  if (value.trim().length === 0) {
    return null;
  }

  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function statusCountLabel(filter: StatusFilter) {
  if (filter === "active") {
    return inventoryCards.filter((product) => product.status === "Active")
      .length;
  }

  if (filter === "draft") {
    return inventoryCards.filter((product) => product.status === "Draft")
      .length;
  }

  if (filter === "inactive") {
    return 0;
  }

  return inventoryCards.length;
}

function statusMatchesFilter(
  product: ProductInventoryCard,
  statusFilter: StatusFilter,
) {
  if (statusFilter === "all") {
    return true;
  }

  if (statusFilter === "inactive") {
    return false;
  }

  if (statusFilter === "active") {
    return product.status === "Active";
  }

  return product.status === "Draft";
}

function stockMatchesFilter(
  product: ProductInventoryCard,
  stockAlertFilter: StockAlertFilter,
) {
  if (stockAlertFilter === "all") {
    return true;
  }

  if (stockAlertFilter === "high") {
    return product.stockTone === "High";
  }

  return product.stockTone === "Low";
}

function sortProducts(products: ProductInventoryCard[], sortBy: SortOption) {
  return [...products].sort((left, right) => {
    if (sortBy === "alphabetical-asc") {
      return left.name.localeCompare(right.name);
    }

    if (sortBy === "alphabetical-desc") {
      return right.name.localeCompare(left.name);
    }

    if (sortBy === "price-low") {
      return getPriceFloor(left.retail) - getPriceFloor(right.retail);
    }

    if (sortBy === "price-high") {
      return getPriceFloor(right.retail) - getPriceFloor(left.retail);
    }

    if (sortBy === "stock-low") {
      return left.stock - right.stock;
    }

    return right.stock - left.stock;
  });
}

function ProductStatusButton({
  active,
  count,
  label,
  onClick,
}: {
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-11 items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors",
        active
          ? "text-foreground border-primary/40 bg-primary/8"
          : "border-border/50 text-muted-foreground hover:text-foreground bg-transparent",
      )}
    >
      <span className="text-sm font-medium">{label}</span>
      <span
        className={cn(
          "rounded-md px-2 py-0.5 text-xs font-medium",
          active
            ? "bg-primary/12 text-primary"
            : "bg-muted text-muted-foreground",
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
      <h2 className="text-foreground/85 text-[14px] font-medium tracking-normal">
        {title}
      </h2>
      {children}
    </section>
  );
}

function RowActions({ product }: { product: ProductInventoryCard }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground size-10 rounded-lg"
          aria-label={`Open actions for ${product.name}`}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem asChild>
          <Link href={getProductEditHref(product.name)}>Edit product</Link>
        </DropdownMenuItem>
        <DropdownMenuItem>Duplicate</DropdownMenuItem>
        <DropdownMenuItem>Audit stock</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProductListRow({ product }: { product: ProductInventoryCard }) {
  return (
    <article className="border-border/60 border-b border-dotted py-5 last:border-b-0">
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1.7fr)_1px_150px_1px_170px_auto] lg:items-center lg:gap-x-5 lg:gap-y-0">
        <div className="flex min-w-0 items-center gap-4">
          <div className="bg-muted/30 relative size-[4.5rem] shrink-0 overflow-hidden rounded-xl">
            <Link
              href={getProductDetailHref(product.name)}
              aria-label={`View ${product.name}`}
              className="absolute inset-0"
            >
              <Image
                src={product.image}
                alt={product.name}
                fill
                sizes="72px"
                className="object-cover"
              />
            </Link>
          </div>

          <div className="min-w-0 flex-1">
            <Link
              href={getProductDetailHref(product.name)}
              className="line-clamp-2 text-lg font-semibold tracking-tight hover:underline"
            >
              {product.name}
            </Link>

            <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              {product.variants > 1 ? (
                <Badge className="rounded-md bg-sky-500/12 px-2 py-0.5 text-sky-600 hover:bg-sky-500/12">
                  {product.variants} variants
                </Badge>
              ) : null}
              <span>{product.category}</span>
              <span className="text-border">•</span>
              <span>{product.productType} catalog</span>
              <span className="text-border">•</span>
              <span>
                {product.stock} in stock
                {product.stockTone === "Low" ? (
                  <span className="ml-2 text-rose-600">low</span>
                ) : null}
              </span>
            </div>
          </div>
        </div>

        <div className="border-border/60 hidden h-14 border-l border-dotted lg:block" />

        <div className="flex min-w-[140px] flex-col gap-1">
          <span className="text-muted-foreground text-[11px] font-semibold tracking-[0.16em] uppercase">
            Retail Price
          </span>
          <span className="text-base font-semibold">{product.retail}</span>
        </div>

        <div className="border-border/60 hidden h-14 border-l border-dotted lg:block" />

        <div className="flex min-w-[170px] flex-col gap-1">
          <span className="text-muted-foreground text-[11px] font-semibold tracking-[0.16em] uppercase">
            Wholesale Price
          </span>
          <span className="text-base font-semibold">{product.wholesale}</span>
        </div>

        <div className="self-start lg:justify-self-end">
          <RowActions product={product} />
        </div>
      </div>
    </article>
  );
}

export function EcommerceProductList4() {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [productTypeFilter, setProductTypeFilter] =
    React.useState<ProductTypeFilter>("all");
  const [sortBy, setSortBy] = React.useState<SortOption>("alphabetical-asc");
  const [stockAlertFilter, setStockAlertFilter] =
    React.useState<StockAlertFilter>("all");
  const [categoryFilter, setCategoryFilter] = React.useState("all");
  const [minimumPrice, setMinimumPrice] = React.useState("");
  const [maximumPrice, setMaximumPrice] = React.useState("");
  const deferredSearchQuery = React.useDeferredValue(searchQuery);
  const normalizedSearchQuery = deferredSearchQuery.trim().toLowerCase();

  const filteredProducts = React.useMemo(() => {
    const minimum = parseOptionalNumber(minimumPrice);
    const maximum = parseOptionalNumber(maximumPrice);

    const nextProducts = inventoryCards.filter((product) => {
      const searchTarget = [
        product.name,
        product.sku,
        product.category,
        product.productType,
        ...product.channels,
      ]
        .join(" ")
        .toLowerCase();
      const retailFloor = getPriceFloor(product.retail);
      const matchesSearch =
        normalizedSearchQuery.length === 0 ||
        searchTarget.includes(normalizedSearchQuery);
      const matchesStatus = statusMatchesFilter(product, statusFilter);
      const matchesProductType =
        productTypeFilter === "all" ||
        product.productType === productTypeFilter;
      const matchesStockAlert = stockMatchesFilter(product, stockAlertFilter);
      const matchesCategory =
        categoryFilter === "all" || product.category === categoryFilter;
      const matchesMinimum = minimum === null || retailFloor >= minimum;
      const matchesMaximum = maximum === null || retailFloor <= maximum;

      return (
        matchesSearch &&
        matchesStatus &&
        matchesProductType &&
        matchesStockAlert &&
        matchesCategory &&
        matchesMinimum &&
        matchesMaximum
      );
    });

    return sortProducts(nextProducts, sortBy);
  }, [
    categoryFilter,
    maximumPrice,
    minimumPrice,
    normalizedSearchQuery,
    productTypeFilter,
    sortBy,
    statusFilter,
    stockAlertFilter,
  ]);

  function resetFilters() {
    setSearchQuery("");
    setStatusFilter("all");
    setProductTypeFilter("all");
    setSortBy("alphabetical-asc");
    setStockAlertFilter("all");
    setCategoryFilter("all");
    setMinimumPrice("");
    setMaximumPrice("");
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col gap-6 p-4 md:p-6">
        <section className="border-border/70 border-b border-dashed pb-4">
          <div className="flex flex-col gap-4 md:hidden">
            <div className="border-border/70 bg-background flex size-10 shrink-0 items-center justify-center rounded-xl border">
              <Package className="text-muted-foreground size-4.5" />
            </div>

            <div className="flex flex-col gap-1.5">
              <h1 className="text-xl font-semibold tracking-tight">
                Product List 4
              </h1>
              <p className="text-muted-foreground max-w-[18rem] text-sm leading-6">
                Sidebar-driven catalog filtering with dense merchandiser rows.
              </p>
            </div>

            <Button className="h-11 w-full rounded-lg shadow-none" asChild>
              <Link href="/ecommerce/add-product">
                <Plus className="size-4" />
                New Products
              </Link>
            </Button>
          </div>

          <div className="hidden gap-4 md:flex md:flex-row md:items-start md:justify-between xl:items-center">
            <div className="flex items-start gap-3">
              <div className="border-border/70 bg-background flex size-10 shrink-0 items-center justify-center rounded-xl border">
                <Package className="text-muted-foreground size-4.5" />
              </div>
              <div className="flex flex-col gap-1">
                <h1 className="text-lg font-semibold tracking-tight md:text-xl">
                  Product List 4
                </h1>
                <p className="text-muted-foreground text-sm">
                  Sidebar-driven catalog filtering with dense merchandiser rows.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start">
              <Button className="h-10 rounded-lg px-4 shadow-none" asChild>
                <Link href="/ecommerce/add-product">
                  <Plus className="size-4" />
                  New Products
                </Link>
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
                  placeholder="Search products..."
                  className="border-border/60 h-11 rounded-lg bg-transparent pr-4 pl-11 shadow-none"
                />
              </div>

              <SidebarSection title="Product status">
                <div className="grid grid-cols-2 gap-2">
                  <ProductStatusButton
                    active={statusFilter === "all"}
                    count={statusCountLabel("all")}
                    label="All"
                    onClick={() => setStatusFilter("all")}
                  />
                  <ProductStatusButton
                    active={statusFilter === "active"}
                    count={statusCountLabel("active")}
                    label="Active"
                    onClick={() => setStatusFilter("active")}
                  />
                  <ProductStatusButton
                    active={statusFilter === "inactive"}
                    count={statusCountLabel("inactive")}
                    label="Inactive"
                    onClick={() => setStatusFilter("inactive")}
                  />
                  <ProductStatusButton
                    active={statusFilter === "draft"}
                    count={statusCountLabel("draft")}
                    label="Draft"
                    onClick={() => setStatusFilter("draft")}
                  />
                </div>
              </SidebarSection>

              <SidebarSection title="Product type">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "border-border/60 h-11 rounded-lg bg-transparent px-4 shadow-none",
                      productTypeFilter === "Retail" &&
                        "border-primary/40 bg-primary/8 text-foreground",
                    )}
                    onClick={() =>
                      setProductTypeFilter((current) =>
                        current === "Retail" ? "all" : "Retail",
                      )
                    }
                  >
                    Retail
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "border-border/60 h-11 rounded-lg bg-transparent px-4 shadow-none",
                      productTypeFilter === "Wholesale" &&
                        "border-primary/40 bg-primary/8 text-foreground",
                    )}
                    onClick={() =>
                      setProductTypeFilter((current) =>
                        current === "Wholesale" ? "all" : "Wholesale",
                      )
                    }
                  >
                    Wholesale
                  </Button>
                </div>
              </SidebarSection>

              <SidebarSection title="Sort by">
                <Select
                  value={sortBy}
                  onValueChange={(value) => setSortBy(value as SortOption)}
                >
                  <SelectTrigger className="border-border/60 h-11 rounded-lg bg-transparent px-4 shadow-none">
                    <SelectValue placeholder="Sort products" />
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
              </SidebarSection>

              <SidebarSection title="Stock alert">
                <Select
                  value={stockAlertFilter}
                  onValueChange={(value) =>
                    setStockAlertFilter(value as StockAlertFilter)
                  }
                >
                  <SelectTrigger className="border-border/60 h-11 rounded-lg bg-transparent px-4 shadow-none">
                    <SelectValue placeholder="All stock" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="all">All stock</SelectItem>
                      <SelectItem value="high">High stock</SelectItem>
                      <SelectItem value="low">Low stock</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </SidebarSection>

              <SidebarSection title="Category">
                <Select
                  value={categoryFilter}
                  onValueChange={setCategoryFilter}
                >
                  <SelectTrigger className="border-border/60 h-11 rounded-lg bg-transparent px-4 shadow-none">
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {categoryOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option === "all" ? "All categories" : option}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </SidebarSection>

              <SidebarSection title="Price">
                <div className="flex flex-col gap-2">
                  <div className="relative">
                    <DollarSign className="text-muted-foreground absolute top-1/2 left-4 size-4 -translate-y-1/2" />
                    <Input
                      inputMode="decimal"
                      value={minimumPrice}
                      onChange={(event) => setMinimumPrice(event.target.value)}
                      placeholder="Minimum price"
                      className="border-border/60 h-11 rounded-lg bg-transparent pr-4 pl-11 shadow-none"
                    />
                  </div>
                  <div className="relative">
                    <DollarSign className="text-muted-foreground absolute top-1/2 left-4 size-4 -translate-y-1/2" />
                    <Input
                      inputMode="decimal"
                      value={maximumPrice}
                      onChange={(event) => setMaximumPrice(event.target.value)}
                      placeholder="Maximum price"
                      className="border-border/60 h-11 rounded-lg bg-transparent pr-4 pl-11 shadow-none"
                    />
                  </div>
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
                    {filteredProducts.length} products
                  </Badge>
                  {productTypeFilter !== "all" ? (
                    <Badge variant="outline" className="rounded-md px-2.5 py-1">
                      {productTypeFilter}
                    </Badge>
                  ) : null}
                </div>
                <p className="text-muted-foreground text-sm">
                  Reusing the inventory catalog with a filter sidebar and
                  compact row layout.
                </p>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="border-border/60 text-muted-foreground hover:text-foreground size-10 shrink-0 rounded-xl p-0 shadow-none lg:mr-1 lg:justify-self-end"
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
                      Bulk Labels
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <TriangleAlert className="size-4" />
                      Stock Alerts
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {filteredProducts.length > 0 ? (
              <div className="min-h-0 flex-1 overflow-y-auto xl:pr-3">
                <div className="flex flex-col">
                  {filteredProducts.map((product) => (
                    <ProductListRow key={product.sku} product={product} />
                  ))}
                </div>
              </div>
            ) : (
              <div className="border-border/60 flex min-h-64 items-center justify-center border border-dashed px-6 py-10 text-center">
                <div className="flex max-w-sm flex-col gap-2">
                  <p className="text-base font-medium">No products found</p>
                  <p className="text-muted-foreground text-sm">
                    Adjust one of the filters in the sidebar and the shared
                    inventory catalog will repopulate here.
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
