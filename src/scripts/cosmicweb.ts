/**
 * From the Sun to the edge of what can be seen (Sequence.astro): one
 * continuous zoom out, as the page is scrolled through it. The planets and
 * their orbits; the Oort cloud; the nearest stars; our arm of the Milky Way and
 * the whole galaxy; the Local Group; the Laniakea supercluster; the cosmic web;
 * and the observable universe, ringed by the cosmic microwave background.
 *
 * One full-screen pass. The frame's size is kept as a logarithm, `L`, the
 * base-10 log of half its height in light-years, so each power of ten takes
 * about as much scrolling as the next. Each scale is its own layer, drawn in
 * its own units (AU, thousands of AU, light-years, thousands, millions,
 * hundreds of millions, billions) so the numbers in the shader stay small, and
 * each fades in by `L` as the one before it shrinks to a point. The camera
 * stays on the Sun until the galaxy, moves to its centre, then to the middle
 * of the Local Group, then to the centre of Laniakea, and comes back to us at
 * the end: the observable universe is a sphere centred on the observer.
 */
import { compile, NOISE } from "./supernova";

const FS = `#version 300 es
precision highp float;
${NOISE}
out vec4 o;
uniform vec2 u_ctr; // where on the canvas the frame is centred, px
uniform float u_unit; // px for one unit of p (half the frame's shorter side)
uniform float u_wr; // the world's turn on the screen (a portrait screen turns it a quarter)
uniform float u_ct; // how much the galactic plane is squashed by its tilt
uniform float u_t;
uniform float u_sky; // the far sky behind the Solar System
uniform vec2 u_sun; // where the Sun is on the screen, p
uniform float u_sunA; // how bright the Sun is drawn
uniform vec4 u_sol; // AU per p, the ecliptic's squash, weight
uniform vec3 u_pl[8]; // planets on the ecliptic, AU, and how bright
uniform vec3 u_plc[8];
uniform vec4 u_orb[8]; // semi-major axis AU, eccentricity, longitude of perihelion
uniform vec2 u_oort; // thousands of AU per p, weight
uniform vec4 u_ns[24]; // the nearest stars on the screen, p, and how bright
uniform vec3 u_nc[24];
uniform float u_nw;
uniform vec4 u_gal; // the galaxy: the frame centre and size in thousands of light-years from its centre; weight
uniform float u_stw; // resolved stars
uniform vec4 u_lg; // the Local Group, millions of light-years from the Sun
uniform vec4 u_web; // the web, in its own cells of 100 million light-years
uniform vec4 u_obs; // the observable universe, billions of light-years from us
uniform vec4 u_lan; // the centre of Laniakea in web cells, its mean radius, weight
uniform vec3 u_mark; // a ring round where we are: screen p, weight

const float PI = 3.14159265;
vec3 tone(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
mat2 rot(float a) { return mat2(cos(a), sin(a), -sin(a), cos(a)); }
// Value noise summed over octaves, each turned against the last, so no grid shows through when it is
// looked at closely (clouds of dust and gas, seen from a few light-years to thousands).
float fbr(vec2 p, int n) {
  float s = 0.0, a = 0.5;
  for (int k = 0; k < 9; k++) {
    if (k >= n) break;
    s += a * noise3(vec3(p, 1.7 * float(k)));
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + 3.1;
    a *= 0.5;
  }
  return s;
}

// An integer hash: exact on every GPU, and the same in JS, so where the web's
// threads fall can be known before it is drawn.
uvec2 pcg(uvec2 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * 1664525u; v.y += v.x * 1664525u;
  v ^= v >> 16u;
  v.x += v.y * 1664525u; v.y += v.x * 1664525u;
  v ^= v >> 16u;
  return v;
}
vec2 h22(vec2 c) { uvec2 v = pcg(uvec2(ivec2(c) + 40000)); return vec2(v >> 8u) / 16777216.0; }
vec4 h24(vec2 c, float k) { uvec2 a = pcg(uvec2(ivec2(c) + 40000)), b = pcg(a ^ uvec2(uint(int(k * 7919.0) + 1000000), 0x9e3779b9u)); return vec4(vec2(a >> 8u), vec2(b >> 8u)) / 16777216.0; }

// A star's colour from a number 0 to 1 drawn for it: most are cool orange dwarfs
// and giants, fewer are white like the Sun, a few are hot and blue. \`young\`
// raises the share of blue ones, as in the spiral arms.
vec3 starHue(float h, float young) {
  float k = clamp(h + 0.25 * young, 0.0, 1.0);
  vec3 c = mix(vec3(1.0, 0.62, 0.38), vec3(1.0, 0.86, 0.7), smoothstep(0.35, 0.65, k));
  c = mix(c, vec3(0.98, 0.97, 1.0), smoothstep(0.7, 0.85, k));
  return mix(c, vec3(0.66, 0.77, 1.0), smoothstep(0.88, 0.98, k));
}

// Points too small to see as anything but points (stars, or whole galaxies),
// at whatever scale the frame is: a few octaves of cells, each at least a few
// pixels across with at most one source in it, faded in as their cells grow
// and out as they become the diffuse light they add up to. \`w\` is in any unit,
// \`px\` is one pixel in it, \`sq\` keeps them round when the plane is tilted.
vec3 dots(vec2 w, float px, float dens, float young, float seed, vec2 sq, float mode) {
  vec3 acc = vec3(0.0);
  float e0 = log2(px * 4.0), fe = floor(e0), fr = e0 - fe;
  for (int i = 0; i < 4; i++) {
    float x = float(i) - fr;
    float wt = smoothstep(-1.0, 0.0, x) * (1.0 - smoothstep(2.0, 3.0, x));
    float cell = exp2(fe + float(i));
    vec2 q = w / cell, c = floor(q);
    vec4 h = h24(c, fe + float(i) + seed);
    if (h.x > dens) continue;
    vec2 d = (q - c - 0.2 - 0.6 * h.yz) * cell / px * sq;
    float lum = (0.05 + 1.9 * pow(h.w, 9.0)) * pow(1.5, x) * wt;
    float r2 = dot(d, d);
    vec3 hue = mode < 0.5 ? starHue(fract(h.w * 13.7 + h.x * 3.1), young) : mix(vec3(1.0, 0.8, 0.6), vec3(0.82, 0.88, 1.0), step(0.5 + 0.35 * young, fract(h.w * 31.0)));
    acc += hue * lum * (exp(-r2 / 0.7) + 0.04 * exp(-sqrt(r2) / 2.0));
  }
  return acc;
}

// ---- the far sky: what stands behind the Solar System, too far to move ----
vec3 sky(vec2 p) {
  vec3 c = vec3(0.0);
  for (int l = 0; l < 2; l++) {
    float sc = l == 0 ? 16.0 : 42.0;
    vec2 q = p * sc + 17.0, cell = floor(q);
    vec2 at = vec2(hash2(cell + 1.7), hash2(cell + 4.3)) * 0.7 + 0.15;
    float m = hash2(cell + 9.1);
    float on = step(l == 0 ? 0.55 : 0.7, hash2(cell + 2.9));
    float d = length(q - cell - at) * u_unit / sc;
    float b = l == 0 ? pow(m, 6.0) * 1.1 + 0.05 : pow(m, 4.0) * 0.18 + 0.025;
    c += starHue(hash2(cell + 5.5), 0.1) * on * b * (exp(-d * d / 0.7) + 0.05 * exp(-d / 2.0) * b);
  }
  // The Milky Way seen from inside it: a faint band of unresolved stars, broken by dust.
  float band = exp(-pow((p.y * 0.94 + p.x * 0.34 + 0.2) / 0.32, 2.0));
  float dust = fbm3(vec3(p * 3.0, 4.0), 5);
  c += vec3(0.9, 0.85, 0.78) * band * (0.006 + 0.018 * smoothstep(0.35, 0.7, dust)) * (0.6 + 0.4 * fbm3(vec3(p * 14.0, 1.0), 3));
  return c;
}

// ---- 1: the planets ----
vec3 solar(vec2 s) {
  float S = u_sol.x, ce = u_sol.y, px = S / u_unit;
  vec2 e = vec2(s.x, s.y / ce) * S; // on the plane of the planets' orbits, AU
  float r = length(e), th = atan(e.y, e.x);
  vec3 col = vec3(0.0);
  // How far one pixel on the screen is on the plane, along the radius: the orbits stay hairlines.
  float g = length(vec2(e.x, e.y * ce)) / max(r, 1e-6) * u_unit / S;
  for (int i = 0; i < 8; i++) {
    vec4 ob = u_orb[i];
    float ro = ob.x * (1.0 - ob.y * ob.y) / (1.0 + ob.y * cos(th - ob.z));
    float d = abs(r - ro) * g;
    col += vec3(0.55, 0.6, 0.7) * exp(-d * d / 0.55) * 0.16;
    // The planet itself: a point, lit by the Sun.
    vec2 at = vec2(u_pl[i].x, u_pl[i].y * ce) / S;
    float dp = length(s - at) * u_unit;
    col += u_plc[i] * u_pl[i].z * (exp(-dp * dp / 1.6) * 1.3 + 0.06 * exp(-dp / 3.0));
  }
  // The asteroid belt and, past Neptune, the Kuiper belt: dust and ice, far too thin to see, drawn faintly.
  float belt = exp(-pow((r - 2.75) / 0.45, 2.0)) * 0.6 + exp(-pow((r - 43.0) / 6.0, 2.0)) * (0.35 + 0.5 * smoothstep(39.0, 40.0, r) * smoothstep(48.0, 47.0, r));
  col += dots(e, px / ce, belt * 0.6, 0.0, 3.0, vec2(1.0, ce), 1.0) * 0.07;
  return col;
}

// ---- 2: the Oort cloud: a shell of icy bodies, thousands to perhaps 100,000 AU out ----
vec3 oort(vec2 s) {
  float S = u_oort.x;
  vec2 k = s * S; // thousands of AU
  float R = length(k);
  // How much of the shell lies along each line of sight: thick to about 100,000 AU,
  // densest near the inner edge, where the inner cloud flattens towards the planets' plane.
  // A sphere's worth of shell seen through: the chord from 5,000 to 100,000 AU, as a fraction of its width.
  float shell = (sqrt(max(1e4 - R * R, 0.0)) - sqrt(max(25.0 - R * R, 0.0))) / 100.0;
  float inner = exp(-pow(length(k * vec2(1.0, 2.2)) / 14.0, 2.0)) * smoothstep(0.5, 2.5, R);
  // (\`dots\` puts at most one point in a cell a few pixels wide; closer in, those cells are smaller, so
  // fewer of them are filled, to keep the number per thousand AU the same.)
  float dens = clamp(shell * 0.45 + inner * 0.6, 0.0, 1.0) * clamp(S * S / 9000.0, 0.0, 1.0);
  vec3 col = vec3(0.6, 0.68, 0.8) * (shell * 0.03 + inner * 0.03) * (0.55 + 0.7 * fbm3(vec3(k * 0.04, 2.0), 4));
  // Comets on long orbits, turning slowly with the frame: two layers, a little apart in depth.
  float px = S / u_unit;
  for (int l = 0; l < 2; l++) {
    float a = u_t * (0.006 + 0.004 * float(l)) + float(l) * 1.7;
    col += dots(rot(a) * k + float(l) * 31.0, px, dens, 0.0, 11.0 + float(l), vec2(1.0), 0.0) * vec3(0.72, 0.8, 0.92) * 0.5;
  }
  return col;
}

// ---- 3: the nearest stars, placed where they are ----
vec3 nearStars(vec2 p) {
  vec3 col = vec3(0.0);
  for (int i = 0; i < 24; i++) {
    vec4 s = u_ns[i];
    if (s.z <= 0.0) continue;
    float d = length(p - s.xy) * u_unit;
    float b = s.z;
    col += u_nc[i] * b * (exp(-d * d / (1.0 + 2.2 * b)) * 2.2 + 0.1 * exp(-d / (3.0 + 5.0 * b)) + 0.02 * exp(-d / (14.0 * b)));
  }
  return col;
}

// ---- 4, 5: the Milky Way ----
// A barred spiral, in thousands of light-years from its centre. The Sun is 26,000 light-years out,
// between two arms, in a short spur of its own. The arms are logarithmic spirals pitched at 13 degrees.
const float TANP = 0.2309;
const vec2 SUN_G = vec2(0.0, -26.0);
const float P0 = -1.5708 - 3.3487 - 0.7854; // the arms' phase, set so the Sun falls between Perseus and Sagittarius
const float BAR = 0.47; // the bar's angle from the line to the Sun, about 27 degrees
// Some of the nebulae near us that make stars: Orion, the Lagoon, the Eagle, Carina; thousands of ly from the Sun.
const vec4 NEB[4] = vec4[4](vec4(0.65, -1.18, 0.11, 1.0), vec4(-0.43, 4.08, 0.06, 0.8), vec4(-1.67, 5.45, 0.05, 0.7), vec4(7.15, 2.26, 0.14, 1.2));

vec3 milkyWay(vec2 g, float pxk, out float starDens, out float youth) {
  float r = length(g), th = atan(g.y, g.x);
  starDens = 0.0;
  youth = 0.0;
  if (r > 64.0) return vec3(0.0); // past the edge of the disc there is nothing to draw
  vec2 lc = g - SUN_G; // near the Sun the fine noise is taken from here, where the numbers are small
  float zl = log2(2.0 / pxk);
  int nd = int(clamp(zl, 2.0, 9.0)); // more octaves as the frame closes in
  // The old stars: a smooth exponential disc, a boxy bulge, and the bar through it.
  float disc = exp(-r / 9.5) * (1.0 - smoothstep(48.0, 64.0, r));
  vec2 b = rot(BAR) * g;
  float bar = exp(-pow(length(b / vec2(11.0, 3.4)), 1.7) * 2.3);
  float bulge = exp(-pow(r / 2.4, 1.15) * 2.0);
  // The arms: two major (Perseus, Scutum-Centaurus) and two minor (Sagittarius, Norma), and the Orion spur.
  float ph = th - log(max(r, 0.3) / 12.0) / TANP;
  float on = smoothstep(8.0, 14.0, r) * (1.0 - smoothstep(48.0, 62.0, r));
  float a2 = 2.0 * (ph - P0);
  float arms = (pow(0.5 + 0.5 * cos(a2), 5.0) + 0.6 * pow(0.5 - 0.5 * cos(a2), 8.0)) * on;
  float sp = mod(th + 1.5708 - log(max(r, 0.1) / 26.0) / 0.47 + PI, 2.0 * PI) - PI;
  arms += exp(-pow(r * sp * 0.42 / 1.7, 2.0)) * exp(-pow((r - 26.5) / 5.5, 2.0)) * 0.5;
  // Along an arm, gas and young stars gather into clumps; following the spiral stretches them along it.
  // (Close in, that stretching would show as streaks, so it gives way to clouds with no direction.)
  vec2 qs = r * vec2(cos(ph), sin(ph));
  float sheared = 1.0 - smoothstep(6.0, 7.5, zl);
  float clump = fbr(g * 0.32, 4);
  if (sheared > 0.0) clump = mix(clump, fbm3(vec3(qs * 0.22, 1.3), 4), 0.55 * sheared);
  // Close in, the disc breaks up into star clouds, much as the Milky Way looks in a long exposure from Earth.
  float fine = nd > 4 ? fbr(lc * 1.6, nd - 2) : 0.5;
  float young = arms * exp(-r / 26.0) * (0.15 + 2.6 * pow(clump, 2.4)) * (0.5 + 1.0 * fine) * mix(1.0, 0.45, smoothstep(6.5, 8.0, zl));
  // Dust: lanes on the inner edge of each arm, feathered across it; along the bar's leading edges; and,
  // close in, dark clouds through the whole disc. Less in the Local Bubble, a hot, thin cavity some
  // hundreds of light-years round the Sun.
  float lanes = pow(0.5 + 0.5 * cos(a2 - 0.42), 14.0) + 0.7 * pow(0.5 + 0.5 * cos(a2 - PI - 0.42), 16.0);
  float feather = (sheared > 0.0 ? mix(0.62, ridge3(vec3(qs * 0.5, 3.3), 4), sheared) : 0.62) * (0.7 + 0.6 * fbr(g * 0.6, 3));
  float tau = (lanes * on * 2.2 + arms * 0.35 + 0.4 * disc * smoothstep(3.0, 7.0, r)) * pow(feather, 2.0) * 2.2;
  float dl = b.y - 1.25 * clamp(b.x / 3.0, -1.0, 1.0);
  tau += exp(-dl * dl / 0.22) * exp(-pow(b.x / 8.5, 2.0)) * smoothstep(0.8, 2.5, abs(b.x)) * 1.1 * (0.5 + feather);
  if (zl > 6.5) {
    vec2 wq = lc * 2.4 + 0.8 * vec2(fine, fbr(lc * 1.9 + 5.0, 4));
    float cl = fbr(wq, nd - 1);
    float threads = pow(1.0 - abs(2.0 * fbr(wq * 1.7 + 9.0, min(nd - 1, 7)) - 1.0), 10.0);
    tau += (smoothstep(0.5, 0.75, cl) * 2.2 + threads * 0.9) * smoothstep(6.5, 8.0, zl);
  }
  tau *= mix(0.12, 1.0, smoothstep(0.1, 0.5, length(lc)));
  vec3 ext = exp(-tau * vec3(0.7, 1.0, 1.4)); // dust takes more blue light than red, and reddens what it does not hide
  float clouds = mix(0.8 + 0.4 * fine, 0.15 + 1.6 * fine * fine, smoothstep(6.5, 8.0, zl));
  vec3 old = vec3(1.0, 0.82, 0.62) * (disc * (0.5 + 0.4 * arms) + bar * 1.0 + bulge * 2.3) * clouds;
  vec3 col = (old + vec3(0.6, 0.73, 1.0) * young * 1.1) * ext;
  // Nebulae where stars are being born: hydrogen glowing red round young clusters, ragged, partly
  // hidden by the dust they formed from.
  vec2 hc = floor(g / 0.8);
  vec4 hh = vec4(hash2(hc), hash2(hc + 3.1), hash2(hc + 7.7), hash2(hc + 9.4));
  vec2 hat = (hc + 0.2 + 0.6 * hh.yz) * 0.8;
  float hr = length(hat), ha2 = 2.0 * (atan(hat.y, hat.x) - log(max(hr, 0.3) / 12.0) / TANP - P0) + 0.3;
  float harm = (pow(0.5 + 0.5 * cos(ha2), 6.0) + 0.6 * pow(0.5 - 0.5 * cos(ha2), 9.0)) * smoothstep(9.0, 15.0, hr) * (1.0 - smoothstep(40.0, 52.0, hr));
  vec3 neb = vec3(0.0);
  if (hh.x < harm * 0.75) {
    float R = 0.04 + 0.16 * pow(hh.w, 2.0);
    vec2 d = (g - hat) / R;
    float lump = nd > 4 ? fbr(d * 1.6 + hh.w * 9.0, min(nd - 2, 5)) : 0.55;
    neb += vec3(0.95, 0.3, 0.36) * smoothstep(0.25, 0.75, lump * exp(-dot(d, d) * 0.9)) * 0.7 + vec3(0.75, 0.85, 1.0) * exp(-dot(d, d) * 30.0) * 0.5;
  }
  for (int i = 0; i < 4; i++) {
    vec2 d = (lc - NEB[i].xy) / NEB[i].z;
    float l2 = dot(d, d);
    if (l2 > 16.0) continue;
    vec2 wd = d + 0.5 * vec2(fbm3(vec3(d * 1.3, 1.0 + float(i)), 4), fbm3(vec3(d * 1.3, 7.0 + float(i)), 4));
    float lump = fbr(wd * 2.2 + float(i) * 3.0, min(nd, 6));
    neb += vec3(0.95, 0.32, 0.38) * smoothstep(0.2, 0.8, lump * exp(-dot(wd, wd) * 0.8)) * NEB[i].w + vec3(0.8, 0.88, 1.0) * exp(-l2 * 60.0) * 0.8;
  }
  col += neb * (0.3 + 0.7 * ext.r);
  float lum = dot(old + young, vec3(0.33));
  starDens = clamp(lum * 3.0, 0.0, 1.0) * dot(ext, vec3(0.2, 0.5, 0.3));
  youth = clamp(young / max(lum, 1e-3), 0.0, 1.0);
  return col * 0.7;
}

// ---- 6: the Local Group ----
// Another spiral: a disc, a bulge, two arms and their dust, and (for Andromeda) its ring of new stars.
vec3 spiral(vec2 q, float h, float ring, float flock, float seed) {
  float r = length(q) / h, th = atan(q.y, q.x);
  float disc = exp(-r) * (1.0 - smoothstep(4.0, 6.0, r)) + 0.025 * exp(-r / 3.0); // and a faint halo of old stars
  float bulge = exp(-pow(r / 0.22, 1.1) * 1.6);
  float ph = th - log(max(r, 0.05)) / 0.27 + seed;
  float arms = mix(pow(0.5 + 0.5 * cos(2.0 * ph), 3.0), fbm3(vec3(q / h * 2.2, seed), 4), flock) * smoothstep(0.3, 0.9, r);
  float rg = exp(-pow((r - 1.9) / 0.28, 2.0)) * ring;
  float dust = pow(0.5 + 0.5 * cos(2.0 * ph - 0.5), 10.0) * smoothstep(0.4, 1.0, r) * (1.0 - flock) + rg * 0.6;
  vec3 ext = exp(-dust * 1.2 * vec3(0.7, 1.0, 1.4));
  vec3 col = vec3(1.0, 0.82, 0.62) * (disc * (0.5 + 0.4 * arms) + bulge * 1.7) + vec3(0.6, 0.74, 1.0) * (arms * disc * 0.9 + rg * 0.5);
  return col * ext;
}

// Positions in millions of light-years from the Sun, sizes in thousands: Andromeda, the Triangulum Galaxy,
// the Large and Small Magellanic Clouds.
uniform vec4 u_gx[4]; // centre, scale length, position angle
const vec4 GXS[4] = vec4[4](vec4(0.38, 0.6, 1.0, 0.0), vec4(0.62, 0.15, 0.0, 2.0), vec4(0.85, 0.35, 0.0, 4.0), vec4(0.55, 0.0, 0.0, 6.0)); // tilt, flocculence, ring, seed

vec3 localGroup(vec2 w, float pxk) {
  vec3 col = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    vec4 G = u_gx[i];
    vec2 q = (w - G.xy) * 1000.0;
    if (length(q) > G.z * 12.0) continue;
    q = rot(G.w) * q;
    q.y /= GXS[i].x;
    vec3 c = spiral(q, G.z, GXS[i].z, GXS[i].y, GXS[i].w) * 3.0;
    if (i >= 2) {
      // The Magellanic Clouds: barred and irregular, torn by the Milky Way, with bright nebulae.
      float lump = fbm3(vec3(q / G.z * 1.3, GXS[i].w), 4);
      c = vec3(0.78, 0.82, 1.0) * exp(-length(q / G.z) * 1.2) * (0.3 + 1.4 * lump * lump) + vec3(1.0, 0.35, 0.45) * pow(lump, 6.0) * 2.0 * exp(-length(q / G.z));
    }
    // A galaxy smaller than a pixel still shines: its light is spread over one.
    float blur = pxk / G.z;
    col += c * mix(1.0, 0.3, smoothstep(0.3, 2.0, blur)) + vec3(1.0, 0.88, 0.75) * exp(-dot(q, q) / (pxk * pxk * 1.5)) * smoothstep(0.5, 3.0, blur) * 0.5;
  }
  // The small ones: dwarf galaxies round the two giants, faint smudges of old stars, and Andromeda's two
  // close companions, M32 and NGC 205.
  for (int i = 0; i < 26; i++) {
    float fi = float(i);
    vec2 host = (i < 2 || i % 2 == 1) ? u_gx[0].xy : vec2(0.0, 0.026);
    float a = hash2(vec2(fi, 3.0)) * 6.283, rr = i < 2 ? 0.03 + 0.012 * fi : 0.08 + 0.75 * pow(hash2(vec2(fi, 5.0)), 1.4);
    vec2 at = host + rr * vec2(cos(a), sin(a));
    float size = (1.0 + 3.0 * hash2(vec2(fi, 9.0))) * (i < 2 ? 1.6 : 1.0);
    float d = length(w - at) * 1000.0;
    float sz = sqrt(size * size + pxk * pxk);
    col += vec3(1.0, 0.86, 0.7) * exp(-d * d / (sz * sz)) * (size * size) / (sz * sz) * (i < 2 ? 0.9 : 0.45);
  }
  return col;
}

// ---- 7, 8, 9: the web ----
const vec2 WEB0 = vec2(11.131, 10.73); // the Local Group, in web cells: a spot on a filament, found once by a search over these same cells
// The cells are bent, twice, so their walls curve the way filaments do instead of running straight.
vec2 warp(vec2 x) {
  vec2 a = x + 0.3 * vec2(sin(x.y * 1.37 + 0.6) + 0.5 * sin(x.x * 2.71 + x.y * 0.9 + 1.7), sin(x.x * 1.21 + 2.3) + 0.5 * sin(x.y * 2.43 - x.x * 0.7 + 0.4));
  return a + 0.06 * vec2(sin(a.y * 4.3 + a.x * 1.3 + 0.9), sin(a.x * 3.9 - a.y * 1.1 + 2.6));
}

// The walls between cells: the distance to the nearest and the next nearest (both small at a node, where
// walls meet), and for each, a number for how much matter it has gathered. Each wall is the edge between
// two cells, so its number is drawn for that pair and is the same from either side.
vec4 cells(vec2 x, out float e3) {
  vec2 n = floor(x), f = x - n, mg = vec2(0.0), mr = vec2(0.0);
  float md = 8.0;
  for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j)), r = g + h22(n + g) - f;
      float d = dot(r, r);
      if (d < md) { md = d; mr = r; mg = g; }
    }
  float e1 = 8.0, e2 = 8.0, k1 = 0.0, k2 = 0.0;
  e3 = 8.0;
  vec2 a = n + mg;
  for (int j = -2; j <= 2; j++)
    for (int i = -2; i <= 2; i++) {
      vec2 g = mg + vec2(float(i), float(j)), r = g + h22(n + g) - f, dr = r - mr;
      if (dot(dr, dr) > 1e-5) {
        float e = dot(0.5 * (mr + r), normalize(dr));
        vec2 c = n + g;
        float k = h22((a + c) * 5.0 + abs(a - c)).x;
        if (e < e1) { e3 = e2; e2 = e1; k2 = k1; e1 = e; k1 = k; } else if (e < e2) { e3 = e2; e2 = e; k2 = k; } else if (e < e3) e3 = e;
      }
    }
  return vec4(e1, e2, k1, k2);
}

// Where the matter is, in cells of 100 million light-years: filaments along the walls between voids,
// a few thick and bright, most thin and faint; clusters where they meet; and fainter tendrils reaching
// into the voids. A filament thinner than a pixel is widened to one and dimmed to match, so the light
// it carries is kept. Returns the filaments, the clusters, and a broad halo for the dark matter.
vec3 webField(vec2 w, float pxc) {
  const float CELL = 2.0;
  float blur = smoothstep(0.035, 0.22, pxc / CELL);
  vec3 mean = vec3(0.06, 0.004, 0.3);
  // On scales of a billion light-years the web is richer in some places and poorer in others
  // (superclusters, supervoids), though on the largest scales it evens out.
  float big = 0.3 + 1.4 * smoothstep(0.32, 0.68, fbm3(vec3(w * 0.09, 2.0), 3));
  if (blur >= 1.0) return mean * big;
  float e3;
  vec4 c = cells(warp(w / CELL), e3);
  vec2 e = c.xy * CELL;
  e3 *= CELL;
  float m1 = 0.04 + 1.4 * pow(c.z, 3.5), m2 = 0.04 + 1.4 * pow(c.w, 3.5);
  // Thicker where more has gathered; and beaded along its length, galaxies in groups.
  float sf = 0.025 + 0.05 * c.z, s = sqrt(sf * sf + 0.6 * pxc * pxc);
  float bead = mix(0.55 + 0.9 * fbm3(vec3(w * 9.0, 1.0), 3), 1.0, smoothstep(0.015, 0.05, pxc));
  float fil = m1 * sf / s * (exp(-abs(e.x) / s) * 0.7 + exp(-e.x * e.x / (2.0 * s * s)) * 0.5) * bead * (0.45 + 1.4 * exp(-e.y / 0.45)); // denser towards the clusters
  // Clusters: where three walls meet, as heavy as the walls that feed them. (The squared distances to
  // three lines meeting at a point add up to one and a half times the squared distance to the point,
  // whatever the angles, near enough: so the glow is round.)
  float sn = 0.035 + 0.03 * (c.z + c.w), sN = sqrt(sn * sn + 0.6 * pxc * pxc);
  float rn2 = (e.x * e.x + e.y * e.y + e3 * e3) / 1.5;
  float node = pow(m1 + m2, 1.5) * (sn * sn) / (sN * sN) * (exp(-rn2 / (2.0 * sN * sN)) + 0.25 * exp(-sqrt(rn2) / (sN * 2.5)));
  // Tendrils: a finer net, faint, strongest near the big filaments.
  float bt = smoothstep(0.08, 0.3, pxc / 0.55), ten = 0.004;
  if (bt < 1.0) {
    vec2 tq = w / 0.55 + 7.31, tn = floor(tq), tf = tq - tn;
    float d1 = 8.0, d2 = 8.0;
    vec2 c1 = vec2(0.0);
    for (int j = -1; j <= 1; j++)
      for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        float d = length(g + h22(tn + g) - tf);
        if (d < d1) { d2 = d1; d1 = d; c1 = tn + g; } else if (d < d2) d2 = d;
      }
    float te = (d2 - d1) * 0.5 * 0.55, st = 0.012, s3 = sqrt(st * st + 0.6 * pxc * pxc);
    ten = mix((0.04 + 0.25 * pow(h22(c1 * 3.0 + 11.0).x, 2.0)) * st / s3 * exp(-te * te / (2.0 * s3 * s3)), ten, bt);
  }
  fil += ten * exp(-e.x / 0.5) * bead;
  vec3 res = vec3(fil, node, exp(-e.x / 0.35) * (0.4 + m1));
  return mix(res, mean, blur) * big;
}

vec3 web(vec2 w, float pxc, float lookback) {
  vec3 f = webField(w, pxc);
  float fil = f.x, node = f.y;
  // The Local Group is drawn on its own; nothing else is put where it is.
  float near = smoothstep(0.012, 0.03, length(w - WEB0));
  // Laniakea's centre, the Great Attractor: a broad excess of mass that the galaxies round it fall towards.
  float ga = exp(-dot(w - u_lan.xy, w - u_lan.xy) / 0.3);
  fil *= 1.0 + 1.2 * ga;
  node *= 1.0 + 3.0 * ga;
  // At most one galaxy to a cell a few pixels wide: closer in than about 400 million light-years across,
  // fewer cells are filled, so the number of galaxies in a given volume stays the same.
  float dens = clamp((fil * 3.0 + node * 3.0 + 0.008 + 0.12 * ga) * min(pxc * pxc / 4e-5, 1.0), 0.0, 1.0) * near;
  // Galaxies, as points: ellipticals (gold) gather in the clusters, spirals (white) along the threads.
  vec3 col = dots(w, pxc, dens, clamp(1.0 - node * 3.0, 0.0, 1.0), 21.0, vec2(1.0), 1.0) * 0.6;
  // And the light of all those too small to tell apart, which takes over as the frame widens.
  float diffuse = smoothstep(0.002, 0.05, pxc);
  col += (vec3(1.0, 0.86, 0.7) * fil * 0.24 * diffuse + vec3(1.0, 0.8, 0.6) * node * (0.12 + 0.4 * diffuse)) * near;
  // Dark matter: most of the mass, giving no light. Drawn as a faint, cool haze round the threads.
  col += vec3(0.3, 0.38, 0.8) * f.z * 0.025 * smoothstep(0.003, 0.03, pxc);
  return col * lookback;
}

// The cosmic microwave background, as a shell round us at the distance its light has come from
// (about 45.7 billion light-years, as things are now), seen from outside it: brightest at its rim,
// where we look along it. It is drawn in the colour it had when it was released, at about 3,000
// degrees; now it is microwaves. Its unevenness, a few parts in 100,000, is drawn far stronger.
vec3 cmb(vec2 x, float pxg) {
  const float R = 45.7;
  float r = length(x);
  if (r > R + 6.0 * pxg + 1.0) return vec3(0.0);
  float z = sqrt(max(R * R - r * r, 0.0));
  float thick = 0.25 + pxg; // in billions of light-years, at least a pixel
  // How much of the shell lies along the line of sight: both sides, front and back.
  float path = min(sqrt(max((R + thick) * (R + thick) - r * r, 0.0)) - z, 4.0 * thick) / thick;
  vec3 front = vec3(x, z) / R, back = vec3(x, -z) / R;
  // (Away from the rim the shell is too faint for its texture to show, so it is not worked out there.)
  float tex = 0.5;
  if (r > 0.7 * R) {
    float spots = 0.5 * (fbm3(front * 20.0 + 3.0, 5) + fbm3(back * 20.0 + 3.0, 5));
    float rim = fbm3(vec3(x / R * 20.0, 3.0), 5);
    tex = mix(spots, rim, smoothstep(0.85, 1.0, r / R));
  }
  vec3 hue = vec3(1.0, 0.7, 0.42);
  float face = pow(path / 4.0, 2.0);
  return hue * (face * 0.22 + 0.012) * smoothstep(R + thick, R, r - pxg) * (1.0 + 1.6 * (tex - 0.5));
}

// A hairline, a pixel wide, at distance \`d\` (px) from a curve.
float hair(float d) { return exp(-d * d / 0.6); }

void main() {
  vec2 p = (gl_FragCoord.xy - u_ctr) / u_unit;
  vec2 v = rot(u_wr) * vec2(p.x, p.y / u_ct); // a direction on the plane of the galaxy (and the web)
  vec2 sq = vec2(1.0, u_ct);
  vec3 col = vec3(0.0);

  if (u_sky > 0.001) col += sky(p) * u_sky;
  if (u_sol.z > 0.001) col += solar(p - u_sun) * u_sol.z;
  if (u_oort.y > 0.001) col += oort(p - u_sun) * u_oort.y;

  if (u_gal.w > 0.001 || u_stw > 0.001) {
    vec2 g = u_gal.xy + v * u_gal.z;
    float pxk = u_gal.z / u_unit, dens, youth;
    vec3 mw = milkyWay(g, pxk, dens, youth);
    col += mw * u_gal.w;
    // The stars of the disc, one at a time, as many as the light says are there.
    if (u_stw > 0.001) col += dots((g - SUN_G) * 1000.0, pxk * 1000.0, mix(0.04 * smoothstep(1.0, 0.1, u_gal.z), 0.85, dens), youth, 1.0, sq, 0.0) * u_stw * 0.8;
  }
  if (u_lg.w > 0.001) col += localGroup(u_lg.xy + v * u_lg.z, u_lg.z / u_unit * 1000.0) * u_lg.w;

  if (u_web.w > 0.001) {
    vec2 w = u_web.xy + v * u_web.z;
    float pxc = u_web.z / u_unit;
    // Far out we see the past: galaxies thin out towards the first ones, about 32 billion light-years
    // away as they are now; beyond them are the dark ages, and then the cosmic microwave background.
    vec2 x = u_obs.xy + v * u_obs.z;
    float rG = length(x);
    float lb = mix(1.0, 1.0 - smoothstep(24.0, 33.0, rG), u_obs.w);
    if (lb > 0.001) col += web(w, pxc, lb) * u_web.w;
    if (u_obs.w > 0.001) col += cmb(x, u_obs.z / u_unit) * u_obs.w;
  }

  if (u_nw > 0.001) col += nearStars(p) * u_nw;

  // The Sun: a point too bright to show as it is, with the soft halo a lens gives a bright star.
  float ds = length(p - u_sun) * u_unit;
  if (u_sunA > 0.001) col += vec3(1.0, 0.93, 0.83) * u_sunA * (exp(-ds * ds / 2.2) * 1.4 + 0.05 * exp(-ds / 5.0) + 0.012 * exp(-ds / 26.0));

  // Where we are, once the Sun is too small to find: a thin ring.
  if (u_mark.z > 0.001) col += vec3(0.8, 0.85, 0.9) * hair(abs(length(p - u_mark.xy) * u_unit - 9.0)) * 0.22 * u_mark.z;
  // Laniakea's edge: where galaxies stop flowing towards its centre and flow elsewhere instead.
  if (u_lan.w > 0.001) {
    vec2 w = u_web.xy + v * u_web.z - u_lan.xy;
    float a = atan(w.y, w.x);
    float rb = u_lan.z * (1.0 + 0.11 * sin(3.0 * a - 1.26) + 0.06 * sin(5.0 * a + 2.1) + 0.035 * sin(9.0 * a + 0.3));
    float d = (length(w) - rb) / (u_web.z / u_unit) * u_ct;
    col += vec3(0.8, 0.85, 0.95) * hair(d) * 0.2 * u_lan.w;
  }

  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  o = vec4(tone(col) + (n - 0.5) / 255.0, 1.0);
}`;

