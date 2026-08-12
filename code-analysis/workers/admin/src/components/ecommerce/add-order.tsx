"use client";

import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Factory,
  Minus,
  Package,
  Plus,
  Search,
  Truck,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { type EditableOrderValues } from "@/lib/ecommerce-edit-orders";
import { inventoryCards } from "@/lib/ecommerce-product-catalog";
import { cn } from "@/lib/utils";

type StepId = "select" | "method" | "review";
type ReplenishmentMethod = "purchase-order" | "stock-transfer" | "work-order";
type OrderEditorMode = "add" | "edit";

const stepConfig: {
  id: StepId;
  title: string;
  caption: string;
}[] = [
  {
    id: "select",
    title: "Select product",
    caption: "Low-stock inventory to replenish",
  },
  {
    id: "method",
    title: "Order details",
    caption: "Routing, source, and receiving",
  },
  {
    id: "review",
    title: "Review",
    caption: "Cost, lead time, and submit",
  },
];

const buyerOptions = ["Avery Hall", "Riley Chen", "Jordan Lee", "Mina Patel"];
const vendorOptions = [
  "Acme Corp",
  "Globex Corp",
  "Adidas Supply",
  "Nord Goods",
];
const destinationWarehouses = [
  "Brooklyn warehouse",
  "Austin warehouse",
  "Chicago warehouse",
  "Seattle warehouse",
];
const transferWarehouses = [
  "Austin overflow",
  "Miami storage",
  "Chicago reserve",
  "Seattle annex",
];
const productionCells = [
  "Packaging studio",
  "Blend lab",
  "Seasonal assembly line",
  "Sampling bench",
];
const componentSources = [
  "Bulk components inventory",
  "Packaging reserve",
  "Seasonal surplus stock",
];
const paymentTerms = ["Net 15", "Net 30", "50% upfront", "Due on receipt"];

const replenishmentMethods: {
  id: ReplenishmentMethod;
  title: string;
  description: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    id: "purchase-order",
    title: "Purchase order",
    description: "Buy fresh stock from a supplier.",
    detail: "Best when we need external replenishment with invoice tracking.",
    icon: Building2,
  },
  {
    id: "stock-transfer",
    title: "Stock transfer",
    description: "Move units from another location.",
    detail: "Useful when another warehouse has enough coverage to spare.",
    icon: Truck,
  },
  {
    id: "work-order",
    title: "Work order",
    description: "Produce or assemble inventory internally.",
    detail: "Use this when operations can replenish from on-hand components.",
    icon: Factory,
  },
];

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function parsePrice(priceLabel: string) {
  const match = priceLabel.match(/\$([\d.]+)/);
  return match ? Number(match[1]) : 0;
}

function suggestedReorderQty(stock: number) {
  if (stock <= 15) return 120;
  if (stock <= 30) return 80;
  if (stock <= 60) return 48;
  return 24;
}

function estimatedLeadDays(method: ReplenishmentMethod) {
  if (method === "stock-transfer") return 3;
  if (method === "work-order") return 6;
  return 9;
}

const defaultOrderValues: EditableOrderValues = {
  selectedItems: {
    "Timeless Renewal Cream": suggestedReorderQty(12),
  },
  method: "purchase-order",
  vendor: vendorOptions[0],
  buyer: buyerOptions[0],
  destinationWarehouse: destinationWarehouses[0],
  transferWarehouse: transferWarehouses[0],
  productionCell: productionCells[0],
  componentSource: componentSources[0],
  expectedDate: "2026-04-08",
  paymentTerm: paymentTerms[1],
  poReference: "PO-2026-184",
  reserveDock: true,
  notifyOps: true,
  notes:
    "This replenishment batch is meant to cover the next sales cycle and reduce the low-stock alerts on core SKUs.",
};

function cloneOrderValues(values: EditableOrderValues): EditableOrderValues {
  return {
    ...values,
    selectedItems: { ...values.selectedItems },
  };
}

function StepButton({
  title,
  caption,
  index,
  current,
  complete,
  onClick,
}: {
  title: string;
  caption: string;
  index: number;
  current: boolean;
  complete: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border px-4 py-3 text-left transition-colors",
        current
          ? "border-foreground/20 bg-background shadow-sm"
          : "border-border/50 bg-background/60 hover:border-border/80 hover:bg-background",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
            complete
              ? "border-emerald-500/30 bg-emerald-500/12 text-emerald-700"
              : current
                ? "border-foreground/20 bg-foreground text-background"
                : "border-border/70 text-muted-foreground",
          )}
        >
          {complete ? <Check className="h-4 w-4" /> : index + 1}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-tight">{title}</p>
          <p className="text-muted-foreground mt-0.5 text-xs leading-5">
            {caption}
          </p>
        </div>
      </div>
    </button>
  );
}

