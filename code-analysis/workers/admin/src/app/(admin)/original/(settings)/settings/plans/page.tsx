"use client";

import { IconCheck, IconX } from "@tabler/icons-react";
import { useState } from "react";

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

import ContentSection from "../components/content-section";
import SubscribeDrawer from "./components/subscribe-drawer";
import { getPlan, plans } from "./data/data";

const featureRows = [
  { label: "Dedicated Account Manager", monthly: true, annual: true, lifetime: true },
  { label: "Community Access & Forum Participation", monthly: true, annual: true, lifetime: true },
  { label: "Customizable Settings & Preferences", monthly: true, annual: true, lifetime: true },
  { label: "Regular Performance Reports", monthly: true, annual: true, lifetime: true },
  { label: "24/7 Availability & Support", monthly: false, annual: true, lifetime: true },
  { label: "Unlimited Access To All Routes", monthly: false, annual: false, lifetime: true },
  { label: "Advanced Progress Tracking", monthly: false, annual: false, lifetime: true },
  { label: "Early Access To New Features", monthly: false, annual: false, lifetime: true },
  { label: "Feedback-Driven Roadmap", monthly: false, annual: false, lifetime: true },
  { label: "Enhanced Analytics & Insights", monthly: false, annual: false, lifetime: true },
  { label: "Priority Bug Fixes & Support", monthly: false, annual: false, lifetime: true },
];

const resourceRows = [
  { label: "Mentorship Program", monthly: true, annual: true, lifetime: true },
  { label: "Community Tutorials", monthly: true, annual: true, lifetime: true },
  { label: "Access to Knowledge Base", monthly: true, annual: true, lifetime: true },
  { label: "Exclusive Workshops", monthly: false, annual: true, lifetime: true },
  { label: "Lifetime Exclusive Webinars", monthly: false, annual: false, lifetime: true },
];

export default function SettingsPlansPage() {
  const [selectedPlan, setSelectedPlan] = useState(plans[0]);
  const plan = getPlan.get(selectedPlan.label);

  return (
    <ContentSection
      title="Plans"
      desc="Compare features across plans and choose the one that fits your needs."
    >
      <div className="mb-4 flex flex-col space-y-8 py-3">
        {/* Plan pricing summary table */}
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">Plan</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Billing</TableHead>
                <TableHead>Savings</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.map((p) => (
                <TableRow
                  key={p.label}
                  className={selectedPlan.label === p.label ? "bg-muted/50" : ""}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {p.label}
                      {selectedPlan.label === p.label && (
                        <Badge variant="default" className="text-[10px] px-1.5 py-0">
                          Selected
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-semibold">{p.content}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {p.description}
                  </TableCell>
                  <TableCell>
                    {"badge" in p && p.badge ? (
                      <Badge variant="outline">{p.badge}</Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant={selectedPlan.label === p.label ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedPlan(p)}
                    >
                      {selectedPlan.label === p.label ? "Current" : "Select"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Feature comparison table */}
        <div className="space-y-3">
          <h2 className="font-bold">Feature Comparison</h2>
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[300px]">Feature</TableHead>
                  <TableHead className="text-center">Monthly</TableHead>
                  <TableHead className="text-center">Annual</TableHead>
                  <TableHead className="text-center">Lifetime</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {featureRows.map((row) => (
                  <TableRow key={row.label}>
                    <TableCell className="text-sm">{row.label}</TableCell>
                    <TableCell className="text-center">
                      {row.monthly ? (
                        <IconCheck className="inline-block text-emerald-500" size={18} />
                      ) : (
                        <IconX className="inline-block text-muted-foreground/40" size={18} />
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {row.annual ? (
                        <IconCheck className="inline-block text-emerald-500" size={18} />
                      ) : (
                        <IconX className="inline-block text-muted-foreground/40" size={18} />
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {row.lifetime ? (
                        <IconCheck className="inline-block text-emerald-500" size={18} />
                      ) : (
                        <IconX className="inline-block text-muted-foreground/40" size={18} />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Additional resources table */}
        <div className="space-y-3">
          <h2 className="font-bold">Additional Resources</h2>
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[300px]">Resource</TableHead>
                  <TableHead className="text-center">Monthly</TableHead>
                  <TableHead className="text-center">Annual</TableHead>
                  <TableHead className="text-center">Lifetime</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resourceRows.map((row) => (
                  <TableRow key={row.label}>
                    <TableCell className="text-sm">{row.label}</TableCell>
                    <TableCell className="text-center">
                      {row.monthly ? (
                        <IconCheck className="inline-block text-emerald-500" size={18} />
                      ) : (
                        <IconX className="inline-block text-muted-foreground/40" size={18} />
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {row.annual ? (
                        <IconCheck className="inline-block text-emerald-500" size={18} />
                      ) : (
                        <IconX className="inline-block text-muted-foreground/40" size={18} />
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {row.lifetime ? (
                        <IconCheck className="inline-block text-emerald-500" size={18} />
                      ) : (
                        <IconX className="inline-block text-muted-foreground/40" size={18} />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {plan && <SubscribeDrawer plan={plan} />}
      </div>
    </ContentSection>
  );
}
