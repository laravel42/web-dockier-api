"use client";

import { ChevronDown, Ellipsis, Plus, Search, Settings2 } from "lucide-react";
import Image from "next/image";
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
import {
  getProductDetailHref,
  getProductEditHref,
} from "@/lib/ecommerce-edit-products";
import { cn } from "@/lib/utils";

type SortKey =
  | "name"
  | "sku"
  | "category"
  | "supplier"
  | "stockUnits"
  | "unitPrice";

type SortDirection = "asc" | "desc";
type StockLevel = "High" | "Low" | "Out";
type ColumnKey = "name" | "sku" | "category" | "supplier" | "stock" | "price";

export type EcommerceProductList1SearchParams = {
  category?: string | string[];
  columns?: string | string[];
  direction?: string | string[];
  query?: string | string[];
  sort?: string | string[];
  stock?: string | string[];
  supplier?: string | string[];
};

type ProductRow = {
  id: string;
  name: string;
  sku: string;
  category: string;
  supplier: string;
  supplierLocation?: string;
  stockUnits: number;
  stockLevel: StockLevel;
  stockProgress: number;
  unitPrice: number;
  image: string;
};

const products: ProductRow[] = [
  {
    id: "prod-01",
    name: "Radiance Ritual Set",
    sku: "SKU-SKIN-4006",
    category: "Skincare Set",
    supplier: "Retail",
    supplierLocation: "+2 · Dropship",
    stockUnits: 210,
    stockLevel: "High",
    stockProgress: 76,
    unitPrice: 389,
    image:
      "/images/block/ecommerce/skin-care-product/pexels-amelie-chen-243775000-12352170-3.jpg",
  },
  {
    id: "prod-02",
    name: "Timeless Renewal Cream",
    sku: "SKU-CREAM-9902",
    category: "Cream",
    supplier: "Premium",
    supplierLocation: "Inventory",
    stockUnits: 12,
    stockLevel: "Low",
    stockProgress: 12,
    unitPrice: 199,
    image:
      "/images/block/ecommerce/skin-care-product/pexels-carlos-diaz-216017-18350286-3.jpg",
  },
  {
    id: "prod-03",
    name: "HydraBloom Night Cream",
    sku: "SKU-BALM-8928",
    category: "Cream",
    supplier: "Retail",
    supplierLocation: "+2 · Dropship",
    stockUnits: 341,
    stockLevel: "High",
    stockProgress: 92,
    unitPrice: 99,
    image:
      "/images/block/ecommerce/skin-care-product/pexels-volkerthimm-19049367-3.jpg",
  },
  {
    id: "prod-04",
    name: "Radiant Lock Mist",
    sku: "SKU-SERUM-7811",
    category: "Serum",
    supplier: "Retail",
    supplierLocation: "Inventory",
    stockUnits: 67,
    stockLevel: "High",
    stockProgress: 54,
    unitPrice: 69,
    image:
      "/images/block/ecommerce/skin-care-product/pexels-rdne-8903695-3.jpg",
  },
  {
    id: "prod-05",
    name: "PureEssence Soap Trio",
    sku: "SKU-SOAP-5214",
    category: "Soap",
    supplier: "Bundles",
    supplierLocation: "+1",
    stockUnits: 28,
    stockLevel: "Low",
    stockProgress: 22,
    unitPrice: 59,
    image:
      "/images/block/ecommerce/skin-care-product/pexels-shkrabaanthony-6187540-3.jpg",
  },
  {
    id: "prod-06",
    name: "Barrier Repair Drops",
    sku: "SKU-TREAT-6612",
    category: "Treatment",
    supplier: "Retail",
    supplierLocation: "Subscription",
    stockUnits: 96,
    stockLevel: "High",
    stockProgress: 61,
    unitPrice: 84,
    image:
      "/images/block/ecommerce/skin-care-product/pexels-karolina-grabowska-4938448-3.jpg",
  },
  {
    id: "prod-07",
    name: "Dew Reset Essence",
    sku: "SKU-ESSN-2084",
    category: "Essence",
    supplier: "Retail",
    supplierLocation: "Subscription",
    stockUnits: 55,
    stockLevel: "High",
    stockProgress: 48,
    unitPrice: 74,
    image:
      "/images/block/ecommerce/skin-care-product/nora-hutton-AjU6Z5k_uBI-unsplash-3.jpg",
  },
  {
    id: "prod-08",
    name: "Velvet Cleanse Balm",
    sku: "SKU-CLEAN-1148",
    category: "Cleanser",
    supplier: "Bundle",
    supplierLocation: "+1",
    stockUnits: 38,
    stockLevel: "Low",
    stockProgress: 30,
    unitPrice: 64,
    image:
      "/images/block/ecommerce/skin-care-product/pexels-amelie-chen-243775000-12352170-3.jpg",
  },
  {
    id: "prod-09",
    name: "Overnight Recovery Mask",
    sku: "SKU-MASK-5501",
    category: "Mask",
    supplier: "Premium",
    supplierLocation: "Inventory",
    stockUnits: 21,
    stockLevel: "Low",
    stockProgress: 18,
    unitPrice: 112,
    image:
      "/images/block/ecommerce/skin-care-product/pexels-carlos-diaz-216017-18350286-3.jpg",
  },
  {
    id: "prod-10",
    name: "Cloud Silk Toner",
    sku: "SKU-TONER-7723",
    category: "Toner",
    supplier: "Retail",
    supplierLocation: "+2 · Dropship",
    stockUnits: 64,
    stockLevel: "High",
    stockProgress: 58,
    unitPrice: 46,
    image:
      "/images/block/ecommerce/skin-care-product/pexels-volkerthimm-19049367-3.jpg",
  },
  {
    id: "prod-11",
    name: "Micro Peel Serum",
    sku: "SKU-SERUM-4412",
    category: "Serum",
    supplier: "Premium",
    supplierLocation: "Inventory",
    stockUnits: 29,
    stockLevel: "Low",
    stockProgress: 26,
    unitPrice: 88,
    image:
      "/images/block/ecommerce/skin-care-product/pexels-rdne-8903695-3.jpg",
  },
  {
    id: "prod-12",
    name: "Botanical Body Polish",
    sku: "SKU-BODY-6118",
    category: "Body Care",
    supplier: "Retail",
    supplierLocation: "+1",
    stockUnits: 47,
    stockLevel: "High",
    stockProgress: 43,
    unitPrice: 52,
    image:
      "/images/block/ecommerce/skin-care-product/pexels-shkrabaanthony-6187540-3.jpg",
  },
];

