/**
 * Falling into a black hole (Sequence.astro), as the page is scrolled through
 * it: a hole of 100 million suns, its thin disc of gas, the last stable orbit,
 * the sphere where light can orbit, holding still just over the horizon, the
 * fall through it, and the inside.
 *
 * Every pixel is a ray of light followed back from the camera along its real
 * path round the hole (a non-spinning, Schwarzschild hole), so nothing here is
 * painted on: the disc's far side showing over the top of the shadow and under
 * it, the thin bright ring at the shadow's edge, the sky bent round it, all come
 * out of the one calculation. So does the colour: the gas and the stars are
 * drawn as glowing bodies at a temperature, and the light from each reaches the
 * camera shifted by the hole's gravity and by how fast its source and the
 * camera are moving.
 *
 * How it is worked out, in units where G = c = 1 and lengths are in GM/c^2
 * (for this hole, about 1 AU; the horizon is at r = 2):
 *
 *   A ray of light round a non-spinning hole stays in one plane, and its
 *   distance from the centre, as u = 1/r against the angle phi it has gone
 *   round, obeys u'' = 3u^2 - u. That holds outside the horizon and inside it
 *   alike, so the same few lines follow light to a camera that has fallen in.
 *   The disc lies in one plane through the centre, so the angles at which a ray
 *   crosses it are known in advance: no searching.
 *
 *   The camera is described in the frame of someone falling in from far away
 *   ("rain", in Hamilton and Lisle's river model of a black hole), whose
 *   surroundings look locally like flat space. A camera holding still, or one
 *   that has been let go from rest, is moving relative to that frame, straight
 *   up or down; its view is the rain view seen through that motion
 *   (aberration), which is what squeezes the sky into a circle overhead when it
 *   holds still close to the horizon.
 *
 *   Two quantities of each ray stay fixed all along it: its energy as seen from
 *   far away, and its angular momentum. From them come the shift in frequency
 *   of the starlight (seen from far away, at rest) and of the gas (moving round
 *   in its orbit) when it reaches the camera.
 *
 * Passes: the scene, in light units that are not yet exposed; two smaller
 * copies of it, blurred, for the glow a real lens puts round anything bright;
 * and the exposure, with the film-like roll-off the site's other scenes use.
 */
import { compile, NOISE } from "./supernova";

const VS = `#version 300 es
in vec2 a_q;
void main() { gl_Position = vec4(a_q, 0.0, 1.0); }`;

