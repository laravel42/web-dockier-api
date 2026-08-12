"use client";

import {
  ArrowLeft,
  CalendarDays,
  Ellipsis,
  MapPin,
  MessageSquareMore,
  Pencil,
  Search,
  Star,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import * as React from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Map } from "@/components/ui/map";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getCustomerEditHref,
  getEditableCustomerById,
} from "@/lib/ecommerce-edit-customers";
import { cn } from "@/lib/utils";

type ReviewStatus = "Published" | "Hidden";
type ReviewChannel = "Online Store" | "Subscription" | "Marketplace";

type ReviewItem = {
  id: string;
  orderId: string;
  rating: number;
  status: ReviewStatus;
  channel: ReviewChannel;
  productName: string;
  comment: string;
  postedOn: string;
  postedDateValue: number;
  images?: string[];
};

type PurchaseItem = {
  id: string;
  orderId: string;
  placedOn: string;
  total: string;
  channel: ReviewChannel;
  status: "Delivered" | "Processing" | "Cancelled";
  items: Array<{
    name: string;
    sku: string;
    image: string;
  }>;
};

type PurchaseActivityEvent = {
  id: string;
  title: string;
  detail?: string;
  time: string;
  state: "complete" | "current" | "upcoming";
};

type PurchaseActivityGroup = {
  id: string;
  orderId: string;
  placedOn: string;
  total: string;
  channel: ReviewChannel;
  status: PurchaseItem["status"];
  events: PurchaseActivityEvent[];
};

const customerProfile = {
  id: "CUS-1742",
  name: "Theo Hammond",
  status: "VIP",
  source: "Online Store",
  lastOnline: "22 Mar 2026, 11:24 AM",
  email: "theo.hammond@caldwell.app",
  phone: "+1 (206) 555-0198",
  addressName: "Theo Hammond",
  addressLine1: "7841 Mercer Street, Suite 12",
  addressLine2: "Capitol Hill, Building North",
  addressLine3: "Seattle, WA 98102",
  addressCountry: "United States",
  addressLatitude: 47.6244,
  addressLongitude: -122.3203,
  segments: ["VIP", "Skincare Routine", "High retention"],
};

const editableCustomerProfile = getEditableCustomerById(customerProfile.id);

const reviewItems: ReviewItem[] = [
  {
    id: "review-01",
    orderId: "ORD-34021",
    rating: 5,
    status: "Published",
    channel: "Online Store",
    productName: "Radiance Ritual Set",
    comment:
      "The textures feel premium and the full set actually works together. I noticed calmer skin after a week, and the packaging felt thoughtful without being overdone.",
    postedOn: "Posted on Mar 20, 2026",
    postedDateValue: 20260320,
    images: [
      "/images/block/ecommerce/skin-care-product/pexels-amelie-chen-243775000-12352170-3.jpg",
      "/images/block/ecommerce/skin-care-product/pexels-carlos-diaz-216017-18350286-3.jpg",
      "/images/block/ecommerce/skin-care-product/pexels-volkerthimm-19049367-3.jpg",
    ],
  },
  {
    id: "review-02",
    orderId: "ORD-33948",
    rating: 4,
    status: "Published",
    channel: "Subscription",
    productName: "Barrier Repair Drops",
    comment:
      "Great finish and easy to layer. I’d love a slightly larger bottle for repeat orders, but the formula itself has been consistently solid.",
    postedOn: "Posted on Mar 12, 2026",
    postedDateValue: 20260312,
  },
  {
    id: "review-03",
    orderId: "ORD-33682",
    rating: 3,
    status: "Hidden",
    channel: "Marketplace",
    productName: "Botanical Body Polish",
    comment:
      "The scent was nice and the scrub felt gentle, but the jar arrived with a loose cap. Support was quick, so I’d still reorder after that was resolved.",
    postedOn: "Posted on Feb 27, 2026",
    postedDateValue: 20260227,
  },
];

