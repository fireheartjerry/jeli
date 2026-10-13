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
 * is lit gold. Scrolling pulls back past the belt, where 16 Psyche is being
 * quarried, until the whole sphere is in frame and closed.
 *
 * Distances and periods are to scale. Sizes are not (the Sun is drawn about
 * 18 times too large, or it would be a single pixel; Psyche far more).
 */
import { fingerprint, mulberry32 } from "./worldline";

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
}

export interface CosmosOptions {
  seed: string;
  /** Where the Sun sits, as fractions of the canvas, for a canvas of w × h CSS px. */
  place: (w: number, h: number) => { x: number; y: number };
  /** Fewer points for small screens. */
  light?: boolean;
  /** Draw one finished frame and stop (reduced motion). */
  still?: boolean;
  onFrame?: (s: CosmosState) => void;
}

export interface Cosmos {
  /** Scroll position through the cover, 0 to 1. */
  setScroll(s: number): void;
  run(on: boolean): void;
  refit(): void;
  destroy(): void;
}

const TAU = Math.PI * 2;
const RINGS = 150; // three woven families of fifty
const PER = 400; // collectors per ring: 60,000 in all
const HEX = 0.0125; // drawn radius of one collector, AU (far larger than life)
// Sunlight pushes on the foil. At 8.5 g/m² an absorbing sheet feels about 9% of
// the Sun's pull cancelled (0.77 g/m² would float), so its year is a little long.
const BETA = 0.09;
const SUN_R = 0.085; // drawn radius, AU
const START = 0.36; // how much of the swarm stands when the page opens
// The shafts: how far towards the Sun each pixel gathers light, how fast that
// fades along the way, and how strongly the shafts and the bloom are added.
const SHAFT = { reach: 0.96, decay: 0.9, gain: 2.6, bloom: 0.5, spread: 1.0, linger: 0.3 };

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

