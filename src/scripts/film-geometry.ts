/**
 * The two pieces of hardware the lens passes close enough to see in detail.
 * Each triangle carries its own normal so the folds and edges catch separate light.
 */
type V = [number, number, number];

export function filmGeometry() {
  let data: number[] = [];
  function tri(a: V, b: V, c: V, material: number) {
    const [x, y, z] = b.map((v, i) => v - a[i]);
    const [u, v, w] = c.map((p, i) => p - a[i]);
    const normal = [y * w - z * v, z * u - x * w, x * v - y * u];
    const length = Math.hypot(...normal);
    if (!length) return;
    for (const p of [a, b, c]) data.push(...p, ...normal.map((n) => n / length), material);
  }
  function quad(a: V, b: V, c: V, d: V, material: number) {
    tri(a, b, c, material);
    tri(a, c, d, material);
  }
  function spar(a: V, b: V, width: number, material: number) {
    const side: V[] = [[0, width, 0], [0, 0, width], [0, -width, 0], [0, 0, -width]];
    if (Math.abs(b[1] - a[1]) > Math.abs(b[0] - a[0])) {
      side[0] = [width, 0, 0];
      side[2] = [-width, 0, 0];
    }
    const add = (p: V, d: V): V => [p[0] + d[0], p[1] + d[1], p[2] + d[2]];
    side.forEach((d, i) => {
      const next = side[(i + 1) % 4];
      quad(add(a, d), add(b, d), add(b, next), add(a, next), material);
    });
  }
  function block([x, y, z]: V, [sx, sy, sz]: V, material: number) {
    const a: V = [x - sx, y - sy, z - sz], b: V = [x + sx, y - sy, z - sz];
    const c: V = [x + sx, y + sy, z - sz], d: V = [x - sx, y + sy, z - sz];
    const e: V = [a[0], a[1], z + sz], f: V = [b[0], b[1], z + sz];
    const g: V = [c[0], c[1], z + sz], h: V = [d[0], d[1], z + sz];
    quad(a, d, c, b, material); quad(e, f, g, h, material);
    quad(a, e, h, d, material); quad(b, c, g, f, material);
    quad(d, h, g, c, material); quad(a, b, f, e, material);
  }

  // A six-gore blanket, tensioned onto a perimeter truss.
  const hub: V = [0, 0, 0.09];
  const edge: V[] = Array.from({ length: 6 }, (_, i) => {
    const a = i * Math.PI / 3;
    return [Math.cos(a), Math.sin(a), 0];
  });
  edge.forEach((a, i) => {
    const b = edge[(i + 1) % 6];
    const at = (r: number, s: number): V => [
      (a[0] * (1 - s) + b[0] * s) * r,
      (a[1] * (1 - s) + b[1] * s) * r,
      (1 - r) * hub[2] + Math.sin(s * Math.PI * 4) * Math.sin(r * Math.PI) * 0.018,
    ];
    for (let band = 0; band < 8; band++) {
      const r = (band + 1) / 8;
      for (let j = 0; j < 8; j++) {
        const inner = [at(r - 1 / 8, j / 8), at(r - 1 / 8, (j + 1) / 8)];
        quad(inner[0], at(r, j / 8), at(r, (j + 1) / 8), inner[1], 1 + (i % 2) * 0.16);
      }
    }
    spar(a, b, 0.013, 0);
    spar(a, hub, 0.009, 0);
    block(a, [0.025, 0.025, 0.019], 0);
  });
  block(hub, [0.066, 0.066, 0.033], 0);
  block([0, 0, 0.129], [0.025, 0.025, 0.019], 3);
  const collector = new Float32Array(data);
  data = [];

  function sleeve(rear: number, front: number, cy: number, cz: number, r0: number, r1: number, material: number) {
    const ring = (x: number, r: number, i: number): V => {
      const angle = i * Math.PI / 6;
      return [x, cy + Math.cos(angle) * r, cz + Math.sin(angle) * r];
    };
    for (let i = 0; i < 12; i++) {
      quad(ring(rear, r0, i), ring(rear, r0, i + 1), ring(front, r1, i + 1), ring(front, r1, i), material);
    }
  }
  // An uncrewed cargo tug. Radiators, propellant tanks and exposed bracing define its silhouette.
  block([0, 0, 0], [0.33, 0.14, 0.11], 0);
  block([0.36, 0, 0], [0.14, 0.09, 0.074], 1);
  block([-0.21, 0, 0.12], [0.19, 0.092, 0.03], 1);
  for (const side of [-1, 1]) {
    const y = 0.17 * side;
    sleeve(-0.28, -0.19, y, 0.03, 0.04, 0.076, 1);
    sleeve(-0.19, 0.16, y, 0.03, 0.076, 0.076, 1);
    sleeve(0.16, 0.25, y, 0.03, 0.076, 0.04, 1);
    sleeve(-0.46, -0.31, y * 0.76, 0.02, 0.071, 0.037, 0);
    sleeve(-0.46, -0.41, y * 0.76, 0.02, 0.064, 0.03, 3);
    block([0.24, 0.12 * side, 0.095], [0.031, 0.024, 0.028], 3);
    spar([0.24, 0.08 * side, 0], [0.13, 0.43 * side, 0], 0.018, 0);
    spar([-0.23, 0.10 * side, 0], [0.13, 0.43 * side, 0], 0.009, 0);
    block([0.015, 0.46 * side, 0], [0.18, 0.13, 0.013], 2);
    for (let j = 0; j < 6; j++) block([-0.14 + 0.06 * j, 0.46 * side, 0.016], [0.004, 0.126, 0.006], 0);
  }
  return { collector, tug: new Float32Array(data) };
}

