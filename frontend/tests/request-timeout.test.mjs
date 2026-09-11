import test from "node:test";
import assert from "node:assert/strict";
import { requestJsonWithTimeout, RequestTimeoutError } from "../src/request-timeout.mjs";

test("returns a successful calculation without changing the payload", async (t) => {
  const payload = { chart_data: { planets: [] } };
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
  }));
  const result = await requestJsonWithTimeout("https://example.test", { method: "POST" });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.data, payload);
});

test("ends a stalled connection and aborts the request", async (t) => {
  let signal;
  t.mock.method(globalThis, "fetch", (_, options) => {
    signal = options.signal;
    return new Promise(() => {});
  });
  await assert.rejects(requestJsonWithTimeout("https://example.test", {}, 10), RequestTimeoutError);
  assert.equal(signal.aborted, true);
});

test("ends a stalled response body as well as a stalled connection", async (t) => {
  t.mock.method(globalThis, "fetch", async () => ({
    headers: new Headers({ "content-type": "application/json" }),
    json: () => new Promise(() => {}),
  }));
  await assert.rejects(requestJsonWithTimeout("https://example.test", {}, 10), RequestTimeoutError);
});

test("preserves HTTP errors for the caller's retry policy", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("Service unavailable", { status: 503 }));
  const { response, data } = await requestJsonWithTimeout("https://example.test", {});
  assert.equal(response.status, 503);
  assert.equal(data.detail, "Service unavailable");
});
