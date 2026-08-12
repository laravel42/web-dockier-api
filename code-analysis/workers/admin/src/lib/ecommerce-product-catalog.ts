export type ListingStatus = "Active" | "Draft";
export type StockTone = "High" | "Low";
export type ProductType = "Retail" | "Wholesale";

export type ProductInventoryCard = {
  name: string;
  sku: string;
  image: string;
  status: ListingStatus;
  productType: ProductType;
  category: string;
  channels: string[];
  retail: string;
  wholesale: string;
  stock: number;
  variants: number;
  stockTone: StockTone;
  stockProgress: number;
};

export const inventoryCards: ProductInventoryCard[] = [
  {
    name: "Radiance Ritual Set",
    sku: "SKU-SKIN-4006",
    image:
      "/images/block/ecommerce/skin-care-product/pexels-amelie-chen-243775000-12352170-3.jpg",
    status: "Active",
    productType: "Retail",
    category: "Set",
    channels: ["Set", "Retail", "+2", "Dropship"],
    retail: "$180.00-$220.00",
    wholesale: "$100.00-$170.00",
    stock: 210,
    variants: 6,
    stockTone: "High",
    stockProgress: 76,
  },
  {
    name: "Timeless Renewal Cream",
    sku: "SKU-CREAM-9902",
    image:
      "/images/block/ecommerce/skin-care-product/pexels-carlos-diaz-216017-18350286-3.jpg",
    status: "Active",
    productType: "Retail",
    category: "Cream",
    channels: ["Cream", "Premium", "Inventory"],
    retail: "$120.00",
    wholesale: "$80.00",
    stock: 12,
    variants: 3,
    stockTone: "Low",
    stockProgress: 12,
  },
  {
    name: "HydraBloom Night Cream",
    sku: "SKU-BALM-8928",
    image:
      "/images/block/ecommerce/skin-care-product/pexels-volkerthimm-19049367-3.jpg",
    status: "Draft",
    productType: "Wholesale",
    category: "Cream",
    channels: ["Cream", "Retail", "+2", "Dropship"],
    retail: "$180.00",
    wholesale: "$100.00",
    stock: 341,
    variants: 9,
    stockTone: "High",
    stockProgress: 92,
  },
  {
    name: "Radiant Lock Mist",
    sku: "SKU-SERUM-7811",
    image:
      "/images/block/ecommerce/skin-care-product/pexels-rdne-8903695-3.jpg",
    status: "Active",
    productType: "Retail",
    category: "Serum",
    channels: ["Serum", "Retail", "Inventory"],
    retail: "$69.00",
    wholesale: "$39.00",
    stock: 67,
    variants: 4,
    stockTone: "High",
    stockProgress: 54,
  },
  {
    name: "PureEssence Soap Trio",
    sku: "SKU-SOAP-5214",
    image:
      "/images/block/ecommerce/skin-care-product/pexels-shkrabaanthony-6187540-3.jpg",
    status: "Draft",
    productType: "Wholesale",
    category: "Soap",
    channels: ["Soap", "Bundles", "+1"],
    retail: "$59.00",
    wholesale: "$36.00",
    stock: 28,
    variants: 2,
    stockTone: "Low",
    stockProgress: 22,
  },
  {
    name: "Barrier Repair Drops",
    sku: "SKU-TREAT-6612",
    image:
      "/images/block/ecommerce/skin-care-product/pexels-karolina-grabowska-4938448-3.jpg",
    status: "Active",
    productType: "Retail",
    category: "Treatment",
    channels: ["Treatment", "Retail", "Subscription"],
    retail: "$84.00",
    wholesale: "$52.00",
    stock: 96,
    variants: 5,
    stockTone: "High",
    stockProgress: 61,
  },
  {
    name: "Dew Reset Essence",
    sku: "SKU-ESSN-2084",
    image:
      "/images/block/ecommerce/skin-care-product/nora-hutton-AjU6Z5k_uBI-unsplash-3.jpg",
    status: "Active",
    productType: "Retail",
    category: "Essence",
    channels: ["Essence", "Retail", "Subscription"],
    retail: "$74.00",
    wholesale: "$44.00",
    stock: 55,
    variants: 4,
    stockTone: "High",
    stockProgress: 48,
  },
  {
    name: "Velvet Cleanse Balm",
    sku: "SKU-CLEAN-1148",
    image:
      "/images/block/ecommerce/skin-care-product/pexels-amelie-chen-243775000-12352170-3.jpg",
    status: "Draft",
    productType: "Wholesale",
    category: "Cleanser",
    channels: ["Cleanser", "Bundle", "+1"],
    retail: "$64.00",
    wholesale: "$36.00",
    stock: 38,
    variants: 2,
    stockTone: "Low",
    stockProgress: 30,
  },
  {
    name: "Overnight Recovery Mask",
    sku: "SKU-MASK-5501",
    image:
      "/images/block/ecommerce/skin-care-product/pexels-carlos-diaz-216017-18350286-3.jpg",
    status: "Active",
    productType: "Retail",
    category: "Mask",
    channels: ["Mask", "Premium", "Inventory"],
    retail: "$112.00",
    wholesale: "$72.00",
    stock: 21,
    variants: 3,
    stockTone: "Low",
    stockProgress: 18,
  },
  {
    name: "Cloud Silk Toner",
    sku: "SKU-TONER-7723",
    image:
      "/images/block/ecommerce/skin-care-product/pexels-volkerthimm-19049367-3.jpg",
    status: "Active",
    productType: "Retail",
    category: "Toner",
    channels: ["Toner", "Retail", "+2", "Dropship"],
    retail: "$46.00",
    wholesale: "$28.00",
    stock: 64,
    variants: 5,
    stockTone: "High",
    stockProgress: 58,
  },
  {
    name: "Micro Peel Serum",
    sku: "SKU-SERUM-4412",
    image:
      "/images/block/ecommerce/skin-care-product/pexels-rdne-8903695-3.jpg",
    status: "Active",
    productType: "Wholesale",
    category: "Serum",
    channels: ["Serum", "Premium", "Inventory"],
    retail: "$88.00",
    wholesale: "$54.00",
    stock: 29,
    variants: 3,
    stockTone: "Low",
    stockProgress: 26,
  },
  {
    name: "Botanical Body Polish",
    sku: "SKU-BODY-6118",
    image:
      "/images/block/ecommerce/skin-care-product/pexels-shkrabaanthony-6187540-3.jpg",
    status: "Draft",
    productType: "Wholesale",
    category: "Body Care",
    channels: ["Body Care", "Retail", "+1"],
    retail: "$52.00",
    wholesale: "$31.00",
    stock: 47,
    variants: 4,
    stockTone: "High",
    stockProgress: 43,
  },
];
