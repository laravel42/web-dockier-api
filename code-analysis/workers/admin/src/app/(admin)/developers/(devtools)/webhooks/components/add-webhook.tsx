"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { MutateWebhook } from "./mutate-webhook";

export function AddWebhook() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="default" onClick={() => setOpen(true)}>
        <Plus /> Add Webhook
      </Button>

      <MutateWebhook open={open} setOpen={setOpen} />
    </>
  );
}
