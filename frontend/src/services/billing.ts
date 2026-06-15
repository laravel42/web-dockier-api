import { request } from "./request";
import type { BillingDetails } from "../types/billing";

export const billingApi = {
  get: () => request<BillingDetails>("/auth/billing"),

  update: (data: BillingDetails) =>
    request<BillingDetails>("/auth/billing", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
};
