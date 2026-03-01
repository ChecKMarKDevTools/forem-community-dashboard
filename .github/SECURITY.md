# Security Policy

## Supported Versions

The `main` branch is the supported version. Older releases are not patched retroactively — if you're running a tagged release, upgrade to main.

---

## Reporting a Vulnerability

Please don't file a public GitHub issue for security vulnerabilities. That tells everyone about the problem before there's a fix, which helps exactly nobody (except the people who would exploit it).

**Preferred:** Use [GitHub's private security advisory](https://github.com/ChecKMarKDevTools/dev-community-dashboard/security/advisories/new) to report privately.

**Alternative:** Email [human@checkmarkdevtools.dev](mailto:human@checkmarkdevtools.dev) with the subject line:

```
[SECURITY] dev-community-dashboard — <short description>
```

### What to Include

The more detail, the faster this moves. At minimum:

- A clear description of the vulnerability
- Steps to reproduce — or a proof-of-concept if you have one
- What you believe the impact is
- The version or commit SHA you tested against
- Your contact info if you want to be credited in the release notes

I don't run a bug bounty program. If you report something meaningful and want credit, you'll get it.

---

## Response Timeline

I'll acknowledge the report within **72 hours**. If you don't hear back, send a follow-up — inboxes get busy.

For high-severity issues, I aim to have a fix in `main` within **14 days**, depending on complexity. I'll keep you updated on progress.

---

## Scope

This dashboard reads from the Forem public API and surfaces data into a Next.js/Supabase application. The meaningful attack surface is:

**In scope:**

- Authentication or authorization bypasses — the cron endpoint uses a Bearer token; misconfigurations here matter
- SQL injection or data exfiltration through Supabase queries
- Server-side request forgery through the Forem API client
- XSS or content injection in the dashboard UI
- Leaking private Forem data — drafts, unpublished posts, or private user info — through the sync pipeline
- Secrets or environment variables exposed in logs, HTTP responses, or error messages
- Dependency vulnerabilities with a credible exploitation path in this project's specific context

**Out of scope:**

- Vulnerabilities in Forem itself, Supabase itself, or upstream dependencies with no realistic attack path here
- Issues that require physical access to the deployment infrastructure
- Social engineering
- Anything that requires the attacker to already have admin access to the deployment
- Theoretical vulnerabilities with no demonstrated impact

If you're unsure whether something falls in scope, report it anyway. The worst outcome is a "thanks, but out of scope" reply.

---

## License and Security Research

This project is licensed under [Polyform Shield 1.0.0](../LICENSE). Security research and testing against your **own** deployment is fine and encouraged.

Testing against the production instance at [dev-signal.checkmarkdevtools.dev](https://dev-signal.checkmarkdevtools.dev) without prior coordination is not. Contact first — I'll work with you.

---

If you find something and report it responsibly: thank you. It matters.
