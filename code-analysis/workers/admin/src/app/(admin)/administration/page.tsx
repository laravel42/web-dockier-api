"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ConfigData = Record<string, any>;

interface EngineConfig {
  config: ConfigData;
}

export default function ToolsConfigurationPage() {
  const [configs, setConfigs] = useState<Record<string, EngineConfig>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/tools")
      .then((res) => res.json())
      .then((data) => {
        setConfigs(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        toast.error("Failed to load configurations");
        setLoading(false);
      });
  }, []);

  const handleSave = async (engine: string, updatedConfig: ConfigData) => {
    try {
      const res = await fetch("/api/tools", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engine, config: updatedConfig }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success(`${engine} configuration saved successfully`);
      setConfigs((prev) => ({
        ...prev,
        [engine]: { ...prev[engine], config: updatedConfig },
      }));
    } catch (_err) {
      toast.error(`Error saving ${engine} config`);
    }
  };

  if (loading) return <div className="p-8">Loading configurations...</div>;

  return (
    <div className="space-y-4 p-4 pt-6 md:p-8">
      <Tabs defaultValue="gateway" className="space-y-4">
        <TabsList>
          <TabsTrigger value="gateway">Gateway</TabsTrigger>
          <TabsTrigger value="semgrep">Semgrep</TabsTrigger>
          <TabsTrigger value="regex">Regex</TabsTrigger>
          <TabsTrigger value="sonarqube">SonarQube</TabsTrigger>
          <TabsTrigger value="codeql">CodeQL</TabsTrigger>
        </TabsList>

        <TabsContent value="gateway">
          <GatewayForm
            initialData={configs["gateway"]?.config || {}}
            onSave={(data) => handleSave("gateway", data)}
          />
        </TabsContent>
        <TabsContent value="semgrep">
          <SemgrepForm
            initialData={configs["semgrep"]?.config || {}}
            onSave={(data) => handleSave("semgrep", data)}
          />
        </TabsContent>
        <TabsContent value="regex">
          <RegexForm
            initialData={configs["regex"]?.config || {}}
            onSave={(data) => handleSave("regex", data)}
          />
        </TabsContent>
        <TabsContent value="sonarqube">
          <SonarQubeForm
            initialData={configs["sonarqube"]?.config || {}}
            onSave={(data) => handleSave("sonarqube", data)}
          />
        </TabsContent>
        <TabsContent value="codeql">
          <CodeQLForm
            initialData={configs["codeql"]?.config || {}}
            onSave={(data) => handleSave("codeql", data)}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// -- FORMS -- //

function GatewayForm({ initialData, onSave }: { initialData: ConfigData; onSave: (d: ConfigData) => void }) {
  const [data, setData] = useState(initialData);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Gateway Configuration</CardTitle>
        <CardDescription>Manage how the gateway clones and stores repositories.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label>S3 Bucket Name</Label>
          <Input
            value={data?.s3_bucket || ""}
            onChange={(e) => setData({ ...data, s3_bucket: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label>Clone Timeout (Seconds)</Label>
          <Input
            type="number"
            value={data?.clone_timeout_seconds || 300}
            onChange={(e) => setData({ ...data, clone_timeout_seconds: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-1">
          <Label>Storage Type</Label>
          <Input
            value={data?.storage_type || "local"}
            onChange={(e) => setData({ ...data, storage_type: e.target.value })}
          />
        </div>
        <Button onClick={() => onSave(data)}>Save Changes</Button>
      </CardContent>
    </Card>
  );
}

function SemgrepForm({ initialData, onSave }: { initialData: ConfigData; onSave: (d: ConfigData) => void }) {
  const [data, setData] = useState(initialData);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Semgrep Configuration</CardTitle>
        <CardDescription>Manage CLI flags and active rulesets.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label>Flags (comma separated)</Label>
          <Input
            value={(data?.flags || []).join(", ")}
            onChange={(e) =>
              setData({ ...data, flags: e.target.value.split(",").map((s: string) => s.trim()) })
            }
          />
        </div>
        <div className="space-y-1">
          <Label>Active Rulesets (comma separated)</Label>
          <Input
            value={(data?.active_rulesets || []).join(", ")}
            onChange={(e) =>
              setData({ ...data, active_rulesets: e.target.value.split(",").map((s: string) => s.trim()) })
            }
          />
        </div>
        <Button onClick={() => onSave(data)}>Save Changes</Button>
      </CardContent>
    </Card>
  );
}

function RegexForm({ initialData, onSave }: { initialData: ConfigData; onSave: (d: ConfigData) => void }) {
  const [data, _setData] = useState(initialData);
  const jsonStr = JSON.stringify(data?.rules || [], null, 2);
  const [localJson, setLocalJson] = useState(jsonStr);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Regex Rules</CardTitle>
        <CardDescription>Manage custom fast-path regular expressions (JSON format).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label>Rules Array (JSON)</Label>
          <Textarea
            rows={10}
            className="font-mono"
            value={localJson}
            onChange={(e) => setLocalJson(e.target.value)}
          />
        </div>
        <Button
          onClick={() => {
            try {
              const parsed = JSON.parse(localJson);
              onSave({ ...data, rules: parsed });
            } catch (_e) {
              toast.error("Invalid JSON format");
            }
          }}
        >
          Save Changes
        </Button>
      </CardContent>
    </Card>
  );
}

function SonarQubeForm({ initialData, onSave }: { initialData: ConfigData; onSave: (d: ConfigData) => void }) {
  const [data, setData] = useState(initialData);
  return (
    <Card>
      <CardHeader>
        <CardTitle>SonarQube Configuration</CardTitle>
        <CardDescription>Configure external SonarQube instance parameters.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label>Host URL</Label>
          <Input
            value={data?.host_url || ""}
            onChange={(e) => setData({ ...data, host_url: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label>Default Quality Gate</Label>
          <Input
            value={data?.default_quality_gate || ""}
            onChange={(e) => setData({ ...data, default_quality_gate: e.target.value })}
          />
        </div>
        <Button onClick={() => onSave(data)}>Save Changes</Button>
      </CardContent>
    </Card>
  );
}

function CodeQLForm({ initialData, onSave }: { initialData: ConfigData; onSave: (d: ConfigData) => void }) {
  const [data, setData] = useState(initialData);
  return (
    <Card>
      <CardHeader>
        <CardTitle>CodeQL Configuration</CardTitle>
        <CardDescription>Configure semantic query settings.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label>Supported Languages (comma separated)</Label>
          <Input
            value={(data?.supported_languages || []).join(", ")}
            onChange={(e) =>
              setData({ ...data, supported_languages: e.target.value.split(",").map((s: string) => s.trim()) })
            }
          />
        </div>
        <Button onClick={() => onSave(data)}>Save Changes</Button>
      </CardContent>
    </Card>
  );
}
