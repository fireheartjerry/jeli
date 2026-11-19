import assert from "node:assert/strict";
import test from "node:test";
import { COVER_DURATION, FILM_DURATION, filmAt } from "../src/scripts/film.ts";
import { filmGeometry } from "../src/scripts/film-geometry.ts";

test("the film can be sampled and sought at every edit boundary", () => {
  const cuts = [
    [0, "collector"], [6, "reveal"], [COVER_DURATION, "quarry"],
    [17, "saturn"], [27, "voyager"], [35, "home"],
  ];
  for (const [[at, id], next] of cuts.map((cut, i) => [cut, cuts[i + 1]])) {
    assert.equal(filmAt(at).id, id);
    assert.equal(filmAt(at).progress, 0);
    if (next) assert.equal(filmAt(next[0] - 0.001).id, id);
  }
  assert.deepEqual(filmAt(-2), filmAt(0));
  assert.deepEqual(filmAt(NaN), filmAt(0));
  assert.deepEqual(filmAt(999), filmAt(FILM_DURATION));
  assert.equal(filmAt(FILM_DURATION).progress, 1);
});

test("building advances up to a complete shell on both sides of the first cuts", () => {
  let prior = 0.36;
  for (let i = 0; i <= COVER_DURATION * 60; i++) {
    const { build } = filmAt(i / 60);
    assert.ok(build >= prior && build <= 1);
    prior = build;
  }
  assert.equal(prior, 1);
  assert.equal(filmAt(17).build, 1);
});

test("both foreground meshes have valid normals and stable triangle data", () => {
  const meshes = filmGeometry();
  assert.deepEqual(meshes, filmGeometry());
  for (const mesh of Object.values(meshes)) {
    assert.ok(mesh.length > 60 && mesh.length % 21 === 0);
    for (let i = 0; i < mesh.length; i += 7) {
      assert.ok(mesh.subarray(i, i + 7).every(Number.isFinite));
      assert.ok(Math.abs(Math.hypot(...mesh.subarray(i + 3, i + 6)) - 1) < 1e-6);
    }
  }
});
