# Rudiments

A small, static drum-practice app with 20 rudiments, a synchronized snare-drum
notation staff with R/L sticking above the notes, synthesized drum and
metronome sounds, and five-minute sessions that climb from 60 to 120 BPM.
No account, microphone, or dependency install is required for guided practice.
Microphone timing feedback is optional.

## Practice locally

Requires Node.js 18 or newer:

```powershell
cd C:\Dev\Rudiments
npm start
```

Open http://127.0.0.1:4173 and press **Start practice**. The first click
enables audio in your browser. Choose a rudiment from the library; pause with
the button or Space (when no control has focus). Leaving the tab pauses the
session. Use headphones for the cleanest click. Run `npm test` for the exercise
and tempo checks. On iPhone, turn up **media volume**; if sound is still
silent, check the silent switch. Safari's audio-session support varies across
iOS versions, and the app reports if the audio context is interrupted.

The tempo rises every 24 seconds of **playing time**. Before each increase,
the strokes stop for a two-second rest, then four audible beats count you in
at the new tempo. The countdown is shown on screen, and the five-minute
practice timer holds during rests and count-ins. Pausing during a count-in
restarts that count-in on resume. Session targets count playing time, so
elapsed wall-clock time is longer.

## Microphone timing feedback

Tap **Enable mic** and grant microphone permission to estimate the percentage
of strokes that land near the notation's expected times. You can switch it on
before or during practice. The display shows matched/attempted strokes and a
percentage; each exercise's result appears in the session queue and at
completion. Skipped strokes count as misses only while the mic is listening.
The timing estimate cannot identify which hand you use, grade accents or
grace strokes individually, or guarantee detection with every drum/room setup.
Place the iPhone near the drum and use headphones: while listening, the
synthesized guide strokes are muted to prevent the app from scoring its own
sound, but the metronome and four-beat count-in remain audible. The mic status
shows detected hits so you can check that the phone is hearing your drum.
Without headphones, the phone may hear its own metronome and skew the result.
Quiet ghost notes may not be detected. Audio is processed on your device and
is not recorded or uploaded; only hit counts are stored in this browser.
The microphone stops when you pause, finish or leave the tab, and resumes
when you restart practice. Permission needs HTTPS or localhost.

Free practice lets you choose any of the 20 rudiments and move to the next
one whenever you like. Exercises receive a tick only after the full five
minutes. Use **Create timed session** to pick a time target; a 20-minute
session randomly selects four distinct five-minute exercises. The queue
shows completed exercises, and **Next exercise** skips ahead without giving
credit for unfinished work. Your current plan, ticks, and paused exercise
time are saved in this browser and restored after a reload. Starting a new
timed or free session clears the previous session's ticks.

On iPhone, rotate to landscape for a compact practice view; scroll down for
the exercise queue and session controls. While a session
is running, the app requests a screen wake lock so the display stays on.
This requires iOS Safari 16.4+ and HTTPS (or localhost); GitHub Pages provides
HTTPS. A device may still deny or revoke the lock, for example in Low Power
Mode. The app shows a warning when it cannot hold the lock. If that happens,
disable Low Power Mode or temporarily change **Settings → Display & Brightness
→ Auto-Lock** before practicing. Pausing or leaving the tab ends the wake lock.

## Publish to GitHub Pages

Create a GitHub repository for this project and push its `main` branch.
Under **Settings → Pages → Build and deployment**, set **Source** to
**GitHub Actions**. The workflow at `.github/workflows/pages.yml` then
publishes the `site` directory on each push to `main`. Assets use relative
URLs, so both a project site (`https://USER.github.io/Rudiments/`) and a
user site (`https://USER.github.io/`) work. Your repository URL determines
the exact public address.
