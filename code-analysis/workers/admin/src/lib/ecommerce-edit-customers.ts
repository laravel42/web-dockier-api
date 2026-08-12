export type EditableCustomerValues = {
  firstName: string;
  lastName: string;
  customerId: string;
  company: string;
  status: "active" | "vip" | "at-risk";
  source: "online-store" | "subscription" | "marketplace" | "retail-partner";
  email: string;
  phone: string;
  preferredChannel: "email" | "sms" | "phone";
  accountOwner: string;
  billingName: string;
  billingLine1: string;
  billingLine2: string;
  billingCity: string;
  billingState: string;
  billingZip: string;
  billingCountry: string;
  shippingSameAsBilling: boolean;
  shippingName: string;
  shippingLine1: string;
  shippingLine2: string;
  shippingCity: string;
  shippingState: string;
  shippingZip: string;
  shippingCountry: string;
  segments: string[];
  notes: string;
  marketingOptIn: boolean;
};

type CustomerSeed = {
  customerId: string;
  firstName: string;
  lastName: string;
  company: string;
  status: EditableCustomerValues["status"];
  source: EditableCustomerValues["source"];
  email: string;
  phone: string;
  preferredChannel: EditableCustomerValues["preferredChannel"];
  accountOwner: string;
  billingLine1: string;
  billingLine2: string;
  billingCity: string;
  billingState: string;
  billingZip: string;
  billingCountry?: string;
  segments: string[];
  notes: string;
  marketingOptIn?: boolean;
};

function createEditableCustomer(seed: CustomerSeed): EditableCustomerValues {
  const billingCountry = seed.billingCountry ?? "United States";
  const billingName = `${seed.firstName} ${seed.lastName}`;

  return {
    firstName: seed.firstName,
    lastName: seed.lastName,
    customerId: seed.customerId,
    company: seed.company,
    status: seed.status,
    source: seed.source,
    email: seed.email,
    phone: seed.phone,
    preferredChannel: seed.preferredChannel,
    accountOwner: seed.accountOwner,
    billingName,
    billingLine1: seed.billingLine1,
    billingLine2: seed.billingLine2,
    billingCity: seed.billingCity,
    billingState: seed.billingState,
    billingZip: seed.billingZip,
    billingCountry,
    shippingSameAsBilling: true,
    shippingName: billingName,
    shippingLine1: seed.billingLine1,
    shippingLine2: seed.billingLine2,
    shippingCity: seed.billingCity,
    shippingState: seed.billingState,
    shippingZip: seed.billingZip,
    shippingCountry: billingCountry,
    segments: [...seed.segments],
    notes: seed.notes,
    marketingOptIn: seed.marketingOptIn ?? true,
  };
}

