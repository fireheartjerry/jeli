/**
 * The universe's first moments, as the page is scrolled through them
 * (Sequence.astro). One full-screen pass draws all of it, one scene running
 * into the next:
 *
 *   inflation, where space grows by doublings and quantum jitters are
 *   stretched into a pattern; the heat that inflation leaves, a white-hot
 *   liquid of quarks and gluons; that liquid condensing into protons and
 *   neutrons; the first nuclei, as pairs of protons and neutrons join and then
 *   become helium; the glowing fog of the plasma that follows, cooling for
 *   380,000 years until it clears; that light, reddening as space stretches
 *   it; the dark gas drawn into a web by gravity; and the first stars and
 *   galaxies lighting the web up.
 *
 * Light and colour come from temperature wherever they can: anything glowing
 * is given the colour of a body at its temperature, and the brightness is set
 * the way a camera would set its exposure, so the scenes stay readable while
 * the temperature falls by a factor of a billion billion.
 *
 * The pattern inflation leaves is one field, kept from the first frame to the
 * fog and the light that comes out of it. The web that grows after it is a
 * Voronoi foam, a model cosmologists use for it: its cells are the empty
 * voids, its walls the filaments, its corners the knots where gas gathers
 * most and the first stars light.
 *
 * Everything is a function of `U`, how far through the sequence the scroll
 * has got, and of the clock, which only keeps things alive.
 */
import { compile, NOISE } from "./supernova";

