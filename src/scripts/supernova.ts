/**
 * The death of a massive star, as the page is scrolled through it
 * (Supernova.astro). One canvas, two kinds of drawing:
 *
 *   a full-screen pass that draws the star, the cut through its layers, its
 *   iron core, the collapse and bounce, and the remnant left by the explosion;
 *   and a pass of lit spheres for the scale of atomic nuclei, where iron nuclei
 *   are broken apart by gamma rays into helium nuclei and neutrons, and then
 *   into single protons and neutrons.
 *
 * Everything is a function of `u`, how far through the sequence the scroll has
 * got (0 to 1), and of the clock, which only keeps things alive (a star's
 * surface boils, gas turns). Nothing is drawn while the sequence is out of view.
 */

const FS_HEAD = `#version 300 es
precision highp float;
`;

export const NOISE = `
float hash3(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise3(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
float fbm3(vec3 p, int n) { float s = 0.0, a = 0.5; for (int k = 0; k < 8; k++) { if (k >= n) break; s += a * noise3(p); p = p * 2.02 + 7.3; a *= 0.5; } return s; }
// Ridges: thin bright filaments where the noise crosses its middle.
float ridge3(vec3 p, int n) { float s = 0.0, a = 0.5; for (int k = 0; k < 8; k++) { if (k >= n) break; s += a * (1.0 - abs(2.0 * noise3(p) - 1.0)); p = p * 2.03 + 3.1; a *= 0.5; } return s; }
`;

const VS_QUAD = `#version 300 es
in vec2 a_q;
void main() { gl_Position = vec4(a_q, 0.0, 1.0); }`;

