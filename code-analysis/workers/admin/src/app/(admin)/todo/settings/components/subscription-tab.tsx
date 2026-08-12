"use client";

import { Check, CreditCard } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Item,
  ItemContent,
  ItemGroup,
  ItemSeparator,
} from "@/components/ui/item";

export function SubscriptionTab() {
  return (
    <div className="mt-6 space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Current Plan</CardTitle>
              <CardDescription>
                Manage your subscription and billing
              </CardDescription>
            </div>
            <Badge
              variant="outline"
              className="bg-primary/10 whitespace-nowrap"
            >
              Pro Plan
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-1">
              <p className="font-semibold">Pro Plan</p>
              <p className="text-muted-foreground text-sm">
                $12/month • Billed monthly
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold">$12</p>
              <p className="text-muted-foreground text-sm">per month</p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Plan includes:</p>
            <ul className="text-muted-foreground space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <Check className="text-primary size-4" />
                Unlimited tasks and projects
              </li>
              <li className="flex items-center gap-2">
                <Check className="text-primary size-4" />
                Priority support
              </li>
              <li className="flex items-center gap-2">
                <Check className="text-primary size-4" />
                Advanced collaboration features
              </li>
              <li className="flex items-center gap-2">
                <Check className="text-primary size-4" />
                Custom integrations
              </li>
              <li className="flex items-center gap-2">
                <Check className="text-primary size-4" />
                AI-powered insights
              </li>
            </ul>
          </div>

          <div className="flex gap-2">
            <Button className="flex-1">Change plan</Button>
            <Button variant="outline" className="flex-1">
              Cancel subscription
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment Method</CardTitle>
          <CardDescription>Manage your payment information</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="flex items-center gap-4">
                <div className="bg-muted flex size-10 items-center justify-center rounded">
                  <CreditCard className="size-5" />
                </div>
                <div>
                  <p className="font-medium">•••• •••• •••• 4242</p>
                  <p className="text-muted-foreground text-sm">Expires 12/25</p>
                </div>
              </div>
              <Button variant="outline" size="sm">
                Update
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Billing History</CardTitle>
          <CardDescription>View and download your invoices</CardDescription>
        </CardHeader>
        <CardContent>
          <ItemGroup>
            {[
              { date: "Nov 1, 2025", amount: "$12.00", status: "Paid" },
              { date: "Oct 1, 2025", amount: "$12.00", status: "Paid" },
              { date: "Sep 1, 2025", amount: "$12.00", status: "Paid" },
            ].map((invoice, index) => (
              <div key={index}>
                {index > 0 && <ItemSeparator />}
                <Item variant="outline" className="border-0">
                  <ItemContent>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{invoice.date}</p>
                        <p className="text-muted-foreground text-sm">
                          {invoice.amount}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="bg-success/10">
                          {invoice.status}
                        </Badge>
                        <Button variant="ghost" size="sm">
                          Download
                        </Button>
                      </div>
                    </div>
                  </ItemContent>
                </Item>
              </div>
            ))}
          </ItemGroup>
        </CardContent>
      </Card>
    </div>
  );
}