const editableCustomers: Record<string, EditableCustomerValues> = {
  "cus-7102": createEditableCustomer({
    customerId: "CUS-7102",
    firstName: "Avery",
    lastName: "Brooks",
    company: "Northmail",
    status: "active",
    source: "online-store",
    email: "avery.brooks@northmail.co",
    phone: "+1 (415) 555-0181",
    preferredChannel: "email",
    accountOwner: "Riley Chen",
    billingLine1: "411 Powell Street, Suite 240",
    billingLine2: "Union Square",
    billingCity: "San Francisco",
    billingState: "CA",
    billingZip: "94102",
    segments: ["Active", "Routine buyers"],
    notes:
      "Usually reorders weekend bundles and responds well to replenishment reminders.",
  }),
  "cus-8431": createEditableCustomer({
    customerId: "CUS-8431",
    firstName: "Camila",
    lastName: "Hart",
    company: "Northmail",
    status: "active",
    source: "subscription",
    email: "camila.hart@northmail.co",
    phone: "+1 (323) 555-0147",
    preferredChannel: "sms",
    accountOwner: "Mina Patel",
    billingLine1: "230 Bedford Avenue",
    billingLine2: "Floor 3",
    billingCity: "Brooklyn",
    billingState: "NY",
    billingZip: "11211",
    segments: ["Active", "Subscription"],
    notes:
      "Prefers shipping updates by SMS and tends to add one-off skincare treatments to subscription cycles.",
  }),
  "cus-2844": createEditableCustomer({
    customerId: "CUS-2844",
    firstName: "Miles",
    lastName: "Yoon",
    company: "Brightlane",
    status: "vip",
    source: "retail-partner",
    email: "miles.yoon@brightlane.co",
    phone: "+1 (646) 555-0132",
    preferredChannel: "phone",
    accountOwner: "Avery Hall",
    billingLine1: "198 Crosby Street",
    billingLine2: "Unit 8A",
    billingCity: "New York",
    billingState: "NY",
    billingZip: "10012",
    segments: ["VIP", "High retention"],
    notes:
      "High-value account with frequent gifting orders and early access requests.",
  }),
  "cus-5290": createEditableCustomer({
    customerId: "CUS-5290",
    firstName: "Nora",
    lastName: "Castillo",
    company: "Brightlane",
    status: "at-risk",
    source: "marketplace",
    email: "nora.castillo@brightlane.co",
    phone: "+1 (305) 555-0124",
    preferredChannel: "email",
    accountOwner: "Jordan Lee",
    billingLine1: "74 Biscayne Boulevard",
    billingLine2: "Apt 15",
    billingCity: "Miami",
    billingState: "FL",
    billingZip: "33132",
    segments: ["At risk", "Marketplace"],
    notes:
      "Has not ordered in weeks. Worth a recovery sequence tied to skincare replenishment.",
    marketingOptIn: false,
  }),
  "cus-1742": createEditableCustomer({
    customerId: "CUS-1742",
    firstName: "Theo",
    lastName: "Hammond",
    company: "Caldwell",
    status: "vip",
    source: "online-store",
    email: "theo.hammond@caldwell.app",
    phone: "+1 (206) 555-0198",
    preferredChannel: "email",
    accountOwner: "Avery Hall",
    billingLine1: "7841 Mercer Street, Suite 12",
    billingLine2: "Capitol Hill, Building North",
    billingCity: "Seattle",
    billingState: "WA",
    billingZip: "98102",
    segments: ["VIP", "Skincare Routine", "High retention"],
    notes:
      "Prefers new product drops by email and tends to bundle hero skincare sets with replenishment orders.",
  }),
  "cus-6619": createEditableCustomer({
    customerId: "CUS-6619",
    firstName: "Zara",
    lastName: "Quinn",
    company: "Caldwell",
    status: "active",
    source: "subscription",
    email: "zara.quinn@caldwell.app",
    phone: "+1 (512) 555-0140",
    preferredChannel: "sms",
    accountOwner: "Riley Chen",
    billingLine1: "280 Congress Avenue",
    billingLine2: "Suite 410",
    billingCity: "Austin",
    billingState: "TX",
    billingZip: "78701",
    segments: ["Active", "Subscription"],
    notes:
      "Responds well to seasonal replenishment offers and product bundle promotions.",
  }),
  "cus-9051": createEditableCustomer({
    customerId: "CUS-9051",
    firstName: "Julian",
    lastName: "Porter",
    company: "Commoner",
    status: "at-risk",
    source: "marketplace",
    email: "julian.porter@commoner.co",
    phone: "+1 (917) 555-0116",
    preferredChannel: "email",
    accountOwner: "Jordan Lee",
    billingLine1: "89 Orchard Street",
    billingLine2: "Loft 5",
    billingCity: "New York",
    billingState: "NY",
    billingZip: "10002",
    segments: ["At risk"],
    notes: "Needs a concierge follow-up before the account cools off further.",
    marketingOptIn: false,
  }),
  "cus-3378": createEditableCustomer({
    customerId: "CUS-3378",
    firstName: "Leila",
    lastName: "Forde",
    company: "Commoner",
    status: "vip",
    source: "online-store",
    email: "leila.forde@commoner.co",
    phone: "+1 (213) 555-0108",
    preferredChannel: "phone",
    accountOwner: "Mina Patel",
    billingLine1: "540 Mateo Street",
    billingLine2: "Studio 12",
    billingCity: "Los Angeles",
    billingState: "CA",
    billingZip: "90013",
    segments: ["VIP", "High retention"],
    notes:
      "Usually buys premium sets and often needs split shipping for gifting orders.",
  }),
  "cus-4926": createEditableCustomer({
    customerId: "CUS-4926",
    firstName: "Rory",
    lastName: "Bennett",
    company: "Waxwing",
    status: "active",
    source: "online-store",
    email: "rory.bennett@waxwing.io",
    phone: "+1 (617) 555-0135",
    preferredChannel: "email",
    accountOwner: "Avery Hall",
    billingLine1: "116 Newbury Street",
    billingLine2: "Unit 2",
    billingCity: "Boston",
    billingState: "MA",
    billingZip: "02116",
    segments: ["Active"],
    notes: "Healthy repeat customer with moderate bundle attachment rate.",
  }),
  "cus-1287": createEditableCustomer({
    customerId: "CUS-1287",
    firstName: "Imani",
    lastName: "Rhodes",
    company: "Waxwing",
    status: "active",
    source: "subscription",
    email: "imani.rhodes@waxwing.io",
    phone: "+1 (404) 555-0174",
    preferredChannel: "sms",
    accountOwner: "Riley Chen",
    billingLine1: "920 Peachtree Street",
    billingLine2: "Suite 18",
    billingCity: "Atlanta",
    billingState: "GA",
    billingZip: "30309",
    segments: ["Active", "Subscription"],
    notes: "Subscription customer with occasional gift note requests.",
  }),
  "cus-7306": createEditableCustomer({
    customerId: "CUS-7306",
    firstName: "Elias",
    lastName: "Mercer",
    company: "Meridian HQ",
    status: "at-risk",
    source: "retail-partner",
    email: "elias.mercer@meridianhq.co",
    phone: "+1 (312) 555-0142",
    preferredChannel: "phone",
    accountOwner: "Jordan Lee",
    billingLine1: "421 Michigan Avenue",
    billingLine2: "Floor 6",
    billingCity: "Chicago",
    billingState: "IL",
    billingZip: "60611",
    segments: ["At risk", "Partner"],
    notes:
      "Retail-partner account needs direct check-in after recent order gap.",
    marketingOptIn: false,
  }),
  "cus-2465": createEditableCustomer({
    customerId: "CUS-2465",
    firstName: "Sienna",
    lastName: "Blair",
    company: "Meridian HQ",
    status: "vip",
    source: "online-store",
    email: "sienna.blair@meridianhq.co",
    phone: "+1 (702) 555-0121",
    preferredChannel: "email",
    accountOwner: "Mina Patel",
    billingLine1: "67 Fremont Street",
    billingLine2: "Penthouse 3",
    billingCity: "Las Vegas",
    billingState: "NV",
    billingZip: "89101",
    segments: ["VIP", "Launch access"],
    notes: "Engages early with new drops and has strong lifetime value.",
  }),
};

export function getEditableCustomerById(
  customerId: string,
): EditableCustomerValues | null {
  const customer = editableCustomers[customerId.toLowerCase()];

  if (!customer) {
    return null;
  }

  return {
    ...customer,
    segments: [...customer.segments],
  };
}

export function getCustomerEditHref(customerId: string) {
  return `/ecommerce/edit-customer/${customerId.toLowerCase()}`;
}
