import assert from "node:assert/strict";
import test from "node:test";
import { createWakeLock } from "../site/wake-lock.js";

const page = { visibilityState: "visible", defaultView: { isSecureContext: true } };
const tick = () => new Promise((resolve) => setImmediate(resolve));

function sentinel() {
  let released;
  return {
    releaseCount: 0,
    addEventListener(event, listener) {
      if (event === "release") released = listener;
    },
    async release() {
      this.releaseCount++;
      released?.();
    },
  };
}

test("acquires on start and releases on pause", async () => {
  const lock = sentinel();
  const statuses = [];
  const wake = createWakeLock({ wakeLock: { request: async (type) => {
    assert.equal(type, "screen");
    return lock;
  } } }, page, (status) => statuses.push(status));
  wake.start();
  await tick();
  assert.equal(statuses.at(-1), "");
  wake.stop();
  await tick();
  assert.equal(lock.releaseCount, 1);
  assert.equal(statuses.at(-1), "");
});

test("a late wake lock cannot survive a stopped session", async () => {
  let resolveRequest;
  const lock = sentinel();
  const wake = createWakeLock({ wakeLock: { request: () => new Promise((resolve) => {
    resolveRequest = resolve;
  }) } }, page, () => {});
  wake.start();
  wake.stop();
  resolveRequest(lock);
  await tick();
  assert.equal(lock.releaseCount, 1);
});

test("reports unsupported and rejected wake locks rather than claiming screen is kept awake", async () => {
  const statuses = [];
  const unsupported = createWakeLock({}, page, (status) => statuses.push(status));
  unsupported.start();
  assert.match(statuses.at(-1), /unavailable/);
  unsupported.stop();
  const denied = createWakeLock({
    wakeLock: { request: async () => { throw new Error("NotAllowedError"); } },
  }, page, (status) => statuses.push(status));
  denied.start();
  await tick();
  assert.match(statuses.at(-1), /NotAllowedError/);
  denied.stop();
});

test("reacquires once after revocation, then reports a repeated release", async () => {
  const first = sentinel();
  const second = sentinel();
  const locks = [first, second];
  const statuses = [];
  const wake = createWakeLock({
    wakeLock: { request: async () => locks.shift() },
  }, page, (status) => statuses.push(status));
  wake.start();
  await tick();
  await first.release();
  await tick();
  assert.equal(statuses.at(-1), "");
  await second.release();
  assert.match(statuses.at(-1), /released/);
  wake.stop();
  await tick();
  assert.equal(second.releaseCount, 1);
});
