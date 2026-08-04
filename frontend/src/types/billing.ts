export type { BillingDetails } from "@dockier/shared-types";
import type { BillingDetails } from "@dockier/shared-types";

export const emptyBillingDetails = (): BillingDetails => ({
  companyName: "",
  legalName: "",
  taxId: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "",
  billingEmail: "",
});
