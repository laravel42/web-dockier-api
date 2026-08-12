import { redirect } from "next/navigation";

import { EcommerceEditProduct2 } from "@/components/ecommerce/add-product-2";
import { getEditableProduct2BySlug } from "@/lib/ecommerce-edit-products";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function EcommerceEditProduct2Page({ params }: Props) {
  const slug = (await params).slug;
  const product = getEditableProduct2BySlug(slug);

  if (!product) {
    return redirect("/ecommerce/product-list-1");
  }

  return (
    <div
      data-layout="fixed"
      className="flex h-full min-h-0 flex-1 overflow-hidden"
    >
      <EcommerceEditProduct2
        initialValues={product.values}
        initialMediaSources={product.media}
        draftStorageKey={`ecommerce-edit-product-2-${product.slug}-draft-v1`}
      />
    </div>
  );
}