const reviewTabs = ["Purchases", "Reviews", "Activity"];

const purchaseItems: PurchaseItem[] = [
  {
    id: "purchase-01",
    orderId: "ORD-34021",
    placedOn: "Placed on Mar 18, 2026",
    total: "$389.00",
    channel: "Online Store",
    status: "Processing",
    items: [
      {
        name: "Radiance Ritual Set",
        sku: "SKU-SKIN-4006",
        image:
          "/images/block/ecommerce/skin-care-product/pexels-amelie-chen-243775000-12352170-3.jpg",
      },
      {
        name: "Barrier Repair Drops",
        sku: "SKU-TREAT-6612",
        image:
          "/images/block/ecommerce/skin-care-product/pexels-karolina-grabowska-4938448-3.jpg",
      },
    ],
  },
  {
    id: "purchase-02",
    orderId: "ORD-33682",
    placedOn: "Placed on Feb 27, 2026",
    total: "$168.00",
    channel: "Marketplace",
    status: "Delivered",
    items: [
      {
        name: "Botanical Body Polish",
        sku: "SKU-BODY-6118",
        image:
          "/images/block/ecommerce/skin-care-product/pexels-shkrabaanthony-6187540-3.jpg",
      },
    ],
  },
  {
    id: "purchase-03",
    orderId: "ORD-33340",
    placedOn: "Placed on Jan 19, 2026",
    total: "$84.00",
    channel: "Subscription",
    status: "Delivered",
    items: [
      {
        name: "Barrier Repair Drops",
        sku: "SKU-TREAT-6612",
        image:
          "/images/block/ecommerce/skin-care-product/pexels-karolina-grabowska-4938448-3.jpg",
      },
    ],
  },
];

const purchaseActivity: PurchaseActivityGroup[] = [
  {
    id: "activity-purchase-01",
    orderId: "ORD-34021",
    placedOn: "Placed on Mar 18, 2026",
    total: "$389.00",
    channel: "Online Store",
    status: "Processing",
    events: [
      {
        id: "activity-purchase-01-order",
        title: "Order placed",
        detail:
          "Customer checked out with two hero items from the spring drop.",
        time: "Mar 18, 8:24 AM",
        state: "complete",
      },
      {
        id: "activity-purchase-01-payment",
        title: "Payment captured",
        detail: "Visa ending in 0198 was approved for the full order amount.",
        time: "Mar 18, 8:26 AM",
        state: "complete",
      },
      {
        id: "activity-purchase-01-packing",
        title: "Packing in progress",
        detail:
          "Warehouse team is assembling the bundle and gift sleeve before handoff.",
        time: "Today, 10:18 AM",
        state: "current",
      },
      {
        id: "activity-purchase-01-review",
        title: "Review request scheduled",
        time: "After delivery",
        state: "upcoming",
      },
    ],
  },
  {
    id: "activity-purchase-02",
    orderId: "ORD-33682",
    placedOn: "Placed on Feb 27, 2026",
    total: "$168.00",
    channel: "Marketplace",
    status: "Delivered",
    events: [
      {
        id: "activity-purchase-02-order",
        title: "Order placed",
        detail:
          "Customer purchased Botanical Body Polish through the marketplace channel.",
        time: "Feb 27, 2:11 PM",
        state: "complete",
      },
      {
        id: "activity-purchase-02-fulfillment",
        title: "Delivered",
        detail:
          "Shipment arrived in Seattle and delivery was confirmed at the door.",
        time: "Mar 2, 4:46 PM",
        state: "complete",
      },
      {
        id: "activity-purchase-02-review",
        title: "Review submitted",
        detail:
          "Customer left a 4-star review mentioning texture and fragrance balance.",
        time: "Mar 5, 9:32 AM",
        state: "complete",
      },
      {
        id: "activity-purchase-02-followup",
        title: "Follow-up sent",
        detail:
          "Post-purchase message about pairing the polish with body oil was delivered.",
        time: "Mar 6, 11:08 AM",
        state: "current",
      },
    ],
  },
  {
    id: "activity-purchase-03",
    orderId: "ORD-33340",
    placedOn: "Placed on Jan 19, 2026",
    total: "$84.00",
    channel: "Subscription",
    status: "Delivered",
    events: [
      {
        id: "activity-purchase-03-renewal",
        title: "Subscription renewed",
        detail:
          "Monthly replenishment triggered automatically for Barrier Repair Drops.",
        time: "Jan 19, 6:00 AM",
        state: "complete",
      },
      {
        id: "activity-purchase-03-delivery",
        title: "Delivered",
        detail:
          "Shipment completed on time with no carrier exceptions reported.",
        time: "Jan 22, 3:14 PM",
        state: "complete",
      },
      {
        id: "activity-purchase-03-review",
        title: "Review published",
        detail:
          "Customer review was published after moderation and now appears on the PDP.",
        time: "Jan 26, 8:51 AM",
        state: "complete",
      },
      {
        id: "activity-purchase-03-next",
        title: "Next renewal queued",
        time: "Expected in 4 days",
        state: "upcoming",
      },
    ],
  },
];

