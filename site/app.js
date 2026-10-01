import { BREAK_SECONDS, COUNT_IN_BEATS, DURATION_SECONDS, EXERCISES, nextTempoChange, tempoAt } from "./exercises.js";
import { renderNotation } from "./notation.js";
import { createWakeLock } from "./wake-lock.js";
import { initialSession, MAX_SESSION_MINUTES, nextExercisePosition, restoreSession, timedPlan } from "./session.js";
import { createOnsetDetector, StrokeScore } from "./scoring.js";

const $ = (id) => document.getElementById(id);
const list = $("exercise-list");
const pattern = $("pattern");
const playButton = $("play-button");
const completion = $("completion");
const isIPhone = /iPhone|iPod/.test(navigator.userAgent);
const wakeLock = createWakeLock(navigator, document, (message) => {
  $("wake-status").textContent = message;
  $("wake-status").hidden = !message;
});
let noteElements = [];
const storageKey = "rudiments-practice-session";
let session = initialSession();
try {
  const saved = localStorage.getItem(storageKey);
  if (saved) session = restoreSession(saved);
} catch (error) {
  console.warn("Could not restore practice session:", error);
  showError(`Saved practice progress could not be restored: ${error.message}`);
}
const state = {
  selected: session.selected, running: false, elapsedBeforePause: session.elapsed, startedAt: 0,
  phase: session.phase, phaseElapsed: session.phaseElapsed, phaseStartedAt: 0,
  nextNoteTime: 0, nextIndex: 0, unitCount: 0, pending: [],
  activeIndex: -1, audio: null, master: null, noise: null, scheduler: null, frame: null,
  starting: false, generation: 0,
  nextCountBeat: 0, nextCountTime: 0,
  micWanted: false, micStream: null, micSource: null, micAnalyser: null, micOutput: null, micOpening: null,
  micRequest: 0, score: new StrokeScore(session.scores?.[session.selected]?.hits, session.scores?.[session.selected]?.total),
  detector: createOnsetDetector(), micSamples: new Float32Array(512), detectedHits: 0, micListeningAt: 0,
  beatEvents: [], activeBeat: 0,
};
let savedSecond = -1;

function renderAccuracy() {
  const { hits, total, percentage } = state.score;
  const box = $("accuracy");
  box.textContent = state.micWanted || total
    ? `Timing accuracy: ${percentage === null ? "—" : `${percentage}%`} · ${hits} / ${total} matched strokes`
    : "Timing accuracy: —";
  const help = document.createElement("small");
  help.textContent = state.micWanted
    ? "Timing estimate only · guide strokes muted; metronome stays audible. Use headphones."
    : "Enable mic to score your strokes.";
  box.append(help);
  $("mic-button").textContent = state.micWanted ? "DISABLE MIC" : "ENABLE MIC";
  $("mic-button").setAttribute("aria-pressed", String(state.micWanted));
  $("mic-routing-warning").hidden = !isIPhone || !state.micWanted;
  $("visual-beat").hidden = !state.running && !state.micWanted;
}

function micStatus(message) {
  $("mic-status").textContent = message;
}

function setAudioSessionType(type) {
  if (navigator.audioSession) navigator.audioSession.type = type;
}

function closeMicrophone() {
  state.micRequest++;
  state.micOpening = null;
  state.score.discardPending(state.audio?.currentTime ?? 0);
  if (state.micStream) {
    for (const track of state.micStream.getTracks()) track.stop();
  }
  state.micSource?.disconnect();
  state.micAnalyser?.disconnect();
  state.micOutput?.disconnect();
  state.micStream = null;
  state.micSource = null;
  state.micAnalyser = null;
  state.micOutput = null;
  state.detector.reset();
  setAudioSessionType("playback");
  if (state.micWanted) micStatus("Ready · mic resumes when practice starts");
  renderAccuracy();
}

function openMicrophone() {
  if (state.micStream) return Promise.resolve();
  if (state.micOpening) return state.micOpening;
  const opening = acquireMicrophone();
  state.micOpening = opening;
  const clearOpening = () => {
    if (state.micOpening === opening) state.micOpening = null;
  };
  void opening.then(clearOpening, clearOpening);
  return opening;
}