const VS = `#version 300 es
in vec2 a_q;
void main() { gl_Position = vec4(a_q, 0.0, 1.0); }`;

// ---------------------------------------------------------------- the zoom
// Where the frame is at each point of the scroll: [U, L], L the log of half its height in light-years.
// Each step is a short, slow stretch; between them the zoom runs on.
const KEYS: [number, number][] = [
  [0, -3.22], [0.05, -3.17], // the planets: Neptune 30 AU out
  [0.15, 0.24], [0.18, 0.32], // the Oort cloud, out to about 1.6 light-years
  [0.26, 1.1], [0.29, 1.18], // the nearest stars, within 12 light-years
  [0.37, 3.3], [0.4, 3.4], // our arm
  [0.48, 4.7], [0.51, 4.78], // the galaxy
  [0.59, 6.05], [0.62, 6.11], // the Local Group
  [0.7, 8.48], [0.73, 8.56], // Laniakea
  [0.81, 9.25], [0.84, 9.36], // the web
  [0.93, 10.76], [1, 10.82], // the observable universe
];

/** Monotone cubic through the keys: no stops, no overshoot. */
const zoom = (() => {
  const n = KEYS.length, x = KEYS.map((k) => k[0]), y = KEYS.map((k) => k[1]);
  const d = x.slice(1).map((_, i) => (y[i + 1] - y[i]) / (x[i + 1] - x[i]));
  const m = y.map((_, i) => (i === 0 ? d[0] : i === n - 1 ? d[n - 2] : d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i])));
  return (u: number) => {
    let i = 0;
    while (i < n - 2 && u > x[i + 1]) i++;
    const h = x[i + 1] - x[i], s = Math.max(0, Math.min(1, (u - x[i]) / h));
    const s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * y[i] + (s3 - 2 * s2 + s) * h * m[i] + (-2 * s3 + 3 * s2) * y[i + 1] + (s3 - s2) * h * m[i + 1];
  };
})();

