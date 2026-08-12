import { EcommerceOrderDetail2 } from "@/components/ecommerce/order-detail-2";
import { getSalesOrderByCode, salesOrders } from "@/lib/ecommerce-sales-orders";

type OrderDetail2PageProps = {
  searchParams: Promise<{ code?: string | string[] }>;
};

export default async function EcommerceOrderDetail2Page({
  searchParams,
}: OrderDetail2PageProps) {
  const { code } = await searchParams;
  const requestedCode = Array.isArray(code) ? code[0] : code;
  const fallbackOrder = salesOrders[0]!;
  const order = requestedCode
    ? (getSalesOrderByCode(requestedCode) ?? fallbackOrder)
    : fallbackOrder;

  const currentIndex = salesOrders.findIndex(
    (entry) => entry.code.toLowerCase() === order.code.toLowerCase(),
  );
  const previousOrderCode =
    currentIndex > 0 ? salesOrders[currentIndex - 1]?.code : undefined;
  const nextOrderCode =
    currentIndex >= 0 && currentIndex < salesOrders.length - 1
      ? salesOrders[currentIndex + 1]?.code
      : undefined;

  return (
    <EcommerceOrderDetail2
      order={order}
      previousOrderCode={previousOrderCode}
      nextOrderCode={nextOrderCode}
    />
  );
}
