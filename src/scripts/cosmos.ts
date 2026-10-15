/**
 * The cover: the Solar System with a Dyson swarm going up at 1 AU.
 *
 * Everything is generated from one seed, in the spirit of Worldline Engine,
 * and every body moves on a Kepler orbit that the GPU solves per vertex, so
 * tens of thousands of points cost the CPU nothing per frame.
 *
 *   swarm      60,000 hexagonal collectors on 150 rings near 1 AU, in three woven
 *              families, each on its own orbit, slowed a little by light pressure
 *   belt       the main belt, 2.1 to 3.3 AU, with the Kirkwood gaps Jupiter clears,
 *              and Jupiter's two Trojan clouds
 *   tugs       cargo falling in from the belt on Hohmann transfers (perihelion 1 AU)
 *   planets    Earth, Mars, Jupiter, on their real elements
 *
 * The belt is what the swarm is made of: as the build advances the belt thins
 * by the same fraction. The arithmetic behind the caption: the main belt holds
 * about 2.39e21 kg, a sphere at 1 AU is 2.81e23 m², so the whole belt rolled
 * to 8.5 g/m² foil just covers it.
 *
 * The shot opens close, just outside the shell and above its first band, so
 * the nearest collectors are large and dark against the Sun and the far wall
 * is lit gold. Scrolling pulls back past the belt and round the Sun by about
 * thirty degrees, so near things cross far ones, until the whole sphere is in
 * frame and closed. 16 Psyche, the quarry, passes the camera on the way: a
 * real body (geo/psyche.ts), lit from behind, turning, with floodlights in
 * its open pit and cargo leaving for the swarm. A few boulders the miners
 * left are scattered along the same road, each at its own depth.
 *
 * Behind everything is the galaxy, painted once into a strip of sky. The
 * lens is stopped down near the Sun, so it only comes out as the camera
 * leaves and the sphere closes.
 *
 * Distances and periods are to scale. Sizes are not (the Sun is drawn about
 * 18 times too large, or it would be a single pixel; Psyche far more), and
 * Psyche's day is slowed to something a person can watch.
 *
 * The shot does not end with the cover. The page below it is the voyage out:
 * the camera keeps going, past Saturn, Uranus and Neptune and through the
 * Kuiper belt to 140 AU, rising over the ecliptic as it goes so the orbits
 * open into rings, until the sphere is one gold star with the whole system
 * drawn round it in hairlines. The footer is the return: the same move run
 * backwards, home to the closed sphere. One camera, one take.
 */
import { fingerprint, mulberry32 } from "./worldline";
import { rockBuilder } from "./geo/psyche";

export const L_SUN = 3.828e26; // W
export const BELT_MASS = 2.39e21; // kg
export const YEAR_SECONDS = 40; // one year of the scene per this many seconds of yours

export interface CosmosState {
  /** Fraction of the swarm built, 0 to 1. */
  built: number;
  collectors: number;
  total: number;
  tugs: number;
  years: number;
  /** Radius of the Sun's disc on screen, CSS px. */
  sunPx: number;
  /** 0 until the sphere closes, then 1: all of the Sun's output leaving as one beam. */
  beam: number;
  /** Screen positions of the labelled bodies, CSS px, with whether each is in view. */
  labels: Record<string, { x: number; y: number; on: boolean }>;
  /** The camera's distance from the Sun, AU. */
  range: number;
  /** How far out the voyage is, 0 at the sphere to 1 in deep space. */
  away: number;
  /** Radius of the sphere on screen, CSS px. */
  spherePx: number;
}

/** A place for the Sun, as fractions of the canvas. */
export type Place = (w: number, h: number) => { x: number; y: number };

/**
 * Where the camera is on its one take, each part 0 to 1. The cover is the
 * build and the first pull-back; then it leaves, cruises while the page is
 * read, and comes home for the footer.
 */
export interface Voyage {
  cover: number;
  depart: number;
  cruise: number;
  arrive: number;
  /**
   * How far below its place at home the Sun is to be put, as a fraction of the
   * canvas's height: the footer has not finished coming up, and on a narrow
   * screen the sphere comes up with it.
   */
  lift?: number;
  /**
   * How far out the camera is, as the share of the way from the end of the
   * cover's shot to the edge of the take, counted in the logarithm of the
   * distance. Given, it sets the distance on its own, so the page can put each
   * of its parts at its own place on the way out; left out, the leaving and
   * the cruise set it.
   */
  reach?: number;
}

export interface CosmosOptions {
  seed: string;
  /** Where the Sun sits on the cover, for a canvas of w × h CSS px. */
  place: Place;
  /** Where it sits while the camera is far out; by default high and to the right. */
  placeFar?: Place;
  /** Where it sits when the camera comes home; by default where the cover had it. */
  placeEnd?: Place;
  /** What a drag is read from. The canvas, unless it lies behind the page. */
  surfaces?: HTMLElement[];
  /** Fewer points for small screens. */
  light?: boolean;
  /** Draw one finished frame and stop (reduced motion). */
  still?: boolean;
  /** Open part-way through the voyage, with the swarm already built (a page with no cover). */
  from?: Partial<Voyage>;
  /**
   * What calls the scene once a frame, with the time in ms. The browser's own
   * frame callback unless the page has one loop for everything that moves, in
   * which case the scene joins it and is never a frame out of step with it.
   */
  loop?: { add(fn: (ms: number) => void): void; remove(fn: (ms: number) => void): void };
  onFrame?: (s: CosmosState) => void;
  /** The graphics context has gone (the browser took it back). The scene has stopped; the page should fall back to its stills. */
  onLost?: () => void;
}

export interface Cosmos {
  /** Scroll position through the cover, 0 to 1. */
  setScroll(s: number): void;
  /** Where the camera is on the whole take. Parts left out keep their value. */
  setVoyage(v: Partial<Voyage>): void;
  /** Send one pulse of light up the beam. */
  pulse(): void;
  /** The page has reached its `n`th chapter (section): the camera swings round to a new heading, and back again if `n` goes down. */
  turn(n: number): void;
  /** Put the camera where the scroll says at once (the page has cut, not travelled). With `settled`, the opening is skipped too. */
  snap(settled?: boolean): void;
  /** Hang one of the far things on the sky so it is at (nx, ny) on the screen when the take is at `cruise`, in chapter `ch`. */
  stage(kind: "hole" | "quasar" | "wormhole" | "nebula", cruise: number, ch: number, nx: number, ny: number): void;
  /** How much of a staged far thing is shown, 0 to 1. */
  show(kind: "hole" | "quasar" | "wormhole" | "nebula", v: number): void;
  /** Stop drawing (something opaque covers the whole window), or start again. */
  rest(on: boolean): void;
  /** A star goes off at (nx, ny) on the screen now; `size` scales it. */
  nova(nx?: number, ny?: number, size?: number): void;
  /** The scene as it is at this instant, drawn once more and copied to a canvas of its own. */
  still(): HTMLCanvasElement | null;
  run(on: boolean): void;
  refit(): void;
  destroy(): void;
}

const TAU = Math.PI * 2;
const FOV = (46 * Math.PI) / 180;
const F0 = 1 / Math.tan(FOV / 2);
const WIDE_R = 3.9; // how far out the shot ends, AU
const RINGS = 150; // three woven families of fifty
const PER = 400; // collectors per ring: 60,000 in all
const HEX = 0.0125; // drawn radius of one collector, AU (far larger than life)
// Sunlight pushes on the foil. At 8.5 g/m² an absorbing sheet feels about 9% of
// the Sun's pull cancelled (0.77 g/m² would float), so its year is a little long.
const BETA = 0.09;
const SUN_R = 0.085; // drawn radius, AU
const START = 0.36; // how much of the swarm stands when the page opens
const CLOSE = 0.9; // how far through the cover the last collector goes up; the rest is the beam, held
// The shafts: how far towards the Sun each pixel gathers light, how fast that
// fades along the way, and how strongly the shafts and the bloom are added.
const SHAFT = { reach: 0.96, decay: 0.9, gain: 2.6, bloom: 0.5, spread: 1.0, linger: 0.3 };
const SWEEP = 0.5; // how far round the Sun the camera travels as it pulls back, radians
const LOOK = { az: 0.013, el: 0.008 }; // how far the pointer leans the camera, radians
// 16 Psyche as drawn: radius in AU, how far in front of the last camera it sits, seconds per turn.
const ROCK = { r: 0.066, depth: 0.85, day: 84 };
const HAUL_WAKE = 10; // points in the wake behind each loaded tug
// The opening: for its first seconds the camera is still easing out and round to where the shot starts.
const ARRIVE = { seconds: 4.6, closer: 0.085, az: -0.075, el: 0.028 };
const GALAXY = { lat: 0.62, gain: 0.7 }; // half-height of the painted strip in radians, and how bright it is hung
// Deep space: how far out the voyage goes (AU), how high over the ecliptic it
// rises (radians), and how far round the Sun it travels while the page is read.
// (`deep` is the furthest point, reached half-way down the page: the camera is
// still leaving, slowly, for as long as the reader is going down, and turns for
// home after that. 520 AU is four times past the heliopause.)
const FAR = { r: 140, deep: 520, el: 0.94, sweep: 1.15 };
const HOME_TALL = 0.24; // how much further off the sphere is held when the camera comes home on a tall screen
const CHAPTER = { turn: 0.2, seconds: 1.3 }; // how far round the camera swings for each new section of the page, radians, and how long it takes
// The sphere on screen, in CSS px of radius. Over `post` its shafts and bloom
// give way to a point of light (`star`, the same stretch, so there is no size at
// which it has neither); below `thin` only a share of the collectors is drawn.
const LOD = { post: [12, 60], thin: 44, star: [12, 60] } as const;

// Value noise in three dimensions, for anything painted or lit procedurally.
const NOISE = `
float hash3(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise3(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
float fbm3(vec3 p, int n) { float s = 0.0, a = 0.5; for (int k = 0; k < n; k++) { s += a * noise3(p); p = p * 2.02 + 7.3; a *= 0.5; } return s; }
`;

const HEAD = `#version 300 es
precision highp float;
uniform mat4 u_proj;
uniform mat4 u_view;
uniform float u_px;
uniform float u_time;
uniform float u_p;
const float TAU = 6.283185307;

// Position on a Kepler orbit, in AU, ecliptic in the xz plane.
vec3 kepler(float a, float e, float inc, float node, float peri, float M) {
  float E = M + e * sin(M);
  for (int k = 0; k < 4; k++) E -= (E - e * sin(E) - M) / (1.0 - e * cos(E));
  float x = a * (cos(E) - e), y = a * sqrt(1.0 - e * e) * sin(E);
  float cw = cos(peri), sw = sin(peri), ci = cos(inc), si = sin(inc), cn = cos(node), sn = sin(node);
  float px = cw * x - sw * y, py = sw * x + cw * y;
  return vec3(cn * px - sn * ci * py, si * py, sn * px + cn * ci * py);
}
`;

const FRAG_HEAD = `#version 300 es
precision highp float;
out vec4 o;
`;

// ---- the galaxy: painted once into a strip of sky either side of its plane ----
const VS_POST = `#version 300 es
in vec2 a_q;
out vec2 v_uv;
void main() { v_uv = a_q * 0.5 + 0.5; gl_Position = vec4(a_q, 0.0, 1.0); }`;
const FS_PAINT = FRAG_HEAD + NOISE + `
in vec2 v_uv;
uniform vec3 u_seed;
void main() {
  float lon = (v_uv.x - 0.5) * 6.2831853, lat = (v_uv.y - 0.5) * ${(2 * GALAXY.lat).toFixed(3)};
  vec3 d = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
  vec3 q = d + u_seed;
  // The disc: thin, and both brighter and thicker towards the centre of the galaxy.
  float toward = 0.5 + 0.5 * cos(lon);
  float bulge = exp(-(lon * lon * 1.7 + lat * lat * 11.0));
  float wide = mix(0.07, 0.125, toward * toward);
  // The plane itself wanders a little.
  float mid = lat - 0.03 * sin(lon * 2.0 + 1.0) - 0.07 * (fbm3(q * 1.6, 3) - 0.5);
  float disc = exp(-pow(mid / wide, 2.0)) * mix(0.4, 1.0, toward);
  float haze = exp(-abs(mid) / (wide * 2.4)) * 0.2 * mix(0.5, 1.0, toward);
  // Star clouds, and the knots inside them.
  float clouds = fbm3(q * 4.0, 5);
  float knots = pow(fbm3(q * 9.0 + 3.0, 4), 2.0);
  float light = (disc * (0.3 + 1.3 * clouds) + haze) * (0.7 + 1.1 * knots) + bulge * 0.85;
  // Dust: dark lanes drawn out along the plane, and one long rift through the middle.
  float ridge = 1.0 - abs(2.0 * fbm3(q * vec3(5.0, 12.0, 5.0) + 1.7, 4) - 1.0);
  float lanes = smoothstep(0.6, 0.9, ridge + 0.25 * fbm3(q * 14.0, 3)) * exp(-pow((mid + 0.01) / (wide * 0.8), 2.0));
  float rift = smoothstep(0.42, 0.66, fbm3(q * vec3(2.2, 6.5, 2.2) + 9.0, 4)) * exp(-pow(mid / (wide * 0.5), 2.0));
  light *= 1.0 - 0.82 * clamp(lanes + rift, 0.0, 1.0);
  // Old yellow stars at the centre, young blue ones out along the arms.
  vec3 col = mix(vec3(0.72, 0.81, 1.0), vec3(1.0, 0.85, 0.64), clamp(bulge * 1.5 + 0.3 * toward, 0.0, 1.0));
  float edge = smoothstep(1.0, 0.78, abs(v_uv.y - 0.5) * 2.0);
  o = vec4(col * light * edge, 1.0);
}`;
const VS_FAR = `#version 300 es
in vec2 a_q;
out vec2 v_q;
void main() { v_q = a_q; gl_Position = vec4(a_q, 0.0, 1.0); }`;
const FS_FAR = FRAG_HEAD + `
in vec2 v_q;
uniform sampler2D u_sky;
uniform mat3 u_look; // from the camera's frame to the galaxy's
uniform vec4 u_lens; // aspect / F, 1 / F, and the lens shift
uniform float u_gain;
uniform float u_smear; // how far the sky moved across the frame while the shutter was open, device px
float cellHash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main() {
  vec3 d = u_look * normalize(vec3((v_q.x - u_lens.z) * u_lens.x, (v_q.y - u_lens.w) * u_lens.y, -1.0));
  float lat = asin(clamp(d.y, -1.0, 1.0));
  if (abs(lat) > ${GALAXY.lat.toFixed(3)}) discard;
  vec3 c = texture(u_sky, vec2(atan(d.z, d.x) / 6.2831853 + 0.5, lat / ${(2 * GALAXY.lat).toFixed(3)} + 0.5)).rgb * u_gain;
  // The band is not smoke. It is stars, too faint and too many to keep one by
  // one: so the sky is cut into cells a seventh of a degree across, each cell
  // is given one star at a place and a brightness of its own, and there are as
  // many to be seen as the painted light says there should be. They are fixed
  // on the sky, so they turn with it and never crawl.
  vec3 q = d * 430.0, cell = floor(q);
  vec3 at = vec3(cellHash(cell + 1.7), cellHash(cell + 3.1), cellHash(cell + 5.3)) * 0.64 + 0.18;
  float r = length(q - cell - at);
  float lum = dot(c, vec3(0.3, 0.5, 0.2));
  float mag = cellHash(cell);
  float dot_ = smoothstep(0.34, 0.04, r) * (pow(mag, 7.0) * 2.4 + 0.1) * step(1.0 - min(1.0, lum * 9.0 + 0.04), cellHash(cell + 9.4));
  // A camera that is turning smears these into the haze they came from: stars
  // this faint do not leave streaks, only the ones kept one by one do.
  dot_ *= 1.0 - 0.88 * smoothstep(1.2, 6.0, u_smear);
  c = c * 0.82 + mix(vec3(1.0, 0.9, 0.78), vec3(0.8, 0.88, 1.0), cellHash(cell + 2.2)) * dot_ * (0.035 + lum * 1.5) * u_gain;
  // Under one level of noise, so the faint end does not band.
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  o = vec4(max(c + (n - 0.5) / 255.0, 0.0), 0.0);
}`;

