/**
 * Two neutron stars spiralling together and merging, as in GW170817, as the
 * page is scrolled through it (Sequence.astro). One canvas, three kinds of
 * drawing:
 *
 *   a full-screen pass that traces light through the scene: the two stars and
 *   the matter torn off them, bent by their gravity on its way to the camera,
 *   then the black hole and its disc, the jet and the expanding debris of the
 *   kilonova, and last the galaxy it happened in;
 *   a pass of half a million markers laid out in the plane of the
 *   orbit, moved by the gravitational waves as they spread outward, so the
 *   waves can be seen (the real stretching is far too small to see);
 *   and a pass of lit spheres for the scale of atomic nuclei, where a nucleus
 *   in the debris catches neutron after neutron and decays into gold.
 *
 * The inspiral follows the real chirp of GW170817 (a chirp mass of 1.19 solar
 * masses): how far apart the stars are, and how long the waves are, come from
 * it. Only time is slowed, so that an orbit can be watched.
 *
 * Everything is a function of `U`, how far through the sequence the scroll has
 * got (0 to 1), and of the clock, which turns the orbit and keeps gas moving.
 */
import { compile, NOISE } from "./supernova";

const VS_QUAD = `#version 300 es
in vec2 a_q;
void main() { gl_Position = vec4(a_q, 0.0, 1.0); }`;

