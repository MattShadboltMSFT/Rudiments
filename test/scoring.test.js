import assert from "node:assert/strict";
import test from "node:test";
import { createOnsetDetector, StrokeScore, strokeWindow } from "../site/scoring.js";

test("matches one detected hit per expected note within its tempo-dependent window", () => {
  const score = new StrokeScore();
  score.expect(1, 60);
  score.expect(1.25, 60);
  assert.equal(score.hit(1.06), true);
  assert.equal(score.hit(1.07), false);
  assert.equal(score.hit(1.21), true);
  score.flush(1.4);
  assert.equal(score.hits, 2);
  assert.equal(score.total, 2);
  assert.equal(score.percentage, 100);
  assert.ok(strokeWindow(120) < strokeWindow(60));
});

test("late, extra, and skipped strokes cannot inflate success", () => {
  const score = new StrokeScore();
  score.expect(1, 120);
  score.expect(1.125, 120);
  score.expect(1.25, 120);
  assert.equal(score.hit(0.8), false);
  assert.equal(score.hit(1.126), true);
  score.flush(1.4);
  assert.equal(score.hits, 1);
  assert.equal(score.total, 3);
  assert.equal(score.percentage, 33);
});

test("pausing discards future scheduled notes without marking them missed", () => {
  const score = new StrokeScore(3, 5);
  score.expect(1, 60);
  score.expect(2, 60);
  score.discardPending(1.1);
  assert.deepEqual([score.hits, score.total, score.pending.length], [3, 6, 0]);
  assert.equal(score.percentage, 50);
});

test("pausing includes played notes still inside the matching window", () => {
  const score = new StrokeScore();
  score.expect(1, 60);
  score.expect(1.25, 60);
  score.hit(1.02);
  score.discardPending(1.03);
  assert.deepEqual([score.hits, score.total], [1, 1]);
});

test("transient detector ignores room noise and sustained sound", () => {
  const detector = createOnsetDetector();
  const quiet = new Float32Array(256).fill(0.003);
  const strike = new Float32Array(256).fill(0.12);
  assert.equal(detector.sample(quiet, 0), false);
  assert.equal(detector.sample(strike, 0.1), true);
  assert.equal(detector.sample(strike, 0.12), false);
  assert.equal(detector.sample(quiet, 0.2), false);
  assert.equal(detector.sample(strike, 0.23), true);
});
