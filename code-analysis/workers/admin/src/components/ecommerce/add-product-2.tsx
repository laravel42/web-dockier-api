"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Boxes,
  Check,
  ChevronsUpDown,
  GalleryHorizontal,
  ImagePlus,
  Package2,
  Ruler,
  Truck,
  Upload,
  WalletCards,
  X,
} from "lucide-react";
import Image from "next/image";
import * as React from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const requiredString = (message: string, min = 1) =>
  z.string().min(min, message);

const locationRowSchema = z.object({
  location: requiredString("Select a location"),
  quantity: requiredString("Enter a quantity"),
});

const reorderRowSchema = z.object({
  location: requiredString("Select a location"),
  reorderPoint: requiredString("Enter a reorder point"),
  reorderQuantity: requiredString("Enter a reorder quantity"),
  method: requiredString("Choose a reorder method"),
});

const unitRatioSchema = z.object({
  amount: requiredString("Enter an amount"),
  unit: requiredString("Choose a unit"),
  equalsAmount: requiredString("Enter an amount"),
  equalsUnit: requiredString("Choose a unit"),
});

const formSchema = z.object({
  returnableProduct: z.boolean(),
  hasVariants: z.boolean(),
  productName: requiredString("Product name is required", 2),
  productType: requiredString("Select a product type"),
  productCategory: requiredString("Select a product category"),
  productSku: requiredString("SKU is required", 3),
  barcode: requiredString("Barcode is required", 3),
  description: requiredString("Add a short product description", 12),
  retailPrice: requiredString("Retail price is required"),
  wholesalePrice: requiredString("Wholesale price is required"),
  cost: requiredString("Cost is required"),
  currency: z.enum(["USD", "EUR", "GBP"]),
  chargeTax: z.boolean(),
  publishNow: z.boolean(),
  totalQuantity: requiredString("Total quantity is required"),
  stockLocations: z
    .array(locationRowSchema)
    .min(1, "Add at least one stock location"),
  reorderRules: z.array(reorderRowSchema),
  measurementUnit: requiredString("Select a unit"),
  height: requiredString("Height is required"),
  heightUnit: requiredString("Choose a height unit"),
  width: requiredString("Width is required"),
  widthUnit: requiredString("Choose a width unit"),
  weight: requiredString("Weight is required"),
  weightUnit: requiredString("Choose a weight unit"),
  saleUom: unitRatioSchema,
  purchaseUom: unitRatioSchema,
});

type AddProduct2Values = z.infer<typeof formSchema>;

type ProductStepId = "basics" | "pricing" | "inventory" | "measurements";

type MediaPreviewItem = {
  id: string;
  src: string;
};

type ProductDraftSnapshot = {
  formData: AddProduct2Values;
  currentStep: ProductStepId;
  completedSteps: ProductStepId[];
  lastSavedAt: number | null;
};

const MAX_GALLERY_ITEMS = 5;
const sampleMediaItems: MediaPreviewItem[] = [
  {
    id: "sample-media-1",
    src: "/images/block/ecommerce/skin-care-product/pexels-amelie-chen-243775000-12352170-3.jpg",
  },
  {
    id: "sample-media-2",
    src: "/images/block/ecommerce/skin-care-product/kadarius-seegars-Mxy5gokl8mE-unsplash-3.jpg",
  },
  {
    id: "sample-media-3",
    src: "/images/block/ecommerce/skin-care-product/nora-hutton-AjU6Z5k_uBI-unsplash-3.jpg",
  },
];

const defaultValues: AddProduct2Values = {
  returnableProduct: true,
  hasVariants: false,
  productName: "",
  productType: "",
  productCategory: "",
  productSku: "",
  barcode: "",
  description: "",
  retailPrice: "",
  wholesalePrice: "",
  cost: "",
  currency: "USD",
  chargeTax: false,
  publishNow: false,
  totalQuantity: "",
  stockLocations: [{ location: "", quantity: "" }],
  reorderRules: [],
  measurementUnit: "",
  height: "",
  heightUnit: "cm",
  width: "",
  widthUnit: "cm",
  weight: "",
  weightUnit: "kg",
  saleUom: {
    amount: "1",
    unit: "",
    equalsAmount: "1",
    equalsUnit: "",
  },
  purchaseUom: {
    amount: "1",
    unit: "",
    equalsAmount: "1",
    equalsUnit: "",
  },
};

const sampleStepValues: Record<ProductStepId, Partial<AddProduct2Values>> = {
  basics: {
    returnableProduct: true,
    hasVariants: true,
    productName: "Radiance Ritual Set",
    productType: "bundle-product",
    productCategory: "skin-care",
    productSku: "SKU-RITUAL-1006",
    barcode: "0123456789001",
    description:
      "A daily glow set with cleanser, serum, and moisturizer arranged for hero merchandising and starter routines.",
  },
  pricing: {
    retailPrice: "389.00",
    wholesalePrice: "249.00",
    cost: "148.00",
    currency: "USD",
    chargeTax: true,
    publishNow: true,
  },
  inventory: {
    totalQuantity: "168",
    stockLocations: [
      { location: "sea", quantity: "72" },
      { location: "aus", quantity: "48" },
      { location: "mia", quantity: "48" },
    ],
    reorderRules: [
      {
        location: "sea",
        reorderPoint: "40",
        reorderQuantity: "120",
        method: "purchase-order",
      },
      {
        location: "aus",
        reorderPoint: "24",
        reorderQuantity: "80",
        method: "stock-transfer",
      },
    ],
  },
  measurements: {
    measurementUnit: "box",
    height: "18",
    heightUnit: "cm",
    width: "24",
    widthUnit: "cm",
    weight: "2.4",
    weightUnit: "kg",
    saleUom: {
      amount: "1",
      unit: "box",
      equalsAmount: "3",
      equalsUnit: "each",
    },
    purchaseUom: {
      amount: "1",
      unit: "carton",
      equalsAmount: "6",
      equalsUnit: "box",
    },
  },
};

const productTypeOptions = [
  { value: "stocked-product", label: "Stocked product" },
  { value: "serialized-product", label: "Serialized product" },
  { value: "bundle-product", label: "Bundle product" },
];

const productCategoryOptions = [
  { value: "skin-care", label: "Skincare" },
  { value: "wellness", label: "Wellness" },
  { value: "body-care", label: "Body Care" },
  { value: "female-shoes", label: "Female Shoes" },
  { value: "male-shoes", label: "Male Shoes" },
  { value: "sportswear", label: "Sportswear" },
];

const locationOptions = [
  { value: "sea", label: "Seattle" },
  { value: "aus", label: "Austin" },
  { value: "chi", label: "Chicago" },
  { value: "mia", label: "Miami" },
];

const reorderMethodOptions = [
  { value: "purchase-order", label: "Purchase order" },
  { value: "stock-transfer", label: "Stock transfer" },
  { value: "vendor-request", label: "Vendor request" },
];

const measurementUnitOptions = [
  { value: "each", label: "Each" },
  { value: "pair", label: "Pair" },
  { value: "box", label: "Box" },
  { value: "carton", label: "Carton" },
];

const dimensionUnitOptions = [
  { value: "cm", label: "cm" },
  { value: "in", label: "in" },
];

const weightUnitOptions = [
  { value: "kg", label: "kg" },
  { value: "lb", label: "lb" },
];

