import {
  EcommerceCustomerList1,
  type EcommerceCustomerList1SearchParams,
} from "@/components/ecommerce/customer-list-1";

export default async function EcommerceCustomerList1Page({
  searchParams,
}: {
  searchParams: Promise<EcommerceCustomerList1SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;

  return <EcommerceCustomerList1 initialSearchParams={resolvedSearchParams} />;
}
