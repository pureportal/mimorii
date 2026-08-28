# MCP client compatibility

Reviewed on 2026-08-28 against the current official documentation and published client source. This is a requirements assessment; no client in this report has been tested against a live HTTPS Mimorii deployment.

## Mimorii profile

Mimorii exposes stateless Streamable HTTP at `POST /api/mcp`. It serves MCP `2026-07-28` and stateless 2025-era requests. It does not serve sessionful Streamable HTTP, HTTP+SSE, or stdio.

Authentication uses OAuth authorization code flow with PKCE S256. The server publishes protected-resource and authorization-server metadata, accepts public OAuth Client ID Metadata Documents (CIMD), issues rotating refresh tokens, and supports `mcp:read` plus `mcp:write` scope step-up. Dynamic Client Registration (DCR), confidential clients, personal tokens, and static API keys are not accepted. HTTPS redirect URIs match exactly; native loopback redirects match with only the port ignored.

Mimorii publishes classic tools plus a standards-based MCP Apps resource for `get_team_overview`. Clients without MCP Apps support continue to receive text and structured tool results. OAuth client registration remains the main compatibility boundary.

## Summary

| Client or surface             | Transport                      | OAuth compatibility                                 | MCP Apps                | Assessment                      |
| ----------------------------- | ------------------------------ | --------------------------------------------------- | ----------------------- | ------------------------------- |
| ChatGPT plugins               | Public Streamable HTTP         | CIMD, PKCE, refresh, and scope step-up match        | Supported               | Supported; live flow unverified |
| Claude Code                   | Streamable HTTP                | CIMD, PKCE, refresh, and scope step-up match        | Host support documented | Supported; live flow unverified |
| Claude hosted connectors      | Public HTTPS Streamable HTTP   | CIMD and hosted callback match                      | Interactive connectors  | Supported; live flow unverified |
| Gemini CLI                    | Streamable HTTP                | DCR or configured client; CIMD is not documented    | Not documented          | OAuth unverified                |
| Gemini Code Assist agent mode | Local or remote MCP config     | Exact embedded OAuth behavior is not documented     | Not documented          | Unverified                      |
| Gemini Spark custom apps      | Remote MCP URL                 | DCR or supplied credentials; CIMD is not documented | Not documented          | Unverified                      |
| Gemini Enterprise Business    | Public HTTPS Streamable HTTP   | Requires a client ID and client secret              | Not documented          | Unsupported authentication      |
| Gemini Interactions API       | Streamable HTTP                | Per-request headers only; no managed OAuth flow     | Not documented          | Unsupported authentication      |
| Ollama app and CLI            | No native MCP client           | Not applicable                                      | Not applicable          | Unsupported directly            |
| VS Code local agent           | Streamable HTTP                | Automatic CIMD and scope step-up match              | Not documented          | Unverified                      |
| VS Code Copilot agent harness | Local unauthenticated MCP only | Remote OAuth is not available                       | Not applicable          | Unsupported                     |
| Cursor                        | Streamable HTTP                | DCR or static credentials; CIMD is not documented   | Not documented          | Unverified                      |

## OpenAI

ChatGPT's plugin platform uses Streamable HTTP, supports OAuth protected-resource discovery and CIMD, and implements the open MCP Apps standard. Mimorii's team-health resource uses the current nested `_meta.ui.resourceUri` field and keeps the classic tool result as its fallback. A deployed test must still cover consent, token refresh, resource loading, a read call, and write-scope step-up.

## Claude

### Claude Code

Claude Code recommends remote HTTP servers and accepts this configuration:

```shell
claude mcp add --transport http mimorii https://mimorii.example/api/mcp
```

On `401` or `403`, it follows the `WWW-Authenticate` protected-resource metadata link, supports CIMD when the authorization server advertises public-client authentication, uses S256 PKCE, stores and refreshes tokens, and can reauthorize for additional scopes. Its native callback uses a random loopback port. Mimorii now ignores only that port while keeping the registered host, path, and query fixed.

Anthropic currently documents the 2025-03-26, 2025-06-18, and 2025-11-25 protocol family for connectors. Mimorii's stateless 2025-era handler covers that wire format. A deployed end-to-end test remains necessary because client OAuth behavior can change independently of the server.

Project-scoped server configuration requires user trust. Tool calls can require confirmation, and Mimorii marks incident mutations as non-idempotent and open-world. Those client controls complement, but do not replace, Mimorii's user, team-role, and OAuth-scope checks.