// ---- deep sky: what the camera finds out past the planets ----
// Three things far beyond the Solar System, drawn as light on the sky behind
// it: a black hole with its disc, a quasar, and the supernovae that go off as
// the reader moves from one part of the page to the next. Each is a direction
// on the sky, so each turns with the camera like the stars around it.
const FS_DEEP = FRAG_HEAD + NOISE + `
in vec2 v_q;
uniform sampler2D u_sky;
uniform mat3 u_look; // from the camera's frame to the galaxy's
uniform vec4 u_lens;
uniform float u_gain;
uniform float u_clock;
uniform vec4 u_bh; // the black hole: its direction in the camera's frame, and how much of it is seen
uniform float u_bhr; // the angular radius of its shadow
uniform vec4 u_qso; // the quasar: direction, seen
uniform vec4 u_sn[3]; // supernovae: direction, and seconds since each went off (negative: none)
uniform vec4 u_wh; // a wormhole: direction, seen
uniform float u_whr; // the angular radius of its sphere
uniform vec4 u_neb; // an emission nebula: direction, seen
uniform vec4 u_comet; // a comet's head: direction, seconds since it came into view (negative: none)
uniform vec3 u_cometV; // the way its head is moving across the sky, in the camera's frame
const float GLAT = ${GALAXY.lat.toFixed(3)};
float cellHash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
// The sky in one direction: the painted galaxy, and a fine grain of stars.
vec3 backdrop(vec3 r) {
  vec3 d = u_look * r;
  float lat = asin(clamp(d.y, -1.0, 1.0));
  vec3 c = vec3(0.0);
  if (abs(lat) < GLAT) c = texture(u_sky, vec2(atan(d.z, d.x) / 6.2831853 + 0.5, lat / (2.0 * GLAT) + 0.5)).rgb * u_gain;
  vec3 q = d * 900.0, cell = floor(q);
  vec3 at = vec3(cellHash(cell + 1.7), cellHash(cell + 3.1), cellHash(cell + 5.3)) * 0.64 + 0.18;
  float s = smoothstep(0.32, 0.04, length(q - cell - at)) * step(0.9, cellHash(cell + 9.4)) * (pow(cellHash(cell), 6.0) * 2.2 + 0.18);
  return c + mix(vec3(1.0, 0.9, 0.8), vec3(0.82, 0.9, 1.0), cellHash(cell + 2.2)) * s * 0.55;
}
void frame(vec3 b, out vec3 e1, out vec3 e2) { e1 = normalize(cross(b, vec3(0.0, 1.0, 0.0))); e2 = cross(e1, b); }
// Gas going round: streaks drawn out along the orbit, sheared as it goes (inner rings lap outer ones).
float flow(float R, float ph, float t) {
  float spin = t * 0.75 * pow(1.8 / max(R, 1.8), 1.5);
  vec2 c = vec2(cos(ph - spin), sin(ph - spin));
  return fbm3(vec3(R * 2.4, c * 2.3), 4) * 0.75 + fbm3(vec3(R * 9.0, c * 0.9), 2) * 0.35;
}
// The sky on the far side of the wormhole: a spiral galaxy close by, nearly face on, in a crowded field of stars.
vec3 otherSky(vec3 d) {
  vec3 g = normalize(vec3(0.25, 0.3, 1.0));
  float ang = acos(clamp(dot(d, g), -1.0, 1.0));
  vec3 a1 = normalize(cross(g, vec3(0.0, 1.0, 0.0))), a2 = cross(a1, g);
  vec2 q = vec2(dot(d, a1), dot(d, a2)) / max(sin(ang), 1e-3) * ang / 0.5;
  q = mat2(0.8, 0.6, -0.6, 0.8) * q;
  q.y *= 1.7;
  float rr = length(q), th = atan(q.y, q.x);
  float arms = pow(0.5 + 0.5 * cos(2.0 * (th - 2.4 * log(max(rr, 0.03)))), 3.0);
  float body = exp(-rr * 2.6) * (0.3 + 1.5 * arms * smoothstep(0.04, 0.3, rr)) * (0.65 + 0.7 * fbm3(vec3(q * 7.0, 1.3), 3)) + exp(-rr * 16.0) * 1.4;
  vec3 c = mix(vec3(1.0, 0.82, 0.62), vec3(0.62, 0.76, 1.0), smoothstep(0.08, 0.6, rr)) * body * 0.85;
  c += vec3(0.4, 0.12, 0.3) * pow(fbm3(d * 2.6 + 5.0, 4), 2.0) * 0.4 + vec3(0.05, 0.22, 0.32) * pow(fbm3(d * 3.4 + 1.0, 3), 2.0) * 0.3;
  vec3 sq = d * 320.0, cell = floor(sq);
  vec3 at = vec3(cellHash(cell + 1.7), cellHash(cell + 3.1), cellHash(cell + 5.3)) * 0.64 + 0.18;
  float st = smoothstep(0.34, 0.05, length(sq - cell - at)) * step(0.72, cellHash(cell + 9.4)) * (pow(cellHash(cell), 5.0) * 2.5 + 0.2);
  return c + mix(vec3(1.0, 0.88, 0.75), vec3(0.75, 0.85, 1.0), cellHash(cell + 2.2)) * st * 0.7;
}
void main() {
  vec3 r = normalize(vec3((v_q.x - u_lens.z) * u_lens.x, (v_q.y - u_lens.w) * u_lens.y, -1.0));
  vec3 col = vec3(0.0);
  float a = 0.0;
  vec3 e1, e2;

  // An emission nebula: hydrogen glowing red, oxygen teal at its heart, and dust in lanes across it.
  if (u_neb.w > 0.002 && dot(r, u_neb.xyz) > 0.0) {
    frame(u_neb.xyz, e1, e2);
    vec2 p = vec2(dot(r, e1), dot(r, e2)) / 0.42;
    float ang = length(p);
    if (ang < 1.8) {
      float n1 = fbm3(vec3(p * 2.6, 3.1), 5), n2 = fbm3(vec3(p * 5.5 + 4.0, 7.7), 4);
      float shape = smoothstep(1.5, 0.15, ang + (n1 - 0.5) * 1.1);
      float gas = shape * smoothstep(0.32, 0.78, n1 + 0.1 * (1.0 - ang));
      float dust = smoothstep(0.52, 0.78, n2) * shape;
      vec3 neb = mix(vec3(0.22, 0.62, 0.68), vec3(0.88, 0.26, 0.34), smoothstep(0.15, 0.85, ang + (n2 - 0.5) * 0.5)) * gas * 0.5;
      neb += vec3(1.0, 0.62, 0.36) * pow(gas, 3.0) * 0.32;
      neb *= 1.0 - 0.85 * dust;
      col += neb * u_neb.w;
      a = max(a, dust * 0.55 * u_neb.w);
    }
  }

  if (u_wh.w > 0.002 && dot(r, u_wh.xyz) > 0.0) {
    vec3 b = u_wh.xyz;
    frame(b, e1, e2);
    vec2 p = vec2(dot(r, e1), dot(r, e2)) / u_whr;
    float rr = length(p);
    if (rr < 7.0) {
      float k = u_wh.w;
      vec3 c;
      if (rr < 1.0) {
        // Through the throat the whole of the far sky is squeezed into the sphere: what is straight
        // ahead there is at its centre, and what is behind is drawn round its rim.
        float th = pow(rr, 1.35) * 3.14159 * 0.94;
        vec2 dir2 = p / max(rr, 1e-4);
        vec3 d = cos(th) * b + sin(th) * (dir2.x * e1 + dir2.y * e2);
        c = otherSky(d) * (0.55 + 0.45 * smoothstep(1.0, 0.55, rr));
      } else {
        // Outside it, our own sky is bent round it as round any mass, and shows twice near the edge.
        const float E = 1.45;
        vec2 beta = p - p * (E * E) / max(rr * rr, 1e-3);
        beta *= min(1.0, 60.0 / max(length(beta), 1e-3));
        c = backdrop(normalize(b + (beta.x * e1 + beta.y * e2) * u_whr));
      }
      float rim = exp(-pow((rr - 1.0) / 0.014, 2.0)) * 0.55 + exp(-abs(rr - 1.0) / 0.12) * 0.06;
      float cover = (1.0 - smoothstep(4.5, 7.0, rr)) * k;
      col += c * cover + vec3(0.8, 0.88, 1.0) * rim * k;
      a = max(a, cover);
    }
  }

  if (u_bh.w > 0.002 && dot(r, u_bh.xyz) > 0.0) {
    vec3 b = u_bh.xyz;
    frame(b, e1, e2);
    vec2 p = vec2(dot(r, e1), dot(r, e2)) / u_bhr;
    float rr = length(p);
    if (rr < 15.0) {
      float k = u_bh.w;
      // Light from behind is bent round it: a ray that passes at p left the sky at p - E^2 p / |p|^2.
      // Close in, everything behind is drawn out into the Einstein ring; inside, the shadow.
      const float E = 2.3;
      vec2 beta = p - p * (E * E) / max(rr * rr, 1e-3);
      beta *= min(1.0, 60.0 / max(length(beta), 1e-3));
      vec3 bg = backdrop(normalize(b + (beta.x * e1 + beta.y * e2) * u_bhr)) * smoothstep(0.985, 1.03, rr);
      float cover = (1.0 - smoothstep(8.0, 15.0, rr)) * k;

      // The disc, seen almost edge on and rolled a little.
      const float roll = -0.12, tilt = 0.17;
      vec2 q = mat2(cos(roll), sin(roll), -sin(roll), cos(roll)) * p;
      vec2 dd = vec2(q.x, q.y / tilt);
      float R = length(dd);
      float ph = atan(dd.y, dd.x);
      // The side coming at the camera is beamed: brighter and bluer. The other is dimmer and redder.
      float D = 1.0 - 0.36 * dd.x / max(R, 1e-3);
      float D3 = D * D * D;
      float band = smoothstep(1.45, 1.95, R) * (1.0 - smoothstep(6.0, 10.0, R));
      float near = q.y < 0.0 ? 1.0 : smoothstep(1.0, 1.06, rr); // the far half goes behind the shadow
      float disc = band * pow(2.0 / max(R, 2.0), 1.7) * (0.45 + 1.1 * flow(R, ph, u_clock)) * D3 * near;
      // The far side of the disc, seen again over the top of the shadow and under it, bent round by the hole.
      float ps = atan(q.y, q.x);
      float halo = exp(-(rr - 1.07) / 0.62) * smoothstep(1.03, 1.12, rr) * (1.0 - smoothstep(2.6, 3.4, rr)) * (q.y > 0.0 ? 1.0 : 0.7);
      halo *= (0.4 + 1.0 * flow(2.4 + (rr - 1.05) * 3.5, ps * 1.0, u_clock)) * mix(0.35, 1.0, abs(q.y) / max(rr, 1e-3)) * (1.0 - 0.3 * q.x / max(rr, 1e-3));
      // The photon ring: light that went round once before it got away.
      float ring = exp(-pow((rr - 1.035) / 0.017, 2.0)) * 1.2;
      // Exposed like film: the brightest gas holds its colour instead of burning out.
      float lum = 1.0 - exp(-(disc + halo * 1.15 + ring) * 1.35);
      vec3 warm = vec3(1.0, 0.52, 0.2), hot = vec3(1.0, 0.92, 0.8), blue = vec3(0.8, 0.88, 1.0);
      vec3 tint = mix(mix(warm, hot, clamp(lum * 1.1, 0.0, 1.0)), blue, clamp((D - 1.0) * 0.9, 0.0, 0.6));
      vec3 glow = vec3(1.0, 0.7, 0.45) * exp(-rr / 2.4) * 0.05;
      col += bg * cover + (tint * lum * 0.85 + glow) * k;
      a = cover;
    }
  }

  if (u_qso.w > 0.002 && dot(r, u_qso.xyz) > 0.0) {
    frame(u_qso.xyz, e1, e2);
    vec2 p = vec2(dot(r, e1), dot(r, e2)) / 0.0062;
    float rr = length(p);
    if (rr < 70.0) {
      // A point brighter than its whole galaxy, with two jets: the near one bright, the one going away faint.
      float core = exp(-rr * 1.1) * 2.6 + exp(-rr * 0.2) * 0.22 + (exp(-abs(p.y) * 3.0) * exp(-abs(p.x) * 0.12) + exp(-abs(p.x) * 3.0) * exp(-abs(p.y) * 0.12)) * 0.35;
      vec2 ax = vec2(0.77, 0.64);
      float t = dot(p, ax), w = dot(p, vec2(-ax.y, ax.x));
      float jet = exp(-abs(w) / (0.3 + 0.04 * abs(t))) * exp(-abs(t) / 30.0) * smoothstep(1.0, 3.5, abs(t)) * (t > 0.0 ? 1.0 : 0.35);
      jet *= 0.55 + 0.45 * sin(abs(t) * 0.8 - u_clock * 1.4);
      float host = exp(-length(p / vec2(10.0, 4.6)) * 1.7) * 0.16;
      col += (vec3(0.96, 0.96, 1.0) * core + vec3(0.55, 0.66, 1.0) * jet * 0.8 + vec3(1.0, 0.85, 0.7) * host) * u_qso.w;
    }
  }

  for (int i = 0; i < 3; i++) {
    float t = u_sn[i].w;
    // (The direction's length is the size it is drawn at.)
    float sc = length(u_sn[i].xyz);
    vec3 sd = u_sn[i].xyz / max(sc, 1e-4);
    if (t < 0.0 || dot(r, sd) <= 0.0) continue;
    frame(sd, e1, e2);
    vec2 p = vec2(dot(r, e1), dot(r, e2)) / (0.0024 * sc);
    float rr = length(p);
    if (rr > 170.0) continue;
    // A star goes off: up in a third of a second, down over the next few, and the shell it threw keeps going.
    float L = smoothstep(0.0, 0.35, t) * exp(-max(t - 0.35, 0.0) / 1.7);
    float core = L * (exp(-rr * 0.85) * 3.2 + exp(-rr * 0.11) * 0.45);
    float spikes = L * (exp(-abs(p.y) * 2.4) * exp(-abs(p.x) * 0.055) + exp(-abs(p.x) * 2.4) * exp(-abs(p.y) * 0.055)) * 0.8;
    float R = 4.0 + 12.0 * sqrt(t);
    float fil = 0.45 + 0.9 * noise3(vec3(p / max(rr, 1e-3) * 5.0, t * 0.15) + float(i) * 7.0);
    float shell = exp(-pow((rr - R) / (0.05 * R + 0.5), 2.0)) * exp(-t / 4.5) * smoothstep(0.2, 1.4, t) * 0.15 * fil;
    vec3 hot = mix(vec3(0.78, 0.86, 1.0), vec3(1.0, 0.72, 0.45), smoothstep(0.6, 4.0, t));
    col += hot * (core + spikes) + (vec3(1.0, 0.62, 0.5) * 0.6 + vec3(0.5, 0.7, 1.0) * 0.4) * shell;
  }

  if (u_comet.w >= 0.0) {
    float t = u_comet.w;
    vec3 h = normalize(u_comet.xyz);
    if (dot(r, h) > 0.0) {
      frame(h, e1, e2);
      vec2 p = vec2(dot(r, e1), dot(r, e2)) / 0.0028;
      vec2 v = normalize(vec2(dot(u_cometV, e1), dot(u_cometV, e2)) + 1e-5);
      float along = -dot(p, v), side = dot(p, vec2(-v.y, v.x));
      if (along > -10.0 && along < 160.0 && abs(side) < 40.0) {
        // A head, and two tails behind it: the ion tail straight and blue, the dust tail curving and gold.
        float fade = smoothstep(0.0, 1.2, t) * smoothstep(9.0, 6.5, t);
        float head = exp(-length(p) * 0.85) * 2.2 + exp(-length(p) * 0.22) * 0.22;
        float behind = step(0.0, along);
        float ion = exp(-abs(side) / (0.35 + 0.018 * along)) * exp(-along / 110.0) * behind;
        float bend = side - 0.0022 * along * along;
        float dust = exp(-abs(bend) / (0.8 + 0.07 * along)) * exp(-along / 60.0) * behind;
        col += (vec3(1.0, 0.97, 0.92) * head + vec3(0.55, 0.74, 1.0) * ion * 0.6 + vec3(1.0, 0.84, 0.58) * dust * 0.42) * fade;
      }
    }
  }

  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  o = vec4(max(col + (n - 0.5) / 255.0 * step(0.0005, a + dot(col, vec3(1.0))), 0.0), a);
}`;

// ---- far stars: fixed on the sky, so they only turn with the camera ----
const VS_SKY = HEAD + `
in vec4 a_s; // direction xyz, brightness
in float a_t; // tint: 0 warm, 1 cool
uniform float u_gain;
uniform mat4 u_was; // the view one frame ago
uniform vec2 u_half; // half the frame, device px
out float v_b; out float v_t; out vec3 v_m; // v_m: the way the star moved this frame, and how much of the sprite that is
out float v_big; // whether it is one of the few bright ones, judged before its light is spread along a streak
void main() {
  vec3 d = mat3(u_view) * a_s.xyz;
  gl_Position = u_proj * vec4(d * 200.0, 1.0);
  // The few brightest get a larger sprite, to carry their glint.
  float size = u_px * (0.85 + a_s.w * 2.1 + smoothstep(0.55, 1.0, a_s.w) * 13.0);
  // The shutter is open for half of each frame. A camera that is turning
  // draws every star out along the way it turned, by half of how far.
  vec4 was = u_proj * vec4(mat3(u_was) * a_s.xyz * 200.0, 1.0);
  vec2 moved = (gl_Position.xy / gl_Position.w - was.xy / was.w) * u_half * 0.5;
  float len = min(length(moved), 28.0 * u_px);
  gl_PointSize = size + len;
  v_m = vec3(len > 0.05 ? moved / length(moved) : vec2(1.0, 0.0), len / (size + len));
  // The same light, spread along the streak.
  v_big = smoothstep(0.55, 1.0, a_s.w * u_gain);
  v_b = a_s.w * u_gain * size / (size + 0.75 * len); v_t = a_t;
}`;
const FS_SKY = FRAG_HEAD + `
in float v_b; in float v_t; in vec3 v_m; in float v_big;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  q.y = -q.y;
  // Distance to the stroke the star made while the shutter was open, in the units of a star at rest.
  float along = clamp(dot(q, v_m.xy), -0.5 * v_m.z, 0.5 * v_m.z);
  q = (q - v_m.xy * along) / (1.0 - v_m.z);
  float d = length(q);
  float big = v_big;
  // A small star is a soft dot. A bright one is a tight core with a fine cross of light.
  float core = smoothstep(0.5, 0.05, d * mix(1.0, 5.5, big));
  // (The cross belongs to a star held still; drawn out into a streak it has none.)
  float glint = max(exp(-abs(q.x) * 150.0) * exp(-abs(q.y) * 7.0), exp(-abs(q.y) * 150.0) * exp(-abs(q.x) * 7.0)) * big * (1.0 - smoothstep(0.1, 0.5, v_m.z));
  float m = (core + glint * 0.9) * (0.11 + v_b * 0.89);
  vec3 c = mix(vec3(1.0, 0.93, 0.84), vec3(0.8, 0.87, 1.0), v_t);
  o = vec4(c * m, m);
}`;

// ---- the Sun: a billboard, drawn once as corona and once as the disc ----
const VS_SUN = HEAD + `
in vec2 a_q;
uniform float u_size;
out vec2 v_q;
void main() {
  vec4 c = u_view * vec4(0.0, 0.0, 0.0, 1.0);
  c.xy += a_q * u_size;
  gl_Position = u_proj * c;
  v_q = a_q;
}`;
const FS_SUN = FRAG_HEAD + NOISE + `
in vec2 v_q;
uniform float u_mode; // 0 corona, 1 disc, 2 light held inside the sphere, 3 lens streak, 4 the source the shafts are cut from, 5 the far star
uniform float u_span; // quad half-size in solar radii
uniform float u_dim;
uniform float u_gain;
uniform float u_turn;
uniform float u_fill; // 1: draw the middle too (glare over whatever hides the disc)
void main() {
  if (u_mode > 4.5) {
    // The whole sphere from far out: one gold star. A tight core in a soft
    // halo, and the fine cross a lens puts on any point bright enough.
    float d = length(v_q);
    float core = exp(-d * d * 1100.0) * 1.7 + exp(-d * 30.0) * 0.42 + 0.01 / (d + 0.035);
    float glint = max(exp(-abs(v_q.x) * 190.0) * exp(-abs(v_q.y) * 3.4), exp(-abs(v_q.y) * 190.0) * exp(-abs(v_q.x) * 3.4));
    float m = (core + glint * 0.62) * smoothstep(1.0, 0.55, d) * u_gain;
    o = vec4(mix(vec3(1.0, 0.8, 0.52), vec3(1.0, 0.97, 0.9), smoothstep(0.25, 1.3, core)) * m, 0.0);
    return;
  }
  if (u_mode > 3.5) {
    // The disc and the light close round it, with nothing else: what the shafts are made from.
    float r = length(v_q) * u_span;
    float m = r < 1.0 ? 1.0 : 0.5 * exp(-(r - 1.0) * 1.6) + 0.04 / (r * r);
    m *= smoothstep(u_span, u_span * 0.6, r);
    o = vec4(vec3(1.0, 0.92, 0.78) * m * u_gain, 0.0);
    return;
  }
  if (u_mode > 2.5) {
    // A thin horizontal streak, the way a bright source smears across an anamorphic lens.
    float x = abs(v_q.x), y = abs(v_q.y);
    float s = exp(-y * 9.0) * (1.0 - x) * (1.0 - x) / (1.0 + x * 14.0);
    o = vec4(vec3(0.62, 0.74, 1.0) * s * u_gain, 0.0);
    return;
  }
  if (u_mode > 1.5) {
    float r2 = dot(v_q, v_q);
    if (r2 > 1.0) discard;
    float m = pow(1.0 - r2, 1.6) * u_gain;
    o = vec4(vec3(1.0, 0.86, 0.66) * m, 0.0);
    return;
  }
  if (u_mode > 0.5) {
    float r2 = dot(v_q, v_q);
    if (r2 > 1.0) discard;
    float mu = sqrt(1.0 - r2);
    float edge = smoothstep(1.0, 0.94, r2);
    // The photosphere, as a filter would show it: the disc darkening towards the limb, more in
    // blue than in red (so the limb is warmer); granules, the tops of convection cells; the larger
    // supergranulation; sunspots in the two bands either side of the equator; and bright faculae,
    // which show best near the limb. All of it turns with the Sun.
    vec3 n = vec3(v_q, mu);
    float ct = cos(u_turn * 0.3), st = sin(u_turn * 0.3);
    vec3 m = vec3(ct * n.x + st * n.z, n.y, -st * n.x + ct * n.z);
    vec3 ld = vec3(1.0) - vec3(0.44, 0.58, 0.72) * (1.0 - mu) - vec3(0.2, 0.17, 0.12) * (1.0 - mu * mu);
    float gran = fbm3(m * 30.0 + vec3(u_turn * 0.4), 3);
    float sup = fbm3(m * 7.0 + 3.0, 3);
    float lat = abs(m.y);
    float band = smoothstep(0.1, 0.2, lat) * (1.0 - smoothstep(0.36, 0.5, lat));
    float spot = fbm3(m * 4.6 + 11.0, 4);
    float umbra = smoothstep(0.75, 0.79, spot) * band, penumbra = smoothstep(0.67, 0.75, spot) * band;
    float faculae = smoothstep(0.58, 0.72, fbm3(m * 9.0 + 5.0, 3)) * pow(1.0 - mu, 1.4) * 0.3;
    float I = (0.93 + 0.16 * (gran - 0.5) + 0.07 * (sup - 0.5)) * (1.0 - 0.42 * penumbra - 0.45 * umbra) + faculae;
    vec3 hot = vec3(1.0, 0.86, 0.66) * ld * I * 0.9;
    // u_gain brings the disc up with its light when the page opens, so it is never a bare white circle;
    // and it comes up the way a hot thing does, through ember and gold, not through grey.
    vec3 warm = mix(vec3(1.0, 0.5, 0.18), vec3(1.0), smoothstep(0.15, 1.0, u_gain));
    o = vec4(hot * warm * edge * u_gain, edge * u_gain);
    return;
  }
  float r = length(v_q) * u_span;
  if (r < 0.98 && u_fill < 0.5) discard;
  r = max(r, 1.0);
  // Light scattered close to the limb, falling off fast, plus a wide faint halo.
  float glow = 0.82 * exp(-(r - 1.0) * 1.9) + 0.3 / (r * r) + 0.02 / r;
  // Shafts: sunlight in the dust between the Sun and the swarm, cut into
  // beams by whatever stands in its way. As the sphere closes they thin.
  float a = atan(v_q.y, v_q.x) + u_turn;
  float n = 0.5 + 0.5 * sin(a * 5.0 + 1.3) * sin(a * 9.0 + 4.1);
  n = n * 0.6 + 0.4 * (0.5 + 0.5 * sin(a * 23.0 + 0.7) * sin(a * 13.0 + 2.9));
  float shafts = pow(n, mix(2.4, 7.0, u_dim)) * (0.5 / pow(r, 0.85)) * smoothstep(1.0, 2.6, r);
  // The corona: streamers drawn out along the field lines, as an eclipse shows them.
  float ca = atan(v_q.y, v_q.x);
  float streams = fbm3(vec3(cos(ca) * 2.6, sin(ca) * 2.6, r * 0.07 + u_turn * 0.02), 4);
  glow += pow(streams, 3.0) * 1.1 * exp(-(r - 1.0) * 0.75) * smoothstep(1.0, 1.15, r);
  float halo = exp(-pow((r - 4.6) / 0.16, 2.0)) * 0.09 + exp(-pow((r - 8.4) / 0.3, 2.0)) * 0.035;
  float edge = smoothstep(u_span, u_span * 0.45, r);
  float m = (glow * (1.0 - 0.8 * u_dim) + shafts * (1.0 - 0.45 * u_dim) + halo * (1.0 - 0.6 * u_dim)) * edge * u_gain;
  o = vec4(mix(vec3(1.0, 0.93, 0.8), vec3(1.0, 0.8, 0.5), smoothstep(1.0, 4.5, r)) * m, 0.0);
}`;

