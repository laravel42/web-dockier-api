import {
  EcommerceProductList1,
  type EcommerceProductList1SearchParams,
} from "@/components/ecommerce/product-list-1";

export default async function EcommerceProductList1Page({
  searchParams,
}: {
  searchParams: Promise<EcommerceProductList1SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;

  return <EcommerceProductList1 initialSearchParams={resolvedSearchParams} />;
}
