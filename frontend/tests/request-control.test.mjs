import test from "node:test";
import assert from "node:assert/strict";

import {
  createSingleFlightRequester,
  retryTransientRequest,
} from "../src/request-control.mjs";

test("retries transient network failures and returns the successful response", async () => {
  let attempts = 0;
  const waits = [];
  const result = await retryTransientRequest(
    async () => {
      attempts += 1;
      if (attempts < 3) throw new TypeError("Failed to fetch");
      return "ok";
    },
    {
      attempts: 4,
      delays: [10, 20, 30],
      wait: async (delay) => waits.push(delay),
    },
  );

  assert.equal(result, "ok");
  assert.equal(attempts, 3);
  assert.deepEqual(waits, [10, 20]);
});

test("does not retry a non-transient API error", async () => {
  let attempts = 0;
  const error = Object.assign(new Error("invalid request"), { status: 400 });

  await assert.rejects(
    retryTransientRequest(async () => {
      attempts += 1;
      throw error;
    }, { wait: async () => {} }),
    error,
  );
  assert.equal(attempts, 1);
});

test("shares an in-flight request and clears it after completion", async () => {
  const singleFlight = createSingleFlightRequester();
  let calls = 0;
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const request = async () => {
    calls += 1;
    await pending;
    return calls;
  };

  const first = singleFlight("same", request);
  const second = singleFlight("same", request);
  assert.equal(first, second);
  assert.equal(calls, 0);
  release();
  assert.equal(await first, 1);
  assert.equal(await second, 1);

  assert.equal(await singleFlight("same", request), 2);
});
