"use client";

import {
  ArrowLeft,
  ClipboardCheck,
  MapPin,
  MessageSquareMore,
  Package,
  Truck,
} from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Map,
  MapControls,
  MapMarker,
  MapPopup,
  MapRoute,
  MarkerContent,
} from "@/components/ui/map";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type ShipmentBadgeState = "progress" | "delay";
type RouteStepState = "complete" | "current" | "upcoming";
type TimelineState = "complete" | "current" | "upcoming";

type RouteStep = {
  id: string;
  label: string;
  state: RouteStepState;
  icon: React.ComponentType<{ className?: string }>;
};

type TimelineItem = {
  id: string;
  title: string;
  detail: string;
  location: string;
  time: string;
  state: TimelineState;
};

type MapStop = {
  id: string;
  label: string;
  address: string;
  time: string;
  longitude: number;
  latitude: number;
  state: "origin" | "current" | "destination";
};

const shipmentSummary = {
  shipmentId: "SHP-8801",
  orderId: "ORD-52108",
  shippingDate: "Mar 18, 2026",
  routeLabel: "Seattle to Chicago",
  origin: "Mercer Fulfillment Hub, Seattle, WA 98134",
  destination: "2149 W Fulton St, Chicago, IL 60612",
  carrier: "ParcelFlow Express",
  serviceLevel: "Priority air",
  currentHub: "Salt Lake City Hub",
  destinationHub: "Chicago Sort Hub",
  lastScan: "Today, 9:12 AM",
  totalTime: "2 days, 14 hours",
  departureTime: "18 Mar 2026, 8:24 AM",
  expectedArrival: "21 Mar 2026, 10:30 PM",
  expectedArrivalCompact: "21 Mar 2026 · 10:30 PM",
};

const shipmentBadges: Array<{
  label: string;
  state: ShipmentBadgeState;
}> = [
  { label: "In transit", state: "progress" },
  { label: "Delay", state: "delay" },
];

const routeSteps: RouteStep[] = [
  {
    id: "created",
    label: "Created",
    state: "complete",
    icon: Package,
  },
  {
    id: "confirmed",
    label: "Confirmed",
    state: "complete",
    icon: ClipboardCheck,
  },
  {
    id: "transit",
    label: "Transit",
    state: "current",
    icon: Truck,
  },
  {
    id: "delivered",
    label: "Delivered",
    state: "upcoming",
    icon: MapPin,
  },
];

const timelineItems: TimelineItem[] = [
  {
    id: "timeline-01",
    title: "Order placed",
    detail:
      "Shipment record was generated from the customer order in the online store.",
    location: "Seattle, WA",
    time: "Mar 18, 8:18 AM",
    state: "complete",
  },
  {
    id: "timeline-02",
    title: "Preparing to ship",
    detail:
      "Warehouse team packed the hero set, scanned the label, and sealed the carton.",
    location: "Mercer Fulfillment Hub",
    time: "Mar 18, 8:54 AM",
    state: "complete",
  },
  {
    id: "timeline-03",
    title: "Picked up by carrier",
    detail:
      "ParcelFlow collected the shipment and moved it onto the regional linehaul route.",
    location: "Seattle, WA",
    time: "Mar 18, 11:42 AM",
    state: "complete",
  },
  {
    id: "timeline-04",
    title: "Cross-country transfer",
    detail:
      "Shipment is currently moving through the Salt Lake hub before the final Midwest handoff.",
    location: "Salt Lake City, UT",
    time: "Today, 9:12 AM",
    state: "current",
  },
  {
    id: "timeline-05",
    title: "Out for delivery",
    detail: "Last-mile dispatch will begin once the local sort is completed.",
    location: "Chicago, IL",
    time: "Expected tomorrow",
    state: "upcoming",
  },
];

const mapStops: MapStop[] = [
  {
    id: "stop-origin",
    label: "Mercer Hub",
    address: "Seattle, WA",
    time: "18 Mar · 8:54 AM",
    longitude: -122.3321,
    latitude: 47.6062,
    state: "origin",
  },
  {
    id: "stop-current",
    label: "Salt Lake Hub",
    address: "Salt Lake City, UT",
    time: "Today · 9:12 AM",
    longitude: -111.891,
    latitude: 40.7608,
    state: "current",
  },
  {
    id: "stop-destination-hub",
    label: "Chicago Sort Hub",
    address: "Chicago, IL",
    time: "Tomorrow · 6:40 AM",
    longitude: -87.6298,
    latitude: 41.8781,
    state: "destination",
  },
];

