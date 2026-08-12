"use client";

import { CalendarDays, DollarSign, Search, User } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type InvoiceStatus = "Paid" | "Pending" | "Overdue" | "Draft";

interface Invoice {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerEmail: string;
  amount: number;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  description: string;
}

const invoices: Invoice[] = [
  {
    id: "inv-01",
    invoiceNumber: "INV-2026-001",
    customerName: "Maya Collins",
    customerEmail: "maya@acme.com",
    amount: 1248.50,
    status: "Paid",
    issueDate: "Mar 1, 2026",
    dueDate: "Mar 15, 2026",
    description: "Enterprise SAST License - Q1 2026",
  },
  {
    id: "inv-02",
    invoiceNumber: "INV-2026-002",
    customerName: "Jordan Reyes",
    customerEmail: "jordan@example.com",
    amount: 486.75,
    status: "Paid",
    issueDate: "Mar 3, 2026",
    dueDate: "Mar 17, 2026",
    description: "SCA Engine - Monthly Subscription",
  },
  {
    id: "inv-03",
    invoiceNumber: "INV-2026-003",
    customerName: "Elaine Wu",
    customerEmail: "elaine@techcorp.io",
    amount: 3150.20,
    status: "Pending",
    issueDate: "Mar 5, 2026",
    dueDate: "Mar 19, 2026",
    description: "DAST + SAST Bundle - Annual",
  },
  {
    id: "inv-04",
    invoiceNumber: "INV-2026-004",
    customerName: "Noah Bennett",
    customerEmail: "noah@startup.co",
    amount: 932.40,
    status: "Overdue",
    issueDate: "Feb 15, 2026",
    dueDate: "Mar 1, 2026",
    description: "Secret Scanner - Quarterly",
  },
  {
    id: "inv-05",
    invoiceNumber: "INV-2026-005",
    customerName: "Priya Menon",
    customerEmail: "priya@devops.team",
    amount: 211.30,
    status: "Paid",
    issueDate: "Mar 8, 2026",
    dueDate: "Mar 22, 2026",
    description: "SCA Engine - Monthly Subscription",
  },
  {
    id: "inv-06",
    invoiceNumber: "INV-2026-006",
    customerName: "Omar Haddad",
    customerEmail: "omar@enterprise.biz",
    amount: 5420.00,
    status: "Draft",
    issueDate: "Mar 12, 2026",
    dueDate: "Mar 26, 2026",
    description: "Full Platform License - Enterprise",
  },
  {
    id: "inv-07",
    invoiceNumber: "INV-2026-007",
    customerName: "Lena Hart",
    customerEmail: "lena@agency.co",
    amount: 128.90,
    status: "Paid",
    issueDate: "Mar 10, 2026",
    dueDate: "Mar 24, 2026",
    description: "SAST Engine - Starter Plan",
  },
  {
    id: "inv-08",
    invoiceNumber: "INV-2026-008",
    customerName: "Tobias Green",
    customerEmail: "tobias@fintech.io",
    amount: 764.20,
    status: "Pending",
    issueDate: "Mar 14, 2026",
    dueDate: "Mar 28, 2026",
    description: "DAST Engine - Advanced Plan",
  },
  {
    id: "inv-09",
    invoiceNumber: "INV-2026-009",
    customerName: "Sofia Alvarez",
    customerEmail: "sofia@retail.mx",
    amount: 542.10,
    status: "Overdue",
    issueDate: "Feb 20, 2026",
    dueDate: "Mar 6, 2026",
    description: "Secret Scanner + SCA Bundle",
  },
  {
    id: "inv-10",
    invoiceNumber: "INV-2026-010",
    customerName: "Nina Park",
    customerEmail: "nina@health.org",
    amount: 97.50,
    status: "Paid",
    issueDate: "Mar 16, 2026",
    dueDate: "Mar 30, 2026",
    description: "SCA Engine - Starter Plan",
  },
];

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

function getStatusVariant(status: InvoiceStatus) {
  switch (status) {
    case "Paid":
      return "default" as const;
    case "Pending":
      return "secondary" as const;
    case "Overdue":
      return "destructive" as const;
    case "Draft":
      return "outline" as const;
  }
}

export default function InvoicesPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const deferredSearch = useDeferredValue(search);

  const filteredInvoices = useMemo(() => {
    const normalizedSearch = deferredSearch.trim().toLowerCase();
    return invoices.filter((inv) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        [inv.invoiceNumber, inv.customerName, inv.customerEmail, inv.description]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);

      const matchesStatus =
        statusFilter === "all" || inv.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [deferredSearch, statusFilter]);

  const totalAmount = filteredInvoices.reduce((sum, inv) => sum + inv.amount, 0);

  return (
    <div className="flex flex-col p-4 pt-6 md:p-8 space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Invoices</h2>
          <p className="text-muted-foreground mt-1">
            Manage and track all customer invoices.
          </p>
        </div>
        <Button>Create Invoice</Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <DollarSign className="size-4" />
            Total
          </div>
          <p className="text-2xl font-bold mt-1">{currencyFormatter.format(totalAmount)}</p>
        </div>
        <div className="border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <CalendarDays className="size-4" />
            Invoices
          </div>
          <p className="text-2xl font-bold mt-1">{filteredInvoices.length}</p>
        </div>
        <div className="border rounded-lg p-4">
          <div className="flex items-center gap-2 text-emerald-600 text-sm">
            <User className="size-4" />
            Paid
          </div>
          <p className="text-2xl font-bold mt-1">
            {invoices.filter((i) => i.status === "Paid").length}
          </p>
        </div>
        <div className="border rounded-lg p-4">
          <div className="flex items-center gap-2 text-destructive text-sm">
            <User className="size-4" />
            Overdue
          </div>
          <p className="text-2xl font-bold mt-1">
            {invoices.filter((i) => i.status === "Overdue").length}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoices..."
            className="h-9 pl-8 text-sm"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="Paid">Paid</SelectItem>
            <SelectItem value="Pending">Pending</SelectItem>
            <SelectItem value="Overdue">Overdue</SelectItem>
            <SelectItem value="Draft">Draft</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Invoices table */}
      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Issue Date</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredInvoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  No invoices found matching the current filters.
                </TableCell>
              </TableRow>
            ) : (
              filteredInvoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-mono text-sm font-medium">
                    {inv.invoiceNumber}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-sm">{inv.customerName}</div>
                    <div className="text-xs text-muted-foreground">{inv.customerEmail}</div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[250px]">
                    <span className="line-clamp-1">{inv.description}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusVariant(inv.status)}>{inv.status}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{inv.issueDate}</TableCell>
                  <TableCell className="text-sm">{inv.dueDate}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {currencyFormatter.format(inv.amount)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm">View</Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