// ---------------------------------------------------------------- the scenes
const FS_SCENE =
  FS_HEAD +
  NOISE +
  `
out vec4 o;
uniform vec2 u_res;
uniform float u_u; // how far through the sequence, 0 to 1
uniform float u_t; // seconds
uniform float u_mode; // 0: the scenes; 1: light laid over the nuclei (a gamma ray, neutrinos)
uniform float u_s; // how far through the breaking of the nucleus, 0 to 1
uniform float u_q; // the last part: into the neutron star, down to its quarks, 0 to 1

float win(float a, float b, float c, float d) { return smoothstep(a, b, u_u) * (1.0 - smoothstep(c, d, u_u)); }
float ss(float a, float b) { return smoothstep(a, b, u_u); }

// Film-like exposure: bright things roll off to white instead of clipping.
vec3 tone(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }

vec3 starfield(vec2 p, float dens) {
  vec3 c = vec3(0.0);
  for (int l = 0; l < 2; l++) {
    float sc = l == 0 ? 90.0 : 230.0;
    vec2 q = p * sc, cell = floor(q);
    vec2 at = vec2(hash2(cell + 1.7), hash2(cell + 4.3)) * 0.7 + 0.15;
    float m = hash2(cell + 9.1);
    float on = step(1.0 - dens * (l == 0 ? 0.08 : 0.22), hash2(cell + 2.9));
    float d = length(q - cell - at);
    c += mix(vec3(1.0, 0.86, 0.72), vec3(0.75, 0.84, 1.0), hash2(cell + 5.5)) * smoothstep(0.22, 0.02, d) * on * (pow(m, 4.0) * 1.6 + 0.12);
  }
  return c;
}

// A red supergiant's colour at relative temperature t (1: its surface on average).
vec3 photo(float t) { return mix(vec3(0.45, 0.06, 0.01), vec3(1.0, 0.46, 0.16), clamp(t, 0.0, 1.3)) * (0.3 + 0.62 * t); }

// The layers it burns in, outside to in, as fractions of its radius (not to scale: the iron core is really a hundred-thousandth of it).
const float L1 = 0.6, L2 = 0.42, L3 = 0.3, L4 = 0.2, L5 = 0.125;
vec3 shells(vec2 q, float r, float zoomed) {
  float t = u_t;
  vec3 col;
  float conv = fbm3(vec3(q * 7.0, t * 0.05), 4);
  float fine = fbm3(vec3(q * 26.0, t * 0.08 + 3.0), 3);
  if (r > L1) col = vec3(0.4, 0.05, 0.02) * (0.6 + 0.7 * conv); // hydrogen
  else if (r > L2) col = vec3(0.7, 0.2, 0.04) * (0.65 + 0.6 * conv); // helium
  else if (r > L3) col = vec3(0.8, 0.4, 0.09) * (0.7 + 0.5 * fine); // carbon
  else if (r > L4) col = vec3(0.8, 0.6, 0.3) * (0.75 + 0.45 * fine); // oxygen and neon
  else if (r > L5) col = vec3(0.62, 0.5, 0.4) * (0.45 + 0.75 * fine * fine); // silicon
  else {
    // Iron: it no longer burns; it is hot from all that is burning round it, and from its own weight.
    float g = fbm3(vec3(q * 60.0, t * 0.1), 4);
    col = mix(vec3(0.12, 0.15, 0.24), vec3(0.6, 0.68, 0.9), smoothstep(L5, 0.0, r)) * (0.55 + 0.9 * g * g) + vec3(0.5, 0.6, 1.0) * exp(-r / (L5 * 0.35)) * 0.35;
  }
  // Where one burning shell meets the next, a thin brighter line.
  float edge = 0.0;
  float w = 0.0022 / max(zoomed, 1.0);
  edge += exp(-pow((r - L1) / w, 2.0)) + exp(-pow((r - L2) / w, 2.0)) + exp(-pow((r - L3) / w, 2.0)) + exp(-pow((r - L4) / w, 2.0)) + exp(-pow((r - L5) / w, 2.0));
  return col + vec3(1.0, 0.85, 0.6) * edge * 0.35;
}

// ---- 1, 2: the star, then cut open, and the fall into its core ----
vec3 starScene(vec2 p) {
  float zin = ss(0.17, 0.35);
  float Z = exp(log(18.0) * zin * zin * (3.0 - 2.0 * zin)); // the camera falls in towards the centre
  float R = mix(0.6, 0.7, ss(0.0, 0.16));
  vec2 q = p / (Z * R); // in star radii
  float r = length(q);
  vec3 col = starfield(p * 0.55 + vec2(0.31, 0.17), 1.0) * (1.0 - zin) * 0.9;
  // Its extended, dusty atmosphere: a dim red glow well past the surface.
  col += vec3(0.9, 0.22, 0.06) * exp(-max(r - 1.0, 0.0) * 5.0) * 0.16 * step(1.0, r);
  col += vec3(1.0, 0.4, 0.15) * exp(-max(r - 1.0, 0.0) * 22.0) * 0.35 * step(1.0, r);
  if (r < 1.0) {
    float mu = sqrt(1.0 - r * r);
    vec3 n = vec3(q, mu);
    // Its surface is a few giant convection cells, each one larger than the Sun, turning over in months.
    float spin = u_t * 0.015;
    vec3 m = vec3(n.x * cos(spin) - n.z * sin(spin), n.y, n.x * sin(spin) + n.z * cos(spin));
    float cells = fbm3(m * 2.1 + vec3(0.0, 0.0, u_t * 0.02), 5);
    float small = fbm3(m * 9.0 + vec3(u_t * 0.03), 3);
    float T = 0.35 + 0.95 * smoothstep(0.28, 0.75, cells) + 0.18 * (small - 0.5);
    vec3 surf = photo(T) * (0.32 + 0.68 * pow(mu, 0.75)); // darker towards the limb
    // Cut open: a wedge first, then, as the camera falls in, the whole slice.
    float open = ss(0.1, 0.22);
    float half_ = mix(0.0, 0.8, open) + 2.6 * ss(0.2, 0.3);
    float ang = atan(q.y, q.x);
    float d = abs(mod(ang - 0.65 + 3.14159, 6.28318) - 3.14159);
    float inWedge = 1.0 - smoothstep(half_ - 0.01, half_ + 0.01, d);
    col = mix(surf, shells(q, r, Z), inWedge);
  }
  return col;
}

// ---- 3: the iron core, close: a hot dense gas of nuclei ----
vec3 coreScene(vec2 p) {
  float z = ss(0.33, 0.42);
  float sc = mix(30.0, 160.0, z * z);
  vec2 q = p * sc;
  vec2 cell = floor(q);
  vec2 at = vec2(hash2(cell), hash2(cell + 3.3)) * 0.6 + 0.2 + 0.08 * vec2(sin(u_t * 3.0 + hash2(cell) * 40.0), cos(u_t * 2.6 + hash2(cell + 1.0) * 40.0));
  float d = length(q - cell - at);
  float dots = smoothstep(0.32, 0.05, d) * smoothstep(0.35, 0.42, u_u);
  float haze = fbm3(vec3(p * 6.0, u_t * 0.12), 4);
  vec3 col = mix(vec3(0.1, 0.13, 0.2), vec3(0.45, 0.52, 0.7), haze * haze) * (1.0 - 0.7 * z);
  col += vec3(0.75, 0.82, 1.0) * dots * 0.45;
  return col;
}

// ---- 5: collapse, bounce and the shock ----
vec3 bounceScene(vec2 p) {
  float r = length(p), ang = atan(p.y, p.x);
  vec3 col = vec3(0.0);
  float bounce = ss(0.735, 0.745);
  // Before the bounce, everything falls in: streaks moving towards the centre.
  float infall = (1.0 - bounce) * win(0.68, 0.7, 0.73, 0.745);
  float lane = step(0.93, hash2(vec2(floor(ang * 90.0), 1.0)));
  col += vec3(1.0, 0.55, 0.25) * lane * smoothstep(0.6, 0.0, fract(r * 2.5 + u_t * 2.0)) * infall * smoothstep(1.4, 0.15, r) * 0.6;
  // The proto-neutron star: a ball of nuclear matter some thirty kilometres across, white hot.
  float R = mix(0.24, 0.07, ss(0.68, 0.74));
  float core = exp(-pow(r / R, 2.0) * 1.6);
  col += vec3(0.85, 0.92, 1.0) * core * (1.2 + 3.0 * bounce * exp(-(u_u - 0.74) * 60.0));
  // The shock: thrown out by the bounce, stalled, sloshing, and pushed on by neutrinos.
  float sh = bounce * (0.1 + 1.05 * ss(0.74, 0.84));
  float wob = 1.0 + 0.09 * (fbm3(vec3(cos(ang) * 1.6, sin(ang) * 1.6, u_t * 0.6), 4) - 0.5) * 2.0 + 0.05 * sin(ang * 2.0 + u_t * 1.7);
  float shell = exp(-abs(r - sh * wob) / 0.012) + exp(-abs(r - sh * wob) / 0.08) * 0.25;
  float behind = smoothstep(sh * wob, sh * wob * 0.3, r) * bounce;
  col += vec3(1.0, 0.72, 0.42) * shell * bounce * 0.8;
  col += vec3(0.95, 0.5, 0.2) * behind * fbm3(vec3(p * 5.0, u_t * 0.8), 4) * 0.22 * (1.0 - ss(0.8, 0.83));
  // Neutrinos streaming out through all of it: almost all of the energy of the collapse.
  float nl = step(0.965, hash2(vec2(floor(ang * 260.0), 7.0)));
  col += vec3(0.6, 0.8, 1.0) * nl * smoothstep(0.85, 1.0, fract(r * 1.2 - u_t * 3.5 + hash2(vec2(floor(ang * 260.0), 3.0)))) * bounce * 0.55;
  return col;
}

// ---- 6: the explosion, and what is left ----
vec3 remnantScene(vec2 p) {
  float r = length(p), ang = atan(p.y, p.x);
  float age = ss(0.83, 1.0);
  vec3 col = starfield(p * 0.5 + vec2(0.7, 0.2), 1.0) * 0.8;
  // The shock breaks out through the surface: for a moment the star outshines its galaxy.
  float flash = exp(-max(u_u - 0.835, 0.0) * 90.0) * ss(0.82, 0.835);
  col += vec3(1.0, 0.95, 0.88) * flash * (1.6 * exp(-r * 4.5) + 0.05);
  // The remnant: a shell of everything the star made, torn into filaments as it sweeps up gas.
  float Rr = 0.12 + 0.85 * age;
  vec3 q3 = vec3(p / max(Rr, 0.05) * 2.2, u_t * 0.02);
  float fil = ridge3(q3 + 3.0, 5);
  float shell = smoothstep(1.05, 0.88, r / Rr) * smoothstep(0.2, 0.95, r / Rr);
  vec3 ha = vec3(0.95, 0.25, 0.22), oiii = vec3(0.25, 0.62, 0.8), sii = vec3(1.0, 0.6, 0.3);
  vec3 neb = mix(oiii, ha, smoothstep(0.55, 0.95, r / Rr)) * pow(fil, 3.0) * 1.6 + sii * pow(fil, 6.0) * 0.8;
  col += neb * shell * age;
  // Inside: a haze lit by the neutron star's wind, the blue of fast electrons in a magnetic field.
  col += vec3(0.4, 0.55, 1.0) * exp(-r / max(Rr * 0.35, 0.02)) * fbm3(vec3(p * 9.0, u_t * 0.05), 4) * 0.55 * age;
  // The neutron star: twenty kilometres across, spinning, its beams sweeping round.
  float spin = u_t * 2.2;
  vec2 bd = vec2(cos(spin), sin(spin) * 0.35);
  float along = dot(p, normalize(bd)), across = abs(dot(p, vec2(-normalize(bd).y, normalize(bd).x)));
  float beam = exp(-across / (0.004 + 0.06 * abs(along))) * exp(-abs(along) / 0.45) * age;
  col += vec3(0.75, 0.85, 1.0) * (exp(-r * 70.0) * 2.5 + beam * 0.5) * ss(0.86, 0.9);
  return col;
}

// ---- 7, 8: into the neutron star, to its quarks, and strange matter ----
vec3 quarkScene(vec2 p) {
  float q = u_q;
  float r = length(p);
  vec3 col = vec3(0.0);
  // The neutron star, coming up to fill the frame: a crust of nuclei over a sea of neutrons.
  float zoom = smoothstep(0.0, 0.3, q);
  float R = mix(0.03, 1.8, zoom * zoom);
  float gone = 1.0 - smoothstep(0.2, 0.32, q);
  float surf = smoothstep(R, R * 0.985, r);
  col += vec3(0.72, 0.82, 1.0) * surf * (0.55 + 0.45 * fbm3(vec3(p * 9.0 / R, u_t * 0.15), 4)) * gone;
  col += vec3(0.55, 0.7, 1.0) * exp(-max(r - R, 0.0) * 9.0) * 0.45 * gone;
  float k = smoothstep(0.22, 0.34, q);
  if (k > 0.0) {
    // Each neutron is three quarks, one of each colour of the strong force, held by gluons:
    // the field between them is a tube, and pulling quarks apart only stretches it.
    float free_ = smoothstep(0.45, 0.72, q); // pressed close enough, the tubes let go and the quarks roam
    float strange = smoothstep(0.7, 0.95, q); // and some become strange quarks
    vec2 g = p * 4.2;
    vec2 cell = floor(g);
    vec3 acc = vec3(0.0);
    for (int dx = -1; dx <= 1; dx++)
      for (int dy = -1; dy <= 1; dy++) {
        vec2 c = cell + vec2(float(dx), float(dy));
        vec2 ctr = c + 0.5 + 0.42 * vec2(hash2(c) - 0.5, hash2(c + 7.0) - 0.5);
        float rot = u_t * (0.5 + hash2(c + 3.0)) + hash2(c + 5.0) * 6.283;
        vec2 qs[3];
        for (int i = 0; i < 3; i++) {
          float fi = float(i);
          float a = rot + fi * 2.0944;
          vec2 bound = ctr + 0.16 * vec2(cos(a), sin(a)) * (1.0 + 0.12 * sin(u_t * 3.0 + fi));
          vec2 roam = c + vec2(hash2(c + fi * 1.3), hash2(c + fi * 2.7)) + 0.32 * vec2(sin(u_t * 0.8 + fi * 2.0 + hash2(c) * 9.0), cos(u_t * 0.65 + fi * 1.3 + hash2(c + 1.0) * 9.0));
          qs[i] = mix(bound, roam, free_);
        }
        for (int i = 0; i < 3; i++) {
          vec2 a = qs[i], b = qs[(i + 1) % 3];
          vec2 pa = g - a, ba = b - a;
          float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
          float d = length(pa - ba * h) + 0.01 * sin(h * 28.0 - u_t * 7.0);
          acc += vec3(0.95, 0.88, 0.72) * exp(-abs(d) / 0.011) * 0.32 * (1.0 - free_);
        }
        for (int i = 0; i < 3; i++) {
          float fi = float(i);
          float d = length(g - qs[i]);
          vec3 cc = i == 0 ? vec3(1.0, 0.34, 0.3) : (i == 1 ? vec3(0.32, 1.0, 0.5) : vec3(0.38, 0.55, 1.0));
          float sflag = step(hash2(c + fi * 11.0), 0.36 * strange);
          float core = exp(-d * d / 0.0035);
          float halo = exp(-d / 0.055) * 0.22;
          float ring = exp(-pow((d - 0.075) / 0.007, 2.0)) * sflag;
          acc += cc * (core * 1.5 + halo) + vec3(1.0, 0.92, 1.0) * ring * 0.8;
        }
      }
    // Free quarks fill the space between: a faint glow of the strong field everywhere.
    acc += vec3(0.08, 0.06, 0.12) * free_ * (0.6 + 0.4 * fbm3(vec3(p * 3.0, u_t * 0.3), 3));
    col = mix(col, acc, k);
  }
  return col;
}

// Light laid over the nuclei: the gamma ray that breaks the nucleus, and the neutrinos that leave.
vec3 overlay(vec2 p) {
  vec3 col = vec3(0.0);
  float s = u_s;
  // A gamma ray comes in from the left and is absorbed at the centre.
  float head = -2.2 + 2.2 * smoothstep(0.0, 0.26, s);
  float x = p.x;
  float wave = p.y - 0.035 * sin(x * 70.0 - u_t * 30.0) * smoothstep(head - 1.2, head, x);
  float ray = exp(-abs(wave) / 0.004) * step(x, head) * smoothstep(head - 1.4, head - 0.2, x) * (1.0 - smoothstep(0.26, 0.3, s));
  col += vec3(0.85, 0.9, 1.0) * ray * 1.4;
  // Where it is absorbed, a flash.
  col += vec3(1.0, 0.95, 0.85) * exp(-length(p) * 10.0) * exp(-max(s - 0.27, 0.0) * 40.0) * smoothstep(0.24, 0.27, s) * 1.6;
  // Electrons are squeezed into protons: each makes a neutron and a neutrino, which goes straight out.
  float ang = atan(p.y, p.x), r = length(p);
  float nl = step(0.9, hash2(vec2(floor(ang * 40.0), 2.0)));
  col += vec3(0.55, 0.8, 1.0) * nl * smoothstep(0.92, 1.0, fract(r * 0.9 - u_t * 2.4 + hash2(vec2(floor(ang * 40.0), 5.0)))) * smoothstep(0.72, 0.8, s) * 0.7;
  return col;
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / (0.5 * u_res.y);
  if (u_mode > 0.5) {
    o = vec4(tone(overlay(p)), 0.0);
    return;
  }
  vec3 col = vec3(0.0);
  float a = win(-1.0, 0.0, 0.32, 0.36);
  float b = win(0.32, 0.34, 0.4, 0.43);
  float d = win(0.665, 0.69, 0.82, 0.835);
  float e = ss(0.82, 0.835);
  if (a > 0.001) col += starScene(p) * a;
  if (b > 0.001) col += coreScene(p) * b;
  if (d > 0.001) col += bounceScene(p) * d;
  if (e > 0.001) col += remnantScene(p) * e;
  if (u_q > 0.001) col = mix(col, quarkScene(p), smoothstep(0.0, 0.1, u_q));
  // (Between the core and the bounce the nuclei are drawn over a dark ground.)
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  o = vec4(tone(col) + (n - 0.5) / 255.0, 1.0);
}`;

