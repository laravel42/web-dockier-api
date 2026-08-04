export interface TenantMembership {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  roleName: string;
  isOwner: boolean;
}
