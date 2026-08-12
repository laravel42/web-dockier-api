"use client";

import {
  CreditCard,
  Mail,
  MapPin,
  Phone,
  Plus,
  Trash2,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ScrollSpy,
  ScrollSpyLink,
  ScrollSpyNav,
  ScrollSpySection,
  ScrollSpyViewport,
} from "@/components/ui/scroll-spy";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { type EditableCustomerValues } from "@/lib/ecommerce-edit-customers";
import { cn } from "@/lib/utils";

type CustomerEditorMode = "add" | "edit";

type ContactRow = {
  id: string;
  label: string;
  email: string;
  phone: string;
};

type ShippingAddressRow = {
  id: string;
  label: string;
  recipient: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
};

type SavedCardRow = {
  id: string;
  brand: string;
  last4: string;
  expiry: string;
  holder: string;
  isDefault: boolean;
};

type CustomerEditorState = EditableCustomerValues & {
  contacts: ContactRow[];
  shippingAddresses: ShippingAddressRow[];
  savedCards: SavedCardRow[];
};

type SectionId =
  | "account"
  | "contacts"
  | "billing"
  | "shipping"
  | "payments"
  | "preferences";

const customerSections: {
  id: SectionId;
  label: string;
  description: string;
}[] = [
  {
    id: "account",
    label: "Account",
    description: "Identity, source, and ownership",
  },
  {
    id: "contacts",
    label: "Contacts",
    description: "People and preferred channels",
  },
  {
    id: "billing",
    label: "Billing",
    description: "Invoice destination",
  },
  {
    id: "shipping",
    label: "Shipping",
    description: "Delivery destinations",
  },
  {
    id: "payments",
    label: "Cards",
    description: "Saved payment methods",
  },
  {
    id: "preferences",
    label: "Preferences",
    description: "Segments and internal notes",
  },
];

const sourceOptions: EditableCustomerValues["source"][] = [
  "online-store",
  "subscription",
  "marketplace",
  "retail-partner",
];

const preferredChannelOptions: EditableCustomerValues["preferredChannel"][] = [
  "email",
  "sms",
  "phone",
];

const accountOwnerOptions = [
  "Avery Hall",
  "Riley Chen",
  "Jordan Lee",
  "Mina Patel",
];

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function createEmptyContact(): ContactRow {
  return {
    id: uid("contact"),
    label: "Primary",
    email: "",
    phone: "",
  };
}

function createEmptyShippingAddress(): ShippingAddressRow {
  return {
    id: uid("shipping"),
    label: "Primary shipping",
    recipient: "",
    line1: "",
    line2: "",
    city: "",
    state: "",
    zip: "",
    country: "United States",
  };
}

function createEmptyCard(): SavedCardRow {
  return {
    id: uid("card"),
    brand: "Visa",
    last4: "",
    expiry: "",
    holder: "",
    isDefault: false,
  };
}

function createEmptyCustomerValues(): EditableCustomerValues {
  return {
    firstName: "",
    lastName: "",
    customerId: "CUS-2418",
    company: "",
    status: "active",
    source: "online-store",
    email: "",
    phone: "",
    preferredChannel: "email",
    accountOwner: accountOwnerOptions[0],
    billingName: "",
    billingLine1: "",
    billingLine2: "",
    billingCity: "",
    billingState: "",
    billingZip: "",
    billingCountry: "United States",
    shippingSameAsBilling: false,
    shippingName: "",
    shippingLine1: "",
    shippingLine2: "",
    shippingCity: "",
    shippingState: "",
    shippingZip: "",
    shippingCountry: "United States",
    segments: [],
    notes: "",
    marketingOptIn: true,
  };
}

