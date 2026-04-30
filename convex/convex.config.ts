import { defineApp } from "convex/server";
import aggregate from "@convex-dev/aggregate/convex.config.js";
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js";

const app = defineApp();

// Aggregate of bills keyed by [billType] within each congress namespace.
// Used to compute totalCount, houseCount, and senateCount per congress without
// scanning the bills table (which can exceed Convex's per-query document limit).
app.use(aggregate, { name: "billsByChamber" });

// Aggregate of bills keyed by [progressStage] within each congress namespace.
// Used to compute the per-stage breakdown for the homepage status chart.
app.use(aggregate, { name: "billsByStage" });

// Application-level rate limits (chat quotas — see convex/rateLimits.ts).
app.use(rateLimiter);

export default app;
