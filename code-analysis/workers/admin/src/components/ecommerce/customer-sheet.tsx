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
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { type EditableCustomerValues } from "@/lib/ecommerce-edit-customers";

type CustomerSheetMode = "add" | "edit";

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

type CustomerSheetState = {
  firstName: string;
  lastName: string;
  customerId: string;
  company: string;
  status: EditableCustomerValues["status"];
  contacts: ContactRow[];
  billingName: string;
  billingLine1: string;
  billingLine2: string;
  billingCity: string;
  billingState: string;
  billingZip: string;
  billingCountry: string;
  shippingAddresses: ShippingAddressRow[];
  savedCards: SavedCardRow[];
  notes: string;
};

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

function buildSheetState(
  mode: CustomerSheetMode,
  initialValues?: EditableCustomerValues,
): CustomerSheetState {
  if (!initialValues) {
    return {
      firstName: "",
      lastName: "",
      customerId: "CUS-2418",
      company: "",
      status: "active",
      contacts: [createEmptyContact()],
      billingName: "",
      billingLine1: "",
      billingLine2: "",
      billingCity: "",
      billingState: "",
      billingZip: "",
      billingCountry: "United States",
      shippingAddresses: [createEmptyShippingAddress()],
      savedCards: [createEmptyCard()],
      notes: "",
    };
  }

  const contactRows: ContactRow[] = [
    {
      id: uid("contact"),
      label: "Primary",
      email: initialValues.email,
      phone: initialValues.phone,
    },
  ];

  const shippingRows: ShippingAddressRow[] = [
    {
      id: uid("shipping"),
      label: "Primary shipping",
      recipient: initialValues.shippingSameAsBilling
        ? initialValues.billingName
        : initialValues.shippingName,
      line1: initialValues.shippingSameAsBilling
        ? initialValues.billingLine1
        : initialValues.shippingLine1,
      line2: initialValues.shippingSameAsBilling
        ? initialValues.billingLine2
        : initialValues.shippingLine2,
      city: initialValues.shippingSameAsBilling
        ? initialValues.billingCity
        : initialValues.shippingCity,
      state: initialValues.shippingSameAsBilling
        ? initialValues.billingState
        : initialValues.shippingState,
      zip: initialValues.shippingSameAsBilling
        ? initialValues.billingZip
        : initialValues.shippingZip,
      country: initialValues.shippingSameAsBilling
        ? initialValues.billingCountry
        : initialValues.shippingCountry,
    },
  ];

  const seededCards: SavedCardRow[] =
    mode === "edit"
      ? [
          {
            id: uid("card"),
            brand: "Visa",
            last4: "4242",
            expiry: "08/28",
            holder: `${initialValues.firstName} ${initialValues.lastName}`,
            isDefault: true,
          },
          {
            id: uid("card"),
            brand: "Amex",
            last4: "1034",
            expiry: "03/29",
            holder: `${initialValues.firstName} ${initialValues.lastName}`,
            isDefault: false,
          },
        ]
      : [createEmptyCard()];

  return {
    firstName: initialValues.firstName,
    lastName: initialValues.lastName,
    customerId: initialValues.customerId,
    company: initialValues.company,
    status: initialValues.status,
    contacts: contactRows,
    billingName: initialValues.billingName,
    billingLine1: initialValues.billingLine1,
    billingLine2: initialValues.billingLine2,
    billingCity: initialValues.billingCity,
    billingState: initialValues.billingState,
    billingZip: initialValues.billingZip,
    billingCountry: initialValues.billingCountry,
    shippingAddresses: shippingRows,
    savedCards: seededCards,
    notes: initialValues.notes,
  };
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-sm font-medium">{children}</label>;
}

