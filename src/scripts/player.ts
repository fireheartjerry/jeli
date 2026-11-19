import { FILM_DURATION, filmAt } from "./film";
import type { Cosmos } from "./cosmos";

export function attachFilm(canvas: HTMLCanvasElement, cosmos: Cosmos, restore: () => void, onActive: () => void) {
  const dialog = document.querySelector<HTMLDialogElement>("[data-film]");
  const open = document.querySelector<HTMLButtonElement>("[data-play-film]");
  if (!dialog || !open) return null;

  const screen = dialog.querySelector<HTMLElement>("[data-film-screen]")!;
  const toggle = dialog.querySelector<HTMLButtonElement>("[data-film-toggle]")!;
  const seek = dialog.querySelector<HTMLInputElement>("[data-film-seek]")!;
  const sound = dialog.querySelector<HTMLButtonElement>("[data-film-sound]")!;
  const time = dialog.querySelector<HTMLOutputElement>("[data-film-time]")!;
  const location = dialog.querySelector<HTMLElement>("[data-film-location]")!;
  const home = document.createComment("cosmos");
  canvas.before(home);

  let elapsed = 0;
  let started = 0;
  let playing = false;
  let raf = 0;
  let context: AudioContext | undefined;
  let buffer: AudioBuffer | undefined;
  let loading: Promise<AudioBuffer> | undefined;
  let source: AudioBufferSourceNode | undefined;
  let volume: GainNode | undefined;
  let audible = false;
  let audioRevision = 0;

  const stamp = (seconds: number) => `0:${String(Math.floor(seconds)).padStart(2, "0")}`;
  function stopScore() {
    audioRevision++;
    if (source && volume && context) {
      const now = context.currentTime;
      volume.gain.cancelScheduledValues(now);
      volume.gain.setTargetAtTime(0, now, 0.012);
      source.stop(now + 0.05);
    }
    source = undefined;
    volume = undefined;
  }
  async function startScore() {
    stopScore();
    if (!audible || !playing || !context) return;
    const revision = audioRevision;
    const audio = context;
    try {
      await audio.resume();
      loading ??= import("./film-score").then(({ renderScore }) => renderScore());
      buffer ??= await loading;
      if (revision !== audioRevision || !audible || !playing || !dialog?.open) return;
      const now = Math.min(elapsed + (performance.now() - started) / 1000, FILM_DURATION);
      if (now >= FILM_DURATION) return;
      source = audio.createBufferSource();
      volume = audio.createGain();
      volume.gain.setValueAtTime(0, audio.currentTime);
      volume.gain.setTargetAtTime(1, audio.currentTime, 0.018);
      source.buffer = buffer;
      source.connect(volume).connect(audio.destination);
      const voice = source;
      const gain = volume;
      voice.addEventListener("ended", () => {
        voice.disconnect();
        gain.disconnect();
      }, { once: true });
      source.start(0, now);
    } catch {
      loading = undefined;
      audible = false;
      sound?.setAttribute("aria-pressed", "false");
    }
  }

  function show(value: number) {
    const frame = filmAt(value);
    cosmos.setFilm(value, true);
    seek!.valueAsNumber = value;
    const label = `${stamp(value)} / ${stamp(FILM_DURATION)}`;
    if (time!.textContent !== label) {
      time!.textContent = label;
      seek!.setAttribute("aria-valuetext", label);
    }
    if (location!.textContent !== frame.title) location!.textContent = frame.title;
  }
  function tick(now: number) {
    const value = Math.min(FILM_DURATION, elapsed + (now - started) / 1000);
    show(value);
    if (value < FILM_DURATION) raf = requestAnimationFrame(tick);
    else {
      elapsed = FILM_DURATION;
      playing = false;
      toggle!.textContent = "Replay";
      stopScore();
    }
  }
  function pause() {
    if (!playing) return;
    playing = false;
    elapsed = Math.min(FILM_DURATION, elapsed + (performance.now() - started) / 1000);
    cancelAnimationFrame(raf);
    stopScore();
    toggle!.textContent = elapsed >= FILM_DURATION ? "Replay" : "Play";
  }
  function play() {
    if (elapsed >= FILM_DURATION) elapsed = 0;
    playing = true;
    started = performance.now();
    toggle!.textContent = "Pause";
    show(elapsed);
    raf = requestAnimationFrame(tick);
    void startScore();
  }

  open.addEventListener("click", () => {
    if (dialog.open) return;
    elapsed = 0;
    dialog.showModal();
    // The modal uses the same live canvas and GL context as the page.
    screen.append(canvas);
    cosmos.setFilm(0, true);
    cosmos.refit();
    onActive();
    play();
  });
  dialog.addEventListener("close", () => {
    pause();
    home.after(canvas);
    restore();
    cosmos.refit();
    onActive();
    open.focus({ preventScroll: true });
  });
  toggle.addEventListener("click", () => playing ? pause() : play());
  seek.addEventListener("input", () => {
    elapsed = seek.valueAsNumber;
    started = performance.now();
    show(elapsed);
    if (playing) void startScore();
    else toggle.textContent = elapsed >= FILM_DURATION ? "Replay" : "Play";
  });
  sound.addEventListener("click", () => {
    audible = !audible;
    if (audible) {
      try {
        context ??= new AudioContext();
        // Resume from the button gesture, even when the picture is paused.
        void context.resume().catch(() => {
          audible = false;
          sound.setAttribute("aria-pressed", "false");
        });
        if (playing) void startScore();
      } catch {
        audible = false;
      }
    } else stopScore();
    sound.setAttribute("aria-pressed", String(audible));
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && dialog.open) pause();
  });

  return dialog;
}
