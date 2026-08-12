import { redirect } from "next/navigation";

import { EcommerceEditProduct } from "@/components/ecommerce/add-product";
import { getEditableProductBySlug } from "@/lib/ecommerce-edit-products";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function EcommerceEditProductPage({ params }: Props) {
  const slug = (await params).slug;
  const product = getEditableProductBySlug(slug);

  if (!product) {
    return redirect("/ecommerce/product-list-1");
  }

  return (
    <EcommerceEditProduct
      initialValues={product.values}
      assets={product.assets}
    />
  );
}
