"use client";

import { Activity,Bug, Filter, Search, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Rule {
  id: string;
  engine: string;
  rule_key: string;
  name: string;
  description: string;
  severity: string;
  type: string;
  default_active: boolean;
}

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [engineFilter, setEngineFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (engineFilter !== "all") params.append("engine", engineFilter);
      if (severityFilter !== "all") params.append("severity", severityFilter);
      if (typeFilter !== "all") params.append("type", typeFilter);
      
      const res = await fetch(`/api/administration/rules?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch rules");
      const data = await res.json();
      setRules(data);
    } catch (_error) {
      toast.error("Error fetching rules");
    } finally {
      setLoading(false);
    }
  }, [engineFilter, severityFilter, typeFilter]);

  useEffect(() => {
    fetchRules();
  }, [engineFilter, severityFilter, typeFilter, fetchRules]);

  const toggleRuleActive = async (ruleId: string, currentVal: boolean) => {
    try {
      const res = await fetch(`/api/administration/rules/${ruleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ default_active: !currentVal }),
      });
      if (!res.ok) throw new Error("Failed to update rule");
      toast.success("Rule updated successfully");
      setRules(rules.map((r) => r.id === ruleId ? { ...r, default_active: !currentVal } : r));
    } catch (_e) {
      toast.error("Failed to update rule");
    }
  };

  const filteredRules = rules.filter(rule => 
    rule.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    rule.rule_key.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getSeverityColor = (sev: string) => {
    switch(sev) {
      case 'blocker': return 'bg-red-900 text-red-100';
      case 'critical': return 'bg-red-500 text-white';
      case 'major': return 'bg-orange-500 text-white';
      case 'minor': return 'bg-yellow-500 text-white';
      case 'info': return 'bg-blue-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  const getTypeIcon = (type: string) => {
    switch(type) {
      case 'vulnerability': return <ShieldAlert className="w-4 h-4 text-red-500" />;
      case 'bug': return <Bug className="w-4 h-4 text-orange-500" />;
      case 'code_smell': return <Activity className="w-4 h-4 text-blue-500" />;
      default: return null;
    }
  };

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Sidebar Filters */}
      <div className="w-full md:w-64 border-r bg-background p-4 flex flex-col gap-6">
        <div>
          <h3 className="font-medium flex items-center gap-2 mb-3"><Filter className="w-4 h-4"/> Filters</h3>
          <div className="relative mb-4">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              type="search" 
              placeholder="Search rules..." 
              className="pl-8" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Engine</label>
            <Select value={engineFilter} onValueChange={setEngineFilter}>
              <SelectTrigger><SelectValue placeholder="All Engines" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Engines</SelectItem>
                <SelectItem value="semgrep">Semgrep</SelectItem>
                <SelectItem value="regex">Regex</SelectItem>
                <SelectItem value="sonarqube">SonarQube</SelectItem>
                <SelectItem value="codeql">CodeQL</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Severity</label>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger><SelectValue placeholder="All Severities" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severities</SelectItem>
                <SelectItem value="blocker">Blocker</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="major">Major</SelectItem>
                <SelectItem value="minor">Minor</SelectItem>
                <SelectItem value="info">Info</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Type</label>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger><SelectValue placeholder="All Types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="vulnerability">Vulnerability</SelectItem>
                <SelectItem value="bug">Bug</SelectItem>
                <SelectItem value="code_smell">Code Smell</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="flex-1 p-6 bg-background">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold tracking-tight">Rules Repository ({filteredRules.length})</h2>
          <Button>Create Custom Rule</Button>
        </div>

        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rule Key</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Engine</TableHead>
                <TableHead className="text-right">Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">Loading rules...</TableCell>
                </TableRow>
              ) : filteredRules.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No rules found matching filters.</TableCell>
                </TableRow>
              ) : (
                filteredRules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-mono text-xs">{rule.rule_key}</TableCell>
                    <TableCell>
                      <div className="font-medium">{rule.name}</div>
                      <div className="text-xs text-muted-foreground line-clamp-1">{rule.description}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 capitalize">
                        {getTypeIcon(rule.type)}
                        {rule.type.replace('_', ' ')}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getSeverityColor(rule.severity)} variant="outline">
                        {rule.severity}
                      </Badge>
                    </TableCell>
                    <TableCell className="capitalize">{rule.engine}</TableCell>
                    <TableCell className="text-right">
                      <Switch 
                        checked={rule.default_active} 
                        onCheckedChange={() => toggleRuleActive(rule.id, rule.default_active)}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