export const FILM_HARDWARE_VERTEX = `#version 300 es
precision highp float;
in vec3 a_position;
in vec3 a_normal;
in float a_material;
uniform mat4 u_projection;
uniform vec4 u_pose;
uniform vec3 u_angles;
out vec3 v_normal;
out vec3 v_position;
out vec3 v_local;
flat out float v_material;
vec3 rotate(vec3 p) {
  vec3 c = cos(u_angles), s = sin(u_angles);
  p.yz = mat2(c.x, s.x, -s.x, c.x) * p.yz;
  p.xz = mat2(c.y, -s.y, s.y, c.y) * p.xz;
  p.xy = mat2(c.z, s.z, -s.z, c.z) * p.xy;
  return p;
}
void main() {
  v_local = a_position;
  v_normal = rotate(a_normal);
  v_position = rotate(a_position) * u_pose.w + u_pose.xyz;
  v_material = a_material;
  gl_Position = u_projection * vec4(v_position, 1.0);
}`;

export const FILM_HARDWARE_FRAGMENT = `#version 300 es
precision highp float;
in vec3 v_normal;
in vec3 v_position;
in vec3 v_local;
flat in float v_material;
uniform vec3 u_key;
uniform float u_silhouette;
out vec4 o;
void main() {
  vec3 n = normalize(v_normal) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 view = normalize(-v_position);
  vec3 l = normalize(u_key);
  vec3 h = normalize(l + view);
  float face = max(0.0, dot(n, l));
  float fresnel = pow(1.0 - max(0.0, dot(n, view)), 3.0);
  float brushed = 0.82 + 0.18 * sin(v_local.x * 104.0 + sin(v_local.y * 36.0) * 0.7);
  float foil = step(0.5, v_material) * (1.0 - step(1.5, v_material));
  vec3 material = mix(vec3(0.095, 0.116, 0.15), vec3(0.57, 0.39, 0.19) * brushed, foil);
  if (v_material == 2.0) material = vec3(0.12, 0.19, 0.29) * brushed;
  float specular = pow(max(0.0, dot(n, h)), mix(32.0, 68.0, foil));
  float edge = fresnel * max(0.0, dot(n, l) + 0.27);
  vec3 exposure = material * (0.028 + face * 0.52) + vec3(1.0, 0.78, 0.49) * (specular * 0.82 + edge * 0.31);
  exposure += vec3(0.038, 0.052, 0.071) * (0.4 + fresnel * 0.6);
  exposure *= mix(1.0, 0.32, u_silhouette);
  if (v_material > 2.5) exposure += vec3(0.73, 0.82, 0.9);
  o = vec4(pow(max(exposure, 0.0), vec3(0.85)), 1.0);
}`;