// ---------------------------------------------------------------- the scenes
const FS_SCENE = `#version 300 es
precision highp float;
${NOISE}
out vec4 o;
uniform vec2 u_res;
uniform vec2 u_off; // where the scene's centre sits on the screen, clear of the words
uniform float u_t;
uniform float u_px; // the angle one pixel covers, radians
uniform vec3 u_eye, u_cx, u_cy, u_cz; // the camera, in the units of whichever scene is in view
uniform float u_fov; // tangent of half the vertical field of view
uniform vec4 u_w; // how much of each scene: the stars, the nuclear haze, the debris, the galaxy

// The stars, in units of the camera's distance.
uniform vec3 u_ax; // the line through the two stars
uniform float u_sep; // half the distance between their centres
uniform vec3 u_abc; // each one's half-widths: along that line, across it, and along the spin axis
uniform float u_Rs; // the Schwarzschild radius of all of the mass
uniform float u_Rb; // the sphere inside which light is traced step by step
uniform float u_Ib; // how bright their surfaces are
uniform float u_heat; // tidal heating, as they near each other
uniform float u_shock; // where they press together
uniform float u_bh; // the collapse, 0 to 1
uniform float u_arms; // the streams of matter flung out
uniform float u_rout; // how far out the streams reach
uniform float u_torus; // the disc left round the black hole
uniform float u_spin; // the orbit's phase, then the remnant's
uniform float u_swirl; // how far the disc has turned
uniform float u_R; // a neutron star's radius, before any collapse
uniform float u_env; // hot gas hugging the merged body

// The debris, in units of its outer edge.
uniform float u_jet; // how far the jet has got, in the same units
uniform float u_jetI;
uniform float u_lb, u_lr; // how bright the blue part and the red part glow
uniform float u_tb, u_tr; // and their temperatures, kelvin
uniform float u_hot; // the first seconds: all of it opaque and very hot
uniform float u_core; // the black hole and disc, seen from far off
uniform vec2 u_gal; // where the galaxy's nucleus is, from the kilonova

// Film-like exposure: bright things roll off to white instead of clipping.
vec3 tone(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }

// The colour of a glowing body at temperature T, kelvin (a fit to the Planck curve, then to linear light).
vec3 bb(float T) {
  float t = clamp(T, 1000.0, 40000.0) / 100.0;
  vec3 c;
  c.r = t <= 66.0 ? 1.0 : clamp(1.2929 * pow(t - 60.0, -0.1332), 0.0, 1.0);
  c.g = t <= 66.0 ? clamp(0.3901 * log(t) - 0.6318, 0.0, 1.0) : clamp(1.1298 * pow(t - 60.0, -0.0755), 0.0, 1.0);
  c.b = t >= 66.0 ? 1.0 : (t <= 19.0 ? 0.0 : clamp(0.5432 * log(t - 10.0) - 1.1963, 0.0, 1.0));
  return c * c;
}

// The sky behind, by direction: stars of many colours, sharp as a lens would show them.
// Near a mass the sky is squeezed towards it; \`widen\` keeps squeezed stars from breaking into dashes.
vec3 sky(vec3 d, float widen) {
  vec3 c = vec3(0.0);
  for (int l = 0; l < 3; l++) {
    float sc = l == 0 ? 34.0 : (l == 1 ? 80.0 : 190.0);
    vec3 q = d * sc, cell = floor(q);
    if (hash3(cell + 2.9) < (l == 0 ? 0.86 : (l == 1 ? 0.78 : 0.7))) continue;
    vec3 at = normalize(cell + 0.35 + 0.3 * vec3(hash3(cell + 1.7), hash3(cell + 4.3), hash3(cell + 7.1)));
    float a = length(cross(d, at)) * step(0.0, dot(d, at));
    float m = hash3(cell + 9.1);
    float w = u_px * 0.9 * widen;
    vec3 tint = bb(mix(3000.0, 12000.0, pow(hash3(cell + 5.5), 1.4)));
    c += tint * exp(-a * a / (w * w)) * (pow(m, 6.0) * 3.0 + 0.08) * (l == 0 ? 1.0 : (l == 1 ? 0.5 / widen : 0.28 / (widen * widen))) / widen;
  }
  // The unresolved light of fainter stars, very dim.
  c += vec3(0.006, 0.0065, 0.009) * (0.3 + fbm3(d * 2.5, 3));
  return c;
}

// Deflect a ray towards a mass at the origin, by the angle a straight-line pass would bend it.
vec3 bend(vec3 x, vec3 v, float a) {
  vec3 perp = x - v * dot(x, v);
  float b = length(perp);
  return b < 1e-6 ? v : normalize(v - perp / b * a);
}

// ---- 1 to 5: the stars, their merger, the black hole ----
float sdEll(vec3 p, vec3 r) { float k0 = length(p / r), k1 = length(p / (r * r)); return k0 * (k0 - 1.0) / max(k1, 1e-6); }
float bodies(vec3 x) {
  vec3 ay = vec3(-u_ax.y, u_ax.x, 0.0);
  vec3 q1 = x - u_ax * u_sep, q2 = x + u_ax * u_sep;
  float d1 = sdEll(vec3(dot(q1, u_ax), dot(q1, ay), q1.z), u_abc);
  float d2 = sdEll(vec3(dot(q2, u_ax), dot(q2, ay), q2.z), u_abc);
  // Where they touch they flow into one another.
  float k = 0.4 * u_abc.y;
  float h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
  return mix(d2, d1, h) - k * h * (1.0 - h);
}

// The matter between and around them: emitted light (rgb, per unit length) and how much it dims what is behind (a).
vec4 gas(vec3 x, vec3 v, float sd) {
  float rc = length(x.xy), r = length(x);
  float R = u_R;
  float ang = atan(x.y, x.x);
  vec3 em = vec3(0.0);
  float ext = 0.0;
  // Two streams thrown off the far ends of the stars, trailing behind as they turn.
  if (u_arms > 0.001 && rc < u_rout) {
    float lr = log(max(rc, 1e-5) / (u_sep + R));
    float psi = ang - u_spin + 1.7 * lr;
    float arm = pow(0.5 + 0.5 * cos(2.0 * psi), 6.0);
    float hz = 0.1 * rc + 0.25 * R;
    float env = arm * exp(-x.z * x.z / (hz * hz)) * smoothstep(0.7 * R, u_sep + 1.6 * R, rc) * (1.0 - smoothstep(u_rout * 0.45, u_rout, rc));
    if (env > 0.002) {
      float n = fbm3(vec3(lr * 5.0, psi * 2.0, x.z / hz) + vec3(0.0, 0.0, u_t * 0.15), 2);
      float rho = u_arms * env * (0.25 + 1.5 * n * n);
      em += bb(mix(16000.0, 4500.0, smoothstep(R, u_rout * 0.7, rc))) * rho * 0.22 * exp(-rc / (5.0 * R)) / R;
      ext += rho * 0.35 / R;
    }
  }
  // The disc: what did not fall in, turning round the black hole, faster further in.
  if (u_torus > 0.001) {
    float rt = 3.8 * R, w = 2.1 * R, h = 0.14 * rc + 0.15 * R;
    float env = exp(-pow((rc - rt) / w, 2.0)) * exp(-x.z * x.z / (h * h)) * smoothstep(1.6 * R, 2.6 * R, rc);
    if (env > 0.002) {
      float sw = ang - u_swirl * pow(rt / max(rc, 1.8 * R), 1.5);
      vec3 qn = vec3(cos(sw) * rc, sin(sw) * rc, x.z * 2.5) / R;
      float n = fbm3(qn * 0.75 + 3.0, 3);
      float rho = u_torus * env * (0.15 + 1.8 * n * n);
      float hot = exp(-(rc - 2.0 * R) / (1.6 * R));
      em += bb(mix(30000.0, 6000.0, smoothstep(2.0 * R, 8.0 * R, rc))) * rho * (0.45 + 1.6 * hot) / R;
      ext += rho * 0.3 / R;
    }
  }
  // Round the merged body, a layer of hot, churning gas a few kilometres deep.
  if (u_env > 0.001 && sd < 1.6 * R) {
    float n = fbm3(vec3(cos(ang - u_spin) * rc, sin(ang - u_spin) * rc, x.z) / R * 1.6 + u_t * 0.2, 2);
    float rho = u_env * exp(-max(sd, 0.0) / (0.28 * R)) * (0.35 + 1.3 * n * n);
    em += bb(30000.0) * rho * 0.2 / R;
    ext += rho * 0.15 / R;
  }
  if (ext <= 0.0) return vec4(0.0);
  // Gas going round at a good fraction of the speed of light: the side coming towards the camera is brighter and bluer.
  float beta = min(sqrt(u_Rs / max(2.0 * rc, 1e-5)), 0.5);
  vec3 vel = vec3(-x.y, x.x, 0.0) / max(rc, 1e-5);
  float dop = sqrt(1.0 - beta * beta) / (1.0 - beta * dot(vel, -v));
  // And light climbing out from close in loses energy.
  float red = sqrt(max(1.0 - u_Rs / r, 0.0));
  return vec4(em * pow(dop * red, 3.0), ext);
}

vec3 surface(vec3 x, vec3 v) {
  vec2 e = vec2(0.02 * u_abc.y, 0.0);
  vec3 n = normalize(vec3(bodies(x + e.xyy) - bodies(x - e.xyy), bodies(x + e.yxy) - bodies(x - e.yxy), bodies(x + e.yyx) - bodies(x - e.yyx)));
  float mu = max(dot(n, -v), 0.0);
  float side = dot(x, u_ax) > 0.0 ? 1.0 : -1.0;
  vec3 ay = vec3(-u_ax.y, u_ax.x, 0.0);
  vec3 lq = x - u_ax * u_sep * side;
  vec3 bq = vec3(dot(lq, u_ax), dot(lq, ay), lq.z) / u_abc.y;
  // A crust about a kilometre thick over a sea of neutrons, at about a million degrees: faint mottling, darker at the edge.
  float tex = fbm3(bq * 3.2 + side * 7.0 + vec3(0.0, 0.0, u_t * 0.05), 4);
  float face = max(dot(n, -u_ax * side), 0.0);
  float I = u_Ib * (0.62 + 0.38 * mu) * (0.6 + 0.8 * tex) * (1.0 + u_heat * (0.8 + 4.0 * face * face));
  // Where the two press together, the shock heats them hottest.
  I += u_Ib * u_shock * exp(-pow(dot(x, u_ax) / (0.5 * u_abc.y), 2.0)) * 7.0;
  // Light from the surface loses energy climbing out; as it falls inside its photon sphere, it goes dark.
  float r = length(x);
  I *= pow(max(1.0 - u_Rs / r, 0.0), 1.5) * (1.0 - u_bh);
  return bb(mix(30000.0, 40000.0, u_heat)) * I;
}

vec3 stars(vec3 ro, vec3 rd) {
  vec3 m1 = u_ax * u_sep, m2 = -m1;
  float rsi = 0.5 * u_Rs;
  vec3 col = vec3(0.0);
  float b00 = length(cross(ro, rd));
  float widen = min(1.0 + 2.0 * u_Rs * length(ro) / max(b00 * b00, 1e-8), 6.0);
  // A soft halo, and for when the stars are smaller than a pixel, the light of each as a point.
  for (int i = 0; i < 2; i++) {
    vec3 c = i == 0 ? m1 : m2;
    vec3 tc = c - ro;
    float dist = length(tc);
    float a = length(cross(rd, tc / dist));
    float ra = u_abc.y / dist;
    float pt = max(ra * ra / (u_px * u_px), 1.0) * (1.0 - smoothstep(0.8, 2.5, ra / u_px));
    vec3 hue = bb(mix(30000.0, 40000.0, u_heat)) * u_Ib * (1.0 + 3.0 * u_heat) * (1.0 - u_bh);
    col += hue * (pt * exp(-a * a / (2.0 * u_px * u_px)) + 0.035 * exp(-a / (5.0 * max(ra, u_px))));
  }
  float b0 = dot(ro, rd), c0 = dot(ro, ro) - u_Rb * u_Rb, disc = b0 * b0 - c0;
  if (disc <= 0.0 || -b0 + sqrt(disc) < 0.0) {
    // Past the sphere entirely: the whole bending at once.
    vec3 pc = ro - rd * b0;
    return col + sky(bend(pc, rd, 2.0 * u_Rs / max(length(pc), 1e-5)), widen);
  }
  float t0 = max(0.0, -b0 - sqrt(disc));
  vec3 x = ro + rd * t0;
  vec3 v = rd;
  // The bending on the way in, before the sphere.
  if (t0 > 0.0) {
    float b = length(cross(x, v));
    v = bend(x, v, u_Rs / max(b, 1e-5) * (1.0 - sqrt(max(1.0 - b * b / dot(x, x), 0.0))));
  }
  float trans = 1.0, stride = 1.0;
  float jit = hash2(gl_FragCoord.xy);
  // The closest the ray came to a surface without touching it, to soften the edges to a pixel.
  float msd = 1e9, mcov = 0.0;
  vec3 mx = x, mv = v;
  float gstep = u_Rb / 36.0;
  bool gasOn = u_arms > 0.001 || u_torus > 0.001 || u_env > 0.001;
  for (int i = 0; i < 90; i++) {
    vec3 x1 = x - m1, x2 = x - m2;
    float r1 = length(x1), r2 = length(x2), r = length(x);
    if (u_bh > 0.5 && r < u_Rs) { trans = 0.0; break; } // the horizon: nothing comes back
    float sd = u_bh > 0.999 ? 1e3 : bodies(x);
    if (sd < 0.002 * u_abc.y) { col += trans * surface(x, v); trans = 0.0; break; }
    float pw = u_px * length(x - ro);
    if (sd < pw && sd < msd) { msd = sd; mx = x; mv = v; mcov = trans; }
    if (r > u_Rb * 1.001 && dot(x, v) > 0.0) break;
    float h = min(max(sd * 0.9, 0.004 * u_abc.y), 0.28 * min(r1, r2));
    // Gas lies only in a thick disc round the plane of the orbit, and close round the body:
    // elsewhere the steps can be long.
    float slab = abs(x.z) - (0.32 * length(x.xy) + 0.6 * u_R);
    bool inGas = gasOn && (slab < 0.0 || (u_env > 0.001 && sd < 1.6 * u_R));
    if (length(x.xy) > 12.0 * u_R && u_arms < 0.001) inGas = false;
    if (gasOn && !inGas) h = min(h, max(slab * 0.9, gstep));
    if (inGas) {
      h = min(h, gstep * (0.6 + 0.8 * jit) * stride);
      vec4 g = gas(x, v, sd);
      col += trans * g.rgb * h;
      trans *= exp(-g.a * h);
      if (trans < 0.01) break;
      // Where the gas is thin, longer steps lose nothing that can be seen.
      stride = g.a * u_R < 0.015 ? 2.4 : 1.0;
    }
    // Light bent by each star (the photon equation of motion around a mass, in flat coordinates).
    vec3 c1 = cross(x1, v), c2 = cross(x2, v);
    vec3 acc = -1.5 * rsi * (dot(c1, c1) * x1 / pow(r1, 5.0) + dot(c2, c2) * x2 / pow(r2, 5.0));
    v = normalize(v + acc * h);
    x += v * h;
  }
  if (trans > 0.01) {
    // And the rest of the bending, after the sphere.
    float b = length(cross(x, v));
    v = bend(x, v, u_Rs / max(b, 1e-5) * (1.0 - sqrt(max(1.0 - b * b / dot(x, x), 0.0))));
    col += trans * sky(v, widen);
  }
  if (trans > 0.0 && msd < 1e8) {
    float c = 1.0 - clamp(msd / (u_px * length(mx - ro)), 0.0, 1.0);
    col = mix(col, mcov * surface(mx, mv), c * c);
  }
  return col;
}

// ---- 6: the haze round a nucleus, hot gas thick with free neutrons ----
vec3 haze(vec2 p) {
  float f = fbm3(vec3(p * 1.3, u_t * 0.06), 4);
  float g = fbm3(vec3(p * 4.0 + 9.0, u_t * 0.1), 3);
  return bb(5200.0) * (0.035 + 0.06 * f * f + 0.02 * g) * (1.0 - 0.35 * length(p));
}

// ---- 7, 8: the jet, and the debris glowing: the kilonova ----
// Shape and clumps are fixed in the debris itself: it expands evenly, everything moving
// at a speed in proportion to its distance, so its pattern only grows.
void ejecta(vec3 x, out vec3 em, out float ext) {
  float r = length(x), rc = length(x.xy);
  float cz = abs(x.z) / max(r, 1e-4);
  // Turbulent: the gas is stirred, so its clumps and filaments are folded through one another.
  vec3 w = x * 3.0 + 0.9 * (noise3(x * 2.1 + 1.0) - 0.5) * vec3(1.0, 0.7, -0.8);
  float n = fbm3(w + 11.0, 3);
  float fil = ridge3(w * 1.7 + 3.0, 3);
  float clump = smoothstep(0.36, 0.72, n) + 1.1 * pow(fil, 5.0);
  // The red part: slow and heavy, a thick lumpy ring round the equator, thick with rare-earth elements that block light.
  float tor = length(vec2(rc - 0.3, x.z * 1.4)) + 0.1 * (n - 0.5);
  float red = smoothstep(0.25, 0.1, tor) * (0.2 + clump);
  // The blue part: fast and light, out to the edge, more of it towards the poles.
  float edge = mix(0.72, 1.0, cz * cz);
  float blue = smoothstep(edge, edge - 0.35, r) * smoothstep(0.1, 0.4, r) * mix(0.2, 1.0, smoothstep(0.15, 0.75, cz)) * (0.08 + clump);
  // In the first seconds all of it is one hot cloud, hottest at the centre.
  float all_ = smoothstep(1.0, 0.45, r) * (0.12 + clump);
  float deep = 1.0 + 3.0 * exp(-r * r / 0.05);
  em = bb(u_tb) * blue * u_lb * 0.4 + bb(u_tr) * red * u_lr * (0.25 + 0.5 * clump) + bb(mix(7000.0, 22000.0, u_hot)) * all_ * deep * u_hot * 1.1;
  ext = blue * 0.8 + red * 4.5 + all_ * u_hot * 1.4;
}

vec3 debris(vec3 ro, vec3 rd) {
  vec3 col = vec3(0.0);
  // The jets, along the spin axis: the nearest points of ray and axis, and the glow of a thin cone there.
  float bz = rd.z, dd = dot(rd, ro), ez = ro.z;
  float den = max(1.0 - bz * bz, 1e-4);
  float sj = (bz * ez - dd) / den, zj = (ez - bz * dd) / den;
  vec3 jetC = vec3(0.0);
  if (u_jetI > 0.001 && sj > 0.0) {
    float az = abs(zj);
    float dist = length(ro + rd * sj - vec3(0.0, 0.0, zj));
    float w = 0.008 + 0.075 * az;
    float along = smoothstep(u_jet, u_jet - 0.05 - 0.1 * u_jet, az) * smoothstep(0.0, 0.03, az);
    float knots = 0.55 + 0.9 * noise3(vec3(az * 12.0 - u_t * 0.9, sign(zj) * 5.0, 0.0));
    float head = exp(-pow((az - u_jet) / 0.05, 2.0)) * 1.6;
    float I = u_jetI * exp(-dist * dist / (w * w)) * (along * knots + head) * (0.02 / w) / sqrt(den + 0.03);
    jetC = bb(26000.0) * I;
  }
  // The black hole and its disc, far too small now to see as more than a point of light.
  float sc = -dd;
  float ac = length(cross(rd, -ro / length(ro)));
  vec3 coreC = bb(24000.0) * u_core * (exp(-ac * ac / (2.0 * u_px * u_px)) * 1.5 + 0.05 * exp(-ac / (8.0 * u_px)));
  float b0 = dd, c0 = dot(ro, ro) - 1.0, disc = b0 * b0 - c0;
  if (disc <= 0.0) return sky(rd, 1.0) + jetC + coreC;
  float t0 = max(0.0, -b0 - sqrt(disc)), t1 = -b0 + sqrt(disc);
  if (sj < t0) col += jetC;
  if (sc < t0) col += coreC;
  float trans = 1.0;
  const int N = 32;
  float h = (t1 - t0) / float(N);
  float s = t0 + h * hash2(gl_FragCoord.xy);
  bool jetDone = sj < t0, coreDone = sc < t0;
  for (int i = 0; i < N; i++) {
    if (!jetDone && s > sj) { col += jetC * trans; jetDone = true; }
    if (!coreDone && s > sc) { col += coreC * trans; coreDone = true; }
    vec3 em; float ext;
    ejecta(ro + rd * s, em, ext);
    col += trans * em * h;
    trans *= exp(-ext * h);
    if (trans < 0.01) break;
    s += h;
  }
  if (!jetDone) col += jetC * trans;
  if (!coreDone) col += coreC * trans;
  // Light from the hot gas scattered in the debris and in the lens: a faint glow round it.
  float bimp = length(cross(ro, rd));
  col += (bb(u_tr) * u_lr * 0.05 + bb(u_tb) * u_lb * 0.03) * exp(-max(bimp - 0.25, 0.0) / 0.3);
  return col + trans * sky(rd, 1.0);
}

// ---- 9: NGC 4993, about 130 million light-years off, and the kilonova in it ----
vec3 galaxy(vec2 p, vec3 rd) {
  // The kilonova is at the centre of the frame; the galaxy's nucleus is about 6,000 light-years from it.
  vec2 g = p - u_gal;
  float ca = cos(0.5), sa = sin(0.5);
  vec2 q = mat2(ca, sa, -sa, ca) * g;
  q.y /= 0.8;
  float r = length(q);
  // An old, smooth galaxy without spiral arms: light falling steadily away from a small bright nucleus.
  float core = exp(-r / 0.014) * 0.9;
  float bulge = exp(-pow(r / 0.1, 0.55)) * 0.75;
  float halo = exp(-r / 0.38) * 0.07;
  vec3 col = bb(4300.0) * (core + bulge + halo);
  // Faint shells round it, the wreckage of a smaller galaxy it swallowed.
  float sh = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float R = 0.42 + 0.21 * fi;
    vec2 c = vec2(0.03 * fi, -0.02 * fi);
    float d = length(q - c) - R;
    float arc = smoothstep(0.9, 0.0, abs(atan(q.y - c.y, q.x - c.x) - (fi == 1.0 ? 2.6 : -0.4)));
    sh += exp(-abs(d) / 0.012) * smoothstep(0.03, 0.0, d) * arc * (0.03 - 0.008 * fi);
  }
  col += bb(4600.0) * sh;
  // A lane of dust crossing near the centre.
  vec2 dq = mat2(cos(-0.9), sin(-0.9), -sin(-0.9), cos(-0.9)) * g;
  float lane = exp(-pow((dq.y + 0.012 + 0.02 * sin(dq.x * 7.0)) / 0.014, 2.0)) * smoothstep(0.17, 0.02, abs(dq.x));
  float dust = lane * (0.35 + 0.9 * smoothstep(0.3, 0.75, fbm3(vec3(g * 30.0, 1.0), 4)));
  col *= exp(-1.4 * dust);
  // Globular clusters round it, points of old starlight.
  vec2 gc = g * 26.0, cell = floor(gc);
  vec2 at = cell + vec2(hash2(cell + 1.3), hash2(cell + 2.1));
  col += bb(4800.0) * exp(-length(gc - at) * 26.0) * step(0.78, hash2(cell)) * exp(-r / 0.45) * 0.35;
  // Galaxies far behind it.
  vec2 bc = p * 7.0, bcell = floor(bc);
  vec2 bat = bcell + 0.2 + 0.6 * vec2(hash2(bcell + 4.4), hash2(bcell + 6.6));
  vec2 bd = bc - bat;
  float bang = hash2(bcell + 8.8) * 6.283;
  bd = mat2(cos(bang), sin(bang), -sin(bang), cos(bang)) * bd;
  bd.y /= 0.35 + 0.6 * hash2(bcell + 9.9);
  col += mix(bb(4500.0), bb(9000.0), hash2(bcell + 3.3)) * exp(-length(bd) * 30.0) * step(0.55, hash2(bcell + 1.1)) * 0.12;
  col += sky(rd, 1.0) * 0.5;
  // The kilonova, a week or two on: a faint red point beside the galaxy.
  float k = length(p);
  col += bb(3000.0) * (exp(-k * k / (2.0 * pow(u_px * 2.0, 2.0))) * 16.0 + 0.25 * exp(-k / (7.0 * u_px)));
  return col;
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / (0.5 * u_res.y) - u_off;
  vec3 rd = normalize(u_cz + (p.x * u_cx + p.y * u_cy) * u_fov);
  vec3 col = vec3(0.0);
  if (u_w.x > 0.001) col += stars(u_eye, rd) * u_w.x;
  if (u_w.y > 0.001) col += haze(p) * u_w.y;
  if (u_w.z > 0.001) col += debris(u_eye, rd) * u_w.z;
  if (u_w.w > 0.001) col += galaxy(p, rd) * u_w.w;
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  o = vec4(tone(col) + (n - 0.5) / 255.0, 1.0);
}`;