export function CustomerSheet({
  children,
  mode,
  initialValues,
  open: controlledOpen,
  onOpenChange,
}: {
  children?: React.ReactNode;
  mode: CustomerSheetMode;
  initialValues?: EditableCustomerValues;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const seededState = React.useMemo(
    () => buildSheetState(mode, initialValues),
    [initialValues, mode],
  );
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const [values, setValues] = React.useState<CustomerSheetState>(seededState);

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange?.(nextOpen);

    if (controlledOpen === undefined) {
      setUncontrolledOpen(nextOpen);
    }
  }

  React.useEffect(() => {
    if (open) {
      setValues(buildSheetState(mode, initialValues));
    }
  }, [open, mode, initialValues]);

  function updateValue<Key extends keyof CustomerSheetState>(
    key: Key,
    nextValue: CustomerSheetState[Key],
  ) {
    setValues((current) => ({ ...current, [key]: nextValue }));
  }

  function updateContact(id: string, key: keyof ContactRow, nextValue: string) {
    setValues((current) => ({
      ...current,
      contacts: current.contacts.map((contact) =>
        contact.id === id ? { ...contact, [key]: nextValue } : contact,
      ),
    }));
  }

  function addContact() {
    setValues((current) => ({
      ...current,
      contacts: [...current.contacts, createEmptyContact()],
    }));
  }

  function removeContact(id: string) {
    setValues((current) => ({
      ...current,
      contacts:
        current.contacts.length === 1
          ? current.contacts
          : current.contacts.filter((contact) => contact.id !== id),
    }));
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

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      {children ? <SheetTrigger asChild>{children}</SheetTrigger> : null}
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-3xl">
        <SheetHeader className="border-border/70 border-b pr-8 pb-5">
          <SheetTitle className="text-2xl tracking-tight">
            {mode === "edit" ? "Edit Customer" : "Add Customer"}
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="grid gap-6 px-1 py-6">
            <Card className="rounded-2xl shadow-none">
              <CardHeader className="gap-2">
                <CardTitle className="text-base">Customer basics</CardTitle>
                <CardDescription>
                  Keep the profile small and operational: name, account id, and
                  the few fields the team actually uses.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <SectionLabel>First name</SectionLabel>
                  <Input
                    value={values.firstName}
                    onChange={(event) =>
                      updateValue("firstName", event.target.value)
                    }
                    className="h-11 rounded-xl"
                  />
                </div>
                <div className="grid gap-2">
                  <SectionLabel>Last name</SectionLabel>
                  <Input
                    value={values.lastName}
                    onChange={(event) =>
                      updateValue("lastName", event.target.value)
                    }
                    className="h-11 rounded-xl"
                  />
                </div>
                <div className="grid gap-2">
                  <SectionLabel>Customer ID</SectionLabel>
                  <Input
                    value={values.customerId}
                    onChange={(event) =>
                      updateValue("customerId", event.target.value)
                    }
                    className="h-11 rounded-xl"
                  />
                </div>
                <div className="grid gap-2">
                  <SectionLabel>Company</SectionLabel>
                  <Input
                    value={values.company}
                    onChange={(event) =>
                      updateValue("company", event.target.value)
                    }
                    className="h-11 rounded-xl"
                  />
                </div>
                <div className="grid gap-2">
                  <SectionLabel>Status</SectionLabel>
                  <Select
                    value={values.status}
                    onValueChange={(value) =>
                      updateValue(
                        "status",
                        value as EditableCustomerValues["status"],
                      )
                    }
                  >
                    <SelectTrigger className="h-11 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="vip">VIP</SelectItem>
                      <SelectItem value="at-risk">At risk</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-none">
              <CardHeader className="gap-2">
                <CardTitle className="text-base">Contact details</CardTitle>
                <CardDescription>
                  Contacts are stored as a small repeatable list so support and
                  sales can keep one or two real people on the account.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                {values.contacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="border-border/60 rounded-xl border p-4"
                  >
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <UserRound className="size-4" />
                        Contact
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 rounded-lg"
                        onClick={() => removeContact(contact.id)}
                        disabled={values.contacts.length === 1}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)_220px]">
                      <div className="grid gap-2">
                        <SectionLabel>Label</SectionLabel>
                        <Input
                          value={contact.label}
                          onChange={(event) =>
                            updateContact(
                              contact.id,
                              "label",
                              event.target.value,
                            )
                          }
                          className="h-11 rounded-xl"
                        />
                      </div>
                      <div className="grid gap-2">
                        <SectionLabel>Email</SectionLabel>
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
                            className="h-11 rounded-xl pl-9"
                          />
                        </div>
                      </div>
                      <div className="grid gap-2">
                        <SectionLabel>Phone</SectionLabel>
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
                            className="h-11 rounded-xl pl-9"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="ghost"
                  className="w-fit rounded-lg px-0 text-sm font-medium"
                  onClick={addContact}
                >
                  <Plus className="size-4" />
                  Add contact
                </Button>
              </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-none">
              <CardHeader className="gap-2">
                <CardTitle className="text-base">Billing address</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <Input
                  value={values.billingName}
                  onChange={(event) =>
                    updateValue("billingName", event.target.value)
                  }
                  className="h-11 rounded-xl"
                  placeholder="Billing contact name"
                />
                <Input
                  value={values.billingLine1}
                  onChange={(event) =>
                    updateValue("billingLine1", event.target.value)
                  }
                  className="h-11 rounded-xl"
                  placeholder="Street address"
                />
                <Input
                  value={values.billingLine2}
                  onChange={(event) =>
                    updateValue("billingLine2", event.target.value)
                  }
                  className="h-11 rounded-xl"
                  placeholder="Suite, building, floor"
                />
                <div className="grid gap-4 md:grid-cols-2">
                  <Input
                    value={values.billingCity}
                    onChange={(event) =>
                      updateValue("billingCity", event.target.value)
                    }
                    className="h-11 rounded-xl"
                    placeholder="City"
                  />
                  <Input
                    value={values.billingState}
                    onChange={(event) =>
                      updateValue("billingState", event.target.value)
                    }
                    className="h-11 rounded-xl"
                    placeholder="State"
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Input
                    value={values.billingZip}
                    onChange={(event) =>
                      updateValue("billingZip", event.target.value)
                    }
                    className="h-11 rounded-xl"
                    placeholder="ZIP code"
                  />
                  <Input
                    value={values.billingCountry}
                    onChange={(event) =>
                      updateValue("billingCountry", event.target.value)
                    }
                    className="h-11 rounded-xl"
                    placeholder="Country"
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-none">
              <CardHeader className="gap-2">
                <CardTitle className="text-base">Shipping addresses</CardTitle>
                <CardDescription>
                  Shipping is a repeatable list, so one customer can keep more
                  than one delivery destination without turning the form into a
                  maze.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                {values.shippingAddresses.map((address) => (
                  <div
                    key={address.id}
                    className="border-border/60 rounded-xl border p-4"
                  >
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <MapPin className="size-4" />
                        Shipping address
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 rounded-lg"
                        onClick={() => removeShippingAddress(address.id)}
                        disabled={values.shippingAddresses.length === 1}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>

                    <div className="grid gap-4">
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
                          className="h-11 rounded-xl"
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
                          className="h-11 rounded-xl"
                          placeholder="Recipient"
                        />
                      </div>
                      <Input
                        value={address.line1}
                        onChange={(event) =>
                          updateShippingAddress(
                            address.id,
                            "line1",
                            event.target.value,
                          )
                        }
                        className="h-11 rounded-xl"
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
                        className="h-11 rounded-xl"
                        placeholder="Suite, building, floor"
                      />
                      <div className="grid gap-4 md:grid-cols-2">
                        <Input
                          value={address.city}
                          onChange={(event) =>
                            updateShippingAddress(
                              address.id,
                              "city",
                              event.target.value,
                            )
                          }
                          className="h-11 rounded-xl"
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
                          className="h-11 rounded-xl"
                          placeholder="State"
                        />
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <Input
                          value={address.zip}
                          onChange={(event) =>
                            updateShippingAddress(
                              address.id,
                              "zip",
                              event.target.value,
                            )
                          }
                          className="h-11 rounded-xl"
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
                          className="h-11 rounded-xl"
                          placeholder="Country"
                        />
                      </div>
                    </div>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="ghost"
                  className="w-fit rounded-lg px-0 text-sm font-medium"
                  onClick={addShippingAddress}
                >
                  <Plus className="size-4" />
                  Add shipping address
                </Button>
              </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-none">
              <CardHeader className="gap-2">
                <CardTitle className="text-base">Saved cards</CardTitle>
                <CardDescription>
                  Cards are a repeatable list too, so billing can keep a default
                  card plus backups without stuffing them into one field.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                {values.savedCards.map((card) => (
                  <div
                    key={card.id}
                    className="border-border/60 rounded-xl border p-4"
                  >
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <CreditCard className="size-4" />
                        Payment card
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 rounded-lg"
                        onClick={() => removeCard(card.id)}
                        disabled={values.savedCards.length === 1}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-[160px_120px_120px_minmax(0,1fr)]">
                      <Select
                        value={card.brand}
                        onValueChange={(value) =>
                          updateCard(card.id, "brand", value)
                        }
                      >
                        <SelectTrigger className="h-11 rounded-xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Visa">Visa</SelectItem>
                          <SelectItem value="Mastercard">Mastercard</SelectItem>
                          <SelectItem value="Amex">Amex</SelectItem>
                          <SelectItem value="Discover">Discover</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        value={card.last4}
                        onChange={(event) =>
                          updateCard(card.id, "last4", event.target.value)
                        }
                        className="h-11 rounded-xl"
                        placeholder="Last 4"
                      />
                      <Input
                        value={card.expiry}
                        onChange={(event) =>
                          updateCard(card.id, "expiry", event.target.value)
                        }
                        className="h-11 rounded-xl"
                        placeholder="MM/YY"
                      />
                      <Input
                        value={card.holder}
                        onChange={(event) =>
                          updateCard(card.id, "holder", event.target.value)
                        }
                        className="h-11 rounded-xl"
                        placeholder="Cardholder"
                      />
                    </div>

                    <div className="border-border/60 mt-4 flex items-center justify-between rounded-xl border px-4 py-3">
                      <p className="text-sm font-medium">Default card</p>
                      <Switch
                        checked={card.isDefault}
                        onCheckedChange={(checked) =>
                          makeDefaultCard(card.id, checked)
                        }
                      />
                    </div>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="ghost"
                  className="w-fit rounded-lg px-0 text-sm font-medium"
                  onClick={addCard}
                >
                  <Plus className="size-4" />
                  Add card
                </Button>
              </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-none">
              <CardHeader className="gap-2">
                <CardTitle className="text-base">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={values.notes}
                  onChange={(event) => updateValue("notes", event.target.value)}
                  className="min-h-28 rounded-2xl"
                  placeholder="Customer notes"
                />
              </CardContent>
            </Card>
          </div>
        </ScrollArea>

        <SheetFooter className="border-border/70 border-t pt-4 sm:justify-between sm:space-x-0">
          <SheetClose asChild>
            <Button variant="ghost" className="rounded-lg">
              Cancel
            </Button>
          </SheetClose>
          <SheetClose asChild>
            <Button className="rounded-lg px-8">
              {mode === "edit" ? "Save customer" : "Create customer"}
            </Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