async function acquireMicrophone() {
  const request = ++state.micRequest;
  if (!navigator.mediaDevices?.getUserMedia) {
    state.micWanted = false;
    micStatus("Microphone requires HTTPS and a supported browser.");
    showError("Microphone scoring requires HTTPS and a supported browser.");
    renderAccuracy();
    return;
  }
  micStatus("Requesting microphone permission…");
  let stream;
  try {
    ensureAudio();
    setAudioSessionType("play-and-record");
    const resumed = state.audio.resume();
    const capture = navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      video: false,
    });
    const [audioResult, mediaResult] = await Promise.allSettled([resumed, capture]);
    if (mediaResult.status === "fulfilled") stream = mediaResult.value;
    if (audioResult.status === "rejected") throw audioResult.reason;
    if (mediaResult.status === "rejected") throw mediaResult.reason;
    if (state.audio.state !== "running") throw new Error(`Audio context is ${state.audio.state}. Tap Enable mic again.`);
    if (request !== state.micRequest || !state.micWanted || document.hidden) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    const source = state.audio.createMediaStreamSource(stream);
    const filter = state.audio.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 130;
    const lowpass = state.audio.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 700;
    const analyser = state.audio.createAnalyser();
    analyser.fftSize = 1024;
    const output = state.audio.createGain();
    output.gain.value = 0;
    source.connect(filter).connect(lowpass).connect(analyser).connect(output).connect(state.audio.destination);
    state.micStream = stream;
    state.micSource = source;
    state.micAnalyser = analyser;
    state.micOutput = output;
    state.detector.reset();
    state.detectedHits = 0;
    state.micListeningAt = performance.now();
    stream.getAudioTracks()[0].addEventListener("ended", () => {
      if (state.micStream === stream) {
        closeMicrophone();
        state.micWanted = false;
        micStatus("Microphone disconnected. Enable it again to resume scoring.");
        renderAccuracy();
      }
    });
    micStatus(state.running ? "Listening · 0 hits detected · use headphones" : "Mic ready · start practice to score strokes");
    $("feedback").hidden = true;
    renderAccuracy();
  } catch (error) {
    stream?.getTracks().forEach((track) => track.stop());
    if (request !== state.micRequest) return;
    closeMicrophone();
    state.micWanted = false;
    micStatus(`Microphone unavailable: ${error.message}`);
    showError(`Microphone unavailable: ${error.message}`);
    renderAccuracy();
  }
}

function saveSession() {
  session.selected = state.selected;
  session.elapsed = Math.min(DURATION_SECONDS, elapsed());
  session.phase = state.phase;
  session.phaseElapsed = state.phase === "playing" ? 0 : Math.max(0, Math.min(phaseElapsed(), state.phase === "break" ? BREAK_SECONDS : COUNT_IN_BEATS * 60 / tempoAt(state.elapsedBeforePause)));
  session.scores[state.selected] = { hits: state.score.hits, total: state.score.total };
  try {
    localStorage.setItem(storageKey, JSON.stringify(session));
  } catch (error) {
    showError(`Practice progress could not be saved: ${error.message}`);
  }
}

function renderSession() {
  const timed = session.mode === "timed";
  const done = session.completed.length;
  $("session-title").textContent = timed ? `${session.queue.length * 5}-minute program` : "Free practice";
  $("session-summary").textContent = timed
    ? `${done} of ${session.queue.length} exercises completed · ${done * 5} of ${session.queue.length * 5} minutes earned. Skipping does not tick an exercise.`
    : `${done} of ${EXERCISES.length} exercises completed · ${done * 5} minutes practiced.`;
  $("free-practice").hidden = !timed;
  $("session-exercises").replaceChildren(...(timed ? session.queue : EXERCISES.map((_, index) => index)).map((index, slot) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "session-item";
    const checked = session.completed.includes(index);
    button.classList.toggle("checked", checked);
    button.classList.toggle("current", timed ? slot === session.position : index === state.selected);
    button.setAttribute("aria-label", `${EXERCISES[index].name}, ${checked ? "completed" : "not completed"}`);
    if (timed && slot === session.position || !timed && index === state.selected) button.setAttribute("aria-current", "step");
    const mark = document.createElement("span");
    mark.className = "session-check";
    mark.textContent = checked ? "✓" : String(slot + 1).padStart(2, "0");
    const name = document.createElement("span");
    name.textContent = EXERCISES[index].name;
    button.append(mark, name);
    const result = session.scores[index];
    if (result?.total) {
      const accuracy = document.createElement("small");
      accuracy.textContent = `${Math.round(result.hits / result.total * 100)}%`;
      button.append(accuracy);
    }
    button.addEventListener("click", () => selectExercise(index, slot));
    return button;
  }));
  const hasNext = nextExercisePosition(session) !== -1;
  $("next-exercise").hidden = !hasNext;
  $("next-button").textContent = hasNext ? "NEXT RUDIMENT ↗" : "VIEW SESSION";
}