// ---- collectors: one oriented hexagon each, facing the Sun, on its own orbit ----
const VS_SWARM = HEAD + `
in vec2 a_q; // corner of the panel
in vec4 a_c; // ring, slot 0..1, random, build order 0..1
in vec2 a_j; // small offsets: along the radius and out of the ring's plane
uniform vec3 u_cam;
uniform float u_scale; // pixels per AU at unit distance
uniform float u_building; // 0 at rest, 1 while collectors are going up
out vec2 v_q; out float v_face; out float v_fresh; out float v_seed; out float v_glint; out float v_far; out float v_px; out float v_back;
out float v_spec; out float v_mat;
void main() {
  float k = a_c.x;
  float fam = floor(k / ${RINGS / 3}.0), j = k - fam * ${RINGS / 3}.0;
  float inc = fam < 0.5 ? 0.49 : (fam < 1.5 ? 1.01 : 1.5);
  float node = j / ${RINGS / 3}.0 * TAU + fam * 0.11;
  vec3 U = vec3(cos(node), 0.0, sin(node));
  vec3 V = vec3(-sin(node) * cos(inc), sin(inc), cos(node) * cos(inc));
  float r = 1.0 + 0.022 * (k / ${RINGS - 1}.0 * 2.0 - 1.0) + a_j.x;
  // Kepler, with the Sun's pull reduced by light pressure on the foil.
  float ang = TAU * a_c.y + u_time * TAU * ${Math.sqrt(1 - BETA).toFixed(5)} / pow(r, 1.5);
  vec3 p = r * (cos(ang) * U + sin(ang) * V) + cross(U, V) * a_j.y;
  if (a_c.w > u_p) { gl_Position = vec4(3.0, 3.0, 3.0, 1.0); return; }
  // Every panel faces the Sun, give or take the few degrees each one is steered by to keep its station.
  float s1 = fract(a_c.z * 13.7), s2 = fract(a_c.z * 29.3), s3 = fract(a_c.z * 7.31);
  vec3 o1 = normalize(cos(ang) * V - sin(ang) * U), o2 = cross(-normalize(p), o1);
  vec3 n = normalize(-normalize(p) + o1 * (s1 - 0.5) * 0.14 + o2 * (s2 - 0.5) * 0.14);
  // And each is turned about its own axis, and built to one of a few sizes.
  float roll = s3 * TAU;
  vec3 t1 = normalize(cross(n, o2)) * cos(roll) + o2 * sin(roll);
  t1 = normalize(t1 - n * dot(t1, n));
  vec3 t2 = cross(n, t1);
  float size = 0.62 + 0.62 * fract(a_c.z * 53.1);
  vec4 centre = u_proj * u_view * vec4(p, 1.0);
  // Far panels would vanish below a pixel; they are held at a glint's size instead.
  float px = ${HEX} * u_scale / max(centre.w, 0.02);
  float grow = max(1.0, 1.15 * u_px / px);
  // A collector goes up furled and turned, and opens flat as the front moves on past it.
  // (One close to the camera takes a good deal longer over it: a panel eighty pixels across cannot just appear.)
  v_fresh = smoothstep(u_p - mix(0.012, 0.07, smoothstep(6.0, 48.0, px / u_px)), u_p, a_c.w) * u_building;
  float open = 1.0 - v_fresh, turn = v_fresh * 2.1;
  vec2 c = mat2(cos(turn), sin(turn), -sin(turn), cos(turn)) * a_q * mix(0.16, 1.0, open * open * (3.0 - 2.0 * open));
  gl_Position = u_proj * u_view * vec4(p + (c.x * t1 + c.y * t2) * ${HEX} * grow * size, 1.0);
  v_q = a_q;
  v_px = px * grow;
  vec3 out_ = normalize(u_cam - p);
  v_face = dot(n, out_); // above zero we see the sunlit side
  // The foil is a mirror: what the camera sees of the Sun in it.
  vec3 L = -normalize(p);
  // (Only on panels seen large enough to tell apart: on a far sphere of tiny panels a glint would flicker from frame to frame.)
  v_spec = pow(max(0.0, dot(reflect(-L, n), out_)), 180.0) * smoothstep(2.5, 9.0, px / u_px);
  // What it is made of: a solar cell, gold foil, or aluminised film.
  v_mat = fract(a_c.z * 31.7);
  // How nearly this panel stands on the line from the camera to the Sun.
  v_back = pow(max(0.0, dot(-out_, normalize(-u_cam))), 12.0);
  v_seed = a_c.z;
  // Glints are for panels seen large; far off, a field of them would only twinkle.
  v_glint = pow(max(0.0, sin(u_time * (5.0 + 11.0 * a_c.z) + a_c.z * 91.0)), 140.0) * mix(0.22, 1.0, smoothstep(3.0, 10.0, px / u_px));
  v_far = mix(1.0, 0.86, smoothstep(0.8, 3.2, centre.w));
}`;
const FS_PANEL = FRAG_HEAD + `
in vec2 v_q; in float v_face; in float v_fresh; in float v_seed; in float v_glint; in float v_far; in float v_px; in float v_back;
in float v_spec; in float v_mat;
uniform float u_heat;
uniform float u_emit; // 1: write only the light this panel gives off, for the shafts and bloom
void main() {
  // A hexagon with two flat sides across the orbit, so neighbours on a ring meet edge to edge.
  vec2 a = abs(v_q);
  float h = max(a.y * 0.5 + a.x * 0.8660254, a.y);
  float aa = fwidth(h) * 1.4;
  float alpha = 1.0 - smoothstep(0.86 - aa, 0.86, h);
  if (alpha < 0.03) discard;
  if (u_emit > 0.5) {
    // The sunlit face throws light back across the sphere; the back only stands in the way.
    vec3 e = v_face > 0.0 ? vec3(1.0, 0.8, 0.5) * (0.07 + 0.15 * smoothstep(0.0, 0.6, v_face)) : vec3(0.0);
    o = vec4(e, alpha);
    return;
  }
  // Seen large, a panel shows its frame and the six gores of foil meeting at the hub.
  float detail = smoothstep(5.0, 16.0, v_px);
  float frame = smoothstep(0.74, 0.80, h) * detail;
  float rad = length(v_q);
  float spoke = (1.0 - smoothstep(0.0, 0.03, abs(sin(atan(v_q.y, v_q.x) * 3.0)) * rad)) * smoothstep(0.08, 0.16, rad) * detail;
  float hub = (1.0 - smoothstep(0.05, 0.08, rad)) * detail;
  vec3 col;
  if (v_face > 0.0) {
    // The sunlit side. Most of the swarm is solar cells, dark blue under a grid of
    // contacts; the rest is gold foil and aluminised film. All of it is glossy, so
    // what decides how bright a panel looks is how nearly it shows the camera the Sun.
    float sheen = 0.86 + 0.14 * (v_q.x * 0.55 - v_q.y * 0.83);
    vec3 base;
    if (v_mat < 0.6) {
      float grid = max(1.0 - smoothstep(0.0, 0.05, abs(fract(v_q.x * 5.0) - 0.5) * 2.0 - 0.9), 1.0 - smoothstep(0.0, 0.05, abs(fract(v_q.y * 5.0) - 0.5) * 2.0 - 0.9)) * detail;
      base = mix(vec3(0.05, 0.075, 0.14), vec3(0.11, 0.13, 0.2), v_seed) + vec3(0.32, 0.3, 0.28) * grid * 0.35;
      base += vec3(0.85, 0.72, 0.5) * 0.07; // the Sun's light scattered off the glass
    } else if (v_mat < 0.9) {
      base = mix(vec3(0.78, 0.55, 0.26), vec3(0.95, 0.76, 0.42), v_seed) * 0.58;
    } else {
      base = mix(vec3(0.62, 0.62, 0.6), vec3(0.8, 0.78, 0.72), v_seed) * 0.4;
    }
    col = base * sheen;
    col *= 1.0 - 0.42 * frame - 0.22 * spoke - 0.5 * hub;
    vec3 sunTint = v_mat < 0.6 ? vec3(1.0, 0.95, 0.88) : (v_mat < 0.9 ? vec3(1.0, 0.82, 0.55) : vec3(1.0, 0.97, 0.92));
    col += sunTint * (v_spec * 2.4 + v_glint * 1.3);
    col *= mix(0.6, 1.0, smoothstep(0.0, 0.5, v_face)); // dimmer seen edge-on
  } else {
    // The back: almost black, its frame and seams catching a little starlight.
    col = vec3(0.006, 0.008, 0.013) + vec3(0.05, 0.062, 0.095) * frame + vec3(0.016, 0.02, 0.032) * spoke;
    // What the swarm collects it must shed: as it closes, the outside holds a dull ember of waste heat.
    col += vec3(0.075, 0.017, 0.006) * u_heat * (0.55 + 0.45 * v_seed) * (1.0 - 0.5 * frame);
    // Close in front of the Sun, the rim of a panel catches its light.
    col += vec3(1.0, 0.8, 0.5) * smoothstep(0.7, 0.85, h) * detail * v_back * 0.9;
  }
  col = mix(col, vec3(0.62, 0.74, 1.0) * 1.3, v_fresh * 0.9);
  o = vec4(col * v_far, alpha);
}`;
const FS_DOT = FRAG_HEAD + `
in vec3 v_c; in float v_a;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float m = smoothstep(0.5, 0.18, d) * v_a;
  o = vec4(v_c * m, m);
}`;

// ---- rocks and planets: little lit spheres, so near ones show phases ----
const VS_ROCK = HEAD + `
in vec4 a_e1; // a, e, inclination, node
in vec4 a_e2; // argument of perihelion, mean anomaly at t=0, size, random
in vec4 a_e3; // colour rgb, kind (0 belt rock, 1 keeps forever, 2 planet)
uniform float u_far; // how far out the camera is, 0 to 1
out vec3 v_l; out vec3 v_c; out float v_seed; out float v_px;
void main() {
  float M = a_e2.y + u_time * TAU / pow(a_e1.x, 1.5);
  vec3 p = kepler(a_e1.x, a_e1.y, a_e1.z, a_e1.w, a_e2.x, M);
  vec4 pv = u_view * vec4(p, 1.0);
  vec4 clip = u_proj * pv;
  // The belt is the quarry: it thins as the swarm fills.
  if (a_e3.w < 0.5 && a_e2.w < u_p * 0.82) { gl_Position = vec4(3.0, 3.0, 3.0, 1.0); gl_PointSize = 0.0; return; }
  gl_Position = clip;
  v_px = clamp(u_px * a_e2.z * 3.6 / clip.w, 1.3 * u_px, a_e3.w > 0.5 ? 40.0 : 15.0 * u_px);
  gl_PointSize = v_px;
  v_l = normalize((u_view * vec4(0.0, 0.0, 0.0, 1.0)).xyz - pv.xyz);
  // From far out a rock is far less than a pixel, and a pixel's worth of light is too much for it. The planets keep theirs.
  v_c = a_e3.rgb * (a_e3.w > 1.5 ? 1.0 : 1.0 - 0.82 * u_far);
  v_seed = a_e2.w * 61.0;
}`;
const FS_ROCK = FRAG_HEAD + `
in vec3 v_l; in vec3 v_c; in float v_seed; in float v_px;
uniform float u_fade; // the Kuiper belt is too dim to see from the inner system; it comes up on the way out
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  q.y = -q.y;
  float r = length(q);
  // Large rocks are not round.
  float ang = atan(q.y, q.x);
  float lumpy = smoothstep(4.0, 14.0, v_px);
  float rim = 1.0 - lumpy * (0.13 + 0.07 * sin(3.0 * ang + v_seed) + 0.05 * sin(5.0 * ang + v_seed * 1.7) + 0.03 * sin(9.0 * ang + v_seed * 0.6));
  if (r > rim) discard;
  vec2 s = q / rim;
  vec3 n = vec3(s, sqrt(max(0.0, 1.0 - dot(s, s))));
  float lam = max(dot(n, v_l), 0.0);
  // A little grain, so a big rock is not a billiard ball.
  float grain = 0.86 + 0.14 * sin(s.x * 9.0 + v_seed) * sin(s.y * 11.0 - v_seed * 0.7);
  // Small rocks are a soft dot; large ones get a crisp edge.
  float edge = v_px < 4.0 ? smoothstep(1.0, 0.25, r) : smoothstep(rim, rim - 2.2 / v_px, r);
  float wrap = clamp((dot(n, v_l) + 0.42) / 1.42, 0.0, 1.0);
  o = vec4(v_c * (0.085 + 1.15 * wrap * wrap * grain) * edge, edge) * u_fade;
}`;

// ---- tugs: cargo on Hohmann transfers from the belt down to 1 AU, with a short wake ----
const VS_TUG = HEAD + `
in vec4 a_t1; // aphelion (AU), longitude of the transfer, inclination, phase offset
in vec2 a_t2; // wake index 0..n, random
uniform float u_work; // how busy the build is, 0..1
out vec3 v_c; out float v_a;
void main() {
  float ra = a_t1.x;
  float a = 0.5 * (ra + 1.0), e = (ra - 1.0) / (ra + 1.0);
  float half_trip = 0.5 * pow(a, 1.5); // years, aphelion to perihelion
  float s = fract(u_time / half_trip + a_t1.w) - a_t2.x * 0.0026;
  if (a_t2.y > u_work || s < 0.0) { gl_Position = vec4(3.0, 3.0, 3.0, 1.0); gl_PointSize = 0.0; return; }
  vec3 p = kepler(a, e, a_t1.z, 0.0, a_t1.y, 3.14159265 * (1.0 + s));
  vec4 clip = u_proj * u_view * vec4(p, 1.0);
  gl_Position = clip;
  float wake = 1.0 - a_t2.x / 14.0;
  gl_PointSize = u_px * (0.9 + 0.9 * wake * wake) * clamp(4.0 / clip.w, 0.7, 1.9);
  // Fade in on departure and out on arrival.
  float ends = smoothstep(0.0, 0.05, s) * smoothstep(1.0, 0.94, s);
  v_c = vec3(0.93, 0.76, 0.44);
  v_a = wake * wake * ends * 0.8;
}`;

// ---- 16 Psyche: a real body, lit from behind by the Sun and from above its pit by floodlights ----
const VS_BIG = HEAD + `
in vec3 a_p; in vec3 a_n; in vec2 a_h; // in the rock's own frame: position and normal; height, and depth into the pit
uniform mat3 u_turn; // the rock's frame to the world's
uniform vec3 u_at; uniform float u_size;
out vec3 v_n; out vec3 v_o; out vec3 v_w; out vec2 v_h;
void main() {
  v_w = u_at + u_turn * a_p * u_size;
  gl_Position = u_proj * u_view * vec4(v_w, 1.0);
  v_n = u_turn * a_n; v_o = a_p; v_h = a_h;
}`;
const FS_BIG = FRAG_HEAD + NOISE + `
in vec3 v_n; in vec3 v_o; in vec3 v_w; in vec2 v_h;
uniform mat3 u_turn;
uniform vec3 u_cam;
uniform vec3 u_lamps[4]; // the floodlights standing in the pit, world
uniform vec3 u_fill; // where a little light from the camera's side comes from, world
uniform float u_size;
uniform float u_p;
uniform float u_shade; // 0: black, to stand in the way of light and nothing more
void main() {
  if (u_shade < 0.5) { o = vec4(0.0, 0.0, 0.0, 1.0); return; }
  // Grain finer than the mesh: the slope of a noise field leans the normal.
  vec3 q = v_o * 12.0;
  float g = fbm3(q, 3);
  vec3 lean = vec3(fbm3(q + vec3(0.08, 0.0, 0.0), 3), fbm3(q + vec3(0.0, 0.08, 0.0), 3), fbm3(q + vec3(0.0, 0.0, 0.08), 3)) - g;
  vec3 flat_ = normalize(v_n);
  vec3 n = normalize(flat_ - u_turn * lean * 4.5);
  // Metal-rich rock, mottled; where the pit has been cut, the fresh face is brighter and bluer.
  float cut = smoothstep(0.0, 0.1, v_h.y);
  vec3 ground = mix(vec3(0.6, 0.58, 0.55), vec3(0.74, 0.77, 0.84), cut) * (0.36 + 0.34 * fbm3(v_o * 3.1 + 2.0, 4) + 0.14 * g);
  vec3 L = normalize(-v_w), V = normalize(u_cam - v_w);
  // With the swarm up, the light no longer comes from a point but from a lantern
  // an astronomical unit in radius, reaching some twenty degrees either side of
  // the Sun from here. It lights the rock that much further round.
  float wide = u_p / length(v_w);
  float mu0 = clamp((dot(n, L) + wide) / (1.0 + wide), 0.0, 1.0), mu = max(dot(n, V), 0.0);
  // Low ground is in the shadow of the high ground beside it well before the light leaves it.
  float shadow = smoothstep(-0.05, 0.13, dot(flat_, L) + wide + v_h.x * 0.9 - v_h.y * 0.2);
  // An airless, dusty surface is bright wherever it is lit at all, so a thin crescent is a bright one.
  float sunlit = shadow * 2.0 * mu0 / (mu0 + mu + 0.1);
  // What gets out has come through the gaps in gold foil: less of it, and warmer.
  vec3 sun = mix(vec3(1.0, 0.95, 0.86), vec3(1.0, 0.77, 0.47), u_p) * mix(3.4, 2.4, u_p);
  // Floodlights: three sodium, one white. Each lights what faces it, and falls off fast.
  vec3 flood = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    vec3 to = u_lamps[i] - v_w;
    flood += (i == 3 ? vec3(0.8, 0.9, 1.0) : vec3(1.0, 0.7, 0.36)) * max(dot(n, normalize(to)), 0.0) * 0.022 / (0.007 + dot(to, to) / (u_size * u_size));
  }
  float fill = max(dot(n, u_fill), 0.0);
  vec3 col = ground * (sun * sunlit + flood + vec3(0.7, 0.8, 1.0) * fill * 0.13);
  o = vec4(col, 1.0);
}`;

