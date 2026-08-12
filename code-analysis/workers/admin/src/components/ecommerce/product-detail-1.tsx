"use client";

import {
  CalendarDays,
  Ellipsis,
  Layers3,
  NotebookText,
  Package2,
  Pencil,
  Search,
  SquarePen,
  Star,
  Store,
  Truck,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import * as React from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getEditableProductBySlug,
  getProductEditHref,
} from "@/lib/ecommerce-edit-products";
import { cn } from "@/lib/utils";

const detailTabs = [
  { label: "General Information", value: "general-information" },
  { label: "History", value: "history" },
  { label: "Reviews", value: "reviews" },
] as const;

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

const stockLocations = [
  { name: "Seattle", code: "SEA", quantity: 148, tone: "default" },
  { name: "Austin", code: "AUS", quantity: 76, tone: "default" },
  { name: "Chicago", code: "CHI", quantity: 54, tone: "default" },
  { name: "Miami", code: "MIA", quantity: 21, tone: "low" },
];

const reorderPoints = [
  {
    warehouse: "Seattle",
    code: "SEA",
    method: "Purchase order",
    vendor: "Acme Retail",
    reorderPoint: 40,
    reorderQuantity: 120,
  },
  {
    warehouse: "Austin",
    code: "AUS",
    method: "Transfer request",
    vendor: "Central warehouse",
    reorderPoint: 24,
    reorderQuantity: 80,
  },
];

const productNotes = [
  {
    title: "Merchandising note",
    body: "Feature this product in barrier-repair bundles and recovery landing pages through the end of April.",
  },
  {
    title: "Ops note",
    body: "Austin inventory is healthy, but Miami is trending toward the reorder threshold after a strong marketplace week.",
  },
] as const;

const productReviewItems: ReviewItem[] = [
  {
    id: "review-01",
    orderId: "ORD-34021",
    rating: 5,
    status: "Published",
    channel: "Online Store",
    productName: "Radiance Ritual Set",
    comment:
      "The textures feel premium and the bundle actually performs like a finished routine. The serum and cream pairing is what sold me on ordering again.",
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
    productName: "Radiance Ritual Set",
    comment:
      "Great as a replenishment bundle. I would love a travel pouch included, but the formulas themselves have been very consistent.",
    postedOn: "Posted on Mar 12, 2026",
    postedDateValue: 20260312,
  },
  {
    id: "review-03",
    orderId: "ORD-33682",
    rating: 3,
    status: "Hidden",
    channel: "Marketplace",
    productName: "Radiance Ritual Set",
    comment:
      "Delivery was delayed and one carton edge was bent on arrival. The products were intact, but support hid the review while the marketplace ticket is being resolved.",
    postedOn: "Posted on Feb 27, 2026",
    postedDateValue: 20260227,
  },
  {
    id: "review-04",
    orderId: "ORD-33410",
    rating: 5,
    status: "Published",
    channel: "Online Store",
    productName: "Radiance Ritual Set",
    comment:
      "This is one of the few kits where every product feels intentionally chosen. The cleanser and moisturizer alone make it worth keeping in the lineup.",
    postedOn: "Posted on Feb 14, 2026",
    postedDateValue: 20260214,
    images: [
      "/images/block/ecommerce/skin-care-product/pexels-karolina-grabowska-4938448-3.jpg",
      "/images/block/ecommerce/skin-care-product/kadarius-seegars-Mxy5gokl8mE-unsplash-3.jpg",
    ],
  },
  {
    id: "review-05",
    orderId: "ORD-33192",
    rating: 4,
    status: "Published",
    channel: "Marketplace",
    productName: "Radiance Ritual Set",
    comment:
      "Solid value for gifting and the presentation photographs well. The outer carton could be sturdier, but the product experience was strong.",
    postedOn: "Posted on Jan 29, 2026",
    postedDateValue: 20260129,
  },
  {
    id: "review-06",
    orderId: "ORD-32951",
    rating: 5,
    status: "Published",
    channel: "Subscription",
    productName: "Radiance Ritual Set",
    comment:
      "I reordered after the first month because the routine was easy to stick with. Skin felt calmer and more consistent, especially overnight.",
    postedOn: "Posted on Jan 16, 2026",
    postedDateValue: 20260116,
  },
  {
    id: "review-07",
    orderId: "ORD-32680",
    rating: 4,
    status: "Hidden",
    channel: "Online Store",
    productName: "Radiance Ritual Set",
    comment:
      "The formulas worked well, but the customer accidentally reviewed the old holiday packaging. The post is hidden until support finishes the asset correction.",
    postedOn: "Posted on Dec 28, 2025",
    postedDateValue: 20251228,
  },
];