// ---------------------------------------------------------------- the waves
// Each marker sits in the plane of the orbit. A gravitational wave passing outward stretches
// space across its direction of travel, so each is moved round the circle and up out of the
// plane. Each moves by the wave emitted when the stars were where they were a light-travel
// time ago, so the pattern is a two-armed spiral, its spacing the true wavelength.
const VS_DUST = `#version 300 es
in vec4 a_d; // where in the plane (log radius and angle, 0 to 1), and two randoms
uniform mat4 u_vp;
uniform float u_k; // kilometres per unit of the scene
uniform float u_tau; // seconds left until the merger (negative after it)
uniform float u_phiM; // the orbit's phase now (or at the merger, after it)
uniform float u_amp;
uniform float u_fade;
uniform float u_D; // the camera's distance, km
uniform float u_a; // the stars' separation, km
uniform float u_ps;
uniform vec2 u_off;
uniform float u_asp;
out float v_a;
const float C = 299792.458; // km/s
void main() {
  float r = exp(mix(log(12.0), log(420000.0), a_d.x));
  float th = a_d.y * 6.2831853;
  float tr = u_tau + r / C; // when, before the merger, the wave reaching here was sent
  float live = smoothstep(-0.0003, 0.0003, tr); // after the merger the waves stop: the last ones roll on outward
  float tq = max(tr, 1e-4);
  // The orbit's phase then: the real chirp, phase = 681 (time left)^(5/8), for GW170817's chirp mass.
  float phiR = u_phiM - 681.0 * (pow(tq, 0.625) - pow(max(u_tau, 1e-4), 0.625));
  float psi = 2.0 * (th - phiR);
  // Stronger as the stars close in.
  float g = pow(clamp(tq / 100.0, 1e-5, 1.0), -0.11);
  float amp = u_amp * g * live;
  float th2 = th + amp * 0.14 * sin(psi);
  float z = amp * 0.03 * r * cos(psi) * r / (r + u_a);
  vec3 pos = vec3(cos(th2) * r, sin(th2) * r, z) / u_k;
  vec4 cp = u_vp * vec4(pos, 1.0);
  cp.xy += u_off * vec2(1.0 / u_asp, 1.0) * cp.w;
  gl_Position = cp;
  gl_PointSize = u_ps;
  // Laid out evenly in log radius, markers crowd towards the centre: there only a share of them
  // is kept, so they lie about evenly over the frame, as a fine dust would.
  if (a_d.w > pow(r / (0.33 * u_D), 2.0)) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); v_a = 0.0; return; }
  float crowd = smoothstep(4.0 * u_D, 1.4 * u_D, r);
  v_a = u_fade * crowd * smoothstep(0.03 * u_a, 0.15 * u_a, r) * (0.3 + 0.7 * a_d.z) * step(0.0, cp.w);
}`;
const FS_DUST = `#version 300 es
precision mediump float;
in float v_a;
out vec4 o;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float m = exp(-dot(c, c) * 2.2);
  o = vec4(vec3(0.6, 0.66, 0.78) * v_a * m * 0.8, 1.0);
}`;

