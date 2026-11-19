/** Editorial clock shared by the directed screening and the scroll-driven cover. */
export const FILM_DURATION = 45;
export const COVER_DURATION = 11;

const beats = [
  { id: "collector", at: 0, title: "Dyson swarm" },
  { id: "reveal", at: 6, title: "Dyson swarm" },
  { id: "quarry", at: 11, title: "16 Psyche" },
  { id: "saturn", at: 17, title: "Saturn" },
  { id: "voyager", at: 27, title: "Voyager 1" },
  { id: "home", at: 35, title: "Dyson swarm" },
] as const;

export type FilmShot = ReturnType<typeof filmAt>;

export const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
export const easeShot = (n: number) => {
  const t = clamp01(n);
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export function filmAt(seconds: number) {
  const time = Math.min(FILM_DURATION, Math.max(0, Number.isNaN(seconds) ? 0 : seconds));
  const index = beats.findLastIndex((beat) => time >= beat.at);
  const { id, at, title } = beats[index];
  const progress = (time - at) / ((beats[index + 1]?.at ?? FILM_DURATION) - at);
  const ease = easeShot(progress);
  const distant = id === "saturn" || id === "voyager";
  const collector = id === "collector";
  const reveal = id === "reveal";
  const home = id === "home";
  const cover = collector ? mix(0.02, 0.15, ease) : reveal ? mix(0.33, 1, ease) : 1;
  const reach = id === "saturn" ? mix(0.22, 0.32, ease) : id === "voyager" ? 1 : 0;
  return {
    id, title, time, progress, ease,
    build: collector ? mix(0.36, 0.51, ease) : reveal ? mix(0.51, 1, ease) : 1,
    cover,
    voyage: {
      depart: distant ? 1 : 0,
      cruise: distant ? 0.4 : home ? 0.8 : 0,
      arrive: home ? 1 : 0,
      lift: 0,
      reach,
    },
  };
}
