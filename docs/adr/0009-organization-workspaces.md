# ADR 0009: Organization workspaces

## Status

Accepted

## Context

Each Dash instance serves one organization. Users need a personal workspace and access to shared workspaces within that organization.

## Decision

- Accounts, organization roles, invitations, settings, and data sources belong to the instance.
- Dash creates one personal workspace on the user's first workspace access. A unique database index prevents duplicate personal workspaces.
- A personal workspace is private by default. Its owner can share it with existing organization members.
- Only organization admins can create shared workspaces. All organization admins can manage these workspaces.
- Organization admins cannot access another person's personal workspace without an explicit grant.
- Workspace managers can grant viewer or editor access. Viewers can read dashboards. Editors can create, change, and delete dashboards.
- Only workspace managers can change access or the workspace name. These actions require a browser session.
- Each dashboard belongs to one workspace. Every dashboard read and write includes its workspace ID.
- Data sources remain available throughout the organization. Only organization admins can add, change, or remove them.
- Browser links carry a `workspace` search parameter. Without it, the browser opens the user's personal workspace.
- Session API requests select a workspace with `X-Dash-Workspace-Id`. Without that header, dashboard requests use the user's personal workspace.
- New API tokens bind to the selected workspace. Dashboard and MCP requests check current membership as well as token scopes.
- A token cannot select a different workspace. A role change or access removal applies to subsequent requests.
- This change does not migrate existing content or tokens. The project does not require backward compatibility.

## Consequences

A workspace link does not grant access. The recipient must sign in with an account that has access to that workspace.

Workspace privacy protects dashboards. It does not restrict the organization's data sources. A user can query those sources from their personal workspace.

The demo dashboard belongs to the demo admin's personal workspace. The demo data source remains available throughout the organization.

Personal workspace creation uses a deterministic ID and an upsert after authentication. Account creation does not write or delete workspace records.
This separates account creation from workspace creation without a transaction. A failed workspace request can retry the same upsert.