// ---------------------------------------------------------------- the nuclei
const VS_NUC = `#version 300 es
in vec2 a_q;
in vec4 a_a; // nucleus (0 is the one followed; -1 a free neutron), and the nucleon's place in it, fm
in vec4 a_b; // its place in the order of filling, a proton from the start, when it decays, random (free neutrons: their heading)
uniform mat4 u_proj;
uniform mat4 u_view;
uniform float u_s; // the r-process, 0 to 1
uniform float u_t;
uniform float u_fade;
uniform vec3 u_eye;
uniform vec2 u_off;
uniform float u_asp;
out vec2 v_q;
out vec3 v_col;
out vec3 v_c;
out float v_r;
out float v_a;
out float v_f;
float h(float x) { return fract(sin(x * 12.9898) * 43758.5453); }
vec3 dirOf(float x) { float y = h(x) * 2.0 - 1.0, a = h(x + 3.7) * 6.2831853, s = sqrt(1.0 - y * y); return vec3(cos(a) * s, y, sin(a) * s); }
void cull() { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); }
void main() {
  vec3 PROTON = vec3(0.86, 0.3, 0.24), NEUTRON = vec3(0.62, 0.67, 0.75);
  float id = a_a.x;
  vec3 pos;
  float alpha = 1.0, flash = 0.0;
  vec3 col;
  if (id < -0.5) {
    // A free neutron in the debris, passing through.
    pos = mod(a_a.yzw + a_b.xyz * (6.0 + 6.0 * a_b.w) * u_t + 90.0, 180.0) - 90.0;
    alpha = smoothstep(90.0, 60.0, max(abs(pos.x), max(abs(pos.y), abs(pos.z)))) * smoothstep(10.0, 18.0, length(pos));
    col = NEUTRON;
  } else {
    float slot = a_b.x;
    vec3 centre = id < 0.5 ? vec3(0.0) : dirOf(id * 7.31) * (75.0 + 45.0 * h(id));
    float s = u_s - (id < 0.5 ? 0.0 : (h(id + 2.0) - 0.4) * 0.15);
    // The seed holds the first 56; each one after is a neutron caught from the gas, in order.
    float arrive = slot < 55.5 ? -1.0 : 0.08 + 0.64 * (slot - 56.0) / 141.0 + (a_b.w - 0.5) * 0.008;
    float k = clamp((s - arrive + 0.09) / 0.09, 0.0, 1.0);
    if (k <= 0.0) { cull(); return; }
    float spin = u_t * 0.07 + id;
    mat3 R = mat3(cos(spin), 0.0, sin(spin), 0.0, 1.0, 0.0, -sin(spin), 0.0, cos(spin));
    vec3 local = R * a_a.yzw;
    vec3 from = dirOf(slot * 1.618 + id * 3.1) * 60.0;
    float e = 1.0 - (1.0 - k) * (1.0 - k);
    pos = centre + local + from * (1.0 - e);
    alpha = smoothstep(0.0, 0.35, k);
    // The nucleus shivers with the heat.
    pos += 0.12 * vec3(sin(u_t * 3.1 + slot), cos(u_t * 2.7 + slot * 1.3), sin(u_t * 2.3 + slot * 0.7));
    // A neutron decays: it becomes a proton, and an electron and an antineutrino leave.
    float isP = a_b.y > 0.5 ? 1.0 : smoothstep(a_b.z, a_b.z + 0.012, s);
    flash = exp(-abs(s - a_b.z) / 0.008) * step(a_b.y, 0.5);
    col = mix(NEUTRON, PROTON, isP);
  }
  if (length(pos - u_eye) < 7.0) { cull(); return; }
  vec4 c = u_view * vec4(pos, 1.0);
  float r = 0.86;
  v_r = r;
  v_c = c.xyz;
  v_q = a_q;
  v_col = col;
  v_f = flash;
  v_a = u_fade * alpha * smoothstep(9.0, 26.0, length(pos - u_eye));
  vec4 cp = u_proj * vec4(c.xyz + vec3(a_q * r * 1.05, 0.0), 1.0);
  cp.xy += u_off * vec2(1.0 / u_asp, 1.0) * cp.w;
  gl_Position = cp;
}`;
const FS_NUC = `#version 300 es
precision highp float;
in vec2 v_q; in vec3 v_col; in vec3 v_c; in float v_r; in float v_a; in float v_f;
uniform mat4 u_proj;
out vec4 o;
void main() {
  vec2 q = v_q * 1.05;
  float d2 = dot(q, q);
  if (d2 > 1.0) discard;
  vec3 n = vec3(q, sqrt(1.0 - d2));
  // Lit by the hot gas all round: a warm key from above, a cooler fill, and a rim.
  vec3 L = normalize(vec3(-0.5, 0.6, 0.65));
  float diff = max(dot(n, L), 0.0);
  float fill = max(dot(n, normalize(vec3(0.6, -0.3, 0.5))), 0.0);
  float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 40.0);
  float rim = pow(1.0 - n.z, 3.0);
  vec3 col = v_col * (0.14 + 0.72 * diff + 0.16 * fill) + vec3(1.0, 0.95, 0.88) * spec * 0.4 + vec3(1.0, 0.75, 0.5) * rim * 0.3;
  col += vec3(1.0, 0.96, 0.9) * v_f * 0.8;
  // Far ones are dimmer, through the gas between.
  col *= exp(-max(-v_c.z - 50.0, 0.0) / 200.0);
  vec4 clip = u_proj * vec4(v_c + n * v_r, 1.0);
  gl_FragDepth = clip.z / clip.w * 0.5 + 0.5;
  o = vec4(col, v_a);
}`;