function createCustomerEditorState(
  initialValues?: EditableCustomerValues,
): CustomerEditorState {
  const base = initialValues ?? createEmptyCustomerValues();

  return {
    ...base,
    segments: [...base.segments],
    contacts: [
      {
        id: uid("contact"),
        label: "Primary",
        email: base.email,
        phone: base.phone,
      },
    ],
    shippingAddresses: [
      {
        id: uid("shipping"),
        label: "Primary shipping",
        recipient: base.shippingSameAsBilling
          ? base.billingName
          : base.shippingName,
        line1: base.shippingSameAsBilling
          ? base.billingLine1
          : base.shippingLine1,
        line2: base.shippingSameAsBilling
          ? base.billingLine2
          : base.shippingLine2,
        city: base.shippingSameAsBilling ? base.billingCity : base.shippingCity,
        state: base.shippingSameAsBilling
          ? base.billingState
          : base.shippingState,
        zip: base.shippingSameAsBilling ? base.billingZip : base.shippingZip,
        country: base.shippingSameAsBilling
          ? base.billingCountry
          : base.shippingCountry,
      },
    ],
    savedCards: initialValues
      ? [
          {
            id: uid("card"),
            brand: "Visa",
            last4: "4242",
            expiry: "08/28",
            holder: `${base.firstName} ${base.lastName}`.trim(),
            isDefault: true,
          },
          {
            id: uid("card"),
            brand: "Amex",
            last4: "1034",
            expiry: "03/29",
            holder: `${base.firstName} ${base.lastName}`.trim(),
            isDefault: false,
          },
        ]
      : [createEmptyCard()],
  };
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-border/60 bg-background rounded-[24px] border p-6 shadow-[0_20px_45px_-34px_rgba(15,23,42,0.16)]">
      <div className="mb-5 space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description ? (
          <p className="text-muted-foreground text-sm leading-6">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-muted-foreground text-[11px] font-medium tracking-[0.18em] uppercase">
      {children}
    </label>
  );
}

const inputClassName =
  "h-11 rounded-xl border-border/60 bg-background shadow-none";

function formatSourceLabel(source: EditableCustomerValues["source"]) {
  if (source === "online-store") return "Online store";
  if (source === "retail-partner") return "Retail partner";
  return source.charAt(0).toUpperCase() + source.slice(1);
}

function formatChannelLabel(
  channel: EditableCustomerValues["preferredChannel"],
) {
  return channel.toUpperCase();
}

export function EcommerceAddCustomer() {
  return <EcommerceCustomerEditor mode="add" />;
}

export function EcommerceEditCustomer({
  initialValues,
}: {
  initialValues: EditableCustomerValues;
  customerId: string;
}) {
  return <EcommerceCustomerEditor mode="edit" initialValues={initialValues} />;
}

