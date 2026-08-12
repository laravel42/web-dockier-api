import {
  getEditableProductBySlug,
  slugifyProductName,
} from "@/lib/ecommerce-edit-products";

export type VariantFocusProductVariant = {
  id: string;
  label: string;
  sku: string;
  stock: number;
  retailPrice: number;
  wholesalePrice: number;
  image: string;
  isPrimary?: boolean;
};

export type VariantFocusProduct = {
  slug: string;
  name: string;
  category: string;
  productType: string;
  unit: string;
  vendor: string;
  material: string;
  fit: string;
  notes: Array<{ title: string; body: string }>;
  history: Array<{ title: string; body: string; time: string }>;
  gallery: string[];
  variants: VariantFocusProductVariant[];
};

function createVariantFocusProduct(input: Omit<VariantFocusProduct, "slug">) {
  return {
    ...input,
    slug: slugifyProductName(input.name),
  };
}

const variantFocusProducts = [
  createVariantFocusProduct({
    name: "Radiance Ritual Set",
    category: "Wellness",
    productType: "Stocked Product",
    unit: "Each (Ea)",
    vendor: "Acme Retail",
    material: "Gift-boxed skin-care kit",
    fit: "Core assortment",
    gallery: [
      "/images/block/ecommerce/skin-care-product/pexels-amelie-chen-243775000-12352170-3.jpg",
      "/images/block/ecommerce/skin-care-product/kadarius-seegars-Mxy5gokl8mE-unsplash-3.jpg",
      "/images/block/ecommerce/skin-care-product/nora-hutton-AjU6Z5k_uBI-unsplash-3.jpg",
      "/images/block/ecommerce/skin-care-product/pexels-karolina-grabowska-4938448-3.jpg",
      "/images/block/ecommerce/skin-care-product/pexels-carlos-diaz-216017-18350286-3.jpg",
    ],
    variants: [
      {
        id: "ocean-ritual",
        label: "Ocean / 3-piece set",
        sku: "SKU-SKIN-4006-OCN",
        stock: 48,
        retailPrice: 389,
        wholesalePrice: 249,
        image:
          "/images/block/ecommerce/skin-care-product/pexels-amelie-chen-243775000-12352170-3.jpg",
        isPrimary: true,
      },
      {
        id: "sand-ritual",
        label: "Sand / 3-piece set",
        sku: "SKU-SKIN-4006-SND",
        stock: 22,
        retailPrice: 389,
        wholesalePrice: 249,
        image:
          "/images/block/ecommerce/skin-care-product/kadarius-seegars-Mxy5gokl8mE-unsplash-3.jpg",
      },
      {
        id: "stone-travel",
        label: "Stone / Travel trio",
        sku: "SKU-SKIN-4006-STN",
        stock: 18,
        retailPrice: 179,
        wholesalePrice: 116,
        image:
          "/images/block/ecommerce/skin-care-product/nora-hutton-AjU6Z5k_uBI-unsplash-3.jpg",
      },
      {
        id: "rose-travel",
        label: "Rose / Travel trio",
        sku: "SKU-SKIN-4006-RSE",
        stock: 10,
        retailPrice: 179,
        wholesalePrice: 116,
        image:
          "/images/block/ecommerce/skin-care-product/pexels-karolina-grabowska-4938448-3.jpg",
      },
      {
        id: "slate-duo",
        label: "Slate / Duo set",
        sku: "SKU-SKIN-4006-SLT",
        stock: 14,
        retailPrice: 259,
        wholesalePrice: 168,
        image:
          "/images/block/ecommerce/skin-care-product/pexels-carlos-diaz-216017-18350286-3.jpg",
      },
      {
        id: "cloud-gift",
        label: "Cloud / Gift set",
        sku: "SKU-SKIN-4006-CLD",
        stock: 8,
        retailPrice: 429,
        wholesalePrice: 278,
        image:
          "/images/block/ecommerce/skin-care-product/pexels-volkerthimm-19049367-3.jpg",
      },
    ],
    notes: [
      {
        title: "Merchandising note",
        body: "Keep the Ocean and Sand colorways pinned to homepage collections because those variants convert best in starter bundles.",
      },
      {
        title: "Ops note",
        body: "Travel-trio variants are running tighter than the boxed sets, so replenishment should prioritize those SKUs first.",
      },
    ],
    history: [
      {
        title: "Primary variant switched to Ocean / 3-piece set",
        body: "The merchandising team moved Ocean into the hero slot after the latest campaign outperformed the Sand launch set.",
        time: "Thu, 27 Mar 2026 · 10:12 AM",
      },
      {
        title: "Added Cloud / Gift set",
        body: "A premium gifting configuration was introduced for retail partner exclusives and event-driven placements.",
        time: "Tue, 18 Mar 2026 · 4:05 PM",
      },
      {
        title: "Updated wholesale pricing across travel variants",
        body: "Travel-trio pricing was normalized so sales teams can quote the compact kits without overriding margins manually.",
        time: "Fri, 7 Mar 2026 · 1:48 PM",
      },
    ],
  }),
];

export function getProductDetail2Href(productName: string) {
  return `/ecommerce/product-detail-2/${slugifyProductName(productName)}`;
}

export function getVariantFocusProductBySlug(slug: string) {
  const match = variantFocusProducts.find((product) => product.slug === slug);

  if (match) {
    return match;
  }

  const editable = getEditableProductBySlug(slug);

  if (!editable) {
    return null;
  }

  return createVariantFocusProduct({
    name: editable.values.name,
    category: editable.values.category,
    productType: "Stocked Product",
    unit: editable.values.variants[0]?.value ?? "Each (Ea)",
    vendor: editable.values.vendor || "Acme Retail",
    material: "Core assortment",
    fit: "Standard configuration",
    gallery: editable.assets.gallery,
    variants: editable.values.variants.map((variant, index) => ({
      id: `${slug}-${index}`,
      label: `${variant.value}`,
      sku: `${editable.values.sku}-${index + 1}`,
      stock: Number(variant.quantity || 0),
      retailPrice: Number(variant.price || editable.values.basePrice || "0"),
      wholesalePrice: Math.round(
        Number(variant.price || editable.values.basePrice || "0") * 0.68,
      ),
      image: editable.assets.gallery[index % editable.assets.gallery.length],
      isPrimary: index === 0,
    })),
    notes: [
      {
        title: "Catalog note",
        body: "This product uses the fallback variant detail layout because no dedicated variant merchandising seed was created for it yet.",
      },
    ],
    history: [
      {
        title: "Variant detail generated from catalog seed",
        body: "The page is using the editable product seed to create a variant-focused detail view for this SKU.",
        time: "Today · 12:00 AM",
      },
    ],
  });
}
