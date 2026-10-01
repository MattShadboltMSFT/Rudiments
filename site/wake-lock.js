export function createWakeLock(browser, page, onStatus) {
  let active = false;
  let sentinel = null;
  let generation = 0;
  let releaseRetries = 0;

  function message() {
    return !page.defaultView?.isSecureContext
      ? "Keep-awake requires HTTPS (or localhost). The screen may sleep during practice."
      : "Screen wake lock is unavailable. Set Auto-Lock to Never while practicing.";
  }

  async function acquire() {
    if (!active || page.visibilityState !== "visible" || sentinel) return;
    const request = ++generation;
    if (!browser.wakeLock?.request) {
      onStatus(message());
      return;
    }
    try {
      const lock = await browser.wakeLock.request("screen");
      if (!active || request !== generation) {
        await lock.release();
        return;
      }
      sentinel = lock;
      onStatus("");
      lock.addEventListener("release", () => {
        if (sentinel !== lock) return;
        sentinel = null;
        if (active && page.visibilityState === "visible") {
          if (releaseRetries++ === 0) {
            void acquire();
          } else {
            onStatus("Screen wake lock was released by your device. The screen may sleep; check Low Power Mode.");
          }
        }
      });
    } catch (error) {
      if (active && request === generation) {
        onStatus(`Could not keep the screen awake (${error.message}). Check Low Power Mode or Auto-Lock.`);
      }
    }
  }

  return {
    start() {
      active = true;
      releaseRetries = 0;
      void acquire();
    },
    stop() {
      active = false;
      generation++;
      const lock = sentinel;
      sentinel = null;
      onStatus("");
      if (lock) void lock.release().catch((error) => onStatus(`Could not release screen wake lock: ${error.message}`));
    },
    resume() {
      if (active) {
        releaseRetries = 0;
        void acquire();
      }
    },
  };
}