// ---- far stars: fixed on the sky, so they only turn with the camera ----
const VS_SKY = HEAD + `
in vec4 a_s; // direction xyz, brightness
in float a_t; // tint: 0 warm, 1 cool
out float v_b; out float v_t;
void main() {
  vec3 d = mat3(u_view) * a_s.xyz;
  gl_Position = u_proj * vec4(d * 200.0, 1.0);
  // The few brightest get a larger sprite, to carry their glint.
  gl_PointSize = u_px * (0.85 + a_s.w * 2.1 + smoothstep(0.55, 1.0, a_s.w) * 13.0);
  v_b = a_s.w; v_t = a_t;
}`;
const FS_SKY = FRAG_HEAD + `
in float v_b; in float v_t;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float d = length(q);
  float big = smoothstep(0.55, 1.0, v_b);
  // A small star is a soft dot. A bright one is a tight core with a fine cross of light.
  float core = smoothstep(0.5, 0.05, d * mix(1.0, 5.5, big));
  float glint = max(exp(-abs(q.x) * 150.0) * exp(-abs(q.y) * 7.0), exp(-abs(q.y) * 150.0) * exp(-abs(q.x) * 7.0)) * big;
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
const FS_SUN = FRAG_HEAD + `
in vec2 v_q;
uniform float u_mode; // 0 corona, 1 disc, 2 light held inside the sphere, 3 lens streak, 4 the source the shafts are cut from
uniform float u_span; // quad half-size in solar radii
uniform float u_dim;
uniform float u_gain;
uniform float u_turn;
uniform float u_fill; // 1: draw the middle too (glare over whatever hides the disc)
void main() {
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
    // Brighter than the screen can show, so the limb never reads as a ring against its own glow.
    float edge = smoothstep(1.0, 0.94, r2);
    // White-hot in the middle and gold towards the limb, so the disc keeps a shoulder inside its own glow.
    vec3 hot = mix(vec3(1.0, 0.8, 0.46), vec3(1.0, 0.98, 0.93), pow(mu, 0.55)) * (0.92 + 0.5 * mu);
    // u_gain brings the disc up with its light when the page opens, so it is never a bare white circle.
    o = vec4(hot * edge * u_gain, edge * u_gain);
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
  // A thin ring of light, the kind a bright source throws round itself.
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
out vec2 v_q; out float v_face; out float v_fresh; out float v_seed; out float v_glint; out float v_far; out float v_px;
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
  vec3 n = -normalize(p); // every panel faces the Sun
  vec3 t1 = normalize(cos(ang) * V - sin(ang) * U); // along its orbit
  vec3 t2 = cross(n, t1);
  vec4 centre = u_proj * u_view * vec4(p, 1.0);
  // Far panels would vanish below a pixel; they are held at a glint's size instead.
  float px = ${HEX} * u_scale / max(centre.w, 0.02);
  float grow = max(1.0, 1.15 * u_px / px);
  gl_Position = u_proj * u_view * vec4(p + (a_q.x * t1 + a_q.y * t2) * ${HEX} * grow, 1.0);
  v_q = a_q;
  v_px = px * grow;
  v_face = dot(n, normalize(u_cam - p)); // above zero we see the sunlit side
  v_fresh = smoothstep(u_p - 0.012, u_p, a_c.w) * u_building;
  v_seed = a_c.z;
  // Glints are for panels seen large; far off, a field of them would only twinkle.
  v_glint = pow(max(0.0, sin(u_time * (5.0 + 11.0 * a_c.z) + a_c.z * 91.0)), 140.0) * mix(0.22, 1.0, smoothstep(3.0, 10.0, px / u_px));
  v_far = mix(1.0, 0.86, smoothstep(0.8, 3.2, centre.w));
}`;
const FS_PANEL = FRAG_HEAD + `
in vec2 v_q; in float v_face; in float v_fresh; in float v_seed; in float v_glint; in float v_far; in float v_px;
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
    // The sunlit side: gold foil, a slow sheen across it, darker frame and seams.
    vec3 foil = mix(vec3(0.99, 0.76, 0.4), vec3(1.0, 0.93, 0.74), v_seed);
    float sheen = 0.82 + 0.18 * (v_q.x * 0.55 - v_q.y * 0.83);
    col = foil * sheen * (0.8 + 0.2 * v_seed);
    col *= 1.0 - 0.42 * frame - 0.22 * spoke - 0.5 * hub;
    col += vec3(1.0, 0.98, 0.92) * v_glint * 1.7;
    col *= mix(0.6, 1.0, smoothstep(0.0, 0.5, v_face)); // dimmer seen edge-on
  } else {
    // The back: almost black, its frame and seams catching a little starlight.
    col = vec3(0.006, 0.008, 0.013) + vec3(0.05, 0.062, 0.095) * frame + vec3(0.016, 0.02, 0.032) * spoke;
    // What the swarm collects it must shed: as it closes, the outside holds a dull ember of waste heat.
    col += vec3(0.075, 0.017, 0.006) * u_heat * (0.55 + 0.45 * v_seed) * (1.0 - 0.5 * frame);
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
in vec4 a_e3; // colour rgb, kind (0 belt rock, 1 keeps forever)
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
  v_c = a_e3.rgb;
  v_seed = a_e2.w * 61.0;
}`;
const FS_ROCK = FRAG_HEAD + `
in vec3 v_l; in vec3 v_c; in float v_seed; in float v_px;
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
  o = vec4(v_c * (0.085 + 1.15 * wrap * wrap * grain) * edge, edge);
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

