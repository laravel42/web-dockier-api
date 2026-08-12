"use client";

import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  FileText,
  Globe,
  Mail,
  Package,
  Paperclip,
  Pencil,
  Phone,
  Store,
  Truck,
  Upload,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import * as React from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  InputGroup,
  InputGroupAddon,
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
import { Textarea } from "@/components/ui/textarea";
import { getOrderEditHref } from "@/lib/ecommerce-edit-orders";
import { inventoryCards } from "@/lib/ecommerce-product-catalog";
import {
  getSalesOrderDetailHref,
  type PaymentState,
  type SalesOrder,
  type SalesOrderStatus,
} from "@/lib/ecommerce-sales-orders";
import { cn } from "@/lib/utils";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const productLookup = new Map(
  inventoryCards.map((product) => [product.name, product]),
);

type SalesOrderDetailProps = {
  order: SalesOrder;
  previousOrderCode?: string;
  nextOrderCode?: string;
};

function paymentBadgeClassName(paymentState: PaymentState) {
  if (paymentState === "paid") {
    return "bg-emerald-500/12 text-emerald-700 hover:bg-emerald-500/12";
  }

  if (paymentState === "partial") {
    return "bg-amber-500/12 text-amber-700 hover:bg-amber-500/12";
  }

  return "bg-rose-500/12 text-rose-700 hover:bg-rose-500/12";
}

function statusLabel(status: SalesOrderStatus) {
  if (status === "shipment") return "Shipment";
  if (status === "started") return "Started";
  if (status === "fulfilled") return "Fulfilled";
  return "Quote";
}

function journeyTitle(status: Exclude<SalesOrderStatus, "all">) {
  if (status === "shipment") return "Order is on shipping";
  if (status === "started") return "Product in packaging";
  if (status === "fulfilled") return "Order delivered";
  return "New quote";
}

function statusTrackSteps(status: Exclude<SalesOrderStatus, "all">) {
  const activeIndex =
    status === "quote"
      ? 0
      : status === "started"
        ? 1
        : status === "shipment"
          ? 2
          : 3;

  return [
    { label: "Quote", icon: FileText, active: activeIndex >= 0 },
    { label: "Pack", icon: Package, active: activeIndex >= 1 },
    { label: "Ship", icon: Truck, active: activeIndex >= 2 },
    { label: "Done", icon: CheckCircle2, active: activeIndex >= 3 },
  ];
}