const addressMapCenter: [number, number] = [
  customerProfile.addressLongitude,
  customerProfile.addressLatitude,
];

const reviewRatingCounts = {
  5: 64,
  4: 28,
  3: 15,
  2: 9,
  1: 4,
};

const totalReviews = Object.values(reviewRatingCounts).reduce(
  (sum, value) => sum + value,
  0,
);

const averageRating =
  Object.entries(reviewRatingCounts).reduce(
    (sum, [rating, count]) => sum + Number(rating) * count,
    0,
  ) / totalReviews;

function CustomerStatusBadge() {
  return (
    <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
      Active
    </Badge>
  );
}

function RatingStars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          className={cn(
            "size-3.5",
            index < rating
              ? "fill-amber-400 text-amber-400"
              : "fill-muted text-muted",
          )}
        />
      ))}
    </div>
  );
}

function ShippingAddressMap() {
  return (
    <div className="relative overflow-hidden rounded-md border">
      <div className="h-36 w-full">
        <Map
          center={addressMapCenter}
          zoom={15.2}
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
          <span className="bg-primary/15 absolute size-10 rounded-full" />
          <div className="bg-primary text-primary-foreground relative flex size-8 items-center justify-center rounded-full border-2 border-white shadow-sm">
            <MapPin className="size-4" />
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute top-3 left-3">
        <div className="bg-background/95 rounded-sm border px-2.5 py-1 text-xs font-medium shadow-sm">
          Seattle, WA
        </div>
      </div>
    </div>
  );
}