### Claude.ai, Desktop, mobile, and Cowork

Anthropic documents one hosted connector authentication stack across these surfaces. It supports public HTTPS remote MCP, CIMD, S256 PKCE, refresh tokens, and the fixed callback `https://claude.ai/api/mcp/auth_callback`. Interactive connectors use MCP Apps in sandboxed iframes and keep the classic tool experience when interactive content is disabled. These requirements fit Mimorii.

Treat the integration as live-unverified until Claude.ai successfully completes discovery, consent, token refresh, resource loading, a read call, and a write-scope step-up against the deployed endpoint.

## Gemini

Gemini currently has several distinct MCP surfaces. Their requirements are not interchangeable.

### Gemini CLI

Gemini CLI supports Streamable HTTP through `httpUrl` or `gemini mcp add --transport http`. It can discover OAuth after a `401`, open a browser on a random localhost callback, perform DCR when available, manage refresh tokens, filter tools, and require tool confirmation unless the server is trusted.

The current Gemini CLI repository depends on a 2025-era TypeScript SDK, which Mimorii's stateless handler accepts. Gemini CLI does not document CIMD, so its automatic OAuth path still has no verified client registration mechanism for Mimorii.

### Gemini Code Assist agent mode

Gemini Code Assist uses Gemini settings files for local and remote MCP servers and exposes Gemini CLI MCP commands in agent mode. The official product documentation does not identify its CIMD behavior, so compatibility must not be assumed. Keep tool auto-approval disabled during any future test.

### Gemini Spark custom apps

Gemini Spark accepts a custom MCP URL for eligible consumer accounts. Its setup prefers DCR and offers manually supplied credentials when DCR is unavailable. Google does not document CIMD, its callback URI, token endpoint authentication method, or exact MCP revision. Mimorii therefore has no verified automatic authentication path for this surface.

Spark currently requires confirmation for writes, which aligns with Mimorii's mutation annotations. A live test should wait until Google documents CIMD or another public-client registration method that Mimorii can validate.

### Gemini Enterprise Business

The pre-GA custom MCP connector requires a public HTTPS Streamable HTTP endpoint and public identity provider, which Mimorii provides. Its setup also requires a pre-registered client ID and client secret. Mimorii intentionally accepts only public CIMD clients with token endpoint authentication method `none`, so this connector is not currently compatible.

### Gemini Interactions API

The Interactions API can call Streamable HTTP servers and restrict `allowed_tools`, but its remote MCP configuration exposes only a URL and static request headers. It does not perform Mimorii's user-consent, refresh, or scope-step-up flow. Copying a one-hour OAuth access token into a request would not create a sustainable integration and is not treated as support.

## Ollama

Ollama supports model tool calling and can supply models to external agents, but its app and CLI do not document a native remote MCP client, transport configuration, or OAuth flow. Ollama's own MCP material either exposes an Ollama-backed MCP server or configures another MCP host.

Use an MCP-capable host such as Claude Code or VS Code with an Ollama model. `ollama launch claude`, `ollama launch codex`, and `ollama launch vscode` configure those external hosts; Mimorii compatibility is then determined by the host, not Ollama. No Mimorii change is needed for Ollama itself.

## VS Code and GitHub Copilot

The normal VS Code local agent supports remote Streamable HTTP servers, OAuth, secure token storage, server trust, and tool confirmation. VS Code added automatic CIMD preference over DCR in version 1.106 and supports `WWW-Authenticate` scope step-up. The configuration shape is:

```json
{
  "servers": {
    "mimorii": {
      "type": "http",
      "url": "https://mimorii.example/api/mcp"
    }
  }
}
```

Mimorii serves both current protocol families used by Streamable HTTP clients. Transport and OAuth fit, but the complete browser flow remains unverified.

The newer Copilot agent harness is a separate execution surface. Microsoft currently limits it to local MCP servers without authentication, so it cannot use Mimorii. Choose the local VS Code agent for a future test. Enterprise URL and tool allowlists may also need to permit the exact Mimorii endpoint and selected tools.

## Cursor

Cursor supports remote Streamable HTTP, OAuth, per-tool approval, and organization URL and tool allowlists. Its documented automatic OAuth flow uses DCR. For servers without DCR, Cursor accepts a static client ID, optional secret, scopes, and fixed hosted or desktop callbacks.