const VS_LAMP = HEAD + `
in vec4 a_l; // in the rock's frame, and kind: 0 work lamp, 1 beacon
in float a_ph;
uniform mat3 u_turn; uniform vec3 u_at; uniform float u_size;
uniform float u_lit; // the quarry's lights go out, from far off, before the rock itself is lost
out vec3 v_c; out float v_a;
void main() {
  gl_Position = u_proj * u_view * vec4(u_at + u_turn * a_l.xyz * u_size, 1.0);
  bool beacon = a_l.w > 0.5;
  gl_PointSize = u_px * (beacon ? 3.4 : 2.3) * clamp(0.8 / gl_Position.w, 0.75, 2.2);
  v_c = beacon ? vec3(0.49, 0.6, 1.0) : vec3(1.0, 0.83, 0.54);
  v_a = (beacon ? 0.25 + 0.75 * step(0.84, fract(u_time * 9.0 + a_ph)) : 0.8 + 0.2 * sin(u_time * 160.0 + a_ph * 40.0)) * u_lit;
}`;
// Dust over the workings, lit from below by the floodlights: one soft sheet of light facing the camera.
const VS_HAZE = HEAD + `
in vec2 a_q;
uniform vec3 u_at; uniform float u_size;
out vec2 v_q;
void main() {
  vec4 c = u_view * vec4(u_at, 1.0);
  c.xy += a_q * u_size;
  gl_Position = u_proj * c;
  v_q = a_q;
}`;
const FS_HAZE = FRAG_HEAD + `
in vec2 v_q;
uniform float u_gain;
void main() {
  float d = dot(v_q, v_q);
  o = vec4(vec3(1.0, 0.74, 0.42) * exp(-d * 4.5) * (1.0 - smoothstep(0.6, 1.0, d)) * u_gain, 0.0);
}`;
// Loaded tugs: up out of the pit, then over and down towards the swarm, each with a short wake.
const VS_HAUL = HEAD + `
in vec4 a_t; // phase, place in the wake, two offsets from the lane
uniform vec3 u_from; uniform vec3 u_up; uniform vec3 u_side; uniform vec3 u_to;
uniform float u_size; uniform float u_lit;
out vec3 v_c; out float v_a;
void main() {
  float s = fract(u_time * 1.3 + a_t.x) - a_t.y * 0.007;
  if (s < 0.0) { gl_Position = vec4(3.0, 3.0, 3.0, 1.0); gl_PointSize = 0.0; return; }
  vec3 along = u_to - u_from;
  // Straight up to clear the pit, out sideways to clear the rock, and then the long fall sunward.
  vec3 p = u_from + u_up * u_size * 1.1 * (1.0 - exp(-s * 14.0)) + u_side * u_size * 2.4 * (1.0 - exp(-s * 5.0)) + along * s * s;
  p += (normalize(cross(u_up, along)) * a_t.z + u_up * a_t.w) * u_size * 0.16 * smoothstep(0.0, 0.04, s);
  gl_Position = u_proj * u_view * vec4(p, 1.0);
  float wake = 1.0 - a_t.y / ${HAUL_WAKE}.0;
  gl_PointSize = u_px * mix(2.8, 1.1, s) * (0.55 + 0.45 * wake) * clamp(0.8 / gl_Position.w, 0.75, 2.2);
  // Engines lit for the burn: white at the tug, blue down its wake, so the lane reads against the gold behind it.
  v_c = mix(vec3(0.5, 0.64, 1.0), vec3(1.0, 0.97, 0.9), wake * wake);
  v_a = smoothstep(0.0, 0.04, s) * (1.0 - s * s) * wake * wake * u_lit;
}`;

// ---- the beam: once the sphere is closed, all of it leaves through the pole ----
const VS_BEAM = HEAD + `
in vec2 a_q;
uniform vec4 u_ends; // ndc xy of both ends
uniform float u_wide; uniform float u_aspect; uniform float u_len;
out vec2 v_q;
void main() {
  vec2 a = u_ends.xy, b = u_ends.zw;
  vec2 d = normalize((b - a) * vec2(u_aspect, 1.0));
  vec2 n = vec2(-d.y, d.x);
  // The quad starts a little behind the foot, so the flare there is whole.
  float t = mix(-u_wide, u_len, a_q.y * 0.5 + 0.5);
  gl_Position = vec4(a + (d * t + n * a_q.x * u_wide) / vec2(u_aspect, 1.0), 0.0, 1.0);
  v_q = vec2(a_q.x, t);
}`;
const FS_BEAM = FRAG_HEAD + `
in vec2 v_q;
uniform float u_gain; uniform float u_wide; uniform float u_flow;
uniform float u_k; // the sphere's size on screen, against its size when the cover ends
uniform float u_pulse; // how far up the beam a pulse has got, in the beam's own units; below zero, none
uniform vec3 u_thin; // the quad's half-width in device px; the core's true half-width in the quad's units; how fast the beam falls off along its length
void main() {
  float x = abs(v_q.x), t = v_q.y;
  // A tight white core, the glow close round it, and a wide faint skirt. From
  // far out the true core is less than a pixel wide: it is then drawn a
  // hairline wide and as much dimmer, so it thins out and never breaks up.
  float px = x * u_thin.x, sigma = max(0.0345 * u_thin.y * u_thin.x, 0.6), share = min(1.0, 0.0345 * u_thin.y * u_thin.x / sigma);
  float core = exp(-px * px / (2.0 * sigma * sigma)) * 1.5 * (0.3 + 0.7 * share) + (exp(-x * 19.0) * 0.3 + exp(-x * 6.0) * 0.07) * share;
  core *= exp(-max(t, 0.0) * u_thin.z);
  // Light does not come out evenly: it shivers, and the shiver runs outward.
  core *= 0.86 + 0.14 * sin(t / u_k * 46.0 - u_flow) * sin(t / u_k * 17.0 - u_flow * 0.37 + 1.3);
  // A pulse: a packet of light with a hard front and a long tail, swelling the beam as it passes.
  float lag = (u_pulse - t) / u_k;
  float packet = step(0.0, u_pulse) * smoothstep(-0.012, 0.0, lag) * exp(-max(lag, 0.0) * 7.5);
  core = core * (1.0 + 2.6 * packet) + exp(-x * x * 34.0) * packet * 0.75;
  // Where it leaves the sphere it is hot enough to flare.
  vec2 d = vec2(v_q.x * u_wide, t) / u_k;
  float foot = exp(-dot(d, d) / 0.0011) * 1.1 + exp(-dot(d, d) / 0.008) * 0.2;
  foot *= 1.0 + 1.6 * step(0.0, u_pulse) * exp(-max(u_pulse, 0.0) / u_k * 9.0);
  vec3 c = mix(vec3(0.62, 0.76, 1.0), vec3(1.0), smoothstep(0.25, 1.4, core + foot));
  // Nothing at the quad's own edges.
  float inside = smoothstep(1.0, 0.55, x) * smoothstep(-u_wide, -u_wide * 0.4, t);
  o = vec4(c * (core * smoothstep(0.0, 0.03 * u_k, t) + foot) * inside * u_gain, 0.0);
}`;

// ---- orbits and the AU grid: hairlines in the ecliptic ----
const VS_LINE = HEAD + `
in vec3 a_p;
void main() { gl_Position = u_proj * u_view * vec4(a_p, 1.0); }`;
const FS_LINE = FRAG_HEAD + `
uniform vec4 u_col;
void main() { o = u_col; }`;

// ---- light that leaves: the scene's light sources alone, drawn small, then
// smeared outward from the Sun into shafts and blurred into bloom, and added back ----
// Sunlight in the dust: each pixel gathers the light along its line to the Sun,
// so anything standing in that line cuts a shadow that runs outward from it.
const FS_SHAFT = FRAG_HEAD + `
in vec2 v_uv;
uniform sampler2D u_src;
uniform vec2 u_sun; // the Sun, uv
uniform float u_reach; // how far towards the Sun this pass looks, as a fraction of the way
uniform float u_decay;
void main() {
  vec2 step = (u_sun - v_uv) * (u_reach / 16.0);
  vec2 c = v_uv + step * 0.5;
  vec3 acc = vec3(0.0);
  float w = 1.0, sum = 0.0;
  for (int i = 0; i < 16; i++) {
    acc += texture(u_src, c).rgb * w;
    sum += w;
    w *= u_decay;
    c += step;
  }
  o = vec4(acc / sum, 1.0);
}`;
const FS_DOWN = FRAG_HEAD + `
in vec2 v_uv;
uniform sampler2D u_src;
uniform vec2 u_texel; // one texel of the source
void main() {
  vec2 h = u_texel * 0.5;
  vec3 s = texture(u_src, v_uv).rgb * 4.0;
  s += texture(u_src, v_uv - h).rgb + texture(u_src, v_uv + h).rgb;
  s += texture(u_src, v_uv + vec2(h.x, -h.y)).rgb + texture(u_src, v_uv - vec2(h.x, -h.y)).rgb;
  o = vec4(s / 8.0, 1.0);
}`;
const FS_UP = FRAG_HEAD + `
in vec2 v_uv;
uniform sampler2D u_src;
uniform vec2 u_texel;
uniform float u_gain;
void main() {
  vec2 h = u_texel * 0.5;
  vec3 s = texture(u_src, v_uv + vec2(-h.x * 2.0, 0.0)).rgb + texture(u_src, v_uv + vec2(h.x * 2.0, 0.0)).rgb;
  s += texture(u_src, v_uv + vec2(0.0, h.y * 2.0)).rgb + texture(u_src, v_uv + vec2(0.0, -h.y * 2.0)).rgb;
  s += 2.0 * (texture(u_src, v_uv + vec2(-h.x, h.y)).rgb + texture(u_src, v_uv + vec2(h.x, h.y)).rgb);
  s += 2.0 * (texture(u_src, v_uv + vec2(h.x, -h.y)).rgb + texture(u_src, v_uv + vec2(-h.x, -h.y)).rgb);
  o = vec4(s / 12.0 * u_gain, 1.0);
}`;
const FS_MIX = FRAG_HEAD + `
in vec2 v_uv;
uniform sampler2D u_shafts;
uniform sampler2D u_bloom;
uniform vec2 u_gain; // shafts, bloom
void main() {
  vec3 c = texture(u_shafts, v_uv).rgb * u_gain.x + texture(u_bloom, v_uv).rgb * u_gain.y;
  // Faint light is the colour of the foil it came off; only the strongest reaches white.
  float l = max(c.r, max(c.g, c.b));
  c *= mix(vec3(1.0, 0.8, 0.54), vec3(1.0), smoothstep(0.04, 0.85, l));
  // Under one level of noise, so it fades into the dark without banding.
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  o = vec4(c + n / 255.0, 0.0);
}`;

function compile(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const mk = (type: number, src: string) => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? "shader");
    return sh;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link");
  const u: Record<string, WebGLUniformLocation | null> = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < n; i++) {
    const name = gl.getActiveUniform(p, i)!.name.replace(/\[0\]$/, "");
    u[name] = gl.getUniformLocation(p, name);
  }
  return { p, u };
}

/** Planet elements (J2000, rounded): a AU, e, inclination rad, node rad, argument of perihelion rad, mean anomaly rad. */
const PLANETS = {
  earth: { a: 1.0, e: 0.0167, i: 0, node: 0, peri: 1.796, M: 6.24, size: 1.7, col: [0.42, 0.56, 1.0] },
  mars: { a: 1.524, e: 0.0934, i: 0.0323, node: 0.865, peri: 5.0, M: 0.34, size: 1.35, col: [0.86, 0.5, 0.34] },
  jupiter: { a: 5.203, e: 0.0489, i: 0.0228, node: 1.754, peri: 4.78, M: 0.35, size: 7.5, col: [0.86, 0.8, 0.7] },
  // The outer three are only met on the voyage out.
  saturn: { a: 9.537, e: 0.0539, i: 0.0434, node: 1.984, peri: 5.912, M: 5.54, size: 6.3, col: [0.9, 0.82, 0.62] },
  uranus: { a: 19.19, e: 0.0473, i: 0.0135, node: 1.292, peri: 1.692, M: 2.483, size: 3.6, col: [0.62, 0.82, 0.86] },
  neptune: { a: 30.07, e: 0.0086, i: 0.0309, node: 2.3, peri: 4.768, M: 4.536, size: 3.5, col: [0.42, 0.55, 0.95] },
} as const;