function EcommerceCustomerEditor({
  mode,
  initialValues,
}: {
  mode: CustomerEditorMode;
  initialValues?: EditableCustomerValues;
}) {
  const seededValues = React.useMemo(
    () => createCustomerEditorState(initialValues),
    [initialValues],
  );
  const [values, setValues] = React.useState<CustomerEditorState>(seededValues);
  const [segmentInput, setSegmentInput] = React.useState("");

  React.useEffect(() => {
    setValues(createCustomerEditorState(initialValues));
  }, [initialValues]);

  function updateValue<Key extends keyof CustomerEditorState>(
    key: Key,
    nextValue: CustomerEditorState[Key],
  ) {
    setValues((current) => ({ ...current, [key]: nextValue }));
  }

  function updateContact(id: string, key: keyof ContactRow, nextValue: string) {
    setValues((current) => {
      const contacts = current.contacts.map((contact) =>
        contact.id === id ? { ...contact, [key]: nextValue } : contact,
      );

      return {
        ...current,
        contacts,
        email: contacts[0]?.email ?? "",
        phone: contacts[0]?.phone ?? "",
      };
    });
  }

  function addContact() {
    setValues((current) => ({
      ...current,
      contacts: [...current.contacts, createEmptyContact()],
    }));
  }

  function removeContact(id: string) {
    setValues((current) => {
      const contacts =
        current.contacts.length === 1
          ? current.contacts
          : current.contacts.filter((contact) => contact.id !== id);

      return {
        ...current,
        contacts,
        email: contacts[0]?.email ?? "",
        phone: contacts[0]?.phone ?? "",
      };
    });
  }

  function updateShippingAddress(
    id: string,
    key: keyof ShippingAddressRow,
    nextValue: string,
  ) {
    setValues((current) => ({
      ...current,
      shippingAddresses: current.shippingAddresses.map((address) =>
        address.id === id ? { ...address, [key]: nextValue } : address,
      ),
    }));
  }

  function addShippingAddress() {
    setValues((current) => ({
      ...current,
      shippingAddresses: [
        ...current.shippingAddresses,
        createEmptyShippingAddress(),
      ],
    }));
  }

  function removeShippingAddress(id: string) {
    setValues((current) => ({
      ...current,
      shippingAddresses:
        current.shippingAddresses.length === 1
          ? current.shippingAddresses
          : current.shippingAddresses.filter((address) => address.id !== id),
    }));
  }

  function updateCard(id: string, key: keyof SavedCardRow, nextValue: string) {
    setValues((current) => ({
      ...current,
      savedCards: current.savedCards.map((card) =>
        card.id === id ? { ...card, [key]: nextValue } : card,
      ),
    }));
  }

  function addCard() {
    setValues((current) => ({
      ...current,
      savedCards: [...current.savedCards, createEmptyCard()],
    }));
  }

  function removeCard(id: string) {
    setValues((current) => ({
      ...current,
      savedCards:
        current.savedCards.length === 1
          ? current.savedCards
          : current.savedCards.filter((card) => card.id !== id),
    }));
  }

  function makeDefaultCard(id: string, checked: boolean) {
    setValues((current) => ({
      ...current,
      savedCards: current.savedCards.map((card) => ({
        ...card,
        isDefault: checked ? card.id === id : false,
      })),
    }));
  }

  function addSegment() {
    const nextSegment = segmentInput.trim();

    if (!nextSegment || values.segments.includes(nextSegment)) {
      return;
    }

    setValues((current) => ({
      ...current,
      segments: [...current.segments, nextSegment],
    }));
    setSegmentInput("");
  }

  function removeSegment(segment: string) {
    setValues((current) => ({
      ...current,
      segments: current.segments.filter((item) => item !== segment),
    }));
  }

  function resetForm() {
    setValues(createCustomerEditorState(initialValues));
    setSegmentInput("");
  }

  return (
    <div className="bg-background flex min-h-0 flex-1 flex-col overflow-hidden">
      <ScrollSpy
        defaultValue="account"
        className="min-h-0 flex-1 overflow-hidden"
        offset={24}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4 sm:p-6 md:p-8">
          <div className="mx-auto flex min-h-0 w-full max-w-[1360px] flex-1 flex-col gap-6">
            <header className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
              <div className="flex max-w-4xl flex-col gap-3">
                <div className="flex items-center gap-3 text-sm md:hidden">
                  <span className="text-foreground font-medium">Customers</span>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-muted-foreground">
                    {mode === "edit" ? "Edit Customer" : "Add Customer"}
                  </span>
                </div>

                <div className="flex flex-col gap-1">
                  <h1 className="text-3xl font-semibold tracking-tight">
                    {mode === "edit" ? "Edit Customer" : "Add New Customer"}
                  </h1>
                  <p className="text-muted-foreground max-w-2xl text-sm">
                    Add the account, contacts, addresses, and payment methods
                    the team needs to operate this customer.
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2 self-start xl:self-center">
                <Button
                  variant="outline"
                  className="h-10 rounded-full px-4"
                  onClick={resetForm}
                >
                  {mode === "edit" ? "Reset changes" : "Reset form"}
                </Button>
                <Button variant="outline" className="h-10 rounded-full px-4">
                  Save draft
                </Button>
                <Button className="h-10 rounded-full px-5">
                  {mode === "edit" ? "Save customer" : "Create customer"}
                </Button>
              </div>
            </header>

            <div className="grid min-h-0 flex-1 gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
              <aside className="hidden lg:block">
                <div className="sticky top-0">
                  <ScrollSpyNav className="border-border/60 bg-background rounded-2xl border p-3">
                    {customerSections.map((section) => (
                      <ScrollSpyLink
                        key={section.id}
                        value={section.id}
                        className={cn(
                          "rounded-xl border px-4 py-3 text-left transition-colors",
                          "data-[state=active]:border-foreground data-[state=active]:bg-foreground data-[state=active]:text-background",
                          "data-[state=inactive]:text-foreground/80 data-[state=inactive]:hover:border-border/60 data-[state=inactive]:hover:bg-muted/35 data-[state=inactive]:hover:text-foreground data-[state=inactive]:border-transparent",
                        )}
                      >
                        <p className="text-[15px] font-medium">
                          {section.label}
                        </p>
                      </ScrollSpyLink>
                    ))}
                  </ScrollSpyNav>
                </div>
              </aside>

              <div className="min-h-0 overflow-hidden">
                <div className="mb-4 flex gap-2 overflow-x-auto pb-1 lg:hidden">
                  {customerSections.map((section) => (
                    <ScrollSpyLink
                      key={section.id}
                      value={section.id}
                      className={cn(
                        "shrink-0 rounded-full border px-3 py-2 text-sm transition-colors",
                        "data-[state=active]:border-foreground data-[state=active]:bg-foreground data-[state=active]:text-background",
                        "data-[state=inactive]:border-border/60 data-[state=inactive]:bg-background",
                      )}
                    >
                      {section.label}
                    </ScrollSpyLink>
                  ))}
                </div>

                <ScrollSpyViewport className="h-full overflow-y-auto pr-2">
                  <div className="space-y-6 pb-24">
                    <ScrollSpySection value="account">
                      <SectionCard
                        title="Account"
                        description="Identity, source, and internal ownership for this customer record."
                      >
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                          <div className="grid gap-2">
                            <FieldLabel>First name</FieldLabel>
                            <Input
                              value={values.firstName}
                              onChange={(event) =>
                                updateValue("firstName", event.target.value)
                              }
                              className={inputClassName}
                            />
                          </div>
                          <div className="grid gap-2">
                            <FieldLabel>Last name</FieldLabel>
                            <Input
                              value={values.lastName}
                              onChange={(event) =>
                                updateValue("lastName", event.target.value)
                              }
                              className={inputClassName}
                            />
                          </div>
                          <div className="grid gap-2">
                            <FieldLabel>Customer ID</FieldLabel>
                            <Input
                              value={values.customerId}
                              onChange={(event) =>
                                updateValue("customerId", event.target.value)
                              }
                              className={inputClassName}
                            />
                          </div>
                          <div className="grid gap-2">
                            <FieldLabel>Company</FieldLabel>
                            <Input
                              value={values.company}
                              onChange={(event) =>
                                updateValue("company", event.target.value)
                              }
                              className={inputClassName}
                            />
                          </div>
                          <div className="grid gap-2">
                            <FieldLabel>Status</FieldLabel>
                            <Select
                              value={values.status}
                              onValueChange={(value) =>
                                updateValue(
                                  "status",
                                  value as EditableCustomerValues["status"],
                                )
                              }
                            >
                              <SelectTrigger className={inputClassName}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="active">Active</SelectItem>
                                <SelectItem value="vip">VIP</SelectItem>
                                <SelectItem value="at-risk">At risk</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid gap-2">
                            <FieldLabel>Source</FieldLabel>
                            <Select
                              value={values.source}
                              onValueChange={(value) =>
                                updateValue(
                                  "source",
                                  value as EditableCustomerValues["source"],
                                )
                              }
                            >
                              <SelectTrigger className={inputClassName}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {sourceOptions.map((source) => (
                                  <SelectItem key={source} value={source}>
                                    {formatSourceLabel(source)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid gap-2 xl:col-span-3">
                            <FieldLabel>Account owner</FieldLabel>
                            <Select
                              value={values.accountOwner}
                              onValueChange={(value) =>
                                updateValue("accountOwner", value)
                              }
                            >
                              <SelectTrigger className={inputClassName}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {accountOwnerOptions.map((owner) => (
                                  <SelectItem key={owner} value={owner}>
                                    {owner}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </SectionCard>
                    </ScrollSpySection>

                    <ScrollSpySection value="contacts">
                      <SectionCard
                        title="Contacts"
                        description="Keep the real people and preferred communication path attached to the account."
                      >
                        <div className="border-border/60 bg-muted/15 mb-5 grid gap-4 rounded-2xl border p-4 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
                          <div className="grid gap-1">
                            <p className="text-sm font-medium">
                              Primary channel
                            </p>
                            <p className="text-muted-foreground text-sm leading-6">
                              Choose how the team usually reaches this customer.
                            </p>
                          </div>
                          <div className="grid gap-2">
                            <FieldLabel>Preferred channel</FieldLabel>
                            <Select
                              value={values.preferredChannel}
                              onValueChange={(value) =>
                                updateValue(
                                  "preferredChannel",
                                  value as EditableCustomerValues["preferredChannel"],
                                )
                              }
                            >
                              <SelectTrigger className={inputClassName}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {preferredChannelOptions.map((channel) => (
                                  <SelectItem key={channel} value={channel}>
                                    {formatChannelLabel(channel)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="border-border/60 bg-background flex items-center justify-between rounded-xl border px-4 py-3">
                            <div>
                              <p className="text-sm font-medium">
                                Marketing opt-in
                              </p>
                              <p className="text-muted-foreground text-xs">
                                Include this customer in campaign sends
                              </p>
                            </div>
                            <Switch
                              checked={values.marketingOptIn}
                              onCheckedChange={(checked) =>
                                updateValue("marketingOptIn", checked)
                              }
                            />
                          </div>
                        </div>

                        <div className="space-y-4">
                          {values.contacts.map((contact) => (
                            <div
                              key={contact.id}
                              className="border-border/60 bg-background rounded-2xl border p-4"
                            >
                              <div className="mb-4 flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                  <div className="border-border/60 bg-muted/20 flex h-10 w-10 items-center justify-center rounded-2xl border">
                                    <UserRound className="size-4" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium">
                                      {contact.label || "Contact"}
                                    </p>
                                    <p className="text-muted-foreground text-xs">
                                      Customer contact
                                    </p>
                                  </div>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="size-8 rounded-xl"
                                  onClick={() => removeContact(contact.id)}
                                  disabled={values.contacts.length === 1}
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </div>

                              <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)_220px]">
                                <div className="grid gap-2">
                                  <FieldLabel>Label</FieldLabel>
                                  <Input
                                    value={contact.label}
                                    onChange={(event) =>
                                      updateContact(
                                        contact.id,
                                        "label",
                                        event.target.value,
                                      )
                                    }
                                    className={inputClassName}
                                  />
                                </div>
                                <div className="grid gap-2">
                                  <FieldLabel>Email</FieldLabel>
                                  <div className="relative">
                                    <Mail className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                                    <Input
                                      value={contact.email}
                                      onChange={(event) =>
                                        updateContact(
                                          contact.id,
                                          "email",
                                          event.target.value,
                                        )
                                      }
                                      className={cn(inputClassName, "pl-9")}
                                    />
                                  </div>
                                </div>
                                <div className="grid gap-2">
                                  <FieldLabel>Phone</FieldLabel>
                                  <div className="relative">
                                    <Phone className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                                    <Input
                                      value={contact.phone}
                                      onChange={(event) =>
                                        updateContact(
                                          contact.id,
                                          "phone",
                                          event.target.value,
                                        )
                                      }
                                      className={cn(inputClassName, "pl-9")}
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}

                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-full"
                            onClick={addContact}
                          >
                            <Plus className="size-4" />
                            Add contact
                          </Button>
                        </div>
                      </SectionCard>
                    </ScrollSpySection>

                    <ScrollSpySection value="billing">
                      <SectionCard
                        title="Billing address"
                        description="Where invoices, statements, and account paperwork should land."
                      >
                        <div className="grid gap-4 md:grid-cols-2">
                          <Input
                            value={values.billingName}
                            onChange={(event) =>
                              updateValue("billingName", event.target.value)
                            }
                            className={inputClassName}
                            placeholder="Billing contact name"
                          />
                          <div className="hidden md:block" />
                          <Input
                            value={values.billingLine1}
                            onChange={(event) =>
                              updateValue("billingLine1", event.target.value)
                            }
                            className={cn(inputClassName, "md:col-span-2")}
                            placeholder="Street address"
                          />
                          <Input
                            value={values.billingLine2}
                            onChange={(event) =>
                              updateValue("billingLine2", event.target.value)
                            }
                            className={cn(inputClassName, "md:col-span-2")}
                            placeholder="Suite, building, floor"
                          />
                          <Input
                            value={values.billingCity}
                            onChange={(event) =>
                              updateValue("billingCity", event.target.value)
                            }
                            className={inputClassName}
                            placeholder="City"
                          />
                          <Input
                            value={values.billingState}
                            onChange={(event) =>
                              updateValue("billingState", event.target.value)
                            }
                            className={inputClassName}
                            placeholder="State"
                          />
                          <Input
                            value={values.billingZip}
                            onChange={(event) =>
                              updateValue("billingZip", event.target.value)
                            }
                            className={inputClassName}
                            placeholder="ZIP code"
                          />
                          <Input
                            value={values.billingCountry}
                            onChange={(event) =>
                              updateValue("billingCountry", event.target.value)
                            }
                            className={inputClassName}
                            placeholder="Country"
                          />
                        </div>
                      </SectionCard>
                    </ScrollSpySection>

                    <ScrollSpySection value="shipping">
                      <SectionCard
                        title="Shipping addresses"
                        description="Keep delivery points separate so repeat orders can route cleanly."
                      >
                        <div className="space-y-4">
                          {values.shippingAddresses.map((address) => (
                            <div
                              key={address.id}
                              className="border-border/60 bg-background rounded-2xl border p-4"
                            >
                              <div className="mb-4 flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                  <div className="border-border/60 bg-muted/20 flex h-10 w-10 items-center justify-center rounded-2xl border">
                                    <MapPin className="size-4" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium">
                                      {address.label || "Shipping address"}
                                    </p>
                                    <p className="text-muted-foreground text-xs">
                                      Delivery destination
                                    </p>
                                  </div>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="size-8 rounded-xl"
                                  onClick={() =>
                                    removeShippingAddress(address.id)
                                  }
                                  disabled={
                                    values.shippingAddresses.length === 1
                                  }
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </div>

                              <div className="grid gap-4 md:grid-cols-2">
                                <Input
                                  value={address.label}
                                  onChange={(event) =>
                                    updateShippingAddress(
                                      address.id,
                                      "label",
                                      event.target.value,
                                    )
                                  }
                                  className={inputClassName}
                                  placeholder="Label"
                                />
                                <Input
                                  value={address.recipient}
                                  onChange={(event) =>
                                    updateShippingAddress(
                                      address.id,
                                      "recipient",
                                      event.target.value,
                                    )
                                  }
                                  className={inputClassName}
                                  placeholder="Recipient"
                                />
                                <Input
                                  value={address.line1}
                                  onChange={(event) =>
                                    updateShippingAddress(
                                      address.id,
                                      "line1",
                                      event.target.value,
                                    )
                                  }
                                  className={cn(
                                    inputClassName,
                                    "md:col-span-2",
                                  )}
                                  placeholder="Street address"
                                />
                                <Input
                                  value={address.line2}
                                  onChange={(event) =>
                                    updateShippingAddress(
                                      address.id,
                                      "line2",
                                      event.target.value,
                                    )
                                  }
                                  className={cn(
                                    inputClassName,
                                    "md:col-span-2",
                                  )}
                                  placeholder="Suite, building, floor"
                                />
                                <Input
                                  value={address.city}
                                  onChange={(event) =>
                                    updateShippingAddress(
                                      address.id,
                                      "city",
                                      event.target.value,
                                    )
                                  }
                                  className={inputClassName}
                                  placeholder="City"
                                />
                                <Input
                                  value={address.state}
                                  onChange={(event) =>
                                    updateShippingAddress(
                                      address.id,
                                      "state",
                                      event.target.value,
                                    )
                                  }
                                  className={inputClassName}
                                  placeholder="State"
                                />
                                <Input
                                  value={address.zip}
                                  onChange={(event) =>
                                    updateShippingAddress(
                                      address.id,
                                      "zip",
                                      event.target.value,
                                    )
                                  }
                                  className={inputClassName}
                                  placeholder="ZIP code"
                                />
                                <Input
                                  value={address.country}
                                  onChange={(event) =>
                                    updateShippingAddress(
                                      address.id,
                                      "country",
                                      event.target.value,
                                    )
                                  }
                                  className={inputClassName}
                                  placeholder="Country"
                                />
                              </div>
                            </div>
                          ))}
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          className="mt-5 rounded-full"
                          onClick={addShippingAddress}
                        >
                          <Plus className="size-4" />
                          Add shipping address
                        </Button>
                      </SectionCard>
                    </ScrollSpySection>

                    <ScrollSpySection value="payments">
                      <SectionCard
                        title="Saved cards"
                        description="Keep one default payment method visible, with backups underneath."
                      >
                        <div className="space-y-4">
                          {values.savedCards.map((card) => (
                            <div
                              key={card.id}
                              className="border-border/60 bg-background rounded-2xl border p-4"
                            >
                              <div className="mb-4 flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                  <div className="border-border/60 bg-muted/20 flex h-10 w-10 items-center justify-center rounded-2xl border">
                                    <CreditCard className="size-4" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium">
                                      {card.brand} ending in{" "}
                                      {card.last4 || "0000"}
                                    </p>
                                    <p className="text-muted-foreground text-xs">
                                      {card.isDefault
                                        ? "Default payment source"
                                        : "Backup payment source"}
                                    </p>
                                  </div>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="size-8 rounded-xl"
                                  onClick={() => removeCard(card.id)}
                                  disabled={values.savedCards.length === 1}
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </div>

                              <div className="grid gap-4 md:grid-cols-[150px_120px_120px_minmax(0,1fr)]">
                                <Select
                                  value={card.brand}
                                  onValueChange={(value) =>
                                    updateCard(card.id, "brand", value)
                                  }
                                >
                                  <SelectTrigger className={inputClassName}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="Visa">Visa</SelectItem>
                                    <SelectItem value="Mastercard">
                                      Mastercard
                                    </SelectItem>
                                    <SelectItem value="Amex">Amex</SelectItem>
                                    <SelectItem value="Discover">
                                      Discover
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                                <Input
                                  value={card.last4}
                                  onChange={(event) =>
                                    updateCard(
                                      card.id,
                                      "last4",
                                      event.target.value,
                                    )
                                  }
                                  className={inputClassName}
                                  placeholder="Last 4"
                                />
                                <Input
                                  value={card.expiry}
                                  onChange={(event) =>
                                    updateCard(
                                      card.id,
                                      "expiry",
                                      event.target.value,
                                    )
                                  }
                                  className={inputClassName}
                                  placeholder="MM/YY"
                                />
                                <Input
                                  value={card.holder}
                                  onChange={(event) =>
                                    updateCard(
                                      card.id,
                                      "holder",
                                      event.target.value,
                                    )
                                  }
                                  className={inputClassName}
                                  placeholder="Cardholder"
                                />
                              </div>

                              <div className="border-border/60 bg-muted/10 mt-4 flex items-center justify-between rounded-xl border px-4 py-3">
                                <div>
                                  <p className="text-sm font-medium">
                                    Default card
                                  </p>
                                  <p className="text-muted-foreground text-xs">
                                    Keep one preferred payment method pinned.
                                  </p>
                                </div>
                                <Switch
                                  checked={card.isDefault}
                                  onCheckedChange={(checked) =>
                                    makeDefaultCard(card.id, checked)
                                  }
                                />
                              </div>
                            </div>
                          ))}
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          className="mt-5 rounded-full"
                          onClick={addCard}
                        >
                          <Plus className="size-4" />
                          Add card
                        </Button>
                      </SectionCard>
                    </ScrollSpySection>

                    <ScrollSpySection value="preferences">
                      <SectionCard
                        title="Preferences & notes"
                        description="Segments, internal notes, and lightweight account context."
                      >
                        <div className="grid gap-6">
                          <div className="grid gap-3">
                            <div className="grid gap-2">
                              <FieldLabel>Segments</FieldLabel>
                              <div className="flex flex-wrap gap-2">
                                {values.segments.map((segment) => (
                                  <Badge
                                    key={segment}
                                    variant="secondary"
                                    className="rounded-full px-3 py-1"
                                  >
                                    {segment}
                                    <button
                                      type="button"
                                      className="ml-2"
                                      onClick={() => removeSegment(segment)}
                                    >
                                      x
                                    </button>
                                  </Badge>
                                ))}
                              </div>
                            </div>

                            <div className="flex flex-col gap-3 sm:flex-row">
                              <Input
                                value={segmentInput}
                                onChange={(event) =>
                                  setSegmentInput(event.target.value)
                                }
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    addSegment();
                                  }
                                }}
                                className={cn(inputClassName, "sm:flex-1")}
                                placeholder="Add segment"
                              />
                              <Button
                                type="button"
                                variant="outline"
                                className="rounded-full"
                                onClick={addSegment}
                              >
                                <Plus className="size-4" />
                                Add segment
                              </Button>
                            </div>
                          </div>

                          <div className="grid gap-2">
                            <FieldLabel>Notes</FieldLabel>
                            <Textarea
                              value={values.notes}
                              onChange={(event) =>
                                updateValue("notes", event.target.value)
                              }
                              className="border-border/60 bg-background min-h-36 rounded-2xl"
                              placeholder="Internal notes"
                            />
                          </div>
                        </div>
                      </SectionCard>
                    </ScrollSpySection>
                  </div>
                </ScrollSpyViewport>
              </div>
            </div>
          </div>
        </div>
      </ScrollSpy>

      <footer className="border-border/70 bg-background border-t px-6 py-4">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button asChild variant="ghost" className="rounded-full">
            <Link href="/ecommerce/customer-list-1">Cancel</Link>
          </Button>
          <Button className="rounded-full px-6">
            {mode === "edit" ? "Save customer" : "Create customer"}
          </Button>
        </div>
      </footer>
    </div>
  );
}
