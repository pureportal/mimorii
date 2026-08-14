import { SwetrixApi, parseCommaSeparated, readJsonArray } from "./swetrix-api.mjs";
import {
  getSwetrixProjectId,
  swetrixFunnels,
  swetrixProjectOrigins,
  swetrixViews,
  swetrixWebsiteUrl,
} from "./swetrix-project.mjs";
async function main() {
  const api = new SwetrixApi(process.env.SWETRIX_API_KEY?.trim());
  const projectId = getSwetrixProjectId();
  const encodedProjectId = encodeURIComponent(projectId);
  const protectionLevel = process.env.SWETRIX_BOT_PROTECTION_LEVEL?.trim() || "basic";
  if (!new Set(["basic", "strict"]).has(protectionLevel)) {
    throw new Error("SWETRIX_BOT_PROTECTION_LEVEL must be basic or strict");
  }

  const update = {
    active: true,
    botsProtectionLevel: protectionLevel,
    name: process.env.SWETRIX_PROJECT_NAME?.trim() || "Mimorii",
    origins: Object.hasOwn(process.env, "SWETRIX_ALLOWED_ORIGINS")
      ? parseCommaSeparated(process.env.SWETRIX_ALLOWED_ORIGINS)
      : swetrixProjectOrigins,
    public: false,
    websiteUrl: swetrixWebsiteUrl,
  };
  const currentProject = await api.request(`/v1/project/${encodedProjectId}`);
  const projectAction = sameProjectConfiguration(currentProject, update) ? "unchanged" : "updated";
  if (projectAction === "updated") {
    await api.request(`/v1/project/${encodedProjectId}`, { method: "PUT", body: update });
  }

  const funnelChanges = await configureFunnels(api, projectId, encodedProjectId);
  const viewChanges = await configureViews(api, encodedProjectId);
  console.log(
    JSON.stringify(
      {
        projectId,
        project: projectAction,
        funnels: funnelChanges,
        segments: viewChanges,
      },
      null,
      2
    )
  );
}

async function configureFunnels(api, projectId, encodedProjectId) {
  const existing = await api.request(`/v1/project/funnels/${encodedProjectId}`);
  return Promise.all(
    swetrixFunnels.map(async (desired) => {
      const matches = Array.isArray(existing)
        ? existing.filter((item) => item.name === desired.name)
        : [];
      const [current, ...duplicates] = matches;
      await Promise.all(
        duplicates.map((duplicate) =>
          api.request(
            `/v1/project/funnel/${encodeURIComponent(duplicate.id)}/${encodedProjectId}`,
            { method: "DELETE" }
          )
        )
      );
      if (!current) {
        await api.request("/v1/project/funnel", {
          method: "POST",
          body: { ...desired, pid: projectId },
        });
        return changeResult(desired.name, "created", duplicates.length);
      }
      if (sameJson(readJsonArray(current.steps), desired.steps)) {
        return changeResult(desired.name, "unchanged", duplicates.length);
      }
      await api.request("/v1/project/funnel", {
        method: "PATCH",
        body: { id: current.id, pid: projectId, ...desired },
      });
      return changeResult(desired.name, "updated", duplicates.length);
    })
  );
}

async function configureViews(api, encodedProjectId) {
  const existing = await api.request(`/v1/project/${encodedProjectId}/views`);
  return Promise.all(
    swetrixViews.map(async (desired) => {
      const matches = Array.isArray(existing)
        ? existing.filter((item) => item.name === desired.name && item.type === desired.type)
        : [];
      const [current, ...duplicates] = matches;
      await Promise.all(
        duplicates.map((duplicate) =>
          api.request(`/v1/project/${encodedProjectId}/views/${encodeURIComponent(duplicate.id)}`, {
            method: "DELETE",
          })
        )
      );
      if (!current) {
        await api.request(`/v1/project/${encodedProjectId}/views`, {
          method: "POST",
          body: desired,
        });
        return changeResult(desired.name, "created", duplicates.length);
      }
      if (sameJson(readJsonArray(current.filters), desired.filters)) {
        return changeResult(desired.name, "unchanged", duplicates.length);
      }
      await api.request(`/v1/project/${encodedProjectId}/views/${encodeURIComponent(current.id)}`, {
        method: "PATCH",
        body: { name: desired.name, filters: desired.filters },
      });
      return changeResult(desired.name, "updated", duplicates.length);
    })
  );
}

function sameProjectConfiguration(current, desired) {
  return (
    current.active === desired.active &&
    current.botsProtectionLevel === desired.botsProtectionLevel &&
    current.name === desired.name &&
    sameStringSet(current.origins, desired.origins) &&
    current.public === desired.public &&
    current.websiteUrl === desired.websiteUrl
  );
}

function sameStringSet(left, right) {
  return (
    Array.isArray(left) &&
    left.length === right.length &&
    left.every((value) => right.includes(value))
  );
}

function changeResult(name, action, duplicatesRemoved) {
  return duplicatesRemoved ? { name, action, duplicatesRemoved } : { name, action };
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

main().catch((error) => {
  console.error(`Swetrix configuration failed: ${errorMessage(error)}`);
  process.exitCode = 1;
});
