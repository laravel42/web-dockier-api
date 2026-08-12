"use client";
import {
  ArrowLeft,
  CheckCircle2,
  CircleDashed,
  CreditCard,
  MapPin,
  Pencil,
  Plus,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Map } from "@/components/ui/map";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type PaymentStatus = "Paid" | "Pending" | "Canceled";
type FulfillmentStatus = "Unfulfilled" | "Fulfilled";
type JourneyStepState = "complete" | "current" | "upcoming";

type OrderItem = {
  id: string;
  name: string;
  sku: string;
  color: string;
  quantity: number;
  price: number;
  image: string;
  reserved?: boolean;
};

type JourneyStep = {
  id: string;
  label: string;
  state: JourneyStepState;
};

type OrderActivity = {
  id: string;
  title: string;
  detail?: string;
  time: string;
  state: "complete" | "current" | "upcoming";
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const orderItems: OrderItem[] = [
  {
    id: "item-01",
    name: "Radiance Ritual Set",
    sku: "SKU-SKIN-4006",
    color: "Soft beige",
    quantity: 1,
    price: 389,
    image:
      "/images/block/ecommerce/skin-care-product/pexels-amelie-chen-243775000-12352170-3.jpg",
  },
  {
    id: "item-02",
    name: "Barrier Repair Drops",
    sku: "SKU-TREAT-6612",
    color: "Amber glass",
    quantity: 2,
    price: 84,
    image:
      "/images/block/ecommerce/skin-care-product/pexels-karolina-grabowska-4938448-3.jpg",
    reserved: true,
  },
  {
    id: "item-03",
    name: "Botanical Body Polish",
    sku: "SKU-BODY-6118",
    color: "Citrus",
    quantity: 1,
    price: 52,
    image:
      "/images/block/ecommerce/skin-care-product/pexels-shkrabaanthony-6187540-3.jpg",
  },
];

const journeySteps: JourneyStep[] = [
  {
    id: "review",
    label: "Review order",
    state: "complete",
  },
  {
    id: "preparing",
    label: "Preparing",
    state: "current",
  },
  {
    id: "packing",
    label: "Packing",
    state: "upcoming",
  },
  {
    id: "dispatch",
    label: "Dispatch",
    state: "upcoming",
  },
];

const orderSummary = {
  id: "ORD-34021",
  orderDate: "Mar 18, 2026",
  customerName: "Maya Collins",
  channel: "online store",
  paymentStatus: "Paid" as PaymentStatus,
  fulfillmentStatus: "Unfulfilled" as FulfillmentStatus,
  returnLabel: "Return to Acme Store, Seattle, US",
  estimatedArrival: "Estimated arrival between Mar 22 and Mar 24",
  note: "Add a handwritten thank-you card and use the gift sleeve for the hero set.",
  email: "maya.collins@acme-demo.co",
  phone: "+1 (206) 555-0174",
  customerOrders: 4,
  addressName: "Maya Collins",
  addressLine1: "2149 W Fulton St, Apt 4B",
  addressLine2: "West Loop, Building C",
  addressLine3: "Chicago, IL 60612",
  addressCountry: "United States",
  addressLatitude: 41.8864,
  addressLongitude: -87.6712,
  paymentMethod: "Visa ending in 4242",
  shippingType: "Express shipping",
  shippingCost: 18,
  tax: 47.52,
};

const orderActivity: OrderActivity[] = [
  {
    id: "activity-01",
    title: "Payment captured",
    detail: "Visa ending in 4242 approved for the full order amount.",
    time: "Today, 9:12 AM",
    state: "complete",
  },
  {
    id: "activity-02",
    title: "Packing in progress",
    detail: "Fulfillment team is preparing the hero set and gift sleeve.",
    time: "Today, 10:36 AM",
    state: "current",
  },
  {
    id: "activity-03",
    title: "Carrier handoff next",
    time: "Expected in 1-2 hours",
    state: "upcoming",
  },
];

const shippingMapCenter: [number, number] = [
  orderSummary.addressLongitude,
  orderSummary.addressLatitude,
];

const subtotal = orderItems.reduce(
  (total, item) => total + item.price * item.quantity,
  0,
);

const total = subtotal + orderSummary.shippingCost + orderSummary.tax;

function getJourneyProgress(state: JourneyStepState) {
  if (state === "complete") return 100;
  if (state === "current") return 56;
  return 0;
}

const currentJourneyIndex = journeySteps.findIndex(
  (step) => step.state === "current",
);
const currentJourneyStep =
  currentJourneyIndex >= 0
    ? journeySteps[currentJourneyIndex]
    : journeySteps[0];
const mobileJourneyProgress =
  ((currentJourneyIndex >= 0 ? currentJourneyIndex + 0.6 : 1) /
    journeySteps.length) *
  100;

function StatusBadges() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge
        variant="secondary"
        className="bg-emerald-50 font-normal text-emerald-700 hover:bg-emerald-50"
      >
        <CheckCircle2 className="mr-1 size-3.5" />
        {orderSummary.paymentStatus}
      </Badge>
      <Badge
        variant="secondary"
        className="bg-slate-100 font-normal text-slate-700 hover:bg-slate-100"
      >
        <CircleDashed className="mr-1 size-3.5" />
        {orderSummary.fulfillmentStatus}
      </Badge>
    </div>
  );
}