function MobileStepButton({
  title,
  index,
  current,
  complete,
  onClick,
}: {
  title: string;
  index: number;
  current: boolean;
  complete: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-w-[140px] shrink-0 items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors",
        current
          ? "border-foreground/20 bg-background shadow-sm"
          : "border-border/50 bg-background/70",
      )}
    >
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
          complete
            ? "border-emerald-500/30 bg-emerald-500/12 text-emerald-700"
            : current
              ? "border-foreground/20 bg-foreground text-background"
              : "border-border/70 text-muted-foreground",
        )}
      >
        {complete ? <Check className="h-3.5 w-3.5" /> : index + 1}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold tracking-tight">{title}</p>
      </div>
    </button>
  );
}

export function EcommerceAddOrder() {
  return <EcommerceOrderEditor mode="add" initialValues={defaultOrderValues} />;
}

export function EcommerceEditOrder({
  initialValues,
  orderCode,
}: {
  initialValues: EditableOrderValues;
  orderCode: string;
}) {
  return (
    <EcommerceOrderEditor
      mode="edit"
      initialValues={initialValues}
      orderCode={orderCode}
    />
  );
}

function EcommerceOrderEditor({
  mode,
  initialValues,
  orderCode,
}: {
  mode: OrderEditorMode;
  initialValues: EditableOrderValues;
  orderCode?: string;
}) {
  const lowStockProducts = React.useMemo(() => {
    return [...inventoryCards].sort((left, right) => left.stock - right.stock);
  }, []);

  const seededValues = React.useMemo(
    () => cloneOrderValues(initialValues),
    [initialValues],
  );

  const [currentStep, setCurrentStep] = React.useState<StepId>("select");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedItems, setSelectedItems] = React.useState<
    Record<string, number>
  >(seededValues.selectedItems);
  const [method, setMethod] = React.useState<ReplenishmentMethod>(
    seededValues.method,
  );
  const [vendor, setVendor] = React.useState(seededValues.vendor);
  const [buyer, setBuyer] = React.useState(seededValues.buyer);
  const [destinationWarehouse, setDestinationWarehouse] = React.useState(
    seededValues.destinationWarehouse,
  );
  const [transferWarehouse, setTransferWarehouse] = React.useState(
    seededValues.transferWarehouse,
  );
  const [productionCell, setProductionCell] = React.useState(
    seededValues.productionCell,
  );
  const [componentSource, setComponentSource] = React.useState(
    seededValues.componentSource,
  );
  const [expectedDate, setExpectedDate] = React.useState(
    seededValues.expectedDate,
  );
  const [paymentTerm, setPaymentTerm] = React.useState(
    seededValues.paymentTerm,
  );
  const [poReference, setPoReference] = React.useState(
    seededValues.poReference,
  );
  const [reserveDock, setReserveDock] = React.useState(
    seededValues.reserveDock,
  );
  const [notifyOps, setNotifyOps] = React.useState(seededValues.notifyOps);
  const [notes, setNotes] = React.useState(seededValues.notes);

  const filteredProducts = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return lowStockProducts;
    }

    return lowStockProducts.filter((product) => {
      return (
        product.name.toLowerCase().includes(query) ||
        product.sku.toLowerCase().includes(query) ||
        product.category.toLowerCase().includes(query)
      );
    });
  }, [lowStockProducts, searchQuery]);

  const selectedProducts = React.useMemo(() => {
    return lowStockProducts.filter((product) => selectedItems[product.name]);
  }, [lowStockProducts, selectedItems]);

  const availableProducts = React.useMemo(() => {
    return filteredProducts.filter((product) => !selectedItems[product.name]);
  }, [filteredProducts, selectedItems]);

  const currentIndex = stepConfig.findIndex((step) => step.id === currentStep);
  const totalUnits = Object.values(selectedItems).reduce(
    (sum, quantity) => sum + quantity,
    0,
  );

  const subtotal = selectedProducts.reduce((sum, product) => {
    return (
      sum + parsePrice(product.wholesale) * (selectedItems[product.name] ?? 0)
    );
  }, 0);

  const freightEstimate =
    method === "purchase-order" ? 42 : method === "stock-transfer" ? 18 : 26;
  const grandTotal = subtotal + freightEstimate;

  function toggleProduct(productName: string) {
    setSelectedItems((current) => {
      if (current[productName]) {
        const next = { ...current };
        delete next[productName];
        return next;
      }

      const product = lowStockProducts.find(
        (item) => item.name === productName,
      );
      const quantity = product ? suggestedReorderQty(product.stock) : 24;

      return {
        ...current,
        [productName]: quantity,
      };
    });
  }

  function updateQuantity(productName: string, nextQuantity: number) {
    setSelectedItems((current) => ({
      ...current,
      [productName]: Math.max(1, nextQuantity),
    }));
  }

  function goToStep(step: StepId) {
    const targetIndex = stepConfig.findIndex((item) => item.id === step);

    if (targetIndex <= currentIndex) {
      setCurrentStep(step);
      return;
    }

    if (currentStep === "select" && selectedProducts.length === 0) {
      return;
    }

    if (
      currentStep === "method" &&
      (!buyer ||
        !destinationWarehouse ||
        !expectedDate ||
        (method === "purchase-order" && !vendor))
    ) {
      return;
    }

    setCurrentStep(step);
  }

  function goToNextStep() {
    const nextStep = stepConfig[currentIndex + 1]?.id;
    if (nextStep) {
      goToStep(nextStep);
    }
  }

  function goToPreviousStep() {
    const previousStep = stepConfig[currentIndex - 1]?.id;
    if (previousStep) {
      setCurrentStep(previousStep);
    }
  }

  function applySeed(values: EditableOrderValues) {
    setCurrentStep("select");
    setSearchQuery("");
    setSelectedItems({ ...values.selectedItems });
    setMethod(values.method);
    setVendor(values.vendor);
    setBuyer(values.buyer);
    setDestinationWarehouse(values.destinationWarehouse);
    setTransferWarehouse(values.transferWarehouse);
    setProductionCell(values.productionCell);
    setComponentSource(values.componentSource);
    setExpectedDate(values.expectedDate);
    setPaymentTerm(values.paymentTerm);
    setPoReference(values.poReference);
    setReserveDock(values.reserveDock);
    setNotifyOps(values.notifyOps);
    setNotes(values.notes);
  }

  React.useEffect(() => {
    applySeed(seededValues);
  }, [seededValues]);

  function resetOrder() {
    applySeed(seededValues);
  }

  const canContinue =
    currentStep === "select"
      ? selectedProducts.length > 0
      : currentStep === "method"
        ? Boolean(
            buyer &&
            destinationWarehouse &&
            expectedDate &&
            (method !== "purchase-order" || vendor),
          )
        : true;

  const pageTitle = mode === "add" ? "Add New Order" : "Edit Order";
  const pageDescription =
    mode === "add"
      ? "Build a replenishment request for low-stock SKUs, then hand off one clear purchase brief to procurement."
      : "Refine selected products, sourcing, and receiving details without leaving the guided order flow.";
  const statusLabel = mode === "add" ? "Draft" : "Editing";
  const resetLabel = mode === "add" ? "Reset order" : "Reset changes";
  const saveLabel = mode === "add" ? "Save draft" : "Save changes";
  const submitLabel = mode === "add" ? "Submit purchase order" : "Update order";
  const backHref = orderCode
    ? `/ecommerce/order-detail-2?code=${encodeURIComponent(orderCode.toLowerCase())}`
    : "/ecommerce/order-list-3";

  const renderProductRow = (
    product: (typeof inventoryCards)[number],
    options?: { selectedSection?: boolean },
  ) => {
    const isSelected = Boolean(selectedItems[product.name]);
    const quantity = selectedItems[product.name] ?? 0;
    const recommendedQty = suggestedReorderQty(product.stock);
    const isSelectedSection = options?.selectedSection ?? false;

    return (
      <div
        key={product.name}
        role="button"
        tabIndex={0}
        onClick={() => toggleProduct(product.name)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggleProduct(product.name);
          }
        }}
        className={cn(
          "rounded-2xl border px-4 py-2.5 text-left transition-colors outline-none",
          "focus-visible:ring-ring/50 focus-visible:ring-2",
          isSelected
            ? "border-foreground/20 bg-background ring-foreground/8 shadow-sm ring-1"
            : "border-border/60 bg-background/60 hover:border-border hover:bg-background",
          isSelectedSection && "bg-background",
        )}
      >
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="bg-muted/30 border-border/60 relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border">
              <Image
                src={product.image}
                alt={product.name}
                fill
                sizes="48px"
                className="object-cover"
              />
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-[15px] font-semibold tracking-tight">
                  {product.name}
                </p>
                <Badge
                  variant="outline"
                  className="rounded-md px-2 py-0.5 text-[11px]"
                >
                  {product.category}
                </Badge>
              </div>
              <p className="text-muted-foreground mt-0.5 text-sm">
                {product.sku} · {product.stock} in stock · wholesale{" "}
                {product.wholesale}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                <Badge
                  className={cn(
                    "rounded-md px-2 py-0.5 text-[11px]",
                    product.stockTone === "Low"
                      ? "bg-rose-500/12 text-rose-700 hover:bg-rose-500/12"
                      : "bg-emerald-500/12 text-emerald-700 hover:bg-emerald-500/12",
                  )}
                >
                  {product.stockTone === "Low" ? "Low stock" : "Healthy stock"}
                </Badge>
                <span className="text-muted-foreground text-xs">
                  Suggested reorder: {recommendedQty} units
                </span>
              </div>
            </div>
          </div>

          <div
            className="flex items-center justify-between gap-3 lg:min-w-[180px] lg:justify-end"
            onClick={(event) => event.stopPropagation()}
          >
            {isSelected ? (
              <div className="border-border/60 bg-background flex items-center gap-1.5 rounded-xl border px-2 py-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg"
                  onClick={() => updateQuantity(product.name, quantity - 1)}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="w-10 text-center text-sm font-medium">
                  {quantity}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg"
                  onClick={() => updateQuantity(product.name, quantity + 1)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="rounded-lg"
                onClick={() => toggleProduct(product.name)}
              >
                Add
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderSelectedSummaryRow = (
    product: (typeof inventoryCards)[number],
    options?: { compact?: boolean },
  ) => {
    const quantity = selectedItems[product.name] ?? 0;
    const compact = options?.compact ?? false;

    return (
      <div
        key={product.name}
        className={cn(
          "border-border/60 bg-background flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5",
          compact && "px-3 py-2",
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="bg-muted/30 border-border/60 relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border">
            <Image
              src={product.image}
              alt={product.name}
              fill
              sizes="44px"
              className="object-cover"
            />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{product.name}</p>
            <p className="text-muted-foreground text-xs">
              Stock {product.stock} {"->"} +{quantity} units
            </p>
          </div>
        </div>
        <span className="shrink-0 text-sm font-semibold">
          {currencyFormatter.format(parsePrice(product.wholesale) * quantity)}
        </span>
      </div>
    );
  };

  const renderSelectedTrayCard = (product: (typeof inventoryCards)[number]) => {
    const quantity = selectedItems[product.name] ?? 0;

    return (
      <div
        key={product.name}
        className="border-border/50 bg-background/80 relative flex w-[300px] shrink-0 items-center gap-3 rounded-xl border px-3 py-2"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="border-border/60 bg-background text-muted-foreground hover:bg-background absolute top-0 right-0 z-10 h-6 w-6 translate-x-1/2 -translate-y-1/2 rounded-full border shadow-none"
          onClick={() => toggleProduct(product.name)}
          aria-label={`Remove ${product.name}`}
        >
          <X className="h-3 w-3" />
        </Button>

        <div className="bg-muted/30 relative h-10 w-10 shrink-0 overflow-hidden rounded-lg">
          <Image
            src={product.image}
            alt={product.name}
            fill
            sizes="40px"
            className="object-cover"
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{product.name}</p>
          <p className="text-muted-foreground mt-1 text-xs">
            {quantity} units selected
          </p>
        </div>

        <div className="bg-muted/40 flex shrink-0 items-center gap-1 rounded-lg px-1 py-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-md"
            onClick={() => updateQuantity(product.name, quantity - 1)}
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <span className="w-8 text-center text-xs font-medium">
            {quantity}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-md"
            onClick={() => updateQuantity(product.name, quantity + 1)}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <section className="border-border/70 shrink-0 border-b px-4 py-4 md:px-6">
        <div className="mx-auto w-full max-w-[1240px]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <Button
                variant="outline"
                size="icon"
                className="rounded-xl"
                asChild
              >
                <Link href={backHref} aria-label="Back to orders">
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight">
                    {pageTitle}
                  </h1>
                  <Badge variant="secondary" className="rounded-md px-2 py-0.5">
                    {statusLabel}
                  </Badge>
                </div>
                <p className="text-muted-foreground max-w-3xl text-sm leading-6">
                  {pageDescription}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <Button
                variant="ghost"
                className="rounded-lg"
                onClick={resetOrder}
              >
                {resetLabel}
              </Button>
              <Button variant="outline" className="rounded-lg">
                {saveLabel}
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-muted/15 shrink-0 border-b px-4 py-3 md:px-6">
        <div className="mx-auto w-full max-w-[1240px]">
          <div className="flex gap-2 overflow-x-auto pb-1 md:hidden">
            {stepConfig.map((step, index) => (
              <MobileStepButton
                key={step.id}
                title={step.title}
                index={index}
                current={currentStep === step.id}
                complete={currentIndex > index}
                onClick={() => goToStep(step.id)}
              />
            ))}
          </div>

          <div className="hidden gap-3 md:grid lg:grid-cols-3">
            {stepConfig.map((step, index) => (
              <StepButton
                key={step.id}
                title={step.title}
                caption={step.caption}
                index={index}
                current={currentStep === step.id}
                complete={currentIndex > index}
                onClick={() => goToStep(step.id)}
              />
            ))}
          </div>
        </div>
      </section>

      <div className="flex min-h-0 flex-1 flex-col">
        <main className="flex min-h-0 flex-1 flex-col overflow-auto">
          <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-4 pb-6 md:min-h-0 md:px-6 md:py-6 md:pb-24">
            <Card className="border-border/60 flex flex-col rounded-2xl shadow-none md:min-h-0 md:flex-1 md:overflow-hidden">
              <CardContent
                className={cn(
                  "p-4 sm:p-5 md:p-6",
                  currentStep === "select"
                    ? "flex flex-col gap-4 md:grid md:min-h-0 md:flex-1 md:grid-rows-[auto_minmax(0,1fr)] md:overflow-hidden"
                    : "grid gap-6 md:min-h-0 md:flex-1 md:overflow-y-auto",
                )}
              >
                {currentStep === "select" ? (
                  <>
                    <div className="flex flex-col gap-4 md:min-h-0 md:flex-1 md:overflow-hidden">
                      <div className="shrink-0">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">
                              Selected products
                            </p>
                            <p className="text-muted-foreground mt-0.5 text-xs">
                              Keep the current order visible while you browse
                              for more items.
                            </p>
                          </div>
                          <Badge
                            variant="secondary"
                            className="rounded-md px-2 py-0.5"
                          >
                            {selectedProducts.length} selected
                          </Badge>
                        </div>

                        {selectedProducts.length > 0 ? (
                          <>
                            <div className="mt-3 grid gap-3 md:hidden">
                              {selectedProducts.map((product) =>
                                renderSelectedSummaryRow(product, {
                                  compact: true,
                                }),
                              )}
                            </div>

                            <div className="mt-2 hidden overflow-x-auto px-1 pt-1.5 pr-2 pb-0 md:block">
                              <div className="flex min-w-max gap-2">
                                {selectedProducts.map((product) =>
                                  renderSelectedTrayCard(product),
                                )}
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="text-muted-foreground border-border/60 bg-background/75 mt-3 rounded-xl border border-dashed px-4 py-3 text-sm">
                            No products selected yet. Add items from the catalog
                            below to start building this purchase order.
                          </div>
                        )}
                      </div>

                      <div
                        className={cn(
                          "flex flex-col gap-4",
                          selectedProducts.length > 0
                            ? "border-border/60 border-t pt-4"
                            : "pt-1",
                          "md:min-h-0 md:flex-1",
                        )}
                      >
                        <div className="shrink-0">
                          <div className="flex flex-col gap-3 md:grid md:grid-cols-[minmax(0,1fr)_340px] md:items-center lg:grid-cols-[minmax(0,1fr)_360px]">
                            <div className="min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-medium">
                                  Available products
                                </p>
                                <Badge
                                  variant="outline"
                                  className="rounded-md px-2 py-0.5 sm:shrink-0"
                                >
                                  {availableProducts.length} available
                                </Badge>
                              </div>

                              <p className="text-muted-foreground text-xs leading-5">
                                Search the remaining low-stock products and add
                                more lines.
                              </p>
                            </div>

                            <div className="relative w-full">
                              <Search className="text-muted-foreground absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2" />
                              <Input
                                value={searchQuery}
                                onChange={(event) =>
                                  setSearchQuery(event.target.value)
                                }
                                placeholder="Search available products or SKU..."
                                className="bg-background h-11 rounded-xl pl-11 shadow-none"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="grid gap-3 md:hidden">
                          {availableProducts.length > 0 ? (
                            availableProducts.map((product) =>
                              renderProductRow(product),
                            )
                          ) : (
                            <div className="border-border/60 bg-background/70 text-muted-foreground rounded-xl border border-dashed px-4 py-8 text-center text-sm">
                              No available products match this search.
                            </div>
                          )}
                        </div>

                        <ScrollArea className="hidden min-h-0 flex-1 pr-2 md:block">
                          <div className="grid gap-3">
                            {availableProducts.length > 0 ? (
                              availableProducts.map((product) =>
                                renderProductRow(product),
                              )
                            ) : (
                              <div className="border-border/60 bg-background/70 text-muted-foreground rounded-xl border border-dashed px-4 py-8 text-center text-sm">
                                No available products match this search.
                              </div>
                            )}
                          </div>
                        </ScrollArea>
                      </div>
                    </div>
                  </>
                ) : null}

                {currentStep === "method" ? (
                  <>
                    <div>
                      <p className="text-sm font-semibold tracking-tight">
                        Order details
                      </p>
                      <p className="text-muted-foreground mt-1 text-sm">
                        Define where these units are going, where they are
                        coming from, and how this replenishment request should
                        be sourced.
                      </p>
                    </div>

                    <div className="border-border/60 bg-muted/10 rounded-2xl border p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">
                            Selected products
                          </p>
                          <p className="text-muted-foreground mt-1 text-xs">
                            These are the lines this order will replenish.
                          </p>
                        </div>
                        <Badge
                          variant="secondary"
                          className="rounded-md px-2 py-0.5"
                        >
                          {selectedProducts.length} lines
                        </Badge>
                      </div>
                      <div className="mt-4 grid gap-3">
                        {selectedProducts.map((product) =>
                          renderSelectedSummaryRow(product, { compact: true }),
                        )}
                      </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)]">
                      <div className="border-border/60 bg-background rounded-2xl border p-4">
                        <div>
                          <p className="text-sm font-medium">Receiving</p>
                          <p className="text-muted-foreground mt-1 text-xs">
                            Set who owns the order and where the units should
                            land.
                          </p>
                        </div>

                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <div className="grid gap-2">
                            <label className="text-sm font-medium">
                              Destination warehouse
                            </label>
                            <Select
                              value={destinationWarehouse}
                              onValueChange={setDestinationWarehouse}
                            >
                              <SelectTrigger className="h-11 rounded-lg">
                                <SelectValue placeholder="Select warehouse" />
                              </SelectTrigger>
                              <SelectContent>
                                {destinationWarehouses.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="grid gap-2">
                            <label className="text-sm font-medium">
                              Expected arrival
                            </label>
                            <Input
                              type="date"
                              value={expectedDate}
                              onChange={(event) =>
                                setExpectedDate(event.target.value)
                              }
                              className="h-11 rounded-lg shadow-none"
                            />
                          </div>

                          <div className="grid gap-2">
                            <label className="text-sm font-medium">Buyer</label>
                            <Select value={buyer} onValueChange={setBuyer}>
                              <SelectTrigger className="h-11 rounded-lg">
                                <SelectValue placeholder="Select buyer" />
                              </SelectTrigger>
                              <SelectContent>
                                {buyerOptions.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="grid gap-2">
                            <label className="text-sm font-medium">
                              PO reference
                            </label>
                            <Input
                              value={poReference}
                              onChange={(event) =>
                                setPoReference(event.target.value)
                              }
                              className="h-11 rounded-lg shadow-none"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="border-border/60 bg-muted/10 rounded-2xl border p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">Order summary</p>
                            <p className="text-muted-foreground mt-1 text-xs">
                              Live totals for the selected replenishment path.
                            </p>
                          </div>
                          <Badge
                            variant="outline"
                            className="rounded-md px-2 py-0.5"
                          >
                            {
                              replenishmentMethods.find(
                                (item) => item.id === method,
                              )?.title
                            }
                          </Badge>
                        </div>

                        <div className="mt-4 grid gap-3 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Lines</span>
                            <span className="font-medium">
                              {selectedProducts.length}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Units</span>
                            <span className="font-medium">{totalUnits}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">
                              Lead time
                            </span>
                            <span className="font-medium">
                              {estimatedLeadDays(method)} days
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">
                              Item cost
                            </span>
                            <span className="font-medium">
                              {currencyFormatter.format(subtotal)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">
                              Freight estimate
                            </span>
                            <span className="font-medium">
                              {currencyFormatter.format(freightEstimate)}
                            </span>
                          </div>
                          <div className="border-border/60 flex items-center justify-between border-t pt-3 text-base font-semibold">
                            <span>Total</span>
                            <span>{currencyFormatter.format(grandTotal)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="border-border/60 bg-background rounded-2xl border p-4">
                      <div>
                        <p className="text-sm font-medium">Reorder setup</p>
                        <p className="text-muted-foreground mt-1 text-xs">
                          Choose where these units are coming from, then
                          complete only the details for that source.
                        </p>
                      </div>

                      <div className="mt-4 grid gap-3">
                        {replenishmentMethods.map((option) => {
                          const Icon = option.icon;
                          const active = method === option.id;

                          return (
                            <div
                              key={option.id}
                              className={cn(
                                "rounded-2xl border transition-colors",
                                active
                                  ? "border-foreground/20 bg-muted/10 shadow-sm"
                                  : "border-border/60 bg-background",
                              )}
                            >
                              <div
                                role="button"
                                tabIndex={0}
                                onClick={() => setMethod(option.id)}
                                onKeyDown={(event) => {
                                  if (
                                    event.key === "Enter" ||
                                    event.key === " "
                                  ) {
                                    event.preventDefault();
                                    setMethod(option.id);
                                  }
                                }}
                                className="focus-visible:ring-ring/50 flex cursor-pointer items-start justify-between gap-4 p-4 outline-none focus-visible:ring-2"
                              >
                                <div className="flex items-start gap-3">
                                  <div className="bg-background/80 border-border/60 flex h-10 w-10 items-center justify-center rounded-lg border">
                                    <Icon className="text-muted-foreground h-4.5 w-4.5" />
                                  </div>
                                  <div>
                                    <p className="font-medium">
                                      {option.title}
                                    </p>
                                    <p className="text-muted-foreground mt-1 text-sm">
                                      {option.description}
                                    </p>
                                    <p className="text-muted-foreground mt-1 text-xs">
                                      {option.detail}
                                    </p>
                                  </div>
                                </div>
                                <div
                                  className={cn(
                                    "mt-1 h-5 w-5 rounded-full border-2 transition-colors",
                                    active
                                      ? "border-foreground bg-foreground shadow-[inset_0_0_0_4px_var(--background)]"
                                      : "border-border bg-background",
                                  )}
                                />
                              </div>

                              {active ? (
                                <div className="border-border/60 border-t px-4 pt-4 pb-4">
                                  <div className="grid gap-4 md:grid-cols-2">
                                    {option.id === "purchase-order" ? (
                                      <>
                                        <div className="grid gap-2">
                                          <label className="text-sm font-medium">
                                            Vendor
                                          </label>
                                          <Select
                                            value={vendor}
                                            onValueChange={setVendor}
                                          >
                                            <SelectTrigger className="h-11 rounded-lg">
                                              <SelectValue placeholder="Select vendor" />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {vendorOptions.map(
                                                (vendorOption) => (
                                                  <SelectItem
                                                    key={vendorOption}
                                                    value={vendorOption}
                                                  >
                                                    {vendorOption}
                                                  </SelectItem>
                                                ),
                                              )}
                                            </SelectContent>
                                          </Select>
                                        </div>

                                        <div className="grid gap-2">
                                          <label className="text-sm font-medium">
                                            Payment terms
                                          </label>
                                          <Select
                                            value={paymentTerm}
                                            onValueChange={setPaymentTerm}
                                          >
                                            <SelectTrigger className="h-11 rounded-lg">
                                              <SelectValue placeholder="Select terms" />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {paymentTerms.map((term) => (
                                                <SelectItem
                                                  key={term}
                                                  value={term}
                                                >
                                                  {term}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        </div>
                                      </>
                                    ) : null}

                                    {option.id === "stock-transfer" ? (
                                      <>
                                        <div className="grid gap-2 md:col-span-2">
                                          <label className="text-sm font-medium">
                                            Transfer from warehouse
                                          </label>
                                          <Select
                                            value={transferWarehouse}
                                            onValueChange={setTransferWarehouse}
                                          >
                                            <SelectTrigger className="h-11 rounded-lg">
                                              <SelectValue placeholder="Select source warehouse" />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {transferWarehouses.map(
                                                (warehouse) => (
                                                  <SelectItem
                                                    key={warehouse}
                                                    value={warehouse}
                                                  >
                                                    {warehouse}
                                                  </SelectItem>
                                                ),
                                              )}
                                            </SelectContent>
                                          </Select>
                                        </div>
                                      </>
                                    ) : null}

                                    {option.id === "work-order" ? (
                                      <>
                                        <div className="grid gap-2">
                                          <label className="text-sm font-medium">
                                            Production cell
                                          </label>
                                          <Select
                                            value={productionCell}
                                            onValueChange={setProductionCell}
                                          >
                                            <SelectTrigger className="h-11 rounded-lg">
                                              <SelectValue placeholder="Select production cell" />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {productionCells.map((cell) => (
                                                <SelectItem
                                                  key={cell}
                                                  value={cell}
                                                >
                                                  {cell}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        </div>

                                        <div className="grid gap-2">
                                          <label className="text-sm font-medium">
                                            Component source
                                          </label>
                                          <Select
                                            value={componentSource}
                                            onValueChange={setComponentSource}
                                          >
                                            <SelectTrigger className="h-11 rounded-lg">
                                              <SelectValue placeholder="Select component source" />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {componentSources.map(
                                                (source) => (
                                                  <SelectItem
                                                    key={source}
                                                    value={source}
                                                  >
                                                    {source}
                                                  </SelectItem>
                                                ),
                                              )}
                                            </SelectContent>
                                          </Select>
                                        </div>
                                      </>
                                    ) : null}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="border-border/60 bg-muted/10 rounded-2xl border p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-medium tracking-tight">
                            Operational handoff
                          </p>
                          <p className="text-muted-foreground mt-1 text-sm">
                            Decide how much of this requisition should be
                            prepared ahead of time for warehouse intake.
                          </p>
                        </div>
                        <div className="grid gap-2 text-sm">
                          <label className="flex items-center gap-3">
                            <Switch
                              checked={reserveDock}
                              onCheckedChange={setReserveDock}
                            />
                            <span>Reserve inbound dock slot</span>
                          </label>
                          <label className="flex items-center gap-3">
                            <Switch
                              checked={notifyOps}
                              onCheckedChange={setNotifyOps}
                            />
                            <span>Notify ops on submit</span>
                          </label>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <label className="text-sm font-medium">Order notes</label>
                      <Textarea
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        className="min-h-28 resize-none rounded-xl"
                      />
                    </div>
                  </>
                ) : null}

                {currentStep === "review" ? (
                  <>
                    <div>
                      <p className="text-sm font-semibold tracking-tight">
                        Review purchase brief
                      </p>
                      <p className="text-muted-foreground mt-1 text-sm">
                        Confirm the replenishment path, supplier context, and
                        total units before this becomes an actual purchasing
                        task.
                      </p>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
                      <div className="border-border/60 bg-muted/10 rounded-2xl border p-4">
                        <div className="flex items-center gap-2">
                          <Package className="text-muted-foreground h-4 w-4" />
                          <p className="font-medium">Replenishment lines</p>
                        </div>
                        <div className="mt-4 grid gap-3">
                          {selectedProducts.map((product) => (
                            <div
                              key={product.name}
                              className="border-border/60 bg-background flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                <div className="bg-muted/30 border-border/60 relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border">
                                  <Image
                                    src={product.image}
                                    alt={product.name}
                                    fill
                                    sizes="48px"
                                    className="object-cover"
                                  />
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate font-medium">
                                    {product.name}
                                  </p>
                                  <p className="text-muted-foreground text-sm">
                                    Stock {product.stock} {"->"} reorder{" "}
                                    {selectedItems[product.name]}
                                  </p>
                                </div>
                              </div>
                              <p className="font-semibold sm:text-right">
                                {currencyFormatter.format(
                                  parsePrice(product.wholesale) *
                                    (selectedItems[product.name] ?? 0),
                                )}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="grid gap-4">
                        <div className="border-border/60 bg-background rounded-2xl border p-4">
                          <p className="text-muted-foreground text-[11px] font-medium tracking-[0.12em] uppercase">
                            Procurement setup
                          </p>
                          <div className="mt-3 grid gap-3 text-sm">
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                              <span className="text-muted-foreground">
                                PO reference
                              </span>
                              <span className="font-medium sm:text-right">
                                {poReference}
                              </span>
                            </div>
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                              <span className="text-muted-foreground">
                                Method
                              </span>
                              <span className="font-medium sm:text-right">
                                {
                                  replenishmentMethods.find(
                                    (item) => item.id === method,
                                  )?.title
                                }
                              </span>
                            </div>
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                              <span className="text-muted-foreground">
                                Buyer
                              </span>
                              <span className="font-medium sm:text-right">
                                {buyer}
                              </span>
                            </div>
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                              <span className="text-muted-foreground">
                                Warehouse
                              </span>
                              <span className="font-medium sm:text-right">
                                {destinationWarehouse}
                              </span>
                            </div>
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                              <span className="text-muted-foreground">
                                Units
                              </span>
                              <span className="font-medium sm:text-right">
                                {totalUnits}
                              </span>
                            </div>
                            {method === "purchase-order" ? (
                              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                                <span className="text-muted-foreground">
                                  Vendor
                                </span>
                                <span className="font-medium sm:text-right">
                                  {vendor}
                                </span>
                              </div>
                            ) : null}
                            {method === "stock-transfer" ? (
                              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                                <span className="text-muted-foreground">
                                  Transfer from
                                </span>
                                <span className="font-medium sm:text-right">
                                  {transferWarehouse}
                                </span>
                              </div>
                            ) : null}
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                              <span className="text-muted-foreground">
                                Item cost
                              </span>
                              <span className="font-medium sm:text-right">
                                {currencyFormatter.format(subtotal)}
                              </span>
                            </div>
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                              <span className="text-muted-foreground">
                                Freight estimate
                              </span>
                              <span className="font-medium sm:text-right">
                                {currencyFormatter.format(freightEstimate)}
                              </span>
                            </div>
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                              <span className="text-muted-foreground">
                                Lead time
                              </span>
                              <span className="font-medium sm:text-right">
                                {estimatedLeadDays(method)} days
                              </span>
                            </div>
                            <div className="border-border/60 flex flex-col gap-1 border-t pt-3 text-base font-semibold sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                              <span>Total</span>
                              <span className="sm:text-right">
                                {currencyFormatter.format(grandTotal)}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="border-border/60 bg-background rounded-2xl border p-4">
                          <p className="text-muted-foreground text-[11px] font-medium tracking-[0.12em] uppercase">
                            Notes
                          </p>
                          <p className="text-muted-foreground mt-3 text-sm leading-6">
                            {notes}
                          </p>
                        </div>
                      </div>
                    </div>
                  </>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <footer className="bg-background shrink-0 border-t md:sticky md:bottom-0 md:z-20">
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between md:px-6">
              <div className="hidden flex-wrap items-center gap-2 text-sm sm:flex">
                <Badge variant="secondary" className="rounded-md px-2 py-0.5">
                  Step {currentIndex + 1} of {stepConfig.length}
                </Badge>
                <span className="text-muted-foreground">
                  {stepConfig[currentIndex]?.title}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
                <Button
                  variant="ghost"
                  className="w-full rounded-lg sm:w-auto"
                  onClick={goToPreviousStep}
                  disabled={currentIndex === 0}
                >
                  Back
                </Button>
                {currentStep === "review" ? (
                  <Button className="w-full rounded-lg px-5 sm:w-auto">
                    {submitLabel}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    className="w-full rounded-lg px-5 sm:w-auto"
                    onClick={goToNextStep}
                    disabled={!canContinue}
                  >
                    Continue
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
