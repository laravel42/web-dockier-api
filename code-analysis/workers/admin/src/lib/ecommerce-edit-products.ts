import type {
  AddProductValues,
  ProductEditorAssets,
} from "@/components/ecommerce/add-product";
import type { AddProduct2Values } from "@/components/ecommerce/add-product-2";

type EditableProductSeed = {
  slug: string;
  values: AddProductValues;
  assets: ProductEditorAssets;
};

type CreateProductSeedInput = {
  name: string;
  sku: string;
  barcode?: string;
  description?: string;
  vendor?: string;
  basePrice: string;
  discountedPrice?: string;
  currency?: AddProductValues["currency"];
  chargeTax?: boolean;
  inStock?: boolean;
  status?: AddProductValues["status"];
  category: string;
  subcategory: string;
  tags?: string;
  variants: AddProductValues["variants"];
  assets: ProductEditorAssets;
};

function createProductSeed({
  name,
  sku,
  barcode,
  description,
  vendor = "Acme Retail",
  basePrice,
  discountedPrice = "",
  currency = "USD",
  chargeTax = true,
  inStock = true,
  status = "active",
  category,
  subcategory,
  tags,
  variants,
  assets,
}: CreateProductSeedInput): EditableProductSeed {
  const slug = slugifyProductName(name);

  return {
    slug,
    values: {
      name,
      sku,
      barcode: barcode ?? "",
      description: description ?? "",
      vendor,
      basePrice,
      discountedPrice,
      currency,
      chargeTax,
      inStock,
      status,
      category,
      subcategory,
      tags,
      variants,
    },
    assets,
  };
}