// The planets' orbits (J2000): semi-major axis AU, eccentricity, longitude of perihelion and mean longitude
// (degrees), period in years; and a colour and brightness for each point.
const PLANETS = [
  [0.387, 0.2056, 77.46, 252.25, 0.2408, 0.62, 0.6, 0.58, 0.45],
  [0.723, 0.0068, 131.53, 181.98, 0.6152, 1.0, 0.93, 0.8, 0.8],
  [1.0, 0.0167, 102.94, 100.46, 1.0, 0.55, 0.72, 1.0, 0.75],
  [1.524, 0.0934, 336.04, 355.45, 1.8809, 1.0, 0.55, 0.38, 0.6],
  [5.203, 0.0485, 14.75, 34.4, 11.862, 1.0, 0.86, 0.7, 0.95],
  [9.555, 0.0555, 92.43, 49.94, 29.457, 1.0, 0.9, 0.72, 0.8],
  [19.218, 0.0463, 170.96, 313.23, 84.011, 0.7, 0.9, 0.95, 0.6],
  [30.11, 0.009, 44.97, 304.88, 164.79, 0.5, 0.65, 1.0, 0.6],
];

// The nearest stars: distance (ly), right ascension (h), declination (deg), surface temperature (K), luminosity (Suns).
// Alpha Centauri A and B, Sirius A and B and the other close pairs are drawn as one point each.
const NEAR = [
  [4.24, 14.495, -62.68, 3040, 0.0017], // Proxima Centauri
  [4.37, 14.66, -60.83, 5700, 2.0], // Alpha Centauri A and B
  [5.96, 17.963, 4.69, 3130, 0.0035], // Barnard's Star
  [7.86, 10.94, 7.01, 2800, 0.0011], // Wolf 359
  [8.31, 11.055, 35.97, 3550, 0.021], // Lalande 21185
  [8.6, 6.752, -16.72, 9940, 25.4], // Sirius
  [8.73, 1.65, -17.95, 2670, 0.0002], // Luyten 726-8
  [9.7, 18.83, -23.84, 3250, 0.0038], // Ross 154
  [10.3, 23.7, 44.18, 2800, 0.0018], // Ross 248
  [10.47, 3.549, -9.46, 5080, 0.34], // Epsilon Eridani
  [10.72, 23.097, -35.85, 3690, 0.033], // Lacaille 9352
  [11.01, 11.79, 0.8, 3190, 0.0036], // Ross 128
  [11.1, 22.64, -15.3, 2800, 0.0004], // EZ Aquarii
  [11.46, 7.655, 5.22, 6530, 7.0], // Procyon
  [11.4, 21.115, 38.75, 4400, 0.24], // 61 Cygni
  [11.49, 18.71, 59.63, 3400, 0.03], // Struve 2398
  [11.62, 0.307, 44.02, 3700, 0.02], // Groombridge 34
  [11.87, 22.055, -56.79, 4630, 0.22], // Epsilon Indi
  [11.91, 1.734, -15.94, 5340, 0.52], // Tau Ceti
  [11.68, 8.49, 26.78, 2800, 0.0003], // DX Cancri
  [12.0, 3.6, -44.51, 2950, 0.0016], // GJ 1061
];

