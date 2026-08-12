"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function Scans() {
  const [scans, setScans] = useState<unknown[]>([]);

  useEffect(() => {
    fetch("/api/scans")
      .then(r => r.json())
      .then(data => setScans(data.scans || []))
      .catch(console.error);
  }, []);

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Scan History</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Security Scans</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Repo URL</TableHead>
                <TableHead>Commit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Findings</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scans.map((scan) => (
                <TableRow key={scan.id}>
                  <TableCell className="font-medium">{scan.repo_url}</TableCell>
                  <TableCell>{scan.commit_sha.substring(0, 7)}</TableCell>
                  <TableCell>
                    <Badge variant={scan.status === 'completed' ? 'default' : scan.status === 'running' ? 'secondary' : 'destructive'}>
                      {scan.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {scan.findings ? (
                      <Badge variant={scan.findings.length > 0 ? "destructive" : "secondary"}>
                        {scan.findings.length} findings
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>{new Date(scan.created_at).toLocaleString()}</TableCell>
                </TableRow>
              ))}
              {scans.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No scans found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
