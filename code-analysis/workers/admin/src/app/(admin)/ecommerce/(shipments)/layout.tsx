import { SubHeader } from "@/components/layout/sub-header";

const EC = "ecommerce";

const shipmentOverrides = {
  "add-shipping": "Create Shipping Label",
  "edit-shipping": "Edit Shipping Label",
} as const;

interface Props {
  children: React.ReactNode;
}

export default function EcommerceShipmentsGroupLayout({ children }: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SubHeader
        section="Shipments"
        searchName="shipments-search"
        searchAriaLabel="Search shipments"
        sectionSegment={EC}
        breadcrumbOverrides={shipmentOverrides}
      />
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}
