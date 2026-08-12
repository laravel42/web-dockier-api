import { notFound } from "next/navigation";

import { EcommerceEditCustomer } from "@/components/ecommerce/customer-editor";
import { getEditableCustomerById } from "@/lib/ecommerce-edit-customers";

type EditCustomerPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EcommerceEditCustomerPage({
  params,
}: EditCustomerPageProps) {
  const { id } = await params;
  const initialValues = getEditableCustomerById(id);

  if (!initialValues) {
    notFound();
  }

  return (
    <div
      data-layout="fixed"
      className="flex h-full min-h-0 flex-1 overflow-hidden"
    >
      <EcommerceEditCustomer initialValues={initialValues} customerId={id} />
    </div>
  );
}
