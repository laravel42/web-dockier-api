import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { User } from "@/lib/data/project-details";

type ContributorsRailSectionProps = {
  users: User[];
};

const railContributors = [
  {
    id: "kiara-laras",
    name: "Kiara Laras",
    avatarUrl: "/avatars/avatar-1.png",
  },
  { id: "joe-tesla", name: "Joe Tesla", avatarUrl: "/avatars/avatar-3.png" },
  {
    id: "tania-brooks",
    name: "Tania Brooks",
    avatarUrl: "/avatars/avatar-5.png",
  },
  {
    id: "cameron-williamson",
    name: "Cameron Williamson",
    avatarUrl: "/avatars/avatar-black-2.png",
  },
  { id: "robert-fox", name: "Robert Fox", avatarUrl: "/avatars/avatar-4.png" },
  { id: "megan-chen", name: "Megan Chen", avatarUrl: "/avatars/avatar-6.png" },
  {
    id: "alex-morgan",
    name: "Alex Morgan",
    avatarUrl: "/avatars/avatar-bw-1.png",
  },
  {
    id: "maya-patel",
    name: "Maya Patel",
    avatarUrl: "/avatars/avatar-bw-3.png",
  },
];

function initialsFor(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function ContributorsRailSection({
  users,
}: ContributorsRailSectionProps) {
  const usersWithPhotos = users.filter((user) => user.avatarUrl);
  const mergedUsers = Array.from(
    new Map(
      [...usersWithPhotos, ...railContributors].map((user) => [user.id, user]),
    ).values(),
  );
  const visibleUsers = mergedUsers.slice(0, 8);
  const totalContributors = 18;
  const remaining = totalContributors - visibleUsers.length;

  return (
    <section className="py-6">
      <div className="mb-5 flex items-baseline gap-2">
        <h2 className="text-sm font-semibold">Contributors</h2>
        <span className="text-muted-foreground text-xs">
          {totalContributors}
        </span>
      </div>

      <div className="grid grid-cols-6 gap-2">
        {visibleUsers.map((user) => (
          <Tooltip key={user.id}>
            <TooltipTrigger asChild>
              <Avatar className="size-8 border">
                <AvatarImage src={user.avatarUrl} alt={user.name} />
                <AvatarFallback className="text-[10px]">
                  {initialsFor(user.name)}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent>{user.name}</TooltipContent>
          </Tooltip>
        ))}
        {remaining > 0 ? (
          <div className="text-muted-foreground grid size-8 place-items-center rounded-full text-[11px] font-medium">
            +{remaining}
          </div>
        ) : null}
      </div>
    </section>
  );
}