function JourneyCard() {
  return (
    <Card className="rounded-lg shadow-none">
      <div className="sm:hidden">
        <CardHeader className="bg-muted/30 gap-3 border-b py-4">
          <div className="flex flex-col gap-1">
            <p className="text-muted-foreground text-xs">
              Return to{" "}
              <span className="text-foreground font-medium">
                Acme Store, Seattle, US
              </span>
            </p>
            <p className="text-muted-foreground text-xs">
              Estimated arrival{" "}
              <span className="text-foreground font-medium">
                Mar 22 to Mar 24
              </span>
            </p>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <p className="text-muted-foreground text-xs">Current step</p>
              <p className="font-medium">{currentJourneyStep.label}</p>
            </div>
            <Badge variant="outline" className="rounded-md font-normal">
              {currentJourneyIndex + 1} of {journeySteps.length}
            </Badge>
          </div>

          <Progress value={mobileJourneyProgress} className="h-1.5" />

          <div className="grid grid-cols-2 gap-2">
            {journeySteps.map((step) => (
              <div
                key={step.id}
                className={cn(
                  "rounded-md border px-3 py-2 text-xs",
                  step.state === "current" &&
                    "bg-muted/50 text-foreground border-foreground/15",
                  step.state === "complete" && "text-foreground border-border",
                  step.state === "upcoming" &&
                    "text-muted-foreground bg-muted/20 border-border",
                )}
              >
                {step.label}
              </div>
            ))}
          </div>
        </CardContent>
      </div>

      <div className="hidden sm:block">
        <CardHeader className="bg-muted/30 gap-4 border-b py-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted-foreground text-sm">
              Return to{" "}
              <span className="text-foreground font-medium">
                Acme Store, Seattle, US
              </span>
            </p>
            <p className="text-muted-foreground text-sm">
              Estimated arrived at{" "}
              <span className="text-foreground font-medium">
                Mar 22 to Mar 24
              </span>
            </p>
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          <div className="grid gap-4 sm:grid-cols-4">
            {journeySteps.map((step) => (
              <div key={step.id} className="flex flex-col gap-2.5">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "size-2.5 rounded-full",
                      step.state === "complete" && "bg-foreground",
                      step.state === "current" && "bg-primary",
                      step.state === "upcoming" && "bg-muted-foreground/35",
                    )}
                  />
                  <span
                    className={cn(
                      "text-sm",
                      step.state === "current"
                        ? "text-foreground font-medium"
                        : "text-muted-foreground",
                    )}
                  >
                    {step.label}
                  </span>
                </div>
                <Progress
                  value={getJourneyProgress(step.state)}
                  className="h-1.5"
                />
              </div>
            ))}
          </div>
        </CardContent>
      </div>
    </Card>
  );
}

function OrderItemRow({ item }: { item: OrderItem }) {
  return (
    <div className="flex items-start gap-4">
      <div className="bg-muted relative size-20 shrink-0 overflow-hidden rounded-xl">
        <Image
          src={item.image}
          alt={item.name}
          fill
          sizes="80px"
          className="object-cover"
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className="truncate text-base font-medium">{item.name}</h3>
            <p className="text-muted-foreground mt-1 text-sm">{item.sku}</p>
            <p className="text-muted-foreground mt-3 text-sm">
              {item.color} · Quantity {item.quantity}
            </p>
            {item.reserved ? (
              <Button
                variant="link"
                className="mt-2 h-auto p-0 text-sm font-medium"
              >
                Reserved item
              </Button>
            ) : null}
          </div>

          <p className="text-base font-semibold">
            {currencyFormatter.format(item.price * item.quantity)}
          </p>
        </div>
      </div>
    </div>
  );
}

