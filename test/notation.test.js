import assert from "node:assert/strict";
import test from "node:test";
import { EXERCISES } from "../site/exercises.js";
import { notationLayout } from "../site/notation.js";

test("each rudiment has one notated position per played stroke", () => {
  for (const exercise of EXERCISES) {
    const { notes, units, width } = notationLayout(exercise.pattern);
    assert.equal(notes.length, exercise.pattern.length, exercise.name);
    assert.equal(units, exercise.pattern.reduce((sum, note) => sum + note.units, 0), exercise.name);
    assert.ok(width > notes.at(-1).x, exercise.name);
    notes.forEach((note, index) => {
      assert.equal(note.hand, exercise.pattern[index].hand, exercise.name);
      if (index) assert.equal(note.x - notes[index - 1].x, exercise.pattern[index - 1].units * 42, exercise.name);
    });
  }
});

test("beat groups follow sixteenth-note timing, including held eighths", () => {
  const seven = EXERCISES.find(({ name }) => name === "Single Stroke Seven");
  const { notes } = notationLayout(seven.pattern);
  assert.equal(notes[6].units, 2);
  assert.equal(notes[7].x - notes[6].x, 84);
  assert.equal(notes[7].beat, 2);
});