const stepConfig = [
  {
    id: "basics",
    stepLabel: "Step 1",
    label: "Product Basics",
    description: "Identity, type, description, and gallery.",
    icon: Package2,
  },
  {
    id: "pricing",
    stepLabel: "Step 2",
    label: "Pricing Model",
    description: "Retail, wholesale, cost, and launch readiness.",
    icon: WalletCards,
  },
  {
    id: "inventory",
    stepLabel: "Step 3",
    label: "Inventory Rules",
    description: "Location counts and replenishment thresholds.",
    icon: Boxes,
  },
  {
    id: "measurements",
    stepLabel: "Step 4",
    label: "Dimensions & Units",
    description: "Physical footprint and sales-unit relationships.",
    icon: Ruler,
  },
] as const satisfies ReadonlyArray<{
  id: ProductStepId;
  stepLabel: string;
  label: string;
  description: string;
  icon: React.ComponentType<React.ComponentProps<"svg">>;
}>;

const stepFieldMap: Record<ProductStepId, (keyof AddProduct2Values)[]> = {
  basics: [
    "productName",
    "productType",
    "productCategory",
    "productSku",
    "barcode",
    "description",
  ],
  pricing: [
    "retailPrice",
    "wholesalePrice",
    "cost",
    "currency",
    "chargeTax",
    "publishNow",
  ],
  inventory: ["totalQuantity", "stockLocations", "reorderRules"],
  measurements: [
    "measurementUnit",
    "height",
    "heightUnit",
    "width",
    "widthUnit",
    "weight",
    "weightUnit",
    "saleUom",
    "purchaseUom",
  ],
};

const stepSchemas = {
  basics: formSchema.pick({
    productName: true,
    productType: true,
    productCategory: true,
    productSku: true,
    barcode: true,
    description: true,
  }),
  pricing: formSchema.pick({
    retailPrice: true,
    wholesalePrice: true,
    cost: true,
    currency: true,
    chargeTax: true,
    publishNow: true,
  }),
  inventory: formSchema.pick({
    totalQuantity: true,
    stockLocations: true,
    reorderRules: true,
  }),
  measurements: formSchema.pick({
    measurementUnit: true,
    height: true,
    heightUnit: true,
    width: true,
    widthUnit: true,
    weight: true,
    weightUnit: true,
    saleUom: true,
    purchaseUom: true,
  }),
} as const;

function cloneValues(values: AddProduct2Values): AddProduct2Values {
  return {
    ...values,
    stockLocations: values.stockLocations.map((row) => ({ ...row })),
    reorderRules: values.reorderRules.map((row) => ({ ...row })),
    saleUom: { ...values.saleUom },
    purchaseUom: { ...values.purchaseUom },
  };
}

function formatMoney(value: string, currency: AddProduct2Values["currency"]) {
  const numericValue = Number(value || 0);

  if (!Number.isFinite(numericValue)) {
    return `${currency} 0.00`;
  }

  return `${currency} ${numericValue.toFixed(2)}`;
}

