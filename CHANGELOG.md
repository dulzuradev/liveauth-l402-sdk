# Changelog

All notable changes to this package will be documented in this file.

## 0.1.0 - 2026-05-26

Initial public SDK release candidate.

- Added `L402Client` for invoice creation, payment validation, token verification, token cache helpers, and one-retry paid requests.
- Added `L402BundleClient` for bundle invoice creation, claim polling, bundle status, bundle purchase helpers, and MCP session creation.
- Added parser and request helpers: `parseWwwAuthenticate()`, `extractInvoiceFrom402()`, `withL402Token()`, and `isPaymentRequiredResponse()`.
- Added typed SDK errors and an in-memory token store.
- Documented LiveAuth v0.1 pay-per-call tokens as project-bound, allowance-scoped bearer tokens.
- Added local smoke coverage for invoice, token, bundle, and MCP session flows.