const VS = `#version 300 es
in vec2 a_q;
void main() { gl_Position = vec4(a_q, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float;
${NOISE}
out vec4 o;
uniform vec2 u_res;
uniform float u_u, u_t;
uniform sampler2D u_tex; // a table of random numbers; green is red read 37 across and 17 up
// Set each frame from the scroll (see draw below).
uniform float u_L;      // inflation: how many doublings the frame has grown by
uniform float u_heat;   // the end of inflation: its energy turning to heat, 0 to 1
uniform float u_fly;    // how far the camera has moved into the hot liquid
uniform float u_S;      // nucleons: how many across half the frame's height
uniform float u_quark;  // how much of the three quarks inside each nucleon shows
uniform float u_T;      // the fog's temperature, kelvin
uniform float u_clear;  // the fog clearing, 0 to 1
uniform float u_glow;   // the brightness of the fog, and then of its light as it reddens
uniform float u_Z;      // the late scenes: how far the camera has drawn back
uniform float u_grow;   // the web: how far gravity has drawn it together
uniform float u_ion;    // the end: how much of the gas between the galaxies is split
uniform float a_inf, a_pla, a_nuc, a_fog, a_web, a_star; // how much of each scene shows

vec3 tone(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }

// The colour of a glowing body at T kelvin, in linear light, its brightest channel 1
// (Tanner Helland's fit to the blackbody colours, good from about 1,000 to 40,000 K).
vec3 bb(float T) {
  float t = clamp(T, 800.0, 40000.0) / 100.0;
  float r = t <= 66.0 ? 1.0 : 1.292936 * pow(t - 60.0, -0.1332048);
  float g = t <= 66.0 ? 0.3900816 * log(t) - 0.6318414 : 1.1298909 * pow(t - 60.0, -0.0755148);
  float b = t >= 66.0 ? 1.0 : (t <= 19.0 ? 0.0 : 0.5432068 * log(t - 10.0) - 1.1962541);
  vec3 c = pow(clamp(vec3(r, g, b), 0.0, 1.0), vec3(2.2));
  return c / max(c.r, max(c.g, c.b));
}

// Smooth noise read from the table: four reads give two layers in z.
float vn(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0); // a quintic fade: no creases along the lattice
  ivec2 b = ivec2(i.xy + vec2(37.0, 17.0) * i.z) & 255;
  vec2 a = texelFetch(u_tex, b, 0).rg;
  vec2 e = texelFetch(u_tex, (b + ivec2(1, 0)) & 255, 0).rg;
  vec2 c = texelFetch(u_tex, (b + ivec2(0, 1)) & 255, 0).rg;
  vec2 d = texelFetch(u_tex, (b + ivec2(1, 1)) & 255, 0).rg;
  float A = mix(a.x, a.y, u.z), B = mix(e.x, e.y, u.z), C = mix(c.x, c.y, u.z), D = mix(d.x, d.y, u.z);
  return mix(mix(A, B, u.x), mix(C, D, u.x), u.y);
}
float fbmv(vec3 x) { return vn(x) * 0.5 + vn(x * 2.03 + 5.1) * 0.3 + vn(x * 4.07 + 9.7) * 0.2; }
// Two more random numbers per lattice point, for placing things.
vec2 rnd(vec2 c) { return texelFetch(u_tex, ivec2(mod(c, 256.0)), 0).ba; }

// Simplex noise, after Ian McEwan and Stefan Gustavson (webgl-noise, MIT licence): smooth, with
// no trace of a square lattice, for the one pattern that is looked at closely.
vec4 permute(vec4 x) { vec4 y = ((x * 34.0) + 10.0) * x; return y - floor(y / 289.0) * 289.0; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz), l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy), i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx, x2 = x0 - i2 + C.yyy, x3 = x0 - 0.5;
  i = i - floor(i / 289.0) * 289.0;
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  vec4 j = p - 49.0 * floor(p / 49.0);
  vec4 gx = floor(j / 7.0), gy = floor(j - 7.0 * gx);
  vec4 x = gx * (2.0 / 7.0) + (0.5 / 7.0 - 1.0), y = gy * (2.0 / 7.0) + (0.5 / 7.0 - 1.0);
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy), b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0, s1 = floor(b1) * 2.0 + 1.0, sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy, a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x), p1 = vec3(a0.zw, h.y), p2 = vec3(a1.xy, h.z), p3 = vec3(a1.zw, h.w);
  vec4 nr = inversesqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0 * nr.x, x0), dot(p1 * nr.y, x1), dot(p2 * nr.z, x2), dot(p3 * nr.w, x3)));
}

// ---- the pattern inflation leaves ----
// One octave of ripples for every doubling of size, each about as strong as the next: the near
// "scale invariance" measured in the microwave background. L is how many doublings the frame has
// grown by; the octaves pass through the frame as it grows, small ones arriving, large ones leaving.
// Octaves still smaller than the horizon (the finest here) are quantum jitter, and keep changing;
// stretched past it, they freeze.
float ripples(vec2 p, float L, float live, float lo, float hi) {
  float fl = floor(L);
  float s = 0.0, wsum = 0.0;
  for (int j = 0; j < 10; j++) {
    float k = fl + float(j) - 5.0;
    float ls = k - L; // log2 of its frequency in the frame
    float w = smoothstep(lo - 1.0, lo, ls) * (1.0 - smoothstep(hi - 1.0, hi, ls));
    if (w < 0.001) continue;
    vec2 off = vec2(hash2(vec2(k, 1.3)), hash2(vec2(k, 2.7))) * 150.0;
    vec3 x = vec3(p * exp2(ls) + off, mod(k, 40.0) * 3.0);
    float n = snoise(x);
    float q = live * smoothstep(1.0, 3.2, ls);
    if (q > 0.001) n = mix(n, snoise(x + vec3(0.0, 0.0, 1.5 + u_t * 0.9)), q);
    s += w * n;
    wsum += w * w;
  }
  return s * 1.8 / sqrt(max(wsum, 1e-3));
}

// ---- 1: inflation ----
vec3 inflation(vec2 p) {
  float f = ripples(p, u_L, 1.0, -4.0, 6.0);
  // Drawn as the field's strength squared, which is what carries its energy: bright where it swings
  // far either way, dark along the lines where it passes through zero, like the speckle of laser
  // light, at every size at once. The finest still flickers; the larger is stretched and still.
  vec3 col = vec3(0.66, 0.71, 1.0) * (0.006 + 0.3 * f * f);
  // The light falls off away from the centre of the frame, as through a lens.
  col *= 1.0 - 0.45 * smoothstep(0.4, 1.6, length(p));
  // When it ends, its energy becomes heat: the field glows, from red through white.
  if (u_heat > 0.001) {
    float T = pow(10.0, mix(2.95, 6.0, u_heat));
    float e = u_heat * (0.75 + 0.55 * f) * 1.2;
    // (Once very hot, the camera balances to it, as for the liquid that follows.)
    vec3 hc = mix(bb(T), mix(vec3(1.0), bb(T), 0.6), smoothstep(6000.0, 40000.0, T));
    col = col * (1.0 - u_heat) + hc * e * mix(0.12, 0.42, u_heat);
  }
  return col;
}

// ---- 2: the quark-gluon plasma, a white-hot liquid ----
// At two trillion degrees its colour is the limit a blackbody reaches when very hot, a pale blue
// white, everywhere; only its brightness changes from place to place.
vec3 plasma(vec2 p, float calm) {
  // Seen as a volume the camera moves into: three depths of it at once, each passing from far and
  // small to near and large, and then replaced by a new one behind.
  float e = 0.0;
  for (int i = 0; i < 3; i++) {
    float ph = float(i) / 3.0 + u_fly;
    float z = fract(ph), cyc = floor(ph);
    vec2 o = vec2(hash2(vec2(cyc, float(i) + 0.5)), hash2(vec2(float(i) + 0.5, cyc))) * 60.0;
    vec3 x = vec3(p * 6.0 * exp2(1.0 - z) + o, u_t * 0.13 + float(i) * 3.0);
    vec2 w = vec2(vn(x), vn(x + vec3(5.2, 1.3, 7.0)));
    float n = fbmv(x + vec3(1.9 * w, 0.0));
    float fade = sin(3.14159 * z);
    // Turbulent and glowing: brightest in thin bright wisps where it is densest and hottest.
    e += pow(n, 4.0) * 2.2 * fade * fade;
  }
  e = mix(e + 0.03, 0.035 + e * 0.12, calm);
  // The camera is balanced to the light it is in, so the white-hot liquid reads nearly white,
  // keeping only some of the pale blue of a blackbody this hot.
  return mix(vec3(1.0), bb(40000.0), 0.6) * e;
}

// ---- 3, 4: protons and neutrons, then the first nuclei ----
// Each is drawn as a glowing ball, as hot as everything round it and far denser, with a little of
// its light spread round it the way a lens spreads a bright light. Protons are drawn a little
// warmer and neutrons a little cooler: a hint only, since neither has a colour of its own.
const vec3 PROTON = vec3(1.0, 0.88, 0.78), NEUTRON = vec3(0.8, 0.88, 1.0);
vec2 home(vec2 c) {
  vec2 j = rnd(c);
  vec2 h = c + 0.5 + (j - 0.5) * 0.62;
  // Thermal motion: everything jostles.
  return h + 0.1 * vec2(sin(u_t * 0.9 + j.x * 40.0) + 0.3 * sin(u_t * 2.3 + j.y * 17.0), cos(u_t * 0.75 + j.y * 40.0) + 0.3 * cos(u_t * 2.1 + j.x * 23.0)) * 0.7;
}
vec4 nucleons(vec2 p, out vec3 flash) {
  vec2 g = p * u_S + vec2(31.37, 17.61);
  vec2 cell = floor(g);
  float R = 0.25;
  float aa = 2.2 / (R * 0.5 * u_res.y / u_S); // a soft edge two pixels wide
  vec4 acc = vec4(0.0); // colour weighted by nearness, and the weight
  float cover = 1.0;    // how much of what is behind still shows
  vec3 halo = vec3(0.0);
  flash = vec3(0.0);
  vec3 hot = bb(40000.0);
  for (int dx = -1; dx <= 1; dx++)
    for (int dy = -1; dy <= 1; dy++) {
      vec2 c = cell + vec2(float(dx), float(dy));
      vec2 blk = floor(c * 0.5), sl = c - 2.0 * blk;
      // A quarter of the nucleons, in blocks of four, end up in helium: 2 protons and 2 neutrons.
      bool he = hash2(blk + 0.31) < 0.25;
      vec2 pos = home(c);
      float neutron;
      if (he) {
        neutron = abs(sl.x - sl.y); // two of the four
        // First a proton and a neutron join (deuterium), then two of those make helium-4.
        float u1 = 0.352 + 0.04 * hash2(blk + 4.4), u2 = u1 + 0.025 + 0.02 * hash2(blk + 6.6);
        float s1 = smoothstep(u1, u1 + 0.02, u_u), s2 = smoothstep(u2, u2 + 0.02, u_u);
        if (s1 > 0.0) {
          vec2 mate = home(c + vec2(1.0 - 2.0 * sl.x, 0.0));
          float a = hash2(blk + 2.2) * 6.283 + u_t * 0.3;
          vec2 ax = vec2(cos(a), sin(a)), ay = vec2(-ax.y, ax.x);
          float side = sl.x * 2.0 - 1.0;
          vec2 mid = 0.5 * (pos + mate);
          vec2 deut = mid + (sl.y > 0.5 ? ay : ax) * side * R * 0.6;
          vec2 centre = 2.0 * blk + 1.0 + 0.05 * vec2(sin(u_t * 0.7 + a), cos(u_t * 0.6 + a));
          vec2 heli = centre + (sl.y > 0.5 ? ay : ax) * side * R * 0.48;
          pos = mix(mix(pos, deut, s1), heli, s2);
          // Each joining gives off a gamma ray: a brief flash where it happens.
          if (sl.x < 0.5) {
            float f1 = exp(-pow((u_u - u1 - 0.012) / 0.004, 2.0)), f2 = exp(-pow((u_u - u2 - 0.012) / 0.004, 2.0)) * step(sl.y, 0.5);
            vec2 fp = sl.y > 0.5 ? mid : (f2 > f1 ? centre : mid);
            float r = length(g - fp);
            flash += vec3(1.0) * max(f1, f2) * (exp(-r * r / 0.003) * 2.0 + exp(-r / 0.2) * 0.2);
          }
        }
      } else {
        // Half begin as neutrons; while it is still hot enough, collisions turn most into protons.
        float uc = 0.26 + 0.09 * hash2(c + 8.1);
        neutron = step(hash2(c + 5.7), 0.5) * (1.0 - smoothstep(uc, uc + 0.025, u_u));
      }
      // Each sits at its own depth: nearer ones a little larger, and those away from the plane the
      // lens is focused on softer at the edge. Where they overlap, the nearer is in front (a helium
      // nucleus is a tight pyramid of four).
      float depth = rnd(c + 61.0).x;
      float zc = (depth - 0.5) * 0.3 * R;
      if (he) zc = mix(zc, (sl.y - 0.5) * 0.7 * R, smoothstep(0.38, 0.42, u_u));
      float Ri = R * mix(0.86, 1.12, depth);
      float soft = max(aa, 0.5 * pow(abs(depth - 0.55) * 2.0, 2.0));
      vec2 d = g - pos;
      float d2 = dot(d, d), rr = d2 / (Ri * Ri);
      vec3 tint = mix(PROTON, NEUTRON, neutron);
      halo += tint * exp(-sqrt(d2) / (Ri * 0.45)) * 0.1;
      if (rr < 1.0) {
        float mu = sqrt(1.0 - rr);
        float z = zc + mu * Ri;
        // A ball of light seen through: far brighter where it is deepest, so its middle is
        // overexposed to white and only its edge keeps the colour; a thin brighter rim where the
        // light round it grazes its surface.
        vec3 c3 = tint * (0.12 + 1.9 * pow(mu, 1.6)) + tint * pow(1.0 - mu, 4.0) * 0.35;
        // Inside, three quarks, turning: the hottest places, seen through its glow.
        if (u_quark > 0.01) {
          vec2 j = rnd(c + 91.0);
          float a0 = j.x * 6.283 + u_t * (0.5 + j.y), q3 = 0.0;
          for (int i = 0; i < 3; i++) {
            float a = a0 + float(i) * 2.0944;
            vec2 q = pos + Ri * 0.4 * vec2(cos(a), sin(a)) * (1.0 + 0.12 * sin(u_t * 2.1 + float(i) * 2.0));
            q3 += exp(-dot(g - q, g - q) / (Ri * Ri * 0.04));
          }
          c3 = c3 * (1.0 - 0.45 * u_quark) + mix(tint, vec3(1.0), 0.5) * q3 * 1.4 * u_quark;
        }
        // Where they overlap, the nearer surface wins, smoothly (so no seam shows between them).
        float al = smoothstep(1.0, 1.0 - soft, sqrt(rr));
        float wt = al * exp(clamp(z / Ri, -2.0, 2.0) * 9.0);
        acc += vec4(c3 * mix(1.0, 0.6, abs(depth - 0.55) * 2.0) * wt, wt);
        cover *= 1.0 - al;
      }
      // Matter meets antimatter and both become light: brief flashes as the nucleons form.
      float uf = 0.21 + 0.085 * hash2(c + 13.7);
      float fl = exp(-pow((u_u - uf) / 0.0045, 2.0));
      if (fl > 0.01) {
        vec2 fp = c + rnd(c + 47.0);
        float r = length(g - fp);
        flash += hot * fl * (exp(-r * r / 0.0025) * 3.0 + exp(-r / 0.16) * 0.35);
      }
    }
  flash += halo; // (light laid over everything, as the flashes are)
  return vec4(acc.rgb / max(acc.a, 1e-5) * 0.8, 1.0 - cover);
}
// Further off, out of focus: more of the same, only soft light.
vec3 farNucleons(vec2 p) {
  vec2 g = p * u_S * 0.62 + vec2(7.3, 3.1);
  vec2 cell = floor(g);
  float D = 0.0;
  for (int dx = -1; dx <= 1; dx++)
    for (int dy = -1; dy <= 1; dy++) {
      vec2 c = cell + vec2(float(dx), float(dy));
      vec2 d = g - home(c + 300.0) + 300.0;
      D += exp(-dot(d, d) / 0.12);
    }
  return vec3(0.85, 0.88, 0.95) * D * 0.11;
}

// ---- 5, 6, 7: the fog, its clearing, and the light it leaves ----
vec3 fog(vec2 X) {
  // The camera stays balanced to the light while it is very hot, as before, and lets go of that as
  // it cools, so the cooling shows: from pale blue white, through white and yellow, to orange.
  vec3 c = mix(vec3(1.0), bb(u_T), mix(0.6, 1.0, smoothstep(40000.0, 8000.0, u_T)));
  // The pattern from inflation, now places a little denser and hotter than others.
  float F = ripples(X, 8.0, 0.0, -2.5, mix(2.0, 3.6, u_clear));
  // Inside the fog: drifting depths of it, the nearer ones clearing first.
  float acc = 0.0;
  for (int i = 0; i < 3; i++) {
    float z = fract(float(i) / 3.0 + u_t * 0.01 + u_u * 1.4); // 0 far, 1 near
    float sc = 1.0 / mix(2.6, 0.4, z);
    vec2 q = X * sc * 1.3 + float(i) * 17.3;
    float n = vn(vec3(q, u_t * 0.035 + float(i) * 5.0)) * 0.62 + vn(vec3(q * 2.3, u_t * 0.05 + 9.0)) * 0.38;
    float fade = smoothstep(0.0, 0.3, z) * (1.0 - smoothstep(0.72, 1.0, z));
    float gone = smoothstep(0.85 - z * 0.6, 1.0 - z * 0.6, u_clear);
    acc += (n - 0.5) * fade * (1.0 - gone) * 2.2;
  }
  // The pattern is about one part in 100,000; here it is made far stronger, so it shows.
  float pat = mix(0.12, 0.34, u_clear);
  return c * u_glow * (0.82 + pat * F + 0.42 * acc);
}

// ---- 8, 9, 10: the web, the first stars, the first galaxies ----
// The nearest three seeds of the foam: d1 < d2 < d3.
void foam(vec2 x, out vec3 d, out vec2 s1, out vec2 s2, out vec2 s3) {
  vec2 cell = floor(x);
  d = vec3(9.0);
  for (int dx = -1; dx <= 1; dx++)
    for (int dy = -1; dy <= 1; dy++) {
      vec2 c = cell + vec2(float(dx), float(dy));
      vec2 s = c + 0.5 + (rnd(c + 500.0) - 0.5) * 0.84;
      float e = length(x - s);
      if (e < d.x) { d = vec3(e, d.xy); s3 = s2; s2 = s1; s1 = s; }
      else if (e < d.y) { d = vec3(d.x, e, d.y); s3 = s2; s2 = s; }
      else if (e < d.z) { d.z = e; s3 = s; }
    }
}
vec2 circum(vec2 a, vec2 b, vec2 c) {
  vec2 ba = b - a, ca = c - a;
  float den = 2.0 * (ba.x * ca.y - ba.y * ca.x);
  if (abs(den) < 1e-4) return a;
  float bl = dot(ba, ba), cl = dot(ca, ca);
  return a + vec2(ca.y * bl - ba.y * cl, ba.x * cl - ca.x * bl) / den;
}
vec3 late(vec2 X, float px) {
  // The gas is bent well away from a perfect foam, on two scales.
  vec2 W = X + 0.42 * (vec2(vn(vec3(X * 0.55, 2.0)), vn(vec3(X * 0.55 + 9.1, 4.0))) - 0.5)
             + 0.24 * (vec2(vn(vec3(X * 1.9 + 3.3, 6.0)), vn(vec3(X * 1.9 + 5.5, 8.0))) - 0.5)
             + 0.05 * (vec2(vn(vec3(X * 5.3 + 1.1, 9.0)), vn(vec3(X * 5.3 + 7.7, 10.0))) - 0.5);
  vec3 d; vec2 s1, s2, s3;
  foam(W, d, s1, s2, s3);
  // Gravity drains the voids into walls and knots: the web starts broad and faint, and sharpens.
  // Each wall and knot has its own share of the gas; most are faint, a few are rich.
  float g = u_grow;
  float ws = mix(0.5, 0.04, g);
  float str = pow(hash2(floor((s1 + s2) * 37.0)), 1.6);
  float wall = (exp(-(d.y - d.x) / (ws * (0.6 + 0.8 * str))) + 0.4 * exp(-(d.y - d.x) / (ws * 5.0))) * (0.12 + 0.88 * str);
  // Gas along a filament is lumpy, not an even thread.
  wall *= mix(1.0, 0.25 + 1.5 * vn(vec3(W * 4.5, 11.0)), g);
  float kd = d.z - d.x, kr = 0.3 + hash2(floor((s1 + s2 + s3) * 23.0));
  float knot = (exp(-kd / mix(0.5, 0.05, g)) + 0.3 * exp(-kd / mix(0.6, 0.2, g))) * kr;
  vec3 e; vec2 t1, t2, t3;
  foam(W * 2.6 + 40.0, e, t1, t2, t3);
  float thin = exp(-(e.y - e.x) / mix(0.6, 0.06, g)) * 0.22 * pow(hash2(floor((t1 + t2) * 41.0)), 2.0);
  float clump = 0.5 + vn(vec3(W * 7.0, 7.0));
  float rich = 0.45 + 0.9 * vn(vec3(X * 0.32 + 4.0, 1.0)); // some regions denser than others
  float rho = mix(0.4, (0.035 + wall * 0.6 + knot * 1.4 + thin) * rich, g) * mix(1.0, clump, g);
  // Neutral gas gives off almost no light; it is drawn faintly, a cold grey.
  vec3 col = vec3(0.55, 0.61, 0.74) * rho * 0.13 * a_web;
  if (a_star < 0.001) return col;

  // The first stars light at the knots, the corners of the foam.
  vec3 light = vec3(0.0);
  float ion = 0.0, glow = 0.0;
  vec2 cg = W * 1.7, cc = floor(cg);
  float sz = px * 0.0032; // a point of light: the same few pixels at any distance
  for (int dx = -1; dx <= 1; dx++)
    for (int dy = -1; dy <= 1; dy++) {
      vec2 c = cc + vec2(float(dx), float(dy));
      vec2 j = rnd(c + 900.0);
      float on = 0.835 + 0.085 * j.x; // when it lights
      float lit = smoothstep(on, on + 0.012, u_u);
      if (lit <= 0.0) continue;
      vec2 cp = (c + 0.5 + (j - 0.5) * 0.4) / 1.7;
      vec3 dd; vec2 a, b, k;
      foam(cp, dd, a, b, k);
      vec2 v = circum(a, b, k);
      if (length(v - cp) > 0.27) continue;
      vec2 r = W - v;
      float dist = length(r);
      // Its ultraviolet light splits the gas round it back into electrons and nuclei, in a growing bubble.
      float Rb = 0.31 * (0.6 + 0.4 * j.y) * smoothstep(on, on + 0.09, u_u);
      float inb = smoothstep(Rb, Rb * 0.45, dist);
      ion = max(ion, inb);
      glow += inb * exp(-dist / max(Rb * 0.5, 0.01));
      // A star of only hydrogen and helium, near 100,000 degrees at its surface: blue white.
      light += bb(40000.0) * lit * (exp(-dist * dist / (sz * sz)) * 2.6 + exp(-dist / (sz * 4.0)) * 0.14 + exp(-dist / (sz * 16.0)) * 0.025);
      // Later, round the same knots, many stars: a small young galaxy, clumpy and blue.
      float gal = smoothstep(on + 0.06, on + 0.13, u_u);
      float gs = px * 0.026 * (0.6 + 0.5 * j.y) * (0.5 + 0.5 * gal);
      if (gal > 0.0 && dist < gs * 3.6) {
        float an = j.x * 6.283;
        vec2 q = mat2(cos(an), sin(an), -sin(an), cos(an)) * r * vec2(1.0, 1.6) / gs;
        float qd = length(q);
        float knots = vn(vec3(q * 2.6, 3.0 + j.y * 9.0));
        float body = exp(-qd * 1.5) * 0.45 + exp(-qd * qd * 1.1) * (0.2 + 1.8 * knots * knots) + exp(-qd * 0.6) * 0.04;
        light += mix(vec3(0.74, 0.84, 1.0), vec3(1.0, 0.93, 0.84), smoothstep(0.0, 1.5, qd)) * body * gal;
        // Its brightest knots are clouds where stars are being made, glowing in hydrogen's red.
        light += vec3(1.0, 0.34, 0.42) * smoothstep(0.6, 0.85, knots) * exp(-qd * 1.2) * gal * 0.6;
      }
    }
  ion = max(ion, u_ion);
  // Split hydrogen glows as its electrons and protons find each other again: a deep pink-red,
  // brightest where the gas is thickest.
  vec3 ha = vec3(1.0, 0.3, 0.38);
  col = col * (1.0 - 0.6 * ion) + ha * (ion * rho * 0.14 + glow * 0.05 + u_ion * 0.015) * a_star;
  return col + light * a_star;
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / (0.5 * u_res.y);
  vec3 col = vec3(0.0);
  if (a_inf > 0.001) col += inflation(p) * a_inf;
  if (a_pla > 0.001) col += plasma(p, smoothstep(0.24, 0.34, u_u)) * a_pla;
  if (a_nuc > 0.001) {
    vec3 fl;
    col += farNucleons(p) * a_nuc;
    vec4 nc = nucleons(p, fl);
    col = mix(col, nc.rgb, nc.a * a_nuc) + fl * a_nuc;
  }
  vec2 X = p * u_Z + vec2(0.31, -0.17);
  if (a_fog > 0.001) col += fog(X) * a_fog;
  if (a_web > 0.001) col += late(X * 1.35, u_Z * 1.35);
  // Where the words sit, low on the left, the frame is held a little darker.
  vec2 uv = gl_FragCoord.xy / u_res;
  float side = u_res.x > u_res.y ? 1.0 - smoothstep(0.25, 0.7, uv.x) : 1.0;
  col *= 1.0 - 0.62 * side * (1.0 - smoothstep(0.0, 0.6, uv.y));
  // And a little darker along the top, where the sequence's name sits, as a lens darkens its edges.
  col *= 1.0 - 0.3 * smoothstep(0.78, 1.0, uv.y);
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  o = vec4(tone(col) + (n - 0.5) / 255.0, 1.0);
}`;