// ---------------------------------------------------------------- the nuclei
const VS_NUC = `#version 300 es
in vec2 a_q;
in vec4 a_a; // nucleus (0 is the one followed), and the nucleon's place in it, fm
in vec4 a_b; // proton (0) or neutron (1), its group when the nucleus breaks (0..12 helium, 13 neutron), its place in the group, random
uniform mat4 u_proj;
uniform mat4 u_view;
uniform float u_s; // the breaking, 0 to 1
uniform float u_t;
uniform float u_fade;
uniform vec3 u_eye;
out vec2 v_q;
out vec3 v_col;
out vec3 v_c;
out float v_r;
out float v_a;
float h(float x) { return fract(sin(x * 12.9898) * 43758.5453); }
vec3 fib(float i, float n) {
  float y = 1.0 - (i + 0.5) / n * 2.0, rr = sqrt(1.0 - y * y), th = i * 2.39996323;
  return vec3(cos(th) * rr, y, sin(th) * rr);
}
void main() {
  float id = a_a.x;
  vec3 local = a_a.yzw;
  vec3 centre = vec3(0.0);
  if (id > 0.5) {
    // The other nuclei in the core, close packed and shaking with the heat.
    centre = (vec3(h(id), h(id + 17.0), h(id + 31.0)) - 0.5) * vec3(260.0, 170.0, 220.0);
    if (length(centre) < 26.0) centre = normalize(centre + 0.01) * (26.0 + h(id + 3.0) * 20.0);
    centre += 1.2 * vec3(sin(u_t * 3.1 + id), cos(u_t * 2.7 + id * 1.3), sin(u_t * 2.3 + id * 0.7));
    // None stands in the camera's way.
    if (length(centre - u_eye) < 22.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  }
  vec3 pos = centre + local;
  float g = a_b.y;
  if (id < 0.5) {
    // The followed nucleus breaks: first into thirteen helium nuclei and four neutrons...
    float split = smoothstep(0.27, 0.55, u_s);
    vec3 dir = g < 12.5 ? fib(g, 13.0) : fib(a_b.z, 4.0) * vec3(1.0, -1.0, 1.0);
    vec3 inGroup = g < 12.5 ? fib(a_b.z, 4.0) * 0.95 : vec3(0.0);
    vec3 alphaAt = dir * (5.0 + 17.0 * split);
    vec3 broken = alphaAt + inGroup;
    // ...then each helium nucleus into two protons and two neutrons.
    float apart = smoothstep(0.58, 0.85, u_s);
    broken += inGroup * apart * 5.0 + dir * apart * 4.0;
    pos = mix(local, broken, split);
  }
  // Nothing is drawn right in front of the lens.
  if (length(pos - u_eye) < 8.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  // Electrons are captured by protons: in the end most of the protons become neutrons.
  float neutron = a_b.x > 0.5 ? 1.0 : smoothstep(0.78, 0.95, u_s) * step(0.25, a_b.w);
  v_col = mix(vec3(0.86, 0.3, 0.24), vec3(0.62, 0.67, 0.75), neutron);
  vec4 c = u_view * vec4(pos, 1.0);
  float r = 0.86;
  v_r = r;
  v_c = c.xyz;
  v_q = a_q;
  // Near the lens a nucleon would fill the frame: those fade out as they come close.
  v_a = u_fade * smoothstep(12.0, 34.0, length(pos - u_eye));
  gl_Position = u_proj * vec4(c.xyz + vec3(a_q * r * 1.05, 0.0), 1.0);
}`;
const FS_NUC =
  FS_HEAD +
  `
in vec2 v_q; in vec3 v_col; in vec3 v_c; in float v_r; in float v_a;
uniform mat4 u_proj;
out vec4 o;
void main() {
  vec2 q = v_q * 1.05;
  float d2 = dot(q, q);
  if (d2 > 1.0) discard;
  vec3 n = vec3(q, sqrt(1.0 - d2));
  vec3 L = normalize(vec3(-0.5, 0.6, 0.65));
  float diff = max(dot(n, L), 0.0);
  float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 40.0);
  float rim = pow(1.0 - n.z, 3.0);
  vec3 col = v_col * (0.18 + 0.82 * diff) + vec3(1.0) * spec * 0.45 + vec3(0.55, 0.65, 1.0) * rim * 0.35;
  // Far ones are dimmer, through the hot gas between.
  col *= exp(-max(-v_c.z - 60.0, 0.0) / 260.0);
  vec3 vp = v_c + n * v_r;
  vec4 clip = u_proj * vec4(vp, 1.0);
  gl_FragDepth = clip.z / clip.w * 0.5 + 0.5;
  o = vec4(col, v_a);
}`;