function ReviewBreakdown() {
  return (
    <div className="grid gap-6 rounded-lg border p-5 lg:grid-cols-[180px_minmax(0,1fr)]">
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-sm">Rating</span>
        <div className="flex items-end gap-3">
          <span className="text-5xl font-semibold">
            {averageRating.toFixed(1)}
          </span>
          <div className="pb-1">
            <RatingStars rating={5} />
            <p className="text-muted-foreground mt-1 text-sm">
              {totalReviews} reviews
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {[5, 4, 3, 2, 1].map((rating) => {
          const count =
            reviewRatingCounts[rating as keyof typeof reviewRatingCounts];
          const width = `${(count / totalReviews) * 100}%`;

          return (
            <div
              key={rating}
              className="grid grid-cols-[72px_minmax(0,1fr)_44px] items-center gap-3 text-sm"
            >
              <span className="text-muted-foreground">{rating} star</span>
              <div className="bg-muted h-2 rounded-full">
                <div
                  className="bg-foreground h-2 rounded-full"
                  style={{ width }}
                />
              </div>
              <span className="text-muted-foreground text-right">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReviewCard({ review }: { review: ReviewItem }) {
  return (
    <article className="flex flex-col gap-4 border-b pb-6 last:border-b-0 last:pb-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{review.orderId}</span>
            <RatingStars rating={review.rating} />
          </div>
          <p className="text-muted-foreground text-sm">
            Item:{" "}
            <span className="text-foreground font-medium">
              {review.productName}
            </span>
          </p>
        </div>

        <Badge
          variant="secondary"
          className={cn(
            "font-normal",
            review.status === "Published" &&
              "bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
            review.status === "Hidden" &&
              "bg-slate-100 text-slate-700 hover:bg-slate-100",
          )}
        >
          {review.status}
        </Badge>
      </div>

      <p className="text-sm leading-7">{review.comment}</p>

      {review.images?.length ? (
        <div className="flex flex-wrap gap-3">
          {review.images.map((image, index) => (
            <div
              key={`${review.id}-${image}`}
              className="bg-muted relative size-16 overflow-hidden rounded-md"
            >
              <Image
                src={image}
                alt={`${review.productName} preview ${index + 1}`}
                fill
                sizes="64px"
                className="object-cover"
              />
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-sm">
          <span>{review.postedOn}</span>
          <span className="hidden sm:inline">•</span>
          <span>{review.channel}</span>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="rounded-md">
            Reply
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 rounded-full"
              >
                <Ellipsis className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>View order</DropdownMenuItem>
              <DropdownMenuItem>Contact customer</DropdownMenuItem>
              <DropdownMenuItem>Archive review</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </article>
  );
}

function PurchaseCard({ purchase }: { purchase: PurchaseItem }) {
  return (
    <article className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold">{purchase.orderId}</span>
            <Badge
              variant="secondary"
              className={cn(
                "font-normal",
                purchase.status === "Delivered" &&
                  "bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
                purchase.status === "Processing" &&
                  "bg-amber-50 text-amber-700 hover:bg-amber-50",
                purchase.status === "Cancelled" &&
                  "bg-slate-100 text-slate-700 hover:bg-slate-100",
              )}
            >
              {purchase.status}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            {purchase.placedOn} • {purchase.channel}
          </p>
        </div>

        <div className="text-left sm:text-right">
          <p className="text-muted-foreground text-xs tracking-[0.16em] uppercase">
            Order total
          </p>
          <p className="text-lg font-semibold">{purchase.total}</p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-4">
        {purchase.items.map((item) => (
          <div
            key={`${purchase.id}-${item.sku}`}
            className="flex items-center gap-3"
          >
            <div className="bg-muted relative size-12 overflow-hidden rounded-md">
              <Image
                src={item.image}
                alt={item.name}
                fill
                sizes="48px"
                className="object-cover"
              />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{item.name}</p>
              <p className="text-muted-foreground text-xs">{item.sku}</p>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function ActivityTimeline({ events }: { events: PurchaseActivityEvent[] }) {
  return (
    <div className="flex flex-col gap-5">
      {events.map((activity, index) => (
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
          {index < events.length - 1 ? (
            <span className="bg-border absolute top-5 bottom-[-1.25rem] left-[5px] w-px" />
          ) : null}

          <div className="flex min-w-0 flex-col gap-1">
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
              <p className="text-muted-foreground text-xs">{activity.time}</p>
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
  );
}

export function EcommerceCustomerDetail1() {
  const [search, setSearch] = React.useState("");
  const [channel, setChannel] = React.useState("all");
  const [duration, setDuration] = React.useState("90d");

  const filteredReviews = React.useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return reviewItems.filter((review) => {
      const matchesChannel = channel === "all" || review.channel === channel;
      const matchesSearch =
        normalizedSearch.length === 0 ||
        [review.orderId, review.productName, review.comment, review.channel]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);

      const matchesDuration =
        duration === "all" ||
        (duration === "90d" && review.postedDateValue >= 20260101) ||
        (duration === "30d" && review.postedDateValue >= 20260301);

      return matchesChannel && matchesSearch && matchesDuration;
    });
  }, [channel, duration, search]);

  return (
    <div className="flex flex-col">
      <div className="flex flex-col p-6 md:p-8">
        <div className="flex flex-col gap-5 pb-6 md:hidden">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-foreground font-medium">Acme Store</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-foreground font-medium">Customers</span>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="size-9 rounded-md border shadow-none"
          >
            <ArrowLeft />
          </Button>

          <div className="flex items-start gap-3">
            <Avatar className="size-14">
              <AvatarImage
                src="/avatars/avatar-5.png"
                alt={customerProfile.name}
              />
              <AvatarFallback>TH</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                {customerProfile.name}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                <CustomerStatusBadge />
                <span className="text-muted-foreground text-sm">
                  {customerProfile.id}
                </span>
              </div>
            </div>
          </div>

          <Button className="h-11 rounded-xl shadow-none">
            <MessageSquareMore />
            Send message
          </Button>
        </div>

        <div className="hidden items-start justify-between gap-6 pb-8 md:flex">
          <div className="flex min-w-0 items-start gap-4">
            <Button
              variant="outline"
              size="icon"
              className="size-10 rounded-full"
            >
              <ArrowLeft />
            </Button>
            <Avatar className="size-16">
              <AvatarImage
                src="/avatars/avatar-5.png"
                alt={customerProfile.name}
              />
              <AvatarFallback>TH</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col gap-3">
              <h1 className="text-4xl font-medium tracking-tight">
                {customerProfile.name}
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <CustomerStatusBadge />
                <span className="text-muted-foreground">•</span>
                <span className="text-muted-foreground">
                  Customer ID {customerProfile.id}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-3">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="size-9 rounded-lg">
                <Ellipsis />
              </Button>
              <Button variant="outline" className="rounded-lg">
                <MessageSquareMore />
                Send Message
              </Button>
            </div>
          </div>
        </div>

        <Tabs defaultValue="purchases" className="pb-2">
          <div className="overflow-x-auto border-b">
            <TabsList className="h-auto justify-start gap-5 bg-transparent p-0">
              {reviewTabs.map((tab) => (
                <TabsTrigger
                  key={tab}
                  value={tab.toLowerCase().replace(/\s+/g, "-")}
                  className="data-[state=active]:border-foreground rounded-none border-b-2 border-transparent px-0 pt-0 pb-3 text-sm data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  {tab}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="grid gap-8 pt-6 xl:grid-cols-[minmax(0,1fr)_1px_340px] xl:gap-8">
            <div className="flex flex-col gap-6">
              <TabsContent value="reviews" className="mt-0 flex flex-col gap-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center">
                    <div className="relative">
                      <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                      <Input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search reviews"
                        className="h-11 w-full rounded-xl pl-9 md:w-[220px] md:rounded-lg"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3 md:flex">
                      <Select value={duration} onValueChange={setDuration}>
                        <SelectTrigger className="h-11 rounded-xl md:w-[150px] md:rounded-lg">
                          <div className="flex items-center gap-2">
                            <CalendarDays className="size-4" />
                            <SelectValue />
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="30d">Last 30 days</SelectItem>
                          <SelectItem value="90d">Last 90 days</SelectItem>
                          <SelectItem value="all">All time</SelectItem>
                        </SelectContent>
                      </Select>

                      <Select value={channel} onValueChange={setChannel}>
                        <SelectTrigger className="h-11 rounded-xl md:w-[160px] md:rounded-lg">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All channels</SelectItem>
                          <SelectItem value="Online Store">
                            Online Store
                          </SelectItem>
                          <SelectItem value="Subscription">
                            Subscription
                          </SelectItem>
                          <SelectItem value="Marketplace">
                            Marketplace
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <ReviewBreakdown />

                <section className="flex flex-col gap-6">
                  {filteredReviews.map((review) => (
                    <ReviewCard key={review.id} review={review} />
                  ))}
                </section>
              </TabsContent>

              <TabsContent
                value="purchases"
                className="mt-0 flex flex-col gap-5"
              >
                {purchaseItems.map((purchase, index) => (
                  <div key={purchase.id} className="flex flex-col gap-5">
                    <PurchaseCard purchase={purchase} />
                    {index < purchaseItems.length - 1 ? <Separator /> : null}
                  </div>
                ))}
              </TabsContent>

              <TabsContent
                value="activity"
                className="mt-0 flex flex-col gap-6"
              >
                <div className="flex flex-col gap-1">
                  <h2 className="text-lg font-semibold">Customer activity</h2>
                  <p className="text-muted-foreground text-sm">
                    Order-by-order activity from purchase through review.
                  </p>
                </div>
                <section className="flex flex-col gap-6">
                  {purchaseActivity.map((activityGroup, index) => (
                    <div key={activityGroup.id} className="flex flex-col gap-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                        <div className="flex min-w-0 flex-col gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-semibold">
                              {activityGroup.orderId}
                            </h3>
                            <Badge
                              variant="secondary"
                              className="rounded-md px-2.5 py-0.5 font-medium"
                            >
                              {activityGroup.status}
                            </Badge>
                          </div>
                          <p className="text-muted-foreground text-sm">
                            {activityGroup.placedOn} • {activityGroup.channel}
                          </p>
                        </div>
                        <div className="text-left sm:text-right">
                          <p className="text-muted-foreground text-xs tracking-[0.24em] uppercase">
                            Order total
                          </p>
                          <p className="text-base font-semibold">
                            {activityGroup.total}
                          </p>
                        </div>
                      </div>

                      <ActivityTimeline events={activityGroup.events} />

                      {index < purchaseActivity.length - 1 ? (
                        <Separator />
                      ) : null}
                    </div>
                  ))}
                </section>
              </TabsContent>
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
                      <h3 className="font-medium">Customer details</h3>
                    </div>

                    <div className="grid gap-4 text-sm">
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-muted-foreground">
                          Customer source
                        </span>
                        <span className="font-medium">
                          {customerProfile.source}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-muted-foreground">
                          Last online
                        </span>
                        <span className="font-medium">
                          {customerProfile.lastOnline}
                        </span>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="flex flex-col gap-5">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-medium">Shipping address</h3>
                      {editableCustomerProfile ? (
                        <Button
                          asChild
                          variant="ghost"
                          size="icon"
                          className="size-8 rounded-md"
                        >
                          <Link href={getCustomerEditHref(customerProfile.id)}>
                            <Pencil />
                          </Link>
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 rounded-md"
                        >
                          <Pencil />
                        </Button>
                      )}
                    </div>

                    <ShippingAddressMap />

                    <div className="flex flex-col gap-3 px-1">
                      <div className="flex flex-col gap-1">
                        <p className="font-medium">
                          {customerProfile.addressName}
                        </p>
                        <p className="text-muted-foreground text-sm leading-6">
                          {customerProfile.addressLine1}
                          <br />
                          {customerProfile.addressLine2}
                          <br />
                          {customerProfile.addressLine3},{" "}
                          {customerProfile.addressCountry}
                        </p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="flex flex-col gap-5">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-medium">Contact information</h3>
                      {editableCustomerProfile ? (
                        <Button
                          asChild
                          variant="ghost"
                          size="icon"
                          className="size-8 rounded-md"
                        >
                          <Link href={getCustomerEditHref(customerProfile.id)}>
                            <Pencil />
                          </Link>
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 rounded-md"
                        >
                          <Pencil />
                        </Button>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Badge
                        variant="outline"
                        className="rounded-md px-3 py-1 font-normal"
                      >
                        {customerProfile.email}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="rounded-md px-3 py-1 font-normal"
                      >
                        {customerProfile.phone}
                      </Badge>
                    </div>
                  </div>

                  <Separator />

                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-medium">Segments</h3>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {customerProfile.segments.map((segment) => (
                        <Badge
                          key={segment}
                          variant="secondary"
                          className="font-normal"
                        >
                          {segment}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
