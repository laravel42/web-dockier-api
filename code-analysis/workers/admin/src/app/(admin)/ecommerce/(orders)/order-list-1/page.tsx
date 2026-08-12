import {
  EcommerceOrderList1,
  type EcommerceOrderList1SearchParams,
} from "@/components/ecommerce/order-list-1";

export default async function EcommerceOrderList1Page({
  searchParams,
}: {
  searchParams: Promise<EcommerceOrderList1SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;

  return <EcommerceOrderList1 initialSearchParams={resolvedSearchParams} />;
}
