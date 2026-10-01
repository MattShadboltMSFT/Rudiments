const SVG_NS = "http://www.w3.org/2000/svg";
const STEP = 42;
const NOTE_Y = 100;
const STEM_Y = 54;

function svg(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, String(value));
  }
  return element;
}

function line(x1, y1, x2, y2, className, width = 1) {
  return svg("line", {
    x1, y1, x2, y2, class: className, "stroke-width": width,
  });
}

function text(x, y, value, className) {
  const element = svg("text", { x, y, class: className, "text-anchor": "middle" });
  element.textContent = value;
  return element;
}

export function notationLayout(pattern) {
  let units = 0;
  const notes = pattern.map((note) => {
    const entry = { x: 52 + units * STEP, beat: Math.floor(units / 4), ...note };
    units += note.units;
    return entry;
  });
  return { notes, units, width: 52 + units * STEP + 44 };
}

function beams(group, container) {
  if (group.length === 1) {
    const note = group[0];
    const x = note.x + 8;
    container.append(line(x, STEM_Y, x + 13, STEM_Y + 10, "notation-ink", 3));
    if (note.units === 1) {
      container.append(line(x, STEM_Y + 7, x + 12, STEM_Y + 17, "notation-ink", 3));
    }
    return;
  }
  const start = group[0].x + 8;
  const end = group.at(-1).x + 8;
  container.append(line(start, STEM_Y, end, STEM_Y, "notation-ink", 5));
  for (let index = 0; index < group.length; index++) {
    if (group[index].units !== 1) continue;
    const x = group[index].x + 8;
    if (group[index + 1]?.units === 1) {
      container.append(line(x, STEM_Y + 9, group[index + 1].x + 8, STEM_Y + 9, "notation-ink", 5));
    } else if (group[index - 1]?.units !== 1) {
      const direction = index === group.length - 1 ? -1 : 1;
      container.append(line(x, STEM_Y + 9, x + direction * 14, STEM_Y + 9, "notation-ink", 5));
    }
  }
}

export function renderNotation(pattern) {
  const { notes, units, width } = notationLayout(pattern);
  const score = svg("svg", {
    viewBox: `0 0 ${width} 150`, width, height: 150,
    role: "img", "aria-label": "Snare drum notation with right and left hand sticking above each note",
  });
  for (const y of [80, 90, 100, 110, 120]) {
    score.append(line(18, y, width - 18, y, "staff-line"));
  }
  score.append(line(18, 80, 18, 120, "staff-line"));
  for (let bar = 16; bar < units; bar += 16) {
    score.append(line(52 + bar * STEP - 18, 80, 52 + bar * STEP - 18, 120, "staff-line"));
  }
  score.append(line(width - 26, 80, width - 26, 120, "staff-line"));
  score.append(line(width - 19, 80, width - 19, 120, "staff-line", 3));
  score.append(svg("circle", { cx: width - 36, cy: 94, r: 2, class: "notation-ink" }));
  score.append(svg("circle", { cx: width - 36, cy: 106, r: 2, class: "notation-ink" }));

  for (const note of notes) {
    const element = svg("g", { class: "notation-note" });
    const hand = note.hand === "R" ? "Right" : "Left";
    const grace = note.grace === "f" ? "flam" : note.grace === "d" ? "drag" : "";
    const description = `${hand} hand${grace ? `, ${grace}` : ""}${note.accent ? ", accented" : ""}, ${note.units === 2 ? "eighth" : "sixteenth"} note`;
    element.append(svg("title"));
    element.firstChild.textContent = description;
    element.append(svg("rect", { x: note.x - 19, y: 12, width: note.units * STEP - 3, height: 123, rx: 7, class: "note-highlight" }));
    element.append(text(note.x, 30, note.hand, "sticking"));
    if (note.accent) element.append(text(note.x, 73, ">", "accent"));
    if (grace) {
      const count = grace === "drag" ? 2 : 1;
      for (let i = count; i > 0; i--) {
        const gx = note.x - 10 - i * 10;
        element.append(svg("ellipse", { cx: gx, cy: NOTE_Y, rx: 4, ry: 3, transform: `rotate(-20 ${gx} ${NOTE_Y})`, class: "notation-ink" }));
        element.append(line(gx + 3, NOTE_Y - 1, gx + 3, 79, "notation-ink", 1.5));
        element.append(line(gx - 1, 90, gx + 8, 84, "notation-ink", 1.5));
      }
    }
    element.append(svg("ellipse", { cx: note.x, cy: NOTE_Y, rx: 8, ry: 5, transform: `rotate(-20 ${note.x} ${NOTE_Y})`, class: "notation-ink" }));
    element.append(line(note.x + 8, NOTE_Y - 1, note.x + 8, STEM_Y, "notation-ink", 2));
    score.append(element);
  }
  let group = [];
  for (const note of notes) {
    if (group.length && group[0].beat !== note.beat) {
      beams(group, score);
      group = [];
    }
    group.push(note);
  }
  if (group.length) beams(group, score);
  return score;
}
