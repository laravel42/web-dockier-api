"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { CalendarDays, PencilLine, Truck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { getEditableProductBySlug } from "@/lib/ecommerce-edit-products";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type ShippingLabelMode = "create" | "edit";

const requiredString = (message: string) => z.string().min(1, message);

const formSchema = z.object({
  carrierService: requiredString("Choose a carrier"),
  serviceType: requiredString("Choose a service type"),
  insuranceCoverage: z.string().optional(),
  packageName: requiredString("Package name is required"),
  packageType: requiredString("Package type is required"),
  itemWeight: requiredString("Item weight is required"),
  packageWeight: requiredString("Total weight is required"),
  packageLength: requiredString("Length is required"),
  packageWidth: requiredString("Width is required"),
  packageHeight: requiredString("Height is required"),
  savePackage: z.boolean(),
  shippingDate: z.date().optional(),
  sendInfoNow: z.boolean(),
  deliveryNotes: z.string().max(280, "Keep notes under 280 characters"),
});

type ShippingLabelValues = z.infer<typeof formSchema>;

const editDefaultValues: ShippingLabelValues = {
  carrierService: "ups",
  serviceType: "ground-advantage",
  insuranceCoverage: "none",
  packageName: "Studio carton",
  packageType: "box",
  itemWeight: "2.5",
  packageWeight: "0.45",
  packageLength: "45",
  packageWidth: "35",
  packageHeight: "15",
  savePackage: true,
  shippingDate: new Date(2026, 2, 25),
  sendInfoNow: true,
  deliveryNotes:
    "Adult signature is not required. Protect the serum carton corner and keep the insert card visible.",
};

const createDefaultValues: ShippingLabelValues = {
  carrierService: "",
  serviceType: "",
  insuranceCoverage: "none",
  packageName: "",
  packageType: "",
  itemWeight: "",
  packageWeight: "",
  packageLength: "",
  packageWidth: "",
  packageHeight: "",
  savePackage: false,
  shippingDate: undefined,
  sendInfoNow: false,
  deliveryNotes: "",
};

const carrierOptions = [
  { value: "usps", label: "United States Postal Service" },
  { value: "ups", label: "UPS" },
  { value: "fedex", label: "FedEx" },
  { value: "dhl", label: "DHL Express" },
] as const;

const serviceOptions = [
  { value: "priority-mail", label: "Priority Mail", fee: 9.5 },
  { value: "ground-advantage", label: "Ground Advantage", fee: 7.25 },
  { value: "express-saver", label: "Express Saver", fee: 13.75 },
  { value: "two-day-air", label: "2-Day Air", fee: 18.0 },
] as const;

const insuranceOptions = [
  { value: "none", label: "No coverage", fee: 0 },
  { value: "100", label: "Cover up to $100", fee: 1.5 },
  { value: "250", label: "Cover up to $250", fee: 2.75 },
  { value: "500", label: "Cover up to $500", fee: 4.5 },
] as const;

const packageTypeOptions = [
  { value: "box", label: "Box" },
  { value: "mailer", label: "Mailer" },
  { value: "tube", label: "Tube" },
] as const;

const packageMaterialFees = {
  box: 1.25,
  mailer: 0.65,
  tube: 1.1,
} as const;

const shippingProduct =
  getEditableProductBySlug("radiance-ritual-set") ??
  getEditableProductBySlug("barrier-repair-drops");

const shipmentContext = {
  orderId: "ORD-52108",
  destination: "Chicago Sort Hub",
  recipient: "North Clark Street, Chicago",
  serviceWindow: "Priority handoff for tomorrow",
};

const createShipmentContext = {
  title: "New shipping draft",
  subtitle:
    "Start without a linked order and lock carrier, package, and dispatch details as they become available.",
  chips: ["No order linked yet", "Choose a carrier", "Set package specs"],
};

function formatCurrency(value: number) {
  return `$${value.toFixed(2)}`;
}

function ShippingDateField({
  value,
  onChange,
}: {
  value?: Date;
  onChange: (value: Date | undefined) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-11 w-full justify-between rounded-lg px-3 text-left font-normal shadow-none",
            !value && "text-muted-foreground",
          )}
        >
          <span>{value ? format(value, "PPP") : "Choose shipping date"}</span>
          <CalendarDays data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={onChange}
          autoFocus
          captionLayout="dropdown"
        />
      </PopoverContent>
    </Popover>
  );
}

