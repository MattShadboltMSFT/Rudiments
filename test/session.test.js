import assert from "node:assert/strict";
import test from "node:test";
import { EXERCISES } from "../site/exercises.js";
import { initialSession, nextExercisePosition, restoreSession, timedPlan } from "../site/session.js";

test("20-minute session contains four different exercises", () => {
  const plan = timedPlan(20, () => 0);
  assert.equal(plan.length, 4);
  assert.equal(new Set(plan).size, 4);
  assert.ok(plan.every((index) => index >= 0 && index < EXERCISES.length));
});

test("targets are whole five-minute exercises without repeats", () => {
  for (const minutes of [5, 10, 15, 20, 30, 45, 60, 100]) {
    const plan = timedPlan(minutes, () => .999);
    assert.equal(plan.length, minutes / 5);
    assert.equal(new Set(plan).size, plan.length);
  }
  for (const minutes of [0, 4, 6, 101, 105, NaN]) {
    assert.throws(() => timedPlan(minutes), RangeError);
  }
});

test("restores a paused session and rejects inconsistent plans", () => {
  const session = { mode: "timed", queue: [3, 7, 2, 9], position: 1, selected: 7, completed: [3], elapsed: 42 };
  assert.deepEqual(restoreSession(JSON.stringify(session)), { ...session, phase: "playing", phaseElapsed: 0, scores: {} });
  assert.deepEqual(restoreSession(JSON.stringify(initialSession())), initialSession());
  assert.throws(() => restoreSession(JSON.stringify({ ...session, completed: [3, 3] })));
  assert.throws(() => restoreSession(JSON.stringify({ ...session, selected: 2 })));
  assert.throws(() => restoreSession(JSON.stringify({ ...session, elapsed: 301 })));
  assert.deepEqual(restoreSession(JSON.stringify({ ...session, scores: { 7: { hits: 8, total: 10 } } })).scores, { 7: { hits: 8, total: 10 } });
  assert.throws(() => restoreSession(JSON.stringify({ ...session, scores: { 7: { hits: 11, total: 10 } } })));
  assert.equal(restoreSession(JSON.stringify({ ...session, phase: "break", phaseElapsed: 1 })).phaseElapsed, 1);
  assert.throws(() => restoreSession(JSON.stringify({ ...session, phase: "wrong", phaseElapsed: 0 })));
  assert.equal(restoreSession(JSON.stringify(session)).phase, "playing");
});

test("next skips completed slots, wraps to unfinished slots, and stops when done", () => {
  const session = { mode: "timed", queue: [3, 7, 2, 9], position: 0, selected: 3, completed: [7, 2], elapsed: 42 };
  assert.equal(nextExercisePosition(session), 3);
  session.position = 3;
  session.selected = 9;
  assert.equal(nextExercisePosition(session), 0);
  session.completed.push(3);
  assert.equal(nextExercisePosition(session), -1);
  session.completed.push(9);
  assert.equal(nextExercisePosition(session), -1);
  const free = initialSession();
  free.selected = EXERCISES.length - 1;
  assert.equal(nextExercisePosition(free), 0);
});
