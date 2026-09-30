/**
 * Unit tests for the PostHog Logs payload. node:assert, no framework. Run via
 * `pnpm test`. The end-to-end path (answer → scheduled send → PostHog) is in
 * convex/answerLogs.spec.ts.
 */
import assert from "node:assert/strict";
import { otlpLogBody, readPosthogId, type LogLine } from "./posthogLogs";

let passed = 0;
const failures: string[] = [];
function it(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push(
      `  ✗ ${name}\n    ${err instanceof Error ? err.message.split("\n").join("\n    ") : String(err)}`,
    );
  }
}

const line: LogLine = {
  level: "error",
  message: "answer failed",
  timestampMs: 1_790_000_000_123,
  attributes: {
    sessionId: "0199-abc",
    posthogDistinctId: "0199-def",
    signed_in: false,
    duration_ms: 4210,
    ratio: 0.5,
  },
};

function record(l = line) {
  return otlpLogBody(l).resourceLogs[0].scopeLogs[0].logRecords[0];
}

it("names the service so the line can be filtered from the browser's", () => {
  const resource = otlpLogBody(line).resourceLogs[0].resource;
  assert.deepEqual(resource.attributes, [
    { key: "service.name", value: { stringValue: "billsincongress-convex" } },
  ]);
});

it("writes the timestamp in nanoseconds without losing precision", () => {
  // 1_790_000_000_123 * 1e6 is past 2^53; as a double the last digits change.
  assert.equal(record().timeUnixNano, "1790000000123000000");
});

it("maps levels to OpenTelemetry severities", () => {
  assert.equal(record().severityText, "ERROR");
  assert.equal(record().severityNumber, 17);
  assert.equal(record({ ...line, level: "warn" }).severityNumber, 13);
  assert.equal(record({ ...line, level: "info" }).severityNumber, 9);
});

it("carries the two ids under the exact names PostHog links replays by", () => {
  const attrs = Object.fromEntries(record().attributes.map((a) => [a.key, a.value]));
  assert.deepEqual(attrs.sessionId, { stringValue: "0199-abc" });
  assert.deepEqual(attrs.posthogDistinctId, { stringValue: "0199-def" });
});

it("types each attribute the way OTLP JSON expects", () => {
  const attrs = Object.fromEntries(record().attributes.map((a) => [a.key, a.value]));
  assert.deepEqual(attrs.signed_in, { boolValue: false });
  assert.deepEqual(attrs.duration_ms, { intValue: "4210" });
  assert.deepEqual(attrs.ratio, { doubleValue: 0.5 });
});

it("caps a long string, so one error cannot become a huge line", () => {
  const long = record({ ...line, attributes: { error: "x".repeat(5000) } });
  assert.equal(long.attributes[0].value.stringValue?.length, 500);
});

it("keeps a real PostHog id and drops anything that is not one", () => {
  assert.equal(readPosthogId("0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b"), "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b");
  assert.equal(readPosthogId(" 0199-abc "), "0199-abc");
  assert.equal(readPosthogId(undefined), undefined);
  assert.equal(readPosthogId(""), undefined);
  assert.equal(readPosthogId(42), undefined);
  assert.equal(readPosthogId("<script>"), undefined);
  assert.equal(readPosthogId("a".repeat(201)), undefined);
});

if (failures.length > 0) {
  console.error(`posthogLogs: ${failures.length} failed, ${passed} passed\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`posthogLogs: ${passed} passed`);