// ---------------------------------------------------------------- the scene
const FS_SCENE = `#version 300 es
precision highp float;
${NOISE}
out vec4 o;
uniform vec2 u_res;
uniform vec3 u_cam; // where the camera is, GM/c^2
uniform mat3 u_view; // its right, up and forward
uniform float u_w; // its speed outward relative to someone falling in from far away (rain), in c
uniform float u_tan; // tan of half the field of view across the shorter side
uniform float u_phase; // the gas's clock, seconds, as the camera sees it run
uniform float u_direct; // 1: no float target, so expose and finish here
uniform float u_exp;
uniform vec3 u_axis; // the point on the sky straight behind the hole, as the camera falls towards it

const float PI = 3.14159265;
const float RIN = 6.0; // the last stable orbit
const float ROUT = 44.0;
const vec3 AXIS = vec3(0.0, -1.0, 0.0); // the disc turns about this
const float TPEAK = 9000.0; // its hottest ring, kelvin (see the text: the real gas is far hotter)

vec3 tone(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }

// A glowing body at temperature T, as red, green and blue, balanced (like a camera set for shade) so 8,000 K is white.
// (Planck's law sampled at 610, 550 and 465 nm.)
vec3 planck(float T) {
  vec3 x = min(vec3(14388.0 / 0.61, 14388.0 / 0.55, 14388.0 / 0.465) / max(T, 1.0), vec3(70.0));
  return vec3(18.077, 25.31, 46.83) / (exp(x) - 1.0);
}
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// Noise whose finer layers fade out where one pixel covers more of the sky than they vary over.
float fbmL(vec3 p, float fp) {
  float s = 0.0, a = 0.5, f = 1.0;
  for (int k = 0; k < 5; k++) {
    s += a * mix(0.5, noise3(p), clamp(1.6 - f * fp * 3.0, 0.0, 1.0));
    p = p * 2.03 + 7.1;
    a *= 0.5;
    f *= 2.03;
  }
  return s;
}

// ---- the sky: our galaxy's band of light, and stars ----
// d: the direction the light came from, far away; g: how much bluer it arrives; sx, sy: how d
// changes from one pixel to the next, across and up (the lensing, locally).
const vec3 GPOLE = vec3(0.4718, 0.8649, 0.1715);
vec3 sky(vec3 d, float g, vec3 sx, vec3 sy) {
  float fp0 = 2.0 * u_tan / min(u_res.x, u_res.y); // one pixel, unlensed
  float fp = max(length(sx), length(sy)); // the most sky one pixel spans, any way
  // The band: unresolved stars, warm, with star clouds a little bluer and lanes of dust across them.
  float z = dot(d, GPOLE);
  float glow = 0.025, blue = 0.0;
  if (abs(z) < 0.45) {
    vec3 C = normalize(vec3(-0.35, 0.10, -0.93));
    float toC = acos(clamp(dot(d, C), -1.0, 1.0));
    float clouds = fbmL(d * 4.0 + 1.3, fp * 4.0);
    float fine = fbmL(d * 11.0 + 4.1, fp * 11.0);
    float thick = 0.11 + 0.05 * clouds;
    float band = exp(-z * z / (thick * thick)) * (0.35 + 0.9 * exp(-toC * toC / 0.5));
    float bulge = exp(-(toC * toC) / 0.03 - z * z / 0.012) * 1.2;
    float dust = smoothstep(0.42, 0.7, fbmL(d * 7.0 + 9.0, fp * 7.0)) * exp(-z * z / 0.004);
    glow += (band * (0.45 + 0.9 * clouds * fine) + bulge) * (1.0 - 0.8 * dust);
    blue = smoothstep(0.55, 0.8, clouds) * 0.5;
  }
  // (Dividing by the colour's own brightness at rest keeps only what the shift does to it.)
  vec3 col = glow * 0.06 * mix(planck(g * 4300.0) / 0.0599, planck(g * 7500.0) / 0.7992, blue);
  vec3 smear = planck(g * 5200.0) / 0.1695;

  // Stars: one at most in each cell of three grids on the sky. A star is a point however the hole
  // stretches the sky round it, so each is drawn in the picture's own pixels, found by undoing the
  // local stretch; where lensing magnifies, it is brighter, where it squeezes, dimmer. Where a pixel
  // spans many cells, the stars in it are added up into an even glow instead of flickering.
  float area = max(length(cross(sx, sy)), 1e-14);
  float mag = min(fp0 * fp0 / area, 14.0);
  float e = 0.0008 * fp0 * fp0;
  float a11 = dot(sx, sx) + e, a12 = dot(sx, sy), a22 = dot(sy, sy) + e, det = a11 * a22 - a12 * a12;
  for (int l = 0; l < 3; l++) {
    float N = l == 0 ? 34.0 : (l == 1 ? 110.0 : 320.0);
    vec3 q = d * N, cell = floor(q);
    float dens = l == 0 ? 0.22 : (l == 1 ? 0.3 : 0.5); // how many cells hold a star
    float there = step(1.0 - dens, hash3(cell + 0.31));
    vec3 at = normalize(cell + 0.25 + 0.5 * vec3(hash3(cell + 1.7), hash3(cell + 3.1), hash3(cell + 5.3)));
    vec3 off = at - d;
    float b1 = dot(off, sx), b2 = dot(off, sy);
    float px = (b1 * a22 - b2 * a12) / det, py = (a11 * b2 - a12 * b1) / det;
    // Brightness: many faint, a few bright, as on a long exposure of a real sky.
    float b = hash3(cell + 9.4), s0 = l == 0 ? 1.6 : (l == 1 ? 1.0 : 0.05);
    float F = s0 * (pow(b, 24.0) * 9.0 + pow(b, 5.0) * 0.5 + 0.02);
    // (No star sits right behind the hole on the line the camera falls along: one there would be drawn
    // out into a full ring, an Einstein ring, for the whole approach.)
    float pt = there * F * exp(-0.5 * (px * px + py * py) / 0.49) * mag * smoothstep(0.012, 0.028, length(at - u_axis));
    // The same stars, smeared evenly: their light per pixel, averaged over a patch of sky.
    float meanF = s0 * (9.0 / 25.0 + 0.5 / 6.0 + 0.02);
    // (Each star's image holds 2 pi 0.7^2 = 3.08 pixels' worth; a cell is (N fp)^-2 pixels, for pixels of a
    // frame 1,000 across, so the glow is the same on a phone as on a large screen.)
    float mean = dens * meanF * 3.08 * pow(N * 2.0 * u_tan / 1000.0, 2.0);
    float k = smoothstep(0.25 / N, 0.8 / N, fp);
    vec3 star = vec3(0.0);
    if (pt * (1.0 - k) > 1e-4) {
      // Its colour: mostly cool and yellow-white, a few hot and blue.
      float h = hash3(cell + 2.2);
      float T = h < 0.08 ? mix(9000.0, 22000.0, hash3(cell + 6.6)) : mix(3100.0, 7200.0, pow(h, 1.4));
      star = pt * planck(g * T) / lum(planck(T));
    }
    col += mix(star, mean * smear, k);
  }
  return col;
}

// ---- the disc ----
// Gas going round, sheared as it goes (inner rings lap outer ones). To keep the shear from winding
// up forever, two copies of the pattern take turns, each fading in fresh as the other fades out.
float gasAt(float r, float ang, float t, float seed) {
  float spin = (6.2831853 / 26.0) * pow(RIN / r, 1.5) * t; // the inner edge goes round in 26 s here; really, 12.6 hours
  float a = ang + spin;
  vec3 q = vec3(cos(a) * 1.7, sin(a) * 1.7, log(r) * 10.0) + seed * 17.3;
  float big = fbm3(q, 4);
  float fine = fbm3(q * vec3(3.1, 3.1, 2.6) + 5.0, 2);
  return big * 0.75 + fine * 0.4;
}
float gas(float r, float ang) {
  const float P = 9.0;
  float ta = mod(u_phase, P), tb = mod(u_phase + 0.5 * P, P);
  float wa = 1.0 - abs(2.0 * ta / P - 1.0);
  // (Near the ends of its turn a copy is all but invisible, and is not worked out.)
  float A = wa > 0.015 ? gasAt(r, ang, ta - 0.5 * P, floor(u_phase / P)) : 0.5;
  float B = wa < 0.985 ? gasAt(r, ang, tb - 0.5 * P, floor((u_phase + 0.5 * P) / P) + 0.5) : 0.5;
  return mix(B, A, wa);
}
// What one point of the disc sends to the camera: its light, and how much it hides behind it.
vec3 disc(float r, vec3 x, float g, out float a) {
  // A thin disc with no grip at its inner edge: it glows hottest at r = 49/6 and fades to nothing at the last stable orbit.
  float f = max(pow(r, -3.0) * (1.0 - sqrt(RIN / r)), 0.0) / 2.6235e-4;
  float n = gas(r, atan(x.z, x.x));
  float T = TPEAK * pow(f, 0.25) * (0.9 + 0.2 * n);
  a = clamp(0.25 + 1.1 * n, 0.0, 1.0) * smoothstep(RIN, RIN + 1.2, r) * (1.0 - smoothstep(ROUT * 0.55, ROUT, r));
  a = max(a, 0.6 * smoothstep(RIN, RIN + 1.2, r) * (1.0 - smoothstep(ROUT * 0.45, ROUT * 0.8, r)));
  return planck(g * T) * (0.55 + 0.45 * smoothstep(0.2, 0.8, n));
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / (0.5 * min(u_res.x, u_res.y));
  vec3 dirc = normalize(u_view * vec3(p * u_tan, 1.0));
  float r0 = length(u_cam);
  vec3 R = u_cam / r0;
  float beta = sqrt(2.0 / r0); // how fast the rain frame falls here

  // The light as the camera receives it: travelling along -dirc, energy 1. Seen from the rain frame
  // (the camera moving at u_w straight out, relative to it) it comes from a different direction with a different energy.
  vec3 nc = -dirc;
  float w = u_w, gam = inversesqrt(max(1.0 - w * w, 1e-6));
  float npar = dot(nc, R);
  float E = gam * (1.0 + w * npar);
  vec3 pr = nc + (gam * (npar + w) - npar) * R;
  vec3 n = pr / E;
  float nr = dot(n, R);
  // What stays fixed along the ray: its energy as seen from far away, and its angular momentum about the disc's axis.
  float omega = E * (1.0 - beta * nr);
  float LA = dot(cross(u_cam, pr), AXIS);

  // The plane the ray moves in, and where it starts in it.
  vec3 nt = n - nr * R;
  float ntl = max(length(nt), 1e-6);
  vec3 e1 = R, e2 = -nt / ntl;
  float u = 1.0 / r0, du = (nr - beta) / (r0 * ntl), phi = 0.0;
  // The angles at which it crosses the disc's plane, every half turn.
  float phc = mod(atan(e2.y, e1.y) + 0.5 * PI, PI);
  if (phc < 1e-4) phc += PI;

  vec3 col = vec3(0.0);
  float trans = 1.0;
  vec3 sdir = R;
  float seen = 0.0;
  // Inside the horizon some directions would need light whose energy, as seen from far away, is not
  // positive: no such light came from the sky or the disc, so those rays are black.
  bool live = omega > 0.0;
  for (int i = 0; i < 72; i++) {
    if (!live) break;
    if (u < 0.0125 && du < 0.0) {
      // Far out and heading away: from here the path is all but straight.
      float pinf = phi + atan(u, -du);
      sdir = cos(pinf) * e1 + sin(pinf) * e2;
      seen = 1.0;
      break;
    }
    if (u > 0.5 && du > 0.0) break; // back to the horizon: the shadow
    float h = min(0.13, 0.3 * u / max(abs(du), 1e-6) + 0.004);
    // One step of u'' = 3u^2 - u (fourth-order Runge-Kutta).
    float k1u = du, k1v = 3.0 * u * u - u;
    float u2 = u + 0.5 * h * k1u;
    float k2u = du + 0.5 * h * k1v, k2v = 3.0 * u2 * u2 - u2;
    float u3 = u + 0.5 * h * k2u;
    float k3u = du + 0.5 * h * k2v, k3v = 3.0 * u3 * u3 - u3;
    float u4 = u + h * k3u;
    float k4u = du + h * k3v, k4v = 3.0 * u4 * u4 - u4;
    float un = u + h / 6.0 * (k1u + 2.0 * k2u + 2.0 * k3u + k4u);
    float dun = du + h / 6.0 * (k1v + 2.0 * k2v + 2.0 * k3v + k4v);
    if (phi + h >= phc) {
      // It crosses the disc's plane in this step: where, between the two ends (a cubic through both).
      float s = (phc - phi) / h, s2 = s * s, s3 = s2 * s;
      float uc = (2.0 * s3 - 3.0 * s2 + 1.0) * u + (s3 - 2.0 * s2 + s) * h * du + (-2.0 * s3 + 3.0 * s2) * un + (s3 - s2) * h * dun;
      float rc = 1.0 / max(uc, 1e-4);
      if (rc > RIN && rc < ROUT) {
        vec3 x = (cos(phc) * e1 + sin(phc) * e2) * rc;
        // The gas moves round at the orbit's speed: its light reaches the camera shifted by g.
        float emit = inversesqrt(1.0 - 3.0 / rc) * (omega - pow(rc, -1.5) * LA);
        float g = 1.0 / max(emit, 1e-3);
        float a;
        vec3 c = disc(rc, x, g, a);
        col += trans * a * c;
        trans *= 1.0 - a;
        if (trans < 0.01) break;
      }
      phc += PI;
    }
    u = un;
    du = dun;
    phi += h;
  }
  // How much sky one pixel spans, at the far end of its ray.
  vec3 sx = dFdx(sdir), sy = dFdy(sdir);
  if (seen > 0.5 && trans > 0.01) col += trans * sky(sdir, 1.0 / omega, sx, sy);

  if (u_direct > 0.5) {
    float nz = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    o = vec4(tone(col * u_exp) + (nz - 0.5) / 255.0, 1.0);
  } else o = vec4(min(col, vec3(6.0e4)), 1.0);
}`;