const categoryOptions = [
  "all",
  ...new Set(products.map((product) => product.category)),
];
const supplierOptions = [
  "all",
  ...new Set(products.map((product) => product.supplier)),
];
const sortKeys: SortKey[] = [
  "name",
  "sku",
  "category",
  "supplier",
  "stockUnits",
  "unitPrice",
];
const columnKeys: ColumnKey[] = [
  "name",
  "sku",
  "category",
  "supplier",
  "stock",
  "price",
];
const defaultVisibleColumns: Record<ColumnKey, boolean> = {
  name: true,
  sku: true,
  category: true,
  supplier: true,
  stock: true,
  price: true,
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const stockStyles: Record<StockLevel, { text: string; bar: string }> = {
  High: {
    text: "text-emerald-600",
    bar: "bg-emerald-500",
  },
  Low: {
    text: "text-rose-600",
    bar: "bg-rose-500",
  },
  Out: {
    text: "text-muted-foreground",
    bar: "bg-slate-300",
  },
};

type ProductListState = {
  category: string;
  search: string;
  sortDirection: SortDirection;
  sortKey: SortKey;
  stockLevel: string;
  supplier: string;
  visibleColumns: Record<ColumnKey, boolean>;
};

function getSearchParamValue(
  source: EcommerceProductList1SearchParams | URLSearchParams | undefined,
  key: keyof EcommerceProductList1SearchParams,
) {
  if (!source) return undefined;
  if (source instanceof URLSearchParams) {
    return source.get(key) ?? undefined;
  }

  const value = source[key];
  return Array.isArray(value) ? value[0] : value;
}

function isSortKey(value: string | undefined): value is SortKey {
  return typeof value === "string" && sortKeys.includes(value as SortKey);
}

function isSortDirection(value: string | undefined): value is SortDirection {
  return value === "asc" || value === "desc";
}

function isColumnKey(value: string): value is ColumnKey {
  return columnKeys.includes(value as ColumnKey);
}

function parseVisibleColumns(
  value: string | undefined,
): Record<ColumnKey, boolean> {
  if (!value) return { ...defaultVisibleColumns };

  if (value === "none") {
    return columnKeys.reduce(
      (columns, column) => ({ ...columns, [column]: false }),
      {} as Record<ColumnKey, boolean>,
    );
  }

  const selectedColumns = value.split(",").filter(isColumnKey);

  if (selectedColumns.length === 0) {
    return { ...defaultVisibleColumns };
  }

  return columnKeys.reduce(
    (columns, column) => ({
      ...columns,
      [column]: selectedColumns.includes(column),
    }),
    {} as Record<ColumnKey, boolean>,
  );
}

function getInitialProductListState(
  searchParams?: EcommerceProductList1SearchParams | URLSearchParams,
): ProductListState {
  const query = getSearchParamValue(searchParams, "query") ?? "";
  const category = getSearchParamValue(searchParams, "category");
  const supplier = getSearchParamValue(searchParams, "supplier");
  const stock = getSearchParamValue(searchParams, "stock");
  const sort = getSearchParamValue(searchParams, "sort");
  const direction = getSearchParamValue(searchParams, "direction");
  const columns = getSearchParamValue(searchParams, "columns");

  return {
    search: query,
    category: category && categoryOptions.includes(category) ? category : "all",
    supplier: supplier && supplierOptions.includes(supplier) ? supplier : "all",
    stockLevel:
      stock === "all" || stock === "High" || stock === "Low" || stock === "Out"
        ? stock
        : "all",
    sortKey: isSortKey(sort) ? sort : "name",
    sortDirection: isSortDirection(direction) ? direction : "asc",
    visibleColumns: parseVisibleColumns(columns),
  };
}

function getVisibleColumnsQuery(
  visibleColumns: Record<ColumnKey, boolean>,
): string | undefined {
  const selectedColumns = columnKeys.filter((column) => visibleColumns[column]);

  if (selectedColumns.length === columnKeys.length) {
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

function RowActions({ product }: { product: ProductRow }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground size-8 rounded-full"
          aria-label={`Open actions for ${product.name}`}
        >
          <Ellipsis className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem asChild>
          <Link href={getProductEditHref(product.name)}>Edit product</Link>
        </DropdownMenuItem>
        <DropdownMenuItem>Reorder</DropdownMenuItem>
        <DropdownMenuItem>Audit Stock</DropdownMenuItem>
        <DropdownMenuItem>Create Stock Alert</DropdownMenuItem>
        <DropdownMenuItem>Stock History</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MobileProductCard({ product }: { product: ProductRow }) {
  const stockStyle = stockStyles[product.stockLevel];

  return (
    <article className="border-border/70 bg-card rounded-2xl border p-4">
      <div className="flex items-start gap-3">
        <div className="bg-muted relative size-16 shrink-0 overflow-hidden rounded-xl">
          <Link
            href={getProductDetailHref(product.name)}
            aria-label={`View ${product.name}`}
            className="absolute inset-0"
          >
            <Image
              src={product.image}
              alt={product.name}
              fill
              sizes="64px"
              className="object-cover"
            />
          </Link>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link
                href={getProductDetailHref(product.name)}
                className="truncate text-base font-medium hover:underline"
              >
                {product.name}
              </Link>
              <p className="text-muted-foreground mt-1 text-sm">
                {product.sku}
              </p>
            </div>
            <RowActions product={product} />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="font-normal">
              {product.category}
            </Badge>
            <span className="text-muted-foreground text-xs">
              {product.supplier}
              {product.supplierLocation ? ` · ${product.supplierLocation}` : ""}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs">Unit price</span>
              <span className="text-sm font-medium">
                {currencyFormatter.format(product.unitPrice)}
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs">Stock</span>
              <span className="text-sm font-medium">
                {product.stockUnits} units
              </span>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-1.5">
            <span className="text-sm">
              Status{" "}
              <span className={stockStyle.text}>{product.stockLevel}</span>
            </span>
            <div className="bg-muted h-1.5 rounded-full">
              <div
                className={cn("h-1.5 rounded-full", stockStyle.bar)}
                style={{
                  width: `${Math.max(product.stockProgress, product.stockUnits === 0 ? 2 : 0)}%`,
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export function EcommerceProductList1({
  initialSearchParams,
}: {
  initialSearchParams?: EcommerceProductList1SearchParams;
}) {
  const initialState = React.useMemo(
    () => getInitialProductListState(initialSearchParams),
    [initialSearchParams],
  );
  const [search, setSearch] = React.useState(initialState.search);
  const [category, setCategory] = React.useState(initialState.category);
  const [supplier, setSupplier] = React.useState(initialState.supplier);
  const [stockLevel, setStockLevel] = React.useState(initialState.stockLevel);
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
      const nextState = getInitialProductListState(
        new URLSearchParams(window.location.search),
      );

      setSearch(nextState.search);
      setCategory(nextState.category);
      setSupplier(nextState.supplier);
      setStockLevel(nextState.stockLevel);
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

    if (search.trim()) {
      params.set("query", search.trim());
    } else {
      params.delete("query");
    }

    if (category !== "all") {
      params.set("category", category);
    } else {
      params.delete("category");
    }

    if (supplier !== "all") {
      params.set("supplier", supplier);
    } else {
      params.delete("supplier");
    }

    if (stockLevel !== "all") {
      params.set("stock", stockLevel);
    } else {
      params.delete("stock");
    }

    if (sortKey !== "name") {
      params.set("sort", sortKey);
    } else {
      params.delete("sort");
    }

    if (sortDirection !== "asc") {
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
    category,
    search,
    sortDirection,
    sortKey,
    stockLevel,
    supplier,
    visibleColumns,
  ]);

  const visibleColumnCount = React.useMemo(
    () => columnKeys.filter((column) => visibleColumns[column]).length,
    [visibleColumns],
  );
  const tableColSpan = visibleColumnCount + 1;

  const filteredProducts = React.useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    const nextProducts = products.filter((product) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        [product.name, product.sku, product.category, product.supplier]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);

      const matchesCategory =
        category === "all" || product.category === category;
      const matchesSupplier =
        supplier === "all" || product.supplier === supplier;
      const matchesStock =
        stockLevel === "all" || product.stockLevel === stockLevel;

      return (
        matchesSearch && matchesCategory && matchesSupplier && matchesStock
      );
    });

    nextProducts.sort((left, right) => {
      const modifier = sortDirection === "asc" ? 1 : -1;

      if (sortKey === "stockUnits" || sortKey === "unitPrice") {
        return (left[sortKey] - right[sortKey]) * modifier;
      }

      return left[sortKey].localeCompare(right[sortKey]) * modifier;
    });

    return nextProducts;
  }, [category, search, sortDirection, sortKey, stockLevel, supplier]);

  function handleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection("asc");
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-col p-6 md:p-8">
        <div className="flex flex-col gap-4 pb-8 md:hidden">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-foreground font-medium">Acme Store</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-foreground font-medium">Products</span>
          </div>

          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-medium tracking-tight">Products</h1>
            <p className="text-muted-foreground text-sm">
              Browse and manage your product catalog.
            </p>
          </div>

          <Button className="h-11 w-full rounded-xl px-5 shadow-none" asChild>
            <Link href="/ecommerce/add-product">
              <Plus className="size-4" aria-hidden="true" />
              Add Products
            </Link>
          </Button>
        </div>

        <div className="hidden gap-4 pb-8 md:flex lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-medium tracking-tight">Products</h1>
            <p className="text-muted-foreground text-sm">
              Browse, filter, and manage your product catalog.
            </p>
          </div>

          <Button className="h-10 rounded-md px-5 shadow-none" asChild>
            <Link href="/ecommerce/add-product">
              <Plus className="size-4" aria-hidden="true" />
              Add Products
            </Link>
          </Button>
        </div>

        <div className="flex flex-col">
          <Tabs defaultValue="all" className="pt-2 pb-1">
            <div className="border-b">
              <TabsList className="h-auto bg-transparent p-0">
                <TabsTrigger
                  value="all"
                  className="data-[state=active]:border-foreground rounded-none border-b-2 border-transparent px-1 pt-0 pb-3 text-sm data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  All products
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
                placeholder="Search products"
                aria-label="Search products"
                className="h-12 rounded-2xl pl-9"
              />
            </div>

            <div className="grid gap-3 min-[360px]:grid-cols-2">
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger
                  className="h-11 w-full rounded-2xl"
                  aria-label="Filter products by category"
                >
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option === "all" ? "Category" : option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={supplier} onValueChange={setSupplier}>
                <SelectTrigger
                  className="h-11 w-full rounded-2xl"
                  aria-label="Filter products by supplier"
                >
                  <SelectValue placeholder="Supplier" />
                </SelectTrigger>
                <SelectContent>
                  {supplierOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option === "all" ? "Supplier" : option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="min-[360px]:col-span-2">
                <Select value={stockLevel} onValueChange={setStockLevel}>
                  <SelectTrigger
                    className="h-11 w-full rounded-2xl"
                    aria-label="Filter products by stock level"
                  >
                    <SelectValue placeholder="Stock level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Stock level</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                    <SelectItem value="Low">Low</SelectItem>
                    <SelectItem value="Out">Out</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
                  checked={visibleColumns.name}
                  onCheckedChange={(checked) =>
                    setVisibleColumns((current) => ({
                      ...current,
                      name: !!checked,
                    }))
                  }
                >
                  Product name
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={visibleColumns.sku}
                  onCheckedChange={(checked) =>
                    setVisibleColumns((current) => ({
                      ...current,
                      sku: !!checked,
                    }))
                  }
                >
                  SKU
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={visibleColumns.category}
                  onCheckedChange={(checked) =>
                    setVisibleColumns((current) => ({
                      ...current,
                      category: !!checked,
                    }))
                  }
                >
                  Category
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={visibleColumns.supplier}
                  onCheckedChange={(checked) =>
                    setVisibleColumns((current) => ({
                      ...current,
                      supplier: !!checked,
                    }))
                  }
                >
                  Supplier
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={visibleColumns.stock}
                  onCheckedChange={(checked) =>
                    setVisibleColumns((current) => ({
                      ...current,
                      stock: !!checked,
                    }))
                  }
                >
                  Current stock
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={visibleColumns.price}
                  onCheckedChange={(checked) =>
                    setVisibleColumns((current) => ({
                      ...current,
                      price: !!checked,
                    }))
                  }
                >
                  Unit price
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
                  placeholder="Search products"
                  aria-label="Search products"
                  className="h-10 w-[220px] rounded-lg pl-9"
                />
              </div>

              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger
                  className="h-10 w-[140px] rounded-lg"
                  aria-label="Filter products by category"
                >
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option === "all" ? "Category" : option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={supplier} onValueChange={setSupplier}>
                <SelectTrigger
                  className="h-10 w-[140px] rounded-lg"
                  aria-label="Filter products by supplier"
                >
                  <SelectValue placeholder="Supplier" />
                </SelectTrigger>
                <SelectContent>
                  {supplierOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option === "all" ? "Supplier" : option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={stockLevel} onValueChange={setStockLevel}>
                <SelectTrigger
                  className="h-10 w-[150px] rounded-lg"
                  aria-label="Filter products by stock level"
                >
                  <SelectValue placeholder="Stock level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Stock level</SelectItem>
                  <SelectItem value="High">High</SelectItem>
                  <SelectItem value="Low">Low</SelectItem>
                  <SelectItem value="Out">Out</SelectItem>
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
                  checked={visibleColumns.name}
                  onCheckedChange={(checked) =>
                    setVisibleColumns((current) => ({
                      ...current,
                      name: !!checked,
                    }))
                  }
                >
                  Product name
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={visibleColumns.sku}
                  onCheckedChange={(checked) =>
                    setVisibleColumns((current) => ({
                      ...current,
                      sku: !!checked,
                    }))
                  }
                >
                  SKU
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={visibleColumns.category}
                  onCheckedChange={(checked) =>
                    setVisibleColumns((current) => ({
                      ...current,
                      category: !!checked,
                    }))
                  }
                >
                  Category
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={visibleColumns.supplier}
                  onCheckedChange={(checked) =>
                    setVisibleColumns((current) => ({
                      ...current,
                      supplier: !!checked,
                    }))
                  }
                >
                  Supplier
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={visibleColumns.stock}
                  onCheckedChange={(checked) =>
                    setVisibleColumns((current) => ({
                      ...current,
                      stock: !!checked,
                    }))
                  }
                >
                  Current stock
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={visibleColumns.price}
                  onCheckedChange={(checked) =>
                    setVisibleColumns((current) => ({
                      ...current,
                      price: !!checked,
                    }))
                  }
                >
                  Unit price
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex flex-col gap-4 pt-3 md:hidden">
          {filteredProducts.length > 0 ? (
            filteredProducts.map((product) => (
              <MobileProductCard key={product.id} product={product} />
            ))
          ) : (
            <div className="text-muted-foreground border-border/70 flex min-h-40 items-center justify-center rounded-2xl border border-dashed text-center text-sm">
              No products found.
            </div>
          )}
        </div>

        <div className="hidden overflow-x-auto pt-3 md:block">
          <Table className="min-w-[980px]">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                {visibleColumns.name && (
                  <TableHead>
                    <SortHeader
                      label="Product name"
                      active={sortKey === "name"}
                      direction={sortDirection}
                      onClick={() => handleSort("name")}
                    />
                  </TableHead>
                )}
                {visibleColumns.sku && (
                  <TableHead>
                    <SortHeader
                      label="SKU"
                      active={sortKey === "sku"}
                      direction={sortDirection}
                      onClick={() => handleSort("sku")}
                    />
                  </TableHead>
                )}
                {visibleColumns.category && (
                  <TableHead>
                    <SortHeader
                      label="Category"
                      active={sortKey === "category"}
                      direction={sortDirection}
                      onClick={() => handleSort("category")}
                    />
                  </TableHead>
                )}
                {visibleColumns.supplier && (
                  <TableHead>
                    <SortHeader
                      label="Supplier"
                      active={sortKey === "supplier"}
                      direction={sortDirection}
                      onClick={() => handleSort("supplier")}
                    />
                  </TableHead>
                )}
                {visibleColumns.stock && (
                  <TableHead>
                    <SortHeader
                      label="Current Stock"
                      active={sortKey === "stockUnits"}
                      direction={sortDirection}
                      onClick={() => handleSort("stockUnits")}
                    />
                  </TableHead>
                )}
                {visibleColumns.price && (
                  <TableHead>
                    <SortHeader
                      label="Unit Price"
                      active={sortKey === "unitPrice"}
                      direction={sortDirection}
                      onClick={() => handleSort("unitPrice")}
                    />
                  </TableHead>
                )}
                <TableHead className="w-[48px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.length > 0 ? (
                filteredProducts.map((product) => {
                  const stockStyle = stockStyles[product.stockLevel];

                  return (
                    <TableRow key={product.id}>
                      {visibleColumns.name && (
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="bg-muted relative size-10 overflow-hidden rounded-md">
                              <Link
                                href={getProductDetailHref(product.name)}
                                aria-label={`View ${product.name}`}
                                className="absolute inset-0"
                              >
                                <Image
                                  src={product.image}
                                  alt={product.name}
                                  fill
                                  sizes="40px"
                                  className="object-cover"
                                />
                              </Link>
                            </div>
                            <Link
                              href={getProductDetailHref(product.name)}
                              className="max-w-[260px] truncate text-sm font-medium hover:underline"
                            >
                              {product.name}
                            </Link>
                          </div>
                        </TableCell>
                      )}
                      {visibleColumns.sku && (
                        <TableCell className="text-sm">{product.sku}</TableCell>
                      )}
                      {visibleColumns.category && (
                        <TableCell>
                          <Badge variant="secondary" className="font-normal">
                            {product.category}
                          </Badge>
                        </TableCell>
                      )}
                      {visibleColumns.supplier && (
                        <TableCell>
                          <span className="text-sm font-medium">
                            {product.supplier}
                            {product.supplierLocation
                              ? ` - ${product.supplierLocation}`
                              : ""}
                          </span>
                        </TableCell>
                      )}
                      {visibleColumns.stock && (
                        <TableCell>
                          <div className="flex min-w-[140px] flex-col gap-1.5">
                            <span className="text-sm">
                              {product.stockUnits} unit
                              {product.stockUnits === 1 ? "" : "s"} ·{" "}
                              <span className={stockStyle.text}>
                                {product.stockLevel}
                              </span>
                            </span>
                            <div className="bg-muted h-1.5 rounded-full">
                              <div
                                className={cn(
                                  "h-1.5 rounded-full",
                                  stockStyle.bar,
                                )}
                                style={{
                                  width: `${Math.max(product.stockProgress, product.stockUnits === 0 ? 2 : 0)}%`,
                                }}
                              />
                            </div>
                          </div>
                        </TableCell>
                      )}
                      {visibleColumns.price && (
                        <TableCell className="text-muted-foreground text-sm">
                          {currencyFormatter.format(product.unitPrice)}
                        </TableCell>
                      )}
                      <TableCell>
                        <RowActions product={product} />
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={tableColSpan}
                    className="text-muted-foreground h-24 text-center"
                  >
                    No products found.
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
