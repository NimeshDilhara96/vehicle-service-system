# Ultimate Production-Ready App Checklist & Workspace Rules

Always follow all rules in this checklist when designing, writing, reviewing, or refactoring backend and frontend code in this repository.

## 1. Architecture & Scalability
- **CRITICAL**: Design stateless APIs so any server instance can serve any request (no in-memory session/user state).
- **CRITICAL**: Support horizontal scaling behind a load balancer; verify session/auth works identically on every instance.
- **HIGH**: Move slow or non-critical work (emails, PDF generation, notifications) into background jobs/queues instead of the request cycle.
- **HIGH**: Define a caching strategy (what's cached, TTLs, where — CDN, Redis, in-process) before you need it.
- **MEDIUM**: Separate read-heavy and write-heavy paths where traffic justifies it (read replicas, CQRS-style separation).
- **HIGH**: Design services to fail independently — one slow dependency should not take down unrelated features.

## 2. Database Security & Scalability
- **CRITICAL**: Enforce tenantId/workspace/customerId ownership on every read, update, and delete.
- **CRITICAL**: Never trust a resource ID from the URL — verify it belongs to the authenticated user/tenant (IDOR protection).
- **CRITICAL**: Use connection pooling with sane min/max limits; never open one raw connection per request.
- **HIGH**: Set query timeouts and statement limits so one bad query can't exhaust the pool.
- **HIGH**: Monitor and alert on slow queries; run EXPLAIN/EXPLAIN ANALYZE on anything suspicious.
- **CRITICAL**: Wrap multi-step writes (money, inventory, orders, bookings, service bay allocations) in real database transactions.
- **CRITICAL**: Identify and protect against race conditions on concurrent writes (atomic conditional updates, row locks, optimistic locking `optimisticConcurrency: true`, unique constraints).
- **HIGH**: Index frequently filtered fields: `customerId`, `email`, `createdAt`, foreign keys (`appointmentId`, `driverId`, `vehicleId`, `bayId`, `mechanicId`).
- **CRITICAL**: Encrypt sensitive fields (cards, keys, PII) at rest; enforce HTTPS everywhere in transit.
- **HIGH**: Apply least-privilege DB credentials — the app user shouldn't have DROP/superuser rights.
- **CRITICAL**: Define backup, retention, and deletion policy (soft deletes `isDeleted: true` where audit trails are required).

## 3. Authentication & Session Security
- **CRITICAL**: Never store access/refresh tokens in `localStorage` — use `HttpOnly`, `Secure` cookies (or memory for access tokens).
- **CRITICAL**: Set `SameSite` cookie attributes appropriate to your frontend/backend origin setup.
- **CRITICAL**: Hash passwords with bcrypt/argon2 — never store or log plaintext passwords.
- **CRITICAL**: Rate-limit login, signup, OTP, and password-reset endpoints to stop brute force.
- **CRITICAL**: Invalidate tokens/sessions on logout and on password/security changes (`passwordChangedAt`).
- **CRITICAL**: Use short-lived, single-use tokens for forgot-password/reset flows.
- **HIGH**: Rotate refresh tokens on use and detect/react to refresh-token reuse.
- **HIGH**: Immediately revoke access when an account is disabled (`isActive: false`) or a role is downgraded.
- **MEDIUM**: Use a single backend source of truth (e.g., `GET /api/auth/me`) for role/plan — never trust client-side state for authorization decisions.
- **MEDIUM**: Set explicit session expiry / inactivity timeout policies.

## 4. API Security, Input Validation & Reliability
- **CRITICAL**: Validate every untrusted input with Zod/Joi/equivalent schema validation — types, formats, ranges.
- **CRITICAL**: Prevent SQL/NoSQL injection via parameterized queries / safe ORMs, strict type checks (`typeof === "string"`), and input sanitization.
- **CRITICAL**: Sanitize any user text that gets rendered to other users to prevent stored/reflected XSS and strip control characters (`[\u0000-\u001F\u007F]`).
- **CRITICAL**: Set strict request body size limits (`express.json({ limit: "10kb" })`) to block payload-based DoS.
- **HIGH**: Restrict each endpoint to the HTTP methods it actually supports.
- **CRITICAL**: Set timeouts on every outbound call (DB, cache, third-party APIs) — never wait forever.
- **CRITICAL**: Design critical write endpoints (payments, orders, bookings, webhooks) to be idempotent or atomic.
- **HIGH**: Enforce pagination and maximum page/result sizes on list endpoints.
- **HIGH**: Guard against SSRF on any endpoint that fetches a user-supplied URL.
- **HIGH**: Prevent open redirects where redirect targets are user-influenced.
- **MEDIUM**: Return consistent, generic error responses on 500s — never leak stack traces, DB errors, or internals to clients.
- **MEDIUM**: Always use `{ returnDocument: "after" }` instead of deprecated `{ new: true }` in Mongoose `findOneAndUpdate` / `findByIdAndUpdate`.

## 5. Authorization & Access Control
- **CRITICAL**: Never trust `role`, `userId`, or `customerId` sent from the frontend — derive them strictly from the verified JWT/session (`req.user`) server-side.
- **CRITICAL**: Protect every private route with verified authentication middleware (`protect`, `restrictTo`) — no exceptions.
- **CRITICAL**: Perform object-level authorization on every sensitive resource, not just route-level checks.
- **CRITICAL**: Enforce least privilege across `Customer`, `Driver`, `Mechanic`, and `Admin` roles.
- **CRITICAL**: Actively test and guard against privilege escalation and horizontal/vertical authorization bypass.
- **HIGH**: Re-check authorization on update, delete, export, and bulk operations, not just on read/create.
- **HIGH**: Block access immediately for deactivated or suspended users (`isActive: false`).
- **HIGH**: Maintain audit logs (`statusLogs` bounded with `$slice: -100`) for sensitive state/role/task changes.

## 6. Browser & Edge Security
- **CRITICAL**: Configure CORS to allow only real frontend origin(s) with `credentials: true` — never `'*'` in production.
- **CRITICAL**: Enforce HTTPS everywhere in production.
- **CRITICAL**: Add security headers via `helmet()`.

## 7. File Upload & Content Handling
- **CRITICAL**: Validate uploaded file size, MIME type, URL protocol (`https:`), and extension server-side — never trust the client's claim.
- **CRITICAL**: Block path traversal (`../`), `javascript:`, `data:text/html` URIs, and unsafe schemes.

## 8–12. Caching, Queues, Observability, Rate Limiting & Concurrency
- **CRITICAL**: Never log passwords, tokens, API keys, card numbers, or other secrets/PII.
- **CRITICAL**: Rate-limit sensitive endpoints per user/IP to stop targeted abuse.
- **CRITICAL**: Identify every operation where two simultaneous requests could corrupt state (service bay allocation, appointment slot booking, driver assignment) and protect it explicitly with atomic conditional updates (`findOneAndUpdate` with state preconditions) + transactions + `optimisticConcurrency: true`.
- **CRITICAL**: Make order/booking/service/invoice state transitions atomic — never leave a record half-updated on partial failure.

## 13–23. Secrets, Dependencies, Business Logic & Pre-Flight Quality
- **CRITICAL**: Keep all secrets out of source code — load them from environment config (`.env`) and ensure `.env` is in `.gitignore`.
- **CRITICAL**: Implement centralized global error handling; return a generic message on 500s.
- **CRITICAL**: Validate server-side that prices, pickup fees, distances, discounts, and invoice totals are computed by the backend (`calculateSecurePickupFare`), never trusted from the client.
- **HIGH**: Profile and prevent memory growth from unbounded arrays in MongoDB documents (cap array fields like `statusLogs` with `$slice`) or uncleaned intervals/AbortControllers in React `useEffect`.
- **HIGH**: Ensure zero ESLint errors (including `react-hooks/set-state-in-effect`, `react-hooks/purity`, `no-unused-vars`, `no-control-regex`) before completing any frontend/backend change.

