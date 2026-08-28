# MCP server integration

Mimorii exposes a stateless MCP `2026-07-28` Streamable HTTP endpoint at `POST /api/mcp`. It uses version 2 of the official TypeScript SDK and rejects older MCP protocol revisions and transports.

## Authorization

Remote MCP clients use OAuth authorization code flow with PKCE S256. Personal API tokens and web-session tokens are not accepted by the MCP endpoint. OAuth access tokens issued for MCP are not accepted by Mimorii's REST API.

Discovery is available at:

- `/.well-known/oauth-protected-resource/api/mcp`
- `/.well-known/oauth-authorization-server`

Mimorii supports OAuth Client ID Metadata Documents. The `client_id` must be a public HTTPS URL with a non-root path. Mimorii retrieves that document without redirects, pins the request to a publicly resolved address, enforces TLS hostname verification, and limits response size and duration. Successful metadata responses are cached according to `Cache-Control`, `Age`, and `Expires`, capped at ten minutes; errors and `no-store` responses are not cached. Dynamic Client Registration is not supported because MCP `2026-07-28` deprecates it in favor of Client ID Metadata Documents.

A compatible public client document includes:

```json
{
  "client_id": "https://client.example/oauth/mimorii.json",
  "client_name": "Example client",
  "redirect_uris": ["https://client.example/oauth/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none"
}
```

HTTPS redirects and exact HTTP loopback redirects are accepted. Redirect URIs are matched exactly. Authorization and token requests must use the canonical resource URL derived from `MIMORII_PUBLIC_URL`:

```text
https://mimorii.example/api/mcp
```

The consent page displays the client hostname, redirect destination, requested permissions, and whether the client can retain access with refresh tokens. Loopback redirects receive an additional local-app warning.

Authorization codes expire after five minutes and are single-use. Access tokens expire after one hour. A client receives a 30-day refresh token only when its metadata declares the `refresh_token` grant. Refresh tokens rotate on every use; authorization-code or refresh-token replay revokes the entire token family. Codes and tokens are stored only as hashes. Resource comparison accepts uppercase scheme and host components for interoperability while preserving the exact endpoint path and rejecting credentials, query strings, and fragments.

Every access and refresh operation checks the represented user's current token version and disabled state. Password or account security changes that invalidate the user's sessions also invalidate their OAuth grants. Authorization responses include `iss`, and access tokens are bound to the exact MCP resource and client.

## Scopes and user permissions

`mcp:read` is required for MCP access. `mcp:write` is an additional scope for mutations. A write grant does not change the user's team role or expose global-administrator APIs.

All tools receive the user ID from the validated access token. User IDs, roles, and credentials are never tool arguments. Tools call the existing domain services, which apply `TeamAccessService` and constrain child objects to the supplied team.

| Tool                                                        | Scope                | Existing team permission |
| ----------------------------------------------------------- | -------------------- | ------------------------ |
| `list_teams`                                                | `mcp:read`           | Assigned teams only      |
| `get_team_overview`, `get_availability_report`              | `mcp:read`           | Viewer                   |
| `list_service_objectives`                                   | `mcp:read`           | Viewer                   |
| `list_resources`, `get_resource`                            | `mcp:read`           | Viewer                   |
| `list_checks`, `get_check`, `get_check_history`             | `mcp:read`           | Viewer                   |
| `list_heartbeats`, `get_heartbeat`, `get_heartbeat_history` | `mcp:read`           | Viewer                   |
| `list_incidents`, `get_incident`                            | `mcp:read`           | Viewer                   |
| `list_maintenance`, `get_maintenance`                       | `mcp:read`           | Viewer                   |
| `update_resource`                                           | `mcp:read mcp:write` | Member                   |
| `create_incident`, `add_incident_update`                    | `mcp:read mcp:write` | Member                   |

Mutation tools reuse the same validation, transactions, audit events, notification behavior, and role checks as REST mutations. Incident mutations are marked as non-idempotent and open-world because they can publish updates and enqueue notifications. Resource updates are non-destructive and do not expose agent, check, or secret mutation paths.

MCP hosts should show tool activity and require human confirmation before mutations, especially incident publication. Tool annotations describe these effects for compatible clients but are not an authorization control.

Check configuration is omitted from MCP output because it can contain targets, request headers, bodies, and other operationally sensitive values. List and history inputs are bounded, identifiers are UUIDs, timestamps are validated, and unknown tool arguments are rejected.

## Request security

The MCP boundary applies these controls:

- A new `McpServer` is created for every stateless request, preventing cross-client state and response routing.
- `Host` must match `MIMORII_PUBLIC_URL`, localhost, or an explicitly configured `MIMORII_MCP_ALLOWED_HOSTS` entry.
- A present `Origin` must exactly match the public origin or an allowed CORS origin.
- `MCP-Protocol-Version`, `Mcp-Method`, and `Mcp-Name` must agree with the JSON-RPC body.
- `server/discover` and `tools/list` use five-minute public protocol cache hints because their definitions are identical for every user; tool data is not protocol-cacheable.
- Write requests receive an OAuth `insufficient_scope` challenge before tool execution when `mcp:write` is absent. Tool handlers check the scope again as defense in depth.
- MCP responses use `Cache-Control: no-store`, and bearer tokens remain in the `Authorization` header.
- The API body limit and global rate limiter apply to MCP and OAuth endpoints.

Stored resource names, incident messages, and other returned text remain untrusted content for the remote AI host. Mimorii publishes no server prompts and does not execute caller-selected commands, filesystem operations, or network targets through MCP tools.

## Deployment

Set the externally reachable origin:

```text
MIMORII_PUBLIC_URL=https://mimorii.example
```

Production remote OAuth requires HTTPS. HTTP is accepted only for loopback deployments. TLS may terminate at a trusted reverse proxy, but `MIMORII_PUBLIC_URL` must still use the external HTTPS origin.

Use `MIMORII_MCP_ALLOWED_HOSTS` only when a trusted proxy sends a different `Host` value. Add browser-based MCP origins to `MIMORII_CORS_ORIGINS` when required.

Primary references:

- [MCP 2026-07-28 authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
- [MCP 2026-07-28 Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)
- [MCP authorization security considerations](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/security-considerations)
- [MCP tool specification](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)
- [MCP caching](https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/caching)
- [OAuth Client ID Metadata Document](https://datatracker.ietf.org/doc/draft-ietf-oauth-client-id-metadata-document/)
- [OAuth 2.0 Protected Resource Metadata (RFC 9728)](https://www.rfc-editor.org/rfc/rfc9728)
- [OAuth 2.0 Authorization Server Metadata (RFC 8414)](https://www.rfc-editor.org/rfc/rfc8414)
- [OAuth 2.0 Authorization Server Issuer Identification (RFC 9207)](https://www.rfc-editor.org/rfc/rfc9207)
- [OAuth 2.0 Security Best Current Practice (RFC 9700)](https://www.rfc-editor.org/rfc/rfc9700)