// ---------------------------------------------------------------- the glow
// Each pass halves and halves again: four taps, each between four texels, is the average of sixteen.
const FS_DOWN = `#version 300 es
precision highp float;
uniform sampler2D u_src;
uniform vec2 u_texel; // one texel of the source
out vec4 o;
void main() {
  vec2 c = gl_FragCoord.xy * 4.0 * u_texel;
  vec3 s = texture(u_src, c + vec2(-1.0, -1.0) * u_texel).rgb + texture(u_src, c + vec2(1.0, -1.0) * u_texel).rgb
         + texture(u_src, c + vec2(-1.0, 1.0) * u_texel).rgb + texture(u_src, c + vec2(1.0, 1.0) * u_texel).rgb;
  o = vec4(s * 0.25, 1.0);
}`;

const FS_OUT = `#version 300 es
precision highp float;
uniform sampler2D u_a;
uniform sampler2D u_b;
uniform sampler2D u_c;
uniform vec2 u_res;
uniform vec2 u_tb;
uniform vec2 u_tc;
uniform float u_exp;
out vec4 o;
vec3 tone(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
vec3 tent(sampler2D t, vec2 uv, vec2 tx) {
  return (texture(t, uv + vec2(-0.75, -0.75) * tx).rgb + texture(t, uv + vec2(0.75, -0.75) * tx).rgb
        + texture(t, uv + vec2(-0.75, 0.75) * tx).rgb + texture(t, uv + vec2(0.75, 0.75) * tx).rgb) * 0.25;
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec3 a = texelFetch(u_a, ivec2(gl_FragCoord.xy), 0).rgb;
  // A lens spreads a little of every bright thing's light round it: a close halo and a wide, faint one.
  vec3 col = a * 0.93 + tent(u_b, uv, u_tb) * 0.05 + tent(u_c, uv, u_tc) * 0.035;
  float nz = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  o = vec4(tone(col * u_exp) + (nz - 0.5) / 255.0, 1.0);
}`;