Mimorii does not issue static client registrations. In theory, an operator could host a valid public CIMD document for Cursor's callbacks and enter that document URL as Cursor's static client ID. Cursor does not document CIMD interpretation or its exact MCP revision, so that path remains unverified and should not be presented as a supported setup.

## Security and deployment constraints

- Hosted clients require `MIMORII_PUBLIC_URL` to resolve to the exact public HTTPS origin and `/api/mcp` resource.
- Do not add vendor origins to `MIMORII_CORS_ORIGINS` unless a real browser request sends an `Origin` header. Add only the observed exact origin, never a wildcard.
- Do not weaken Host validation for a client. Add `MIMORII_MCP_ALLOWED_HOSTS` only for a trusted proxy that rewrites `Host`.
- Keep write-tool confirmation enabled in every client. Client trust and approval settings are not authorization controls.
- Returned names and incident text are untrusted model input. Client-side prompt-injection defenses remain necessary even though Mimorii exposes no prompts, filesystem access, command execution, or arbitrary network tools.
- Prefer `mcp:read` until a user invokes a mutation, then use the existing `mcp:write` challenge. Do not grant broader team access for client compatibility.

## Focused follow-up

1. Test ChatGPT and Claude hosted connectors against a public deployment, including the app resource, refresh action, and classic fallback.
2. Test current Claude Code with consent, refresh rotation, revoke, and write-scope step-up, then repeat the OAuth flow in the VS Code local agent.
3. Reassess Gemini clients when Google documents CIMD or another compatible public-client flow.
4. Ask Google and Cursor to document CIMD, PKCE, callback matching, and the negotiated MCP revision before adding product-specific setup instructions.
5. Do not add sessionful transport, HTTP+SSE, DCR, confidential-client secrets, or static bearer authentication without a separate security and maintenance decision.

## Official references

### MCP and OAuth

- [MCP Apps `2026-01-26`](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx)
- [MCP `2026-07-28` Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)
- [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
- [Official TypeScript SDK roadmap](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/ROADMAP.md)
- [Official TypeScript SDK protocol versions](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/protocol-versions.md)
- [OAuth 2.0 for Native Apps, RFC 8252](https://www.rfc-editor.org/rfc/rfc8252)

### OpenAI

- [OpenAI MCP server and UI quickstart](https://developers.openai.com/plugins/build/app-quickstart)
- [OpenAI authentication](https://developers.openai.com/plugins/build/auth)
- [OpenAI MCP server review requirements](https://developers.openai.com/plugins/deploy/app-review)

### Claude

- [Claude Code MCP configuration and OAuth](https://code.claude.com/docs/en/mcp)
- [Claude custom connector requirements](https://claude.com/docs/connectors/building)
- [Claude connector authentication](https://claude.com/docs/connectors/building/authentication)
- [Claude interactive connectors](https://support.claude.com/en/articles/13454812-use-interactive-connectors-in-claude)
- [Claude lazy authentication reference](https://claude.com/docs/connectors/building/lazy-authentication)

### Gemini

- [Gemini CLI MCP servers](https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md)
- [Gemini CLI package dependency](https://github.com/google-gemini/gemini-cli/blob/main/package.json)
- [Gemini Code Assist agent mode](https://docs.cloud.google.com/gemini/docs/codeassist/use-agentic-chat-pair-programmer)
- [Gemini Spark custom apps](https://support.google.com/gemini/answer/17209137)
- [Gemini Enterprise custom MCP connection](https://support.google.com/g/answer/17106276)
- [Gemini Interactions API remote MCP](https://ai.google.dev/gemini-api/docs/function-calling#remote_mcp_model_context_protocol)

### Ollama

- [Ollama tool calling with MCP hosts](https://ollama.com/blog/streaming-tool)
- [Ollama web-search MCP server](https://ollama.com/blog/web-search)
- [`ollama launch` integrations](https://docs.ollama.com/cli#launch-integrations)

### VS Code and Cursor

- [VS Code MCP servers](https://code.visualstudio.com/docs/agent-customization/mcp-servers)
- [VS Code MCP configuration](https://code.visualstudio.com/docs/agents/reference/mcp-configuration)
- [VS Code CIMD support](https://code.visualstudio.com/updates/v1_106#_authentication-client-id-metadata-document-authentication-flow)
- [VS Code agent harness limits](https://code.visualstudio.com/docs/agents/run/agent-harnesses)
- [Cursor MCP documentation](https://cursor.com/docs/mcp)
