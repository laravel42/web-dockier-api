export type SalesOrderStatus =
  | "all"
  | "quote"
  | "started"
  | "shipment"
  | "fulfilled";
export type PaymentState = "paid" | "partial" | "unpaid";

export type SalesOrder = {
  id: string;
  code: string;
  customerName: string;
  source: "Online store" | "Wholesale" | "Marketplace" | "Retail partner";
  location: "Brooklyn, NY" | "Austin, TX" | "Chicago, IL" | "Seattle, WA";
  status: Exclude<SalesOrderStatus, "all">;
  paymentState: PaymentState;
  amount: number;
  quantity: number;
  productName: string;
  variant: string;
  orderDateLabel: string;
  daysAgo: number;
  hasInvoice: boolean;
  progress: number;
  accountManager: string;
  summary: string;
};

export const salesOrders: SalesOrder[] = [
  {
    id: "so-654",
    code: "SO-654",
    customerName: "Brooklyn Simmons",
    source: "Marketplace",
    location: "Brooklyn, NY",
    status: "quote",
    paymentState: "unpaid",
    amount: 210,
    quantity: 1,
    productName: "Radiance Ritual Set",
    variant: "Ocean Blue / S",
    orderDateLabel: "Mar 28, 2026",
    daysAgo: 0,
    hasInvoice: false,
    progress: 18,
    accountManager: "Avery Hall",
    summary: "New quote waiting for approval",
  },
  {
    id: "so-653",
    code: "SO-653",
    customerName: "Cameron Ford",
    source: "Online store",
    location: "Austin, TX",
    status: "shipment",
    paymentState: "paid",
    amount: 680,
    quantity: 2,
    productName: "Timeless Renewal Cream",
    variant: "Army / L",
    orderDateLabel: "Mar 27, 2026",
    daysAgo: 1,
    hasInvoice: true,
    progress: 72,
    accountManager: "Riley Chen",
    summary: "Packed and waiting for carrier pickup",
  },
  {
    id: "so-652",
    code: "SO-652",
    customerName: "Savannah Nguyen",
    source: "Wholesale",
    location: "Chicago, IL",
    status: "started",
    paymentState: "partial",
    amount: 480,
    quantity: 1,
    productName: "Cloud Silk Toner",
    variant: "Army / XL",
    orderDateLabel: "Mar 24, 2026",
    daysAgo: 4,
    hasInvoice: true,
    progress: 46,
    accountManager: "Jordan Lee",
    summary: "Items are in packaging with QA review",
  },
  {
    id: "so-651",
    code: "SO-651",
    customerName: "Aliyah Carter",
    source: "Retail partner",
    location: "Seattle, WA",
    status: "fulfilled",
    paymentState: "paid",
    amount: 320,
    quantity: 1,
    productName: "Barrier Repair Drops",
    variant: "Core / M",
    orderDateLabel: "Mar 21, 2026",
    daysAgo: 7,
    hasInvoice: true,
    progress: 100,
    accountManager: "Mina Patel",
    summary: "Delivered and marked complete",
  },
  {
    id: "so-650",
    code: "SO-650",
    customerName: "Noah Bennett",
    source: "Marketplace",
    location: "Austin, TX",
    status: "started",
    paymentState: "paid",
    amount: 540,
    quantity: 3,
    productName: "Micro Peel Serum",
    variant: "Night / Standard",
    orderDateLabel: "Mar 19, 2026",
    daysAgo: 9,
    hasInvoice: false,
    progress: 38,
    accountManager: "Avery Hall",
    summary: "Order accepted and picking has started",
  },
  {
    id: "so-649",
    code: "SO-649",
    customerName: "Maya Collins",
    source: "Wholesale",
    location: "Chicago, IL",
    status: "shipment",
    paymentState: "partial",
    amount: 1040,
    quantity: 4,
    productName: "HydraBloom Night Cream",
    variant: "Export / Bulk",
    orderDateLabel: "Mar 15, 2026",
    daysAgo: 13,
    hasInvoice: true,
    progress: 81,
    accountManager: "Riley Chen",
    summary: "Carrier booked, documents are attached",
  },
  {
    id: "so-648",
    code: "SO-648",
    customerName: "Priya Menon",
    source: "Online store",
    location: "Brooklyn, NY",
    status: "quote",
    paymentState: "unpaid",
    amount: 96,
    quantity: 1,
    productName: "Dew Reset Essence",
    variant: "Starter / XS",
    orderDateLabel: "Mar 12, 2026",
    daysAgo: 16,
    hasInvoice: false,
    progress: 12,
    accountManager: "Jordan Lee",
    summary: "Waiting on customer confirmation",
  },
];

export function getSalesOrderDetailHref(orderCode: string) {
  return `/ecommerce/order-detail-2?code=${encodeURIComponent(orderCode.toLowerCase())}`;
}

export function getSalesOrderByCode(code: string) {
  return salesOrders.find(
    (order) => order.code.toLowerCase() === code.trim().toLowerCase(),
  );
}
