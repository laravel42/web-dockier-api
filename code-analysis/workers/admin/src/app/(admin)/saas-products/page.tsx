import { FileCode2, Lock, Search, Shield } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const saasProducts = [
  {
    id: "sast",
    name: "Static Application Security Testing",
    shortName: "SAST Engine",
    description: "Deep source code analysis using Semgrep, CodeQL, and SonarQube rules.",
    icon: FileCode2,
    status: "Active",
    tier: "Enterprise",
  },
  {
    id: "dast",
    name: "Dynamic Application Security Testing",
    shortName: "DAST Engine",
    description: "Simulated attacks on running applications to find runtime vulnerabilities.",
    icon: Shield,
    status: "Beta",
    tier: "Advanced",
  },
  {
    id: "sca",
    name: "Software Composition Analysis",
    shortName: "SCA Engine",
    description: "Detect known vulnerabilities in open-source dependencies and libraries.",
    icon: Search,
    status: "Active",
    tier: "Standard",
  },
  {
    id: "secrets",
    name: "Secret Scanner",
    shortName: "Secrets Engine",
    description: "Prevent hardcoded credentials and tokens from leaking into source control.",
    icon: Lock,
    status: "Active",
    tier: "Standard",
  },
];

export default function SaasProductsPage() {
  return (
    <div className="p-4 pt-6 md:p-8 space-y-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">SaaS Product Services</h2>
          <p className="text-muted-foreground mt-1">Manage the security engines and services provisioned for your organization.</p>
        </div>
        <Button>Add Product</Button>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Full Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {saasProducts.map((product) => {
              const Icon = product.icon;
              return (
                <TableRow key={product.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Icon className="w-4 h-4 text-primary" />
                      </div>
                      <span className="font-medium">{product.shortName}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{product.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[300px]">
                    <span className="line-clamp-2">{product.description}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={product.status === "Active" ? "default" : "secondary"}>
                      {product.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{product.tier}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm">Configure</Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
