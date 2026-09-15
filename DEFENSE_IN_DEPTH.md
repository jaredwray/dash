# Defense in Depth

Tracking against https://github.com/jaredwray/agentic/blob/main/skills/security/defense-in-depth-nodejs/SKILL.md.

Profile: website/app · public

## 1. Security docs
- [x] `SECURITY.md` present — contact info + "How this repository is secured" summary — PR #8
- [x] `DEFENSE_IN_DEPTH.md` present (this file) — PR #8

## 2. CODEOWNERS and cloud bootstrap
- [x] `.github/CODEOWNERS` covers `/.github/`, `/.vscode/`, `/.cursor/`, `/.devcontainer/`, `/scripts/` with owners the maintainer names — PR #9
- [x] Codespaces and Cursor Cloud Agents bootstrap Aikido Safe Chain via scripts/setup-cloud-environment.sh (--ci shims, frozen lockfile) — PR #10

## 3. Dependencies (pnpm)
- [x] `packageManager: pnpm@11.3+` pinned in `package.json` — PR #11
- [x] 7-day cooldown: `minimumReleaseAge: 10080`, `minimumReleaseAgeStrict: true`, `minimumReleaseAgeIgnoreMissingTime: false`; no first-party `minimumReleaseAgeExclude` — PR #12
- [x] `trustPolicy: no-downgrade`; no first-party `trustPolicyExclude` — PR #13
- [ ] Lifecycle scripts blocked: `strictDepBuilds: true`, `dangerouslyAllowAllBuilds: false`, `allowBuilds: {}` baseline (PR pending)
- [ ] `blockExoticSubdeps: true`
- [x] Lockfile committed; CI installs with `pnpm install --frozen-lockfile` — verified 2026-09-15
- [x] No `.github/dependabot.yml`; other dependency-update tools (if any) open PRs only — never auto-merge — verified 2026-09-15

## 4. GitHub Actions
- [ ] `permissions: contents: read` (or `{}` + per-job grants) on every workflow
- [x] No `contents: write` except jobs whose purpose is mutating the repo (GitHub Release, Changesets version PR); generated output is a workflow artifact, never committed back from CI — verified 2026-09-15
- [ ] Every action pinned to a full commit SHA (`npx actions-up`)
- [ ] Every job installs Socket Firewall (`SocketDev/action` SHA-pinned, `firewall-version` pinned); `pnpm install` / `npm install` run as `sfw pnpm install` / `sfw npm install`
- [ ] `.github/workflows/check-workflows.yaml` lints workflows with zizmor on every PR
- [ ] Workflow `name:` and job `name:` contain no spaces (kebab-case) so they can be set as required status checks
- [ ] `persist-credentials: false` on checkouts that don't push
- [x] No `pull_request_target` on workflows that run untrusted PR code — verified 2026-09-15
- [x] Artifact-publishing workflows disable `actions/setup-node` default caching (`package-manager-cache: false`) to prevent cache poisoning — verified 2026-09-15 (no artifact-publishing workflows)
- [ ] No npm tokens (or other registry credentials) in Actions secrets

## 6. Security tooling
- [ ] Aikido runs on every build
- [ ] Aikido release gate: the release workflow's stage-publish job `needs:` a passing `scan-release`
- [x] Socket reviews every PR that changes dependencies — verified 2026-09-15 (PR #8: Socket Security Pull Request Alerts and Project Report)

## 7. Repository lockdown
- [ ] Phishing-resistant 2FA (passkeys / hardware keys) on the GitHub and npm accounts (manual)
- [ ] Recovery codes stored offline in a password manager (manual)
- [ ] `lockdown-repo.sh` applied by a repo admin (never committed to this repo); `--check` with `--required-checks` and `--allowed-actions` passes (PRs required on the default branch, merges blocked unless required status checks pass, tag ruleset, immutable releases, fork-PR approval (public repos), read-only workflow tokens, Actions allowlist, secret scanning, Dependabot disabled, private vulnerability reporting (public repos))
