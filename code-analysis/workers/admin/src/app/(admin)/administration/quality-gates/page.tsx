"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface GateCondition {
  metric: string;
  operator: string;
  threshold: string;
}

interface QualityGate {
  id: string;
  name: string;
  conditions: GateCondition[];
  is_default: boolean;
}

export default function QualityGatesPage() {
  const [gates, setGates] = useState<QualityGate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/administration/quality-gates")
      .then((res) => res.json())
      .then((data) => {
        setGates(data);
        setLoading(false);
      })
      .catch((_err) => {
        toast.error("Failed to load quality gates");
        setLoading(false);
      });
  }, []);

  return (
    <div className="p-4 pt-6 md:p-8 space-y-4 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Quality Gates</h2>
          <p className="text-muted-foreground mt-1">Manage conditions that fail a pipeline.</p>
        </div>
        <Button>Create Quality Gate</Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Conditions</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8">Loading gates...</TableCell>
              </TableRow>
            ) : gates.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No quality gates found.</TableCell>
              </TableRow>
            ) : (
              gates.map((gate) => (
                <TableRow key={gate.id}>
                  <TableCell className="font-medium text-primary">{gate.name}</TableCell>
                  <TableCell>
                    {gate.conditions && gate.conditions.map((c: GateCondition, i: number) => (
                      <div key={i} className="text-sm">
                        <span className="font-medium capitalize">{c.metric.replace('_', ' ')}</span> {c.operator} {c.threshold}
                      </div>
                    ))}
                  </TableCell>
                  <TableCell>
                    {gate.is_default && <Badge variant="secondary">Default</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm">Edit Conditions</Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
