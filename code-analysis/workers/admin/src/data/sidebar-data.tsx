import {
  _IconError404,
  _IconReceipt,
  _IconServerOff,
  IconBox,
  IconBug,
  IconChecklist,
  IconCreditCard,
  IconCurrencyDollar,
  IconFileInvoice,
  IconFolder,
  IconLayoutDashboard,
  IconSettings,
  IconUsers,
} from "@tabler/icons-react";
import { ShieldAlert } from "lucide-react";

import { type SidebarData } from "@/components/layout/types";
import { _site } from "@/data/_site";

export const sidebarData: SidebarData = {
  user: {
    name: "Admin",
    email: "admin@dockier.com",
    avatar: "/avatars/ausrobdev-avatar.png",
  },
  teams: [
    {
      name: "Dockier Security",
      logo: ShieldAlert,
      plan: "Enterprise",
    },
  ],
  navGroups: [
    {
      title: "Security Operations",
      items: [
        {
          title: "Overview",
          url: "/dashboard",
          icon: IconLayoutDashboard,
        },
        {
          title: "Scan History",
          url: "/scans",
          icon: IconChecklist,
        },
        {
          title: "System Logs",
          url: "/logs",
          icon: IconBug,
        },
        {
          title: "Administration",
          url: "/administration",
          icon: IconSettings,
        },
      ],
    },
    {
      title: "SaaS Management",
      items: [
        {
          title: "Products",
          url: "/saas-products",
          icon: IconBox,
        },
        {
          title: "Projects",
          url: "/project-management/project-list-1",
          icon: IconFolder,
        },
        {
          title: "Users",
          url: "/original/users/users",
          icon: IconUsers,
        },
        {
          title: "Plans",
          url: "/original/settings/settings/plans",
          icon: IconSettings,
        },
        {
          title: "Subscriptions",
          url: "/original/settings/settings/billing",
          icon: IconCreditCard,
        },
        {
          title: "Payments",
          url: "/ecommerce/orders/order-list-1",
          icon: IconCurrencyDollar,
        },
        {
          title: "Invoices",
          url: "/ecommerce/orders/order-list-2",
          icon: IconFileInvoice,
        },
      ],
    },
  ],
};
