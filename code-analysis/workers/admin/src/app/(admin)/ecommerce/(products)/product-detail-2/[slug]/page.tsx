import { EcommerceProductDetail2 } from "@/components/ecommerce/product-detail-2";

type Props = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function EcommerceProductDetail2DynamicPage({
  params,
}: Props) {
  const { slug } = await params;

  return <EcommerceProductDetail2 productSlug={slug} />;
}
