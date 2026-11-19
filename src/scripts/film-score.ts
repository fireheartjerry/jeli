import { FILM_DURATION } from "./film";

/** Original score. The buffer is rendered once so seeking uses the exact same cue timing. */
export async function renderScore() {
  const sampleRate = 24000;
  const audio = new OfflineAudioContext(2, sampleRate * FILM_DURATION, sampleRate);
  const bus = audio.createGain();
  bus.gain.value = 2.3;
  bus.connect(audio.destination);

  function tone(at: number, duration: number, hz: number, destination: number, level: number, shape: OscillatorType, pan = 0, breath = 0.35) {
    const voice = audio.createOscillator();
    const envelope = audio.createGain();
    const stereo = audio.createStereoPanner();
    stereo.pan.value = pan;
    voice.type = shape;
    voice.frequency.setValueAtTime(hz, at);
    voice.frequency.exponentialRampToValueAtTime(destination, at + duration);
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(level, at + duration * breath);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    voice.connect(envelope).connect(stereo).connect(bus);
    voice.start(at);
    voice.stop(at + duration);
  }

  // A room tone first, then the tug's low mechanical pulse.
  tone(0, 5.8, 49, 46.25, 0.18, "sine");
  tone(1.7, 4.3, 138.6, 92.5, 0.025, "triangle", -0.35);
  for (const at of [2.7, 3.45, 4.15, 4.8, 5.37, 5.82]) tone(at, 0.56, 69.3, 46.25, 0.14, "sine", 0, 0.06);
  // The cut to the swarm opens a fifth on either side of the listener.
  for (const [i, hz] of [46.25, 92.5, 138.59, 185, 277.18, 369.99].entries()) {
    tone(5.86 + i * 0.05, 10.9, hz * 0.994, hz, 0.18 / (1 + i * 0.6), i < 4 ? "sine" : "triangle", (i % 2 ? -1 : 1) * i * 0.13, 0.18 + i * 0.035);
  }
  // One metallic tremor as the quarry slides by, then a slowly rising chord for Saturn.
  for (const [i, hz] of [187, 251, 411, 629].entries()) tone(13.2 + i * 0.12, 2.1, hz, hz * 0.86, 0.044 / (1 + i), "triangle", i / 4 - 0.4, 0.09);
  for (const [i, hz] of [61.74, 92.5, 123.47, 155.56, 207.65].entries()) {
    tone(16.9 + i * 0.26, 10.3 - i * 0.22, hz * 0.987, hz, 0.15 / (1 + i * 0.7), "sine", i / 4 - 0.5, 0.56);
  }
  // Voyager leaves a single, very quiet carrier in the mix.
  tone(27.1, 7.8, 369.99, 369.25, 0.035, "sine", 0.22, 0.55);
  tone(34.8, 6.8, 185, 185, 0.12, "sine", -0.06, 0.1);
  for (const [i, hz] of [46.25, 92.5, 138.59, 185, 233.08, 277.18].entries()) {
    tone(36.1 + i * 0.28, 8.85 - i * 0.28, hz, hz, 0.21 / (1 + i * 0.62), i === 5 ? "triangle" : "sine", (i % 2 ? -1 : 1) * i * 0.13, 0.44);
  }
  return audio.startRendering();
}