// ---------------------------------------------------------------- the numbers
const C = 299792.458; // km/s
const GM = 3.636e11; // G times the total mass, 2.74 Suns, km^3/s^2
const R_NS = 12; // a neutron star's radius, km (GW170817 put it at about 11 to 13)
const RS = 8.1; // the Schwarzschild radius of 2.74 Suns, km
// The gravitational-wave frequency t seconds before the merger, for a chirp mass of 1.19 Suns (to first order).
const fgw = (tau: number) => 135.5 * Math.pow(Math.max(tau, 1e-6), -0.375);
// How far apart the stars are then, from Kepler's law.
const sepAt = (tau: number) => Math.cbrt(GM / Math.pow(Math.PI * fgw(tau), 2));
const TAU_C = 0.0024; // when they touch: the waves near 1,300 Hz, the stars about 28 km apart
const U_C = 0.41, U_M = 0.445; // touching, and one body

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const win = (a: number, b: number, c: number, d: number, x: number) => smooth(a, b, x) * (1 - smooth(c, d, x));
/** Through a list of [U, value] in log space, easing between each pair. */
function logKeys(keys: [number, number][], U: number) {
  if (U <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (U <= keys[i][0]) {
      const [u0, v0] = keys[i - 1], [u1, v1] = keys[i];
      return Math.exp(Math.log(v0) + (Math.log(v1) - Math.log(v0)) * smooth(u0, u1, U));
    }
  }
  return keys[keys.length - 1][1];
}

