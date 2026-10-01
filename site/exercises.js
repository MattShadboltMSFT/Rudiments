// One token is one sixteenth note; :2 holds a stroke for two sixteenths.
// f = flam (one grace stroke), d = drag (two grace strokes), > = accent.
function exercise(name, category, description, sticking) {
  return {
    name, category, description,
    pattern: sticking.split(" ").map((token) => {
      const match = /^(>?)([fd]?)([RL])(?::([12]))?$/.exec(token);
      if (!match) throw new Error(`Invalid sticking token: ${token}`);
      return {
        hand: match[3],
        accent: Boolean(match[1]),
        grace: match[2],
        units: Number(match[4] ?? 1),
      };
    }),
  };
}

export const EXERCISES = [
  exercise("Single Stroke Roll", "Single strokes", "Alternate hands evenly. Keep every stroke relaxed and consistent.", ">R L R L >R L R L"),
  exercise("Single Stroke Four", "Single strokes", "Four alternating strokes, with a clear accent to begin each group.", ">R L R L >L R L R"),
  exercise("Single Stroke Seven", "Single strokes", "Seven alternating strokes resolve on a longer accented note. Lead with either hand.", "R L R L R L >R:2 L R L R L R >L:2"),
  exercise("Double Stroke Roll", "Rolls", "Two smooth, even strokes per hand. Let the second stroke rebound naturally.", ">R R L L >R R L L"),
  exercise("Five Stroke Roll", "Rolls", "Two doubles and a landing stroke. Alternate the hand you land on.", "R R L L >R:2 L L R R >L:2"),
  exercise("Six Stroke Roll", "Rolls", "Lead, double, double, land. Accentuate the outside strokes.", ">R L L R R >L >L R R L L >R"),
  exercise("Seven Stroke Roll", "Rolls", "Three doubles lead into a longer landing stroke.", "R R L L R R >L:2 L L R R L L >R:2"),
  exercise("Nine Stroke Roll", "Rolls", "Four doubles lead into a longer landing stroke. Keep the spacing clean.", "R R L L R R L L >R:2 L L R R L L R R >L:2"),
  exercise("Single Paradiddle", "Paradiddles", "Alternate singles and a double: right-left-right-right, then reverse.", ">R L R R >L R L L"),
  exercise("Double Paradiddle", "Paradiddles", "Four alternating singles followed by a double on each hand.", ">R L R L R R >L R L R L L"),
  exercise("Triple Paradiddle", "Paradiddles", "Six alternating singles followed by a double. Stay loose as it speeds up.", ">R L R L R L R R >L R L R L R L L"),
  exercise("Paradiddle-diddle", "Paradiddles", "A paradiddle with one more double: right-left-right-right-left-left.", ">R L R R L L >L R L L R R"),
  exercise("Reverse Paradiddle", "Paradiddles", "Move the double to the front: right-right-left-right, then reverse.", ">R R L R >L L R L"),
  exercise("Inward Paradiddle", "Paradiddles", "Put the double in the middle: right-left-left-right, then reverse.", ">R L L R >L R R L"),
  exercise("Flam", "Flams", "A quiet grace stroke just before each main stroke. Keep the hands close.", "fR fL fR fL fR fL fR fL"),
  exercise("Flam Tap", "Flams", "A flam followed by a tap on the same hand; alternate leads.", "fR R fL L fR R fL L"),
  exercise("Flam Accent", "Flams", "A flam and two alternating taps, changing lead with each group.", "fR L R fL R L fR L R fL R L"),
  exercise("Flamacue", "Flams", "A flam, a tap, an accented middle note, and two more taps.", "fR L >R L R fL R >L R L"),
  exercise("Drag", "Drags", "Two quiet grace strokes before each main stroke. Keep them tight.", "dR dL dR dL dR dL dR dL"),
  exercise("Single Drag Tap", "Drags", "A drag followed by an alternating tap. Change leads each time.", "dR L dL R dR L dL R"),
];

export const DURATION_SECONDS = 300;
export const START_BPM = 60;
export const MAX_BPM = 120;
export const TEMPO_STEP_SECONDS = 24;
export const BREAK_SECONDS = 2;
export const COUNT_IN_BEATS = 4;
export function tempoAt(elapsedSeconds) {
  return Math.min(MAX_BPM, START_BPM + Math.floor(Math.max(0, elapsedSeconds) / TEMPO_STEP_SECONDS) * 5);
}

export function nextTempoChange(elapsedSeconds) {
  if (tempoAt(elapsedSeconds) >= MAX_BPM) return DURATION_SECONDS;
  return Math.min(DURATION_SECONDS, (Math.floor(elapsedSeconds / TEMPO_STEP_SECONDS) + 1) * TEMPO_STEP_SECONDS);
}