export function compile(gl: WebGL2RenderingContext, vs: string, fs: string) {
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
    const name = gl.getActiveUniform(p, i)!.name;
    u[name] = gl.getUniformLocation(p, name);
  }
  return { p, u };
}

/** An iron-56 nucleus: 26 protons and 30 neutrons, packed. Deterministic. */
function iron(seed: number) {
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 4294967296);
  const pts: number[][] = [];
  let tries = 0;
  while (pts.length < 56 && tries < 20000) {
    tries++;
    const v = [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1];
    const l = Math.hypot(v[0], v[1], v[2]);
    if (l > 1) continue;
    const p = v.map((x) => x * 4.1);
    if (pts.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) > 1.55)) pts.push(p);
  }
  // Centre it, nearest first so the core is solid.
  pts.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
  return pts;
}

export function mountSupernova(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, powerPreference: "high-performance" });
  if (!gl) return null;
  let scene: ReturnType<typeof compile>, nuc: ReturnType<typeof compile>;
  try {
    scene = compile(gl, VS_QUAD, FS_SCENE);
    nuc = compile(gl, VS_NUC, FS_NUC);
  } catch (e) {
    console.warn("supernova: shaders unavailable", e);
    return null;
  }

  const quad = gl.createVertexArray()!;
  gl.bindVertexArray(quad);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const qLoc = gl.getAttribLocation(scene.p, "a_q");
  gl.enableVertexAttribArray(qLoc);
  gl.vertexAttribPointer(qLoc, 2, gl.FLOAT, false, 0, 0);

  // The nuclei: one followed at the centre, and a field of others round it.
  const NUCLEI = 70;
  const shape = iron(7);
  const protons = new Set<number>();
  {
    // 26 of the 56 are protons, spread through the nucleus.
    let s = 99;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 4294967296);
    while (protons.size < 26) protons.add(Math.floor(rnd() * 56));
  }
  // Which group each nucleon leaves in when the followed nucleus breaks: 13 helium nuclei of 2 protons and 2 neutrons, and 4 neutrons.
  const group = new Array(56).fill(0), slot = new Array(56).fill(0);
  {
    const ps = [...protons], ns = [...Array(56).keys()].filter((i) => !protons.has(i));
    for (let g = 0; g < 13; g++) {
      const members = [ps[2 * g], ps[2 * g + 1], ns[2 * g], ns[2 * g + 1]];
      members.forEach((m, k) => ((group[m] = g), (slot[m] = k)));
    }
    ns.slice(26).forEach((m, k) => ((group[m] = 13), (slot[m] = k)));
  }
  const data = new Float32Array(NUCLEI * 56 * 8);
  let o = 0;
  for (let n = 0; n < NUCLEI; n++)
    for (let i = 0; i < 56; i++) {
      const p = shape[i];
      data.set([n, p[0], p[1], p[2], protons.has(i) ? 0 : 1, group[i], slot[i], ((i * 7919 + n * 104729) % 1000) / 1000], o);
      o += 8;
    }
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const corner = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, corner);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const cl = gl.getAttribLocation(nuc.p, "a_q");
  gl.enableVertexAttribArray(cl);
  gl.vertexAttribPointer(cl, 2, gl.FLOAT, false, 0, 0);
  const inst = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, inst);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  for (const [name, off] of [["a_a", 0], ["a_b", 4]] as const) {
    const loc = gl.getAttribLocation(nuc.p, name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 32, off * 4);
    gl.vertexAttribDivisor(loc, 1);
  }
  gl.bindVertexArray(null);

  let w = 0, h = 0;
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const cw = Math.max(1, Math.round(canvas.clientWidth * dpr)), ch = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (cw === w && ch === h) return;
    w = canvas.width = cw;
    h = canvas.height = ch;
  };

  const smooth = (a: number, b: number, x: number) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const proj = new Float32Array(16), view = new Float32Array(16);

  /** `U` is how far through the whole sequence: the star to the remnant take the first 80%, the quarks the rest. */
  function draw(U: number, t: number) {
    const u = Math.min(1, U / 0.8), q = Math.max(0, Math.min(1, (U - 0.8) / 0.2));
    resize();
    gl!.viewport(0, 0, w, h);
    gl!.disable(gl!.DEPTH_TEST);
    gl!.disable(gl!.BLEND);
    gl!.useProgram(scene.p);
    gl!.uniform2f(scene.u.u_res, w, h);
    gl!.uniform1f(scene.u.u_u, u);
    gl!.uniform1f(scene.u.u_t, t);
    gl!.uniform1f(scene.u.u_mode, 0);
    gl!.uniform1f(scene.u.u_q, q);
    // How far the followed nucleus has got through breaking.
    const s = smooth(0.43, 0.67, u);
    gl!.uniform1f(scene.u.u_s, s);
    gl!.bindVertexArray(quad);
    gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);

    // The nuclei, between the core and the bounce.
    const fade = smooth(0.37, 0.43, u) * (1 - smooth(0.66, 0.7, u));
    if (fade > 0.002) {
      // The camera: from far enough to see many nuclei, in to the one that breaks; a slow turn round it.
      const dist = 400 * Math.pow(26 / 400, smooth(0.38, 0.5, u)) * (1 + 3 * smooth(0.64, 0.7, u)) * (1 + 0.55 * smooth(0.5, 0.62, u));
      const a = 0.4 + t * 0.06 + u * 2.0, el = 0.25;
      const eye = [dist * Math.cos(el) * Math.sin(a), dist * Math.sin(el), dist * Math.cos(el) * Math.cos(a)];
      const f = eye.map((v) => -v / dist);
      const sx = f[2], sz = -f[0], sl = Math.hypot(sx, sz);
      const s3 = [sx / sl, 0, sz / sl];
      const up = [s3[1] * f[2] - s3[2] * f[1], s3[2] * f[0] - s3[0] * f[2], s3[0] * f[1] - s3[1] * f[0]];
      view.set([s3[0], up[0], -f[0], 0, s3[1], up[1], -f[1], 0, s3[2], up[2], -f[2], 0, -(s3[0] * eye[0] + s3[2] * eye[2]), -(up[0] * eye[0] + up[1] * eye[1] + up[2] * eye[2]), f[0] * eye[0] + f[1] * eye[1] + f[2] * eye[2], 1]);
      const F = 1 / Math.tan((40 * Math.PI) / 360), near = Math.max(0.5, dist * 0.05), far = dist + 600;
      proj.set([F / (w / h), 0, 0, 0, 0, F, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0]);
      gl!.enable(gl!.DEPTH_TEST);
      gl!.depthMask(true);
      gl!.clear(gl!.DEPTH_BUFFER_BIT);
      gl!.useProgram(nuc.p);
      gl!.uniformMatrix4fv(nuc.u.u_proj, false, proj);
      gl!.uniformMatrix4fv(nuc.u.u_view, false, view);
      gl!.uniform1f(nuc.u.u_s, s);
      gl!.uniform1f(nuc.u.u_t, t);
      gl!.uniform1f(nuc.u.u_fade, fade);
      gl!.uniform3f(nuc.u.u_eye, eye[0], eye[1], eye[2]);
      gl!.enable(gl!.BLEND);
      gl!.blendFunc(gl!.SRC_ALPHA, gl!.ONE_MINUS_SRC_ALPHA);
      gl!.bindVertexArray(vao);
      // Close in, only the followed nucleus and its near neighbours need drawing.
      const count = dist < 60 ? 56 * 12 : NUCLEI * 56;
      gl!.drawArraysInstanced(gl!.TRIANGLE_STRIP, 0, 4, count);
      gl!.disable(gl!.DEPTH_TEST);
      // Light over them: the gamma ray, and the neutrinos.
      gl!.enable(gl!.BLEND);
      gl!.blendFunc(gl!.ONE, gl!.ONE);
      gl!.useProgram(scene.p);
      gl!.uniform1f(scene.u.u_mode, 1);
      gl!.bindVertexArray(quad);
      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
      gl!.disable(gl!.BLEND);
    }
  }
  return { draw };
}
