/**
 * Unit tests for how the bill page tells "no such bill" from "we could not ask".
 *
 * On 11 Oct 2026 Convex failed for three hours and every bill page answered
 * "Page not found", so readers and crawlers were told real bills did not exist.
 * Only a missing bill may be a 404; any other failure must reach the error page.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from "node:assert/strict";
import { billsService } from "@/lib/services/bills-service";
import { getBillPage, lookupBill } from "./get-bill";

let passed = 0;
const failures: string[] = [];

async function it(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
  } catch (err) {
    failures.push(
      `  ✗ ${name}\n    ${err instanceof Error ? err.message.split("\n").join("\n    ") : String(err)}`,
    );
  }
}

const service = billsService as unknown as Record<string, unknown>;
const quiet = console.error;

/** Make the next Convex read throw `error`, with the expected log line muted. */
function failWith(error: Error) {
  const fail = async () => {
    throw error;
  };
  service.fetchBillPage = fail;
  service.fetchBillById = fail;
}

async function main() {
  console.error = () => {};
  try {
    await it("a bill Convex says does not exist is a 404", async () => {
      failWith(new Error("Bill not found"));
      assert.equal(await getBillPage("99999hr119"), null);
      assert.deepEqual(await lookupBill("99999hr119"), { status: "missing" });
    });

    await it("an id that is not a bill id is a 404 without asking Convex", async () => {
      failWith(new Error("Convex should not be asked"));
      assert.equal(await getBillPage("not-a-bill"), null);
      assert.deepEqual(await lookupBill("not-a-bill"), { status: "missing" });
    });

    await it("a Convex server error reaches the error page, not a 404", async () => {
      failWith(new Error("[Request ID: 1] Server Error"));
      await assert.rejects(getBillPage("1hr119"), /Server Error/);
      assert.deepEqual(await lookupBill("1hr119"), { status: "error" });
    });

    await it("a network failure reaches the error page, not a 404", async () => {
      failWith(new TypeError("fetch failed"));
      await assert.rejects(getBillPage("2hr119"), /fetch failed/);
    });

    await it("a read that fails once is tried again, and the reader gets the bill", async () => {
      const page = { bill: { id: "4hr119" }, extras: {} };
      let calls = 0;
      service.fetchBillPage = async () => {
        calls++;
        if (calls === 1) throw new Error("[Request ID: 2] Server Error");
        return page;
      };
      assert.equal(await getBillPage("4hr119"), page);
      assert.equal(calls, 2);
    });

    await it("a failure that lasts past the retry still reaches the error page", async () => {
      let calls = 0;
      service.fetchBillPage = async () => {
        calls++;
        throw new Error("[Request ID: 3] Server Error");
      };
      await assert.rejects(getBillPage("5hr119"), /Server Error/);
      assert.equal(calls, 2);
    });

    await it("a bill that is gone when the retry asks is a 404", async () => {
      let calls = 0;
      service.fetchBillPage = async () => {
        calls++;
        throw new Error(calls === 1 ? "fetch failed" : "Bill not found");
      };
      assert.equal(await getBillPage("6hr119"), null);
    });

    await it("a bill Convex says does not exist is not asked for twice", async () => {
      let calls = 0;
      service.fetchBillPage = async () => {
        calls++;
        throw new Error("Bill not found");
      };
      assert.equal(await getBillPage("7hr119"), null);
      assert.equal(calls, 1);
    });

    await it("a bill that loads is returned as it came", async () => {
      const page = { bill: { id: "3hr119" }, extras: {} };
      service.fetchBillPage = async () => page;
      assert.equal(await getBillPage("3hr119"), page);
    });
  } finally {
    console.error = quiet;
  }

  if (failures.length > 0) {
    console.error(`get-bill: ${passed} passed, ${failures.length} failed`);
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log(`get-bill: ${passed} passed, 0 failed`);
}

main();
