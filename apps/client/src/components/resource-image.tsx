import type { ResourceKind, ResourceSummary } from "@mimorii/contracts";
import { useQuery } from "@tanstack/react-query";
import { Network, Server, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { apiBlob } from "../lib/api";
import { cn } from "../lib/cn";

export function ResourceImage({
  resource,
  className,
  iconClassName,
}: {
  resource: Pick<ResourceSummary, "id" | "teamId" | "kind" | "imageUpdatedAt">;
  className?: string;
  iconClassName?: string;
}) {
  const [source, setSource] = useState<string | null>(null);
  const image = useQuery({
    queryKey: ["resource-image", resource.teamId, resource.id, resource.imageUpdatedAt],
    queryFn: () =>
      apiBlob(
        `/teams/${encodeURIComponent(resource.teamId)}/resources/${encodeURIComponent(resource.id)}/image`
      ),
    enabled: resource.imageUpdatedAt !== null,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });

  useEffect(() => {
    if (!image.data) {
      setSource(null);
      return undefined;
    }
    const url = URL.createObjectURL(image.data);
    setSource(url);
    return () => URL.revokeObjectURL(url);
  }, [image.data]);

  const Icon = resourceKindIcon(resource.kind);
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-xl bg-lavender-soft text-violet-strong",
        className
      )}
    >
      {source ? (
        <img alt="" className="size-full object-contain p-1" src={source} />
      ) : (
        <Icon aria-hidden="true" className={cn("size-5", iconClassName)} />
      )}
    </span>
  );
}

function resourceKindIcon(kind: ResourceKind) {
  return kind === "host" ? Server : kind === "device" ? Smartphone : Network;
}
