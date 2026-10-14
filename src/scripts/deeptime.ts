/**
 * Deep time (Sequence.astro): the rest of the universe's life, as the page is
 * scrolled through it. Galaxies as they are now; the last stars going out; the
 * cinders they leave; black holes, the last things, evaporating through
 * Hawking radiation; the heat death after them; the quantum vacuum underneath
 * everything; and a false vacuum, the one thing that could end it sooner.
 *
 * One full-screen pass. `U` is how far through the sequence the scroll has got.
 */
import { compile, NOISE } from "./supernova";

const FS = `#version 300 es
precision highp float;
${NOISE}
out vec4 o;
uniform vec2 u_res;
uniform float u_u;
uniform float u_t;

float ss(float a, float b) { return smoothstep(a, b, u_u); }
float win(float a, float b, float c, float d) { return smoothstep(a, b, u_u) * (1.0 - smoothstep(c, d, u_u)); }
vec3 tone(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }

// ---- now, and the last stars: a deep field of galaxies, going out ----
vec3 galaxies(vec2 p, float life, float red) {
  vec3 col = vec3(0.0);
  for (int l = 0; l < 2; l++) {
    float sc = l == 0 ? 2.6 : 6.5;
    vec2 g = p * sc + vec2(u_t * 0.004, 0.0) * float(l + 1);
    vec2 cell = floor(g);
    for (int dx = -1; dx <= 1; dx++)
      for (int dy = -1; dy <= 1; dy++) {
        vec2 c = cell + vec2(float(dx), float(dy));
        if (hash2(c + 0.5) > (l == 0 ? 0.55 : 0.75)) continue;
        vec2 at = c + vec2(hash2(c + 1.1), hash2(c + 2.3)) * 0.8 + 0.1;
        vec2 d = g - at;
        float ang = hash2(c + 3.7) * 6.283, tilt = 0.25 + 0.75 * hash2(c + 4.9);
        d = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * d;
        d.y /= tilt;
        float size = (l == 0 ? 0.16 : 0.08) * (0.5 + hash2(c + 6.1));
        float r = length(d) / size, th = atan(d.y, d.x);
        float spiral = step(0.45, hash2(c + 8.3));
        float arms = pow(0.5 + 0.5 * cos(2.0 * (th - 2.2 * log(max(r, 0.05)))), 2.5);
        float body = exp(-r * 2.4) * mix(1.0, 0.35 + 1.3 * arms * smoothstep(0.08, 0.4, r), spiral) + exp(-r * 12.0) * 1.2;
        // Young blue stars in the arms go first; old red ones last the longest.
        vec3 tint = spiral > 0.5 ? mix(vec3(1.0, 0.84, 0.66), vec3(0.62, 0.76, 1.0), smoothstep(0.1, 0.7, r)) : vec3(1.0, 0.8, 0.58);
        tint = mix(tint, vec3(1.0, 0.36, 0.16), red);
        col += tint * body * (l == 0 ? 0.55 : 0.32) * life;
      }
  }
  return col;
}

vec3 cinders(vec2 p, float cool) {
  // White dwarfs cooling: each a point, from white to dull red to nothing.
  vec3 col = vec3(0.0);
  vec2 g = p * 22.0, cell = floor(g);
  for (int dx = -1; dx <= 1; dx++)
    for (int dy = -1; dy <= 1; dy++) {
      vec2 c = cell + vec2(float(dx), float(dy));
      if (hash2(c) > 0.35) continue;
      vec2 at = c + vec2(hash2(c + 1.0), hash2(c + 2.0));
      float t = clamp(cool * (0.6 + 0.8 * hash2(c + 3.0)), 0.0, 1.0);
      vec3 hue = mix(vec3(0.85, 0.9, 1.0), mix(vec3(1.0, 0.5, 0.25), vec3(0.4, 0.06, 0.02), smoothstep(0.5, 0.9, t)), smoothstep(0.1, 0.55, t));
      col += hue * exp(-length(g - at) * 9.0) * (1.0 - smoothstep(0.75, 1.0, t)) * 0.9;
    }
  return col;
}

// ---- a black hole evaporating: Hawking radiation ----
vec3 evaporate(vec2 p, float k) {
  // It shrinks ever faster as it goes, and ends in a flash.
  float R = 0.32 * pow(max(1.0 - k, 0.0), 1.0 / 3.0);
  float r = length(p), ang = atan(p.y, p.x);
  vec3 col = vec3(0.0);
  if (R > 0.003) {
    float shadow = smoothstep(R * 0.98, R * 1.03, r);
    col += vec3(0.75, 0.55, 0.4) * exp(-pow((r - R * 1.04) / (R * 0.03 + 0.002), 2.0)) * 0.5;
    // Pairs made just outside the horizon: one falls in, one gets away. The ones that get away are the glow.
    for (int i = 0; i < 2; i++) {
      float lane = floor(ang * 24.0 + float(i) * 0.5);
      float ph = fract(u_t * 0.35 + hash2(vec2(lane, float(i))));
      float out_ = R * (1.06 + ph * 1.6), in_ = R * (1.06 - ph * 0.1);
      float pOut = exp(-pow((r - out_) / 0.006, 2.0)) * exp(-pow(fract(ang * 24.0 / 6.2831853 + float(i) * 0.5) - 0.5, 2.0) / 0.002);
      float pIn = exp(-pow((r - in_) / 0.005, 2.0)) * exp(-pow(fract(ang * 24.0 / 6.2831853 + float(i) * 0.5) - 0.5, 2.0) / 0.002) * (1.0 - ph);
      col += vec3(1.0, 0.86, 0.66) * pOut * (1.0 - ph) * 0.9 + vec3(0.6, 0.7, 1.0) * pIn * 0.6;
    }
    // Smaller holes are hotter: the glow goes from red to white as it shrinks.
    vec3 heat = mix(vec3(0.9, 0.3, 0.1), vec3(0.85, 0.9, 1.0), smoothstep(0.6, 0.98, k));
    col += heat * exp(-max(r - R, 0.0) / (R * 0.5 + 0.004)) * (0.08 + 1.2 * pow(k, 6.0)) * shadow;
    col *= shadow; // nothing comes out of the shadow itself
  }
  // The end: everything that is left of it, at once.
  float flash = smoothstep(0.94, 1.0, k) * exp(-max(u_u - 0.6, 0.0) * 120.0);
  col += vec3(1.0, 0.97, 0.92) * flash * (exp(-r * 7.0) * 2.4 + exp(-r * 1.5) * 0.25);
  return col;
}

// ---- heat death: nothing left to happen ----
vec3 dark(vec2 p) {
  // A few last photons, stretched to the longest wavelengths by the expansion, drifting apart.
  vec3 col = vec3(0.0);
  vec2 g = p * 9.0 + vec2(u_t * 0.02, u_t * 0.013), cell = floor(g);
  vec2 at = cell + vec2(hash2(cell), hash2(cell + 1.0));
  col += vec3(0.5, 0.12, 0.06) * exp(-length(g - at) * 14.0) * step(0.86, hash2(cell + 5.0)) * 0.6;
  return col;
}

// ---- the quantum vacuum: never quite empty ----
vec3 foam(vec2 p, float zoom) {
  vec3 col = vec3(0.0);
  vec2 g = p * mix(4.0, 9.0, zoom);
  // Fields at their lowest, still shaking: a fine, restless texture to all of space.
  float f = fbm3(vec3(g * 1.3, u_t * 0.9), 5);
  float cells = 1.0 - abs(2.0 * noise3(vec3(g * 2.6, u_t * 1.4)) - 1.0);
  col += vec3(0.25, 0.3, 0.55) * pow(cells, 10.0) * 0.22 * (0.5 + 0.5 * f) + vec3(0.1, 0.09, 0.2) * f * f * 0.3;
  // Virtual pairs: a particle and its antiparticle appear from nothing, part, meet again and are gone.
  vec2 cell = floor(g * 1.5);
  for (int dx = -1; dx <= 1; dx++)
    for (int dy = -1; dy <= 1; dy++) {
      vec2 c = cell + vec2(float(dx), float(dy));
      float period = 1.4 + 2.0 * hash2(c + 4.0);
      float ph = fract(u_t / period + hash2(c + 9.0));
      if (ph > 0.42) continue;
      float life = ph / 0.42;
      vec2 at = (c + vec2(hash2(c + 1.0), hash2(c + 2.0))) / 1.5;
      float ang = hash2(c + 3.0) * 6.283;
      vec2 sep = vec2(cos(ang), sin(ang)) * 0.09 * sin(life * 3.14159);
      float a = exp(-pow(length(g - at - sep) / 0.014, 2.0)), b = exp(-pow(length(g - at + sep) / 0.014, 2.0));
      float meet = exp(-pow((life - 1.0) / 0.05, 2.0)) * exp(-pow(length(g - at) / 0.03, 2.0));
      col += vec3(1.0, 0.6, 0.35) * a + vec3(0.4, 0.65, 1.0) * b + vec3(1.0) * meet * 0.8;
    }
  return col;
}

// ---- a false vacuum ----
vec3 bubble(vec2 p) {
  float k = ss(0.9, 1.0);
  vec2 c = vec2(0.18, -0.08);
  float Rb = 0.02 + 2.3 * k * k;
  float r = length(p - c);
  // The wall bends what is seen through it; inside, the fields settle into a different, lower state.
  vec2 dir = (p - c) / max(r, 1e-4);
  float wall = exp(-abs(r - Rb) / 0.008) + exp(-abs(r - Rb) / 0.06) * 0.3;
  vec2 bent = p + dir * 0.04 * exp(-pow((r - Rb) / 0.05, 2.0));
  vec3 outside = foam(bent, 1.0);
  vec3 inside = vec3(0.02, 0.015, 0.035) + vec3(0.25, 0.15, 0.45) * pow(fbm3(vec3((p - c) * 2.0, u_t * 0.2), 4), 3.0) * 0.4;
  vec3 col = mix(inside, outside, smoothstep(Rb - 0.01, Rb + 0.01, r));
  col += vec3(0.85, 0.75, 1.0) * wall * smoothstep(0.0, 0.05, k);
  return col;
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / (0.5 * u_res.y);
  vec3 col = vec3(0.0);
  // Now and the last stars: the same field, its light going out and reddening.
  float a = win(-1.0, 0.0, 0.28, 0.33);
  if (a > 0.001) {
    float life = 1.0 - 0.92 * ss(0.12, 0.3);
    float red = ss(0.1, 0.28);
    vec2 drift = p * (1.0 + 0.25 * ss(0.0, 0.3));
    col += galaxies(drift, life, red) * a;
  }
  float b = win(0.24, 0.3, 0.42, 0.46);
  if (b > 0.001) col += cinders(p, ss(0.28, 0.44)) * b;
  float c = win(0.42, 0.46, 0.6, 0.62);
  if (c > 0.001) col += evaporate(p, ss(0.46, 0.6)) * c;
  float d = win(0.6, 0.62, 0.74, 0.78);
  if (d > 0.001) col += dark(p) * d;
  float e = win(0.74, 0.8, 0.9, 0.93);
  if (e > 0.001) col += foam(p, ss(0.76, 0.9)) * e;
  float f = ss(0.9, 0.93);
  if (f > 0.001) col += bubble(p) * f;
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  o = vec4(tone(col) + (n - 0.5) / 255.0, 1.0);
}`;

const VS = `#version 300 es
in vec2 a_q;
void main() { gl_Position = vec4(a_q, 0.0, 1.0); }`;

export function mountDeepTime(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "high-performance" });
  if (!gl) return null;
  let prog: ReturnType<typeof compile>;
  try {
    prog = compile(gl, VS, FS);
  } catch (e) {
    console.warn("deep time: shader unavailable", e);
    return null;
  }
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog.p, "a_q");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  let w = 0, h = 0;
  function draw(U: number, t: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    const cw = Math.max(1, Math.round(canvas.clientWidth * dpr)), ch = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (cw !== w || ch !== h) (w = canvas.width = cw), (h = canvas.height = ch);
    gl!.viewport(0, 0, w, h);
    gl!.useProgram(prog.p);
    gl!.uniform2f(prog.u.u_res, w, h);
    gl!.uniform1f(prog.u.u_u, U);
    gl!.uniform1f(prog.u.u_t, t);
    gl!.bindVertexArray(vao);
    gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
  }
  return { draw };
}
