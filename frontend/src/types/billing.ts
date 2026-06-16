export interface BillingDetails {
  companyName: string;
  legalName: string;
  taxId: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  billingEmail: string;
}

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