function formatLabel(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatCurrency(value: string) {
  return `$${Number(value || "0").toFixed(2)}`;
}

function ProductInfoGrid({
  title,
  items,
  columns = 2,
}: {
  title: string;
  items: Array<{ label: string; value: React.ReactNode }>;
  columns?: 1 | 2;
}) {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      </div>
      <dl
        className={cn(
          "grid gap-x-8 gap-y-5",
          columns === 2 ? "md:grid-cols-2" : "grid-cols-1",
        )}
      >
        {items.map((item) => (
          <div key={String(item.label)} className="flex flex-col gap-1.5">
            <dt className="text-muted-foreground text-xs font-semibold tracking-[0.16em] uppercase">
              {item.label}
            </dt>
            <dd className="text-sm leading-6 font-medium">{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
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

function ReviewBreakdown({
  averageRating,
  reviewRatingCounts,
  totalReviews,
}: {
  averageRating: number;
  reviewRatingCounts: Record<1 | 2 | 3 | 4 | 5, number>;
  totalReviews: number;
}) {
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
          const width = `${totalReviews === 0 ? 0 : (count / totalReviews) * 100}%`;

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

export function EcommerceProductDetail1({
  productSlug,
}: {
  productSlug?: string;
}) {
  const product =
    getEditableProductBySlug(productSlug ?? "radiance-ritual-set") ??
    getEditableProductBySlug("radiance-ritual-set") ??
    getEditableProductBySlug("barrier-repair-drops");
  const initialImage = product?.assets.gallery[0] ?? "";
  const [activeImage, setActiveImage] = React.useState(initialImage);
  const [isActive, setIsActive] = React.useState(
    product?.values.status === "active",
  );
  const [reviewSearch, setReviewSearch] = React.useState("");
  const [reviewChannel, setReviewChannel] = React.useState("all");
  const [reviewDuration, setReviewDuration] = React.useState("90d");
  const filteredReviews = React.useMemo(() => {
    const normalizedSearch = reviewSearch.trim().toLowerCase();

    return productReviewItems.filter((review) => {
      const matchesChannel =
        reviewChannel === "all" || review.channel === reviewChannel;
      const matchesSearch =
        normalizedSearch.length === 0 ||
        [review.orderId, review.productName, review.comment, review.channel]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);

      const matchesDuration =
        reviewDuration === "all" ||
        (reviewDuration === "90d" && review.postedDateValue >= 20260101) ||
        (reviewDuration === "30d" && review.postedDateValue >= 20260301);

      return matchesChannel && matchesSearch && matchesDuration;
    });
  }, [reviewChannel, reviewDuration, reviewSearch]);

  if (!product) {
    return null;
  }

  const totalStock = product.values.variants.reduce(
    (sum, variant) => sum + Number(variant.quantity || 0),
    0,
  );
  const retailPrice = formatCurrency(product.values.basePrice);
  const launchPrice = product.values.discountedPrice
    ? formatCurrency(product.values.discountedPrice)
    : retailPrice;

  const basicInformation = [
    { label: "SKU", value: product.values.sku },
    { label: "Barcode", value: product.values.barcode || "Not added" },
    { label: "Category", value: formatLabel(product.values.category) },
    { label: "Subcategory", value: formatLabel(product.values.subcategory) },
    {
      label: "Created by",
      value: (
        <div className="flex items-center gap-2">
          <Avatar className="size-6 border">
            <AvatarFallback>AR</AvatarFallback>
          </Avatar>
          <span>Acme Retail</span>
        </div>
      ),
    },
    {
      label: "Description",
      value: product.values.description || "No description available.",
    },
  ];

  const measurementInformation = [
    { label: "Width", value: "18 cm" },
    { label: "Height", value: "22 cm" },
    { label: "Weight", value: "480 g" },
    { label: "Unit", value: product.values.variants[0]?.value ?? "Each" },
  ];

  const purchaseInformation = [
    { label: "Vendor", value: product.values.vendor || "Acme Retail" },
    { label: "Purchase cost", value: formatCurrency("42.00") },
    { label: "Currency", value: product.values.currency },
    {
      label: "Charge tax",
      value: product.values.chargeTax ? "Enabled" : "Disabled",
    },
  ];

  const salesInformation = [
    { label: "Retail price", value: retailPrice },
    { label: "Launch price", value: launchPrice },
    { label: "Wholesale price", value: formatCurrency("64.00") },
    { label: "Margin", value: "34%" },
  ];
  const reviewRatingCounts = {
    5: productReviewItems.filter((review) => review.rating === 5).length,
    4: productReviewItems.filter((review) => review.rating === 4).length,
    3: productReviewItems.filter((review) => review.rating === 3).length,
    2: productReviewItems.filter((review) => review.rating === 2).length,
    1: productReviewItems.filter((review) => review.rating === 1).length,
  } as const;
  const totalReviews = Object.values(reviewRatingCounts).reduce(
    (sum, value) => sum + value,
    0,
  );
  const averageRating =
    totalReviews === 0
      ? 0
      : Object.entries(reviewRatingCounts).reduce(
          (sum, [rating, count]) => sum + Number(rating) * count,
          0,
        ) / totalReviews;
  const historyItems = [
    {
      id: "history-stock",
      title: `Adjusted product stock to ${totalStock}`,
      detail:
        "Inventory was aligned after the latest warehouse cycle count and bundle reservation audit.",
      time: "Wed, 24 Mar 2026 · 4:22 PM",
      actor: {
        name: "Johnson Corn",
        avatar: "/avatars/avatar-2.png",
        initials: "JC",
      },
    },
    {
      id: "history-gallery",
      title: "Added new 4 pictures",
      detail:
        "Updated the gallery set to support the spring product refresh across listings and detail views.",
      time: "Tue, 23 Mar 2026 · 9:21 AM",
      actor: {
        name: "Emily John Stones",
        avatar: "/avatars/avatar-4.png",
        initials: "ES",
      },
      gallery: product.assets.gallery.slice(0, 4),
    },
    {
      id: "history-name",
      title: `Changed product name to ${product.values.name}`,
      detail:
        "Naming was standardized to match the launch merchandising sheet and paid-campaign copy.",
      time: "Tue, 23 Mar 2026 · 6:34 AM",
      actor: {
        name: "Magnus Carlsen",
        avatar: "/avatars/avatar-3.png",
        initials: "MC",
      },
    },
    {
      id: "history-reorder",
      title: `Reordered ${reorderPoints[0]?.reorderQuantity ?? 0} units from ${
        product.values.vendor || "Acme Retail"
      }`,
      detail:
        "A replenishment order was opened to protect the Seattle and Austin warehouses ahead of the next campaign wave.",
      time: "Fri, 12 Mar 2026 · 5:34 PM",
      actor: {
        name: "Julia Warren",
        avatar: "/avatars/avatar-6.png",
        initials: "JW",
      },
    },
    {
      id: "history-pricing",
      title: `Updated launch price to ${launchPrice}`,
      detail:
        "Seasonal launch pricing was revised after the merchandising team approved the spring conversion test.",
      time: "Thu, 11 Mar 2026 · 11:12 AM",
      actor: {
        name: "Nadia Flores",
        avatar: "/avatars/avatar-1.png",
        initials: "NF",
      },
    },
    {
      id: "history-copy",
      title: "Refined product description and category copy",
      detail:
        "SEO and lifecycle teams aligned the PDP copy to focus more clearly on the full-routine bundle story.",
      time: "Mon, 8 Mar 2026 · 2:46 PM",
      actor: {
        name: "Avery Wilson",
        avatar: "/avatars/avatar-5.png",
        initials: "AW",
      },
    },
    {
      id: "history-variant",
      title: "Added Travel trio as a purchasable variant",
      detail:
        "A smaller-format bundle was introduced for sampling campaigns and retail partner placements.",
      time: "Wed, 3 Mar 2026 · 9:05 AM",
      actor: {
        name: "Ethan Brooks",
        avatar: "/avatars/avatar-black-2.png",
        initials: "EB",
      },
    },
  ] as const;

  return (
    <div className="flex flex-col">
      <div className="flex flex-col p-6 md:p-8">
        <div className="flex flex-col gap-5 pb-8 md:hidden">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-foreground font-medium">Acme Store</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-foreground font-medium">Products</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-muted-foreground">Product detail</span>
          </div>

          <div className="flex justify-end">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Active</span>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">
              {product.values.name}
            </h1>
            <p className="text-muted-foreground text-sm">
              {product.values.sku} • {formatLabel(product.values.category)} •
              Stocked product
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" className="rounded-lg" asChild>
              <Link href={getProductEditHref(product.values.name)}>
                <SquarePen />
                Edit
              </Link>
            </Button>
            <Button variant="outline" className="rounded-lg">
              <Layers3 />
              Clone
            </Button>
          </div>
        </div>

        <div className="hidden flex-col gap-6 pb-8 md:flex">
          <div className="flex items-start justify-between gap-8">
            <div className="flex min-w-0 flex-col gap-3 pt-1">
              <h1 className="text-4xl font-medium tracking-tight">
                {product.values.name}
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
                  {product.values.sku}
                </span>
                <span className="text-muted-foreground">•</span>
                <span className="text-muted-foreground">
                  {formatLabel(product.values.category)}
                </span>
                <span className="text-muted-foreground">•</span>
                <span className="text-muted-foreground">Stocked product</span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <div className="flex items-center gap-3 rounded-full border px-3 py-2">
                <Switch checked={isActive} onCheckedChange={setIsActive} />
                <span className="text-sm font-medium">Active</span>
              </div>

              <Separator orientation="vertical" className="h-8" />

              <Button variant="outline" className="rounded-lg" asChild>
                <Link href={getProductEditHref(product.values.name)}>
                  <Pencil />
                  Edit
                </Link>
              </Button>
              <Button variant="outline" className="rounded-lg">
                <Layers3 />
                Clone
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-10 rounded-lg"
                  >
                    <Ellipsis />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem>Archive</DropdownMenuItem>
                  <DropdownMenuItem>Share details</DropdownMenuItem>
                  <DropdownMenuItem>Duplicate SKU</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        <Tabs defaultValue="general-information" className="pb-2">
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

          <div className="grid gap-8 pt-6 xl:grid-cols-[minmax(0,1fr)_1px_340px] xl:gap-8">
            <div className="flex flex-col gap-6">
              <TabsContent
                value="general-information"
                className="mt-0 flex flex-col gap-8"
              >
                <section className="flex flex-col gap-4">
                  <div className="bg-muted/30 relative h-[280px] overflow-hidden rounded-2xl border sm:h-[340px] xl:h-[400px]">
                    <Image
                      src={activeImage}
                      alt={product.values.name}
                      fill
                      sizes="(min-width: 1280px) 920px, (min-width: 768px) 66vw, 100vw"
                      className="object-cover"
                    />
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {product.assets.gallery.map((image, index) => (
                      <button
                        key={image}
                        type="button"
                        onClick={() => setActiveImage(image)}
                        className={cn(
                          "bg-muted/30 relative size-22 overflow-hidden rounded-xl border transition-all outline-none focus-visible:outline-none",
                          activeImage === image
                            ? "border-foreground ring-foreground/10 ring-2"
                            : "border-border/70 opacity-80 hover:opacity-100",
                        )}
                      >
                        <Image
                          src={image}
                          alt={`${product.values.name} gallery view`}
                          fill
                          sizes="80px"
                          className="object-cover"
                        />
                        {index === 0 ? (
                          <div className="bg-background/90 absolute inset-x-1 bottom-1 rounded-sm px-1.5 py-1 text-[10px] font-medium">
                            Thumbnail
                          </div>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </section>

                <ProductInfoGrid
                  title="Basic information"
                  items={basicInformation}
                />
                <Separator />
                <ProductInfoGrid
                  title="Measurement"
                  items={measurementInformation}
                />
                <Separator />
                <ProductInfoGrid
                  title="Purchase information"
                  items={purchaseInformation}
                />
                <Separator />
                <ProductInfoGrid
                  title="Sales information"
                  items={salesInformation}
                />
                <Separator />
                <section className="flex flex-col gap-5">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold tracking-tight">
                      Notes
                    </h2>
                  </div>
                  <div className="flex flex-col gap-5">
                    {productNotes.map((note) => (
                      <Card key={note.title} className="rounded-lg shadow-none">
                        <CardHeader className="gap-2">
                          <CardTitle className="text-base">
                            {note.title}
                          </CardTitle>
                          <CardDescription>{note.body}</CardDescription>
                        </CardHeader>
                      </Card>
                    ))}
                  </div>
                </section>
              </TabsContent>

              <TabsContent value="history" className="mt-0 flex flex-col gap-6">
                <div className="flex flex-col gap-1">
                  <h2 className="text-xl font-semibold tracking-tight">
                    Product history
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    A running log of inventory, merchandising, and catalog
                    edits.
                  </p>
                </div>

                <div className="relative flex flex-col">
                  {historyItems.map((item, index) => (
                    <div key={item.id} className="relative pl-11">
                      {index < historyItems.length - 1 ? (
                        <div className="border-border/60 absolute top-8 bottom-0 left-[0.85rem] border-l border-dashed" />
                      ) : null}

                      <div className="bg-background absolute top-0 left-0 flex size-7 items-center justify-center rounded-full border">
                        <div className="bg-muted-foreground/55 size-2.5 rounded-full" />
                      </div>

                      <div className="flex flex-col gap-4 pb-8 last:pb-0">
                        <div className="text-muted-foreground bg-muted/40 w-fit rounded-full border px-3 py-1 text-xs font-medium">
                          {item.time}
                        </div>

                        <div className="flex flex-col gap-3">
                          <h3 className="text-lg font-semibold tracking-tight">
                            {item.title}
                          </h3>
                          <p className="text-muted-foreground text-sm leading-6">
                            {item.detail}
                          </p>

                          {"gallery" in item ? (
                            <div className="flex flex-wrap gap-2 pt-1">
                              {item.gallery.map((image) => (
                                <div
                                  key={image}
                                  className="bg-muted/40 relative size-14 overflow-hidden rounded-lg border"
                                >
                                  <Image
                                    src={image}
                                    alt={`${product.values.name} history asset`}
                                    fill
                                    sizes="56px"
                                    className="object-cover"
                                  />
                                </div>
                              ))}
                            </div>
                          ) : null}

                          <div className="flex items-center gap-2 pt-1">
                            <Avatar className="size-7 border">
                              <AvatarImage
                                src={item.actor.avatar}
                                alt={item.actor.name}
                              />
                              <AvatarFallback>
                                {item.actor.initials}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-muted-foreground text-sm font-medium">
                              {item.actor.name}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="reviews" className="mt-0 flex flex-col gap-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center">
                    <div className="relative">
                      <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                      <Input
                        value={reviewSearch}
                        onChange={(event) =>
                          setReviewSearch(event.target.value)
                        }
                        placeholder="Search reviews"
                        className="h-11 w-full rounded-xl pl-9 md:w-[220px] md:rounded-lg"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3 md:flex">
                      <Select
                        value={reviewDuration}
                        onValueChange={setReviewDuration}
                      >
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

                      <Select
                        value={reviewChannel}
                        onValueChange={setReviewChannel}
                      >
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

                <ReviewBreakdown
                  averageRating={averageRating}
                  reviewRatingCounts={reviewRatingCounts}
                  totalReviews={totalReviews}
                />

                <section className="flex flex-col gap-6">
                  {filteredReviews.map((review) => (
                    <ReviewCard key={review.id} review={review} />
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
                <CardHeader className="gap-2">
                  <CardTitle>Stock</CardTitle>
                  <CardDescription>
                    Current stock availability by warehouse.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-5">
                  <div className="bg-muted/40 rounded-lg border p-5 text-center">
                    <p className="text-muted-foreground text-xs font-semibold tracking-[0.16em] uppercase">
                      Quantity at hand
                    </p>
                    <p className="mt-2 text-4xl font-semibold tracking-tight">
                      {totalStock}
                    </p>
                    <Button variant="outline" className="mt-4 rounded-lg">
                      <Package2 />
                      Adjust stock
                    </Button>
                  </div>

                  <div className="flex flex-col gap-4">
                    {stockLocations.map((location, index) => (
                      <div key={location.code} className="flex flex-col gap-4">
                        <div className="flex items-center justify-between gap-4 text-sm">
                          <div className="flex items-center gap-2">
                            <Store className="text-muted-foreground size-4" />
                            <span className="font-medium">{location.name}</span>
                            <span
                              className={cn(
                                "text-xs font-semibold uppercase",
                                location.tone === "low"
                                  ? "text-rose-600"
                                  : "text-muted-foreground",
                              )}
                            >
                              {location.code}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="font-semibold">
                              {location.quantity}
                            </span>
                            {location.tone === "low" ? (
                              <p className="text-xs text-rose-600">low</p>
                            ) : null}
                          </div>
                        </div>
                        {index < stockLocations.length - 1 ? (
                          <Separator />
                        ) : null}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-lg shadow-none">
                <CardHeader className="gap-2">
                  <CardTitle>Reorder points</CardTitle>
                  <CardDescription>
                    Current replenishment rules by warehouse.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {reorderPoints.map((item) => (
                    <div
                      key={item.code}
                      className="bg-muted/35 flex flex-col gap-4 rounded-lg border p-4"
                    >
                      <div className="flex items-center gap-2">
                        <Truck className="text-muted-foreground size-4" />
                        <p className="font-semibold">
                          {item.warehouse}{" "}
                          <span className="text-muted-foreground font-medium">
                            • {item.code}
                          </span>
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="flex flex-col gap-1">
                          <span className="text-muted-foreground text-xs font-semibold tracking-[0.16em] uppercase">
                            Reorder method
                          </span>
                          <span className="font-medium">{item.method}</span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-muted-foreground text-xs font-semibold tracking-[0.16em] uppercase">
                            Vendor
                          </span>
                          <span className="font-medium">{item.vendor}</span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-muted-foreground text-xs font-semibold tracking-[0.16em] uppercase">
                            Reorder point
                          </span>
                          <span className="font-medium">
                            {item.reorderPoint}
                          </span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-muted-foreground text-xs font-semibold tracking-[0.16em] uppercase">
                            Reorder quantity
                          </span>
                          <span className="font-medium">
                            {item.reorderQuantity}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="rounded-lg shadow-none">
                <CardHeader className="gap-2">
                  <CardTitle>Variants</CardTitle>
                  <CardDescription>
                    Selling configurations carried by this product.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {product.values.variants.map((variant, index) => (
                    <div
                      key={`${variant.option}-${variant.value}`}
                      className="flex flex-col gap-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-md">
                            <NotebookText className="size-4" />
                          </div>
                          <div>
                            <p className="font-medium">{variant.value}</p>
                            <p className="text-muted-foreground text-sm">
                              {formatLabel(variant.option)}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">
                            {formatCurrency(variant.price)}
                          </p>
                          <p className="text-muted-foreground text-sm">
                            {variant.quantity} units
                          </p>
                        </div>
                      </div>
                      {index < product.values.variants.length - 1 ? (
                        <Separator />
                      ) : null}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