// ---- 16 Psyche: one big rock beside the camera, drawn as a lit billboard ----
const VS_BIG = HEAD + `
in vec2 a_q;
uniform vec3 u_at; // centre, view space
uniform float u_size;
out vec2 v_q;
void main() {
  gl_Position = u_proj * vec4(u_at + vec3(a_q * u_size, 0.0), 1.0);
  v_q = a_q;
}`;
const FS_BIG = FRAG_HEAD + `
in vec2 v_q;
uniform vec3 u_l; // direction to the Sun, view space
uniform float u_shade; // 0: black, to stand in the way of light and nothing more
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int k = 0; k < 5; k++) { s += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
void main() {
  float ang = atan(v_q.y, v_q.x), r = length(v_q);
  float rim = 0.86 + 0.07 * sin(2.0 * ang + 0.6) + 0.045 * sin(3.0 * ang + 2.1) + 0.03 * sin(5.0 * ang + 4.0) + 0.02 * sin(9.0 * ang + 1.3) + 0.012 * sin(17.0 * ang + 0.4);
  if (r > rim) discard;
  vec2 s = v_q / rim;
  float z = sqrt(max(0.0, 1.0 - dot(s, s)));
  // Terrain: broad swells, then ridges, then craters. The normal leans with the slope.
  vec2 uv = s * 2.4 + 3.0;
  float e = 0.01;
  float h0 = fbm(uv) + 0.35 * abs(fbm(uv * 2.7 + 9.0) - 0.5);
  float hx = fbm(uv + vec2(e, 0.0)) + 0.35 * abs(fbm((uv + vec2(e, 0.0)) * 2.7 + 9.0) - 0.5);
  float hy = fbm(uv + vec2(0.0, e)) + 0.35 * abs(fbm((uv + vec2(0.0, e)) * 2.7 + 9.0) - 0.5);
  vec3 n = normalize(vec3(s, z) + vec3(h0 - hx, h0 - hy, 0.0) * 30.0 * (0.3 + z));
  float albedo = 0.46 + 0.42 * fbm(uv * 3.3 + 1.7);
  // The Sun is nearly behind the rock: a thin lit limb on the sunward side,
  // broken up by the terrain, and nothing direct anywhere else.
  float lam = clamp((dot(n, u_l) + 0.2) / 1.2, 0.0, 1.0);
  lam = lam * lam * lam;
  float toward = dot(normalize(s + 1e-4), normalize(u_l.xy + 1e-4));
  float graze = pow(1.0 - z, 4.6) * smoothstep(-0.15, 0.85, toward) * (0.5 + 1.0 * fbm(uv * 5.0));
  // Light off the swarm, very faint, so the night side still has a shape.
  float fill = max(0.0, dot(n, normalize(vec3(-0.45, 0.4, 0.8))));
  // The quarry: work lights pooling on the surface.
  vec2 dq = v_q - vec2(-0.272, 0.096);
  float pool = exp(-dot(dq, dq) / 0.011) * (0.5 + 0.5 * fbm(uv * 6.0));
  vec3 col = vec3(1.0, 0.93, 0.8) * albedo * (lam * 2.6 + graze * 4.4)
           + vec3(0.05, 0.05, 0.052) * albedo * fill
           + vec3(0.95, 0.72, 0.38) * albedo * pool * 0.34;
  float edge = smoothstep(rim, rim - 0.005, r);
  o = vec4(col * edge * u_shade, edge);
}`;

const VS_LAMP = HEAD + `
in vec4 a_l; // position on the rock's disc xy, phase, kind: 0 quarry lamp, 1 beacon, 2 convoy
uniform vec3 u_at; uniform float u_size;
uniform vec3 u_sunv; // the Sun, view space
out vec3 v_c; out float v_a;
void main() {
  vec3 quarry = u_at + vec3(-0.272 * u_size, 0.096 * u_size, u_size * 0.6);
  if (a_l.w > 1.5) {
    // Loaded tugs pulling away from the quarry, down towards the swarm.
    float s = fract(u_time * 1.3 + a_l.z);
    vec3 p = mix(quarry, u_sunv * 0.34, s * s) + vec3(a_l.xy * u_size * 0.05, 0.0);
    gl_Position = u_proj * vec4(p, 1.0);
    gl_PointSize = u_px * mix(3.0, 1.0, s);
    v_c = vec3(0.93, 0.76, 0.44);
    v_a = smoothstep(0.0, 0.06, s) * (1.0 - s) * 0.95;
    return;
  }
  gl_Position = u_proj * vec4(u_at + vec3(a_l.xy * u_size * 0.8, u_size * 0.6), 1.0);
  float blink = a_l.w > 0.5 ? 0.3 + 0.7 * step(0.82, fract(u_time * 9.0 + a_l.z)) : 0.9;
  gl_PointSize = u_px * (a_l.w > 0.5 ? 3.2 : 2.4);
  v_c = a_l.w > 0.5 ? vec3(0.49, 0.6, 1.0) : vec3(0.98, 0.8, 0.5);
  v_a = blink;
}`;

