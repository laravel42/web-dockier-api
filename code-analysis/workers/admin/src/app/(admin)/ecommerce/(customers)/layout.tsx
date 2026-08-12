import { SubHeader } from "@/components/layout/sub-header";

const EC = "ecommerce";

const customerOverrides = {
  "edit-customer": "Edit Customer",
} as const;

interface Props {
  children: React.ReactNode;
}

export default function EcommerceCustomersGroupLayout({ children }: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SubHeader
        section="Customers"
        searchName="customers-search"
        searchAriaLabel="Search customers"
        sectionSegment={EC}
        breadcrumbOverrides={customerOverrides}
      />
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}
