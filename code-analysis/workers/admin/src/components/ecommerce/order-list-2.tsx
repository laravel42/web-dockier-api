"use client";

import {
  ChevronDown,
  ListFilter,
  Plus,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import * as React from "react";
import { DndProvider, useDrag, useDragLayer, useDrop } from "react-dnd";
import { getEmptyImage, HTML5Backend } from "react-dnd-html5-backend";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { inventoryCards } from "@/lib/ecommerce-product-catalog";

type BoardStage =
  | "arrived"
  | "ready-for-pickup"
  | "order-sent"
  | "packaging"
  | "fulfilled"
  | "unfulfilled";

type Channel =
  | "Online store"
  | "Subscription"
  | "Wholesale"
  | "Marketplace"
  | "Retail partner";

type OrderCardData = {
  id: string;
  stage: BoardStage;
  purchasedLabel: string;
  customerName: string;
  orderedAt: string;
  total: number;
  channel: Channel;
  attention?: boolean;
  coordinator: string;
  products: string[];
};

type BoardColumnConfig = {
  id: BoardStage;
  label: string;
  color: string;
  icon: React.FC;
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const imageLookup = new Map(
  inventoryCards.map((card) => [card.name, card.image]),
);

const DottedIcon: React.FC<{ stroke?: string }> = ({ stroke = "#a1a1aa" }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 14 14"
    fill="none"
    aria-hidden="true"
  >
    <circle
      cx="7"
      cy="7"
      r="6"
      fill="none"
      stroke={stroke}
      strokeWidth="2"
      strokeDasharray="1.4 1.74"
      strokeDashoffset="0.65"
    />
    <circle
      cx="7"
      cy="7"
      r="2"
      fill="none"
      stroke={stroke}
      strokeWidth="4"
      strokeDasharray="0 100"
      strokeDashoffset="0"
      transform="rotate(-90 7 7)"
    />
  </svg>
);

const PartialRingIcon: React.FC<{ stroke: string; dash: string }> = ({
  stroke,
  dash,
}) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 14 14"
    fill="none"
    aria-hidden="true"
  >
    <circle
      cx="7"
      cy="7"
      r="6"
      fill="none"
      stroke={stroke}
      strokeWidth="2"
      strokeDasharray="3.14 0"
      strokeDashoffset="-0.7"
    />
    <circle
      cx="7"
      cy="7"
      r="2"
      fill="none"
      stroke={stroke}
      strokeWidth="4"
      strokeDasharray={dash}
      strokeDashoffset="0"
      transform="rotate(-90 7 7)"
    />
  </svg>
);

const stageColumns: BoardColumnConfig[] = [
  {
    id: "arrived",
    label: "Arrived",
    color: "#a1a1aa",
    icon: () => <DottedIcon stroke="#a1a1aa" />,
  },
  {
    id: "ready-for-pickup",
    label: "Ready for pickup",
    color: "#a1a1aa",
    icon: () => (
      <PartialRingIcon stroke="#a1a1aa" dash="2.0839231268812295 100" />
    ),
  },
  {
    id: "order-sent",
    label: "Order sent",
    color: "#a1a1aa",
    icon: () => (
      <PartialRingIcon stroke="#a1a1aa" dash="4.167846253762459 100" />
    ),
  },
  {
    id: "packaging",
    label: "Packaging",
    color: "#a1a1aa",
    icon: () => (
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        aria-hidden="true"
      >
        <circle
          cx="7"
          cy="7"
          r="6"
          fill="none"
          stroke="#a1a1aa"
          strokeWidth="2"
          strokeDasharray="3.14 0"
          strokeDashoffset="-0.7"
        />
        <path
          d="M4.5 7L6.5 9L9.5 5"
          stroke="#a1a1aa"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    id: "fulfilled",
    label: "Fulfilled",
    color: "#a1a1aa",
    icon: () => (
      <PartialRingIcon stroke="#a1a1aa" dash="6.2517693806436885 100" />
    ),
  },
  {
    id: "unfulfilled",
    label: "Unfulfilled",
    color: "#a1a1aa",
    icon: () => <DottedIcon stroke="#a1a1aa" />,
  },
];

const initialOrders: OrderCardData[] = [
  {
    id: "ORD-235325",
    stage: "arrived",
    purchasedLabel: "Barrier Repair Drops",
    customerName: "Maya Collins",
    orderedAt: "Apr 02",
    total: 188,
    channel: "Online store",
    coordinator: "MC",
    products: ["Barrier Repair Drops"],
  },
  {
    id: "ORD-823904",
    stage: "ready-for-pickup",
    purchasedLabel: "Radiance Ritual Set, Cloud Silk Toner",
    customerName: "Jordan Reyes",
    orderedAt: "Apr 01",
    total: 452,
    channel: "Wholesale",
    coordinator: "JR",
    products: ["Radiance Ritual Set", "Cloud Silk Toner"],
  },
  {
    id: "ORD-32543",
    stage: "order-sent",
    purchasedLabel:
      "PureEssence Soap Trio, Timeless Renewal Cream, Cloud Silk Toner",
    customerName: "Nina Park",
    orderedAt: "Mar 31",
    total: 268,
    channel: "Marketplace",
    coordinator: "NP",
    products: [
      "PureEssence Soap Trio",
      "Timeless Renewal Cream",
      "Cloud Silk Toner",
    ],
  },
  {
    id: "ORD-37646",
    stage: "packaging",
    purchasedLabel:
      "Timeless Renewal Cream, HydraBloom Night Cream, Botanical Body Polish",
    customerName: "Priya Menon",
    orderedAt: "Mar 29",
    total: 612,
    channel: "Retail partner",
    coordinator: "PM",
    products: [
      "Timeless Renewal Cream",
      "HydraBloom Night Cream",
      "Botanical Body Polish",
    ],
  },
  {
    id: "ORD-190931",
    stage: "fulfilled",
    purchasedLabel: "Radiance Ritual Set",
    customerName: "Elaine Wu",
    orderedAt: "Mar 27",
    total: 389,
    channel: "Online store",
    coordinator: "EW",
    products: ["Radiance Ritual Set"],
  },
  {
    id: "ORD-465383",
    stage: "fulfilled",
    purchasedLabel: "HydraBloom Night Cream, Barrier Repair Drops",
    customerName: "Caleb Moore",
    orderedAt: "Mar 26",
    total: 174,
    channel: "Subscription",
    coordinator: "CM",
    products: ["HydraBloom Night Cream", "Barrier Repair Drops"],
  },
  {
    id: "ORD-856744",
    stage: "unfulfilled",
    purchasedLabel: "PureEssence Soap Trio",
    customerName: "Harper James",
    orderedAt: "Mar 25",
    total: 59,
    channel: "Online store",
    coordinator: "HJ",
    attention: true,
    products: ["PureEssence Soap Trio"],
  },
  {
    id: "ORD-547432",
    stage: "unfulfilled",
    purchasedLabel: "Overnight Recovery Mask, Cloud Silk Toner",
    customerName: "Sofia Alvarez",
    orderedAt: "Mar 24",
    total: 226,
    channel: "Marketplace",
    coordinator: "SA",
    products: ["Overnight Recovery Mask", "Cloud Silk Toner"],
  },
  {
    id: "ORD-624363",
    stage: "ready-for-pickup",
    purchasedLabel: "Micro Peel Serum",
    customerName: "Tobias Green",
    orderedAt: "Mar 23",
    total: 128,
    channel: "Subscription",
    coordinator: "TG",
    products: ["Micro Peel Serum"],
  },
  {
    id: "ORD-646344",
    stage: "arrived",
    purchasedLabel: "Overnight Recovery Mask, Timeless Renewal Cream",
    customerName: "Lena Hart",
    orderedAt: "Mar 22",
    total: 226,
    channel: "Retail partner",
    coordinator: "LH",
    products: ["Overnight Recovery Mask", "Timeless Renewal Cream"],
  },
];

const ORDER_DRAG_TYPE = "ORDER_CARD";

function getProductImage(name: string) {
  return imageLookup.get(name) ?? inventoryCards[0]?.image ?? "";
}

function OrderDragPreview({ order }: { order: OrderCardData }) {
  return (
    <div className="bg-background border-border/60 w-[304px] overflow-hidden rounded-md border p-3 shadow-md">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-muted-foreground text-xs">Order:</div>
          <div className="mt-0.5 text-lg leading-none font-semibold tracking-tight">
            #{order.id.replace("ORD-", "")}
          </div>
        </div>
        <div className="text-right">
          <div className="text-muted-foreground text-xs">Total</div>
          <div className="text-sm font-semibold">
            {currencyFormatter.format(order.total)}
          </div>
        </div>
      </div>

      <div className="mb-3">
        <div className="text-muted-foreground text-xs">Purchased:</div>
        <div className="mt-0.5 line-clamp-2 text-sm font-medium">
          {order.purchasedLabel}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        <span className="bg-muted text-muted-foreground rounded-full px-2 py-1 text-[11px]">
          {order.channel}
        </span>
        <span className="bg-muted text-muted-foreground rounded-full px-2 py-1 text-[11px]">
          {order.customerName}
        </span>
      </div>

      <div className="flex items-center justify-between pt-1">
        <span className="text-muted-foreground text-xs">{order.orderedAt}</span>
        <Avatar className="size-7">
          <AvatarFallback className="text-[10px] font-semibold">
            {order.coordinator}
          </AvatarFallback>
        </Avatar>
      </div>
    </div>
  );
}

function OrderBoardDragLayer() {
  const { itemType, isDragging, item, currentOffset } = useDragLayer(
    (monitor) => ({
      item: monitor.getItem() as OrderCardData,
      itemType: monitor.getItemType(),
      currentOffset: monitor.getSourceClientOffset(),
      isDragging: monitor.isDragging(),
    }),
  );

  if (!isDragging || itemType !== ORDER_DRAG_TYPE || !item || !currentOffset) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed top-0 left-0 z-50"
      style={{
        transform: `translate(${currentOffset.x}px, ${currentOffset.y}px)`,
      }}
    >
      <OrderDragPreview order={item} />
    </div>
  );
}

function OrderBoardCard({
  order,
  showTotals,
}: {
  order: OrderCardData;
  showTotals: boolean;
}) {
  const visibleProducts = order.products.slice(0, 3);
  const remainingCount = order.products.length - visibleProducts.length;
  const [{ isDragging }, drag, preview] = useDrag(() => ({
    type: ORDER_DRAG_TYPE,
    item: order,
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }));

  React.useEffect(() => {
    preview(getEmptyImage(), { captureDraggingState: true });
  }, [preview]);

  const setCardRef = React.useCallback(
    (node: HTMLAnchorElement | null) => {
      if (node) {
        drag(node);
      }
    },
    [drag],
  );

  return (
    <Link
      ref={setCardRef}
      href="/ecommerce/order-detail-1"
      className="bg-background border-border/60 hover:bg-accent/30 block cursor-default rounded-md border p-3 shadow-xs transition-colors"
      style={{
        opacity: isDragging ? 0.4 : 1,
        cursor: isDragging ? "grabbing" : "grab",
      }}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-muted-foreground text-xs">Order:</div>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="truncate text-lg leading-none font-semibold tracking-tight">
              #{order.id.replace("ORD-", "")}
            </span>
            {order.attention ? (
              <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                Risk
              </span>
            ) : null}
          </div>
        </div>

        {showTotals ? (
          <div className="text-right">
            <div className="text-muted-foreground text-xs">Total</div>
            <div className="text-sm font-semibold">
              {currencyFormatter.format(order.total)}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mb-3">
        <div className="text-muted-foreground text-xs">Purchased:</div>
        <div className="mt-0.5 line-clamp-2 text-sm font-medium">
          {order.purchasedLabel}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        <span className="bg-muted text-muted-foreground rounded-full px-2 py-1 text-[11px]">
          {order.channel}
        </span>
        <span className="bg-muted text-muted-foreground rounded-full px-2 py-1 text-[11px]">
          {order.customerName}
        </span>
      </div>

      {visibleProducts.length > 0 ? (
        <div className="mb-3 flex items-center gap-1.5">
          {visibleProducts.map((productName) => (
            <div
              key={`${order.id}-${productName}`}
              className="bg-muted relative size-18 overflow-hidden rounded-md"
            >
              <Image
                src={getProductImage(productName)}
                alt={productName}
                fill
                className="object-cover"
                sizes="72px"
              />
            </div>
          ))}
          {remainingCount > 0 ? (
            <div className="bg-muted text-foreground grid size-18 place-items-center rounded-md text-2xl font-medium">
              +{remainingCount}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center justify-between pt-1">
        <span className="text-muted-foreground text-xs">{order.orderedAt}</span>
        <Avatar className="size-7">
          <AvatarFallback className="text-[10px] font-semibold">
            {order.coordinator}
          </AvatarFallback>
        </Avatar>
      </div>
    </Link>
  );
}

function OrderBoardColumn({
  column,
  items,
  showTotals,
  onMoveOrder,
}: {
  column: BoardColumnConfig;
  items: OrderCardData[];
  showTotals: boolean;
  onMoveOrder: (orderId: string, stage: BoardStage) => void;
}) {
  const Icon = column.icon;
  const laneTotal = items.reduce((sum, item) => sum + item.total, 0);
  const [{ isOver }, drop] = useDrop(
    () => ({
      accept: ORDER_DRAG_TYPE,
      drop: (item: OrderCardData) => {
        if (item.stage !== column.id) {
          onMoveOrder(item.id, column.id);
        }
      },
      collect: (monitor) => ({
        isOver: monitor.isOver({ shallow: true }),
      }),
    }),
    [column.id, onMoveOrder],
  );

  const setDropRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      if (node) {
        drop(node);
      }
    },
    [drop],
  );

  return (
    <section className="bg-container flex h-full min-h-0 w-[348px] shrink-0 flex-col overflow-hidden rounded-md">
      <div className="bg-muted/40 sticky top-0 z-10 h-[50px] rounded-t-md">
        <div className="flex h-full items-center justify-between px-3">
          <div className="flex items-center gap-2">
            <Icon />
            <span className="text-sm font-medium">{column.label}</span>
            <span className="text-muted-foreground text-sm">
              {items.length}
            </span>
          </div>

          <button
            type="button"
            className="text-muted-foreground hover:text-foreground grid size-6 place-items-center rounded-md text-lg transition-colors"
            aria-label={`Add order to ${column.label}`}
          >
            <Plus className="size-4" />
          </button>
        </div>
      </div>

      <div
        ref={setDropRef}
        className="relative flex min-h-0 flex-1 flex-col overflow-y-auto bg-zinc-50/50 p-2 transition-colors dark:bg-zinc-900/50"
        style={{
          backgroundColor: isOver ? `${column.color}12` : undefined,
        }}
      >
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-muted-foreground text-xs">Lane total</span>
          <span className="text-xs font-medium">
            {currencyFormatter.format(laneTotal)}
          </span>
        </div>

        <div className="space-y-2">
          {items.map((order) => (
            <OrderBoardCard
              key={order.id}
              order={order}
              showTotals={showTotals}
            />
          ))}

          <button
            type="button"
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-2 text-sm transition-colors"
          >
            <Plus className="size-4" />
            New
          </button>
        </div>
      </div>
    </section>
  );
}

export function EcommerceOrderList2() {
  const [boardOrders, setBoardOrders] = React.useState(initialOrders);
  const [query, setQuery] = React.useState("");
  const [showTotals, setShowTotals] = React.useState(true);
  const [attentionOnly, setAttentionOnly] = React.useState(false);
  const [selectedChannels, setSelectedChannels] = React.useState<Channel[]>([]);

  const filteredOrders = React.useMemo(() => {
    return boardOrders.filter((order) => {
      const normalizedQuery = query.trim().toLowerCase();
      const matchesQuery =
        normalizedQuery.length === 0 ||
        [
          order.id,
          order.customerName,
          order.purchasedLabel,
          ...order.products,
          order.channel,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);

      if (!matchesQuery) return false;
      if (attentionOnly && !order.attention) return false;
      if (
        selectedChannels.length > 0 &&
        !selectedChannels.includes(order.channel)
      ) {
        return false;
      }
      return true;
    });
  }, [attentionOnly, boardOrders, query, selectedChannels]);

  const groupedOrders = React.useMemo(() => {
    return stageColumns.reduce<Record<BoardStage, OrderCardData[]>>(
      (acc, stage) => {
        acc[stage.id] = filteredOrders.filter(
          (order) => order.stage === stage.id,
        );
        return acc;
      },
      {} as Record<BoardStage, OrderCardData[]>,
    );
  }, [filteredOrders]);

  const activeFilterCount =
    (attentionOnly ? 1 : 0) +
    (selectedChannels.length > 0 ? selectedChannels.length : 0);

  const moveOrderToStage = React.useCallback(
    (orderId: string, stage: BoardStage) => {
      setBoardOrders((current) =>
        current.map((order) =>
          order.id === orderId ? { ...order, stage } : order,
        ),
      );
    },
    [],
  );

  return (
    <DndProvider backend={HTML5Backend}>
      <OrderBoardDragLayer />
      <div
        data-order-board-root
        className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      >
        <div className="shrink-0 border-b px-6 py-4">
          <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <h1 className="text-2xl font-semibold tracking-tight">
              Order List
            </h1>

            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <div className="relative w-full min-w-0 sm:w-72">
                <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                <Input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search orders..."
                  className="h-10 pl-9 text-sm"
                />
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="h-10 px-3">
                    <SlidersHorizontal className="mr-2 h-4 w-4" />
                    Display
                    <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Display properties</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem
                    checked={showTotals}
                    onCheckedChange={(checked) =>
                      setShowTotals(Boolean(checked))
                    }
                  >
                    Show card totals
                  </DropdownMenuCheckboxItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        <div className="flex h-12 min-w-0 shrink-0 items-center justify-between border-b px-6">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="relative h-9 px-2.5">
                <ListFilter className="mr-1 h-4 w-4" />
                Filter
                {activeFilterCount > 0 ? (
                  <span className="bg-primary text-primary-foreground absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full text-[10px]">
                    {activeFilterCount}
                  </span>
                ) : null}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>Filter orders</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={attentionOnly}
                onCheckedChange={(checked) =>
                  setAttentionOnly(Boolean(checked))
                }
              >
                Needs attention
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              {(
                [
                  "Online store",
                  "Subscription",
                  "Wholesale",
                  "Marketplace",
                  "Retail partner",
                ] as Channel[]
              ).map((channel) => (
                <DropdownMenuCheckboxItem
                  key={channel}
                  checked={selectedChannels.includes(channel)}
                  onCheckedChange={(checked) => {
                    setSelectedChannels((current) =>
                      checked
                        ? [...current, channel]
                        : current.filter((item) => item !== channel),
                    );
                  }}
                >
                  {channel}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="text-muted-foreground text-sm">
            {filteredOrders.length} orders
          </div>
        </div>

        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <div
            data-order-board-scroll
            className="h-full w-full overflow-x-auto overflow-y-hidden overscroll-x-contain"
          >
            <div
              data-order-board-strip
              className="flex h-full min-w-max gap-3 px-2 py-2"
            >
              {stageColumns.map((column) => (
                <OrderBoardColumn
                  key={column.id}
                  column={column}
                  items={groupedOrders[column.id]}
                  showTotals={showTotals}
                  onMoveOrder={moveOrderToStage}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </DndProvider>
  );
}