// ---- the beam: once the sphere is closed, all of it leaves through the pole ----
const VS_BEAM = HEAD + `
in vec2 a_q;
uniform vec4 u_ends; // ndc xy of both ends
uniform float u_wide; uniform float u_aspect;
out vec2 v_q;
void main() {
  vec2 a = u_ends.xy, b = u_ends.zw;
  vec2 d = normalize((b - a) * vec2(u_aspect, 1.0));
  vec2 n = vec2(-d.y, d.x) / vec2(u_aspect, 1.0);
  gl_Position = vec4(mix(a, b, a_q.y * 0.5 + 0.5) + n * a_q.x * u_wide, 0.0, 1.0);
  v_q = a_q;
}`;
const FS_BEAM = FRAG_HEAD + `
in vec2 v_q;
uniform float u_gain; uniform float u_len;
void main() {
  float x = abs(v_q.x);
  float core = exp(-x * x * 1400.0) * 1.6 + exp(-x * 7.0) * 0.26 + exp(-x * 2.2) * 0.05;
  float along = smoothstep(0.0, 0.07, (v_q.y * 0.5 + 0.5) * u_len);
  o = vec4(vec3(0.72, 0.82, 1.0) * core * along * u_gain, 0.0);
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
const VS_POST = `#version 300 es
in vec2 a_q;
out vec2 v_uv;
void main() { v_uv = a_q * 0.5 + 0.5; gl_Position = vec4(a_q, 0.0, 1.0); }`;
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
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, powerPreference: "high-performance" });
  if (!gl) return null;
  const rnd = mulberry32(fingerprint(opts.seed));
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd() + 1e-9)) * Math.cos(TAU * rnd());
  const light = !!opts.light;

  type Prog = ReturnType<typeof compile>;
  let prog: Record<"sky" | "sun" | "swarm" | "rock" | "tug" | "line" | "big" | "lamp" | "beam" | "shaft" | "down" | "up" | "mix", Prog>;
  try {
    prog = {
      sky: compile(gl, VS_SKY, FS_SKY),
      sun: compile(gl, VS_SUN, FS_SUN),
      swarm: compile(gl, VS_SWARM, FS_PANEL),
      rock: compile(gl, VS_ROCK, FS_ROCK),
      tug: compile(gl, VS_TUG, FS_DOT),
      line: compile(gl, VS_LINE, FS_LINE),
      big: compile(gl, VS_BIG, FS_BIG),
      lamp: compile(gl, VS_LAMP, FS_DOT),
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
  const mSun = mesh(prog.sun.p, QUAD, [["a_q", 2]]);
  const mBig = mesh(prog.big.p, QUAD, [["a_q", 2]]);
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
  for (const pl of Object.values(PLANETS)) rocks.push(pl.a, pl.e, pl.i, pl.node, pl.peri, pl.M, pl.size, 1, ...pl.col, 1);
  const mRock = mesh(prog.rock.p, new Float32Array(rocks), [["a_e1", 4], ["a_e2", 4], ["a_e3", 4]]);

  // ---------- tugs ----------
  const nTug = light ? 70 : 150, WAKE = 14;
  const tugs = new Float32Array(nTug * WAKE * 6);
  for (let i = 0; i < nTug; i++) {
    const ra = 2.15 + rnd() * 1.1, lon = rnd() * TAU, inc = gauss() * 0.05, off = rnd(), pick = rnd();
    for (let j = 0; j < WAKE; j++) tugs.set([ra, lon, inc, off, j, pick], (i * WAKE + j) * 6);
  }
  const mTug = mesh(prog.tug.p, tugs, [["a_t1", 4], ["a_t2", 2]]);

  // ---------- lamps on the outpost: a quarry, and a few beacons ----------
  const lamps: number[] = [];
  for (let i = 0; i < 9; i++) lamps.push(-0.34 + gauss() * 0.07, 0.12 + gauss() * 0.05, rnd(), 0);
  for (let i = 0; i < 5; i++) lamps.push((rnd() - 0.5) * 1.1, (rnd() - 0.5) * 1.0, rnd(), 1);
  for (let i = 0; i < 16; i++) lamps.push(gauss(), gauss(), i / 16 + rnd() * 0.02, 2);
  const mLamp = mesh(prog.lamp.p, new Float32Array(lamps), [["a_l", 4]]);

  // ---------- hairlines: two orbits and the AU grid ----------
  const loops: { m: ReturnType<typeof mesh>; alpha: number }[] = [];
  const P3 = new Float32Array(3);
  for (const pl of [PLANETS.mars, PLANETS.jupiter]) {
    const pts = new Float32Array(SEG * 3);
    for (let i = 0; i < SEG; i++) {
      keplerCPU(pl.a, pl.e, pl.i, pl.node, pl.peri, (i / SEG) * TAU, P3);
      pts.set(P3, i * 3);
    }
    loops.push({ m: mesh(prog.line.p, pts, [["a_p", 3]]), alpha: 0.17 });
  }
  for (const r of [2, 3, 4]) {
    const pts = new Float32Array(SEG * 3);
    for (let i = 0; i < SEG; i++) pts.set([r * Math.cos((i / SEG) * TAU), 0, r * Math.sin((i / SEG) * TAU)], i * 3);
    loops.push({ m: mesh(prog.line.p, pts, [["a_p", 3]]), alpha: 0.06 });
  }

  // ---------- camera ----------
  const view = new Float32Array(16), proj = new Float32Array(16);
  const FOV = (46 * Math.PI) / 180;
  const F = 1 / Math.tan(FOV / 2);
  // The shot: from just outside the shell, above its first band, back to
  // beyond the belt on 16 Psyche's orbit (2.92 AU) once the sphere is closed.
  const NEAR = { r: 1.27, el: 0.68 }, WIDE = { r: 3.7, el: 0.42 };
  let w = 0, h = 0, dpr = 1, sunX = 0.6, sunY = 0.45;
  let scroll = 0; // 0..1 through the cover
  let p = opts.still ? START : 0; // built fraction on screen
  let az = 0.4, dragAz = 0, dragEl = 0, velAz = 0;
  let years = 3.1;
  let running = false, raf = 0, last = 0, born = opts.still ? 99 : 0;
  let building = 0; // eases towards 1 while the built fraction is rising
  const eye = new Float32Array(3);
  let stop = 1; // the lens stopped down close to the Sun, opened up far from it
  const big = { x: 0, y: 0, z: 0, r: 0.02, seen: 1 }; // the outpost rock, view space

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

  function camera() {
    const s = scroll * scroll * (3 - 2 * scroll);
    const tall = h > w * 1.1 ? 1.22 : 1;
    const dist = (NEAR.r + (WIDE.r - NEAR.r) * s) * (1 + (tall - 1) * (0.35 + 0.65 * s));
    stop = ((NEAR.r + (WIDE.r - NEAR.r) * s) / WIDE.r) ** 1.9;
    const el = Math.max(0.05, Math.min(1.35, NEAR.el + (WIDE.el - NEAR.el) * s + dragEl));
    const a = az + dragAz;
    const ox = sunX * 2 - 1, oy = 1 - sunY * 2;
    const aspect = w / h;

    eye[0] = dist * Math.cos(el) * Math.sin(a);
    eye[1] = dist * Math.sin(el);
    eye[2] = dist * Math.cos(el) * Math.cos(a);
    basis(eye, B);
    const [sx, sy, sz, ux, uy, uz, fx, fy, fz] = B;
    view.set([sx, ux, -fx, 0, sy, uy, -fy, 0, sz, uz, -fz, 0, -(sx * eye[0] + sy * eye[1] + sz * eye[2]), -(ux * eye[0] + uy * eye[1] + uz * eye[2]), fx * eye[0] + fy * eye[1] + fz * eye[2], 1]);
    const near = 0.01, far = 600;
    // A lens shift puts the Sun where the layout wants it instead of dead centre.
    proj.set([F / aspect, 0, 0, 0, 0, F, 0, 0, -ox, -oy, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0]);

    // 16 Psyche: beside the place the shot ends, low and to the right of the
    // frame there, so the quarry comes into view as the camera pulls back.
    const d1 = WIDE.r * tall;
    const c1 = [d1 * Math.cos(WIDE.el) * Math.sin(a), d1 * Math.sin(WIDE.el), d1 * Math.cos(WIDE.el) * Math.cos(a)];
    basis(c1, B0);
    const depth = 0.85, r = 0.05;
    const tx = (aspect > 1 ? 0.6 : 0.5) - ox, ty = (aspect > 1 ? -0.52 : -0.6) - oy; // where it sits at the end, ndc
    const rx = (tx * depth * aspect) / F, ry = (ty * depth) / F;
    const rock = [
      c1[0] + B0[0] * rx + B0[3] * ry + B0[6] * depth,
      c1[1] + B0[1] * rx + B0[4] * ry + B0[7] * depth,
      c1[2] + B0[2] * rx + B0[5] * ry + B0[8] * depth,
    ];
    big.x = view[0] * rock[0] + view[4] * rock[1] + view[8] * rock[2] + view[12];
    big.y = view[1] * rock[0] + view[5] * rock[1] + view[9] * rock[2] + view[13];
    big.z = view[2] * rock[0] + view[6] * rock[1] + view[10] * rock[2] + view[14];
    big.r = r;
    // The opening: the Sun comes up from nothing over the first seconds.
    const t = Math.min(1, born / 3.4);
    big.seen = opts.still ? 1 : 1 - (1 - t) ** 3;
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
        resize();
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
    resize();
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

  function resize() {
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return;
    w = box.width;
    h = box.height;
    dpr = Math.min(sharp, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    buffers();
    const at = opts.place(w, h);
    sunX = at.x;
    sunY = at.y;
    if (!running) draw();
  }

  const state: CosmosState = { built: 0, collectors: 0, total, tugs: 0, years: 0, sunPx: 0, beam: 0, labels: {} };
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
  function leaving(px: number, sun: { nx: number; ny: number }) {
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
    g.drawArraysInstanced(g.TRIANGLE_STRIP, 0, 4, mSwarm.count);
    g.disable(g.SAMPLE_ALPHA_TO_COVERAGE);
    g.uniform1f(u.u_emit, 0);

    u = use(prog.big);
    g.uniform3f(u.u_at, big.x, big.y, big.z);
    g.uniform1f(u.u_size, big.r);
    g.uniform3f(u.u_l, 0, 0, 1);
    g.uniform1f(u.u_shade, 0);
    g.bindVertexArray(mBig.vao);
    g.drawArrays(g.TRIANGLE_STRIP, 0, 4);

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
    // How much of this frame to take: all of it when nothing is held over.
    const take = held > 0 ? 1 - Math.exp(-held / SHAFT.linger) : 1;
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
    g.uniform2f(u.u_gain, SHAFT.gain * stop, SHAFT.bloom * stop);
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

    // The sky and everything that is only light: nothing here writes depth.
    g.disable(g.DEPTH_TEST);
    g.depthMask(false);
    use(prog.sky);
    g.bindVertexArray(mSky.vao);
    g.drawArrays(g.POINTS, 0, mSky.count);

    let u = use(prog.line);
    for (const l of loops) {
      g.uniform4f(u.u_col, 0.94 * l.alpha, 0.93 * l.alpha, 0.9 * l.alpha, l.alpha);
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

    use(prog.rock);
    g.bindVertexArray(mRock.vao);
    g.drawArrays(g.POINTS, 0, mRock.count);

    // Collectors are solid: they hide what is behind them, and each other.
    u = use(prog.swarm);
    g.uniform3f(u.u_cam, eye[0], eye[1], eye[2]);
    g.uniform1f(u.u_scale, (F * canvas.height) / 2);
    g.uniform1f(u.u_building, building);
    g.uniform1f(u.u_heat, p * p * p);
    g.disable(g.BLEND);
    g.enable(g.SAMPLE_ALPHA_TO_COVERAGE);
    g.bindVertexArray(mSwarm.vao);
    g.drawArraysInstanced(g.TRIANGLE_STRIP, 0, 4, mSwarm.count);
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

    // The lens streak across the Sun, gone while the Sun is hidden.
    g.uniform1f(u.u_mode, 3);
    g.uniform1f(u.u_size, SUN_R * 26);
    g.uniform1f(u.u_gain, 0.9 * big.seen * big.seen * (1 - 0.72 * p));
    g.drawArrays(g.TRIANGLE_STRIP, 0, 4);

    leaving(px, sun);

    // The outpost is the nearest thing in the frame, so it goes over the light, with its lamps.
    u = use(prog.big);
    g.uniform3f(u.u_at, big.x, big.y, big.z);
    g.uniform1f(u.u_size, big.r);
    const lx = view[12] - big.x, ly = view[13] - big.y, lz = view[14] - big.z, ll = Math.hypot(lx, ly, lz);
    g.uniform3f(u.u_l, lx / ll, ly / ll, lz / ll);
    g.uniform1f(u.u_shade, 1);
    g.bindVertexArray(mBig.vao);
    g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
    u = use(prog.lamp);
    g.uniform3f(u.u_at, big.x, big.y, big.z);
    g.uniform1f(u.u_size, big.r);
    g.uniform3f(u.u_sunv, view[12], view[13], view[14]);
    g.bindVertexArray(mLamp.vao);
    g.drawArrays(g.POINTS, 0, mLamp.count);

    if (beam > 0) {
      // Out through the pole, to somewhere very far away. The far end is cut
      // where the ray would pass behind the camera.
      const a = toScreen(0.16, 1.01, -0.1);
      const dvz = view[2] * 0.16 + view[6] * 1.01 + view[10] * -0.1; // the ray's direction along the view axis
      const reach = dvz > 1e-4 ? Math.min(300, (a.w - 0.1) / dvz) : 300;
      const b = toScreen(0.16 * (1 + reach), 1.01 * (1 + reach), -0.1 * (1 + reach));
      u = use(prog.beam);
      g.uniform4f(u.u_ends, a.nx, a.ny, b.nx, b.ny);
      g.uniform1f(u.u_wide, 0.09);
      g.uniform1f(u.u_len, Math.hypot((b.nx - a.nx) * aspect, b.ny - a.ny));
      g.uniform1f(u.u_aspect, aspect);
      g.uniform1f(u.u_gain, beam * (0.9 + 0.1 * Math.sin(years * 900)));
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
      for (const [name, pl] of Object.entries(PLANETS)) {
        keplerCPU(pl.a, pl.e, pl.i, pl.node, pl.peri, pl.M + (years * TAU) / pl.a ** 1.5, tmp);
        state.labels[name] = toScreen(tmp[0], tmp[1], tmp[2]);
      }
      state.labels.sun = sun;
      state.sunPx = ((SUN_R * F) / sun.w) * (h / 2);
      state.labels.swarm = toScreen(0, 1.02, 0);
      // The outpost's name sits on its lit shoulder.
      const ndcx = (proj[0] * (big.x + big.r) + proj[8] * big.z) / -big.z, ndcy = (proj[5] * big.y + proj[9] * big.z) / -big.z;
      state.labels.psyche = { x: (ndcx * 0.5 + 0.5) * w + 8, y: (0.5 - ndcy * 0.5) * h, on: big.z < 0 && born > 2.2 && Math.abs(ndcx) < 0.98 && Math.abs(ndcy) < 0.98 };
      const tip = toScreen(0.16 * 2.2, 1.01 * 2.2, -0.1 * 2.2);
      state.labels.beam = { x: tip.x, y: tip.y, on: beam > 0.5 && tip.on };
      opts.onFrame(state);
    }
  }

  function tick(now: number) {
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    if (last && born > 2) ease(now - last);
    last = now;
    born += dt;
    held = dt;
    years += dt / YEAR_SECONDS;
    // The camera keeps the orbit of wherever it is, so what is near it drifts slowly.
    const here = NEAR.r + (WIDE.r - NEAR.r) * scroll;
    az += (dt / YEAR_SECONDS) * (TAU / here ** 1.5) + velAz * dt;
    velAz *= Math.exp(-dt * 2.2);
    // On arrival the first third of the swarm goes up in a few seconds; after that, scroll builds it.
    const want = START + (1 - START) * scroll;
    const intro = Math.min(1, born / 3.2);
    const goal = want * (1 - (1 - intro) ** 3);
    const before = p;
    p += (goal - p) * Math.min(1, dt * 7);
    building += ((Math.abs(p - before) > 1e-5 ? 1 : 0) - building) * Math.min(1, dt * 3);
    if (want >= 0.9999 && p > 0.9985) p = 1;
    draw();
    if (running) raf = requestAnimationFrame(tick);
  }

  // Drag to look around. Vertical drags are left to the page on touch screens.
  let grab: { x: number; y: number; az: number; el: number; t: number } | null = null;
  const down = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    grab = { x: e.clientX, y: e.clientY, az: dragAz, el: dragEl, t: performance.now() };
    velAz = 0;
  };
  const move = (e: PointerEvent) => {
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
  const up = () => (grab = null);
  canvas.addEventListener("pointerdown", down);
  window.addEventListener("pointermove", move, { passive: true });
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  return {
    setScroll(v) {
      scroll = Math.max(0, Math.min(1, v));
      if (!running) {
        p = START + (1 - START) * scroll;
        draw();
      }
    },
    run(on) {
      if (opts.still || on === running) return;
      running = on;
      last = 0;
      cancelAnimationFrame(raf);
      if (on) raf = requestAnimationFrame(tick);
    },
    refit: resize,
    destroy() {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    },
  };
}
