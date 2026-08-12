"use client";

import {
  Ellipsis,
  ImagePlus,
  Layers3,
  Minus,
  Pencil,
  Plus,
  Upload,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  getProductDetailHref,
  getProductEdit2Href,
} from "@/lib/ecommerce-edit-products";
import {
  getVariantFocusProductBySlug,
  type VariantFocusProductVariant,
} from "@/lib/ecommerce-product-detail-2";
import { cn } from "@/lib/utils";

const detailTabs = [
  { label: "Overview", value: "overview" },
  { label: "Variants", value: "variants" },
  { label: "Inventory", value: "inventory" },
  { label: "Activity", value: "activity" },
] as const;

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function VariantSummaryRow({
  variant,
  active,
  onClick,
}: {
  variant: VariantFocusProductVariant;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-2xl border p-3 text-left transition-colors",
        active
          ? "border-foreground/20 bg-background shadow-sm"
          : "border-border/60 bg-background/70 hover:border-border hover:bg-background",
      )}
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_100px_100px_auto] lg:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <div className="bg-muted/30 border-border/60 relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border">
            <Image
              src={variant.image}
              alt={variant.label}
              fill
              sizes="56px"
              className="object-cover"
            />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-medium">{variant.label}</p>
              {variant.isPrimary ? (
                <Badge
                  variant="secondary"
                  className="rounded-md px-2 py-0.5 text-[11px]"
                >
                  Primary
                </Badge>
              ) : null}
            </div>
            <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-sm">
              <span>{variant.sku}</span>
              <span>•</span>
              <span className={cn(variant.stock <= 20 && "text-rose-600")}>
                Stock: {variant.stock}
              </span>
              {variant.stock <= 20 ? (
                <span className="text-rose-600">low</span>
              ) : null}
            </div>
          </div>
        </div>

        <div>
          <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase">
            Retail
          </p>
          <p className="mt-1 font-medium">
            {currencyFormatter.format(variant.retailPrice)}
          </p>
        </div>

        <div>
          <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase">
            Wholesale
          </p>
          <p className="mt-1 font-medium">
            {currencyFormatter.format(variant.wholesalePrice)}
          </p>
        </div>

        <div className="flex items-center justify-end">
          <span className="text-muted-foreground inline-flex h-9 w-9 items-center justify-center rounded-lg">
            <Ellipsis className="h-4 w-4" />
          </span>
        </div>
      </div>
    </button>
  );
}

function formatAttachmentSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function VariantImageUploader() {
  const [files, setFiles] = React.useState<File[]>([]);
  const inputId = React.useId();

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextFiles = Array.from(event.target.files ?? []);

    if (nextFiles.length === 0) {
      return;
    }

    setFiles((current) => [...current, ...nextFiles].slice(0, 5));
    event.target.value = "";
  }

  function removeFile(indexToRemove: number) {
    setFiles((current) =>
      current.filter((_, index) => index !== indexToRemove),
    );
  }

  return (
    <div className="grid gap-3">
      <input
        id={inputId}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={handleInputChange}
      />

      {files.length > 0 ? (
        <>
          <div className="border-border/60 bg-muted/10 rounded-xl border">
            {files.map((file, index) => (
              <div
                key={`${file.name}-${file.size}-${index}`}
                className={cn(
                  "flex items-center justify-between gap-3 px-4 py-3",
                  index !== files.length - 1 && "border-border/60 border-b",
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="bg-background border-border/60 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border">
                    <ImagePlus className="text-muted-foreground h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{file.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {formatAttachmentSize(file.size)}
                    </p>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="rounded-md"
                  onClick={() => removeFile(index)}
                  aria-label={`Remove ${file.name}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-muted-foreground text-xs">
              {files.length} of 5 images selected
            </p>
            {files.length < 5 ? (
              <Button
                type="button"
                variant="outline"
                className="rounded-lg"
                asChild
              >
                <label htmlFor={inputId}>
                  <Upload className="h-4 w-4" />
                  Add images
                </label>
              </Button>
            ) : null}
          </div>
        </>
      ) : (
        <div className="border-border/70 bg-muted/10 rounded-xl border border-dashed p-5">
          <div className="flex flex-col items-center justify-center gap-3 text-center">
            <div className="bg-background border-border/60 flex h-16 w-16 items-center justify-center rounded-full border">
              <ImagePlus className="text-muted-foreground h-6 w-6" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">No image uploaded yet</p>
              <p className="text-muted-foreground text-xs">20 MB max</p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="rounded-lg"
              asChild
            >
              <label htmlFor={inputId}>
                <Upload className="h-4 w-4" />
                Select images
              </label>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

type VariantLocationRow = {
  id: string;
  location: string;
  quantity: number;
};

function AddVariantSheet({
  children,
  productName,
  referenceVariant,
}: {
  children: React.ReactNode;
  productName: string;
  referenceVariant: VariantFocusProductVariant;
}) {
  const defaultRetailPrice = String(referenceVariant.retailPrice);
  const defaultWholesalePrice = String(referenceVariant.wholesalePrice);
  const defaultCost = String(
    Math.round(referenceVariant.wholesalePrice * 0.62),
  );
  const defaultTotalQuantity = String(
    Math.max(48, Math.round(referenceVariant.stock * 1.5)),
  );
  const defaultPrimaryQuantity = Math.max(
    24,
    Math.round(Number(defaultTotalQuantity) * 0.6),
  );

  const [retailPrice, setRetailPrice] = React.useState(defaultRetailPrice);
  const [wholesalePrice, setWholesalePrice] = React.useState(
    defaultWholesalePrice,
  );
  const [cost, setCost] = React.useState(defaultCost);
  const [totalQuantity, setTotalQuantity] =
    React.useState(defaultTotalQuantity);
  const [locations, setLocations] = React.useState<VariantLocationRow[]>([
    {
      id: "sea",
      location: "Seattle warehouse",
      quantity: defaultPrimaryQuantity,
    },
    {
      id: "aus",
      location: "Austin warehouse",
      quantity: Math.max(
        0,
        Number(defaultTotalQuantity) - defaultPrimaryQuantity,
      ),
    },
  ]);

  const retail = Number(retailPrice || 0);
  const wholesale = Number(wholesalePrice || 0);
  const costValue = Number(cost || 0);
  const retailProfit = retail - costValue;
  const wholesaleProfit = wholesale - costValue;
  const retailMargin = retail === 0 ? 0 : (retailProfit / retail) * 100;
  const wholesaleMargin =
    wholesale === 0 ? 0 : (wholesaleProfit / wholesale) * 100;

  function addLocation() {
    setLocations((current) => [
      ...current,
      {
        id: `location-${current.length + 1}`,
        location: "Chicago warehouse",
        quantity: 0,
      },
    ]);
  }

  function updateLocation(
    id: string,
    field: "location" | "quantity",
    value: string | number,
  ) {
    setLocations((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              [field]: field === "quantity" ? Number(value) : value,
            }
          : item,
      ),
    );
  }

  function removeLocation(id: string) {
    setLocations((current) => current.filter((item) => item.id !== id));
  }

  return (
    <Sheet>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-2xl">
        <SheetHeader className="border-border/70 border-b pr-8 pb-5">
          <SheetTitle className="text-2xl tracking-tight">
            Add Variant
          </SheetTitle>
        </SheetHeader>

        <div className="no-scrollbar flex-1 overflow-y-auto py-6 pr-1">
          <div className="grid gap-6">
            <Card className="rounded-2xl shadow-none">
              <CardHeader className="gap-2">
                <CardTitle className="text-base">
                  {productName} / New variant
                </CardTitle>
                <CardDescription>
                  Start from the {referenceVariant.label.toLowerCase()} setup
                  and adjust it for the next assortment slot.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <label className="text-sm font-medium">Images</label>
                <VariantImageUploader />
              </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-none">
              <CardHeader className="gap-2">
                <CardTitle className="text-base">Pricing setup</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <label className="text-sm font-medium">
                    Retail Sale Price
                  </label>
                  <InputGroup className="h-12 rounded-lg">
                    <InputGroupAddon className="border-r px-4">
                      <InputGroupText>$</InputGroupText>
                    </InputGroupAddon>
                    <InputGroupInput
                      value={retailPrice}
                      onChange={(event) => setRetailPrice(event.target.value)}
                      inputMode="decimal"
                      aria-label="Retail sale price"
                      className="h-12 text-base"
                    />
                  </InputGroup>
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-medium">
                    Wholesale Sale Price
                  </label>
                  <InputGroup className="h-12 rounded-lg">
                    <InputGroupAddon className="border-r px-4">
                      <InputGroupText>$</InputGroupText>
                    </InputGroupAddon>
                    <InputGroupInput
                      value={wholesalePrice}
                      onChange={(event) =>
                        setWholesalePrice(event.target.value)
                      }
                      inputMode="decimal"
                      aria-label="Wholesale sale price"
                      className="h-12 text-base"
                    />
                  </InputGroup>
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-medium">Cost</label>
                  <InputGroup className="h-12 rounded-lg">
                    <InputGroupAddon className="border-r px-4">
                      <InputGroupText>$</InputGroupText>
                    </InputGroupAddon>
                    <InputGroupInput
                      value={cost}
                      onChange={(event) => setCost(event.target.value)}
                      inputMode="decimal"
                      aria-label="Variant cost"
                      className="h-12 text-base"
                    />
                  </InputGroup>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="border-border/60 bg-muted/15 rounded-xl border p-4">
                    <p className="text-sm font-medium">
                      Retail margin & profit
                    </p>
                    <div className="mt-4 grid gap-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Margin</span>
                        <span>{retailMargin.toFixed(0)}%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Profit</span>
                        <span>{currencyFormatter.format(retailProfit)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="border-border/60 bg-muted/15 rounded-xl border p-4">
                    <p className="text-sm font-medium">
                      Wholesale margin & profit
                    </p>
                    <div className="mt-4 grid gap-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Margin</span>
                        <span>{wholesaleMargin.toFixed(0)}%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Profit</span>
                        <span>{currencyFormatter.format(wholesaleProfit)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-none">
              <CardHeader className="gap-2">
                <CardTitle className="text-base">Stock allocation</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Total Quantity</label>
                  <Input
                    value={totalQuantity}
                    onChange={(event) => setTotalQuantity(event.target.value)}
                    inputMode="numeric"
                    className="h-12 rounded-lg"
                  />
                </div>

                <div className="grid gap-3">
                  {locations.map((location) => (
                    <div
                      key={location.id}
                      className="grid gap-3 md:grid-cols-[minmax(0,1fr)_240px_auto]"
                    >
                      <div className="grid gap-2">
                        <label className="text-sm font-medium">Location</label>
                        <Select
                          value={location.location}
                          onValueChange={(value) =>
                            updateLocation(location.id, "location", value)
                          }
                        >
                          <SelectTrigger className="h-12 rounded-lg">
                            <SelectValue placeholder="Select Location" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Seattle warehouse">
                              Seattle warehouse
                            </SelectItem>
                            <SelectItem value="Austin warehouse">
                              Austin warehouse
                            </SelectItem>
                            <SelectItem value="Chicago warehouse">
                              Chicago warehouse
                            </SelectItem>
                            <SelectItem value="Miami warehouse">
                              Miami warehouse
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid gap-2">
                        <label className="text-sm font-medium">Quantity</label>
                        <InputGroup className="h-12 rounded-lg">
                          <InputGroupAddon className="pl-2">
                            <InputGroupButton
                              size="icon-sm"
                              variant="ghost"
                              onClick={() =>
                                updateLocation(
                                  location.id,
                                  "quantity",
                                  Math.max(0, location.quantity - 1),
                                )
                              }
                            >
                              <Minus className="h-4 w-4" />
                            </InputGroupButton>
                          </InputGroupAddon>
                          <InputGroupInput
                            value={String(location.quantity)}
                            onChange={(event) =>
                              updateLocation(
                                location.id,
                                "quantity",
                                event.target.value,
                              )
                            }
                            inputMode="numeric"
                            className="h-12 text-center text-base"
                          />
                          <InputGroupAddon align="inline-end" className="pr-2">
                            <InputGroupButton
                              size="icon-sm"
                              variant="ghost"
                              onClick={() =>
                                updateLocation(
                                  location.id,
                                  "quantity",
                                  location.quantity + 1,
                                )
                              }
                            >
                              <Plus className="h-4 w-4" />
                            </InputGroupButton>
                          </InputGroupAddon>
                        </InputGroup>
                      </div>

                      <div className="flex items-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-12 w-12 rounded-lg"
                          onClick={() => removeLocation(location.id)}
                          disabled={locations.length === 1}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}

                  <Button
                    type="button"
                    variant="ghost"
                    className="w-fit rounded-lg px-0 text-sm font-medium text-emerald-600 hover:text-emerald-700"
                    onClick={addLocation}
                  >
                    <Plus className="h-4 w-4" />
                    Add Location
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-none">
              <CardHeader className="gap-2">
                <CardTitle className="text-base">Measurements</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Unit</label>
                  <Select defaultValue="each">
                    <SelectTrigger className="h-12 rounded-lg">
                      <SelectValue placeholder="Select unit" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="each">Each (Ea)</SelectItem>
                      <SelectItem value="set">Set</SelectItem>
                      <SelectItem value="pack">Pack</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-medium">Height</label>
                  <InputGroup className="h-12 rounded-lg">
                    <InputGroupInput defaultValue="0" className="h-12" />
                    <InputGroupAddon
                      align="inline-end"
                      className="border-l px-4"
                    >
                      <InputGroupText>cm</InputGroupText>
                    </InputGroupAddon>
                  </InputGroup>
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-medium">Width</label>
                  <InputGroup className="h-12 rounded-lg">
                    <InputGroupInput defaultValue="0" className="h-12" />
                    <InputGroupAddon
                      align="inline-end"
                      className="border-l px-4"
                    >
                      <InputGroupText>cm</InputGroupText>
                    </InputGroupAddon>
                  </InputGroup>
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-medium">Weight</label>
                  <InputGroup className="h-12 rounded-lg">
                    <InputGroupInput defaultValue="0" className="h-12" />
                    <InputGroupAddon
                      align="inline-end"
                      className="border-l px-4"
                    >
                      <InputGroupText>kg</InputGroupText>
                    </InputGroupAddon>
                  </InputGroup>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-2">
              <label className="text-sm font-medium">Notes</label>
              <Textarea
                placeholder="Variant note"
                className="min-h-28 resize-none rounded-lg"
              />
            </div>
          </div>
        </div>

        <SheetFooter className="border-border/70 border-t pt-4 sm:justify-between sm:space-x-0">
          <SheetClose asChild>
            <Button variant="ghost" className="rounded-lg">
              Cancel
            </Button>
          </SheetClose>
          <SheetClose asChild>
            <Button className="rounded-lg px-8">Save variant</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function EcommerceProductDetail2({
  productSlug,
}: {
  productSlug?: string;
}) {
  const product =
    getVariantFocusProductBySlug(productSlug ?? "radiance-ritual-set") ??
    getVariantFocusProductBySlug("radiance-ritual-set");

  const [isActive, setIsActive] = React.useState(true);
  const [activeVariantId, setActiveVariantId] = React.useState(
    product?.variants.find((variant) => variant.isPrimary)?.id ??
      product?.variants[0]?.id ??
      "",
  );
  const [activeImage, setActiveImage] = React.useState(
    product?.gallery[0] ?? "",
  );

  if (!product) {
    return null;
  }

  const activeVariant =
    product.variants.find((variant) => variant.id === activeVariantId) ??
    product.variants[0];

  const totalStock = product.variants.reduce(
    (sum, variant) => sum + variant.stock,
    0,
  );
  const lowStockVariants = product.variants.filter(
    (variant) => variant.stock <= 20,
  );
  const healthyVariants = product.variants.filter(
    (variant) => variant.stock > 20,
  );
  const highestPrice = Math.max(
    ...product.variants.map((variant) => variant.retailPrice),
  );
  const lowestPrice = Math.min(
    ...product.variants.map((variant) => variant.retailPrice),
  );
  const averageStock = Math.round(totalStock / product.variants.length);
  const primaryVariant =
    product.variants.find((variant) => variant.isPrimary) ??
    product.variants[0];
  const activityItems = [
    ...product.history.map((item) => ({
      type: "History",
      title: item.title,
      body: item.body,
      meta: item.time,
    })),
    ...product.notes.map((item, index) => ({
      type: "Note",
      title: item.title,
      body: item.body,
      meta: `Ops note ${index + 1}`,
    })),
  ];

  return (
    <div className="min-w-0 overflow-x-hidden">
      <div className="flex min-w-0 flex-col p-4 sm:p-6 md:p-8">
        <div className="flex flex-col gap-5 pb-8 md:hidden">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-foreground font-medium">Acme Store</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-foreground font-medium">Products</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-muted-foreground">Variant detail</span>
          </div>

          <div className="flex justify-end">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {isActive ? "Active" : "Draft"}
              </span>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">
              {product.name}
            </h1>
            <p className="text-muted-foreground text-sm">
              {product.variants.length} variants • {product.category} •{" "}
              {product.productType}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <AddVariantSheet
              productName={product.name}
              referenceVariant={activeVariant}
            >
              <Button className="rounded-lg">
                <Plus className="h-4 w-4" />
                Add Variant
              </Button>
            </AddVariantSheet>
            <Button variant="outline" className="rounded-lg" asChild>
              <Link href={getProductEdit2Href(product.name)}>
                <Pencil className="h-4 w-4" />
                Edit
              </Link>
            </Button>
          </div>
        </div>

        <div className="hidden flex-col gap-6 pb-8 md:flex">
          <div className="flex items-start justify-between gap-8">
            <div className="flex min-w-0 flex-col gap-3 pt-1">
              <h1 className="text-4xl font-medium tracking-tight">
                {product.name}
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge
                  variant={isActive ? "default" : "secondary"}
                  className="rounded-md px-2.5 py-1 font-medium"
                >
                  {isActive ? "Active" : "Draft"}
                </Badge>
                <span className="text-muted-foreground">•</span>
                <span className="text-muted-foreground">
                  {product.variants.length} variants
                </span>
                <span className="text-muted-foreground">•</span>
                <span className="text-muted-foreground">
                  {product.category}
                </span>
                <span className="text-muted-foreground">•</span>
                <span className="text-muted-foreground">
                  {product.productType}
                </span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <div className="flex items-center gap-3 rounded-full border px-3 py-2">
                <Switch checked={isActive} onCheckedChange={setIsActive} />
                <span className="text-sm font-medium">
                  {isActive ? "Active" : "Draft"}
                </span>
              </div>

              <Separator orientation="vertical" className="h-8" />

              <AddVariantSheet
                productName={product.name}
                referenceVariant={activeVariant}
              >
                <Button className="rounded-lg">
                  <Plus className="h-4 w-4" />
                  Add Variant
                </Button>
              </AddVariantSheet>
              <Button variant="outline" className="rounded-lg" asChild>
                <Link href={getProductEdit2Href(product.name)}>
                  <Pencil className="h-4 w-4" />
                  Edit
                </Link>
              </Button>
              <Button variant="outline" className="rounded-lg">
                <Layers3 className="h-4 w-4" />
                Clone
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="rounded-lg">
                    <Ellipsis className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem>Archive</DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={getProductDetailHref(product.name)}>
                      Open classic detail
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem>Share details</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        <Tabs defaultValue="overview" className="min-w-0 pb-2">
          <div className="overflow-x-auto border-b">
            <TabsList className="h-auto justify-start gap-5 bg-transparent p-0">
              {detailTabs.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="data-[state=active]:border-foreground rounded-none border-b-2 border-transparent px-0 pt-0 pb-3 text-sm data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="overview" className="mt-0 pt-6">
            <div className="grid min-w-0 gap-8 xl:grid-cols-[360px_minmax(0,1fr)] xl:items-start">
              <div className="flex min-w-0 flex-col gap-5">
                <div className="border-border/60 bg-muted/20 rounded-3xl border p-4">
                  <div className="bg-background border-border/60 relative h-[300px] overflow-hidden rounded-2xl border md:h-[360px]">
                    <Image
                      src={activeImage}
                      alt={activeVariant.label}
                      fill
                      sizes="(min-width: 1280px) 360px, (min-width: 768px) 50vw, 100vw"
                      className="object-cover"
                    />
                    {activeVariant.isPrimary ? (
                      <div className="bg-background/95 absolute top-3 left-3 rounded-md px-2 py-1 text-[11px] font-semibold tracking-[0.12em] uppercase">
                        Primary
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4 flex min-w-0 gap-3 overflow-x-auto pb-1">
                    {product.gallery.map((image) => (
                      <button
                        key={image}
                        type="button"
                        onClick={() => setActiveImage(image)}
                        className={cn(
                          "bg-background relative h-18 w-18 shrink-0 overflow-hidden rounded-xl border transition-all",
                          activeImage === image
                            ? "border-foreground ring-foreground/10 ring-2"
                            : "border-border/60 opacity-80 hover:opacity-100",
                        )}
                      >
                        <Image
                          src={image}
                          alt={`${product.name} gallery`}
                          fill
                          sizes="72px"
                          className="object-cover"
                        />
                      </button>
                    ))}
                  </div>
                </div>

                <Card className="rounded-2xl shadow-none">
                  <CardHeader className="gap-2">
                    <CardTitle className="text-base">
                      Product family profile
                    </CardTitle>
                    <CardDescription>
                      A compact read on the assortment behind this variant-led
                      product.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase">
                        Primary variant
                      </p>
                      <p className="mt-2 font-medium">{primaryVariant.label}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase">
                        Retail price band
                      </p>
                      <p className="mt-2 font-medium">
                        {currencyFormatter.format(lowestPrice)} -{" "}
                        {currencyFormatter.format(highestPrice)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase">
                        Material
                      </p>
                      <p className="mt-2 font-medium">{product.material}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase">
                        Vendor
                      </p>
                      <p className="mt-2 font-medium">{product.vendor}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid min-w-0 gap-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Card className="rounded-2xl shadow-none">
                    <CardContent className="p-5">
                      <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase">
                        Total stock
                      </p>
                      <p className="mt-3 text-3xl font-semibold tracking-tight">
                        {totalStock}
                      </p>
                      <p className="text-muted-foreground mt-1 text-sm">
                        Across {product.variants.length} active variants
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="rounded-2xl shadow-none">
                    <CardContent className="p-5">
                      <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase">
                        Low stock
                      </p>
                      <p className="mt-3 text-3xl font-semibold tracking-tight">
                        {lowStockVariants.length}
                      </p>
                      <p className="text-muted-foreground mt-1 text-sm">
                        Variants below the 20-unit threshold
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="rounded-2xl shadow-none">
                    <CardContent className="p-5">
                      <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase">
                        Average stock
                      </p>
                      <p className="mt-3 text-3xl font-semibold tracking-tight">
                        {averageStock}
                      </p>
                      <p className="text-muted-foreground mt-1 text-sm">
                        Average units held per variant
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <div className="flex min-w-0 items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">Variant lineup</p>
                    <p className="text-muted-foreground text-sm">
                      Click any row to update the media focus and selected
                      context.
                    </p>
                  </div>
                </div>

                {product.variants.map((variant) => (
                  <VariantSummaryRow
                    key={variant.id}
                    variant={variant}
                    active={variant.id === activeVariant.id}
                    onClick={() => {
                      setActiveVariantId(variant.id);
                      setActiveImage(variant.image);
                    }}
                  />
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="variants" className="mt-0 pt-6">
            <Card className="rounded-2xl shadow-none">
              <CardHeader className="gap-2">
                <CardTitle>Variant matrix</CardTitle>
                <CardDescription>
                  Compare the assortment across stock, pricing, and role without
                  the extra summary noise.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {product.variants.map((variant) => (
                  <div
                    key={variant.id}
                    className={cn(
                      "grid gap-4 rounded-2xl border p-4 md:grid-cols-[minmax(0,1.7fr)_120px_120px_120px_100px]",
                      variant.id === activeVariant.id &&
                        "border-foreground/20 bg-muted/20",
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="bg-muted/30 border-border/60 relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border">
                        <Image
                          src={variant.image}
                          alt={variant.label}
                          fill
                          sizes="56px"
                          className="object-cover"
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-medium">
                            {variant.label}
                          </p>
                          {variant.isPrimary ? (
                            <Badge
                              variant="secondary"
                              className="rounded-md px-2 py-0.5 text-[11px]"
                            >
                              Primary
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-muted-foreground mt-1 text-sm">
                          {variant.sku}
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase">
                        Stock
                      </p>
                      <p
                        className={cn(
                          "mt-2 font-medium",
                          variant.stock <= 20 && "text-rose-600",
                        )}
                      >
                        {variant.stock} units
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase">
                        Retail
                      </p>
                      <p className="mt-2 font-medium">
                        {currencyFormatter.format(variant.retailPrice)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase">
                        Wholesale
                      </p>
                      <p className="mt-2 font-medium">
                        {currencyFormatter.format(variant.wholesalePrice)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase">
                        Spread
                      </p>
                      <p className="mt-2 font-medium">
                        {currencyFormatter.format(
                          variant.retailPrice - variant.wholesalePrice,
                        )}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="inventory" className="mt-0 pt-6">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="grid gap-4">
                <Card className="rounded-2xl shadow-none">
                  <CardHeader className="gap-2">
                    <CardTitle>Low-stock queue</CardTitle>
                    <CardDescription>
                      Variants that need replenishment attention first.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    {lowStockVariants.map((variant) => (
                      <div
                        key={variant.id}
                        className="border-border/60 flex items-center justify-between rounded-xl border p-4"
                      >
                        <div>
                          <p className="font-medium">{variant.label}</p>
                          <p className="text-muted-foreground mt-1 text-sm">
                            {variant.sku}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium text-rose-600">
                            {variant.stock} units
                          </p>
                          <p className="text-muted-foreground mt-1 text-sm">
                            Needs review
                          </p>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="rounded-2xl shadow-none">
                  <CardHeader className="gap-2">
                    <CardTitle>Healthy coverage</CardTitle>
                    <CardDescription>
                      Variants holding enough depth for normal sell-through.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    {healthyVariants.map((variant) => (
                      <div
                        key={variant.id}
                        className="border-border/60 flex items-center justify-between rounded-xl border p-4"
                      >
                        <div>
                          <p className="font-medium">{variant.label}</p>
                          <p className="text-muted-foreground mt-1 text-sm">
                            {variant.sku}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">{variant.stock} units</p>
                          <p className="text-muted-foreground mt-1 text-sm">
                            Stable coverage
                          </p>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>

              <Card className="rounded-2xl shadow-none">
                <CardHeader className="gap-2">
                  <CardTitle>Inventory guidance</CardTitle>
                  <CardDescription>
                    Assortment thresholds for keeping the family balanced.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="border-border/60 rounded-xl border p-4">
                    <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase">
                      Primary target
                    </p>
                    <p className="mt-2 font-medium">40+ units</p>
                  </div>
                  <div className="border-border/60 rounded-xl border p-4">
                    <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase">
                      Travel-set target
                    </p>
                    <p className="mt-2 font-medium">16+ units</p>
                  </div>
                  <div className="border-border/60 rounded-xl border p-4">
                    <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase">
                      Current focus
                    </p>
                    <p className="mt-2 font-medium">
                      Replenish the gift and travel configurations first.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="activity" className="mt-0 pt-6">
            <div className="grid gap-4">
              {activityItems.map((item) => (
                <Card
                  key={`${item.type}-${item.title}`}
                  className="rounded-2xl shadow-none"
                >
                  <CardHeader className="gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="secondary"
                        className="rounded-md px-2 py-0.5 text-[11px]"
                      >
                        {item.type}
                      </Badge>
                      <CardDescription>{item.meta}</CardDescription>
                    </div>
                    <CardTitle className="text-base">{item.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-muted-foreground pt-0 text-sm leading-6">
                    {item.body}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
