"use client";

import { DateRangePicker } from "@/components/date-range-picker";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { nofitySubmittedValues } from "@/lib/notify-submitted-values";

import { ApiRequestsChart } from "./components/api-requests-chart";
import { ApiResponseTimeChart } from "./components/api-response-time-chart";
import RecentActivity from "./components/recent-activity";
import { TotalVisitorsChart } from "./components/total-visitors-chart";

export default function OverviewPage() {
  return (
    <main id="main-content" className="flex flex-col gap-5 p-4 sm:p-6">
      <div className="flex w-full flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-2xl font-bold">Web Overview</h2>
            <p className="text-muted-foreground text-sm">
              Build, manage, and optimize developer workflows seamlessly.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select>
              <SelectTrigger className="w-fit gap-2 text-sm">
                <SelectValue placeholder="Server" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Server</SelectLabel>
                  <SelectItem value="production">Production</SelectItem>
                  <SelectItem value="development">Development</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <DateRangePicker
              onUpdate={(values) => nofitySubmittedValues(values)}
              initialDateFrom="2023-01-01"
              initialDateTo="2023-12-31"
              align="start"
              locale="en-GB"
              showCompare={false}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:gap-8">
        <div className="flex basis-2/3 flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
            <ApiRequestsChart className="flex-1" />
            <Separator className="sm:hidden" />
            <ApiResponseTimeChart className="flex-1" />
          </div>
          <Separator />
          <TotalVisitorsChart className="col-span-2" />
        </div>
        <Separator className="lg:hidden" />
        <div className="flex flex-1 flex-col">
          <RecentActivity />
        </div>
      </div>
    </main>
  );
}
