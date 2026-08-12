import {
  getSalesOrderByCode,
  type SalesOrder,
} from "@/lib/ecommerce-sales-orders";

export type EditableOrderValues = {
  selectedItems: Record<string, number>;
  method: "purchase-order" | "stock-transfer" | "work-order";
  vendor: string;
  buyer: string;
  destinationWarehouse: string;
  transferWarehouse: string;
  productionCell: string;
  componentSource: string;
  expectedDate: string;
  paymentTerm: string;
  poReference: string;
  reserveDock: boolean;
  notifyOps: boolean;
  notes: string;
};

export function getOrderEditHref(orderCode: string) {
  return `/ecommerce/edit-order/${orderCode.toLowerCase()}`;
}

function mapDestinationWarehouse(location: SalesOrder["location"]) {
  if (location === "Austin, TX") return "Austin warehouse";
  if (location === "Chicago, IL") return "Chicago warehouse";
  if (location === "Seattle, WA") return "Seattle warehouse";
  return "Brooklyn warehouse";
}

function mapTransferWarehouse(location: SalesOrder["location"]) {
  if (location === "Austin, TX") return "Austin overflow";
  if (location === "Chicago, IL") return "Chicago reserve";
  if (location === "Seattle, WA") return "Seattle annex";
  return "Miami storage";
}

function methodFromOrder(order: SalesOrder): EditableOrderValues["method"] {
  if (order.status === "shipment") return "stock-transfer";
  if (order.status === "started") return "work-order";
  return "purchase-order";
}

function vendorFromOrder(order: SalesOrder) {
  if (order.source === "Online store") return "Globex Corp";
  if (order.source === "Wholesale") return "Adidas Supply";
  if (order.source === "Retail partner") return "Nord Goods";
  return "Acme Corp";
}

function productionCellFromOrder(order: SalesOrder) {
  if (order.productName.toLowerCase().includes("serum")) return "Blend lab";
  if (order.productName.toLowerCase().includes("set"))
    return "Packaging studio";
  return "Seasonal assembly line";
}

function componentSourceFromOrder(order: SalesOrder) {
  if (order.status === "started") return "Bulk components inventory";
  if (order.status === "shipment") return "Packaging reserve";
  return "Seasonal surplus stock";
}

function paymentTermFromOrder(order: SalesOrder) {
  if (order.paymentState === "unpaid") return "Due on receipt";
  if (order.paymentState === "partial") return "50% upfront";
  return "Net 30";
}

function expectedDateFromOrder(order: SalesOrder) {
  if (order.status === "shipment") return "2026-04-03";
  if (order.status === "started") return "2026-04-06";
  if (order.status === "fulfilled") return "2026-04-01";
  return "2026-04-08";
}

export function getEditableOrderByCode(
  code: string,
): EditableOrderValues | null {
  const order = getSalesOrderByCode(code);

  if (!order) {
    return null;
  }

  return {
    selectedItems: {
      [order.productName]: Math.max(order.quantity * 24, 24),
    },
    method: methodFromOrder(order),
    vendor: vendorFromOrder(order),
    buyer: order.accountManager,
    destinationWarehouse: mapDestinationWarehouse(order.location),
    transferWarehouse: mapTransferWarehouse(order.location),
    productionCell: productionCellFromOrder(order),
    componentSource: componentSourceFromOrder(order),
    expectedDate: expectedDateFromOrder(order),
    paymentTerm: paymentTermFromOrder(order),
    poReference: `PO-2026-${order.code.replace(/\D/g, "")}`,
    reserveDock: order.status !== "quote",
    notifyOps: true,
    notes: order.summary,
  };
}