function keplerCPU(a: number, e: number, inc: number, node: number, peri: number, M: number, out: Float32Array) {
  let E = M + e * Math.sin(M);
  for (let k = 0; k < 4; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const x = a * (Math.cos(E) - e), y = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(peri), sw = Math.sin(peri), ci = Math.cos(inc), si = Math.sin(inc), cn = Math.cos(node), sn = Math.sin(node);
  const px = cw * x - sw * y, py = sw * x + cw * y;
  out[0] = cn * px - sn * ci * py;
  out[1] = si * py;
  out[2] = sn * px + cn * ci * py;
}

export function mountCosmos(canvas: HTMLCanvasElement, opts: CosmosOptions): Cosmos | null {
  // Multisampling lets panel edges be antialiased through alpha-to-coverage while still writing depth.
  // (A software renderer could draw this, at a few frames a second. Better the still image.)
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, powerPreference: "high-performance", failIfMajorPerformanceCaveat: true });
  if (!gl) return null;
  const rnd = mulberry32(fingerprint(opts.seed));
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd() + 1e-9)) * Math.cos(TAU * rnd());
  const light = !!opts.light;

  type Prog = ReturnType<typeof compile>;
  let prog: Record<"far" | "deep" | "sky" | "sun" | "swarm" | "rock" | "tug" | "line" | "big" | "lamp" | "haze" | "haul" | "beam" | "shaft" | "down" | "up" | "mix", Prog>;
  let paint: Prog;
  try {
    paint = compile(gl, VS_POST, FS_PAINT);
    prog = {
      far: compile(gl, VS_FAR, FS_FAR),
      deep: compile(gl, VS_FAR, FS_DEEP),
      sky: compile(gl, VS_SKY, FS_SKY),
      sun: compile(gl, VS_SUN, FS_SUN),
      swarm: compile(gl, VS_SWARM, FS_PANEL),
      rock: compile(gl, VS_ROCK, FS_ROCK),
      tug: compile(gl, VS_TUG, FS_DOT),
      line: compile(gl, VS_LINE, FS_LINE),
      big: compile(gl, VS_BIG, FS_BIG),
      lamp: compile(gl, VS_LAMP, FS_DOT),
      haze: compile(gl, VS_HAZE, FS_HAZE),
      haul: compile(gl, VS_HAUL, FS_DOT),
      beam: compile(gl, VS_BEAM, FS_BEAM),
      shaft: compile(gl, VS_POST, FS_SHAFT),
      down: compile(gl, VS_POST, FS_DOWN),
      up: compile(gl, VS_POST, FS_UP),
      mix: compile(gl, VS_POST, FS_MIX),
    };
  } catch (err) {
    console.warn("cover: shaders unavailable, showing the still image", err);
    return null;
  }

  /** A vertex array over one interleaved buffer; `layout` is [attribute name, size] in order. */
  function mesh(p: WebGLProgram, data: Float32Array, layout: [string, number][]) {
    const vao = gl!.createVertexArray()!;
    gl!.bindVertexArray(vao);
    gl!.bindBuffer(gl!.ARRAY_BUFFER, gl!.createBuffer());
    gl!.bufferData(gl!.ARRAY_BUFFER, data, gl!.STATIC_DRAW);
    const stride = layout.reduce((n, [, k]) => n + k, 0);
    let off = 0;
    for (const [name, n] of layout) {
      const loc = gl!.getAttribLocation(p, name);
      if (loc >= 0) {
        gl!.enableVertexAttribArray(loc);
        gl!.vertexAttribPointer(loc, n, gl!.FLOAT, false, stride * 4, off * 4);
      }
      off += n;
    }
    gl!.bindVertexArray(null);
    return { vao, count: data.length / stride };
  }
  const QUAD = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

  // ---------- far stars ----------
  const nSky = light ? 3200 : 8200;
  const sky = new Float32Array(nSky * 5);
  for (let i = 0; i < nSky; i++) {
    // Half scattered evenly; half gathered along one great circle, the plane of the galaxy.
    let x: number, y: number, z: number;
    if (rnd() < 0.58) {
      const t = rnd() * TAU, lat = gauss() * (rnd() < 0.5 ? 0.05 : 0.14);
      const bx = Math.cos(t) * Math.cos(lat), by = Math.sin(lat), bz = Math.sin(t) * Math.cos(lat);
      x = bx; y = by * 0.5 - bz * 0.866; z = by * 0.866 + bz * 0.5; // tilted well off the ecliptic
    } else {
      z = rnd() * 2 - 1;
      const t = rnd() * TAU, r = Math.sqrt(1 - z * z);
      x = r * Math.cos(t); y = r * Math.sin(t);
    }
    sky.set([x, y, z, rnd() ** 6.5, rnd()], i * 5);
  }
  const mSky = mesh(prog.sky.p, sky, [["a_s", 4], ["a_t", 1]]);
  const mFar = mesh(prog.far.p, QUAD, [["a_q", 2]]);
  const mDeep = mesh(prog.deep.p, QUAD, [["a_q", 2]]);
  const mSun = mesh(prog.sun.p, QUAD, [["a_q", 2]]);
  const mHaze = mesh(prog.haze.p, QUAD, [["a_q", 2]]);

  // ---------- the galaxy, painted once ----------
  // Its plane is the great circle the stars above were gathered along: these are its axes, with the pole second.
  const GAL = [1, 0, 0, 0, 0.5, 0.866, 0, -0.866, 0.5];
  const skySeed = [rnd() * 40, rnd() * 40, rnd() * 40];
  let galaxy: WebGLTexture | null = null, painted = false;
  /** Paint the strip. It is not needed for the first frames, so it waits until the page is idle. */
  function paintSky() {
    const g = gl!;
    painted = true;
    const gw = light ? 1024 : 2048, gh = gw / 4;
    const tex = g.createTexture()!;
    g.bindTexture(g.TEXTURE_2D, tex);
    g.texStorage2D(g.TEXTURE_2D, 1, g.RGBA8, gw, gh);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.REPEAT);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
    const fb = g.createFramebuffer();
    g.bindFramebuffer(g.FRAMEBUFFER, fb);
    g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, tex, 0);
    if (g.checkFramebufferStatus(g.FRAMEBUFFER) === g.FRAMEBUFFER_COMPLETE) {
      g.viewport(0, 0, gw, gh);
      g.disable(g.BLEND);
      g.disable(g.DEPTH_TEST);
      g.useProgram(paint.p);
      g.uniform3f(paint.u.u_seed, skySeed[0], skySeed[1], skySeed[2]);
      const m = mesh(paint.p, QUAD, [["a_q", 2]]);
      g.bindVertexArray(m.vao);
      g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
      g.bindVertexArray(null);
      g.deleteVertexArray(m.vao);
      galaxy = tex;
    }
    g.bindFramebuffer(g.FRAMEBUFFER, null);
    g.deleteFramebuffer(fb);
    g.deleteProgram(paint.p);
  }
  const mBeam = mesh(prog.beam.p, QUAD, [["a_q", 2]]);
  const mShaft = mesh(prog.shaft.p, QUAD, [["a_q", 2]]);
  const mDown = mesh(prog.down.p, QUAD, [["a_q", 2]]);
  const mUp = mesh(prog.up.p, QUAD, [["a_q", 2]]);
  const mMix = mesh(prog.mix.p, QUAD, [["a_q", 2]]);

  // ---------- swarm ----------
  const total = RINGS * PER;
  const LEAN = [0.49, 1.01, 1.5], FAMILY = RINGS / 3; // the three leans, as in the shader
  const SEG = 160;
  // The planned orbit of each ring, drawn as a hairline while that ring is going up.
  const plans: ReturnType<typeof mesh>[] = [];
  for (let k = 0; k < RINGS; k++) {
    const fam = Math.floor(k / FAMILY), j = k % FAMILY;
    const inc = LEAN[fam], node = (j / FAMILY) * TAU + fam * 0.11;
    const u = [Math.cos(node), 0, Math.sin(node)]; // the line of nodes, in the ecliptic
    const v = [-Math.sin(node) * Math.cos(inc), Math.sin(inc), Math.cos(node) * Math.cos(inc)];
    const r = 1 + 0.022 * ((k / (RINGS - 1)) * 2 - 1); // radii differ, so crossing rings never meet
    const pts = new Float32Array(SEG * 3);
    for (let i = 0; i < SEG; i++) {
      const c = Math.cos((i / SEG) * TAU) * r, d = Math.sin((i / SEG) * TAU) * r;
      pts.set([c * u[0] + d * v[0], c * u[1] + d * v[1], c * u[2] + d * v[2]], i * 3);
    }
    plans.push(mesh(prog.line.p, pts, [["a_p", 3]]));
  }
  const swarm = new Float32Array(total * 6);
  for (let k = 0; k < RINGS; k++)
    for (let j = 0; j < PER; j++) {
      const slot = (j + 0.5) / PER;
      // Rings go up from the ecliptic outwards, a few at a time; each grows both ways from where cargo arrives.
      const order = (k / RINGS) * 0.9 + Math.abs(slot - 0.5) * 2 * 0.1;
      // Alternate panels sit a little higher and lower, lapped like scales, so neighbours never share a plane.
      swarm.set([k, slot, rnd(), Math.min(0.9999, order), (j % 2 ? 0.0032 : -0.0032) + gauss() * 0.0004, gauss() * 0.0008], (k * PER + j) * 6);
    }
  // Shuffled, so that any first share of them is spread evenly over the whole
  // sphere: from far out only a share is drawn. Its own generator, so nothing
  // else the seed decides moves.
  {
    const mix = mulberry32(fingerprint(opts.seed + "/draw-order"));
    const row = new Float32Array(6);
    for (let i = total - 1; i > 0; i--) {
      const j = Math.floor(mix() * (i + 1));
      row.set(swarm.subarray(i * 6, i * 6 + 6));
      swarm.copyWithin(i * 6, j * 6, j * 6 + 6);
      swarm.set(row, j * 6);
    }
  }
  // One quad, drawn once per collector.
  const mSwarm = (() => {
    const g = gl!, pr = prog.swarm.p;
    const vao = g.createVertexArray()!;
    g.bindVertexArray(vao);
    g.bindBuffer(g.ARRAY_BUFFER, g.createBuffer());
    g.bufferData(g.ARRAY_BUFFER, QUAD, g.STATIC_DRAW);
    const q = g.getAttribLocation(pr, "a_q");
    g.enableVertexAttribArray(q);
    g.vertexAttribPointer(q, 2, g.FLOAT, false, 0, 0);
    g.bindBuffer(g.ARRAY_BUFFER, g.createBuffer());
    g.bufferData(g.ARRAY_BUFFER, swarm, g.STATIC_DRAW);
    for (const [name, n, off] of [["a_c", 4, 0], ["a_j", 2, 4]] as const) {
      const loc = g.getAttribLocation(pr, name);
      if (loc < 0) continue;
      g.enableVertexAttribArray(loc);
      g.vertexAttribPointer(loc, n, g.FLOAT, false, 24, off * 4);
      g.vertexAttribDivisor(loc, 1);
    }
    g.bindVertexArray(null);
    return { vao, count: total };
  })();

  // ---------- rocks ----------
  const nBelt = light ? 4200 : 9200, nTroj = light ? 220 : 520;
  const rocks: number[] = [];
  const GAPS = [2.5, 2.82, 2.958, 3.279]; // 3:1, 5:2, 7:3, 2:1 resonances with Jupiter
  for (let i = 0; i < nBelt; i++) {
    let a = 0;
    do a = 2.08 + rnd() * 1.24;
    while (GAPS.some((g) => Math.abs(a - g) < 0.03));
    const e = Math.min(0.3, Math.abs(gauss()) * 0.09);
    const inc = Math.min(0.45, Math.abs(gauss()) * 0.13);
    const size = 0.5 + 3.4 * rnd() ** 7;
    const alb = 0.5 + rnd() * 0.3;
    rocks.push(a, e, inc, rnd() * TAU, rnd() * TAU, rnd() * TAU, size, rnd(), alb, alb * 0.97, alb * 0.92, 0);
  }
  const J = PLANETS.jupiter;
  for (let i = 0; i < nTroj; i++) {
    // Sixty degrees ahead of and behind Jupiter, where its pull and the Sun's balance.
    const lead = (i % 2 ? 1 : -1) * (Math.PI / 3) + gauss() * 0.16;
    const a = J.a + gauss() * 0.05, e = Math.min(0.15, Math.abs(gauss()) * 0.05), inc = Math.min(0.5, Math.abs(gauss()) * 0.16);
    const peri = rnd() * TAU, node = rnd() * TAU;
    const M = J.M + J.peri + J.node + lead - peri - node; // same mean longitude as Jupiter, offset by the lead
    const alb = 0.36 + rnd() * 0.2;
    rocks.push(a, e, inc, node, peri, M, 0.5 + 2.4 * rnd() ** 6, rnd(), alb, alb * 0.95, alb * 0.9, 1);
  }
  for (const pl of Object.values(PLANETS)) rocks.push(pl.a, pl.e, pl.i, pl.node, pl.peri, pl.M, pl.size, 1, ...pl.col, 2);
  const mRock = mesh(prog.rock.p, new Float32Array(rocks), [["a_e1", 4], ["a_e2", 4], ["a_e3", 4]]);

  // ---------- the Kuiper belt: what the voyage out passes through ----------
  // Its real populations, each where Neptune has left it: the plutinos caught
  // in the 3:2 resonance at 39.4 AU, the cold classical belt (flat, round, and
  // red) between 42.5 and 47.5 AU, the hot one stirred up round it, a few
  // twotinos at the 2:1, the cliff at 48 AU where the belt simply stops, and
  // beyond it the scattered disc, flung onto long orbits that still come back
  // to Neptune. Its own generator, so nothing on the cover moves.
  const mKuiper = (() => {
    const kr = mulberry32(fingerprint(opts.seed + "/kuiper"));
    const kg = () => Math.sqrt(-2 * Math.log(1 - kr() + 1e-9)) * Math.cos(TAU * kr());
    const n = light ? 1100 : 2600;
    const out = new Float32Array(n * 12);
    for (let i = 0; i < n; i++) {
      const pick = kr();
      let a: number, e: number, inc: number, red = 0.25;
      if (pick < 0.19) { a = 39.4 + kg() * 0.22; e = Math.min(0.33, 0.1 + Math.abs(kg()) * 0.09); inc = Math.min(0.5, Math.abs(kg()) * 0.2); }
      else if (pick < 0.57) { a = 42.5 + kr() * 5; e = Math.min(0.1, Math.abs(kg()) * 0.035); inc = Math.min(0.09, Math.abs(kg()) * 0.032); red = 0.85; }
      else if (pick < 0.82) { a = 40.5 + kr() * 7.2; e = Math.min(0.22, Math.abs(kg()) * 0.09); inc = Math.min(0.62, Math.abs(kg()) * 0.26); }
      else if (pick < 0.86) { a = 47.8 + kg() * 0.2; e = 0.1 + kr() * 0.2; inc = Math.min(0.4, Math.abs(kg()) * 0.16); }
      else { const q = 33 + kr() * 5; a = 50 + 62 * kr() ** 1.7; e = 1 - q / a; inc = Math.min(0.7, Math.abs(kg()) * 0.3); }
      const alb = 0.34 + kr() * 0.3;
      // Ice, grey to blue; the cold belt redder, as it is.
      const col = [alb * (0.86 + 0.28 * red), alb * (0.9 - 0.06 * red), alb * (1.04 - 0.34 * red)];
      out.set([a, e, inc, kr() * TAU, kr() * TAU, kr() * TAU, 0.45 + 2.2 * kr() ** 5, kr(), ...col, 1], i * 12);
    }
    return mesh(prog.rock.p, out, [["a_e1", 4], ["a_e2", 4], ["a_e3", 4]]);
  })();

  // ---------- tugs ----------
  const nTug = light ? 70 : 150, WAKE = 14;
  const tugs = new Float32Array(nTug * WAKE * 6);
  for (let i = 0; i < nTug; i++) {
    const ra = 2.15 + rnd() * 1.1, lon = rnd() * TAU, inc = gauss() * 0.05, off = rnd(), pick = rnd();
    for (let j = 0; j < WAKE; j++) tugs.set([ra, lon, inc, off, j, pick], (i * WAKE + j) * 6);
  }
  const mTug = mesh(prog.tug.p, tugs, [["a_t1", 4], ["a_t2", 2]]);

  // ---------- 16 Psyche: built in slices, so the page never waits for it ----------
  let rock: { vao: WebGLVertexArrayObject; count: number; lamps: ReturnType<typeof mesh>; masts: Float32Array; pad: number[]; pit: number[]; axis: number[]; a1: number[]; a2: number[] } | null = null;
  const nextRock = rockBuilder(fingerprint(opts.seed), light ? 5 : 6);
  function quarry(budget: number) {
    const r = nextRock(budget);
    if (!r) return false;
    const g = gl!;
    const vao = g.createVertexArray()!;
    g.bindVertexArray(vao);
    g.bindBuffer(g.ARRAY_BUFFER, g.createBuffer());
    g.bufferData(g.ARRAY_BUFFER, r.vertices, g.STATIC_DRAW);
    for (const [name, n, off] of [["a_p", 3, 0], ["a_n", 3, 3], ["a_h", 2, 6]] as const) {
      const loc = g.getAttribLocation(prog.big.p, name);
      if (loc < 0) continue;
      g.enableVertexAttribArray(loc);
      g.vertexAttribPointer(loc, n, g.FLOAT, false, 32, off * 4);
    }
    g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, g.createBuffer());
    g.bufferData(g.ELEMENT_ARRAY_BUFFER, r.indices, g.STATIC_DRAW);
    g.bindVertexArray(null);
    // It turns about an axis thirty degrees off the pit, so the pit swings round but stays on one side.
    const [px, py, pz] = r.pit;
    const side = Math.hypot(py, px) || 1;
    const t = [py / side, -px / side, 0]; // any direction square to the pit
    const axis = [px * 0.866 + t[0] * 0.5, py * 0.866 + t[1] * 0.5, pz * 0.866 + t[2] * 0.5];
    const dot = px * axis[0] + py * axis[1] + pz * axis[2];
    let a1 = [px - axis[0] * dot, py - axis[1] * dot, pz - axis[2] * dot];
    const l = Math.hypot(a1[0], a1[1], a1[2]);
    a1 = a1.map((v) => v / l);
    const a2 = [axis[1] * a1[2] - axis[2] * a1[1], axis[2] * a1[0] - axis[0] * a1[2], axis[0] * a1[1] - axis[1] * a1[0]];
    rock = { vao, count: r.indices.length, lamps: mesh(prog.lamp.p, r.lamps, [["a_l", 4], ["a_ph", 1]]), masts: r.masts, pad: r.pad, pit: r.pit, axis, a1, a2 };
    return true;
  }
  // ---------- stragglers: a few boulders left beside the camera's road, for it to pass ----------
  // Each has a place in the last frame (beside the sphere, on the side away from
  // the words) and a depth in front of the last camera. Three shapes are shared out among them.
  const shapes: { vao: WebGLVertexArrayObject; count: number }[] = [];
  const nextShape = [1, 2, 3].map((k) => rockBuilder(fingerprint(opts.seed + k), 4, false));
  function shape(budget: number) {
    const r = nextShape[shapes.length](budget);
    if (!r) return false;
    const g = gl!;
    const vao = g.createVertexArray()!;
    g.bindVertexArray(vao);
    g.bindBuffer(g.ARRAY_BUFFER, g.createBuffer());
    g.bufferData(g.ARRAY_BUFFER, r.vertices, g.STATIC_DRAW);
    for (const [name, n, off] of [["a_p", 3, 0], ["a_n", 3, 3], ["a_h", 2, 6]] as const) {
      const loc = g.getAttribLocation(prog.big.p, name);
      if (loc < 0) continue;
      g.enableVertexAttribArray(loc);
      g.vertexAttribPointer(loc, n, g.FLOAT, false, 32, off * 4);
    }
    g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, g.createBuffer());
    g.bufferData(g.ELEMENT_ARRAY_BUFFER, r.indices, g.STATIC_DRAW);
    g.bindVertexArray(null);
    shapes.push({ vao, count: r.indices.length });
    return shapes.length === nextShape.length;
  }
  const field: { dx: number; dy: number; depth: number; r: number; axis: number[]; rate: number; phase: number; at: Float32Array; turn: Float32Array; on: boolean }[] = [];
  {
    const ball = F0 / WIDE_R; // the sphere's radius in the last frame, as a fraction of half its height
    for (let tries = 0; tries < 200 && field.length < (light ? 7 : 13); tries++) {
      const th = (rnd() * 2 - 1) * 1.35, rho = ball * (1.12 + 0.8 * rnd());
      const dx = rho * Math.cos(th), dy = rho * Math.sin(th);
      // Clear of the quarry and its name, and of each other.
      if (Math.hypot(dx - 0.46, dy + 0.75) < 0.36 || (dx > 0.4 && Math.abs(dy + 0.75) < 0.16)) continue;
      if (field.some((b) => Math.hypot(b.dx - dx, b.dy - dy) < 0.13)) continue;
      const depth = 0.28 + 1.45 * rnd() ** 1.4;
      const px = 2.6 + 12 * rnd() ** 2.2; // its radius in the last frame, for a frame 900 px high
      const z = rnd() * 2 - 1, t = rnd() * TAU, q = Math.sqrt(1 - z * z);
      field.push({ dx, dy, depth, r: (px * depth) / (F0 * 450), axis: [q * Math.cos(t), q * Math.sin(t), z], rate: (TAU / (16 + 50 * rnd())) * (rnd() < 0.5 ? -1 : 1), phase: rnd() * TAU, at: new Float32Array(3), turn: new Float32Array(9), on: false });
    }
  }

  // Cargo leaving the pit: a dozen tugs, each with a short wake.
  const HAUL = 14;
  const haul = new Float32Array(HAUL * HAUL_WAKE * 4);
  for (let i = 0; i < HAUL; i++) {
    const ph = i / HAUL + rnd() * 0.03, ox = gauss(), oy = gauss();
    for (let j = 0; j < HAUL_WAKE; j++) haul.set([ph, j, ox, oy], (i * HAUL_WAKE + j) * 4);
  }
  const mHaul = mesh(prog.haul.p, haul, [["a_t", 4]]);

  // ---------- hairlines: two orbits and the AU grid ----------
  // `far` is 0 for a line of the inner system, which goes out as the camera
  // leaves, and 1 for one of the outer system, which only comes up then.
  const loops: { m: ReturnType<typeof mesh>; alpha: number; far: number }[] = [];
  const P3 = new Float32Array(3);
  const orbit = (pl: (typeof PLANETS)[keyof typeof PLANETS], alpha: number, far: number, seg = SEG) => {
    const pts = new Float32Array(seg * 3);
    for (let i = 0; i < seg; i++) {
      // Even steps of mean anomaly crowd the points a little at aphelion; on orbits this round it does not show.
      keplerCPU(pl.a, pl.e, pl.i, pl.node, pl.peri, (i / seg) * TAU, P3);
      pts.set(P3, i * 3);
    }
    loops.push({ m: mesh(prog.line.p, pts, [["a_p", 3]]), alpha, far });
  };
  const ring = (r: number, alpha: number, far: number, seg = SEG) => {
    const pts = new Float32Array(seg * 3);
    for (let i = 0; i < seg; i++) pts.set([r * Math.cos((i / seg) * TAU), 0, r * Math.sin((i / seg) * TAU)], i * 3);
    loops.push({ m: mesh(prog.line.p, pts, [["a_p", 3]]), alpha, far });
  };
  orbit(PLANETS.mars, 0.17, 0);
  orbit(PLANETS.jupiter, 0.17, 0.5); // Jupiter's is seen from both
  for (const r of [2, 3, 4]) ring(r, 0.06, 0);
  // Long arcs cross the whole frame, so they are cut finer.
  orbit(PLANETS.saturn, 0.15, 1, 240);
  orbit(PLANETS.uranus, 0.13, 1, 320);
  orbit(PLANETS.neptune, 0.13, 1, 400);
  // The scale out here, in powers of ten: 10 AU and 100 AU.
  ring(10, 0.045, 1, 240);
  ring(100, 0.045, 1, 480);
  ring(1000, 0.04, 1, 480);

  // ---------- camera ----------
  const view = new Float32Array(16), proj = new Float32Array(16);
  const viewWas = new Float32Array(16); // the view one frame ago, for the stars' motion
  let smeared = 0; // the shutter's smear, eased
  let deepWarm = false;
  let resting = false; // something opaque covers the window: the scene is not drawn
  let fresh = true; // nothing to compare the first frame with, or the frame after a cut
  const F = F0;
  // The shot: from just outside the shell, above its first band, back to
  // beyond the belt on 16 Psyche's orbit (2.92 AU) once the sphere is closed.
  const NEAR = { r: 1.27, el: 0.68 }, WIDE = { r: WIDE_R, el: 0.42 };
  let w = 0, h = 0, dpr = 1, sunX = 0.6, sunY = 0.45;
  // Where the Sun is put: on the cover, far out, and home again.
  const spot = { cover: { x: 0.6, y: 0.45 }, far: { x: 0.86, y: 0.2 }, end: { x: 0.6, y: 0.45 } };
  const from = opts.from ?? {};
  let scroll = from.cover ?? 0; // 0..1 through the cover
  let shot = scroll; // the same, a moment behind: the camera follows the scroll instead of jumping with it
  // The rest of the take: where the scroll puts the camera, and where it has got to.
  const aim = { depart: from.depart ?? 0, cruise: from.cruise ?? 0, arrive: from.arrive ?? 0, lift: 0, reach: from.reach ?? -1 };
  const leg = { ...aim };
  // The chapter the page is in, as a heading: where it is turning from and to, and since when.
  const chapter = { from: 0, to: 0, at: -99, now: 0 };
  let away = 0; // 0 at the sphere, 1 in deep space
  let range = 1.27; // the camera's distance from the Sun, AU
  let spherePx = 400; // the sphere's radius on screen, CSS px
  let girth = 1; // the sphere's size on screen against its size as the cover ends; never more than 1
  let pulsed = -1; // when the last pulse left, on the scene's clock
  let clock = 0; // seconds the scene has run
  let p = opts.still ? START : opts.from ? 1 : 0; // built fraction on screen
  let az = 0.4, dragAz = 0, dragEl = 0, velAz = 0;
  const look = { az: 0, el: 0, wantAz: 0, wantEl: 0 }; // the pointer leans the camera a little
  let pull = 0; // the scroll, eased: 0 close in, 1 pulled all the way back
  let spin = 0.9; // the rock's turn about its axis, radians
  let years = 3.1;
  let running = false, raf = 0, last = 0, born = opts.still || opts.from ? 99 : 0;
  let building = 0; // eases towards 1 while the built fraction is rising
  const eye = new Float32Array(3);
  let stop = 1; // the lens stopped down close to the Sun, opened up far from it
  const big = { x: 0, y: 0, z: 0, r: ROCK.r, seen: 1, on: false }; // the rock's centre in view space, and whether it is in frame
  const FAR_LAMPS = new Float32Array(12).fill(1e4);
  const rockW = new Float32Array(3), turn = new Float32Array(9), lampsW = new Float32Array(12), padW = new Float32Array(3), upW = new Float32Array(3), fillW = new Float32Array(3), sideW = new Float32Array(3);
  const lookG = new Float32Array(9), lens = new Float32Array(2);

  /** Unit vectors of a camera at `e` looking at the Sun: right, up, forward. */
  function basis(e: ArrayLike<number>, out: Float32Array) {
    let fx = -e[0], fy = -e[1], fz = -e[2];
    const fl = Math.hypot(fx, fy, fz);
    fx /= fl; fy /= fl; fz /= fl;
    let sx = -fz, sy = 0, sz = fx; // forward × up
    const sl = Math.hypot(sx, sz);
    sx /= sl; sz /= sl;
    out.set([sx, sy, sz, sy * fz - sz * fy, sz * fx - sx * fz, sx * fy - sy * fx, fx, fy, fz]);
  }
  const B = new Float32Array(9), B0 = new Float32Array(9);

  // ---------- deep sky ----------
  // Where the black hole and the quasar hang: chosen once, as directions on the
  // sky, so that each is in frame at a given place in the reading (a way through
  // the page, and a chapter) and drifts through the frame as the camera turns.
  type Far = "hole" | "quasar" | "wormhole" | "nebula";
  const deepSky: Record<Far, number[] | null> = { hole: null, quasar: null, wormhole: null, nebula: null };
  // Where each is staged: the point of the take and the place on the screen. (Directions are worked
  // out again each frame from these, so the camera's slow drift round the Sun carries them too.)
  const staged: Partial<Record<Far, { cruise: number; ch: number; nx: number; ny: number }>> = {};
  const seenFar: Record<Far, number> = { hole: 0, quasar: 0, wormhole: 0, nebula: 0 }; // how much of each is shown: each comes up as its stretch of page nears
  // A comet now and then, crossing the frame: where its head starts and ends on the sky, and since when.
  let comet: { d0: number[]; d1: number[]; at: number } | null = null;
  const COMET = 9; // seconds it is in view
  let cometNext = 16;
  /** The direction on the sky that the camera, far out at that point of the take, sees at (nx, ny) on the screen. */
  function skyAt(cruise: number, ch: number, nx: number, ny: number) {
    const a = az + SWEEP + FAR.sweep * cruise + ch * CHAPTER.turn, el = FAR.el;
    const Bt = new Float32Array(9);
    basis([Math.cos(el) * Math.sin(a), Math.sin(el), Math.cos(el) * Math.cos(a)], Bt);
    return along(Bt, nx, ny, spot.far.x * 2 - 1, 1 - spot.far.y * 2);
  }
  /** The world direction through (nx, ny) on the screen, for a camera with basis `Bt` and lens shift (ox, oy). */
  function along(Bt: ArrayLike<number>, nx: number, ny: number, ox: number, oy: number) {
    const cx = ((nx - ox) * (w / Math.max(1, h))) / F, cy = (ny - oy) / F;
    const d = [0, 1, 2].map((i) => Bt[i] * cx + Bt[3 + i] * cy + Bt[6 + i]);
    const l = Math.hypot(d[0], d[1], d[2]);
    return d.map((v) => v / l);
  }
  /** A world direction in the camera's frame. */
  const inView = (d: number[]) => [view[0] * d[0] + view[4] * d[1] + view[8] * d[2], view[1] * d[0] + view[5] * d[1] + view[9] * d[2], view[2] * d[0] + view[6] * d[1] + view[10] * d[2]];
  // Supernovae: a star somewhere in frame goes off. Three can be seen at once.
  const novae: { d: number[]; at: number; size: number }[] = [];
  const NOVA = 18; // seconds one is seen for, flash and shell together
  let novaNext = 9; // seconds of deep space until the next one goes off by itself
  function nova(at?: { nx: number; ny: number }, size = 1) {
    if (!w) return;
    for (let tries = 0; tries < 6; tries++) {
      const nx = at ? at.nx : -0.85 + rnd() * 1.7, ny = at ? at.ny : -0.8 + rnd() * 1.55;
      const d = along(B, nx, ny, lens[0], lens[1]);
      // Never on the black hole's disc, nor on the Sun.
      if (!at && deepSky.hole && d[0] * deepSky.hole[0] + d[1] * deepSky.hole[1] + d[2] * deepSky.hole[2] > 0.97) continue;
      if (!at && Math.hypot(nx - lens[0], ny - lens[1]) < 0.25) continue;
      if (novae.length >= 3) novae.shift();
      novae.push({ d, at: clock, size });
      return;
    }
  }

  const smooth = (t: number) => t * t * (3 - 2 * t);

  function camera() {
    const s = smooth(shot);
    pull = s;
    const tall = h > w * 1.1 ? 1.22 : 1;
    // Arriving: the camera starts a little closer in and to one side, and settles.
    const late = opts.still || opts.from ? 0 : (1 - Math.min(1, born / ARRIVE.seconds)) ** 3;
    // The voyage: out after the cover, and home again for the footer. Each leg
    // starts and ends at rest, so it joins the pull-back with no step in speed.
    const out = smooth(leg.depart), home = smooth(leg.arrive);
    away = out * (1 - home);
    // Distance alone is carried through the join at speed: a camera that
    // stopped pulling back as the cover let go, and then set off again, would
    // be a camera that stops to think. So the pull-back is still moving when
    // the cover ends, and the leaving picks up at exactly that speed and comes
    // to rest far out. (The crane, the turn and the lens do rest at the join.)
    const pulled = smooth(0.85 * shot) / smooth(0.85);
    const left = ((-1.823 * leg.depart + 2.646) * leg.depart + 0.177) * leg.depart * (1 - home);
    // Distance is carried in its logarithm: the sphere shrinks by the same
    // factor for every screen scrolled, which is what a steady zoom looks like.
    // Home on a tall, narrow screen the sphere is held a little further off than
    // the cover left it, so the footer's caption has clear sky over it.
    const off = tall > 1 && leg.cruise > 0.5 ? 1 + HOME_TALL * (1 - away) : 1;
    // Out and back: nothing at either end of the page, everything in the middle, and at rest at all three.
    // Or, where the page has given its own places on the way out, the way out is those, and goes no further than FAR.r.
    const staged = aim.reach >= 0;
    const deep = staged ? 0 : Math.sin(Math.PI * leg.cruise) ** 2 * away;
    const gone = staged ? Math.max(0, leg.reach) * (1 - home) : left;
    // (A tall screen holds the camera further off so the sphere fits; on a staged way out that is let go by the first place, so the distance there is the place's own.)
    const room = staged ? Math.max(0, 1 - gone / 0.08) : 1;
    const dist = (NEAR.r + (WIDE.r - NEAR.r) * pulled) * (1 + (tall - 1) * (0.35 + 0.65 * s) * room) * (1 - ARRIVE.closer * late) * off * (FAR.r / WIDE.r) ** gone * (FAR.deep / FAR.r) ** deep;
    range = dist;
    stop = ((NEAR.r + (WIDE.r - NEAR.r) * pulled) / WIDE.r) ** 1.9;
    // Far out it rises over the ecliptic, and the orbits open from lines into rings.
    const el = Math.max(0.05, Math.min(1.35, NEAR.el + (WIDE.el - NEAR.el) * s + (FAR.el - WIDE.el) * away + dragEl + look.el + ARRIVE.el * late));
    // Pulling back also carries the camera round the Sun, so what is near crosses
    // what is far; and it keeps going round, slowly, for as long as the page is read.
    // A new chapter of the page is a new heading: the camera swings to it and settles, at rest at both ends.
    const turned = Math.max(0, Math.min(1, (clock - chapter.at) / CHAPTER.seconds));
    chapter.now = chapter.from + (chapter.to - chapter.from) * (turned < 0.5 ? 4 * turned ** 3 : 1 - (-2 * turned + 2) ** 3 / 2);
    const round = az + SWEEP * s + FAR.sweep * leg.cruise + chapter.now * away;
    const a = round + dragAz + look.az + ARRIVE.az * late;
    const aspect = w / h;
    // The lens shift that puts the Sun where the layout wants it. As the camera
    // leaves, it tilts up a little, so the pole has sky above it at the end.
    const tilt = aspect > 1 ? 0.11 : 0.05;
    // Where the Sun sits when the camera is at the sphere: where the cover has it, or the footer.
    const base = leg.cruise > 0.5 ? spot.end : spot.cover;
    sunX = base.x + (spot.far.x - base.x) * away;
    // (The footer's lift is for the camera at home: far out it would only push the sky off the screen.)
    sunY = base.y + (base === spot.end ? Math.min(1.5, leg.lift) * (1 - away) : 0) + (spot.far.y - base.y) * away;
    const ox = sunX * 2 - 1, oy = 1 - sunY * 2 - tilt * s * (1 - away);
    lens[0] = ox;
    lens[1] = oy;

    eye[0] = dist * Math.cos(el) * Math.sin(a);
    eye[1] = dist * Math.sin(el);
    eye[2] = dist * Math.cos(el) * Math.cos(a);
    basis(eye, B);
    const [sx, sy, sz, ux, uy, uz, fx, fy, fz] = B;
    view.set([sx, ux, -fx, 0, sy, uy, -fy, 0, sz, uz, -fz, 0, -(sx * eye[0] + sy * eye[1] + sz * eye[2]), -(ux * eye[0] + uy * eye[1] + uz * eye[2]), fx * eye[0] + fy * eye[1] + fz * eye[2], 1]);
    // Out past the planets nothing is near the lens, and the near plane can follow the camera out.
    const near = Math.max(0.01, (dist - 12) * 0.04), far = Math.max(600, dist * 4);
    proj.set([F / aspect, 0, 0, 0, 0, F, 0, 0, -ox, -oy, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0]);
    spherePx = ((F * h) / 2) * (1 / Math.max(0.05, dist));
    girth = Math.min(1, (WIDE.r * tall * off) / dist);

    // The galaxy: from the camera's frame to its own.
    for (let j = 0; j < 3; j++)
      for (let i = 0; i < 3; i++) lookG[j * 3 + i] = GAL[i * 3] * view[j] + GAL[i * 3 + 1] * view[j + 4] + GAL[i * 3 + 2] * view[j + 8];

    // 16 Psyche: beside the place the shot ends, low and to the right of the
    // frame there. It is a place in the world, so on the way out it comes in
    // past the camera, and leaning or dragging the camera moves it against the sky.
    // (The place turns with the camera while it is far out, where nothing this
    // small can be seen, so the footer finds it exactly where the cover left it.)
    const aEnd = az + SWEEP + FAR.sweep * leg.cruise + chapter.now * away;
    const d1 = WIDE.r * tall;
    const c1 = [d1 * Math.cos(WIDE.el) * Math.sin(aEnd), d1 * Math.sin(WIDE.el), d1 * Math.cos(WIDE.el) * Math.cos(aEnd)];
    basis(c1, B0);
    const depth = ROCK.depth;
    // Where it sits in the last frame, ndc, measured from where the Sun sits in that frame.
    // On the cover it is low and to the right. Home again that corner holds the
    // footer's address, so it hangs beside the sphere instead, level with its waist.
    const hang = aspect > 1 ? (leg.cruise > 0.5 ? [0.8, -0.2] : [0.65, -0.55]) : [0.5, -0.6];
    const tx = hang[0] - (base.x * 2 - 1), ty = hang[1] - (1 - base.y * 2 - tilt);
    const rx = (tx * depth * aspect) / F, ry = (ty * depth) / F;
    for (let i = 0; i < 3; i++) rockW[i] = c1[i] + B0[i] * rx + B0[3 + i] * ry + B0[6 + i] * depth;
    big.x = view[0] * rockW[0] + view[4] * rockW[1] + view[8] * rockW[2] + view[12];
    big.y = view[1] * rockW[0] + view[5] * rockW[1] + view[9] * rockW[2] + view[13];
    big.z = view[2] * rockW[0] + view[6] * rockW[1] + view[10] * rockW[2] + view[14];
    // In frame, with room to spare for its lamps and the cargo leaving it.
    const reach = (big.r * 1.6 * F) / Math.max(0.05, -big.z);
    const close = away < 0.86; // further out than this the rocks are less than a pixel
    big.on = close && big.z < -big.r * 1.4 && Math.abs((F / aspect) * (big.x / -big.z) + ox) < 1 + reach / aspect && Math.abs(F * (big.y / -big.z) + oy) < 1 + reach;
    // A little light from over the camera's left shoulder, so a night side keeps its shape.
    for (let i = 0; i < 3; i++) fillW[i] = -0.5 * B[i] + 0.45 * B[3 + i] - 0.74 * B[6 + i];
    if (rock) {
      // Its axis leans towards the camera, up and to the right; it turns about that.
      const k = [0, 1, 2].map((i) => B0[i] * 0.34 + B0[3 + i] * 0.48 - B0[6 + i] * 0.81);
      const kd = B0[3] * k[0] + B0[4] * k[1] + B0[5] * k[2];
      let w1 = [B0[3] - k[0] * kd, B0[4] - k[1] * kd, B0[5] - k[2] * kd];
      const wl = Math.hypot(w1[0], w1[1], w1[2]);
      w1 = w1.map((v) => v / wl);
      const w2 = [k[1] * w1[2] - k[2] * w1[1], k[2] * w1[0] - k[0] * w1[2], k[0] * w1[1] - k[1] * w1[0]];
      const cs = Math.cos(spin), sn = Math.sin(spin);
      for (let i = 0; i < 3; i++) {
        const u1 = cs * w1[i] + sn * w2[i], u2 = cs * w2[i] - sn * w1[i];
        for (let j = 0; j < 3; j++) turn[j * 3 + i] = u1 * rock.a1[j] + u2 * rock.a2[j] + k[i] * rock.axis[j];
      }
      for (let i = 0; i < 3; i++) {
        for (let m = 0; m < 4; m++) lampsW[m * 3 + i] = rockW[i] + (turn[i] * rock.masts[m * 3] + turn[3 + i] * rock.masts[m * 3 + 1] + turn[6 + i] * rock.masts[m * 3 + 2]) * big.r;
        padW[i] = rockW[i] + (turn[i] * rock.pad[0] + turn[3 + i] * rock.pad[1] + turn[6 + i] * rock.pad[2]) * big.r;
        upW[i] = turn[i] * rock.pit[0] + turn[3 + i] * rock.pit[1] + turn[6 + i] * rock.pit[2];
      }
      // Cargo leaves across the line of sight towards the Sun's side, so it rounds the rock in plain view.
      const rl = Math.hypot(rockW[0], rockW[1], rockW[2]);
      const along = -(rockW[0] * B0[6] + rockW[1] * B0[7] + rockW[2] * B0[8]) / rl;
      for (let i = 0; i < 3; i++) sideW[i] = -rockW[i] / rl - B0[6 + i] * along;
      const sl = Math.hypot(sideW[0], sideW[1], sideW[2]) || 1;
      for (let i = 0; i < 3; i++) sideW[i] /= sl;
    }
    // The stragglers, each hung in the last camera's frame and tumbling on its own axis.
    for (const b of field) {
      const bx = (b.dx * b.depth) / F, by = (b.dy * b.depth) / F;
      for (let i = 0; i < 3; i++) b.at[i] = c1[i] + B0[i] * bx + B0[3 + i] * by + B0[6 + i] * b.depth;
      const vx = view[0] * b.at[0] + view[4] * b.at[1] + view[8] * b.at[2] + view[12];
      const vy = view[1] * b.at[0] + view[5] * b.at[1] + view[9] * b.at[2] + view[13];
      const vz = view[2] * b.at[0] + view[6] * b.at[1] + view[10] * b.at[2] + view[14];
      const edge = (b.r * 1.3 * F) / Math.max(0.02, -vz);
      b.on = close && vz < -b.r * 1.5 && Math.abs((F / aspect) * (vx / -vz) + ox) < 1 + edge / aspect && Math.abs(F * (vy / -vz) + oy) < 1 + edge;
      if (!b.on) continue;
      // Rodrigues: a turn of `ang` about the boulder's axis.
      const ang = b.phase + b.rate * clock, c = Math.cos(ang), sn = Math.sin(ang), [kx, ky, kz] = b.axis, m = 1 - c;
      b.turn.set([c + kx * kx * m, ky * kx * m + kz * sn, kz * kx * m - ky * sn, kx * ky * m - kz * sn, c + ky * ky * m, kz * ky * m + kx * sn, kx * kz * m + ky * sn, ky * kz * m - kx * sn, c + kz * kz * m]);
    }
    // The opening: the Sun comes up from nothing over the first seconds.
    const t = Math.min(1, born / 3.4);
    big.seen = opts.still || opts.from ? 1 : 1 - (1 - t) ** 3;
  }

  function toScreen(x: number, y: number, z: number) {
    const vx = view[0] * x + view[4] * y + view[8] * z + view[12];
    const vy = view[1] * x + view[5] * y + view[9] * z + view[13];
    const vz = view[2] * x + view[6] * y + view[10] * z + view[14];
    const cw = -vz;
    const nx = (proj[0] * vx + proj[8] * vz) / cw, ny = (proj[5] * vy + proj[9] * vz) / cw;
    return { x: (nx * 0.5 + 0.5) * w, y: (0.5 - ny * 0.5) * h, w: cw, nx, ny, on: cw > 0.05 && Math.abs(nx) < 1.02 && Math.abs(ny) < 1.02 };
  }

  // ---------- light that leaves: small buffers for the shafts and the bloom ----------
  type Target = { fb: WebGLFramebuffer; tex: WebGLTexture; w: number; h: number };
  const HDR = gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float") ? gl.RGBA16F : gl.RGBA8;
  const LEVELS = light ? 4 : 5;
  let L: { w: number; h: number; ms: WebGLFramebuffer; rb: WebGLRenderbuffer[]; src: Target; a: Target; b: Target; glow: Target; mips: Target[] } | null = null;
  let held = 0; // seconds since the light was last drawn; 0 means there is nothing to carry over
  const seen = { nx: 0, ny: 0, px: 1 }; // where the Sun was, and how large the sphere, when it was
  let post = true; // off for good if this GPU cannot draw to these buffers
  // Pace: a machine that cannot hold the frame rate gives up sharpness first,
  // then the light pass, and keeps its smoothness.
  let sharp = 2; // the most device pixels per CSS pixel the canvas may use
  let pace = 16.7, over = 0, tier = 0, was = 0, trial = 0, settled = false;
  function ease(ms: number) {
    if (settled || ms > 250) return; // a long gap is the tab coming back, not a slow frame
    pace += (ms - pace) * 0.08;
    if (trial > 0) {
      // After a step down, see whether it helped. If frames are no shorter the
      // browser is holding the rate down itself (power saving does), so the
      // detail goes back and stays.
      if (--trial === 0 && pace > was * 0.85) {
        tier = 0;
        sharp = 2;
        post = true;
        settled = true;
        resize(true);
      }
      return;
    }
    over = pace > 23 ? over + 1 : 0;
    if (over < 45) return;
    if (tier > 2) {
      settled = true;
      return;
    }
    over = 0;
    was = pace;
    trial = 70;
    tier++;
    if (tier === 2) post = false;
    else sharp = tier === 1 ? 1.5 : 1;
    resize(true);
  }
  let complete = true;
  function target(tw: number, th: number, format: number): Target {
    const g = gl!;
    const tex = g.createTexture()!;
    g.bindTexture(g.TEXTURE_2D, tex);
    g.texStorage2D(g.TEXTURE_2D, 1, format, tw, th);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
    const fb = g.createFramebuffer()!;
    g.bindFramebuffer(g.FRAMEBUFFER, fb);
    g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, tex, 0);
    complete &&= g.checkFramebufferStatus(g.FRAMEBUFFER) === g.FRAMEBUFFER_COMPLETE;
    return { fb, tex, w: tw, h: th };
  }
  function drop() {
    const g = gl!;
    if (!L) return;
    for (const t of [L.src, L.a, L.b, L.glow, ...L.mips]) {
      g.deleteFramebuffer(t.fb);
      g.deleteTexture(t.tex);
    }
    L.rb.forEach((r) => g.deleteRenderbuffer(r));
    g.deleteFramebuffer(L.ms);
    L = null;
  }
  function buffers() {
    const g = gl!;
    drop();
    if (!post) return;
    // A third of the canvas on dense screens, half otherwise: light is soft, and this is where the cost is.
    const div = canvas.height > 1300 ? 3 : 2;
    const lw = Math.max(16, Math.round(canvas.width / div)), lh = Math.max(16, Math.round(canvas.height / div));
    complete = true;
    const ms = g.createFramebuffer()!;
    g.bindFramebuffer(g.FRAMEBUFFER, ms);
    const samples = Math.min(4, g.getParameter(g.MAX_SAMPLES) as number);
    const rb = [g.RGBA8, g.DEPTH_COMPONENT16].map((format, i) => {
      const r = g.createRenderbuffer()!;
      g.bindRenderbuffer(g.RENDERBUFFER, r);
      g.renderbufferStorageMultisample(g.RENDERBUFFER, samples, format, lw, lh);
      g.framebufferRenderbuffer(g.FRAMEBUFFER, i ? g.DEPTH_ATTACHMENT : g.COLOR_ATTACHMENT0, g.RENDERBUFFER, r);
      return r;
    });
    complete &&= g.checkFramebufferStatus(g.FRAMEBUFFER) === g.FRAMEBUFFER_COMPLETE;
    const src = target(lw, lh, g.RGBA8), a = target(lw, lh, HDR), b = target(lw, lh, HDR);
    const mips: Target[] = [];
    for (let i = 0, mw = lw, mh = lh; i < LEVELS; i++) {
      mw = Math.max(2, mw >> 1);
      mh = Math.max(2, mh >> 1);
      mips.push(target(mw, mh, HDR));
    }
    const glow = target(mips[0].w, mips[0].h, HDR);
    g.bindFramebuffer(g.FRAMEBUFFER, null);
    L = { w: lw, h: lh, ms, rb, src, a, b, glow, mips };
    held = 0;
    if (!complete) {
      drop();
      post = false;
    }
  }

  /** Fit the canvas to its box. The buffers are only rebuilt when the size has changed, or when `force`d (the detail was stepped down). */
  function resize(force = false) {
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const d = Math.min(sharp, window.devicePixelRatio || 1);
    if (force || box.width !== w || box.height !== h || d !== dpr) {
      w = box.width;
      h = box.height;
      dpr = d;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      buffers();
    }
    spot.cover = opts.place(w, h);
    spot.end = opts.placeEnd?.(w, h) ?? spot.cover;
    // Far out the Sun rides high and to the right, clear of the reading column.
    spot.far = opts.placeFar?.(w, h) ?? (w > h ? { x: 0.86, y: 0.2 } : { x: 0.8, y: 0.15 });
    if (!running) draw();
  }

  const state: CosmosState = { built: 0, collectors: 0, total, tugs: 0, years: 0, sunPx: 0, beam: 0, labels: {}, range: 0, away: 0, spherePx: 0 };
  const tmp = new Float32Array(3);
  let use: (pr: Prog) => Prog["u"];

  /**
   * Shafts and bloom. The light sources are drawn alone into a small buffer
   * (the Sun, and the gold the lit foil throws back) with every collector
   * standing in the way as it does in the frame. That is smeared outward from
   * the Sun for the shafts, blurred for the bloom, and both are added over the frame.
   *
   * Collectors cross the Sun's disc several times a second, which would make
   * the shafts flicker. Each frame is therefore mixed into the last, so the
   * light moves at the pace of the swarm and not of one panel.
   */
  /** Draw the stragglers that are in frame, with whatever program is bound. */
  function strew(u: Prog["u"]) {
    if (shapes.length < nextShape.length) return;
    const g = gl!;
    field.forEach((b, i) => {
      if (!b.on) return;
      const m = shapes[i % shapes.length];
      g.uniform3fv(u.u_at, b.at);
      g.uniform1f(u.u_size, b.r);
      g.uniformMatrix3fv(u.u_turn, false, b.turn);
      g.bindVertexArray(m.vao);
      g.drawElements(g.TRIANGLES, m.count, g.UNSIGNED_INT, 0);
    });
  }

  function leaving(px: number, sun: { nx: number; ny: number }, share: number, count: number) {
    if (!L) return;
    const g = gl!;
    g.bindFramebuffer(g.FRAMEBUFFER, L.ms);
    g.viewport(0, 0, L.w, L.h);
    g.clearColor(0, 0, 0, 1);
    g.depthMask(true);
    g.clear(g.COLOR_BUFFER_BIT | g.DEPTH_BUFFER_BIT);
    g.enable(g.DEPTH_TEST);
    g.disable(g.BLEND);

    let u = use(prog.swarm);
    g.uniform1f(u.u_px, (px * L.h) / canvas.height);
    g.uniform3f(u.u_cam, eye[0], eye[1], eye[2]);
    g.uniform1f(u.u_scale, (F * L.h) / 2);
    g.uniform1f(u.u_building, 0);
    g.uniform1f(u.u_emit, 1);
    g.enable(g.SAMPLE_ALPHA_TO_COVERAGE);
    g.bindVertexArray(mSwarm.vao);
    g.drawArraysInstanced(g.TRIANGLE_STRIP, 0, 4, count);
    g.disable(g.SAMPLE_ALPHA_TO_COVERAGE);
    g.uniform1f(u.u_emit, 0);

    u = use(prog.big);
    g.uniform1f(u.u_shade, 0);
    if (rock && big.on) {
      g.uniform3fv(u.u_at, rockW);
      g.uniform1f(u.u_size, big.r);
      g.uniformMatrix3fv(u.u_turn, false, turn);
      g.bindVertexArray(rock.vao);
      g.drawElements(g.TRIANGLES, rock.count, g.UNSIGNED_INT, 0);
    }
    strew(u);

    // The Sun itself, hidden wherever a collector is in front of it.
    g.enable(g.BLEND);
    g.blendFunc(g.ONE, g.ONE);
    g.depthMask(false);
    u = use(prog.sun);
    g.uniform1f(u.u_mode, 4);
    g.uniform1f(u.u_span, 7);
    g.uniform1f(u.u_size, SUN_R * 7);
    g.uniform1f(u.u_gain, big.seen);
    g.bindVertexArray(mSun.vao);
    g.drawArrays(g.TRIANGLE_STRIP, 0, 4);

    g.bindFramebuffer(g.READ_FRAMEBUFFER, L.ms);
    g.bindFramebuffer(g.DRAW_FRAMEBUFFER, L.src.fb);
    g.blitFramebuffer(0, 0, L.w, L.h, 0, 0, L.w, L.h, g.COLOR_BUFFER_BIT, g.NEAREST);

    g.disable(g.DEPTH_TEST);
    g.disable(g.BLEND);
    g.activeTexture(g.TEXTURE0);
    const into = (t: Target) => {
      g.bindFramebuffer(g.FRAMEBUFFER, t.fb);
      g.viewport(0, 0, t.w, t.h);
    };

    // Shafts, in two marches: a short fine one, then a long one over its result.
    g.useProgram(prog.shaft.p);
    u = prog.shaft.u;
    g.bindVertexArray(mShaft.vao);
    g.uniform1i(u.u_src, 0);
    g.uniform2f(u.u_sun, sun.nx * 0.5 + 0.5, sun.ny * 0.5 + 0.5);
    into(L.a);
    g.bindTexture(g.TEXTURE_2D, L.src.tex);
    g.uniform1f(u.u_reach, SHAFT.reach / 16);
    g.uniform1f(u.u_decay, 1);
    g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
    // How much of this frame to take: all of it when nothing is held over. The
    // light is carried over to steady it against panels crossing the Sun, which
    // only makes sense while the Sun stays put in the frame; when it moves or
    // changes size (the camera leaving), what is carried would trail behind it.
    const moved = (Math.hypot(sun.nx - seen.nx, sun.ny - seen.ny) * (h / 2)) / Math.max(1, spherePx) + Math.abs(Math.log(spherePx / seen.px));
    seen.nx = sun.nx;
    seen.ny = sun.ny;
    seen.px = spherePx;
    const take = held > 0 ? Math.max(1 - Math.exp(-held / SHAFT.linger), Math.min(1, moved * 30)) : 1;
    g.enable(g.BLEND);
    g.blendColor(0, 0, 0, take);
    g.blendFunc(g.CONSTANT_ALPHA, g.ONE_MINUS_CONSTANT_ALPHA);
    into(L.b);
    g.bindTexture(g.TEXTURE_2D, L.a.tex);
    g.uniform1f(u.u_reach, SHAFT.reach);
    g.uniform1f(u.u_decay, SHAFT.decay);
    g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
    g.disable(g.BLEND);

    // Bloom: halve the light again and again, then add each size back into the one above.
    g.useProgram(prog.down.p);
    u = prog.down.u;
    g.bindVertexArray(mDown.vao);
    g.uniform1i(u.u_src, 0);
    let from: Target = L.src;
    for (const m of L.mips) {
      into(m);
      g.bindTexture(g.TEXTURE_2D, from.tex);
      g.uniform2f(u.u_texel, 1 / from.w, 1 / from.h);
      g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
      from = m;
    }
    g.enable(g.BLEND);
    g.blendFunc(g.ONE, g.ONE);
    g.useProgram(prog.up.p);
    u = prog.up.u;
    g.bindVertexArray(mUp.vao);
    g.uniform1i(u.u_src, 0);
    g.uniform1f(u.u_gain, SHAFT.spread);
    for (let i = L.mips.length - 1; i > 0; i--) {
      into(L.mips[i - 1]);
      g.bindTexture(g.TEXTURE_2D, L.mips[i].tex);
      g.uniform2f(u.u_texel, 1 / L.mips[i].w, 1 / L.mips[i].h);
      g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
    }
    // The bloom is held over from frame to frame in the same way.
    g.blendFunc(g.CONSTANT_ALPHA, g.ONE_MINUS_CONSTANT_ALPHA);
    into(L.glow);
    g.bindTexture(g.TEXTURE_2D, L.mips[0].tex);
    g.uniform2f(u.u_texel, 1 / L.mips[0].w, 1 / L.mips[0].h);
    g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
    held = 0;

    // Both, added over the frame.
    g.bindFramebuffer(g.FRAMEBUFFER, null);
    g.viewport(0, 0, canvas.width, canvas.height);
    g.blendFunc(g.ONE, g.ONE_MINUS_SRC_ALPHA);
    g.useProgram(prog.mix.p);
    u = prog.mix.u;
    g.bindVertexArray(mMix.vao);
    g.activeTexture(g.TEXTURE1);
    g.bindTexture(g.TEXTURE_2D, L.glow.tex);
    g.activeTexture(g.TEXTURE0);
    g.bindTexture(g.TEXTURE_2D, L.b.tex);
    g.uniform1i(u.u_shafts, 0);
    g.uniform1i(u.u_bloom, 1);
    g.uniform2f(u.u_gain, SHAFT.gain * stop * share, SHAFT.bloom * stop * share);
    g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
  }

  function draw() {
    if (!w) return;
    camera();
    const g = gl!;
    g.viewport(0, 0, canvas.width, canvas.height);
    g.clearColor(6 / 255, 8 / 255, 13 / 255, 1);
    g.clearDepth(1);
    g.depthMask(true); // a masked depth buffer is not cleared, and last frame's depth would hide this one
    g.clear(g.COLOR_BUFFER_BIT | g.DEPTH_BUFFER_BIT);
    g.enable(g.BLEND);
    g.blendFunc(g.ONE, g.ONE_MINUS_SRC_ALPHA);
    const px = dpr * Math.min(1.3, Math.max(0.8, h / 900));
    const work = p >= 0.9995 ? 0 : 0.3 + 0.7 * Math.min(1, p * 30);
    const beam = Math.max(0, Math.min(1, (p - 0.992) / 0.008));
    const aspect = w / h;
    // From far out the sphere is drawn in less and less detail: first without its
    // shafts and bloom, then with a share of its collectors, and at last as a star.
    const ramp = (a: number, b: number, v: number) => smooth(Math.max(0, Math.min(1, (v - a) / (b - a))));
    const share = post ? ramp(LOD.post[0], LOD.post[1], spherePx) : 0;
    const star = 1 - ramp(LOD.star[0], LOD.star[1], spherePx);
    const count = spherePx >= LOD.thin ? mSwarm.count : Math.max(2400, Math.round(mSwarm.count * (spherePx / LOD.thin) ** 2));
    use = (pr: Prog) => {
      g.useProgram(pr.p);
      g.uniformMatrix4fv(pr.u.u_proj, false, proj);
      g.uniformMatrix4fv(pr.u.u_view, false, view);
      g.uniform1f(pr.u.u_px, px);
      g.uniform1f(pr.u.u_time, years);
      g.uniform1f(pr.u.u_p, p);
      return pr.u;
    };
    const sun = toScreen(0, 0, 0);
    let u0: Prog["u"];

    // The sky and everything that is only light: nothing here writes depth.
    g.disable(g.DEPTH_TEST);
    g.depthMask(false);
    // The sky is faint. Close to the Sun the lens is stopped down too far to
    // show much of it; it comes out as the camera leaves and the sphere closes.
    const night = (0.22 + 0.78 * pull) * big.seen;
    // How far the sky moved across the frame while the shutter was open (half the frame's turn), device px.
    const smear = fresh ? 0 : Math.hypot(view[2] - viewWas[2], view[6] - viewWas[6], view[10] - viewWas[10], view[1] - viewWas[1], view[5] - viewWas[5], view[9] - viewWas[9]) * F * (canvas.height / 2) * 0.5 * 0.7;
    if (galaxy) {
      g.useProgram(prog.far.p);
      // Eased over a few frames, so a camera coming to rest does not bring the faint stars back all at once.
      smeared += (smear - smeared) * (smear > smeared ? 0.6 : 0.18);
      g.uniform1f(prog.far.u.u_smear, smeared);
      g.uniformMatrix3fv(prog.far.u.u_look, false, lookG);
      g.uniform4f(prog.far.u.u_lens, aspect / F, 1 / F, lens[0], lens[1]);
      g.uniform1f(prog.far.u.u_gain, GALAXY.gain * night * (1 + 0.5 * away));
      g.uniform1i(prog.far.u.u_sky, 0);
      g.activeTexture(g.TEXTURE0);
      g.bindTexture(g.TEXTURE_2D, galaxy);
      g.bindVertexArray(mFar.vao);
      g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
    }

    u0 = use(prog.sky);
    g.uniform1f(u0.u_gain, 0.62 + 0.38 * night);
    g.uniformMatrix4fv(u0.u_was, false, fresh ? view : viewWas);
    g.uniform2f(u0.u_half, canvas.width / 2, canvas.height / 2);
    g.bindVertexArray(mSky.vao);
    g.drawArrays(g.POINTS, 0, mSky.count);
    viewWas.set(view);
    fresh = false;

    // Deep sky, out past the planets.
    const deepK = smooth(Math.max(0, Math.min(1, (away - 0.55) / 0.4)));
    // The deep sky's program is drawn once, into one pixel, the first time the sky is up: a driver
    // finishes a program the first time it is used, and that should not be on the way out to deep space.
    if (galaxy && !deepWarm) {
      deepWarm = true;
      g.enable(g.SCISSOR_TEST);
      g.scissor(0, 0, 1, 1);
      g.useProgram(prog.deep.p);
      g.uniform4f(prog.deep.u.u_bh, 0, 0, -1, 0.01);
      g.uniform1f(prog.deep.u.u_bhr, 0.01);
      g.bindVertexArray(mDeep.vao);
      g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
      g.disable(g.SCISSOR_TEST);
    }
    if (galaxy && deepK > 0.002) {
      for (const [k, at] of Object.entries(staged)) deepSky[k as Far] = skyAt(at!.cruise, at!.ch, at!.nx, at!.ny);
      const dp = prog.deep;
      g.useProgram(dp.p);
      g.uniformMatrix3fv(dp.u.u_look, false, lookG);
      g.uniform4f(dp.u.u_lens, aspect / F, 1 / F, lens[0], lens[1]);
      g.uniform1f(dp.u.u_gain, GALAXY.gain * night * (1 + 0.5 * away));
      g.uniform1f(dp.u.u_clock, clock);
      const at = (k: Far) => (deepSky[k] ? inView(deepSky[k]!) : [0, 0, 1]);
      const shown = (k: Far) => (deepSky[k] ? deepK * seenFar[k] : 0);
      const bh = at("hole"), qso = at("quasar"), wh = at("wormhole"), neb = at("nebula");
      g.uniform4f(dp.u.u_bh, bh[0], bh[1], bh[2], shown("hole"));
      g.uniform4f(dp.u.u_wh, wh[0], wh[1], wh[2], shown("wormhole"));
      g.uniform1f(dp.u.u_whr, (h > w * 1.1 ? 0.11 : 0.1) / F);
      g.uniform4f(dp.u.u_neb, neb[0], neb[1], neb[2], shown("nebula"));
      if (comet && clock - comet.at < COMET) {
        const t = (clock - comet.at) / COMET;
        const hd = [0, 1, 2].map((i) => comet!.d0[i] + (comet!.d1[i] - comet!.d0[i]) * t);
        const hc = inView(hd), vc = inView([0, 1, 2].map((i) => comet!.d1[i] - comet!.d0[i]));
        const vl = Math.hypot(vc[0], vc[1], vc[2]) || 1;
        g.uniform4f(dp.u.u_comet, hc[0], hc[1], hc[2], clock - comet.at);
        g.uniform3f(dp.u.u_cometV, vc[0] / vl, vc[1] / vl, vc[2] / vl);
      } else g.uniform4f(dp.u.u_comet, 0, 0, -1, -1);
      g.uniform1f(dp.u.u_bhr, (h > w * 1.1 ? 0.1 : 0.095) / F);
      g.uniform4f(dp.u.u_qso, qso[0], qso[1], qso[2], shown("quasar"));
      const sn = new Float32Array(12);
      for (let i = 0; i < 3; i++) {
        const n = novae[i];
        const age = n ? clock - n.at : -1;
        const c = (n && age < NOVA ? inView(n.d) : [0, 0, -1]).map((v) => v * (n?.size ?? 1));
        sn.set([c[0], c[1], c[2], n && age < NOVA ? age : -1], i * 4);
      }
      g.uniform4fv(dp.u.u_sn, sn);
      g.uniform1i(dp.u.u_sky, 0);
      g.activeTexture(g.TEXTURE0);
      g.bindTexture(g.TEXTURE_2D, galaxy);
      g.bindVertexArray(mDeep.vao);
      g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
    }

    let u = use(prog.line);
    const outer = smooth(Math.min(1, away * 1.7));
    for (const l of loops) {
      const al = l.alpha * (l.far === 0 ? 1 - outer : l.far === 1 ? outer : 1);
      if (al < 0.004) continue;
      g.uniform4f(u.u_col, 0.94 * al, 0.93 * al, 0.9 * al, al);
      g.bindVertexArray(l.m.vao);
      g.drawArrays(g.LINE_LOOP, 0, l.m.count);
    }
    // The plan: the orbits of the rings going up now, and the next few, as faint blue hairlines.
    const front = (p / 0.9) * RINGS;
    for (let k = Math.max(0, Math.floor(front) - 2); k < Math.min(RINGS, front + 7); k++) {
      const al = 0.2 * Math.max(0, 1 - Math.abs(k - front) / 7);
      g.uniform4f(u.u_col, 0.49 * al, 0.6 * al, 1.0 * al, al);
      g.bindVertexArray(plans[k].vao);
      g.drawArrays(g.LINE_LOOP, 0, plans[k].count);
    }

    u = use(prog.sun);
    g.bindVertexArray(mSun.vao);
    // Light held inside the sphere: stronger as it closes.
    g.uniform1f(u.u_mode, 2);
    g.uniform1f(u.u_size, 1.03);
    g.uniform1f(u.u_gain, (0.05 + 0.3 * p * p) * big.seen);
    g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
    const span = 34;
    g.uniform1f(u.u_turn, years * TAU * 0.25);
    g.uniform1f(u.u_mode, 0);
    g.uniform1f(u.u_span, span);
    g.uniform1f(u.u_size, SUN_R * span);
    g.uniform1f(u.u_dim, p);
    g.uniform1f(u.u_gain, big.seen);
    g.drawArrays(g.TRIANGLE_STRIP, 0, 4);

    // Solid things write depth: the Sun's disc, the outpost, rocks and planets.
    g.enable(g.DEPTH_TEST);
    g.depthMask(true);
    g.uniform1f(u.u_mode, 1);
    g.uniform1f(u.u_size, SUN_R);
    g.uniform1f(u.u_gain, Math.min(1, big.seen * 1.6));
    g.drawArrays(g.TRIANGLE_STRIP, 0, 4);

    u = use(prog.rock);
    g.uniform1f(u.u_fade, 1);
    g.uniform1f(u.u_far, smooth(Math.min(1, away * 2.4)));
    g.bindVertexArray(mRock.vao);
    g.drawArrays(g.POINTS, 0, mRock.count);
    if (outer > 0.01) {
      g.uniform1f(u.u_far, 0);
      g.uniform1f(u.u_fade, outer);
      g.bindVertexArray(mKuiper.vao);
      g.drawArrays(g.POINTS, 0, mKuiper.count);
    }

    // Collectors are solid: they hide what is behind them, and each other.
    u = use(prog.swarm);
    g.uniform3f(u.u_cam, eye[0], eye[1], eye[2]);
    g.uniform1f(u.u_scale, (F * canvas.height) / 2);
    g.uniform1f(u.u_building, building);
    g.uniform1f(u.u_heat, p * p * p);
    g.disable(g.BLEND);
    g.enable(g.SAMPLE_ALPHA_TO_COVERAGE);
    g.bindVertexArray(mSwarm.vao);
    g.drawArraysInstanced(g.TRIANGLE_STRIP, 0, 4, count);
    g.disable(g.SAMPLE_ALPHA_TO_COVERAGE);
    g.enable(g.BLEND);

    // Lights are tested against depth but do not write it.
    g.depthMask(false);
    u = use(prog.tug);
    g.uniform1f(u.u_work, work);
    g.bindVertexArray(mTug.vao);
    g.drawArrays(g.POINTS, 0, mTug.count);

    g.disable(g.DEPTH_TEST);

    // Glare: light spilling round whatever stands in front of the Sun. It
    // weakens as the sphere closes over it.
    u = use(prog.sun);
    g.bindVertexArray(mSun.vao);
    g.uniform1f(u.u_turn, years * TAU * 0.25);
    g.uniform1f(u.u_mode, 0);
    g.uniform1f(u.u_span, 9);
    g.uniform1f(u.u_size, SUN_R * 9);
    g.uniform1f(u.u_dim, p);
    g.uniform1f(u.u_gain, 0.2 * big.seen * (1 - p) * (1 - p));
    g.uniform1f(u.u_fill, 1);
    g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
    g.uniform1f(u.u_fill, 0);


    if (share > 0.003) leaving(px, sun, share, count);

    if (star > 0.003) {
      // The same size on the lens however far off it is: a star has no disc to shrink.
      u = use(prog.sun);
      g.bindVertexArray(mSun.vao);
      g.uniform1f(u.u_mode, 5);
      g.uniform1f(u.u_size, (118 * range) / ((F * h) / 2));
      // On a narrow screen there is no margin for it: it is always behind type, and kept quieter.
      // What gets out comes through gaps that are always moving, so it is never quite steady.
      g.uniform1f(u.u_gain, star * big.seen * (w < h ? 0.62 : 1) * (0.93 + 0.07 * Math.sin(clock * 1.9) * Math.sin(clock * 0.83 + 1.3)));
      g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
    }

    // The rocks are the nearest things in the frame, so they go over the light: the
    // stragglers, then the quarry with its lamps and its cargo.
    const rocky = rock && big.on;
    if (rocky || field.some((b) => b.on)) {
      g.enable(g.DEPTH_TEST);
      g.depthMask(true);
      u = use(prog.big);
      g.uniform3f(u.u_cam, eye[0], eye[1], eye[2]);
      g.uniform3fv(u.u_fill, fillW);
      g.uniform1f(u.u_shade, 1);
      // No floodlights on the stragglers: theirs are parked a long way off.
      g.uniform3fv(u.u_lamps, FAR_LAMPS);
      strew(u);
      if (rocky) {
        g.uniform3fv(u.u_at, rockW);
        g.uniform1f(u.u_size, big.r);
        g.uniformMatrix3fv(u.u_turn, false, turn);
        g.uniform3fv(u.u_lamps, lampsW);
        g.bindVertexArray(rock!.vao);
        g.drawElements(g.TRIANGLES, rock!.count, g.UNSIGNED_INT, 0);
        g.depthMask(false);
        const lit = 1 - ramp(0.4, 0.8, away);
        u = use(prog.lamp);
        g.uniform1f(u.u_lit, lit);
        g.uniform3fv(u.u_at, rockW);
        g.uniform1f(u.u_size, big.r);
        g.uniformMatrix3fv(u.u_turn, false, turn);
        g.bindVertexArray(rock!.lamps.vao);
        g.drawArrays(g.POINTS, 0, rock!.lamps.count);
        u = use(prog.haze);
        g.uniform3f(u.u_at, lampsW[0], lampsW[1], lampsW[2]);
        g.uniform1f(u.u_size, big.r * 0.62);
        g.uniform1f(u.u_gain, (0.15 + 0.012 * Math.sin(clock * 2.3) * Math.sin(clock * 0.71)) * lit);
        g.bindVertexArray(mHaze.vao);
        g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
        u = use(prog.haul);
        g.uniform1f(u.u_lit, lit);
        g.uniform3fv(u.u_from, padW);
        g.uniform3fv(u.u_up, upW);
        g.uniform3fv(u.u_side, sideW);
        g.uniform3f(u.u_to, rockW[0] * 0.34, rockW[1] * 0.34, rockW[2] * 0.34);
        g.uniform1f(u.u_size, big.r);
        g.bindVertexArray(mHaul.vao);
        g.drawArrays(g.POINTS, 0, mHaul.count);
      }
      g.depthMask(false);
      g.disable(g.DEPTH_TEST);
    }

    if (beam > 0) {
      // Out through the pole, to somewhere very far away. The far end is cut
      // where the ray would pass behind the camera.
      const a = toScreen(0.16, 1.01, -0.1);
      const dvz = view[2] * 0.16 + view[6] * 1.01 + view[10] * -0.1; // the ray's direction along the view axis
      const reach = dvz > 1e-4 ? Math.min(300, (a.w - 0.1) / dvz) : 300;
      const b = toScreen(0.16 * (1 + reach), 1.01 * (1 + reach), -0.1 * (1 + reach));
      u = use(prog.beam);
      g.uniform4f(u.u_ends, a.nx, a.ny, b.nx, b.ny);
      // The beam is as wide as the sphere makes it: from far out, a needle. The
      // quad it is drawn on is never less than three pixels to a side.
      const wide = Math.max(0.19 * girth, 6 / canvas.height);
      g.uniform1f(u.u_wide, wide);
      g.uniform1f(u.u_k, girth);
      g.uniform3f(u.u_thin, (wide * canvas.height) / 2, (0.19 * girth) / wide, 7 * away * away);
      g.uniform1f(u.u_flow, clock * 7);
      const len = Math.hypot((b.nx - a.nx) * aspect, b.ny - a.ny);
      g.uniform1f(u.u_len, len);
      g.uniform1f(u.u_aspect, aspect);
      // A pulse runs the beam's length in about a second and a half, then it is gone.
      const run = pulsed < 0 ? -1 : (clock - pulsed) * 1.5 * girth;
      if (run > len + 0.6 * girth) pulsed = -1;
      g.uniform1f(u.u_pulse, pulsed < 0 ? -1 : run);
      g.uniform1f(u.u_gain, beam * (0.9 + 0.1 * Math.sin(years * 900)) * (1 - 0.4 * away));
      g.bindVertexArray(mBeam.vao);
      g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
    }
    g.bindVertexArray(null);

    if (opts.onFrame) {
      state.built = p;
      state.collectors = Math.round(p * total);
      state.tugs = Math.round(nTug * work);
      state.years = years;
      state.beam = beam;
      state.range = range;
      state.away = away;
      state.spherePx = spherePx;
      for (const [name, pl] of Object.entries(PLANETS)) {
        keplerCPU(pl.a, pl.e, pl.i, pl.node, pl.peri, pl.M + (years * TAU) / pl.a ** 1.5, tmp);
        state.labels[name] = toScreen(tmp[0], tmp[1], tmp[2]);
      }
      state.labels.sun = sun;
      state.sunPx = ((SUN_R * F) / sun.w) * (h / 2);
      state.labels.swarm = toScreen(0, 1.02, 0);
      // The outpost's name sits on its lit shoulder.
      const ndcx = (proj[0] * (big.x + big.r) + proj[8] * big.z) / -big.z, ndcy = (proj[5] * big.y + proj[9] * big.z) / -big.z;
      state.labels.psyche = { x: (ndcx * 0.5 + 0.5) * w + 8, y: (0.5 - ndcy * 0.5) * h, on: !!rock && big.on && born > 2.2 && Math.abs(ndcx) < 0.98 && Math.abs(ndcy) < 0.98 };
      // The beam's name sits beside it, part of the way up from the pole to the top of the frame.
      const foot = toScreen(0.16, 1.01, -0.1);
      state.labels.beam = { x: foot.x + 12, y: foot.y * 0.6, on: beam > 0.5 && foot.on };
      opts.onFrame(state);
    }
  }

  let quiet = 0, skipped = 0; // far out and at rest: for how long, and how many frames have gone undrawn
  function tick(now: number) {
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    const gap = last ? now - last : 0;
    last = now;
    born += dt;
    clock += dt;
    held += dt;
    years += dt / YEAR_SECONDS;
    // The camera follows the scroll rather than jumping with it: a wheel moves a page in steps.
    const follow = 1 - Math.exp(-dt * 9);
    shot += (scroll - shot) * follow;
    if (Math.abs(scroll - shot) < 1e-4) shot = scroll;
    let moving = shot !== scroll;
    for (const k of ["depart", "cruise", "arrive", "lift", "reach"] as const) {
      leg[k] += (aim[k] - leg[k]) * follow;
      if (Math.abs(aim[k] - leg[k]) < 1e-4) leg[k] = aim[k];
      else moving = true;
    }
    if (clock - chapter.at < CHAPTER.seconds) moving = true;
    if (comet && clock - comet.at < COMET) moving = true;
    // A supernova in view keeps the scene drawing every frame.
    if (novae.some((n) => clock - n.at < NOVA)) moving = true;
    // The camera keeps the orbit of wherever it is, so what is near it drifts
    // slowly. Far out a real orbit would take centuries; there it is given a
    // drift of a few pixels a second, enough that the sky is never quite still.
    const here = NEAR.r + (WIDE.r - NEAR.r) * shot;
    const orbit = TAU / here ** 1.5 / YEAR_SECONDS;
    az += dt * (orbit + (0.0042 - orbit) * away);
    // Let go, the camera coasts a little, waits, and then goes back to its mark:
    // the rocks are places in the world, and the shot is composed around them.
    if (grab) rest = 0;
    else {
      rest += dt;
      dragAz += velAz * dt;
      velAz *= Math.exp(-dt * 2.2);
      const t = Math.max(0, Math.min(1, (rest - 0.9) / 1.8)), home = Math.exp(-dt * 1.1 * t * t * (3 - 2 * t));
      dragAz *= home;
      dragEl *= home;
    }
    spin += (dt * TAU) / ROCK.day;
    const lean = 1 - Math.exp(-dt * 3.2);
    look.az += (look.wantAz - look.az) * lean;
    look.el += (look.wantEl - look.el) * lean;
    // On arrival the first third of the swarm goes up in a few seconds; after that, scroll builds it.
    const want = START + (1 - START) * Math.min(1, scroll / CLOSE);
    const intro = Math.min(1, born / 3.2);
    const goal = want * (1 - (1 - intro) ** 3);
    const before = p;
    p += (goal - p) * Math.min(1, dt * 7);
    building += ((Math.abs(p - before) > 1e-5 ? 1 : 0) - building) * Math.min(1, dt * 3);
    if (want >= 0.9999 && p > 0.9985) p = 1;
    // Far out with nothing asked of it, the sky moves a fraction of a pixel a
    // frame. Half the frames are then enough, and the page keeps the rest.
    // After a few seconds of that, a quarter of them: it is a still sky behind someone reading.
    const calm = away > 0.97 && !moving && !grab && Math.abs(look.wantAz - look.az) + Math.abs(look.wantEl - look.el) < 2e-4;
    quiet = calm ? quiet + dt : 0;
    if (resting || (calm && ++skipped < (quiet > 4 ? 4 : 2))) {
      // not this frame (or none at all, while the window is covered)
    } else {
      skipped = 0;
      if (gap && born > 2 && !calm) ease(gap);
      draw();
    }
    if (running && !opts.loop) raf = requestAnimationFrame(tick);
  }

  // Drag to look around. Vertical drags are left to the page on touch screens.
  let grab: { x: number; y: number; az: number; el: number; t: number } | null = null;
  let rest = 0; // seconds since the camera was last held
  const down = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    grab = { x: e.clientX, y: e.clientY, az: dragAz, el: dragEl, t: performance.now() };
    velAz = 0;
  };
  const move = (e: PointerEvent) => {
    // A mouse leans the camera towards itself, as a head moves at a window.
    if (!grab && e.pointerType === "mouse" && w) {
      look.wantAz = (e.clientX / window.innerWidth - 0.5) * 2 * LOOK.az;
      look.wantEl = (e.clientY / window.innerHeight - 0.5) * 2 * LOOK.el;
    }
    if (!grab) return;
    const dx = e.clientX - grab.x, dy = e.clientY - grab.y;
    const before = dragAz;
    dragAz = grab.az - dx * 0.0036;
    if (e.pointerType === "mouse") dragEl = Math.max(-0.06, Math.min(0.9, grab.el + dy * 0.0026));
    const now = performance.now();
    velAz = ((dragAz - before) / Math.max(1, now - grab.t)) * 1000 * 0.3;
    grab.t = now;
    if (!running) draw();
  };
  const up = () => {
    if (!grab) return;
    grab = null;
    // Home is never more than half a turn away.
    dragAz -= TAU * Math.round(dragAz / TAU);
  };
  const surfaces = opts.surfaces ?? [canvas];
  surfaces.forEach((el) => el.addEventListener("pointerdown", down));
  window.addEventListener("pointermove", move, { passive: true });
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);

  if (opts.still) {
    paintSky();
    while (!quarry(Infinity)) {}
    while (!shape(Infinity)) {}
  } else {
    // The sky first, then the quarry, then the stragglers, a few milliseconds at a time while the page is idle.
    const idle = (fn: () => void) => ("requestIdleCallback" in window ? requestIdleCallback(fn, { timeout: 400 }) : setTimeout(fn, 40));
    const dig = () => {
      if (!painted) {
        paintSky();
        return idle(dig);
      }
      const done = rock ? shape(4) : (quarry(4), false);
      if (!done) idle(dig);
    };
    idle(dig);
  }

  const ro = new ResizeObserver(() => resize());
  ro.observe(canvas);
  resize();
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    running = false;
    cancelAnimationFrame(raf);
    opts.loop?.remove(tick);
    opts.onLost?.();
  });

  return {
    setScroll(v) {
      scroll = Math.max(0, Math.min(1, v));
      if (!running) {
        shot = scroll;
        p = START + (1 - START) * scroll;
        draw();
      }
    },
    setVoyage(v) {
      for (const k of ["depart", "cruise", "arrive"] as const) if (v[k] !== undefined) aim[k] = Math.max(0, Math.min(1, v[k]!));
      if (v.lift !== undefined) aim.lift = Math.max(0, v.lift);
      aim.reach = v.reach === undefined ? -1 : Math.max(0, Math.min(1, v.reach));
      if (aim.reach < 0) leg.reach = -1;
      else if (leg.reach < 0) leg.reach = aim.reach;
      if (v.cover !== undefined) scroll = Math.max(0, Math.min(1, v.cover));
      if (!running) {
        // Stopped (out of sight, or a still frame): the camera is simply where the
        // scroll has it, so it is in the right place when the scene is next seen.
        Object.assign(leg, aim);
        shot = scroll;
        if (born > 3.2) p = opts.from ? 1 : START + (1 - START) * Math.min(1, scroll / CLOSE);
        if (opts.still) draw();
      }
    },
    pulse() {
      pulsed = clock;
    },
    stage(kind, cruise, ch, nx, ny) {
      staged[kind] = { cruise, ch, nx, ny };
    },
    rest(on) {
      resting = on;
    },
    show(kind, v) {
      seenFar[kind] = Math.max(0, Math.min(1, v));
    },
    nova(nx, ny, size) {
      nova(nx === undefined || ny === undefined ? undefined : { nx, ny }, size);
    },
    turn(n) {
      const to = n * CHAPTER.turn;
      if (to === chapter.to) return;
      chapter.from = chapter.now;
      chapter.to = to;
      chapter.at = clock;
    },
    snap(settled) {
      fresh = true;
      chapter.from = chapter.now = chapter.to;
      chapter.at = -99;
      if (settled) born = Math.max(born, 99);
      Object.assign(leg, aim);
      shot = scroll;
      if (born > 3.2) p = opts.from ? 1 : START + (1 - START) * Math.min(1, scroll / CLOSE);
    },
    still() {
      // A copy can only be taken in the same turn as the drawing: the browser
      // empties the canvas once it has shown it. The copy is kept in memory and
      // not on the graphics card, which is what lets a page transition photograph it.
      draw();
      const copy = document.createElement("canvas");
      copy.width = canvas.width;
      copy.height = canvas.height;
      const to = copy.getContext("2d", { willReadFrequently: true });
      if (!to) return null;
      to.drawImage(canvas, 0, 0);
      return copy;
    },
    run(on) {
      if (opts.still || on === running) return;
      running = on;
      last = 0;
      if (opts.loop) on ? opts.loop.add(tick) : opts.loop.remove(tick);
      else {
        cancelAnimationFrame(raf);
        if (on) raf = requestAnimationFrame(tick);
      }
    },
    refit: () => resize(),
    destroy() {
      running = false;
      cancelAnimationFrame(raf);
      opts.loop?.remove(tick);
      ro.disconnect();
      surfaces.forEach((el) => el.removeEventListener("pointerdown", down));
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    },
  };
}