/** Seconds left until the merger, at U; after it, minus the seconds since. */
function tauAt(U: number) {
  if (U < U_C) return logKeys([[0, 100], [0.1, 96], [0.21, 62], [0.33, 0.012], [U_C, TAU_C]], U);
  if (U < U_M) return TAU_C * Math.pow((U_M - U) / (U_M - U_C), 4);
  return -0.035 * Math.pow(clamp01((U - U_M) / (0.53 - U_M)), 2);
}

/** A gold-197 nucleus, close packed: 197 places, nearest the centre first. */
function goldSlots() {
  const pts: number[][] = [];
  const s = 1.68 / Math.SQRT2, o = [0.13, 0.07, 0.21];
  for (let i = -8; i <= 8; i++)
    for (let j = -8; j <= 8; j++)
      for (let k = -8; k <= 8; k++) if ((((i + j + k) % 2) + 2) % 2 === 0) pts.push([i * s + o[0], j * s + o[1], k * s + o[2]]);
  let seed = 31;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0), seed / 4294967296);
  pts.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
  return pts.slice(0, 197).map((p) => p.map((x) => x + (rnd() - 0.5) * 0.25));
}

export function mountMerger(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "high-performance" });
  if (!gl) return null;
  let scene: ReturnType<typeof compile>, dust: ReturnType<typeof compile>, nuc: ReturnType<typeof compile>;
  try {
    scene = compile(gl, VS_QUAD, FS_SCENE);
    dust = compile(gl, VS_DUST, FS_DUST);
    nuc = compile(gl, VS_NUC, FS_NUC);
  } catch (e) {
    console.warn("merger: shaders unavailable", e);
    return null;
  }
  const corners = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

  const quad = gl.createVertexArray()!;
  gl.bindVertexArray(quad);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, corners, gl.STATIC_DRAW);
  const qLoc = gl.getAttribLocation(scene.p, "a_q");
  gl.enableVertexAttribArray(qLoc);
  gl.vertexAttribPointer(qLoc, 2, gl.FLOAT, false, 0, 0);

  // The markers: 512 rings spaced evenly in log radius, 1,024 round each, jittered so no grid shows.
  const NR = 512, NA = 1024, ND = NR * NA;
  const dd = new Float32Array(ND * 4);
  {
    let s = 5;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 4294967296);
    for (let i = 0, o = 0; i < NR; i++)
      for (let j = 0; j < NA; j++, o += 4) dd.set([(i + rnd()) / NR, (j + rnd()) / NA, rnd(), rnd()], o);
  }
  const dvao = gl.createVertexArray()!;
  gl.bindVertexArray(dvao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, dd, gl.STATIC_DRAW);
  const dLoc = gl.getAttribLocation(dust.p, "a_d");
  gl.enableVertexAttribArray(dLoc);
  gl.vertexAttribPointer(dLoc, 4, gl.FLOAT, false, 0, 0);

  // The nuclei: the one followed, six more further off in the gas, and free neutrons.
  const slots = goldSlots();
  const NUCLEI = 7, FREE = 260;
  const role = new Array(197).fill(0).map(() => ({ p: 0, decay: 2 }));
  {
    let s = 77;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 4294967296);
    // The seed, iron-56: 26 of its 56 are protons.
    const seedP = new Set<number>();
    while (seedP.size < 26) seedP.add(Math.floor(rnd() * 56));
    seedP.forEach((i) => (role[i].p = 1));
    // Gold has 79 protons: 53 more neutrons decay, each some while after it is caught.
    const later = [...Array(197).keys()].filter((i) => !seedP.has(i));
    const pick = new Set<number>();
    while (pick.size < 53) pick.add(later[Math.floor(rnd() * later.length)]);
    pick.forEach((i) => {
      const arrive = i < 56 ? 0 : 0.08 + (0.64 * (i - 56)) / 141;
      role[i].decay = Math.min(0.97, arrive + 0.08 + rnd() * (0.95 - arrive - 0.08));
    });
  }
  const nd = new Float32Array((NUCLEI * 197 + FREE) * 8);
  {
    let o = 0, s = 3;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 4294967296);
    for (let n = 0; n < NUCLEI; n++)
      for (let i = 0; i < 197; i++, o += 8) nd.set([n, ...slots[i], i, role[i].p, role[i].decay, rnd()], o);
    for (let i = 0; i < FREE; i++, o += 8) {
      const v = [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1], l = Math.hypot(...v) || 1;
      nd.set([-1, rnd() * 180 - 90, rnd() * 180 - 90, rnd() * 180 - 90, v[0] / l, v[1] / l, v[2] / l, rnd()], o);
    }
  }
  const nvao = gl.createVertexArray()!;
  gl.bindVertexArray(nvao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, corners, gl.STATIC_DRAW);
  const cl = gl.getAttribLocation(nuc.p, "a_q");
  gl.enableVertexAttribArray(cl);
  gl.vertexAttribPointer(cl, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, nd, gl.STATIC_DRAW);
  for (const [name, off] of [["a_a", 0], ["a_b", 4]] as const) {
    const loc = gl.getAttribLocation(nuc.p, name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 32, off * 4);
    gl.vertexAttribDivisor(loc, 1);
  }
  gl.bindVertexArray(null);

  let w = 0, h = 0, dpr = 1;
  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    const cw = Math.max(1, Math.round(canvas.clientWidth * dpr)), ch = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (cw === w && ch === h) return;
    w = canvas.width = cw;
    h = canvas.height = ch;
  };

  const FOV = Math.tan((40 * Math.PI) / 360);
  const view = new Float32Array(16), proj = new Float32Array(16), vp = new Float32Array(16);
  /** A camera at `eye` looking at the origin, with `up` towards the top of the frame. */
  function look(eye: number[], up: number[]) {
    const d = Math.hypot(...eye);
    const f = eye.map((v) => -v / d);
    let s = [f[1] * up[2] - f[2] * up[1], f[2] * up[0] - f[0] * up[2], f[0] * up[1] - f[1] * up[0]];
    const sl = Math.hypot(...s);
    s = s.map((v) => v / sl);
    const u = [s[1] * f[2] - s[2] * f[1], s[2] * f[0] - s[0] * f[2], s[0] * f[1] - s[1] * f[0]];
    const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    view.set([s[0], u[0], -f[0], 0, s[1], u[1], -f[1], 0, s[2], u[2], -f[2], 0, -dot(s, eye), -dot(u, eye), dot(f, eye), 1]);
    return { f, s, u, d };
  }
  function perspective(near: number, far: number) {
    proj.set([FOV === 0 ? 0 : 1 / FOV / (w / h), 0, 0, 0, 0, 1 / FOV, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0]);
  }
  function mul(a: Float32Array, b: Float32Array, out: Float32Array) {
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
        out[i * 4 + j] = s;
      }
  }
  const orbit = (d: number, el: number, az: number) => [d * Math.cos(el) * Math.cos(az), d * Math.cos(el) * Math.sin(az), d * Math.sin(el)];

  // The orbit's phase is kept by adding up how fast it turns, frame by frame, so it never jumps when the scroll does.
  let phi = 0, phiM = 0, swirl = 0, lastT = -1;

  function draw(U: number, t: number) {
    resize();
    const g = gl!;
    const dt = lastT < 0 ? 0 : Math.max(0, Math.min(0.1, t - lastT));
    lastT = t;
    const asp = w / h;
    const off = asp > 1 ? [0.26, 0.04] : [0, 0.3];
    const fit = asp < 1 ? Math.min(1.8, Math.max(1, 0.78 / asp)) : 1; // a narrow screen stands further back
    const px = (2 * FOV) / h;

    // ---- the clock of the inspiral ----
    const tau = tauAt(U);
    const tm = Math.max(0, -tau);
    // Shown slowed: twelve orbits a second becomes one every eight seconds, and the last
    // hundreds a second become about two.
    const omReal = Math.PI * fgw(Math.max(tau, TAU_C));
    let om = 0.78 * Math.pow(omReal / 75.4, 0.72);
    if (tau < 0) om *= 1 - 0.25 * smooth(0, 0.02, tm);
    phi += om * dt;
    if (tau > 0) phiM = phi;
    swirl = 1.8 * smooth(U_M, 0.53, U);

    // ---- where the stars are, and their shapes ----
    let a: number;
    if (U < U_C) a = sepAt(tau);
    else if (U < U_M) a = sepAt(TAU_C) + (14 - sepAt(TAU_C)) * smooth(U_C, U_M, U);
    else a = 14 * Math.exp(-tm / 0.003);
    const eps = Math.min(0.55, 3 * Math.pow(R_NS / Math.max(a, 1), 3)) * (U < U_M ? 1 : 1 - smooth(0, 0.008, tm));
    const relax = smooth(0, 0.009, tm);
    const collapse = smooth(0.012, 0.02, tm);
    const shrink = 1 - 0.94 * collapse;
    // The merged body settles into a flattened, spinning ball, about 36 km across at its equator.
    const A = R_NS * (1 + eps) * (1 - relax) + 1.5 * R_NS * relax;
    const B = (R_NS / Math.sqrt(1 + eps)) * (1 - relax) + 1.5 * R_NS * relax;
    const Cz = (R_NS / Math.sqrt(1 + eps)) * (1 - relax) + 1.15 * R_NS * relax;

    // ---- the camera on the stars ----
    let D = logKeys([[0, 680], [0.075, 720], [0.17, 140000], [0.22, 125000], [0.33, 3600], [U_C, 330], [U_M, 300], [0.5, 380], [0.565, 300]], U);
    const chirpW = win(0.2, 0.23, 0.31, 0.34, U);
    if (chirpW > 0) D = Math.exp(Math.log(D) * (1 - chirpW) + Math.log(9.5 * (C / fgw(Math.max(tau, 0.001)))) * chirpW);
    D *= fit;
    const el = logKeys([[0, 0.42], [0.08, 0.44], [0.17, 0.8], [0.3, 0.72], [0.38, 0.5], [0.45, 0.42], [0.53, 0.36]], U);
    const az = 0.7 + t * 0.012 + U * 1.4;

    const wStars = 1 - smooth(0.522, 0.552, U);
    const wHaze = win(0.52, 0.555, 0.635, 0.67, U);
    const wDebris = win(0.64, 0.675, 0.905, 0.935, U);
    const wGal = smooth(0.885, 0.93, U);
    // The markers only where the waves can be seen whole: from far enough back.
    const wDust = (1 - smooth(0.49, 0.53, U)) * (0.25 + 0.75 * smooth(400, 3000, D / fit)) * (1 - 0.85 * smooth(0.36, 0.42, U));

    g.viewport(0, 0, w, h);
    g.disable(g.DEPTH_TEST);
    g.disable(g.BLEND);
    g.useProgram(scene.p);
    const U_ = scene.u;
    g.uniform2f(U_.u_res, w, h);
    g.uniform2f(U_.u_off, off[0], off[1]);
    g.uniform1f(U_.u_t, t);
    g.uniform1f(U_.u_px, px);
    g.uniform1f(U_.u_fov, FOV);
    g.uniform4f(U_.u_w, wStars, wHaze, wDebris, wGal);
    g.uniform2f(U_.u_gal, asp > 1 ? 0.34 : 0.15, asp > 1 ? 0.12 : 0.22);

    let cam: ReturnType<typeof look>;
    if (U < 0.6) {
      // In units of the camera's distance, so the numbers stay well scaled from 70 km to 140,000.
      const k = D;
      cam = look(orbit(1, el, az), [0, 0, 1]);
      g.uniform3f(U_.u_eye, ...(orbit(1, el, az) as [number, number, number]));
      g.uniform3f(U_.u_ax, Math.cos(phi), Math.sin(phi), 0);
      g.uniform1f(U_.u_sep, a / 2 / k);
      g.uniform3f(U_.u_abc, (A * shrink) / k, (B * shrink) / k, (Cz * shrink) / k);
      g.uniform1f(U_.u_Rs, RS / k);
      g.uniform1f(U_.u_Rb, Math.max(1.25 * (a / 2) + 60, 190) / k);
      const heat = smooth(0.35, 0.43, U) * (1 - 0.6 * smooth(U_M, 0.47, U));
      g.uniform1f(U_.u_Ib, 1.8 - 0.7 * smooth(U_C, 0.47, U));
      g.uniform1f(U_.u_heat, heat);
      g.uniform1f(U_.u_shock, smooth(U_C - 0.01, U_M, U) * (1 - relax));
      g.uniform1f(U_.u_bh, collapse);
      g.uniform1f(U_.u_arms, smooth(0.385, 0.435, U) * (1 - smooth(U_M, 0.5, U)));
      g.uniform1f(U_.u_rout, Math.min(260, 30 + 90 * smooth(0.39, U_M, U) + 0.22 * C * tm) / k);
      g.uniform1f(U_.u_torus, smooth(U_M - 0.005, 0.5, U));
      g.uniform1f(U_.u_spin, phi);
      g.uniform1f(U_.u_R, R_NS / k);
      g.uniform1f(U_.u_env, smooth(U_C, U_M, U) * (1 - collapse));
      g.uniform1f(U_.u_swirl, swirl + 0.15 * t);
    } else {
      // ---- the debris, in units of its outer edge ----
      const tmC = logKeys([[0.6, 0.06], [0.77, 2.2], [0.8, 3 * 3600], [0.9, 1.2e6]], U);
      const days = tmC / 86400;
      const Dn = logKeys([[0.6, 4.8], [0.7, 4.0], [0.86, 3.4], [0.935, 320]], U) * fit;
      const elC = 0.22 + 0.1 * smooth(0.77, 0.86, U);
      const still = 1 - smooth(0.86, 0.92, U);
      const azC = 0.4 + (t * 0.01 + U * 0.8) * still;
      const eye = orbit(Dn, elC, azC);
      cam = look(eye, [0, 0, 1]);
      g.uniform3f(U_.u_eye, eye[0], eye[1], eye[2]);
      // The jet: launched a few tenths of a second in, through the debris by about a second, then far out past it.
      const head = Math.max(0, logKeys([[0.6, 0.001], [0.66, 0.01], [0.72, 0.6], [0.75, 1.05], [0.77, 2.4], [0.8, 3.3]], U) - 0.001);
      g.uniform1f(U_.u_jet, head);
      g.uniform1f(U_.u_jetI, 2.5 * smooth(0.655, 0.69, U) * (1 - smooth(0.78, 0.82, U)) * (1 + 1.2 * win(0.735, 0.75, 0.76, 0.785, U)));
      // The kilonova's light: the blue part brightest within a day and gone in a week; the red part slower, lasting weeks.
      const lb = 2.6 * Math.exp(-days / 1.6) * smooth(0, 0.08, days);
      const lr = 2.2 * (days / 3.5) * Math.exp(1 - days / 3.5) + 0.4 * smooth(0, 0.3, days);
      g.uniform1f(U_.u_lb, lb);
      g.uniform1f(U_.u_lr, lr);
      g.uniform1f(U_.u_tb, Math.max(4500, 10500 * Math.pow(days + 0.25, -0.33)));
      g.uniform1f(U_.u_tr, Math.max(2300, 3600 * Math.pow(days + 0.5, -0.18)));
      g.uniform1f(U_.u_hot, 1 - smooth(1, 4, Math.log10(tmC) + 1.2));
      g.uniform1f(U_.u_core, 3 * (1 - smooth(0.7, 0.78, U)));
    }
    g.uniform3f(U_.u_cx, cam.s[0], cam.s[1], cam.s[2]);
    g.uniform3f(U_.u_cy, cam.u[0], cam.u[1], cam.u[2]);
    g.uniform3f(U_.u_cz, cam.f[0], cam.f[1], cam.f[2]);
    g.bindVertexArray(quad);
    g.drawArrays(g.TRIANGLE_STRIP, 0, 4);

    // ---- the waves, in the markers ----
    if (wDust > 0.002 && U < 0.6) {
      perspective(0.01, 30);
      mul(proj, view, vp);
      g.enable(g.BLEND);
      g.blendFunc(g.ONE, g.ONE);
      g.useProgram(dust.p);
      g.uniformMatrix4fv(dust.u.u_vp, false, vp);
      g.uniform1f(dust.u.u_k, D);
      g.uniform1f(dust.u.u_tau, tau);
      g.uniform1f(dust.u.u_phiM, phiM);
      g.uniform1f(dust.u.u_amp, 1.0 + 0.6 * smooth(0.25, 0.4, U));
      g.uniform1f(dust.u.u_fade, wDust);
      g.uniform1f(dust.u.u_D, D);
      g.uniform1f(dust.u.u_a, a);
      g.uniform1f(dust.u.u_ps, 1.9 * dpr);
      g.uniform2f(dust.u.u_off, off[0], off[1]);
      g.uniform1f(dust.u.u_asp, asp);
      g.bindVertexArray(dvao);
      g.drawArrays(g.POINTS, 0, ND);
      g.disable(g.BLEND);
    }

    // ---- the nuclei ----
    const fade = win(0.53, 0.562, 0.63, 0.66, U);
    if (fade > 0.002) {
      const s = smooth(0.54, 0.645, U);
      const dist = logKeys([[0.53, 150], [0.565, 48], [0.63, 54], [0.665, 190]], U) * fit;
      const eye = orbit(dist, 0.3, 0.3 + t * 0.05 + s * 1.5);
      const c = look([eye[0], eye[2], eye[1]], [0, 1, 0]);
      void c;
      perspective(Math.max(0.5, dist * 0.05), dist + 320);
      g.enable(g.DEPTH_TEST);
      g.depthMask(true);
      g.clear(g.DEPTH_BUFFER_BIT);
      g.useProgram(nuc.p);
      g.uniformMatrix4fv(nuc.u.u_proj, false, proj);
      g.uniformMatrix4fv(nuc.u.u_view, false, view);
      g.uniform1f(nuc.u.u_s, s);
      g.uniform1f(nuc.u.u_t, t);
      g.uniform1f(nuc.u.u_fade, fade);
      g.uniform3f(nuc.u.u_eye, eye[0], eye[2], eye[1]);
      g.uniform2f(nuc.u.u_off, off[0], off[1]);
      g.uniform1f(nuc.u.u_asp, asp);
      g.enable(g.BLEND);
      g.blendFunc(g.SRC_ALPHA, g.ONE_MINUS_SRC_ALPHA);
      g.bindVertexArray(nvao);
      g.drawArraysInstanced(g.TRIANGLE_STRIP, 0, 4, NUCLEI * 197 + FREE);
      g.disable(g.DEPTH_TEST);
      g.disable(g.BLEND);
    }
  }
  return { draw };
}
