import assert from "node:assert/strict";
import test from "node:test";
import { BREAK_SECONDS, COUNT_IN_BEATS, DURATION_SECONDS, EXERCISES, MAX_BPM, nextTempoChange, START_BPM, tempoAt } from "../site/exercises.js";

test("library contains 20 unique, playable rudiments", () => {
  assert.equal(EXERCISES.length, 20);
  assert.equal(new Set(EXERCISES.map((exercise) => exercise.name)).size, 20);
  for (const exercise of EXERCISES) {
    assert.ok(exercise.pattern.length >= 2, exercise.name);
    assert.ok(exercise.pattern.some((note) => note.hand === "R"), exercise.name);
    assert.ok(exercise.pattern.some((note) => note.hand === "L"), exercise.name);
    for (const note of exercise.pattern) {
      assert.ok([1, 2].includes(note.units), exercise.name);
      assert.ok(["", "f", "d"].includes(note.grace), exercise.name);
    }
  }
});

test("tempo rises in five-BPM steps to 120 within the five-minute session", () => {
  assert.equal(DURATION_SECONDS, 300);
  assert.equal(tempoAt(0), START_BPM);
  assert.equal(tempoAt(23.99), START_BPM);
  assert.equal(tempoAt(24), 65);
  assert.equal(tempoAt(287), 115);
  assert.equal(tempoAt(288), MAX_BPM);
  assert.equal(tempoAt(299.99), MAX_BPM);
  assert.equal(tempoAt(300), MAX_BPM);
});

test("each tempo increase follows a playing-time boundary, with a rest and four-beat count-in", () => {
  assert.equal(BREAK_SECONDS, 2);
  assert.equal(COUNT_IN_BEATS, 4);
  assert.equal(nextTempoChange(0), 24);
  assert.equal(nextTempoChange(23.99), 24);
  assert.equal(nextTempoChange(24), 48);
  assert.equal(nextTempoChange(287.99), 288);
  assert.equal(nextTempoChange(288), 300);
  assert.equal(nextTempoChange(299.9), 300);
});

test("flams and drags include grace strokes on both hands", () => {
  for (const name of ["Flam", "Drag"]) {
    const exercise = EXERCISES.find((item) => item.name === name);
    assert.ok(exercise.pattern.every((note) => note.grace === (name === "Flam" ? "f" : "d")));
    assert.deepEqual(new Set(exercise.pattern.map((note) => note.hand)), new Set(["R", "L"]));
  }
});