/** The table of random numbers the noise reads: red random, green red read 37 across and 17 up, blue and alpha random. */
function table() {
  const N = 256;
  let s = 20231;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0), (s >>> 24) & 255);
  const red = new Uint8Array(N * N).map(() => r());
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4;
      data[i] = red[y * N + x];
      data[i + 1] = red[((y + 17) & 255) * N + ((x + 37) & 255)];
      data[i + 2] = r();
      data[i + 3] = r();
    }
  return data;
}

export function mountBigBang(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "high-performance" });
  if (!gl) return null;
  let prog: ReturnType<typeof compile>;
  try {
    prog = compile(gl, VS, FS);
  } catch (e) {
    console.warn("big bang: shader unavailable", e);
    return null;
  }
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog.p, "a_q");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 256, 0, gl.RGBA, gl.UNSIGNED_BYTE, table());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  const ss = (a: number, b: number, x: number) => {
    const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return k * k * (3 - 2 * k);
  };
  const win = (a: number, b: number, c: number, d: number, x: number) => ss(a, b, x) * (1 - ss(c, d, x));
  /** From a to b by equal ratios, not equal steps: the way a zoom feels even. */
  const geo = (a: number, b: number, k: number) => a * Math.pow(b / a, k);

  let w = 0, h = 0;
  // If frames start coming late (a slower machine, a large window), the canvas is drawn at a
  // little less resolution until they keep up; when there is time to spare again, it goes back.
  let scale = 1, slow = 0, fast = 0, last = -1;
  function pace(t: number) {
    const dt = last < 0 ? 1 / 60 : t - last;
    last = t;
    if (dt > 0.2) return; // the page was away, not slow
    if (dt > 0.0195) {
      slow++;
      fast = 0;
    } else if (dt < 0.0178) {
      fast++;
      slow = Math.max(0, slow - 1);
    }
    if (slow > 24) {
      scale = Math.max(0.6, scale * 0.88);
      slow = 0;
    }
    if (fast > 300 && scale < 1) {
      scale = Math.min(1, scale / 0.93);
      fast = 0;
    }
  }
  function draw(U: number, t: number) {
    pace(t);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.25) * scale;
    const cw = Math.max(1, Math.round(canvas.clientWidth * dpr)), ch = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (cw !== w || ch !== h) (w = canvas.width = cw), (h = canvas.height = ch);
    gl!.viewport(0, 0, w, h);
    gl!.useProgram(prog.p);
    const u = prog.u;
    const set = (name: string, v: number) => gl!.uniform1f(u[name], v);
    gl!.uniform2f(u.u_res, w, h);
    set("u_u", U);
    set("u_t", t);
    gl!.uniform1i(u.u_tex, 0);

    // Inflation: the frame grows by about eight doublings as it is scrolled through, and keeps growing slowly at rest.
    set("u_L", 0.5 + 62 * Math.min(U, 0.14) + t * 0.035);
    set("u_heat", ss(0.085, 0.135, U));
    // The hot liquid: the camera moves in through it as it is scrolled, and drifts on slowly at rest.
    set("u_fly", 2.2 * ss(0.1, 0.3, U) + t * 0.012);
    // The nucleons: close at first, then drawn back until they are too small to see apart.
    const S = U < 0.42 ? geo(3, 4.6, ss(0.265, 0.36, U)) : geo(4.6, 60, ss(0.42, 0.5, U));
    set("u_S", S);
    set("u_quark", 1 - ss(0.27, 0.33, U));
    // The fog cools from about 100,000 degrees to 3,000 as it clears; after that its light is
    // stretched until it would read 2.7 degrees. The camera adjusts for most of the dimming, not all.
    // (Most of the time in that last stretch is spent where the colour can still be seen.)
    const T = U < 0.645 ? Math.pow(10, 5 - 1.523 * ss(0.44, 0.585, U)) : 3000 * Math.pow(2.725 / 3000, 0.17 * ss(0.645, 0.71, U) + 0.83 * ss(0.7, 0.74, U));
    set("u_T", T);
    set("u_clear", ss(0.555, 0.63, U));
    set("u_glow", 0.62 * Math.pow(Math.min(T / 3000, 1), 0.75) * (0.12 + 0.88 * ss(600, 1900, T)));
    // The late scenes: in comoving terms the camera draws slowly back, and then further for the galaxies.
    set("u_Z", 1 + 0.45 * ss(0.48, 0.85, U) + 1.1 * ss(0.88, 1.0, U));
    set("u_grow", ss(0.72, 0.84, U));
    set("u_ion", 0.55 * ss(0.955, 1.0, U));

    set("a_inf", 1 - ss(0.12, 0.15, U));
    set("a_pla", ss(0.1, 0.135, U) * (1 - 0.72 * ss(0.24, 0.34, U)) * (1 - ss(0.33, 0.4, U)));
    set("a_nuc", win(0.19, 0.245, 0.452, 0.492, U));
    set("a_fog", win(0.43, 0.5, 0.72, 0.74, U));
    set("a_web", ss(0.69, 0.76, U));
    set("a_star", ss(0.83, 0.845, U));
    gl!.bindVertexArray(vao);
    gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
  }
  return { draw };
}