// ---------------------------------------------------------------- the path
/** A smooth path through keyframes that never overshoots them (Fritsch and Carlson's monotone cubic). */
function track(keys: [number, number][]) {
  const n = keys.length, x = keys.map((k) => k[0]), y = keys.map((k) => k[1]);
  const d = x.slice(0, -1).map((_, i) => (y[i + 1] - y[i]) / (x[i + 1] - x[i]));
  const m = x.map((_, i) => (i === 0 ? d[0] : i === n - 1 ? d[n - 2] : d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return (u: number) => {
    if (u <= x[0]) return y[0];
    if (u >= x[n - 1]) return y[n - 1];
    let i = 0;
    while (u > x[i + 1]) i++;
    const h = x[i + 1] - x[i], t = (u - x[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * y[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * y[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

/** Where it holds still before letting go: one per cent above the horizon, where its clock runs ten times slow. */
const HOLD = 2 / 0.99;
/** The point in the sequence at which it lets go. */
const GO = 0.665;

// Distance from the centre, in GM/c^2 (about 1 AU here). Held in log so the far approach and the last
// fraction of a per cent above the horizon both get their share of the scroll.
const logR = track([
  [0, Math.log(72)],
  [0.11, Math.log(46)],
  [0.22, Math.log(25)],
  [0.33, Math.log(10.5)],
  [0.44, Math.log(3.0)],
  [0.48, Math.log(2.95)],
  [0.565, Math.log(HOLD)],
  [GO, Math.log(HOLD)],
  [0.77, Math.log(2.0)],
  [0.88, Math.log(1.1)],
  [1, Math.log(0.32)],
]);
// How far round the camera has turned, from facing the hole (0) through looking along the orbit (90) to straight up (180).
const yaw = track([
  [0, -2],
  [0.3, -2],
  [0.4, 88],
  [0.47, 92],
  [0.56, 180],
]);
// While it looks straight up at a round patch of sky, it turns a quarter turn about its line of sight...
const roll = track([
  [0.56, 0],
  [0.7, 90],
]);
// ...so that at the end, tipping its gaze down to the horizontal, the outside is up and the hole is down.
const tilt = track([
  [0.79, 0],
  [0.9, 90],
]);
// While it looks up, the patch of sky overhead is set off to one side, clear of the words: to the
// right on a wide screen, upward on a tall one.
const aside = track([
  [0.48, 0],
  [0.58, 1],
  [0.8, 1],
  [0.87, 0],
]);
// A little downward tilt while it faces the hole, so the hole sits high in the frame and the words low.
const pitch = track([
  [0, -4.5],
  [0.3, -5],
  [0.4, 0],
  [1, 0],
]);
// How high over the disc's plane it comes in, degrees.
const elev = track([
  [0, 5.5],
  [0.22, 6.5],
  [0.33, 9],
  [1, 9],
]);
// Half the field of view across the shorter side, degrees: a long lens far out, wider close in.
const half = track([
  [0, 17],
  [0.11, 21],
  [0.22, 28],
  [0.33, 36],
  [0.44, 42],
  [0.57, 36],
  [0.66, 30],
  [0.8, 45],
  [1, 46],
]);
// Exposure in stops, on top of the camera's own stopping down for the blueshift of everything it sees (below).
// Close to the horizon it is exposed for the sky, and lets the disc's images in it burn white.
// Inside, it stops well down while the bright band round its waist sweeps up through the frame.
const stops = track([
  [0, -1.2],
  [0.22, -1.4],
  [0.33, -1.7],
  [0.44, -1.5],
  [0.5, -1.2],
  [0.58, 1.2],
  [0.77, 1.2],
  [0.81, -2.4],
  [0.86, -4.3],
  [0.92, -3.1],
  [1, -3.4],
]);
/** How much brighter, to a camera, a 5,200 K glow looks when its light arrives g times bluer (green, 550 nm). */
const brighter = (g: number) => (Math.exp(14388 / (0.55 * 5200)) - 1) / (Math.exp(Math.min(14388 / (0.55 * 5200 * Math.max(g, 0.05)), 80)) - 1);

export function mountHorizon(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "high-performance" });
  if (!gl) return null;
  let scene: ReturnType<typeof compile>, down: ReturnType<typeof compile>, out: ReturnType<typeof compile>;
  try {
    scene = compile(gl, VS, FS_SCENE);
    down = compile(gl, VS, FS_DOWN);
    out = compile(gl, VS, FS_OUT);
  } catch (e) {
    console.warn("horizon: shaders unavailable", e);
    return null;
  }
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  for (const p of [scene.p, down.p, out.p]) {
    const loc = gl.getAttribLocation(p, "a_q");
    if (loc >= 0) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    }
  }

  // Light is kept in floating point until it is exposed, so the brightest gas and the dimmest stars
  // are both kept. Without float targets the scene exposes itself in one pass, with no glow.
  const float = !!gl.getExtension("EXT_color_buffer_float");
  gl.getExtension("OES_texture_float_linear");
  type Target = { tex: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number };
  const targets: Target[] = [];
  const target = (w: number, h: number): Target => {
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fb, w, h };
  };
  let fbOk = float;

  let w = 0, h = 0;
  // At most 1.25 device pixels per CSS pixel, and no more than about two million in all. On a GPU
  // that cannot keep up, the budget is cut (never raised again, so it cannot see-saw).
  let budget = 2.1e6, slow = 0, frameMs = 16.7;
  const resize = () => {
    let dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    const area = canvas.clientWidth * canvas.clientHeight;
    if (area * dpr * dpr > budget) dpr = Math.sqrt(budget / Math.max(area, 1));
    const cw = Math.max(1, Math.round(canvas.clientWidth * dpr)), ch = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (cw === w && ch === h) return;
    w = canvas.width = cw;
    h = canvas.height = ch;
    if (!fbOk) return;
    for (const t of targets.splice(0)) {
      gl.deleteTexture(t.tex);
      gl.deleteFramebuffer(t.fb);
    }
    targets.push(target(w, h), target(Math.ceil(w / 4), Math.ceil(h / 4)), target(Math.ceil(w / 16), Math.ceil(h / 16)));
    gl.bindFramebuffer(gl.FRAMEBUFFER, targets[0].fb);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) fbOk = false;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };

  const view = new Float32Array(9);
  const deg = Math.PI / 180;
  let phase = 0, last = -1;

  function draw(U: number, t: number) {
    resize();
    const dt = last < 0 ? 0 : Math.min(0.1, Math.max(0, t - last));
    last = t;
    if (dt > 0) {
      frameMs += (dt * 1000 - frameMs) * 0.05;
      slow = frameMs > 19.5 ? slow + 1 : 0;
      if (slow > 45 && budget > 0.8e6) {
        budget *= 0.75;
        slow = 0;
        frameMs = 16.7;
      }
    }

    // Where the camera is: on a line out from the centre, a little above the disc.
    const r = Math.exp(logR(U));
    const el = elev(U) * deg;
    const Rh = [0, Math.sin(el), Math.cos(el)];
    const Th = [1, 0, 0]; // along the orbit
    const Sh = [0, Math.cos(el), -Math.sin(el)]; // up, off the disc
    const cam = Rh.map((c) => c * r);

    // How it moves: held still (rockets) until it lets go; then falling from rest at HOLD.
    const beta = Math.sqrt(2 / r);
    let wv: number;
    if (U < GO) wv = beta;
    else {
      const E0 = Math.sqrt(1 - 2 / HOLD);
      wv = (beta - E0 * Math.sqrt(Math.max(beta * beta + E0 * E0 - 1, 0))) / (beta * beta + E0 * E0);
    }
    wv = Math.min(wv, 0.9995);
    // Clocks far away, as this camera sees them through light from straight overhead: ten times fast while it holds still at HOLD.
    const gam = 1 / Math.sqrt(1 - wv * wv);
    const rate = 1 / (gam * (1 - wv) * (1 + beta));
    phase += dt * Math.min(rate, 12);

    // Which way it looks: turned (yaw) and tipped (pitch) from facing the hole, then rolled, then tilted.
    const yw = yaw(U) * deg, pt = pitch(U) * deg, ro = roll(U) * deg, ti = tilt(U) * deg;
    const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const mix2 = (a: number[], ka: number, b: number[], kb: number) => a.map((v, i) => v * ka + b[i] * kb);
    const fy = mix2(Rh, -Math.cos(yw), Th, Math.sin(yw));
    const f2 = mix2(fy, Math.cos(pt), Sh, Math.sin(pt));
    const up2 = mix2(fy, -Math.sin(pt), Sh, Math.cos(pt));
    const right2 = cross(f2, up2);
    const up3 = mix2(up2, Math.cos(ro), right2, Math.sin(ro));
    const f4 = mix2(f2, Math.cos(ti), up3, -Math.sin(ti));
    const up4 = mix2(up3, Math.cos(ti), f2, Math.sin(ti));
    // Set aside: on a tall screen it looks a little down, so what is ahead sits higher; on a wide one, a little left.
    const tall = w / h < 0.8;
    const sa = aside(U) * (tall ? 13 : 18) * deg;
    const side = tall ? up4 : cross(f4, up4);
    const f = mix2(f4, Math.cos(sa), side, -Math.sin(sa));
    const nf = mix2(side, Math.cos(sa), f4, Math.sin(sa));
    const up = tall ? nf : up4;
    view.set([...cross(f, up), ...up, ...f]);

    // The camera stops down as what it sees brightens: by most of the blueshift of the sky overhead.
    // On a tall screen the words cover half the frame, and the bright disc under them is stopped down further.
    const sm = (a: number, b: number, x: number) => { const k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
    const words = tall ? 0.8 * sm(0.17, 0.23, U) * (1 - sm(0.39, 0.44, U)) : 0;
    const exposure = Math.pow(2, stops(U) - words) / Math.pow(Math.max(brighter(rate), 1), 0.85);
    const direct = !fbOk;
    gl!.disable(gl!.BLEND);
    gl!.disable(gl!.DEPTH_TEST);
    gl!.bindVertexArray(vao);

    gl!.bindFramebuffer(gl!.FRAMEBUFFER, direct ? null : targets[0].fb);
    gl!.viewport(0, 0, w, h);
    gl!.useProgram(scene.p);
    gl!.uniform2f(scene.u.u_res, w, h);
    gl!.uniform3f(scene.u.u_cam, cam[0], cam[1], cam[2]);
    gl!.uniformMatrix3fv(scene.u.u_view, false, view);
    gl!.uniform1f(scene.u.u_w, wv);
    gl!.uniform1f(scene.u.u_tan, Math.tan(half(U) * deg));
    gl!.uniform1f(scene.u.u_phase, phase);
    gl!.uniform1f(scene.u.u_direct, direct ? 1 : 0);
    gl!.uniform1f(scene.u.u_exp, exposure);
    gl!.uniform3f(scene.u.u_axis, -Rh[0], -Rh[1], -Rh[2]);
    gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
    if (direct) return;

    // The glow: a quarter, then a sixteenth, of the frame.
    gl!.useProgram(down.p);
    for (let k = 1; k <= 2; k++) {
      const src = targets[k - 1], dst = targets[k];
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, dst.fb);
      gl!.viewport(0, 0, dst.w, dst.h);
      gl!.activeTexture(gl!.TEXTURE0);
      gl!.bindTexture(gl!.TEXTURE_2D, src.tex);
      gl!.uniform1i(down.u.u_src, 0);
      gl!.uniform2f(down.u.u_texel, 1 / src.w, 1 / src.h);
      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
    }

    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
    gl!.viewport(0, 0, w, h);
    gl!.useProgram(out.p);
    targets.forEach((tg, k) => {
      gl!.activeTexture(gl!.TEXTURE0 + k);
      gl!.bindTexture(gl!.TEXTURE_2D, tg.tex);
    });
    gl!.uniform1i(out.u.u_a, 0);
    gl!.uniform1i(out.u.u_b, 1);
    gl!.uniform1i(out.u.u_c, 2);
    gl!.uniform2f(out.u.u_res, w, h);
    gl!.uniform2f(out.u.u_tb, 1 / targets[1].w, 1 / targets[1].h);
    gl!.uniform2f(out.u.u_tc, 1 / targets[2].w, 1 / targets[2].h);
    gl!.uniform1f(out.u.u_exp, exposure);
    gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
  }
  return { draw };
}