function advance() {
  completion.hidden = true;
  if (session.mode === "timed") {
    const position = nextExercisePosition(session);
    if (position === -1) {
      renderSession();
      $("session-exercises").scrollIntoView({ block: "nearest" });
      return;
    }
    selectExercise(session.queue[position], position);
  } else {
    selectExercise((state.selected + 1) % EXERCISES.length);
  }
}

function elapsed() {
  return state.elapsedBeforePause + (state.running && state.phase === "playing" ? (performance.now() - state.startedAt) / 1000 : 0);
}

function phaseElapsed() {
  return state.phaseElapsed + (state.running && state.phase !== "playing" ? (performance.now() - state.phaseStartedAt) / 1000 : 0);
}

function setPhase(phase) {
  state.phase = phase;
  state.phaseElapsed = 0;
  state.phaseStartedAt = performance.now();
  state.pending = [];
  state.beatEvents = [];
  showBeat(0);
  setActive(-1);
  if (phase === "count-in") {
    state.nextCountBeat = 0;
    state.nextCountTime = state.audio.currentTime + .12;
    state.phaseStartedAt += 120;
  }
  state.score.discardPending(state.audio.currentTime);
  state.detector.reset();
  renderAccuracy();
}

function showError(message) {
  $("feedback").textContent = message;
  $("feedback").hidden = false;
}

function setActive(index) {
  if (state.activeIndex === index) return;
  noteElements[state.activeIndex]?.classList.remove("active");
  const note = noteElements[index];
  note?.classList.add("active");
  state.activeIndex = index;
  if (note) {
    const item = note.getBoundingClientRect();
    const viewport = pattern.getBoundingClientRect();
    if (item.left < viewport.left || item.right > viewport.right) {
      pattern.scrollTo({ left: pattern.scrollLeft + item.left - viewport.left - 20, behavior: "smooth" });
    }
  }
}

