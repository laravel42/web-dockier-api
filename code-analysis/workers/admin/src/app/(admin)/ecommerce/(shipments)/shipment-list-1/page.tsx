import {
  EcommerceShipmentList1,
  type EcommerceShipmentList1SearchParams,
} from "@/components/ecommerce/shipment-list-1";

export default async function EcommerceShipmentList1Page({
  searchParams,
}: {
  searchParams: Promise<EcommerceShipmentList1SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;

  return <EcommerceShipmentList1 initialSearchParams={resolvedSearchParams} />;
}
