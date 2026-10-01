import { EXERCISES } from "./exercises.js";

export const MIN_SESSION_MINUTES = 5;
export const MAX_SESSION_MINUTES = EXERCISES.length * 5;

export function timedPlan(minutes, random = Math.random) {
  if (!Number.isInteger(minutes) || minutes < MIN_SESSION_MINUTES ||
      minutes > MAX_SESSION_MINUTES || minutes % 5 !== 0) {
    throw new RangeError(`Choose a target from 5 to ${MAX_SESSION_MINUTES} minutes in five-minute steps.`);
  }
  const pool = EXERCISES.map((_, index) => index);
  const count = minutes / 5;
  for (let index = 0; index < count; index++) {
    const roll = random();
    if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new RangeError("Random value must be between 0 and 1.");
    const pick = index + Math.floor(roll * (pool.length - index));
    [pool[index], pool[pick]] = [pool[pick], pool[index]];
  }
  return pool.slice(0, count);
}

export function initialSession() {
  return { mode: "free", queue: [], position: 0, selected: 0, completed: [], elapsed: 0, phase: "playing", phaseElapsed: 0, scores: {} };
}

export function nextExercisePosition(session) {
  if (session.mode !== "timed") return (session.selected + 1) % EXERCISES.length;
  for (let offset = 1; offset < session.queue.length; offset++) {
    const position = (session.position + offset) % session.queue.length;
    if (!session.completed.includes(session.queue[position])) return position;
  }
  return -1;
}

export function restoreSession(raw) {
  const data = JSON.parse(raw);
  if (!data || !["free", "timed"].includes(data.mode) ||
      !Array.isArray(data.queue) || !Array.isArray(data.completed) ||
      !Number.isInteger(data.selected) || data.selected < 0 || data.selected >= EXERCISES.length ||
      !Number.isInteger(data.position) || !Number.isFinite(data.elapsed) ||
      data.elapsed < 0 || data.elapsed > 300 ||
      data.completed.some((item) => !Number.isInteger(item) || item < 0 || item >= EXERCISES.length) ||
      data.queue.some((item) => !Number.isInteger(item) || item < 0 || item >= EXERCISES.length)) {
    throw new Error("Saved practice session is invalid.");
  }
  if (data.phase === undefined) {
    data.phase = "playing";
    data.phaseElapsed = 0;
  }
  if (data.scores === undefined) data.scores = {};
  if (!data.scores || typeof data.scores !== "object" || Array.isArray(data.scores) ||
      Object.entries(data.scores).some(([key, value]) =>
        !Number.isInteger(Number(key)) || Number(key) < 0 || Number(key) >= EXERCISES.length ||
        !value || !Number.isInteger(value.hits) || !Number.isInteger(value.total) ||
        value.hits < 0 || value.total < value.hits)) {
    throw new Error("Saved practice scores are invalid.");
  }
  if (!["playing", "break", "count-in"].includes(data.phase) ||
      !Number.isFinite(data.phaseElapsed) || data.phaseElapsed < 0 || data.phaseElapsed > 10) {
    throw new Error("Saved practice phase is invalid.");
  }
  if (data.mode === "timed" &&
      (!data.queue.length || data.queue.length > EXERCISES.length ||
       new Set(data.queue).size !== data.queue.length ||
       new Set(data.completed).size !== data.completed.length ||
       data.completed.some((item) => !data.queue.includes(item)) ||
       data.position < 0 || data.position >= data.queue.length ||
       data.queue[data.position] !== data.selected)) {
    throw new Error("Saved timed session is invalid.");
  }
  return data;
}
