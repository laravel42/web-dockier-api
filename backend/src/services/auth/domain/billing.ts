import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { createDomainErrorClass } from "../../../shared/supabase/errors.js";
import { throwOnError, unwrapQuery } from "../../../shared/supabase/query.js";
import type { Json } from "../../../shared/supabase/types.js";

export const BillingError = createDomainErrorClass<"not_found" | "forbidden" | "bad_request" | "internal">("BillingError");
export type BillingError = InstanceType<typeof BillingError>;

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

function normalizeBilling(raw: unknown): BillingDetails {
  const fallback = emptyBillingDetails();
  if (!raw || typeof raw !== "object") return fallback;

  const data = raw as Record<string, unknown>;
  return {
    companyName: typeof data.companyName === "string" ? data.companyName : "",
    legalName: typeof data.legalName === "string" ? data.legalName : "",
    taxId: typeof data.taxId === "string" ? data.taxId : "",
    addressLine1: typeof data.addressLine1 === "string" ? data.addressLine1 : "",
    addressLine2: typeof data.addressLine2 === "string" ? data.addressLine2 : "",
    city: typeof data.city === "string" ? data.city : "",
    state: typeof data.state === "string" ? data.state : "",
    postalCode: typeof data.postalCode === "string" ? data.postalCode : "",
    country: typeof data.country === "string" ? data.country : "",
    billingEmail: typeof data.billingEmail === "string" ? data.billingEmail : "",
  };
}

export async function getBillingDetails(tenantId: string): Promise<BillingDetails> {
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select("billing")
    .eq("id", tenantId)
    .maybeSingle();

  const row = unwrapQuery(data, error, BillingError, {
    notFoundMsg: "Organization not found",
    internalMsg: "Failed to load billing details",
  });

  return normalizeBilling(row.billing);
}

export async function updateBillingDetails(tenantId: string, details: BillingDetails): Promise<BillingDetails> {
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .update({ billing: details as unknown as Json })
    .eq("id", tenantId)
    .select("billing")
    .maybeSingle();

  throwOnError(error, BillingError, { internalMsg: "Failed to update billing details" });
  if (!data) throw new BillingError("Organization not found", "not_found");

  return normalizeBilling(data.billing);
}