const shipmentRouteCoordinates: [number, number][] = [
  [-122.3321, 47.6062],
  [-116.2023, 43.615],
  [-111.891, 40.7608],
  [-104.9903, 39.7392],
  [-94.5786, 39.0997],
  [-87.6298, 41.8781],
];

function ShipmentStatusBadges() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {shipmentBadges.map((badge) => (
        <Badge
          key={badge.label}
          variant="secondary"
          className={cn(
            "font-normal",
            badge.state === "progress" &&
              "bg-blue-50 text-blue-700 hover:bg-blue-50",
            badge.state === "delay" &&
              "bg-amber-50 text-amber-700 hover:bg-amber-50",
          )}
        >
          {badge.label}
        </Badge>
      ))}
    </div>
  );
}

function RouteOverviewCard() {
  const currentStepIndex = routeSteps.findIndex(
    (step) => step.state === "current",
  );

  return (
    <Card className="rounded-lg shadow-none">
      <CardHeader className="gap-0 border-b px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge
              variant="outline"
              className="rounded-md px-2.5 py-1 font-normal"
            >
              {shipmentSummary.carrier}
            </Badge>
            <Badge
              variant="secondary"
              className="rounded-md px-2.5 py-1 font-normal"
            >
              {shipmentSummary.serviceLevel}
            </Badge>
          </div>

          <div className="shrink-0 sm:text-right">
            <span className="text-muted-foreground block text-xs">ETA</span>
            <p className="text-foreground text-sm font-medium">
              <span className="hidden sm:inline">
                {shipmentSummary.expectedArrivalCompact}
              </span>
              <span className="sm:hidden">
                {shipmentSummary.expectedArrival}
              </span>
            </p>
          </div>
        </div>

        <div className="min-w-0">
          <span className="text-muted-foreground text-xs">Route</span>
          <p className="text-lg font-semibold tracking-tight sm:text-xl">
            {shipmentSummary.routeLabel}
          </p>
          <p className="text-muted-foreground text-sm leading-5 sm:truncate">
            Mercer Hub → {shipmentSummary.currentHub} →{" "}
            {shipmentSummary.destinationHub}
          </p>
        </div>
      </CardHeader>

      <CardContent className="px-4 pt-4 pb-5 sm:px-6 sm:pt-5">
        <div className="grid gap-3 sm:hidden">
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-x-2">
            {routeSteps.map((step, index) => {
              const Icon = step.icon;
              const isComplete = step.state === "complete";
              const isCurrent = step.state === "current";
              const isLast = index === routeSteps.length - 1;

              return (
                <React.Fragment key={step.id}>
                  <span
                    className={cn(
                      "flex size-9 items-center justify-center rounded-full border",
                      isComplete && "border-foreground bg-foreground",
                      isCurrent && "border-foreground bg-background",
                      step.state === "upcoming" &&
                        "border-border bg-muted/20 text-muted-foreground",
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-4",
                        isComplete && "text-background",
                        isCurrent && "text-foreground",
                        step.state === "upcoming" && "text-muted-foreground/60",
                      )}
                    />
                  </span>
                  {isLast ? null : (
                    <div className="bg-border/70 h-1 rounded-full">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          index < currentStepIndex && "bg-foreground w-full",
                          index === currentStepIndex && "bg-foreground w-2/3",
                          index > currentStepIndex && "w-0",
                        )}
                      />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>

          <div className="text-muted-foreground grid grid-cols-4 gap-2 text-center text-[11px] font-medium">
            {routeSteps.map((step) => (
              <span key={step.id}>{step.label}</span>
            ))}
          </div>
        </div>

        <div className="hidden gap-4 sm:grid sm:grid-cols-4">
          {routeSteps.map((step) => {
            const Icon = step.icon;
            const isComplete = step.state === "complete";
            const isCurrent = step.state === "current";

            return (
              <div key={step.id} className="flex flex-col gap-2.5">
                <div className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      "flex size-8 items-center justify-center rounded-full border",
                      isComplete && "border-foreground bg-foreground",
                      isCurrent && "border-foreground bg-background",
                      step.state === "upcoming" &&
                        "border-border bg-muted/20 text-muted-foreground",
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-4",
                        isComplete && "text-background",
                        isCurrent && "text-foreground",
                        step.state === "upcoming" && "text-muted-foreground/60",
                      )}
                    />
                  </span>
                  <span
                    className={cn(
                      "text-sm",
                      isCurrent || isComplete
                        ? "text-foreground font-medium"
                        : "text-muted-foreground",
                    )}
                  >
                    {step.label}
                  </span>
                </div>

                <div className="bg-border/70 h-1.5 rounded-full">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      isComplete && "bg-foreground w-full",
                      isCurrent && "bg-foreground w-2/3",
                      step.state === "upcoming" && "w-0",
                    )}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function ShipmentMetaStrip() {
  return (
    <div className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
      <div className="border-border/70 bg-background/70 rounded-xl border p-3 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0">
        <span className="text-muted-foreground">Carrier</span>
        <span className="font-medium">{shipmentSummary.carrier}</span>
      </div>
      <div className="border-border/70 bg-background/70 flex flex-col gap-1 rounded-xl border p-3 sm:rounded-none sm:border-0 sm:border-l sm:bg-transparent sm:p-0 sm:pl-6">
        <span className="text-muted-foreground">Current hub</span>
        <span className="font-medium">{shipmentSummary.currentHub}</span>
      </div>
      <div className="border-border/70 bg-background/70 flex flex-col gap-1 rounded-xl border p-3 sm:rounded-none sm:border-0 sm:border-l sm:bg-transparent sm:p-0 sm:pl-6">
        <span className="text-muted-foreground">Last scan</span>
        <span className="font-medium">{shipmentSummary.lastScan}</span>
      </div>
      <div className="border-border/70 bg-background/70 flex flex-col gap-1 rounded-xl border p-3 sm:rounded-none sm:border-0 sm:border-l sm:bg-transparent sm:p-0 sm:pl-6">
        <span className="text-muted-foreground">ETA window</span>
        <span className="font-medium">{shipmentSummary.expectedArrival}</span>
      </div>
    </div>
  );
}

function ShipmentTimeline() {
  return (
    <div className="flex flex-col gap-5 pr-0 sm:pr-1">
      {timelineItems.map((item, index) => (
        <div key={item.id} className="relative pl-6">
          <span
            className={cn(
              "absolute top-1.5 left-0 size-2.5 rounded-full",
              item.state === "current"
                ? "bg-primary"
                : item.state === "upcoming"
                  ? "bg-muted-foreground/35"
                  : "bg-foreground/75",
            )}
          />
          {index < timelineItems.length - 1 ? (
            <span className="bg-border absolute top-5 bottom-[-1rem] left-[5px] w-px" />
          ) : null}

          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <p
                className={cn(
                  "text-sm font-medium",
                  item.state === "upcoming" &&
                    "text-muted-foreground font-normal",
                )}
              >
                {item.title}
              </p>
              <p
                className={cn(
                  "text-xs",
                  item.state === "upcoming"
                    ? "text-muted-foreground/70"
                    : "text-muted-foreground",
                )}
              >
                {item.time}
              </p>
            </div>
            <p className="text-muted-foreground text-sm leading-6">
              {item.detail}
            </p>
            <div className="text-muted-foreground inline-flex items-center gap-1 text-xs">
              <MapPin className="size-3.5" />
              {item.location}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ShipmentMapPanel() {
  const currentStop =
    mapStops.find((stop) => stop.state === "current") ?? mapStops[0];

  return (
    <div className="relative h-full min-h-[300px] overflow-hidden rounded-lg border bg-[#eef2f5] sm:min-h-[360px]">
      <div className="relative h-[300px] sm:h-[360px] md:h-full">
        <Map
          center={[-107.5, 43]}
          zoom={3.4}
          theme="light"
          styles={{
            light: "https://tiles.openfreemap.org/styles/liberty",
            dark: "https://tiles.openfreemap.org/styles/liberty",
          }}
          attributionControl={false}
          className="h-full w-full"
        >
          <MapRoute
            id="shipment-route-base"
            coordinates={shipmentRouteCoordinates}
            color="#d1d5db"
            width={6}
            opacity={0.9}
            interactive={false}
          />
          <MapRoute
            id="shipment-route-main"
            coordinates={shipmentRouteCoordinates}
            color="#111827"
            width={3}
            opacity={0.85}
            dashArray={[2, 1]}
            interactive={false}
          />

          {mapStops.map((stop) => (
            <MapMarker
              key={stop.id}
              longitude={stop.longitude}
              latitude={stop.latitude}
            >
              <MarkerContent>
                <div
                  className={cn(
                    "relative flex size-4 items-center justify-center rounded-full border-2 border-white shadow-sm",
                    stop.state === "current" && "bg-foreground",
                    stop.state === "origin" && "bg-slate-400",
                    stop.state === "destination" && "bg-amber-400",
                  )}
                >
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      stop.state === "current" && "bg-white",
                      stop.state === "origin" && "bg-white/90",
                      stop.state === "destination" && "bg-white",
                    )}
                  />
                </div>
              </MarkerContent>
            </MapMarker>
          ))}

          <MapPopup
            longitude={currentStop.longitude}
            latitude={currentStop.latitude}
            offset={20}
            anchor="top"
            className="bg-card max-w-[calc(100vw-5rem)] rounded-lg border p-3 shadow-sm sm:min-w-52"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-sm font-medium">{currentStop.label}</p>
              <p className="text-muted-foreground text-xs leading-5">
                {currentStop.address}
              </p>
              <p className="text-muted-foreground text-xs">
                {currentStop.time}
              </p>
            </div>
          </MapPopup>

          <MapControls
            position="bottom-left"
            showZoom
            showCompass={false}
            showLocate={false}
            showFullscreen={false}
          />
        </Map>
      </div>
    </div>
  );
}

export function EcommerceShipmentDetail1() {
  return (
    <div className="flex flex-col">
      <div className="flex flex-col p-4 sm:p-6 md:p-8">
        <div className="flex flex-col gap-5 pb-6 md:hidden">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-foreground font-medium">Acme Store</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-foreground font-medium">Shipments</span>
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
              Shipment details
            </p>
            <h1 className="text-[1.75rem] leading-none font-semibold tracking-tight">
              {shipmentSummary.shipmentId}
            </h1>
            <ShipmentStatusBadges />
            <p className="text-muted-foreground text-sm leading-6">
              {shipmentSummary.shippingDate} · {shipmentSummary.orderId}
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <Button variant="link" className="h-auto justify-start p-0 text-sm">
              Cancel shipment
            </Button>
            <Button className="h-11 rounded-xl shadow-none">
              <MessageSquareMore className="size-4" />
              Notify customer
            </Button>
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
                {shipmentSummary.shipmentId}
              </h1>
              <ShipmentStatusBadges />
            </div>

            <p className="text-muted-foreground text-sm">
              Shipping date {shipmentSummary.shippingDate} · Order ID{" "}
              <span className="text-foreground font-medium">
                {shipmentSummary.orderId}
              </span>
            </p>
          </div>

          <div className="flex flex-col items-end gap-3">
            <div className="flex items-center gap-2">
              <Button variant="link" className="h-auto px-2 text-sm">
                Cancel shipment
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-9 rounded-lg"
              >
                <MessageSquareMore />
              </Button>
              <Button className="rounded-md shadow-none">
                Notify Customer
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-6 md:h-[calc(100svh-13rem)] md:min-h-0 md:grid-cols-2 md:items-stretch md:gap-6">
          <div className="flex flex-col gap-5 sm:gap-6 md:min-h-0">
            <RouteOverviewCard />
            <ShipmentMetaStrip />

            <div className="md:hidden">
              <ShipmentMapPanel />
            </div>

            <section className="flex flex-col gap-4 sm:gap-5 md:min-h-0 md:flex-1">
              <div className="flex flex-col gap-1">
                <h2 className="text-xl font-semibold">Activity</h2>
                <p className="text-muted-foreground text-sm">
                  Shipment updates from creation through delivery.
                </p>
              </div>

              <div className="md:hidden">
                <ShipmentTimeline />
              </div>

              <ScrollArea className="hidden md:block md:min-h-0 md:flex-1 md:pr-4">
                <ShipmentTimeline />
              </ScrollArea>
            </section>
          </div>

          <div className="hidden md:block md:h-full md:min-h-0">
            <ShipmentMapPanel />
          </div>
        </div>
      </div>
    </div>
  );
}
