import type { TeamSummary } from "@mimorii/contracts";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { useEffect, useState } from "react";
import { apiBlob } from "../lib/api";
import { cn } from "../lib/cn";

export function TeamLogo({
  team,
  className,
  iconClassName,
}: {
  team: Pick<TeamSummary, "id" | "name" | "logoUpdatedAt">;
  className?: string;
  iconClassName?: string;
}) {
  const [source, setSource] = useState<string | null>(null);
  const logo = useQuery({
    queryKey: ["team-logo", team.id, team.logoUpdatedAt],
    queryFn: () => apiBlob(`/teams/${encodeURIComponent(team.id)}/logo`),
    enabled: team.id.length > 0 && typeof team.logoUpdatedAt === "string",
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });

  useEffect(() => {
    if (!logo.data) {
      setSource(null);
      return undefined;
    }
    const url = URL.createObjectURL(logo.data);
    setSource(url);
    return () => URL.revokeObjectURL(url);
  }, [logo.data]);

  const initials = team.name.trim().slice(0, 2).toUpperCase();
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-lg bg-lavender-soft font-display text-[10px] font-black text-violet-strong",
        className
      )}
    >
      {source ? (
        <img alt="" className="size-full object-contain p-0.5" src={source} />
      ) : initials ? (
        initials
      ) : (
        <Users aria-hidden="true" className={cn("size-4", iconClassName)} />
      )}
    </span>
  );
}