function DetailTrack({ status }: { status: Exclude<SalesOrderStatus, "all"> }) {
  const steps = statusTrackSteps(status);

  return (
    <div className="grid w-full gap-2.5 sm:gap-3">
      <div className="grid grid-cols-[repeat(4,minmax(0,1fr))] items-center gap-2 md:hidden">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isLast = index === steps.length - 1;

          return (
            <div key={step.label} className="flex items-center gap-1.5">
              <div
                className={cn(
                  "bg-background flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                  step.active
                    ? "border-foreground text-foreground"
                    : "border-border/70 text-muted-foreground",
                )}
              >
                <Icon className="h-2.5 w-2.5" />
              </div>
              {isLast ? null : (
                <div className="bg-border/70 h-1 flex-1 rounded-full">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      step.active && "bg-foreground",
                    )}
                    style={{ width: step.active ? "100%" : "0%" }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="hidden md:grid md:grid-cols-[auto_minmax(48px,1fr)_auto_minmax(48px,1fr)_auto_minmax(48px,1fr)_auto] md:items-center md:gap-x-4">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isLast = index === steps.length - 1;

          return (
            <React.Fragment key={step.label}>
              <div
                className={cn(
                  "bg-background flex h-7 w-7 shrink-0 items-center justify-center rounded-md border",
                  step.active
                    ? "border-foreground text-foreground"
                    : "border-border/70 text-muted-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </div>
              {isLast ? null : (
                <div className="bg-border/70 h-1 rounded-full">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      step.active && "bg-foreground",
                    )}
                    style={{ width: step.active ? "100%" : "0%" }}
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      <div className="text-muted-foreground hidden md:grid md:grid-cols-[auto_minmax(48px,1fr)_auto_minmax(48px,1fr)_auto_minmax(48px,1fr)_auto] md:gap-x-4 md:text-[11px] md:font-medium">
        {steps.map((step, index) => (
          <React.Fragment key={step.label}>
            <span>{step.label}</span>
            {index === steps.length - 1 ? null : <span aria-hidden="true" />}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function RightSidebarCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-border/60 bg-background/85 rounded-2xl border shadow-none backdrop-blur-sm">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl tracking-tight">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}

function DetailField({
  label,
  value,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <span className="text-muted-foreground text-[11px] font-medium tracking-[0.12em] uppercase">
        {label}
      </span>
      <div className="flex items-center gap-2 text-sm font-medium">
        {icon}
        <span>{value}</span>
      </div>
    </div>
  );
}

function formatAttachmentSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function PaymentAttachmentUploader() {
  const [files, setFiles] = React.useState<File[]>([]);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const inputId = React.useId();

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextFiles = Array.from(event.target.files ?? []);

    if (nextFiles.length === 0) {
      return;
    }

    setFiles((currentFiles) => [...currentFiles, ...nextFiles].slice(0, 5));
    event.target.value = "";
  }

  function removeFile(indexToRemove: number) {
    setFiles((currentFiles) =>
      currentFiles.filter((_, index) => index !== indexToRemove),
    );
  }

  return (
    <div className="grid gap-3">
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/*,.pdf"
        multiple
        className="sr-only"
        onChange={handleInputChange}
      />

      {files.length > 0 ? (
        <>
          <div className="border-border/60 bg-muted/10 rounded-lg border">
            {files.map((file, index) => (
              <div
                key={`${file.name}-${file.size}-${index}`}
                className={cn(
                  "flex items-center justify-between gap-3 px-4 py-3",
                  index !== files.length - 1 && "border-border/60 border-b",
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="bg-background border-border/60 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border">
                    <Paperclip className="text-muted-foreground h-4 w-4" />
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

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted-foreground text-xs">
              {files.length} of 5 attachments selected.
            </p>
            {files.length < 5 ? (
              <Button
                type="button"
                variant="outline"
                className="rounded-lg"
                asChild
              >
                <label htmlFor={inputId}>
                  <Upload data-icon="inline-start" />
                  Add files
                </label>
              </Button>
            ) : null}
          </div>
        </>
      ) : (
        <div className="border-border/70 bg-muted/15 rounded-lg border border-dashed p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="bg-background border-border/60 flex h-10 w-10 items-center justify-center rounded-lg border">
                <Paperclip className="text-muted-foreground h-4 w-4" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Upload up to 5 files</p>
                <p className="text-muted-foreground text-xs">
                  20 MB max. Receipts and remittance advice work best here.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="rounded-lg"
              asChild
            >
              <label htmlFor={inputId}>
                <Upload data-icon="inline-start" />
                Upload files
              </label>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function RecordPaymentSheet({
  invoiceNumber,
  totalAmount,
  receivedAmount,
}: {
  invoiceNumber: string;
  totalAmount: number;
  receivedAmount: number;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          className="bg-background/80 h-11 w-full rounded-lg shadow-none"
        >
          Record payment
        </Button>
      </SheetTrigger>

      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-xl">
        <SheetHeader className="border-border/70 border-b pr-8 pb-5">
          <SheetTitle className="text-2xl tracking-tight">
            Record Payment
          </SheetTitle>
        </SheetHeader>

        <div className="no-scrollbar flex-1 overflow-y-auto py-6 pr-1">
          <div className="grid gap-6">
            <div className="border-border/60 bg-muted/25 rounded-lg border p-5">
              <div className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <div className="space-y-1">
                  <p className="text-muted-foreground text-[11px] font-medium tracking-[0.12em] uppercase">
                    Payment for
                  </p>
                  <p className="text-xl font-semibold tracking-tight">
                    #{invoiceNumber}
                  </p>
                </div>
                <div className="space-y-1 text-left sm:text-right">
                  <p className="text-muted-foreground text-[11px] font-medium tracking-[0.12em] uppercase">
                    Total payment
                  </p>
                  <p className="text-lg font-semibold">
                    {currencyFormatter.format(totalAmount)}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">Amount received</label>
              <InputGroup className="h-12 rounded-lg">
                <InputGroupAddon className="border-r px-4">
                  <InputGroupText>$</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  defaultValue={String(totalAmount)}
                  inputMode="decimal"
                  aria-label="Amount received"
                  className="h-12 text-base"
                />
              </InputGroup>
              <p className="text-muted-foreground text-xs">
                Received so far: {currencyFormatter.format(receivedAmount)}
              </p>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">
                Bank charges (if any)
              </label>
              <InputGroup className="h-12 rounded-lg">
                <InputGroupAddon className="border-r px-4">
                  <InputGroupText>$</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  defaultValue="0.00"
                  inputMode="decimal"
                  aria-label="Bank charges"
                  className="h-12 text-base"
                />
              </InputGroup>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Payment method</label>
                <Select defaultValue="bank-transfer">
                  <SelectTrigger className="h-12 rounded-lg">
                    <SelectValue placeholder="Select method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank-transfer">Bank transfer</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="check">Check</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium">Deposit to</label>
                <Select defaultValue="operations">
                  <SelectTrigger className="h-12 rounded-lg">
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="operations">
                      Operations account
                    </SelectItem>
                    <SelectItem value="sales">Sales clearing</SelectItem>
                    <SelectItem value="marketplace">
                      Marketplace wallet
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">Attach files</label>
              <PaymentAttachmentUploader />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">Notes</label>
              <Textarea
                placeholder="Payment note"
                className="min-h-36 resize-none rounded-lg"
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
            <Button className="rounded-lg px-8">Save</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function EcommerceOrderDetail2({
  order,
  previousOrderCode,
  nextOrderCode,
}: SalesOrderDetailProps) {
  const product = productLookup.get(order.productName);
  const unitRate = order.amount / order.quantity;
  const taxRate = order.source === "Wholesale" ? 8 : 10;
  const subtotal = order.amount - (order.amount * taxRate) / 100;
  const invoiceNumber = `INV-${order.code.replace("SO-", "00")}`;
  const receivedAmount = order.paymentState === "paid" ? order.amount : 0;
  const customerEmail = `${order.customerName.toLowerCase().replace(/\s+/g, ".")}@acme-demo.co`;
  const phoneNumber =
    order.location === "Austin, TX"
      ? "+1 (512) 555-0192"
      : order.location === "Chicago, IL"
        ? "+1 (312) 555-0144"
        : order.location === "Seattle, WA"
          ? "+1 (206) 555-0118"
          : "+1 (718) 555-0136";

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-auto">
      <div className="flex min-h-0 flex-1 flex-col gap-6 p-4 md:p-6">
        <section className="border-border/70 border-b border-dashed pb-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex items-start gap-3">
              <Button
                variant="outline"
                size="icon"
                className="rounded-xl"
                asChild
              >
                <Link
                  href="/ecommerce/order-list-3"
                  aria-label="Back to sales orders"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight">
                    Order Number: {order.code}
                  </h1>
                  <Badge
                    className={cn(
                      "rounded-md px-2 py-0.5 text-xs",
                      paymentBadgeClassName(order.paymentState),
                    )}
                  >
                    {order.paymentState === "partial"
                      ? "Partial"
                      : order.paymentState === "paid"
                        ? "Paid"
                        : "Unpaid"}
                  </Badge>
                </div>
                <p className="text-muted-foreground max-w-2xl text-sm leading-6">
                  Sales-order detail view for the new pipeline flow, with
                  invoice, customer, and shipment context in one place.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" className="rounded-xl">
                {statusLabel(order.status)}
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="rounded-xl"
                asChild
              >
                <Link
                  href={
                    previousOrderCode
                      ? getSalesOrderDetailHref(previousOrderCode)
                      : "#"
                  }
                  aria-disabled={!previousOrderCode}
                  className={cn(
                    !previousOrderCode && "pointer-events-none opacity-50",
                  )}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="rounded-xl"
                asChild
              >
                <Link
                  href={
                    nextOrderCode ? getSalesOrderDetailHref(nextOrderCode) : "#"
                  }
                  aria-disabled={!nextOrderCode}
                  className={cn(
                    !nextOrderCode && "pointer-events-none opacity-50",
                  )}
                >
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button className="rounded-xl" asChild>
                <Link href={getOrderEditHref(order.code)}>
                  <Pencil className="h-4 w-4" />
                  Edit
                </Link>
              </Button>
              <Button variant="outline" size="icon" className="rounded-xl">
                <Ellipsis className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-8 xl:grid-cols-[minmax(0,1.52fr)_360px] xl:gap-12 2xl:grid-cols-[minmax(0,1.46fr)_380px] 2xl:gap-14">
          <div className="flex min-w-0 flex-col gap-6">
            <Card className="bg-muted/20 rounded-xl shadow-none">
              <CardContent className="grid gap-4 p-5">
                <div>
                  <p className="text-sm font-semibold">
                    {journeyTitle(order.status)}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {order.summary}
                  </p>
                </div>
                <DetailTrack status={order.status} />
              </CardContent>
            </Card>

            <section className="bg-background rounded-2xl px-5 py-6 shadow-none md:px-6">
              <div className="grid gap-10">
                <div className="grid gap-6">
                  <div className="space-y-1">
                    <h2 className="text-2xl font-semibold tracking-tight">
                      Order details
                    </h2>
                    <p className="text-muted-foreground text-sm">
                      Core assignment, source, and settlement details for this
                      order.
                    </p>
                  </div>

                  <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                    <DetailField
                      label="Source"
                      value={order.source}
                      icon={<Store className="h-4 w-4" />}
                    />
                    <DetailField
                      label="Order date"
                      value={order.orderDateLabel}
                    />
                    <DetailField label="Due date" value="Apr 10, 2026" />
                    <DetailField
                      label="Assign to"
                      value={order.accountManager}
                      icon={
                        <Avatar className="h-6 w-6">
                          <AvatarFallback>
                            {order.accountManager.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      }
                    />
                    <DetailField label="Payment term" value="Due on receipt" />
                    <DetailField label="Location" value={order.location} />
                  </div>
                </div>

                <Separator />

                <div className="grid gap-6">
                  <div className="space-y-1">
                    <h2 className="text-2xl font-semibold tracking-tight">
                      Product ordered
                    </h2>
                    <p className="text-muted-foreground text-sm">
                      Line-item summary and totals for the current sales order.
                    </p>
                  </div>

                  <div className="border-border/70 grid gap-4 border-b border-dashed pb-5 lg:grid-cols-[minmax(0,1.8fr)_80px_90px_80px_110px] lg:items-start">
                    <div className="flex items-center gap-3">
                      <div className="bg-muted/30 border-border/60 relative h-14 w-14 overflow-hidden rounded-xl border">
                        {product ? (
                          <Image
                            src={product.image}
                            alt={order.productName}
                            fill
                            sizes="56px"
                            className="object-cover"
                          />
                        ) : null}
                      </div>
                      <div>
                        <p className="font-medium">
                          {order.productName} / {order.variant}
                        </p>
                        <p className="text-muted-foreground text-sm">
                          SKU {product?.sku ?? "SKU-SALES-001"}
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-[11px] font-medium tracking-[0.12em] uppercase">
                        Qty
                      </p>
                      <p className="mt-1 font-medium">{order.quantity} pcs</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-[11px] font-medium tracking-[0.12em] uppercase">
                        Rate
                      </p>
                      <p className="mt-1 font-medium">
                        {currencyFormatter.format(unitRate)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-[11px] font-medium tracking-[0.12em] uppercase">
                        Tax
                      </p>
                      <p className="mt-1 font-medium">{taxRate}%</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-[11px] font-medium tracking-[0.12em] uppercase">
                        Subtotal
                      </p>
                      <p className="mt-1 font-medium">
                        {currencyFormatter.format(order.amount)}
                      </p>
                    </div>
                  </div>

                  <div className="ml-auto grid w-full max-w-sm gap-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="font-medium">
                        {currencyFormatter.format(subtotal)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Tax</span>
                      <span className="font-medium">
                        {currencyFormatter.format(order.amount - subtotal)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Discount</span>
                      <span className="font-medium">-</span>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between text-2xl font-semibold">
                      <span>Total</span>
                      <span>{currencyFormatter.format(order.amount)}</span>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="grid gap-8">
                  <div className="border-border/60 bg-muted/20 rounded-2xl border p-5">
                    <div className="max-w-3xl space-y-2">
                      <h2 className="text-2xl font-semibold tracking-tight">
                        Order term
                      </h2>
                      <p className="text-muted-foreground text-sm leading-7">
                        Orders for the sales pipeline require final confirmation
                        before carrier handoff. Packaging, tax review, and
                        invoice issuance are coordinated between merchandising
                        and operations before closeout.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4">
                    <div className="space-y-1">
                      <h2 className="text-2xl font-semibold tracking-tight">
                        Notes
                      </h2>
                      <p className="text-muted-foreground text-sm">
                        Internal coordination and customer context.
                      </p>
                    </div>
                    <Textarea
                      placeholder="Order notes"
                      className="min-h-24 resize-none rounded-xl"
                    />
                    <div className="border-border/60 bg-muted/10 rounded-2xl border">
                      {[
                        {
                          name: "Emily John Stones",
                          time: "17hrs ago",
                          note: "Customer asked to keep the invoice attached but delay outreach until packaging clears quality review.",
                        },
                        {
                          name: "Johnson Corn",
                          time: "2 days ago",
                          note: "Confirmed that the marketplace address matches the shipping location and the export label is ready.",
                        },
                      ].map((comment, index, comments) => (
                        <div
                          key={comment.name}
                          className={cn(
                            "px-5 py-4",
                            index !== comments.length - 1 &&
                              "border-border/60 border-b",
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <Avatar className="h-10 w-10">
                              <AvatarImage
                                src={`https://i.pravatar.cc/80?u=${comment.name}`}
                              />
                              <AvatarFallback>
                                {comment.name
                                  .split(" ")
                                  .map((part) => part[0])
                                  .join("")
                                  .slice(0, 2)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                <p className="font-medium">{comment.name}</p>
                                <p className="text-muted-foreground text-sm">
                                  {comment.time}
                                </p>
                              </div>
                              <p className="text-muted-foreground mt-2 text-sm leading-7">
                                {comment.note}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <aside className="bg-muted/30 border-border/60 flex min-w-0 flex-col gap-6 rounded-[28px] border p-5 shadow-none xl:sticky xl:top-4 xl:self-start xl:p-6">
            <RightSidebarCard title="Invoices">
              <div className="grid gap-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-[11px] font-medium tracking-[0.12em] uppercase">
                      Invoice
                    </p>
                    <span className="text-xl font-semibold tracking-tight">
                      #{invoiceNumber}
                    </span>
                  </div>
                  <Button
                    variant="link"
                    className="text-muted-foreground h-auto p-0 text-sm font-medium"
                  >
                    View invoice
                  </Button>
                </div>
                <Separator className="border-dashed" />
                <div className="grid gap-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Received</span>
                    <span className="text-base font-semibold">
                      {currencyFormatter.format(receivedAmount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Total payment</span>
                    <span className="text-base font-semibold">
                      {currencyFormatter.format(order.amount)}
                    </span>
                  </div>
                </div>
                <RecordPaymentSheet
                  invoiceNumber={invoiceNumber}
                  totalAmount={order.amount}
                  receivedAmount={receivedAmount}
                />
              </div>
            </RightSidebarCard>

            <RightSidebarCard title="Customer">
              <div className="grid gap-5">
                <div className="grid gap-5">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-14 w-14">
                      <AvatarImage
                        src={`https://i.pravatar.cc/120?u=${order.customerName}`}
                      />
                      <AvatarFallback>
                        {order.customerName
                          .split(" ")
                          .map((part) => part[0])
                          .join("")
                          .slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{order.customerName}</p>
                      <p className="text-muted-foreground text-sm">
                        {order.source}
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-3 text-sm">
                    <div className="flex items-start gap-2">
                      <Phone className="text-muted-foreground mt-0.5 h-4 w-4" />
                      <span>{phoneNumber}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Mail className="text-muted-foreground mt-0.5 h-4 w-4" />
                      <span>{customerEmail}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Globe className="text-muted-foreground mt-0.5 h-4 w-4" />
                      <span>acme-demo.co</span>
                    </div>
                  </div>
                </div>
              </div>
            </RightSidebarCard>

            <RightSidebarCard title="Address">
              <div>
                {[
                  {
                    title: "Billing address",
                    lines: [
                      order.customerName,
                      "2149 W Fulton St, Apt 4B",
                      order.location,
                      "United States",
                    ],
                  },
                  {
                    title: "Shipping address",
                    lines: [
                      order.customerName,
                      "4539 Conowingo Rd",
                      order.location,
                      "United States",
                    ],
                  },
                ].map((address, index, addresses) => (
                  <div
                    key={address.title}
                    className={cn(
                      "py-4 first:pt-0 last:pb-0",
                      index !== addresses.length - 1 &&
                        "border-border/60 border-b",
                    )}
                  >
                    <p className="text-sm font-medium">{address.title}</p>
                    <div className="text-muted-foreground mt-2 grid gap-1 text-sm leading-6">
                      {address.lines.map((line) => (
                        <span key={line}>{line}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </RightSidebarCard>
          </aside>
        </section>
      </div>
    </main>
  );
}