function formatSavedTime(timestamp: number | null) {
  if (!timestamp) return null;

  return new Date(timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function normalizeDraftValues(
  input?: Partial<AddProduct2Values> | null,
): AddProduct2Values {
  return {
    ...cloneValues(defaultValues),
    ...input,
    stockLocations:
      input?.stockLocations && input.stockLocations.length > 0
        ? input.stockLocations.map((row) => ({
            location: row.location ?? "",
            quantity: row.quantity ?? "",
          }))
        : cloneValues(defaultValues).stockLocations,
    reorderRules:
      input?.reorderRules?.map((row) => ({
        location: row.location ?? "",
        reorderPoint: row.reorderPoint ?? "",
        reorderQuantity: row.reorderQuantity ?? "",
        method: row.method ?? "",
      })) ?? [],
    saleUom: {
      ...defaultValues.saleUom,
      ...input?.saleUom,
    },
    purchaseUom: {
      ...defaultValues.purchaseUom,
      ...input?.purchaseUom,
    },
  };
}

function isStepComplete(step: ProductStepId, values: AddProduct2Values) {
  return stepSchemas[step].safeParse(values).success;
}

function revalidateCompletedSteps(
  completedSteps: ProductStepId[],
  values: AddProduct2Values,
) {
  return completedSteps.filter((step) => isStepComplete(step, values));
}

function StepSidebar({
  currentStep,
  completedSteps,
  stepErrors,
  onStepClick,
  canNavigateToStep,
  progress,
  lastSavedAt,
  isSavingDraft,
  onReset,
  resetLabel,
  resetDescription,
  statusSavedLabel,
  statusIdleLabel,
}: {
  currentStep: ProductStepId;
  completedSteps: ProductStepId[];
  stepErrors: Record<ProductStepId, boolean>;
  onStepClick: (step: ProductStepId) => void;
  canNavigateToStep: (step: ProductStepId) => boolean;
  progress: number;
  lastSavedAt: number | null;
  isSavingDraft: boolean;
  onReset: () => void;
  resetLabel: string;
  resetDescription: string;
  statusSavedLabel: string;
  statusIdleLabel: string;
}) {
  const savedTime = formatSavedTime(lastSavedAt);

  return (
    <div className="flex flex-col">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Progress</span>
          <span className="font-medium">{progress}%</span>
        </div>
        <Progress value={progress} className="h-2" />
        <div className="text-muted-foreground flex items-center justify-between text-xs">
          <span>
            {completedSteps.length} of {stepConfig.length} steps complete
          </span>
          <span>
            {isSavingDraft
              ? "Saving..."
              : savedTime
                ? statusSavedLabel
                : statusIdleLabel}
          </span>
        </div>
      </div>

      <nav aria-label="Product form steps" className="mt-6 flex flex-col gap-3">
        {stepConfig.map((step, index) => {
          const Icon = step.icon;
          const isCurrent = currentStep === step.id;
          const isCompleted = completedSteps.includes(step.id);
          const hasError = stepErrors[step.id];
          const isClickable = canNavigateToStep(step.id);

          return (
            <div key={step.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  className={cn(
                    "flex size-9 items-center justify-center rounded-full border transition-colors",
                    isCurrent &&
                      "border-primary bg-primary text-primary-foreground",
                    isCompleted &&
                      !isCurrent &&
                      "border-primary/20 bg-primary/10 text-primary",
                    hasError &&
                      "border-destructive bg-destructive/10 text-destructive",
                    !isCurrent &&
                      !isCompleted &&
                      !hasError &&
                      "text-muted-foreground bg-background",
                    !isClickable && !isCurrent && "opacity-60",
                  )}
                  onClick={() => onStepClick(step.id)}
                  disabled={!isClickable}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  {isCompleted && !hasError ? <Check /> : <Icon />}
                </button>
                {index < stepConfig.length - 1 ? (
                  <div
                    className={cn(
                      "mt-2 h-8 w-px",
                      isCompleted || isCurrent ? "bg-primary/40" : "bg-border",
                    )}
                  />
                ) : null}
              </div>

              <button
                type="button"
                className={cn(
                  "flex min-w-0 flex-1 flex-col items-start rounded-xl px-1 py-1 text-left transition-colors",
                  isClickable ? "hover:text-foreground" : "cursor-not-allowed",
                )}
                onClick={() => onStepClick(step.id)}
                disabled={!isClickable}
              >
                <span className="text-muted-foreground text-[11px] font-medium tracking-[0.22em] uppercase">
                  {step.stepLabel}
                </span>
                <span
                  className={cn(
                    "text-sm font-medium",
                    isCurrent ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {step.label}
                </span>
              </button>
            </div>
          );
        })}
      </nav>

      <div className="mt-6">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="outline" className="w-full">
              {resetLabel}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{resetLabel}?</AlertDialogTitle>
              <AlertDialogDescription>
                {resetDescription}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onReset}>Reset</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

function MobileProgress({
  currentStep,
  progress,
}: {
  currentStep: ProductStepId;
  progress: number;
}) {
  const currentStepConfig =
    stepConfig.find((step) => step.id === currentStep) ?? stepConfig[0];
  return (
    <Card className="rounded-3xl xl:hidden">
      <CardContent className="flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">{currentStepConfig.label}</p>
            <p className="text-muted-foreground text-sm">
              {currentStepConfig.stepLabel}
            </p>
          </div>
          <Badge variant="secondary">{progress}%</Badge>
        </div>
        <Progress value={progress} className="h-2" />
      </CardContent>
    </Card>
  );
}

function MediaUploader({
  items,
  inputRef,
  onInputChange,
  onRemove,
}: {
  items: MediaPreviewItem[];
  inputRef: React.RefObject<HTMLInputElement | null>;
  onInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <input
        ref={inputRef}
        id="product-2-media-upload"
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={onInputChange}
      />

      {items.length > 0 ? (
        <div className="flex flex-wrap gap-3">
          {items.map((image, index) => (
            <div
              key={image.id}
              className={cn(
                "bg-muted/30 relative aspect-square w-[calc(50%-0.375rem)] overflow-hidden rounded-2xl border sm:w-40 md:w-44",
                index === 0 && "border-primary/40 ring-primary/15 ring-1",
              )}
            >
              <Image
                src={image.src}
                alt={`Product media ${index + 1}`}
                fill
                sizes="(min-width: 768px) 176px, 45vw"
                className="object-cover"
              />
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute top-2 right-2 size-7 rounded-full shadow-sm"
                onClick={() => onRemove(image.id)}
              >
                <X />
              </Button>
              {index === 0 ? (
                <Badge className="absolute bottom-2 left-2">Thumbnail</Badge>
              ) : null}
            </div>
          ))}

          {items.length < MAX_GALLERY_ITEMS ? (
            <Button
              type="button"
              variant="ghost"
              className="border-muted-foreground/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground flex aspect-square h-auto w-[calc(50%-0.375rem)] flex-col gap-2 rounded-2xl border border-dashed sm:w-40 md:w-44"
              asChild
            >
              <label htmlFor="product-2-media-upload">
                <GalleryHorizontal />
                <span className="text-sm font-medium">Add images</span>
              </label>
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-4 rounded-[28px] border border-dashed px-6 py-12 text-center">
          <div className="bg-muted flex size-14 items-center justify-center rounded-full border">
            <ImagePlus className="text-muted-foreground size-6" />
          </div>
          <div className="flex flex-col gap-1">
            <p className="font-medium">Add product imagery</p>
            <p className="text-muted-foreground text-sm">
              Start with one clean thumbnail, then layer in secondary angles for
              merchandising and catalog QA.
            </p>
          </div>
          <Button type="button" variant="outline" asChild>
            <label htmlFor="product-2-media-upload">
              <Upload data-icon="inline-start" />
              Select images
            </label>
          </Button>
        </div>
      )}
    </div>
  );
}

function StepSectionIntro({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-1 px-1">
      <h2 className="text-foreground text-2xl font-semibold tracking-tight">
        {title}
      </h2>
      <p className="text-muted-foreground text-base">{description}</p>
    </div>
  );
}

function RatioField({
  prefix,
  label,
  control,
}: {
  prefix: "saleUom" | "purchaseUom";
  label: string;
  control: ReturnType<typeof useForm<AddProduct2Values>>["control"];
}) {
  return (
    <div className="rounded-[24px] border p-4">
      <div className="mb-4 flex flex-col gap-1">
        <p className="font-medium">{label}</p>
        <p className="text-muted-foreground text-sm">
          Define how inventory converts between packed and sellable units.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,120px)_minmax(0,1fr)_auto_minmax(0,120px)_minmax(0,1fr)]">
        <Controller
          control={control}
          name={`${prefix}.amount`}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${prefix}-amount`}>Qty</FieldLabel>
              <Input
                {...field}
                id={`${prefix}-amount`}
                aria-invalid={fieldState.invalid}
                inputMode="decimal"
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />

        <Controller
          control={control}
          name={`${prefix}.unit`}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${prefix}-unit`}>Unit</FieldLabel>
              <Select
                value={field.value || undefined}
                onValueChange={field.onChange}
              >
                <SelectTrigger
                  id={`${prefix}-unit`}
                  aria-invalid={fieldState.invalid}
                >
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {measurementUnitOptions.map((unit) => (
                      <SelectItem key={unit.value} value={unit.value}>
                        {unit.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />

        <div className="text-muted-foreground flex items-end justify-center pb-3 text-sm font-medium">
          =
        </div>

        <Controller
          control={control}
          name={`${prefix}.equalsAmount`}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${prefix}-equals-amount`}>Qty</FieldLabel>
              <Input
                {...field}
                id={`${prefix}-equals-amount`}
                aria-invalid={fieldState.invalid}
                inputMode="decimal"
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />

        <Controller
          control={control}
          name={`${prefix}.equalsUnit`}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${prefix}-equals-unit`}>Unit</FieldLabel>
              <Select
                value={field.value || undefined}
                onValueChange={field.onChange}
              >
                <SelectTrigger
                  id={`${prefix}-equals-unit`}
                  aria-invalid={fieldState.invalid}
                >
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {measurementUnitOptions.map((unit) => (
                      <SelectItem key={unit.value} value={unit.value}>
                        {unit.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      </div>
    </div>
  );
}

function buildInitialMediaItems(sources: string[]) {
  return sources.map((src, index) => ({
    id: `default-media-${index}`,
    src,
  }));
}

function getCompletedStepsForValues(values: AddProduct2Values) {
  return stepConfig
    .filter((step) => isStepComplete(step.id, values))
    .map((step) => step.id);
}

type ProductWizardMode = "add" | "edit";

function EcommerceProductWizard2({
  mode,
  initialValues,
  initialMediaSources,
  draftStorageKey,
}: {
  mode: ProductWizardMode;
  initialValues: AddProduct2Values;
  initialMediaSources?: string[];
  draftStorageKey: string;
}) {
  const normalizedInitialValues = React.useMemo(
    () => normalizeDraftValues(initialValues),
    [initialValues],
  );
  const initialCompletedSteps = React.useMemo(
    () => getCompletedStepsForValues(normalizedInitialValues),
    [normalizedInitialValues],
  );
  const initialMediaItems = React.useMemo(
    () => buildInitialMediaItems(initialMediaSources ?? []),
    [initialMediaSources],
  );

  const form = useForm<AddProduct2Values>({
    resolver: zodResolver(formSchema),
    defaultValues: cloneValues(normalizedInitialValues),
    mode: "onChange",
  });

  const thumbnailInputRef = React.useRef<HTMLInputElement>(null);
  const mediaItemsRef = React.useRef<MediaPreviewItem[]>([]);
  const saveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const autoSaveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const {
    fields: stockLocationFields,
    append: appendStockLocation,
    remove: removeStockLocation,
  } = useFieldArray({
    control: form.control,
    name: "stockLocations",
  });

  const {
    fields: reorderFields,
    append: appendReorderRule,
    remove: removeReorderRule,
  } = useFieldArray({
    control: form.control,
    name: "reorderRules",
  });

  const [currentStep, setCurrentStep] = React.useState<ProductStepId>("basics");
  const [completedSteps, setCompletedSteps] = React.useState<ProductStepId[]>(
    initialCompletedSteps,
  );
  const [isSavingDraft, setIsSavingDraft] = React.useState(false);
  const [lastSavedAt, setLastSavedAt] = React.useState<number | null>(null);
  const [isHydrated, setIsHydrated] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [mediaItems, setMediaItems] =
    React.useState<MediaPreviewItem[]>(initialMediaItems);

  const watchedValues = form.watch();
  const currentStepIndex = stepConfig.findIndex(
    (step) => step.id === currentStep,
  );
  const progress = Math.round(
    (completedSteps.length / stepConfig.length) * 100,
  );

  const retailPrice = Number(watchedValues.retailPrice || 0);
  const wholesalePrice = Number(watchedValues.wholesalePrice || 0);
  const cost = Number(watchedValues.cost || 0);
  const retailMargin =
    retailPrice > 0 ? ((retailPrice - cost) / retailPrice) * 100 : 0;
  const wholesaleMargin =
    wholesalePrice > 0 ? ((wholesalePrice - cost) / wholesalePrice) * 100 : 0;
  const totalAllocated = watchedValues.stockLocations.reduce(
    (sum, row) => sum + Number(row.quantity || 0),
    0,
  );

  const persistDraft = React.useCallback(
    (
      values: AddProduct2Values,
      nextStep = currentStep,
      nextCompletedSteps = completedSteps,
    ) => {
      const snapshot: ProductDraftSnapshot = {
        formData: normalizeDraftValues(values),
        currentStep: nextStep,
        completedSteps: revalidateCompletedSteps(nextCompletedSteps, values),
        lastSavedAt: Date.now(),
      };

      window.localStorage.setItem(draftStorageKey, JSON.stringify(snapshot));
      setCompletedSteps(snapshot.completedSteps);
      setLastSavedAt(snapshot.lastSavedAt);
      setIsSavingDraft(true);

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        setIsSavingDraft(false);
      }, 450);
    },
    [completedSteps, currentStep, draftStorageKey],
  );

  React.useEffect(() => {
    const rawDraft = window.localStorage.getItem(draftStorageKey);

    if (!rawDraft) {
      form.reset(cloneValues(normalizedInitialValues));
      setCompletedSteps(initialCompletedSteps);
      setCurrentStep("basics");
      setLastSavedAt(null);
      replaceMediaItems(initialMediaItems);
      setIsHydrated(true);
      return;
    }

    try {
      const parsedDraft = JSON.parse(rawDraft) as Partial<ProductDraftSnapshot>;
      const nextValues = normalizeDraftValues(parsedDraft.formData);
      form.reset(nextValues);
      setCompletedSteps(
        revalidateCompletedSteps(parsedDraft.completedSteps ?? [], nextValues),
      );
      setCurrentStep(
        stepConfig.some((step) => step.id === parsedDraft.currentStep)
          ? (parsedDraft.currentStep as ProductStepId)
          : "basics",
      );
      setLastSavedAt(parsedDraft.lastSavedAt ?? null);
    } catch {
      window.localStorage.removeItem(draftStorageKey);
    } finally {
      setIsHydrated(true);
    }
  }, [
    draftStorageKey,
    form,
    initialCompletedSteps,
    initialMediaItems,
    normalizedInitialValues,
  ]);

  React.useEffect(() => {
    mediaItemsRef.current = mediaItems;
  }, [mediaItems]);

  React.useEffect(() => {
    if (!isHydrated) return;

    const subscription = form.watch(() => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }

      autoSaveTimeoutRef.current = setTimeout(() => {
        persistDraft(form.getValues());
      }, 1400);
    });

    return () => {
      subscription.unsubscribe();
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [form, isHydrated, persistDraft]);

  React.useEffect(() => {
    if (!isHydrated) return;

    const emergencySave = () => {
      persistDraft(form.getValues());
    };

    window.addEventListener("beforeunload", emergencySave);
    window.addEventListener("pagehide", emergencySave);

    return () => {
      window.removeEventListener("beforeunload", emergencySave);
      window.removeEventListener("pagehide", emergencySave);
    };
  }, [form, isHydrated, persistDraft]);

  React.useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
      mediaItemsRef.current.forEach((item) => URL.revokeObjectURL(item.src));
    };
  }, []);

  const rootFieldsWithErrors = React.useMemo(
    () =>
      new Set(
        Object.keys(form.formState.errors) as (keyof AddProduct2Values)[],
      ),
    [form.formState.errors],
  );

  const stepErrors = React.useMemo<Record<ProductStepId, boolean>>(
    () => ({
      basics: stepFieldMap.basics.some((field) =>
        rootFieldsWithErrors.has(field),
      ),
      pricing: stepFieldMap.pricing.some((field) =>
        rootFieldsWithErrors.has(field),
      ),
      inventory: stepFieldMap.inventory.some((field) =>
        rootFieldsWithErrors.has(field),
      ),
      measurements: stepFieldMap.measurements.some((field) =>
        rootFieldsWithErrors.has(field),
      ),
    }),
    [rootFieldsWithErrors],
  );

  const canNavigateToStep = React.useCallback(
    (targetStep: ProductStepId) => {
      const targetIndex = stepConfig.findIndex(
        (step) => step.id === targetStep,
      );
      if (targetIndex === -1) return false;
      if (targetIndex <= currentStepIndex) return true;

      for (let index = 0; index < targetIndex; index += 1) {
        const step = stepConfig[index];
        if (!completedSteps.includes(step.id)) {
          return false;
        }
      }

      return true;
    },
    [completedSteps, currentStepIndex],
  );

  const getFirstInvalidStep = React.useCallback(() => {
    return stepConfig.find((step) => {
      return stepFieldMap[step.id].some(
        (field) => form.getFieldState(field).invalid,
      );
    })?.id;
  }, [form]);

  function markStepComplete(step: ProductStepId) {
    setCompletedSteps((current) =>
      current.includes(step) ? current : [...current, step],
    );
  }

  async function validateCurrentStep(step: ProductStepId) {
    return form.trigger(stepFieldMap[step], { shouldFocus: true });
  }

  async function goToStep(step: ProductStepId) {
    if (!canNavigateToStep(step)) return;
    persistDraft(form.getValues(), step);
    setCurrentStep(step);
  }

  async function handleNext() {
    const isValid = await validateCurrentStep(currentStep);

    if (!isValid) {
      toast({
        title: "Finish this step first",
        description: "A few required fields still need your attention.",
      });
      return;
    }

    markStepComplete(currentStep);
    const nextStep = stepConfig[currentStepIndex + 1]?.id;

    if (nextStep) {
      setCurrentStep(nextStep);
      persistDraft(form.getValues(), nextStep, [
        ...new Set([...completedSteps, currentStep]),
      ]);
      return;
    }

    await handleSubmit();
  }

  function handlePrevious() {
    const previousStep = stepConfig[currentStepIndex - 1]?.id;
    if (!previousStep) return;

    setCurrentStep(previousStep);
    persistDraft(form.getValues(), previousStep);
  }

  function handleSaveDraft() {
    persistDraft(form.getValues());
    toast({
      title: mode === "add" ? "Draft saved" : "Changes saved",
      description:
        mode === "add"
          ? "Your guided product draft is ready to continue later."
          : "Your guided product changes were saved for later review.",
    });
  }

  function replaceMediaItems(nextItems: MediaPreviewItem[]) {
    if (thumbnailInputRef.current) {
      thumbnailInputRef.current.value = "";
    }

    setMediaItems((current) => {
      current.forEach((item) => {
        if (item.src.startsWith("blob:")) {
          URL.revokeObjectURL(item.src);
        }
      });

      return nextItems;
    });
  }

  function handleReset() {
    window.localStorage.removeItem(draftStorageKey);
    form.reset(cloneValues(normalizedInitialValues));
    setCurrentStep("basics");
    setCompletedSteps(initialCompletedSteps);
    setLastSavedAt(null);
    setIsSavingDraft(false);
    replaceMediaItems(initialMediaItems);
  }

  function fillTestStep(step: ProductStepId) {
    const nextValues = normalizeDraftValues({
      ...form.getValues(),
      ...sampleStepValues[step],
    });
    const targetIndex = stepConfig.findIndex((item) => item.id === step);
    const nextCompletedSteps = stepConfig
      .slice(0, targetIndex + 1)
      .map((item) => item.id);

    form.reset(nextValues);
    setCurrentStep(step);

    if (step === "basics") {
      replaceMediaItems(sampleMediaItems);
    }

    persistDraft(nextValues, step, nextCompletedSteps);
    toast({
      title: `${stepConfig[targetIndex]?.label} filled`,
      description: "Sample values were inserted for quicker page testing.",
    });
  }

  function fillAllTestData() {
    const nextValues = normalizeDraftValues({
      ...form.getValues(),
      ...sampleStepValues.basics,
      ...sampleStepValues.pricing,
      ...sampleStepValues.inventory,
      ...sampleStepValues.measurements,
    });
    const nextCompletedSteps = stepConfig.map((item) => item.id);

    form.reset(nextValues);
    replaceMediaItems(sampleMediaItems);
    persistDraft(nextValues, currentStep, nextCompletedSteps);
    toast({
      title: "Wizard filled",
      description: "All steps now have sample data for faster UI testing.",
    });
  }

  function clearTestData() {
    handleReset();
    toast({
      title: "Test data cleared",
      description: "The wizard has been reset to its empty state.",
    });
  }

  async function handleSubmit() {
    const isValid = await form.trigger(undefined, { shouldFocus: true });

    if (!isValid) {
      const firstInvalidStep = getFirstInvalidStep();
      if (firstInvalidStep) {
        setCurrentStep(firstInvalidStep);
      }
      toast({
        title: "Product needs attention",
        description: "Fix the highlighted fields before saving the product.",
      });
      return;
    }

    setIsSubmitting(true);

    window.setTimeout(() => {
      setIsSubmitting(false);
      window.localStorage.removeItem(draftStorageKey);
      setCompletedSteps(stepConfig.map((step) => step.id));
      setLastSavedAt(null);
      toast({
        title: mode === "add" ? "Product saved" : "Product updated",
        description:
          mode === "add"
            ? `${form.getValues("productName") || "Untitled product"} is ready for review.`
            : `${form.getValues("productName") || "Untitled product"} was updated in the guided editor.`,
      });
    }, 600);
  }

  function handleMediaInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextFiles = Array.from(event.target.files ?? []);

    if (!nextFiles.length) return;

    setMediaItems((current) => {
      const remainingSlots = Math.max(MAX_GALLERY_ITEMS - current.length, 0);
      const acceptedFiles = nextFiles.slice(0, remainingSlots);

      if (acceptedFiles.length < nextFiles.length) {
        toast({
          title: "Media limit reached",
          description: "You can keep up to 5 product media assets.",
        });
      }

      const nextItems = acceptedFiles.map((file, index) => ({
        id: `upload-${file.name}-${file.lastModified}-${current.length + index}`,
        src: URL.createObjectURL(file),
      }));

      return [...current, ...nextItems];
    });

    event.target.value = "";
  }

  function handleRemoveMedia(id: string) {
    setMediaItems((current) => {
      const selected = current.find((item) => item.id === id);
      if (selected) {
        URL.revokeObjectURL(selected.src);
      }

      return current.filter((item) => item.id !== id);
    });
  }

  function renderStepContent() {
    if (currentStep === "basics") {
      return (
        <div className="flex flex-col gap-6">
          <StepSectionIntro
            title="Product Basics"
            description="Start with the product identity and the media your catalog team will rely on every day."
          />
          <Card className="rounded-2xl">
            <CardContent className="pt-6">
              <FieldGroup>
                <div className="grid gap-3 md:grid-cols-2">
                  <Controller
                    control={form.control}
                    name="returnableProduct"
                    render={({ field }) => (
                      <Field
                        orientation="horizontal"
                        className="rounded-2xl border p-4"
                      >
                        <Switch
                          id="returnable-product"
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                        <FieldContent>
                          <FieldLabel htmlFor="returnable-product">
                            Returnable product
                          </FieldLabel>
                          <FieldDescription>
                            Keep this enabled when post-purchase returns are
                            allowed for the SKU family.
                          </FieldDescription>
                        </FieldContent>
                      </Field>
                    )}
                  />

                  <Controller
                    control={form.control}
                    name="hasVariants"
                    render={({ field }) => (
                      <Field
                        orientation="horizontal"
                        className="rounded-2xl border p-4"
                      >
                        <Switch
                          id="has-variants"
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                        <FieldContent>
                          <FieldLabel htmlFor="has-variants">
                            Has variants
                          </FieldLabel>
                          <FieldDescription>
                            Turn this on when sizes, packs, or colorways will
                            branch off later.
                          </FieldDescription>
                        </FieldContent>
                      </Field>
                    )}
                  />
                </div>

                <Controller
                  control={form.control}
                  name="productName"
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="product-2-name">
                        Product name
                      </FieldLabel>
                      <Input
                        {...field}
                        id="product-2-name"
                        aria-invalid={fieldState.invalid}
                        placeholder="Radiance Ritual Set"
                      />
                      <FieldError errors={[fieldState.error]} />
                    </Field>
                  )}
                />

                <FieldGroup className="md:grid md:grid-cols-2 md:gap-4">
                  <Controller
                    control={form.control}
                    name="productType"
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="product-2-type">
                          Product type
                        </FieldLabel>
                        <Select
                          value={field.value || undefined}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger
                            id="product-2-type"
                            aria-invalid={fieldState.invalid}
                          >
                            <SelectValue placeholder="Select product type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {productTypeOptions.map((option) => (
                                <SelectItem
                                  key={option.value}
                                  value={option.value}
                                >
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        <FieldError errors={[fieldState.error]} />
                      </Field>
                    )}
                  />

                  <Controller
                    control={form.control}
                    name="productCategory"
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="product-2-category">
                          Product category
                        </FieldLabel>
                        <Select
                          value={field.value || undefined}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger
                            id="product-2-category"
                            aria-invalid={fieldState.invalid}
                          >
                            <SelectValue placeholder="Select product category" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {productCategoryOptions.map((option) => (
                                <SelectItem
                                  key={option.value}
                                  value={option.value}
                                >
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        <FieldError errors={[fieldState.error]} />
                      </Field>
                    )}
                  />
                </FieldGroup>

                <FieldGroup className="md:grid md:grid-cols-2 md:gap-4">
                  <Controller
                    control={form.control}
                    name="productSku"
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="product-2-sku">
                          Product SKU
                        </FieldLabel>
                        <Input
                          {...field}
                          id="product-2-sku"
                          aria-invalid={fieldState.invalid}
                          placeholder="SKU-RITUAL-1006"
                        />
                        <FieldError errors={[fieldState.error]} />
                      </Field>
                    )}
                  />

                  <Controller
                    control={form.control}
                    name="barcode"
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="product-2-barcode">
                          Barcode
                        </FieldLabel>
                        <Input
                          {...field}
                          id="product-2-barcode"
                          aria-invalid={fieldState.invalid}
                          placeholder="0123456789001"
                        />
                        <FieldError errors={[fieldState.error]} />
                      </Field>
                    )}
                  />
                </FieldGroup>

                <Controller
                  control={form.control}
                  name="description"
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="product-2-description">
                        Description
                      </FieldLabel>
                      <Textarea
                        {...field}
                        id="product-2-description"
                        aria-invalid={fieldState.invalid}
                        placeholder="Describe the item in a way that helps catalog, merchandising, and support teams identify it quickly."
                        className="min-h-32 resize-y"
                      />
                      <FieldError errors={[fieldState.error]} />
                    </Field>
                  )}
                />

                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <FieldLabel>Gallery</FieldLabel>
                    <FieldDescription>
                      Keep the media stack lean. The first image becomes the
                      thumbnail throughout the catalog.
                    </FieldDescription>
                  </div>
                  <MediaUploader
                    items={mediaItems}
                    inputRef={thumbnailInputRef}
                    onInputChange={handleMediaInputChange}
                    onRemove={handleRemoveMedia}
                  />
                </div>
              </FieldGroup>
            </CardContent>
          </Card>
        </div>
      );
    }

    if (currentStep === "pricing") {
      return (
        <div className="flex flex-col gap-6">
          <StepSectionIntro
            title="Pricing model"
            description="Set how this item behaves across direct retail, wholesale, and cost tracking."
          />
          <Card className="rounded-2xl">
            <CardContent className="pt-6">
              <FieldGroup>
                <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)] xl:items-center">
                  <Controller
                    control={form.control}
                    name="currency"
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="pricing-currency">
                          Currency
                        </FieldLabel>
                        <Select
                          value={field.value || undefined}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger
                            id="pricing-currency"
                            aria-invalid={fieldState.invalid}
                          >
                            <SelectValue placeholder="Select currency" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="USD">USD</SelectItem>
                              <SelectItem value="EUR">EUR</SelectItem>
                              <SelectItem value="GBP">GBP</SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        <FieldError errors={[fieldState.error]} />
                      </Field>
                    )}
                  />

                  <div className="flex flex-wrap items-center gap-6 xl:justify-end">
                    <Controller
                      control={form.control}
                      name="chargeTax"
                      render={({ field }) => (
                        <div className="flex items-center gap-3">
                          <FieldLabel
                            htmlFor="charge-tax-product-2"
                            className="text-sm font-medium"
                          >
                            Charge tax
                          </FieldLabel>
                          <Switch
                            id="charge-tax-product-2"
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </div>
                      )}
                    />

                    <Controller
                      control={form.control}
                      name="publishNow"
                      render={({ field }) => (
                        <div className="flex items-center gap-3">
                          <FieldLabel
                            htmlFor="publish-now"
                            className="text-sm font-medium"
                          >
                            Ready to publish
                          </FieldLabel>
                          <Switch
                            id="publish-now"
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </div>
                      )}
                    />
                  </div>
                </div>

                <Separator />

                <FieldGroup className="md:grid md:grid-cols-3 md:gap-4">
                  <Controller
                    control={form.control}
                    name="retailPrice"
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="retail-price">
                          Retail sale price
                        </FieldLabel>
                        <InputGroup>
                          <InputGroupAddon align="inline-start">
                            <InputGroupText>
                              {watchedValues.currency}
                            </InputGroupText>
                          </InputGroupAddon>
                          <InputGroupInput
                            {...field}
                            id="retail-price"
                            aria-invalid={fieldState.invalid}
                            inputMode="decimal"
                            placeholder="0.00"
                          />
                        </InputGroup>
                        <FieldError errors={[fieldState.error]} />
                      </Field>
                    )}
                  />

                  <Controller
                    control={form.control}
                    name="wholesalePrice"
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="wholesale-price">
                          Wholesale sale price
                        </FieldLabel>
                        <InputGroup>
                          <InputGroupAddon align="inline-start">
                            <InputGroupText>
                              {watchedValues.currency}
                            </InputGroupText>
                          </InputGroupAddon>
                          <InputGroupInput
                            {...field}
                            id="wholesale-price"
                            aria-invalid={fieldState.invalid}
                            inputMode="decimal"
                            placeholder="0.00"
                          />
                        </InputGroup>
                        <FieldError errors={[fieldState.error]} />
                      </Field>
                    )}
                  />

                  <Controller
                    control={form.control}
                    name="cost"
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="cost">Unit cost</FieldLabel>
                        <InputGroup>
                          <InputGroupAddon align="inline-start">
                            <InputGroupText>
                              {watchedValues.currency}
                            </InputGroupText>
                          </InputGroupAddon>
                          <InputGroupInput
                            {...field}
                            id="cost"
                            aria-invalid={fieldState.invalid}
                            inputMode="decimal"
                            placeholder="0.00"
                          />
                        </InputGroup>
                        <FieldError errors={[fieldState.error]} />
                      </Field>
                    )}
                  />
                </FieldGroup>

                <div className="bg-muted/30 rounded-[24px] border">
                  <div className="grid gap-0 md:grid-cols-2">
                    <div className="border-b p-5 md:border-r md:border-b-0">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-medium">Retail</p>
                          <p className="text-muted-foreground text-sm">
                            Direct storefront price
                          </p>
                        </div>
                        <p className="text-xl font-semibold">
                          {formatMoney(
                            watchedValues.retailPrice,
                            watchedValues.currency,
                          )}
                        </p>
                      </div>
                      <div className="text-muted-foreground mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p>Margin</p>
                          <p className="text-foreground mt-1 font-medium">
                            {Number.isFinite(retailMargin)
                              ? retailMargin.toFixed(0)
                              : "0"}
                            %
                          </p>
                        </div>
                        <div>
                          <p>Profit</p>
                          <p className="text-foreground mt-1 font-medium">
                            {formatMoney(
                              String(Math.max(retailPrice - cost, 0)),
                              watchedValues.currency,
                            )}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-medium">Wholesale</p>
                          <p className="text-muted-foreground text-sm">
                            Partner and bulk price
                          </p>
                        </div>
                        <p className="text-xl font-semibold">
                          {formatMoney(
                            watchedValues.wholesalePrice,
                            watchedValues.currency,
                          )}
                        </p>
                      </div>
                      <div className="text-muted-foreground mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p>Margin</p>
                          <p className="text-foreground mt-1 font-medium">
                            {Number.isFinite(wholesaleMargin)
                              ? wholesaleMargin.toFixed(0)
                              : "0"}
                            %
                          </p>
                        </div>
                        <div>
                          <p>Profit</p>
                          <p className="text-foreground mt-1 font-medium">
                            {formatMoney(
                              String(Math.max(wholesalePrice - cost, 0)),
                              watchedValues.currency,
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </FieldGroup>
            </CardContent>
          </Card>
        </div>
      );
    }

    if (currentStep === "inventory") {
      return (
        <div className="flex flex-col gap-6">
          <StepSectionIntro
            title="Inventory rules"
            description="Allocate stock by location and add replenishment thresholds only where the workflow actually needs them."
          />
          <Card className="rounded-2xl">
            <CardContent className="pt-6">
              <FieldGroup>
                <Controller
                  control={form.control}
                  name="totalQuantity"
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="total-quantity">
                        Total quantity
                      </FieldLabel>
                      <Input
                        {...field}
                        id="total-quantity"
                        aria-invalid={fieldState.invalid}
                        inputMode="numeric"
                        placeholder="0"
                      />
                      <FieldDescription>
                        Currently allocated: {totalAllocated} units.
                      </FieldDescription>
                      <FieldError errors={[fieldState.error]} />
                    </Field>
                  )}
                />

                <div className="flex flex-col gap-4 rounded-[24px] border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex flex-col gap-1">
                      <p className="font-medium">Location quantities</p>
                      <p className="text-muted-foreground text-sm">
                        Assign on-hand stock to the places that actually carry
                        this product.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        appendStockLocation({ location: "", quantity: "" })
                      }
                    >
                      Add location
                    </Button>
                  </div>

                  {stockLocationFields.map((field, index) => (
                    <div
                      key={field.id}
                      className="grid gap-3 rounded-2xl border p-4 md:grid-cols-[minmax(0,1fr)_140px_auto]"
                    >
                      <Controller
                        control={form.control}
                        name={`stockLocations.${index}.location`}
                        render={({ field, fieldState }) => (
                          <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor={`stock-location-${index}`}>
                              Location
                            </FieldLabel>
                            <Select
                              value={field.value || undefined}
                              onValueChange={field.onChange}
                            >
                              <SelectTrigger
                                id={`stock-location-${index}`}
                                aria-invalid={fieldState.invalid}
                              >
                                <SelectValue placeholder="Select location" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  {locationOptions.map((option) => (
                                    <SelectItem
                                      key={option.value}
                                      value={option.value}
                                    >
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                            <FieldError errors={[fieldState.error]} />
                          </Field>
                        )}
                      />

                      <Controller
                        control={form.control}
                        name={`stockLocations.${index}.quantity`}
                        render={({ field, fieldState }) => (
                          <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor={`stock-qty-${index}`}>
                              Quantity
                            </FieldLabel>
                            <Input
                              {...field}
                              id={`stock-qty-${index}`}
                              aria-invalid={fieldState.invalid}
                              inputMode="numeric"
                              placeholder="0"
                            />
                            <FieldError errors={[fieldState.error]} />
                          </Field>
                        )}
                      />

                      <div className="flex items-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => removeStockLocation(index)}
                          disabled={stockLocationFields.length === 1}
                          aria-label={`Remove stock location ${index + 1}`}
                        >
                          <X />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col gap-4 rounded-[24px] border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex flex-col gap-1">
                      <p className="font-medium">Reorder rules</p>
                      <p className="text-muted-foreground text-sm">
                        Add rules only for the locations that should trigger
                        replenishment automatically.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        appendReorderRule({
                          location: "",
                          reorderPoint: "",
                          reorderQuantity: "",
                          method: "",
                        })
                      }
                    >
                      Set reorder point
                    </Button>
                  </div>

                  {reorderFields.length ? (
                    <div className="flex flex-col gap-4">
                      {reorderFields.map((field, index) => (
                        <div
                          key={field.id}
                          className="grid gap-3 rounded-2xl border p-4 lg:grid-cols-[minmax(0,1fr)_140px_160px_minmax(0,1fr)_auto]"
                        >
                          <Controller
                            control={form.control}
                            name={`reorderRules.${index}.location`}
                            render={({ field, fieldState }) => (
                              <Field data-invalid={fieldState.invalid}>
                                <FieldLabel
                                  htmlFor={`reorder-location-${index}`}
                                >
                                  Location
                                </FieldLabel>
                                <Select
                                  value={field.value || undefined}
                                  onValueChange={field.onChange}
                                >
                                  <SelectTrigger
                                    id={`reorder-location-${index}`}
                                    aria-invalid={fieldState.invalid}
                                  >
                                    <SelectValue placeholder="Select location" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectGroup>
                                      {locationOptions.map((option) => (
                                        <SelectItem
                                          key={option.value}
                                          value={option.value}
                                        >
                                          {option.label}
                                        </SelectItem>
                                      ))}
                                    </SelectGroup>
                                  </SelectContent>
                                </Select>
                                <FieldError errors={[fieldState.error]} />
                              </Field>
                            )}
                          />

                          <Controller
                            control={form.control}
                            name={`reorderRules.${index}.reorderPoint`}
                            render={({ field, fieldState }) => (
                              <Field data-invalid={fieldState.invalid}>
                                <FieldLabel htmlFor={`reorder-point-${index}`}>
                                  Reorder point
                                </FieldLabel>
                                <Input
                                  {...field}
                                  id={`reorder-point-${index}`}
                                  aria-invalid={fieldState.invalid}
                                  inputMode="numeric"
                                  placeholder="20"
                                />
                                <FieldError errors={[fieldState.error]} />
                              </Field>
                            )}
                          />

                          <Controller
                            control={form.control}
                            name={`reorderRules.${index}.reorderQuantity`}
                            render={({ field, fieldState }) => (
                              <Field data-invalid={fieldState.invalid}>
                                <FieldLabel htmlFor={`reorder-qty-${index}`}>
                                  Reorder qty
                                </FieldLabel>
                                <Input
                                  {...field}
                                  id={`reorder-qty-${index}`}
                                  aria-invalid={fieldState.invalid}
                                  inputMode="numeric"
                                  placeholder="120"
                                />
                                <FieldError errors={[fieldState.error]} />
                              </Field>
                            )}
                          />

                          <Controller
                            control={form.control}
                            name={`reorderRules.${index}.method`}
                            render={({ field, fieldState }) => (
                              <Field data-invalid={fieldState.invalid}>
                                <FieldLabel htmlFor={`reorder-method-${index}`}>
                                  Method
                                </FieldLabel>
                                <Select
                                  value={field.value || undefined}
                                  onValueChange={field.onChange}
                                >
                                  <SelectTrigger
                                    id={`reorder-method-${index}`}
                                    aria-invalid={fieldState.invalid}
                                  >
                                    <SelectValue placeholder="Select method" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectGroup>
                                      {reorderMethodOptions.map((option) => (
                                        <SelectItem
                                          key={option.value}
                                          value={option.value}
                                        >
                                          {option.label}
                                        </SelectItem>
                                      ))}
                                    </SelectGroup>
                                  </SelectContent>
                                </Select>
                                <FieldError errors={[fieldState.error]} />
                              </Field>
                            )}
                          />

                          <div className="flex items-end">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => removeReorderRule(index)}
                              aria-label={`Remove reorder rule ${index + 1}`}
                            >
                              <X />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-muted/30 rounded-[24px] border border-dashed p-6">
                      <div className="flex items-start gap-3">
                        <div className="bg-background flex size-10 items-center justify-center rounded-2xl border">
                          <Truck />
                        </div>
                        <div className="flex flex-col gap-1">
                          <p className="font-medium">No reorder rules yet</p>
                          <p className="text-muted-foreground text-sm">
                            Leave this empty unless a location should trigger
                            replenishment automatically.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </FieldGroup>
            </CardContent>
          </Card>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-6">
        <StepSectionIntro
          title="Dimensions & units"
          description="Define the physical footprint and how the product converts between packed and sellable units."
        />
        <Card className="rounded-2xl">
          <CardContent className="pt-6">
            <FieldGroup>
              <FieldGroup className="md:grid md:grid-cols-2 md:gap-4">
                <Controller
                  control={form.control}
                  name="measurementUnit"
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="measurement-unit">
                        Primary unit
                      </FieldLabel>
                      <Select
                        value={field.value || undefined}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger
                          id="measurement-unit"
                          aria-invalid={fieldState.invalid}
                        >
                          <SelectValue placeholder="Select unit" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {measurementUnitOptions.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <FieldError errors={[fieldState.error]} />
                    </Field>
                  )}
                />
              </FieldGroup>

              <div className="grid gap-4 md:grid-cols-3">
                <Controller
                  control={form.control}
                  name="height"
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="height">Height</FieldLabel>
                      <InputGroup>
                        <InputGroupInput
                          {...field}
                          id="height"
                          aria-invalid={fieldState.invalid}
                          inputMode="decimal"
                          placeholder="0"
                        />
                        <InputGroupAddon align="inline-end">
                          <Controller
                            control={form.control}
                            name="heightUnit"
                            render={({ field: unitField }) => (
                              <Select
                                value={unitField.value || undefined}
                                onValueChange={unitField.onChange}
                              >
                                <SelectTrigger className="w-20 border-none shadow-none">
                                  <SelectValue placeholder="cm" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectGroup>
                                    {dimensionUnitOptions.map((option) => (
                                      <SelectItem
                                        key={option.value}
                                        value={option.value}
                                      >
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectGroup>
                                </SelectContent>
                              </Select>
                            )}
                          />
                        </InputGroupAddon>
                      </InputGroup>
                      <FieldError errors={[fieldState.error]} />
                    </Field>
                  )}
                />

                <Controller
                  control={form.control}
                  name="width"
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="width">Width</FieldLabel>
                      <InputGroup>
                        <InputGroupInput
                          {...field}
                          id="width"
                          aria-invalid={fieldState.invalid}
                          inputMode="decimal"
                          placeholder="0"
                        />
                        <InputGroupAddon align="inline-end">
                          <Controller
                            control={form.control}
                            name="widthUnit"
                            render={({ field: unitField }) => (
                              <Select
                                value={unitField.value || undefined}
                                onValueChange={unitField.onChange}
                              >
                                <SelectTrigger className="w-20 border-none shadow-none">
                                  <SelectValue placeholder="cm" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectGroup>
                                    {dimensionUnitOptions.map((option) => (
                                      <SelectItem
                                        key={option.value}
                                        value={option.value}
                                      >
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectGroup>
                                </SelectContent>
                              </Select>
                            )}
                          />
                        </InputGroupAddon>
                      </InputGroup>
                      <FieldError errors={[fieldState.error]} />
                    </Field>
                  )}
                />

                <Controller
                  control={form.control}
                  name="weight"
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="weight">Weight</FieldLabel>
                      <InputGroup>
                        <InputGroupInput
                          {...field}
                          id="weight"
                          aria-invalid={fieldState.invalid}
                          inputMode="decimal"
                          placeholder="0"
                        />
                        <InputGroupAddon align="inline-end">
                          <Controller
                            control={form.control}
                            name="weightUnit"
                            render={({ field: unitField }) => (
                              <Select
                                value={unitField.value || undefined}
                                onValueChange={unitField.onChange}
                              >
                                <SelectTrigger className="w-20 border-none shadow-none">
                                  <SelectValue placeholder="kg" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectGroup>
                                    {weightUnitOptions.map((option) => (
                                      <SelectItem
                                        key={option.value}
                                        value={option.value}
                                      >
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectGroup>
                                </SelectContent>
                              </Select>
                            )}
                          />
                        </InputGroupAddon>
                      </InputGroup>
                      <FieldError errors={[fieldState.error]} />
                    </Field>
                  )}
                />
              </div>

              <Separator />

              <RatioField
                control={form.control}
                prefix="saleUom"
                label="Sales unit of measure"
              />
              <RatioField
                control={form.control}
                prefix="purchaseUom"
                label="Purchase unit of measure"
              />
            </FieldGroup>
          </CardContent>
        </Card>
      </div>
    );
  }

  const pageTitle = mode === "add" ? "Add Product" : "Edit Product";
  const pageDescription =
    mode === "add"
      ? "Move through the product setup in order so identity, pricing, inventory, and unit data stay aligned before launch."
      : "Refine identity, pricing, stock rules, and units without leaving the guided setup flow.";
  const saveDraftLabel = mode === "add" ? "Save draft" : "Save changes";
  const primaryActionLabel = mode === "add" ? "Save Product" : "Update product";
  const resetLabel = mode === "add" ? "Reset draft" : "Reset changes";
  const statusSavedLabel = mode === "add" ? "Draft saved" : "Changes saved";
  const statusIdleLabel = mode === "add" ? "Not saved yet" : "No changes saved";
  const resetDescription =
    mode === "add"
      ? "This clears all saved fields in the guided flow and starts again from the first step."
      : "This restores the guided editor to the seeded product values for this item.";

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b px-4 py-5 sm:px-6 md:px-8">
        <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">
              {pageTitle}
            </h1>
            <p className="text-muted-foreground max-w-3xl text-sm">
              {pageDescription}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline">
                  Test data
                  <ChevronsUpDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Quick fill</DropdownMenuLabel>
                {stepConfig.map((step) => (
                  <DropdownMenuItem
                    key={step.id}
                    onClick={() => fillTestStep(step.id)}
                  >
                    {step.label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={fillAllTestData}>
                  Fill entire wizard
                </DropdownMenuItem>
                <DropdownMenuItem onClick={clearTestData}>
                  Clear test data
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button type="button" variant="outline" onClick={handleSaveDraft}>
              {saveDraftLabel}
            </Button>
            <Button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={isSubmitting}
            >
              {isSubmitting
                ? mode === "add"
                  ? "Saving..."
                  : "Updating..."
                : primaryActionLabel}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="border-b px-4 py-3 sm:px-6 md:px-8 xl:hidden">
            <div className="mx-auto w-full max-w-4xl">
              <MobileProgress currentStep={currentStep} progress={progress} />
            </div>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 md:px-8">
              {renderStepContent()}
            </div>
          </ScrollArea>

          <footer className="bg-background shrink-0 border-t">
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 md:px-8">
              <div className="flex items-center gap-3 text-sm">
                <Badge variant="secondary">
                  {stepConfig[currentStepIndex]?.stepLabel}
                </Badge>
                <span className="text-muted-foreground">
                  {stepConfig[currentStepIndex]?.label}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePrevious}
                  disabled={currentStepIndex === 0}
                >
                  Previous
                </Button>
                <Button type="button" onClick={() => void handleNext()}>
                  {currentStep === "measurements" ? "Save" : "Next"}
                </Button>
              </div>
            </div>
          </footer>
        </main>

        <aside className="bg-muted/30 hidden shrink-0 flex-col border-l xl:flex xl:w-72">
          <ScrollArea className="min-h-0 flex-1">
            <div className="p-6">
              <StepSidebar
                currentStep={currentStep}
                completedSteps={completedSteps}
                stepErrors={stepErrors}
                onStepClick={(step) => void goToStep(step)}
                canNavigateToStep={canNavigateToStep}
                progress={progress}
                lastSavedAt={lastSavedAt}
                isSavingDraft={isSavingDraft}
                onReset={handleReset}
                resetLabel={resetLabel}
                resetDescription={resetDescription}
                statusSavedLabel={statusSavedLabel}
                statusIdleLabel={statusIdleLabel}
              />
            </div>
          </ScrollArea>
        </aside>
      </div>
    </div>
  );
}

export type { AddProduct2Values };

export function EcommerceAddProduct2() {
  return (
    <EcommerceProductWizard2
      mode="add"
      initialValues={defaultValues}
      draftStorageKey="ecommerce-add-product-2-draft-v1"
    />
  );
}

export function EcommerceEditProduct2({
  initialValues,
  initialMediaSources,
  draftStorageKey,
}: {
  initialValues: AddProduct2Values;
  initialMediaSources?: string[];
  draftStorageKey: string;
}) {
  return (
    <EcommerceProductWizard2
      mode="edit"
      initialValues={initialValues}
      initialMediaSources={initialMediaSources}
      draftStorageKey={draftStorageKey}
    />
  );
}