function EcommerceShippingLabelEditor({ mode }: { mode: ShippingLabelMode }) {
  const isEdit = mode === "edit";
  const defaultValues = isEdit ? editDefaultValues : createDefaultValues;

  const form = useForm<ShippingLabelValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const serviceType = form.watch("serviceType");
  const insuranceCoverage = form.watch("insuranceCoverage");
  const packageType = form.watch("packageType");

  const subtotal =
    serviceOptions.find((option) => option.value === serviceType)?.fee ?? 0;
  const insuranceTotal =
    insuranceOptions.find((option) => option.value === insuranceCoverage)
      ?.fee ?? 0;
  const packageMaterialTotal = packageType
    ? (packageMaterialFees[packageType as keyof typeof packageMaterialFees] ??
      packageMaterialFees.box)
    : 0;
  const total = subtotal + insuranceTotal + packageMaterialTotal;

  const handleSubmit = (values: ShippingLabelValues) => {
    toast({
      title: isEdit ? "Shipping label updated" : "Shipping label created",
      description: isEdit
        ? `Changes for ${shippingProduct?.values.name ?? "this shipment"} are saved for ${values.shippingDate ? format(values.shippingDate, "MMM d, yyyy") : "the selected date"}.`
        : `Draft label is set for ${values.shippingDate ? format(values.shippingDate, "MMM d, yyyy") : "the selected date"}.`,
    });
  };

  const handleSaveDraft = form.handleSubmit(() => {
    toast({
      title: isEdit ? "Shipping label draft updated" : "Shipping draft saved",
      description: isEdit
        ? "Your latest shipping edits are saved and ready for review."
        : "You can return to finish the label and purchase it later.",
    });
  });

  return (
    <div className="flex flex-col">
      <div className="flex flex-col p-4 sm:p-6 md:p-8">
        <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-6 pb-8">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 text-sm md:hidden">
                <span className="text-foreground font-medium">Shipments</span>
                <span className="text-muted-foreground">/</span>
                <span className="text-muted-foreground">
                  {isEdit ? "Edit Shipping Label" : "Create Shipping Label"}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <h1 className="text-3xl font-semibold tracking-tight">
                  {isEdit ? "Edit Shipping Label" : "Create Shipping Label"}
                </h1>
                <p className="text-muted-foreground text-sm">
                  {isEdit
                    ? "Adjust carrier, package, and dispatch details without restarting the label flow."
                    : "Start a new label draft with carrier, package, and dispatch details."}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => form.reset(defaultValues)}
              >
                Reset
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleSaveDraft()}
              >
                {isEdit ? "Save changes" : "Save draft"}
              </Button>
              <Button form="add-shipping-form" type="submit">
                {isEdit ? "Update Label" : "Create Label"}
              </Button>
            </div>
          </header>

          <Card className="rounded-2xl">
            <CardContent className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
              {isEdit ? (
                <>
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="bg-muted relative size-16 shrink-0 overflow-hidden rounded-xl border">
                      {shippingProduct ? (
                        <Image
                          src={shippingProduct.assets.thumbnail}
                          alt={shippingProduct.values.name}
                          fill
                          sizes="64px"
                          className="object-cover"
                        />
                      ) : null}
                    </div>

                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-base font-medium">
                        {shippingProduct?.values.name ?? "Radiance Ritual Set"}
                      </p>
                      <p className="text-muted-foreground text-sm">
                        Preparing label for {shipmentContext.recipient}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="rounded-md px-3 py-1">
                      {shipmentContext.orderId}
                    </Badge>
                    <Badge variant="outline" className="rounded-md px-3 py-1">
                      {shipmentContext.destination}
                    </Badge>
                    <Badge variant="outline" className="rounded-md px-3 py-1">
                      {shipmentContext.serviceWindow}
                    </Badge>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="text-base font-medium">
                      {createShipmentContext.title}
                    </p>
                    <p className="text-muted-foreground max-w-2xl text-sm">
                      {createShipmentContext.subtitle}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {createShipmentContext.chips.map((chip, index) => (
                      <Badge
                        key={chip}
                        variant={index === 0 ? "secondary" : "outline"}
                        className="rounded-md px-3 py-1"
                      >
                        {chip}
                      </Badge>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <form
            id="add-shipping-form"
            onSubmit={form.handleSubmit(handleSubmit)}
            className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.78fr)]"
          >
            <div className="flex flex-col gap-6">
              <Card className="rounded-2xl">
                <CardHeader>
                  <CardTitle>Delivery Setup</CardTitle>
                  <CardDescription>
                    Pick the lane, speed, and protection level for this parcel.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <FieldGroup>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Controller
                        control={form.control}
                        name="carrierService"
                        render={({ field, fieldState }) => (
                          <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor="carrier-service">
                              Carrier Lane
                            </FieldLabel>
                            <Select
                              value={field.value}
                              onValueChange={field.onChange}
                            >
                              <SelectTrigger
                                id="carrier-service"
                                aria-invalid={fieldState.invalid}
                                className="w-full"
                              >
                                <SelectValue placeholder="Select carrier" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  {carrierOptions.map((option) => (
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
                        name="serviceType"
                        render={({ field, fieldState }) => (
                          <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor="service-type">
                              Service Speed
                            </FieldLabel>
                            <Select
                              value={field.value}
                              onValueChange={field.onChange}
                            >
                              <SelectTrigger
                                id="service-type"
                                aria-invalid={fieldState.invalid}
                                className="w-full"
                              >
                                <SelectValue placeholder="Select service" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  {serviceOptions.map((option) => (
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
                    </div>

                    <Controller
                      control={form.control}
                      name="insuranceCoverage"
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor="shipping-insurance">
                            Protection Plan
                          </FieldLabel>
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                          >
                            <SelectTrigger
                              id="shipping-insurance"
                              aria-invalid={fieldState.invalid}
                              className="w-full"
                            >
                              <SelectValue placeholder="Select insurance coverage" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                {insuranceOptions.map((option) => (
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
                          <FieldDescription>
                            Add parcel protection only when the order needs
                            coverage.
                          </FieldDescription>
                          <FieldError errors={[fieldState.error]} />
                        </Field>
                      )}
                    />
                  </FieldGroup>
                </CardContent>
              </Card>

              <section className="flex flex-col gap-6 py-1">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="flex flex-col gap-1">
                      <h2 className="text-xl font-semibold tracking-tight">
                        Package Details
                      </h2>
                      <p className="text-muted-foreground text-sm">
                        Set the packed weight, carton choice, and outer
                        dimensions for this shipment.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-6">
                  {isEdit ? (
                    <>
                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div className="flex min-w-0 items-center gap-4">
                          <div className="bg-muted relative size-16 overflow-hidden rounded-xl border">
                            {shippingProduct ? (
                              <Image
                                src={shippingProduct.assets.thumbnail}
                                alt={shippingProduct.values.name}
                                fill
                                sizes="64px"
                                className="object-cover"
                              />
                            ) : null}
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">
                              {shippingProduct?.values.name ??
                                "Radiance Ritual Set"}
                            </p>
                            <p className="text-muted-foreground mt-1 text-sm">
                              Retail bundle · SKU:{" "}
                              {shippingProduct?.values.sku ?? "SKU-SKIN-4006"}
                            </p>
                          </div>
                        </div>

                        <Controller
                          control={form.control}
                          name="itemWeight"
                          render={({ field, fieldState }) => (
                            <Field
                              data-invalid={fieldState.invalid}
                              className="w-full md:max-w-[176px]"
                            >
                              <FieldLabel htmlFor="item-weight">
                                Item Weight
                              </FieldLabel>
                              <InputGroup>
                                <InputGroupInput
                                  {...field}
                                  id="item-weight"
                                  aria-invalid={fieldState.invalid}
                                />
                                <InputGroupAddon align="inline-end">
                                  <InputGroupText>kg</InputGroupText>
                                </InputGroupAddon>
                              </InputGroup>
                              <FieldError errors={[fieldState.error]} />
                            </Field>
                          )}
                        />
                      </div>

                      <Separator />
                    </>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                      <Controller
                        control={form.control}
                        name="packageName"
                        render={({ field, fieldState }) => (
                          <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor="package-name">
                              Package Name
                            </FieldLabel>
                            <Input
                              {...field}
                              id="package-name"
                              aria-invalid={fieldState.invalid}
                              placeholder="Retail carton"
                            />
                            <FieldError errors={[fieldState.error]} />
                          </Field>
                        )}
                      />

                      <Controller
                        control={form.control}
                        name="itemWeight"
                        render={({ field, fieldState }) => (
                          <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor="item-weight">
                              Item Weight
                            </FieldLabel>
                            <InputGroup>
                              <InputGroupInput
                                {...field}
                                id="item-weight"
                                aria-invalid={fieldState.invalid}
                                placeholder="2.5"
                              />
                              <InputGroupAddon align="inline-end">
                                <InputGroupText>kg</InputGroupText>
                              </InputGroupAddon>
                            </InputGroup>
                            <FieldError errors={[fieldState.error]} />
                          </Field>
                        )}
                      />
                    </div>
                  )}

                  <FieldGroup>
                    {isEdit ? (
                      <Controller
                        control={form.control}
                        name="packageName"
                        render={({ field, fieldState }) => (
                          <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor="package-name">
                              Package Name
                            </FieldLabel>
                            <Input
                              {...field}
                              id="package-name"
                              aria-invalid={fieldState.invalid}
                              placeholder="Retail carton"
                            />
                            <FieldError errors={[fieldState.error]} />
                          </Field>
                        )}
                      />
                    ) : null}

                    <div className="grid gap-4 md:grid-cols-2">
                      <Controller
                        control={form.control}
                        name="packageType"
                        render={({ field, fieldState }) => (
                          <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor="package-type">
                              Package Type
                            </FieldLabel>
                            <Select
                              value={field.value}
                              onValueChange={field.onChange}
                            >
                              <SelectTrigger
                                id="package-type"
                                aria-invalid={fieldState.invalid}
                                className="w-full"
                              >
                                <SelectValue placeholder="Select package type" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  {packageTypeOptions.map((option) => (
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
                        name="packageWeight"
                        render={({ field, fieldState }) => (
                          <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor="package-weight">
                              Total Weight
                            </FieldLabel>
                            <InputGroup>
                              <InputGroupInput
                                {...field}
                                id="package-weight"
                                aria-invalid={fieldState.invalid}
                                placeholder="0.45"
                              />
                              <InputGroupAddon align="inline-end">
                                <InputGroupText>kg</InputGroupText>
                              </InputGroupAddon>
                            </InputGroup>
                            <FieldError errors={[fieldState.error]} />
                          </Field>
                        )}
                      />
                    </div>

                    <div className="grid gap-4 pt-1 md:grid-cols-3">
                      <Controller
                        control={form.control}
                        name="packageLength"
                        render={({ field, fieldState }) => (
                          <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor="package-length">
                              Length
                            </FieldLabel>
                            <InputGroup>
                              <InputGroupAddon align="inline-start">
                                <InputGroupText>L</InputGroupText>
                              </InputGroupAddon>
                              <InputGroupInput
                                {...field}
                                id="package-length"
                                aria-invalid={fieldState.invalid}
                                placeholder="45"
                              />
                              <InputGroupAddon align="inline-end">
                                <InputGroupText>cm</InputGroupText>
                              </InputGroupAddon>
                            </InputGroup>
                            <FieldError errors={[fieldState.error]} />
                          </Field>
                        )}
                      />

                      <Controller
                        control={form.control}
                        name="packageWidth"
                        render={({ field, fieldState }) => (
                          <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor="package-width">
                              Width
                            </FieldLabel>
                            <InputGroup>
                              <InputGroupAddon align="inline-start">
                                <InputGroupText>W</InputGroupText>
                              </InputGroupAddon>
                              <InputGroupInput
                                {...field}
                                id="package-width"
                                aria-invalid={fieldState.invalid}
                                placeholder="35"
                              />
                              <InputGroupAddon align="inline-end">
                                <InputGroupText>cm</InputGroupText>
                              </InputGroupAddon>
                            </InputGroup>
                            <FieldError errors={[fieldState.error]} />
                          </Field>
                        )}
                      />

                      <Controller
                        control={form.control}
                        name="packageHeight"
                        render={({ field, fieldState }) => (
                          <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor="package-height">
                              Height
                            </FieldLabel>
                            <InputGroup>
                              <InputGroupAddon align="inline-start">
                                <InputGroupText>H</InputGroupText>
                              </InputGroupAddon>
                              <InputGroupInput
                                {...field}
                                id="package-height"
                                aria-invalid={fieldState.invalid}
                                placeholder="15"
                              />
                              <InputGroupAddon align="inline-end">
                                <InputGroupText>cm</InputGroupText>
                              </InputGroupAddon>
                            </InputGroup>
                            <FieldError errors={[fieldState.error]} />
                          </Field>
                        )}
                      />
                    </div>

                    <Separator />

                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <Controller
                        control={form.control}
                        name="savePackage"
                        render={({ field }) => (
                          <Field
                            orientation="horizontal"
                            className="items-center"
                          >
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={(checked) =>
                                field.onChange(Boolean(checked))
                              }
                            />
                            <FieldContent>
                              <FieldLabel>
                                Save this package for future use
                              </FieldLabel>
                            </FieldContent>
                          </Field>
                        )}
                      />

                      <div className="md:text-right">
                        <p className="text-muted-foreground text-sm">
                          Shipping Item Price
                        </p>
                        <p className="text-lg font-semibold">
                          {formatCurrency(packageMaterialTotal)}
                        </p>
                      </div>
                    </div>
                  </FieldGroup>
                </div>
              </section>

              <section className="flex flex-col gap-4 py-1">
                <div className="flex flex-col gap-1">
                  <h2 className="text-xl font-semibold tracking-tight">
                    Notes
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    Optional packing or handling context.
                  </p>
                </div>

                <Controller
                  control={form.control}
                  name="deliveryNotes"
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <Textarea
                        {...field}
                        id="delivery-notes"
                        aria-invalid={fieldState.invalid}
                        className="min-h-28 resize-y"
                        placeholder="Add internal notes for packing, handling, or delivery."
                      />
                      <FieldError errors={[fieldState.error]} />
                    </Field>
                  )}
                />
              </section>
            </div>

            <div className="flex flex-col gap-6">
              <Card className="rounded-2xl">
                <CardHeader>
                  <CardTitle>Rate Snapshot</CardTitle>
                  <CardDescription>
                    A quick look at how the label total is building.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-medium">
                      {formatCurrency(subtotal)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Insurance</span>
                    <span className="font-medium">
                      {formatCurrency(insuranceTotal)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Packaging</span>
                    <span className="font-medium">
                      {formatCurrency(packageMaterialTotal)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Discount</span>
                    <span className="font-medium">{formatCurrency(0)}</span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-base font-medium">Label Total</span>
                    <span className="text-2xl font-semibold">
                      {formatCurrency(total)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-2xl">
                <CardHeader>
                  <CardTitle>Dispatch Plan</CardTitle>
                  <CardDescription>
                    Decide when this parcel leaves and how quickly the customer
                    hears about it.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-5">
                  <Controller
                    control={form.control}
                    name="shippingDate"
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="shipping-date">
                          Planned handoff date
                        </FieldLabel>
                        <ShippingDateField
                          value={field.value}
                          onChange={field.onChange}
                        />
                        <FieldError errors={[fieldState.error]} />
                      </Field>
                    )}
                  />

                  <Controller
                    control={form.control}
                    name="sendInfoNow"
                    render={({ field }) => (
                      <Field orientation="horizontal" className="items-center">
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={(checked) =>
                            field.onChange(Boolean(checked))
                          }
                        />
                        <FieldContent>
                          <FieldLabel>
                            Send shipping info to customer now
                          </FieldLabel>
                          <FieldDescription>
                            Customers receive the carrier and tracking summary
                            as soon as the label is purchased.
                          </FieldDescription>
                        </FieldContent>
                      </Field>
                    )}
                  />

                  <div className="bg-muted/20 rounded-xl border border-dashed p-4">
                    <p className="text-sm font-medium">Current plan</p>
                    <p className="text-muted-foreground mt-1 text-sm leading-6">
                      {isEdit
                        ? "This label is staged for a next-day handoff with customer messaging enabled and no signature requirement."
                        : "No dispatch timing has been locked yet. Once you choose a carrier and handoff date, the label total will settle here."}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-2xl">
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <CardTitle>Sender Profile</CardTitle>
                    <CardDescription>
                      This origin block will be printed directly on the label.
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-lg"
                    asChild
                  >
                    <Link href="/original/settings/profile">
                      <PencilLine />
                    </Link>
                  </Button>
                </CardHeader>
                <CardContent className="flex flex-col gap-4 text-sm">
                  <div className="flex items-start gap-3">
                    <div className="bg-muted flex size-10 items-center justify-center rounded-lg">
                      <Truck />
                    </div>
                    <div className="space-y-1">
                      <p className="font-medium">Mercer Fulfillment Studio</p>
                      <p className="text-muted-foreground leading-6">
                        2814 Harbor Avenue South
                        <br />
                        Seattle, Washington 98134
                        <br />
                        United States
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export function EcommerceCreateShippingLabel() {
  return <EcommerceShippingLabelEditor mode="create" />;
}

export function EcommerceEditShippingLabel() {
  return <EcommerceShippingLabelEditor mode="edit" />;
}
