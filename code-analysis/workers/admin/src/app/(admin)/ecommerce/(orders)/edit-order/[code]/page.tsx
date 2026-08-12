import { notFound } from "next/navigation";

import { EcommerceEditOrder } from "@/components/ecommerce/add-order";
import { getEditableOrderByCode } from "@/lib/ecommerce-edit-orders";

type EditOrderPageProps = {
  params: Promise<{ code: string }>;
};

export default async function EcommerceEditOrderPage({
  params,
}: EditOrderPageProps) {
  const { code } = await params;
  const initialValues = getEditableOrderByCode(code);

  if (!initialValues) {
    notFound();
  }

  return (
    <div
      data-layout="fixed"
      className="flex h-full min-h-0 flex-1 overflow-hidden"
    >
      <EcommerceEditOrder initialValues={initialValues} orderCode={code} />
    </div>
  );
}
