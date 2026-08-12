import { EcommerceProductDetail1 } from "@/components/ecommerce/product-detail-1";

interface Props {
  params: Promise<{
    slug: string;
  }>;
}

export default async function EcommerceProductDetailPage({ params }: Props) {
  const { slug } = await params;

  return <EcommerceProductDetail1 productSlug={slug} />;
}
