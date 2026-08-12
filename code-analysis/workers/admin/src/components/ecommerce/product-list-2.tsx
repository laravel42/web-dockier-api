"use client";

import {
  MoreHorizontal,
  Package,
  Plus,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import {
  getProductDetailHref,
  getProductEditHref,
} from "@/lib/ecommerce-edit-products";
import {
  inventoryCards,
  type ListingStatus,
  type StockTone,
} from "@/lib/ecommerce-product-catalog";
import { cn } from "@/lib/utils";

type ListingStatusFilter = "all" | "active" | "draft";
type StockToneFilter = "all" | "high" | "low";

function statusClasses(status: ListingStatus) {
  return status === "Active"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-slate-200 bg-slate-100 text-slate-600";
}

function stockBarClasses(tone: StockTone) {
  return tone === "High" ? "bg-emerald-500" : "bg-rose-500";
}

export function EcommerceProductList2() {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] =
    React.useState<ListingStatusFilter>("all");
  const [stockToneFilter, setStockToneFilter] =
    React.useState<StockToneFilter>("all");
  const deferredSearchQuery = React.useDeferredValue(searchQuery);
  const normalizedSearchQuery = deferredSearchQuery.trim().toLowerCase();
  const selectedStockToneLabel =
    stockToneFilter === "high"
      ? "High stock"
      : stockToneFilter === "low"
        ? "Low stock"
        : "All stock";

  const filteredProducts = React.useMemo(() => {
    return inventoryCards.filter((product) => {
      const matchesSearch =
        normalizedSearchQuery.length === 0 ||
        [product.name, product.sku, ...product.channels]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearchQuery);

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && product.status === "Active") ||
        (statusFilter === "draft" && product.status === "Draft");

      const matchesStockTone =
        stockToneFilter === "all" ||
        (stockToneFilter === "high" && product.stockTone === "High") ||
        (stockToneFilter === "low" && product.stockTone === "Low");

      return matchesSearch && matchesStatus && matchesStockTone;
    });
  }, [normalizedSearchQuery, statusFilter, stockToneFilter]);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <section className="border-border/70 border-b border-dashed pb-4">
        <div className="flex flex-col gap-4 md:hidden">
          <div className="border-border/70 bg-background flex size-10 shrink-0 items-center justify-center rounded-2xl border">
            <Package className="text-muted-foreground size-4.5" />
          </div>

          <div className="space-y-1.5">
            <h1 className="text-xl font-semibold tracking-tight">
              Product List 2
            </h1>
            <p className="text-muted-foreground max-w-[18rem] text-sm leading-6">
              Inventory-first product cards with pricing, stock, and channel
              tags.
            </p>
          </div>

          <Button className="h-11 w-full rounded-xl shadow-none" asChild>
            <a href="/ecommerce/add-product">
              <Plus className="size-4" />
              New Products
            </a>
          </Button>
        </div>

        <div className="hidden gap-4 md:flex md:flex-row md:items-start md:justify-between xl:items-center">
          <div className="flex items-start gap-3">
            <div className="border-border/70 bg-background flex size-10 shrink-0 items-center justify-center rounded-2xl border">
              <Package className="text-muted-foreground size-4.5" />
            </div>
            <div className="space-y-1">
              <h1 className="text-lg font-semibold tracking-tight md:text-xl">
                Product List 2
              </h1>
              <p className="text-muted-foreground text-sm">
                Inventory-first product cards with pricing, stock, and channel
                tags.
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
              value={statusFilter}
              onValueChange={(value) =>
                setStatusFilter(value as ListingStatusFilter)
              }
            >
              <SelectTrigger className="border-border/70 bg-background h-10 min-w-0 flex-1 rounded-2xl px-3 shadow-none">
                <SelectValue placeholder="All products" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All products</SelectItem>
                <SelectItem value="active">Active only</SelectItem>
                <SelectItem value="draft">Draft only</SelectItem>
              </SelectContent>
            </Select>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="border-border/70 h-10 shrink-0 rounded-2xl px-3 shadow-none"
                >
                  <SlidersHorizontal className="size-4" />
                  {selectedStockToneLabel}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuRadioGroup
                  value={stockToneFilter}
                  onValueChange={(value) =>
                    setStockToneFilter(value as StockToneFilter)
                  }
                >
                  <DropdownMenuRadioItem value="all">
                    All stock
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="high">
                    High stock
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="low">
                    Low stock
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="hidden gap-3 md:grid md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
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

          <Select
            value={statusFilter}
            onValueChange={(value) =>
              setStatusFilter(value as ListingStatusFilter)
            }
          >
            <SelectTrigger className="border-border/70 bg-background h-12 min-w-[150px] rounded-2xl shadow-none">
              <SelectValue placeholder="All products" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All products</SelectItem>
              <SelectItem value="active">Active only</SelectItem>
              <SelectItem value="draft">Draft only</SelectItem>
            </SelectContent>
          </Select>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="border-border/70 h-12 rounded-2xl px-4 shadow-none"
              >
                <SlidersHorizontal className="size-4" />
                {selectedStockToneLabel}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuRadioGroup
                value={stockToneFilter}
                onValueChange={(value) =>
                  setStockToneFilter(value as StockToneFilter)
                }
              >
                <DropdownMenuRadioItem value="all">
                  All stock
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="high">
                  High stock
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="low">
                  Low stock
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {filteredProducts.length > 0 ? (
          <div className="grid gap-4 xl:grid-cols-3">
            {filteredProducts.map((product) => (
              <article
                key={product.sku}
                className="border-border/70 bg-card rounded-2xl border p-3 shadow-none"
              >
                <div className="flex items-start gap-3">
                  <Link
                    href={getProductDetailHref(product.name)}
                    className="group/header flex min-w-0 flex-1 items-start gap-3 rounded-xl"
                  >
                    <div className="border-border/60 bg-muted/20 relative size-12 shrink-0 overflow-hidden rounded-xl border">
                      <Image
                        src={product.image}
                        alt={product.name}
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="min-w-0">
                        <h2 className="text-foreground group-hover/header:text-foreground/80 truncate text-sm font-medium transition-colors">
                          {product.name}
                        </h2>
                        <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-xs">
                          <span>{product.sku}</span>
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[11px]",
                              statusClasses(product.status),
                            )}
                          >
                            {product.status}
                          </Badge>
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {product.channels.map((channel) => (
                          <Badge
                            key={channel}
                            variant="secondary"
                            className="rounded-md px-2 py-0.5 text-[11px] font-normal"
                          >
                            {channel}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </Link>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-foreground -mr-1 size-7 shrink-0 rounded-full"
                        aria-label={`More options for ${product.name}`}
                      >
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem asChild>
                        <Link href={getProductEditHref(product.name)}>
                          Edit product
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem>Audit stock</DropdownMenuItem>
                      <DropdownMenuItem>Create alert</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-muted-foreground text-[11px]">Retail</p>
                    <p className="mt-1 text-sm font-medium">{product.retail}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-[11px]">
                      Wholesale
                    </p>
                    <p className="mt-1 text-sm font-medium">
                      {product.wholesale}
                    </p>
                  </div>
                </div>

                <div className="border-border/60 mt-4 flex items-center justify-between gap-4 border-t pt-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <p className="text-muted-foreground truncate">
                        <span className="text-foreground font-medium">
                          {product.stock} stock
                        </span>
                        <span className="text-border mx-1.5">.</span>
                        <span>{product.stockTone}</span>
                      </p>
                      <p className="text-muted-foreground shrink-0">
                        Variants ({product.variants})
                      </p>
                    </div>
                    <div className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          stockBarClasses(product.stockTone),
                        )}
                        style={{ width: `${product.stockProgress}%` }}
                      />
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="border-border/70 h-9 shrink-0 rounded-md px-4 shadow-none"
                    aria-label={`Edit ${product.name}`}
                    asChild
                  >
                    <Link href={getProductEditHref(product.name)}>Edit</Link>
                  </Button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="border-border/70 bg-muted/10 flex min-h-52 items-center justify-center rounded-2xl border border-dashed px-6 py-10 text-center">
            <div className="space-y-2">
              <p className="text-base font-medium">No products found</p>
              <p className="text-muted-foreground text-sm">
                Try a different product name, SKU, or channel tag.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
