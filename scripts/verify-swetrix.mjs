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
  const project = await api.request(`/v1/project/${encodedProjectId}`);
  const expectedOrigins = Object.hasOwn(process.env, "SWETRIX_EXPECTED_ORIGINS")
    ? parseCommaSeparated(process.env.SWETRIX_EXPECTED_ORIGINS)
    : swetrixProjectOrigins;

  const endpointResults = await Promise.all(
    [
      ["api", "/ping"],
      ["traffic", `/v1/log/birdseye?pid=${encodedProjectId}&period=7d`],
      ["performance", `/v1/log/performance/birdseye?pid=${encodedProjectId}&period=7d`],
      ["sessions", `/v1/log/sessions?pid=${encodedProjectId}&period=7d&take=1&skip=0`],
      ["errors", `/v1/log/errors?pid=${encodedProjectId}&period=7d&take=1&skip=0`],
      ["assignments", "/v1/feature-flag/evaluate", { method: "POST", body: { pid: projectId } }],
      ["funnels", `/v1/project/funnels/${encodedProjectId}`],
      ["segments", `/v1/project/${encodedProjectId}/views`],
    ].map(async ([name, path, options]) => {
      try {
        const value = await api.request(path, options);
        return { name, ok: true, records: countRecords(value), value };
      } catch (error) {
        return { name, ok: false, error: errorMessage(error) };
      }
    })
  );
  const endpointChecks = Object.fromEntries(
    endpointResults.map(({ name, ok, records, error }) => [
      name,
      ok ? { ok, records } : { ok, error },
    ])
  );
  const endpointData = Object.fromEntries(
    endpointResults.filter(({ ok }) => ok).map(({ name, value }) => [name, value])
  );
  const capabilities = Object.fromEntries(
    await Promise.all(
      [
        ["pageViews", "/v1/log"],
        ["customEvents", "/v1/log/custom"],
        ["browserErrors", "/v1/log/error"],
        ["profiles", "/v1/log/identify"],
        ["attribution", "/v1/log/session-id"],
        ["sessionReplay", "/v1/log/session-replay/start"],
      ].map(async ([name, path]) => {
        const status = await api.probe(path);
        return [name, { supported: status !== 404, status }];
      })
    )
  );

  const projectOrigins = Array.isArray(project.origins) ? project.origins : [];
  const missingOrigins = expectedOrigins.filter((origin) => !projectOrigins.includes(origin));
  const unexpectedOrigins = projectOrigins.filter((origin) => !expectedOrigins.includes(origin));
  const issues = [];
  if (project.id !== projectId) issues.push("The returned project ID does not match");
  if (!project.active) issues.push("Analytics collection is disabled");
  if (project.isAnalyticsProject === false) issues.push("The project is not an analytics project");
  if (project.public) issues.push("The analytics dashboard is public");
  if (project.websiteUrl !== swetrixWebsiteUrl) {
    issues.push(`The project website URL is not ${swetrixWebsiteUrl}`);
  }
  if (project.botsProtectionLevel === "off") issues.push("Bot protection is disabled");
  if (missingOrigins.length) issues.push(`Missing allowed origins: ${missingOrigins.join(", ")}`);
  if (unexpectedOrigins.length) {
    issues.push(`Unexpected allowed origins: ${unexpectedOrigins.join(", ")}`);
  }
  for (const [name, result] of Object.entries(endpointChecks)) {
    if (!result.ok) issues.push(`${name} API check failed`);
  }
  validateFunnels(endpointData.funnels, issues);
  validateViews(endpointData.segments, issues);
  for (const name of ["pageViews", "customEvents", "browserErrors", "profiles", "attribution"]) {
    if (!capabilities[name].supported) issues.push(`${name} ingestion is not supported`);
  }

  console.log(
    JSON.stringify(
      {
        project: {
          id: project.id,
          name: project.name,
          active: project.active,
          analytics: project.isAnalyticsProject !== false,
          public: project.public,
          botProtection: project.botsProtectionLevel,
          origins: projectOrigins,
          websiteUrl: project.websiteUrl,
        },
        features: endpointChecks,
        capabilities,
        valid: issues.length === 0,
        issues,
      },
      null,
      2
    )
  );
  if (issues.length) process.exitCode = 1;
}

function validateFunnels(value, issues) {
  if (!Array.isArray(value)) return;
  for (const desired of swetrixFunnels) {
    const matches = value.filter((funnel) => funnel.name === desired.name);
    if (matches.length !== 1) {
      issues.push(`Expected exactly one ${desired.name} funnel`);
      continue;
    }
    if (!sameJson(readJsonArray(matches[0].steps), desired.steps)) {
      issues.push(`${desired.name} funnel steps do not match`);
    }
  }
}

function validateViews(value, issues) {
  if (!Array.isArray(value)) return;
  for (const desired of swetrixViews) {
    const matches = value.filter(
      (view) => view.name === desired.name && view.type === desired.type
    );
    if (matches.length !== 1) {
      issues.push(`Expected exactly one ${desired.name} segment`);
      continue;
    }
    if (!sameJson(readJsonArray(matches[0].filters), desired.filters)) {
      issues.push(`${desired.name} segment filters do not match`);
    }
  }
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function countRecords(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") {
    for (const key of ["sessions", "errors", "result", "data"]) {
      if (Array.isArray(value[key])) return value[key].length;
    }
    return Object.keys(value).length;
  }
  return value === null ? 0 : 1;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

main().catch((error) => {
  console.error(`Swetrix verification failed: ${errorMessage(error)}`);
  process.exitCode = 1;
});