/** The colour of a body glowing at temperature T, normalised to its brightest channel. */
function blackbody(T: number) {
  const t = T / 100;
  const r = t <= 66 ? 255 : 329.7 * Math.pow(t - 60, -0.1332);
  const g = t <= 66 ? 99.47 * Math.log(t) - 161.12 : 288.12 * Math.pow(t - 60, -0.0755);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04;
  const c = [r, g, b].map((x) => Math.max(0, Math.min(255, x)) / 255);
  const m = Math.max(...c);
  return c.map((x) => x / m);
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function mountCosmicWeb(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "high-performance" });
  if (!gl) return null;
  let prog: ReturnType<typeof compile>;
  try {
    prog = compile(gl, VS, FS);
  } catch (e) {
    console.warn("cosmic web: shader unavailable", e);
    return null;
  }
  const U = prog.u;
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog.p, "a_q");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  // Fixed things, set once: the orbits, the nearest stars' colours.
  gl.useProgram(prog.p);
  const orb = new Float32Array(32), plc = new Float32Array(24);
  PLANETS.forEach((q, i) => {
    orb.set([q[0], q[1], (q[2] * Math.PI) / 180, 0], i * 4);
    plc.set([q[5], q[6], q[7]], i * 3);
  });
  gl.uniform4fv(U["u_orb[0]"], orb);
  gl.uniform3fv(U["u_plc[0]"], plc);
  const nc = new Float32Array(72), nxyz: number[][] = [], nb: number[] = [];
  NEAR.forEach(([d, ra, dec, T, lum], i) => {
    const a = (ra / 24) * 2 * Math.PI, de = (dec * Math.PI) / 180;
    nxyz.push([d * Math.cos(de) * Math.cos(a), d * Math.cos(de) * Math.sin(a), d * Math.sin(de)]);
    nc.set(blackbody(T), i * 3);
    nb.push(Math.max(0.42, Math.min(1.4, 0.55 * Math.pow(lum, 0.16))));
  });
  gl.uniform3fv(U["u_nc[0]"], nc);

  // Where things are on the plane of the galaxy, in light-years from the Sun. The galaxy's centre is
  // 26,000 light-years off; Andromeda 2.5 million, the Triangulum Galaxy 2.73 million, 15 degrees from it
  // in our sky; the Magellanic Clouds 160,000 and 200,000. The middle of the Local Group lies between the
  // two giants. The centre of Laniakea is a node of the web about 200 million light-years from us.
  const GC = [0, 26000];
  const toM31 = -0.36;
  const M31 = [2.5e6 * Math.cos(toM31), 2.5e6 * Math.sin(toM31)];
  const M33 = [2.73e6 * Math.cos(toM31 + 0.26), 2.73e6 * Math.sin(toM31 + 0.26)];
  const LMC = [160e3 * Math.cos(2.4), 160e3 * Math.sin(2.4)], SMC = [200e3 * Math.cos(2.75), 200e3 * Math.sin(2.75)];
  const BARY = [M31[0] * 0.5, M31[1] * 0.5];
  const WEB0 = [11.131, 10.73]; // the Local Group, in web cells (100 million ly)
  const GA = [-1.9607e8, -0.2903e8]; // the centre of Laniakea, ly from us
  gl.uniform4fv(U["u_gx[0]"], new Float32Array([
    M31[0] / 1e6, M31[1] / 1e6, 15, 0.6,
    M33[0] / 1e6, M33[1] / 1e6, 6.5, 1.9,
    LMC[0] / 1e6, LMC[1] / 1e6, 5.5, 0.3,
    SMC[0] / 1e6, SMC[1] / 1e6, 3.0, 1.1,
  ]));

  const pl = new Float32Array(24), ns = new Float32Array(96);
  let w = 0, h = 0;

  function draw(Up: number, t: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    const cw = Math.max(1, Math.round(canvas.clientWidth * dpr)), ch = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (cw !== w || ch !== h) (w = canvas.width = cw), (h = canvas.height = ch);
    const portrait = h > w * 1.1;
    // On a wide screen the words sit low on the left, so the frame's centre moves right; on a tall one,
    // up, and the world turns a quarter so the long reaches of it (Andromeda, Laniakea) run up the screen.
    const unit = portrait ? 0.5 * w * 0.96 : 0.5 * h * 0.92;
    const cx = portrait ? 0.5 * w : 0.6 * w, cy = portrait ? 0.6 * h : 0.52 * h;
    const wr = portrait ? Math.PI / 2 : 0;

    const L = zoom(Up), S = Math.pow(10, L); // ly for one unit of p
    const ct = 0.8 + 0.2 * smooth(5.4, 7.6, L);
    // The camera: on the Sun, then to the galaxy's centre, the Local Group's middle, Laniakea's centre, and home.
    const a1 = smooth(3.45, 4.6, L), a2 = smooth(5.3, 6.1, L), a3 = smooth(7.2, 8.4, L), a4 = smooth(9.1, 10.5, L);
    const C = [0, 1].map((k) => GC[k] * a1 + (BARY[k] - GC[k]) * a2 + (GA[k] - BARY[k]) * a3 - GA[k] * a4);
    // From the plane back to the screen, for the Sun's place: undo the turn, then the tilt.
    const toScreen = (x: number, y: number) => {
      const c = Math.cos(wr), s = Math.sin(wr);
      return [(c * x + s * y) / S, ((-s * x + c * y) / S) * ct];
    };
    const sun = toScreen(-C[0], -C[1]);

    gl!.viewport(0, 0, w, h);
    gl!.useProgram(prog.p);
    gl!.uniform2f(U.u_ctr, cx, cy);
    gl!.uniform1f(U.u_unit, unit);
    gl!.uniform1f(U.u_wr, wr);
    gl!.uniform1f(U.u_ct, ct);
    gl!.uniform1f(U.u_t, t);
    gl!.uniform2f(U.u_sun, sun[0], sun[1]);

    // How much of each scale is showing, by the frame's size.
    gl!.uniform1f(U.u_sky, 1 - smooth(0.4, 1.7, L));
    gl!.uniform1f(U.u_sunA, (L < 0.6 ? Math.pow(10, -0.28 * (L - 0.6)) * 0.7 : 0.7) * (1 - smooth(2.0, 2.9, L)));
    const AU = 1 / 63241;
    gl!.uniform4f(U.u_sol, S / AU, 0.42, 1 - smooth(-2.3, -1.3, L), 0);
    // The planets where they are on the day this was written (mid-October 2026), moving on at six days a second.
    const days = 9783 + t * 6;
    PLANETS.forEach(([a, e, varpi, L0, P, , , , b], i) => {
      const n = 360 / (P * 365.25);
      const M = (((L0 - varpi + n * days) % 360) * Math.PI) / 180;
      let E = M;
      for (let k = 0; k < 5; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
      const x = a * (Math.cos(E) - e), y = a * Math.sqrt(1 - e * e) * Math.sin(E), vp = (varpi * Math.PI) / 180;
      pl.set([x * Math.cos(vp) - y * Math.sin(vp), x * Math.sin(vp) + y * Math.cos(vp), b], i * 3);
    });
    gl!.uniform3fv(U["u_pl[0]"], pl);
    gl!.uniform2f(U.u_oort, S / (1000 * AU), smooth(-1.7, -0.6, L) * (1 - smooth(0.35, 0.95, L)));

    // The nearest stars, turning slowly so their depth shows.
    const nw = smooth(0.3, 0.95, L) * (1 - smooth(1.8, 2.5, L));
    gl!.uniform1f(U.u_nw, nw);
    if (nw > 0.001) {
      const yaw = 4.0 + t * 0.02 + Up * 1.5, tl = 1.05;
      NEAR.forEach((_, i) => {
        const [x, y, z] = nxyz[i];
        const xr = x * Math.cos(yaw) - y * Math.sin(yaw), yr = x * Math.sin(yaw) + y * Math.cos(yaw);
        const sx = xr, sy = yr * Math.cos(tl) + z * Math.sin(tl);
        ns.set([sun[0] + sx / S, sun[1] + sy / S, nb[i], 0], i * 4);
      });
      gl!.uniform4fv(U["u_ns[0]"], ns);
    }

    const kly = [(C[0] - GC[0]) / 1000, (C[1] - GC[1]) / 1000];
    // Like a camera, the exposure follows what is in the frame: close in, the faint outer disc is all there is.
    const expo = 1 + 1.2 * (1 - smooth(3.5, 4.6, L)) + 2 * smooth(5.0, 5.9, L);
    gl!.uniform4f(U.u_gal, kly[0], kly[1], S / 1000, smooth(1.6, 3.0, L) * (1 - smooth(6.9, 7.6, L)) * expo);
    gl!.uniform1f(U.u_stw, smooth(0.9, 1.8, L) * (1 - smooth(4.2, 5.0, L)));
    gl!.uniform4f(U.u_lg, C[0] / 1e6, C[1] / 1e6, S / 1e6, smooth(4.9, 5.6, L) * (1 - smooth(7.5, 8.1, L)));
    gl!.uniform4f(U.u_web, WEB0[0] + C[0] / 1e8, WEB0[1] + C[1] / 1e8, S / 1e8, smooth(6.4, 7.3, L));
    gl!.uniform4f(U.u_obs, C[0] / 1e9, C[1] / 1e9, S / 1e9, smooth(9.7, 10.4, L));
    // Laniakea's edge passes a little beyond us: we are in its outskirts.
    const lw = smooth(7.9, 8.4, L) * (1 - smooth(8.9, 9.4, L));
    gl!.uniform4f(U.u_lan, WEB0[0] + GA[0] / 1e8, WEB0[1] + GA[1] / 1e8, 2.5, lw);
    // (Not while the Milky Way is a few pixels across: then it marks itself.)
    gl!.uniform3f(U.u_mark, sun[0], sun[1], smooth(3.9, 4.4, L) * (1 - smooth(5.2, 5.5, L) * (1 - smooth(6.8, 7.3, L))) * (1 - smooth(8.9, 9.3, L)));

    gl!.bindVertexArray(vao);
    gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
  }
  return { draw };
}
