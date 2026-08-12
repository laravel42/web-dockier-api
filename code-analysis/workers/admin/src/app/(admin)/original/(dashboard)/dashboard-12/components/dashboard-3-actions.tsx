import { IconFilter } from "@tabler/icons-react";

import DatePicker from "@/components/date-picker";
import { Button } from "@/components/ui/button";

export default function Dashboard3Actions() {
  return (
    <div className="flex items-center gap-2">
      <DatePicker />
      <Button>
        <IconFilter /> Filter By
      </Button>
    </div>
  );
}