export function slugifyProductName(productName: string) {
  return productName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getProductEditHref(productName: string) {
  return `/ecommerce/edit-product/${slugifyProductName(productName)}`;
}

export function getProductEdit2Href(productName: string) {
  return `/ecommerce/edit-product-2/${slugifyProductName(productName)}`;
}

export function getProductDetailHref(productName: string) {
  return `/ecommerce/product-detail/${slugifyProductName(productName)}`;
}

const editableProductSeeds: EditableProductSeed[] = [
  createProductSeed({
    name: "Radiance Ritual Set",
    sku: "SKU-SKIN-4006",
    barcode: "0123456789001",
    description:
      "A bestselling ritual bundle with cleanser, serum, and moisturizer for daily glow maintenance.",
    basePrice: "389.00",
    discountedPrice: "349.00",
    category: "wellness",
    subcategory: "bundles",
    tags: "hero launch, bestseller, ritual set",
    assets: {
      thumbnail:
        "/images/block/ecommerce/skin-care-product/pexels-amelie-chen-243775000-12352170-3.jpg",
      gallery: [
        "/images/block/ecommerce/skin-care-product/pexels-amelie-chen-243775000-12352170-3.jpg",
        "/images/block/ecommerce/skin-care-product/kadarius-seegars-Mxy5gokl8mE-unsplash-3.jpg",
        "/images/block/ecommerce/skin-care-product/nora-hutton-AjU6Z5k_uBI-unsplash-3.jpg",
        "/images/block/ecommerce/skin-care-product/pexels-karolina-grabowska-4938448-3.jpg",
      ],
    },
    variants: [
      {
        option: "bundle",
        value: "3-piece set",
        price: "389.00",
        quantity: "48",
      },
      { option: "size", value: "Travel trio", price: "179.00", quantity: "18" },
    ],
  }),
  createProductSeed({
    name: "Timeless Renewal Cream",
    sku: "SKU-CREAM-9902",
    barcode: "0123456789002",
    description:
      "A rich barrier-support cream designed for overnight moisture recovery and visible smoothing.",
    basePrice: "199.00",
    discountedPrice: "",
    category: "skin-care",
    subcategory: "creams",
    tags: "night care, premium, renewal",
    assets: {
      thumbnail:
        "/images/block/ecommerce/skin-care-product/pexels-carlos-diaz-216017-18350286-3.jpg",
      gallery: [
        "/images/block/ecommerce/skin-care-product/pexels-carlos-diaz-216017-18350286-3.jpg",
        "/images/block/ecommerce/skin-care-product/pexels-volkerthimm-19049367-3.jpg",
        "/images/block/ecommerce/skin-care-product/pexels-karolina-grabowska-4938448-3.jpg",
        "/images/block/ecommerce/skin-care-product/pexels-amelie-chen-243775000-12352170-3.jpg",
      ],
    },
    variants: [
      { option: "size", value: "50 ml", price: "199.00", quantity: "32" },
      { option: "bundle", value: "Duo pack", price: "369.00", quantity: "12" },
    ],
  }),
  createProductSeed({
    name: "Radiant Lock Mist",
    sku: "SKU-SERUM-7811",
    barcode: "0123456789003",
    description:
      "A lightweight finishing mist that locks hydration in and keeps makeup fresh through the day.",
    basePrice: "69.00",
    discountedPrice: "59.00",
    category: "skin-care",
    subcategory: "serums",
    tags: "mist, daily care, hydration",
    assets: {
      thumbnail:
        "/images/block/ecommerce/skin-care-product/pexels-rdne-8903695-3.jpg",
      gallery: [
        "/images/block/ecommerce/skin-care-product/pexels-rdne-8903695-3.jpg",
        "/images/block/ecommerce/skin-care-product/nora-hutton-AjU6Z5k_uBI-unsplash-3.jpg",
        "/images/block/ecommerce/skin-care-product/kadarius-seegars-Mxy5gokl8mE-unsplash-3.jpg",
        "/images/block/ecommerce/skin-care-product/pexels-volkerthimm-19049367-3.jpg",
      ],
    },
    variants: [
      { option: "size", value: "100 ml", price: "69.00", quantity: "67" },
      { option: "bundle", value: "Twin pack", price: "129.00", quantity: "20" },
    ],
  }),
  createProductSeed({
    name: "HydraBloom Night Cream",
    sku: "SKU-BALM-8928",
    barcode: "0123456789004",
    description:
      "An intensive overnight cream built for deep hydration and calm, softened skin by morning.",
    basePrice: "99.00",
    discountedPrice: "",
    status: "draft",
    category: "skin-care",
    subcategory: "creams",
    tags: "night care, hydration, draft",
    assets: {
      thumbnail:
        "/images/block/ecommerce/skin-care-product/pexels-volkerthimm-19049367-3.jpg",
      gallery: [
        "/images/block/ecommerce/skin-care-product/pexels-volkerthimm-19049367-3.jpg",
        "/images/block/ecommerce/skin-care-product/pexels-carlos-diaz-216017-18350286-3.jpg",
        "/images/block/ecommerce/skin-care-product/pexels-karolina-grabowska-4938448-3.jpg",
        "/images/block/ecommerce/skin-care-product/pexels-amelie-chen-243775000-12352170-3.jpg",
      ],
    },
    variants: [
      { option: "size", value: "60 ml", price: "99.00", quantity: "24" },
      {
        option: "bundle",
        value: "Starter duo",
        price: "184.00",
        quantity: "8",
      },
    ],
  }),
  createProductSeed({
    name: "PureEssence Soap Trio",
    sku: "SKU-SOAP-5214",
    barcode: "0123456789005",
    description:
      "A handcrafted cleansing trio with gentle exfoliation and a soft botanical finish.",
    basePrice: "59.00",
    discountedPrice: "",
    status: "draft",
    category: "wellness",
    subcategory: "bundles",
    tags: "soap trio, giftable, draft",
    assets: {
      thumbnail:
        "/images/block/ecommerce/skin-care-product/pexels-shkrabaanthony-6187540-3.jpg",
      gallery: [
        "/images/block/ecommerce/skin-care-product/pexels-shkrabaanthony-6187540-3.jpg",
        "/images/block/ecommerce/skin-care-product/pexels-amelie-chen-243775000-12352170-3.jpg",
        "/images/block/ecommerce/skin-care-product/kadarius-seegars-Mxy5gokl8mE-unsplash-3.jpg",
        "/images/block/ecommerce/skin-care-product/nora-hutton-AjU6Z5k_uBI-unsplash-3.jpg",
      ],
    },
    variants: [
      { option: "bundle", value: "3-bar set", price: "59.00", quantity: "81" },
      {
        option: "scent",
        value: "Botanical blend",
        price: "59.00",
        quantity: "24",
      },
    ],
  }),
  createProductSeed({
    name: "Radiance Boost Serum",
    sku: "SKU-SERUM-6604",
    barcode: "0123456789006",
    description:
      "A brightening serum with a fast-absorbing finish for dull, uneven skin tone.",
    basePrice: "199.00",
    discountedPrice: "174.00",
    category: "skin-care",
    subcategory: "serums",
    tags: "serum, brightening, hero launch",
    assets: {
      thumbnail:
        "/images/block/ecommerce/skin-care-product/kadarius-seegars-Mxy5gokl8mE-unsplash-3.jpg",
      gallery: [
        "/images/block/ecommerce/skin-care-product/kadarius-seegars-Mxy5gokl8mE-unsplash-3.jpg",
        "/images/block/ecommerce/skin-care-product/pexels-rdne-8903695-3.jpg",
        "/images/block/ecommerce/skin-care-product/nora-hutton-AjU6Z5k_uBI-unsplash-3.jpg",
        "/images/block/ecommerce/skin-care-product/pexels-karolina-grabowska-4938448-3.jpg",
      ],
    },
    variants: [
      { option: "size", value: "30 ml", price: "199.00", quantity: "19" },
      {
        option: "bundle",
        value: "Treatment duo",
        price: "379.00",
        quantity: "6",
      },
    ],
  }),
  createProductSeed({
    name: "Barrier Repair Drops",
    sku: "SKU-TREAT-6612",
    barcode: "0123456789007",
    description:
      "A concentrated treatment that supports compromised skin barriers with nourishing oils and ceramides.",
    basePrice: "84.00",
    discountedPrice: "",
    category: "skin-care",
    subcategory: "serums",
    tags: "treatment, barrier support, repair",
    assets: {
      thumbnail:
        "/images/block/ecommerce/skin-care-product/pexels-karolina-grabowska-4938448-3.jpg",
      gallery: [
        "/images/block/ecommerce/skin-care-product/pexels-karolina-grabowska-4938448-3.jpg",
        "/images/block/ecommerce/skin-care-product/kadarius-seegars-Mxy5gokl8mE-unsplash-3.jpg",
        "/images/block/ecommerce/skin-care-product/nora-hutton-AjU6Z5k_uBI-unsplash-3.jpg",
        "/images/block/ecommerce/skin-care-product/pexels-rdne-8903695-3.jpg",
      ],
    },
    variants: [
      { option: "size", value: "30 ml", price: "84.00", quantity: "12" },
      {
        option: "bundle",
        value: "Recovery kit",
        price: "154.00",
        quantity: "5",
      },
    ],
  }),
  createProductSeed({
    name: "Dew Reset Essence",
    sku: "SKU-ESSN-2084",
    barcode: "0123456789008",
    description:
      "A plumping essence that layers easily under serums for all-day softness and bounce.",
    basePrice: "74.00",
    discountedPrice: "",
    category: "skin-care",
    subcategory: "serums",
    tags: "essence, layering, hydration",
    assets: {
      thumbnail:
        "/images/block/ecommerce/skin-care-product/nora-hutton-AjU6Z5k_uBI-unsplash-3.jpg",
      gallery: [
        "/images/block/ecommerce/skin-care-product/nora-hutton-AjU6Z5k_uBI-unsplash-3.jpg",
        "/images/block/ecommerce/skin-care-product/pexels-rdne-8903695-3.jpg",
        "/images/block/ecommerce/skin-care-product/kadarius-seegars-Mxy5gokl8mE-unsplash-3.jpg",
        "/images/block/ecommerce/skin-care-product/pexels-karolina-grabowska-4938448-3.jpg",
      ],
    },
    variants: [
      { option: "size", value: "120 ml", price: "74.00", quantity: "55" },
      {
        option: "bundle",
        value: "Refill duo",
        price: "139.00",
        quantity: "14",
      },
    ],
  }),
  createProductSeed({
    name: "Velvet Cleanse Balm",
    sku: "SKU-CLEAN-1148",
    barcode: "0123456789009",
    description:
      "A melting cleansing balm that removes sunscreen and makeup without stripping moisture.",
    basePrice: "64.00",
    discountedPrice: "",
    status: "draft",
    category: "skin-care",
    subcategory: "cleansers",
    tags: "cleanser, balm, draft",
    assets: {
      thumbnail:
        "/images/block/ecommerce/skin-care-product/pexels-amelie-chen-243775000-12352170-3.jpg",
      gallery: [
        "/images/block/ecommerce/skin-care-product/pexels-amelie-chen-243775000-12352170-3.jpg",
        "/images/block/ecommerce/skin-care-product/pexels-carlos-diaz-216017-18350286-3.jpg",
        "/images/block/ecommerce/skin-care-product/pexels-volkerthimm-19049367-3.jpg",
        "/images/block/ecommerce/skin-care-product/pexels-karolina-grabowska-4938448-3.jpg",
      ],
    },
    variants: [
      { option: "size", value: "90 g", price: "64.00", quantity: "38" },
      {
        option: "bundle",
        value: "Double cleanse set",
        price: "118.00",
        quantity: "10",
      },
    ],
  }),
  createProductSeed({
    name: "Overnight Recovery Mask",
    sku: "SKU-MASK-5501",
    barcode: "0123456789010",
    description:
      "A leave-on treatment mask that restores hydration and smoothness while you sleep.",
    basePrice: "112.00",
    discountedPrice: "",
    category: "skin-care",
    subcategory: "creams",
    tags: "mask, overnight, recovery",
    assets: {
      thumbnail:
        "/images/block/ecommerce/skin-care-product/pexels-carlos-diaz-216017-18350286-3.jpg",
      gallery: [
        "/images/block/ecommerce/skin-care-product/pexels-carlos-diaz-216017-18350286-3.jpg",
        "/images/block/ecommerce/skin-care-product/pexels-volkerthimm-19049367-3.jpg",
        "/images/block/ecommerce/skin-care-product/pexels-amelie-chen-243775000-12352170-3.jpg",
        "/images/block/ecommerce/skin-care-product/pexels-karolina-grabowska-4938448-3.jpg",
      ],
    },
    variants: [
      { option: "size", value: "75 ml", price: "112.00", quantity: "21" },
      {
        option: "bundle",
        value: "Weekly reset duo",
        price: "209.00",
        quantity: "7",
      },
    ],
  }),
  createProductSeed({
    name: "Daily Barrier Lotion",
    sku: "SKU-LOTION-3204",
    barcode: "0123456789011",
    description:
      "A fast-absorbing lotion made for daily protection, comfort, and lightweight nourishment.",
    basePrice: "58.00",
    discountedPrice: "",
    category: "body-care",
    subcategory: "lotions",
    tags: "daily use, barrier, lotion",
    assets: {
      thumbnail:
        "/images/block/ecommerce/skin-care-product/pexels-karolina-grabowska-4938448-3.jpg",
      gallery: [
        "/images/block/ecommerce/skin-care-product/pexels-karolina-grabowska-4938448-3.jpg",
        "/images/block/ecommerce/skin-care-product/pexels-shkrabaanthony-6187540-3.jpg",
        "/images/block/ecommerce/skin-care-product/pexels-amelie-chen-243775000-12352170-3.jpg",
        "/images/block/ecommerce/skin-care-product/pexels-volkerthimm-19049367-3.jpg",
      ],
    },
    variants: [
      { option: "size", value: "200 ml", price: "58.00", quantity: "73" },
      {
        option: "bundle",
        value: "Family pack",
        price: "149.00",
        quantity: "16",
      },
    ],
  }),
  createProductSeed({
    name: "Cloud Silk Toner",
    sku: "SKU-TONER-7723",
    barcode: "0123456789012",
    description:
      "A softening toner that preps the skin with balanced hydration and a silky finish.",
    basePrice: "46.00",
    discountedPrice: "",
    category: "skin-care",
    subcategory: "cleansers",
    tags: "toner, prep, hydration",
    assets: {
      thumbnail:
        "/images/block/ecommerce/skin-care-product/pexels-volkerthimm-19049367-3.jpg",
      gallery: [
        "/images/block/ecommerce/skin-care-product/pexels-volkerthimm-19049367-3.jpg",
        "/images/block/ecommerce/skin-care-product/pexels-rdne-8903695-3.jpg",
        "/images/block/ecommerce/skin-care-product/nora-hutton-AjU6Z5k_uBI-unsplash-3.jpg",
        "/images/block/ecommerce/skin-care-product/pexels-amelie-chen-243775000-12352170-3.jpg",
      ],
    },
    variants: [
      { option: "size", value: "150 ml", price: "46.00", quantity: "64" },
      { option: "bundle", value: "Value duo", price: "84.00", quantity: "18" },
    ],
  }),
  createProductSeed({
    name: "Micro Peel Serum",
    sku: "SKU-SERUM-4412",
    barcode: "0123456789013",
    description:
      "A resurfacing serum with gentle peel benefits for smoother texture and brighter tone.",
    basePrice: "88.00",
    discountedPrice: "",
    category: "skin-care",
    subcategory: "serums",
    tags: "exfoliation, serum, resurfacing",
    assets: {
      thumbnail:
        "/images/block/ecommerce/skin-care-product/pexels-rdne-8903695-3.jpg",
      gallery: [
        "/images/block/ecommerce/skin-care-product/pexels-rdne-8903695-3.jpg",
        "/images/block/ecommerce/skin-care-product/kadarius-seegars-Mxy5gokl8mE-unsplash-3.jpg",
        "/images/block/ecommerce/skin-care-product/nora-hutton-AjU6Z5k_uBI-unsplash-3.jpg",
        "/images/block/ecommerce/skin-care-product/pexels-karolina-grabowska-4938448-3.jpg",
      ],
    },
    variants: [
      { option: "size", value: "30 ml", price: "88.00", quantity: "29" },
      { option: "bundle", value: "Refine duo", price: "164.00", quantity: "9" },
    ],
  }),
  createProductSeed({
    name: "Botanical Body Polish",
    sku: "SKU-BODY-6118",
    barcode: "0123456789014",
    description:
      "A smoothing body polish with fine exfoliants and a clean botanical scent.",
    basePrice: "52.00",
    discountedPrice: "",
    status: "draft",
    category: "body-care",
    subcategory: "scrubs",
    tags: "body care, polish, exfoliation",
    assets: {
      thumbnail:
        "/images/block/ecommerce/skin-care-product/pexels-shkrabaanthony-6187540-3.jpg",
      gallery: [
        "/images/block/ecommerce/skin-care-product/pexels-shkrabaanthony-6187540-3.jpg",
        "/images/block/ecommerce/skin-care-product/pexels-karolina-grabowska-4938448-3.jpg",
        "/images/block/ecommerce/skin-care-product/pexels-amelie-chen-243775000-12352170-3.jpg",
        "/images/block/ecommerce/skin-care-product/pexels-volkerthimm-19049367-3.jpg",
      ],
    },
    variants: [
      { option: "size", value: "220 g", price: "52.00", quantity: "47" },
      { option: "bundle", value: "Spa duo", price: "96.00", quantity: "11" },
    ],
  }),
];

export function getEditableProductBySlug(slug: string) {
  return editableProductSeeds.find((product) => product.slug === slug);
}

function getWizardCategory(
  category: string,
): AddProduct2Values["productCategory"] {
  if (category === "wellness") return "wellness";
  if (category === "body-care") return "body-care";
  return "skin-care";
}

function getWizardProductType(
  variants: AddProductValues["variants"],
): AddProduct2Values["productType"] {
  return variants.some((variant) => variant.option === "bundle")
    ? "bundle-product"
    : "stocked-product";
}

function createStockLocations(
  totalQuantity: number,
): AddProduct2Values["stockLocations"] {
  if (totalQuantity <= 0) {
    return [{ location: "", quantity: "" }];
  }

  const sea = Math.max(Math.round(totalQuantity * 0.45), 1);
  const aus = Math.max(Math.round(totalQuantity * 0.3), 1);
  const chi = Math.max(totalQuantity - sea - aus, 1);

  return [
    { location: "sea", quantity: String(sea) },
    { location: "aus", quantity: String(aus) },
    { location: "chi", quantity: String(chi) },
  ];
}

function createReorderRules(
  totalQuantity: number,
): AddProduct2Values["reorderRules"] {
  if (totalQuantity <= 0) {
    return [];
  }

  return [
    {
      location: "sea",
      reorderPoint: String(Math.max(Math.round(totalQuantity * 0.2), 12)),
      reorderQuantity: String(Math.max(Math.round(totalQuantity * 0.5), 24)),
      method: "purchase-order",
    },
    {
      location: "aus",
      reorderPoint: String(Math.max(Math.round(totalQuantity * 0.12), 8)),
      reorderQuantity: String(Math.max(Math.round(totalQuantity * 0.3), 16)),
      method: "stock-transfer",
    },
  ];
}

export function getEditableProduct2BySlug(slug: string): {
  slug: string;
  values: AddProduct2Values;
  media: string[];
} | null {
  const product = getEditableProductBySlug(slug);

  if (!product) {
    return null;
  }

  const totalQuantity = product.values.variants.reduce(
    (sum, variant) => sum + Number(variant.quantity || 0),
    0,
  );

  return {
    slug: product.slug,
    media: product.assets.gallery,
    values: {
      returnableProduct: true,
      hasVariants: product.values.variants.length > 0,
      productName: product.values.name,
      productType: getWizardProductType(product.values.variants),
      productCategory: getWizardCategory(product.values.category),
      productSku: product.values.sku,
      barcode: product.values.barcode ?? "",
      description: product.values.description ?? "",
      retailPrice: product.values.basePrice,
      wholesalePrice:
        product.values.variants.find((variant) => variant.option === "bundle")
          ?.price ??
        product.values.discountedPrice ??
        product.values.basePrice,
      cost: String(
        Math.max(Math.round(Number(product.values.basePrice || 0) * 0.38), 0),
      ),
      currency: product.values.currency,
      chargeTax: product.values.chargeTax,
      publishNow: product.values.status === "active",
      totalQuantity: String(totalQuantity),
      stockLocations: createStockLocations(totalQuantity),
      reorderRules: createReorderRules(totalQuantity),
      measurementUnit:
        getWizardProductType(product.values.variants) === "bundle-product"
          ? "box"
          : "each",
      height: "18",
      heightUnit: "cm",
      width: "24",
      widthUnit: "cm",
      weight: totalQuantity > 40 ? "2.4" : "1.2",
      weightUnit: "kg",
      saleUom: {
        amount: "1",
        unit:
          getWizardProductType(product.values.variants) === "bundle-product"
            ? "box"
            : "each",
        equalsAmount:
          getWizardProductType(product.values.variants) === "bundle-product"
            ? "3"
            : "1",
        equalsUnit: "each",
      },
      purchaseUom: {
        amount: "1",
        unit: "carton",
        equalsAmount:
          getWizardProductType(product.values.variants) === "bundle-product"
            ? "6"
            : "12",
        equalsUnit:
          getWizardProductType(product.values.variants) === "bundle-product"
            ? "box"
            : "each",
      },
    },
  };
}