function displayTime(seconds) {
  const remaining = Math.ceil(Math.max(0, DURATION_SECONDS - seconds));
  return `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
}

function renderStatus() {
  const seconds = Math.min(DURATION_SECONDS, elapsed());
  $("time-remaining").textContent = displayTime(seconds);
  const targetBpm = tempoAt(seconds);
  $("tempo-value").textContent = state.phase === "break" ? tempoAt(Math.max(0, seconds - .001)) : targetBpm;
  const phaseStatus = $("phase-status");
  let phaseMessage = "";
  if (state.phase === "break") {
    phaseMessage = `REST · ${Math.ceil(Math.max(0, BREAK_SECONDS - phaseElapsed()))}s · NEXT ${targetBpm} BPM`;
  } else if (state.phase === "count-in") {
    const beat = Math.min(COUNT_IN_BEATS, Math.max(1, Math.floor(Math.max(0, phaseElapsed()) * targetBpm / 60) + 1));
    phaseMessage = `COUNT IN · ${beat} / ${COUNT_IN_BEATS} · ${targetBpm} BPM`;
  }
  if (phaseStatus.textContent !== phaseMessage) phaseStatus.textContent = phaseMessage;
  phaseStatus.hidden = state.phase === "playing";
  $("progress-fill").style.width = `${seconds / DURATION_SECONDS * 100}%`;
  $("progress").setAttribute("aria-valuenow", String(Math.floor(seconds)));
  $("play-label").textContent = state.running ? "PAUSE PRACTICE" : state.elapsedBeforePause ? "RESUME PRACTICE" : "START PRACTICE";
  playButton.querySelector(".play-icon").textContent = state.running ? "Ⅱ" : "▶";
  $("visual-beat").hidden = !state.running && !state.micWanted;
  if (state.audio) {
    while (state.beatEvents.length && state.beatEvents[0].time <= state.audio.currentTime) {
      showBeat(state.beatEvents.shift().beat);
    }
  }
  if (state.micStream && state.running && state.phase === "playing") {
    const previousTotal = state.score.total;
    const previousHits = state.score.hits;
    state.micAnalyser.getFloatTimeDomainData(state.micSamples);
    if (state.detector.sample(state.micSamples, state.audio.currentTime)) {
      state.detectedHits++;
      micStatus(`Listening · ${state.detectedHits} hits detected · use headphones`);
      state.score.hit(state.audio.currentTime);
    } else if (!state.detectedHits && performance.now() - state.micListeningAt > 5000 &&
               !$("mic-status").textContent.startsWith("No hits detected")) {
      micStatus("No hits detected · move the phone closer to your drum");
    }
    state.score.flush(state.audio.currentTime);
    if (previousTotal !== state.score.total || previousHits !== state.score.hits) renderAccuracy();
  }
  const saveTick = Math.floor(performance.now() / 1000);
  if (state.running && saveTick !== savedSecond) {
    savedSecond = saveTick;
    saveSession();
  }
}

function renderExercise() {
  const exercise = EXERCISES[state.selected];
  $("exercise-name").textContent = exercise.name;
  $("exercise-category").textContent = `${String(state.selected + 1).padStart(2, "0")} / ${exercise.category.toUpperCase()}`;
  $("exercise-description").textContent = exercise.description;
  pattern.replaceChildren(renderNotation(exercise.pattern));
  pattern.scrollLeft = 0;
  noteElements = [...pattern.querySelectorAll(".notation-note")];
  state.activeIndex = -1;
  [...list.querySelectorAll("button")].forEach((button, index) => {
    button.classList.toggle("active", index === state.selected);
    button.classList.toggle("completed", session.completed.includes(index));
    button.querySelector(".exercise-number").textContent = session.completed.includes(index) ? "✓" : String(index + 1).padStart(2, "0");
    button.disabled = session.mode === "timed" && !session.queue.includes(index);
    if (index === state.selected) button.setAttribute("aria-current", "true");
    else button.removeAttribute("aria-current");
  });
  $("cycle-label").textContent = `${exercise.pattern.length} STROKES · REPEAT ↗`;
  renderSession();
  renderStatus();
  renderAccuracy();
}

function stop() {
  if (state.running) {
    if (state.phase === "playing") {
      const boundary = nextTempoChange(state.elapsedBeforePause);
      const played = elapsed();
      if (played >= boundary && boundary < DURATION_SECONDS) {
        state.elapsedBeforePause = boundary;
        state.phase = "break";
        state.phaseElapsed = 0;
      } else {
        state.elapsedBeforePause = played;
      }
    } else {
      state.phaseElapsed = Math.max(0, Math.min(phaseElapsed(), state.phase === "break" ? BREAK_SECONDS : COUNT_IN_BEATS * 60 / tempoAt(state.elapsedBeforePause)));
    }
  }
  state.generation++;
  state.running = false;
  state.starting = false;
  wakeLock.stop();
  clearInterval(state.scheduler);
  cancelAnimationFrame(state.frame);
  state.pending = [];
  state.beatEvents = [];
  showBeat(0);
  if (state.master) state.master.gain.setValueAtTime(0, state.audio.currentTime);
  closeMicrophone();
  setActive(-1);
  renderStatus();
  saveSession();
}

function selectExercise(index, position = session.queue.indexOf(index)) {
  if (session.mode === "timed" && position < 0) return;
  stop();
  state.selected = index;
  if (session.mode === "timed") session.position = position;
  state.elapsedBeforePause = 0;
  state.phase = "playing";
  state.phaseElapsed = 0;
  state.nextIndex = 0;
  state.unitCount = 0;
  state.score = new StrokeScore();
  session.scores[index] = { hits: 0, total: 0 };
  completion.hidden = true;
  renderExercise();
  saveSession();
}

function finish() {
  stop();
  state.elapsedBeforePause = DURATION_SECONDS;
  if (!session.completed.includes(state.selected)) session.completed.push(state.selected);
  renderExercise();
  saveSession();
  const final = session.mode === "timed" && session.completed.length === session.queue.length;
  $("completion-title").textContent = final ? "Program complete." : "Five minutes well spent.";
  $("completion-message").textContent = final
    ? `You've finished your ${session.queue.length * 5}-minute program. ${session.completed.length} exercises completed.`
    : `${EXERCISES[state.selected].name} is in the books. Ready for another five minutes?`;
  if (state.score.total) {
    $("completion-message").textContent += ` Timing accuracy: ${state.score.percentage}% (${state.score.hits}/${state.score.total} matched strokes).`;
  }
  completion.hidden = false;
  $("next-button").focus();
}