function ShippingAddressMap() {
  return (
    <div className="relative overflow-hidden rounded-md border">
      <div className="h-40 w-full">
        <Map
          center={shippingMapCenter}
          zoom={15.6}
          theme="light"
          styles={{
            light: "https://tiles.openfreemap.org/styles/liberty",
            dark: "https://tiles.openfreemap.org/styles/liberty",
          }}
          attributionControl={false}
          interactive={false}
          bearing={0}
          pitch={0}
          className="h-full w-full"
        />
      </div>

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="relative flex items-center justify-center">
          <span className="bg-primary/20 absolute size-12 rounded-full" />
          <div className="bg-primary text-primary-foreground relative flex size-10 items-center justify-center rounded-full border-2 border-white shadow-lg">
            <MapPin className="size-4" />
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute top-3 left-3">
        <div className="bg-background/95 text-foreground rounded-sm border px-2.5 py-1 text-xs font-medium shadow-sm">
          Chicago, IL
        </div>
      </div>
    </div>
  );
}

export function EcommerceOrderDetail1() {
  return (
    <div className="flex flex-col">
      <div className="flex flex-col p-6 md:p-8">
        <div className="flex flex-col gap-5 pb-6 md:hidden">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-foreground font-medium">Acme Store</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-foreground font-medium">Orders</span>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="size-9 rounded-md border shadow-none"
          >
            <ArrowLeft />
          </Button>

          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            <p className="text-muted-foreground text-[11px] font-medium tracking-[0.18em] uppercase">
              Order details
            </p>
            <h1 className="text-[1.75rem] leading-none font-semibold tracking-tight">
              {orderSummary.id}
            </h1>
            <StatusBadges />
            <p className="text-muted-foreground text-sm leading-6">
              {orderSummary.orderDate} · {orderSummary.customerName} ·{" "}
              <span className="capitalize">{orderSummary.channel}</span>
            </p>
          </div>
        </div>

        <div className="hidden items-start justify-between gap-6 pb-8 md:flex">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                className="size-10 rounded-full"
              >
                <ArrowLeft />
              </Button>
              <h1 className="text-4xl font-medium tracking-tight">
                {orderSummary.id}
              </h1>
              <StatusBadges />
            </div>

            <p className="text-muted-foreground text-sm">
              Order date {orderSummary.orderDate} · Order from{" "}
              <span className="text-foreground font-medium">
                {orderSummary.customerName}
              </span>{" "}
              · Purchased via {orderSummary.channel}
            </p>
          </div>

          <div className="flex flex-col items-end gap-3">
            <div className="flex items-center gap-1">
              <Button variant="link" className="h-auto px-2 text-sm">
                Contact customer
              </Button>
              <Button variant="link" className="h-auto px-2 text-sm">
                Print invoice
              </Button>
              <Button variant="link" className="h-auto px-2 text-sm">
                Share order
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_1px_340px] xl:gap-8">
          <div className="flex flex-col gap-6">
            <JourneyCard />

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button
                variant="link"
                className="h-auto justify-start p-0 text-sm"
              >
                Cancel Order
              </Button>
              <Button className="sm:min-w-52" asChild>
                <Link href="/ecommerce/add-shipping">
                  <Plus data-icon="inline-start" />
                  Create Shipping Label
                </Link>
              </Button>
            </div>

            <Separator />

            <section className="flex flex-col gap-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-xl font-semibold">Products</h2>
                <Badge
                  variant="secondary"
                  className="bg-slate-100 font-normal text-slate-700 hover:bg-slate-100"
                >
                  <CircleDashed className="mr-1 size-3.5" />
                  {orderSummary.fulfillmentStatus}
                </Badge>
              </div>

              {orderItems.map((item, index) => (
                <div key={item.id} className="flex flex-col gap-6">
                  <OrderItemRow item={item} />
                  {index < orderItems.length - 1 ? <Separator /> : null}
                </div>
              ))}

              <Separator />

              <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold">Payment details</h2>
                  <Badge
                    variant="secondary"
                    className="bg-emerald-50 font-normal text-emerald-700 hover:bg-emerald-50"
                  >
                    <CheckCircle2 className="mr-1 size-3.5" />
                    {orderSummary.paymentStatus}
                  </Badge>
                </div>

                <div className="grid gap-4 text-sm">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <span className="text-muted-foreground">
                      Payment method
                    </span>
                    <span className="text-foreground inline-flex items-center gap-2 font-medium">
                      <CreditCard className="size-4" />
                      {orderSummary.paymentMethod}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-medium">
                      {orderItems.length} items ·{" "}
                      {currencyFormatter.format(subtotal)}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <span className="text-muted-foreground">Shipping type</span>
                    <span className="max-w-sm text-right font-medium">
                      {orderSummary.shippingType}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <span className="text-muted-foreground">Shipping fee</span>
                    <span className="font-medium">
                      {currencyFormatter.format(orderSummary.shippingCost)}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <span className="text-muted-foreground">Tax</span>
                    <span className="font-medium">
                      {currencyFormatter.format(orderSummary.tax)}
                    </span>
                  </div>
                </div>

                <Separator />

                <div className="flex items-center justify-between gap-3">
                  <span className="text-base font-semibold">Total</span>
                  <span className="text-xl font-semibold">
                    {currencyFormatter.format(total)}
                  </span>
                </div>
              </div>
            </section>
          </div>

          <Separator
            orientation="vertical"
            className="hidden xl:block xl:h-auto"
          />

          <div className="flex flex-col gap-5">
            <Card className="rounded-lg shadow-none">
              <CardContent className="flex flex-col gap-6 pt-5">
                <div className="flex flex-col gap-5">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-medium">Shipping address</h3>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 rounded-md"
                    >
                      <Pencil />
                    </Button>
                  </div>

                  <ShippingAddressMap />

                  <div className="flex flex-col gap-3 px-1">
                    <div className="flex flex-col gap-1">
                      <p className="font-medium">{orderSummary.addressName}</p>
                      <p className="text-muted-foreground text-sm leading-6">
                        {orderSummary.addressLine1}
                        <br />
                        {orderSummary.addressLine2}
                        <br />
                        {orderSummary.addressLine3},{" "}
                        {orderSummary.addressCountry}
                      </p>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="flex flex-col gap-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="size-14">
                        <AvatarImage
                          src="/avatars/avatar-3.png"
                          alt={orderSummary.customerName}
                        />
                        <AvatarFallback>MC</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col gap-1">
                        <p className="font-medium">
                          {orderSummary.customerName}
                        </p>
                        <p className="text-muted-foreground text-sm">
                          Total: {orderSummary.customerOrders} orders
                        </p>
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      size="icon"
                      className="size-9 rounded-lg"
                    >
                      <Pencil />
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Badge
                      variant="outline"
                      className="rounded-md px-3 py-1 font-normal"
                    >
                      {orderSummary.email}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="rounded-md px-3 py-1 font-normal"
                    >
                      {orderSummary.phone}
                    </Badge>
                  </div>
                </div>

                <Separator />

                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-medium">Order note</h3>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 rounded-md"
                    >
                      <Pencil />
                    </Button>
                  </div>

                  <div className="bg-muted/50 rounded-md border px-4 py-3">
                    <p className="text-muted-foreground text-sm leading-6">
                      {orderSummary.note}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col gap-4 px-1 pt-1">
              <div className="flex flex-col gap-1">
                <h3 className="font-medium">Order activity</h3>
                <p className="text-muted-foreground text-xs">
                  Fulfillment updates.
                </p>
              </div>

              <div className="flex flex-col gap-4">
                {orderActivity.map((activity, index) => (
                  <div key={activity.id} className="relative pl-6">
                    <span
                      className={cn(
                        "absolute top-1.5 left-0 size-2.5 rounded-full",
                        activity.state === "current"
                          ? "bg-primary"
                          : activity.state === "upcoming"
                            ? "bg-muted-foreground/35"
                            : "bg-foreground/75",
                      )}
                    />
                    {index < orderActivity.length - 1 ? (
                      <span className="bg-border absolute top-5 bottom-[-1rem] left-[5px] w-px" />
                    ) : null}

                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                        <p
                          className={cn(
                            "text-sm font-medium",
                            activity.state === "upcoming" &&
                              "text-muted-foreground font-normal",
                          )}
                        >
                          {activity.title}
                        </p>
                        <p
                          className={cn(
                            "text-xs",
                            activity.state === "upcoming"
                              ? "text-muted-foreground/70"
                              : "text-muted-foreground",
                          )}
                        >
                          {activity.time}
                        </p>
                      </div>
                      {activity.detail ? (
                        <p className="text-muted-foreground text-sm leading-6">
                          {activity.detail}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
