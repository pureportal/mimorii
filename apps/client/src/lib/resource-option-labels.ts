import type { ResourceSummary } from "@mimorii/contracts";

const resourceKindLabels: Record<ResourceSummary["kind"], string> = {
  host: "Host",
  device: "Device",
  service: "Service",
};

export function resourceOptionLabels(resources: ResourceSummary[]): ReadonlyMap<string, string> {
  const resourcesByName = new Map<string, ResourceSummary[]>();
  for (const resource of resources) {
    const group = resourcesByName.get(resource.name) ?? [];
    group.push(resource);
    resourcesByName.set(resource.name, group);
  }

  const labels = new Map<string, string>();
  for (const [name, group] of resourcesByName) {
    if (group.length === 1) {
      const [resource] = group;
      if (resource) labels.set(resource.id, name);
      continue;
    }

    const resourcesByDetail = new Map<string, ResourceSummary[]>();
    for (const resource of group) {
      const detail = resource.agent?.platform?.trim() || resourceKindLabels[resource.kind];
      const matches = resourcesByDetail.get(detail) ?? [];
      matches.push(resource);
      resourcesByDetail.set(detail, matches);
    }

    for (const [detail, matches] of resourcesByDetail) {
      const sorted = matches.toSorted(
        (left, right) =>
          left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)
      );
      sorted.forEach((resource, index) => {
        const ordinal = sorted.length > 1 ? ` ${index + 1}` : "";
        labels.set(resource.id, `${name} · ${detail}${ordinal}`);
      });
    }
  }

  return labels;
}