function ensureAudio() {
  if (state.audio) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error("Your browser does not support Web Audio.");
  setAudioSessionType(state.micWanted ? "play-and-record" : "playback");
  state.audio = new AudioContextClass();
  state.audio.addEventListener("statechange", () => {
    if (state.running && state.audio.state !== "running") {
      stop();
      showError("Audio was interrupted. Tap Resume practice to restart audio and microphone.");
    }
  });
  state.master = state.audio.createGain();
  state.master.connect(state.audio.destination);
  const noise = state.audio.createBuffer(1, Math.floor(state.audio.sampleRate * .12), state.audio.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  state.noise = noise;
}

function drum(time, level) {
  const audio = state.audio;
  const source = audio.createBufferSource();
  const filter = audio.createBiquadFilter();
  const gain = audio.createGain();
  source.buffer = state.noise;
  filter.type = "bandpass";
  filter.frequency.value = 1800;
  filter.Q.value = .65;
  gain.gain.setValueAtTime(level, time);
  gain.gain.exponentialRampToValueAtTime(.001, time + .075);
  source.connect(filter).connect(gain).connect(state.master);
  source.start(time);
  source.stop(time + .08);
}

function showBeat(beat) {
  if (state.activeBeat === beat) return;
  state.activeBeat = beat;
  $("beat-number").textContent = beat || "—";
  [...$("beat-pips").children].forEach((pip, index) => pip.classList.toggle("on", index === beat - 1));
}

function click(time, beat) {
  const audio = state.audio;
  const tone = audio.createOscillator();
  const gain = audio.createGain();
  tone.type = "sine";
  tone.frequency.value = 1600;
  gain.gain.setValueAtTime(.12, time);
  gain.gain.exponentialRampToValueAtTime(.001, time + .035);
  tone.connect(gain).connect(state.master);
  tone.start(time);
  tone.stop(time + .04);
  state.beatEvents.push({ time, beat });
}

function scheduleCountIn(now) {
  const beatSeconds = 60 / tempoAt(state.elapsedBeforePause);
  while (state.nextCountBeat < COUNT_IN_BEATS && state.nextCountTime < now + .12) {
    click(state.nextCountTime, state.nextCountBeat + 1);
    state.nextCountBeat++;
    state.nextCountTime += beatSeconds;
  }
}

function schedule() {
  if (!state.running) return;
  const now = state.audio.currentTime;
  if (state.phase === "break") {
    if (phaseElapsed() >= BREAK_SECONDS) setPhase("count-in");
    else return;
  }
  if (state.phase === "count-in") {
    scheduleCountIn(now);
    if (phaseElapsed() >= COUNT_IN_BEATS * 60 / tempoAt(state.elapsedBeforePause)) {
      setPhase("playing");
      state.startedAt = performance.now();
      state.nextNoteTime = state.nextCountTime;
      state.nextIndex = 0;
      state.unitCount = 0;
    } else return;
  }
  if (elapsed() >= DURATION_SECONDS) { finish(); return; }
  const boundary = nextTempoChange(state.elapsedBeforePause);
  if (elapsed() >= boundary && boundary < DURATION_SECONDS) {
    state.elapsedBeforePause = boundary;
    setPhase("break");
    return;
  }
  if (state.nextNoteTime < now - .1) {
    state.nextNoteTime = now + .1;
    state.pending = [];
  }
  const notes = EXERCISES[state.selected].pattern;
  while (state.nextNoteTime < now + .12) {
    const time = state.nextNoteTime;
    const projected = Math.max(state.elapsedBeforePause, elapsed() + time - now);
    if (projected >= boundary) break;
    const note = notes[state.nextIndex];
    const unitLength = 60 / tempoAt(projected) / 4;
    if (note.grace) {
      const count = note.grace === "d" ? 2 : 1;
      for (let i = count; i > 0; i--) drum(time - i * .025, .085);
    }
    if (!state.micStream) drum(time, note.accent ? .48 : .29);
    if (state.micStream) state.score.expect(time, tempoAt(projected));
    if ($("metronome").checked) {
      for (let i = 0; i < note.units; i++) {
        if ((state.unitCount + i) % 4 === 0) click(time + i * unitLength, Math.floor((state.unitCount + i) / 4) % 4 + 1);
      }
    }
    state.pending.push({ time, index: state.nextIndex });
    state.nextNoteTime += note.units * unitLength;
    state.unitCount += note.units;
    state.nextIndex = (state.nextIndex + 1) % notes.length;
  }
}

function animate() {
  if (!state.running) return;
  while (state.phase === "playing" && state.pending.length && state.pending[0].time <= state.audio.currentTime) {
    setActive(state.pending.shift().index);
  }
  renderStatus();
  state.frame = requestAnimationFrame(animate);
}

async function togglePractice() {
  if (state.starting) return;
  if (state.running) {
    stop();
    return;
  }
  const generation = state.generation;
  state.starting = true;
  wakeLock.start();
  $("feedback").hidden = true;
  try {
    ensureAudio();
    setAudioSessionType(state.micWanted ? "play-and-record" : "playback");
    if (state.micWanted && !state.micStream) await openMicrophone();
    else await state.audio.resume();
    if (state.audio.state !== "running") throw new Error(`Audio context is ${state.audio.state}. Tap Start practice again.`);
  } catch (error) {
    if (generation !== state.generation) return;
    wakeLock.stop();
    showError(`Audio could not start: ${error.message}`);
    state.starting = false;
    return;
  }
  if (generation !== state.generation) return;
  state.starting = false;
  if (state.elapsedBeforePause >= DURATION_SECONDS) state.elapsedBeforePause = 0;
  state.master.gain.setValueAtTime(Number($("volume").value) / 100, state.audio.currentTime);
  state.startedAt = performance.now();
  state.running = true;
  state.pending = [];
  if (state.micStream) {
    state.micListeningAt = performance.now();
    micStatus("Listening · 0 hits detected · use headphones");
  }
  if (state.phase === "count-in") setPhase("count-in");
  else if (state.phase === "break") state.phaseStartedAt = performance.now();
  state.nextNoteTime = state.audio.currentTime + .12;
  schedule();
  state.scheduler = setInterval(schedule, 25);
  state.frame = requestAnimationFrame(animate);
  renderStatus();
}

let lastCategory = "";
for (let minutes = 5; minutes <= MAX_SESSION_MINUTES; minutes += 5) {
  const option = document.createElement("option");
  option.value = String(minutes);
  option.textContent = `${minutes} min`;
  option.selected = minutes === 20;
  $("target-minutes").append(option);
}
EXERCISES.forEach((exercise, index) => {
  if (exercise.category !== lastCategory) {
    const heading = document.createElement("div");
    heading.className = "library-group";
    heading.textContent = exercise.category;
    list.append(heading);
    lastCategory = exercise.category;
  }
  const button = document.createElement("button");
  button.className = "exercise-button";
  button.type = "button";
  button.innerHTML = `<span class="exercise-number">${String(index + 1).padStart(2, "0")}</span><span></span>`;
  button.lastElementChild.textContent = exercise.name;
  button.addEventListener("click", () => selectExercise(index));
  list.append(button);
});

playButton.addEventListener("click", togglePractice);
$("mic-button").addEventListener("click", () => {
  state.micWanted = !state.micWanted;
  if (state.micWanted) void openMicrophone();
  else {
    closeMicrophone();
    micStatus("Off · timing only, not hand detection");
  }
  renderAccuracy();
});
$("next-button").addEventListener("click", advance);
$("next-exercise").addEventListener("click", advance);
$("repeat-button").addEventListener("click", () => selectExercise(state.selected));
$("create-plan").addEventListener("click", () => {
  try {
    const queue = timedPlan(Number($("target-minutes").value));
    stop();
    session = { ...initialSession(), mode: "timed", queue, selected: queue[0] };
    selectExercise(queue[0], 0);
  } catch (error) {
    showError(`Could not create timed session: ${error.message}`);
  }
});
$("free-practice").addEventListener("click", () => {
  stop();
  session = initialSession();
  selectExercise(0);
});
$("volume").addEventListener("input", (event) => {
  const value = Number(event.target.value);
  $("volume-value").textContent = `${value}%`;
  if (state.master) state.master.gain.setValueAtTime(state.running ? value / 100 : 0, state.audio.currentTime);
});
document.addEventListener("keydown", (event) => {
  if (event.code === "Space" && !event.repeat && !["BUTTON", "INPUT", "A"].includes(document.activeElement.tagName) && completion.hidden) {
    event.preventDefault();
    togglePractice();
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && state.running) {
    stop();
  } else if (document.hidden && state.starting) {
    state.generation++;
    state.starting = false;
    wakeLock.stop();
    closeMicrophone();
  } else if (document.hidden && (state.micStream || state.micWanted)) {
    closeMicrophone();
  } else if (!document.hidden) {
    wakeLock.resume();
  }
});
renderExercise();
