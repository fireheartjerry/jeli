/**
 * Fig. 404, moving.
 *
 * The page ships a finished still (pages/404.astro): the first departure,
 * part-way out. This picks it up at that same instant and lets time run. When
 * the body has left the plate the next departure begins: a new orbit, shown
 * closed for a hundred days, then the kick, then the way out.
 *
 * Nothing here knows any physics. Each frame it asks scripts/geo/escape.ts for
 * the state at a time and writes what comes back; the still was written from
 * the same function.
 */
import { whileVisible, reducedMotion, T } from "./motion";
import { chart, frame, marks, BEFORE, type Chart, type Frame } from "./geo/escape";

/** Days of flight to a second of watching. */
const RATE = 44;
/** Days the plate stays on an empty sky after the body has left it. */
const AFTER = 16;

const plate = document.querySelector<SVGSVGElement>("[data-lost]");
if (plate && !reducedMotion()) run(plate);

function run(svg: SVGSVGElement) {
  const fig = svg.closest<HTMLElement>("[data-fig]") ?? svg.parentElement!;
  const part = <E extends Element = SVGElement>(name: string) => svg.querySelector<E>(`[data-${name}]`)!;
  const orbit = part("orbit"), peri = part("peri"), wedge = part("wedge"), asym = part("asym"), ahead = part("ahead"), flown = part("flown");
  const dots = part("marks"), kick = part("kick"), radius = part("radius"), ghost = part("ghost"), shaft = part("shaft"), head = part("head"), esc = part("esc"), body = part("body");
  const named = part("named"), near = part("near");
  const kickLine = kick.querySelector("line")!, kickHead = kick.querySelector("path")!, kickDot = kick.querySelector("circle")!, kickText = kick.querySelector("text")!;
  const out = Object.fromEntries([...fig.querySelectorAll<HTMLElement>("[data-v]")].map((el) => [el.dataset.v!, el]));
  const readout = fig.querySelector<HTMLElement>("[data-readout]");

  // An attribute or a line of text is only written when it has changed.
  const was = new Map<Element, Record<string, string>>();
  const set = (el: Element, name: string, value: string) => {
    let seen = was.get(el);
    if (!seen) was.set(el, (seen = {}));
    if (seen[name] === value) return;
    seen[name] = value;
    if (name === "text") el.textContent = value;
    else el.setAttribute(name, value);
  };
  const n = (v: number) => v.toFixed(1);

  /** The parts of a departure that stay put while it plays. */
  function lay(c: Chart) {
    const o = c.orbit;
    set(orbit, "cx", n(o.cx));
    set(orbit, "cy", n(o.cy));
    set(orbit, "rx", n(o.rx));
    set(orbit, "ry", n(o.ry));
    set(orbit, "transform", `rotate(${n(o.turn)} ${n(o.cx)} ${n(o.cy)})`);
    set(peri, "d", c.peri);
    set(asym, "x1", n(c.asym[0]));
    set(asym, "y1", n(c.asym[1]));
    set(asym, "x2", n(c.asym[2]));
    set(asym, "y2", n(c.asym[3]));
    set(near, "x", n(c.near.x));
    set(near, "y", n(c.near.y));
    set(near, "text-anchor", c.near.anchor);
    set(near, "text", c.near.label);
    set(named, "x", n(c.named.x));
    set(named, "y", n(c.named.y));
    set(ahead, "d", c.path);
    set(flown, "d", c.path);
    set(kickLine, "x1", n(c.kick.x));
    set(kickLine, "y1", n(c.kick.y));
    set(kickLine, "x2", n(c.kick.x2));
    set(kickLine, "y2", n(c.kick.y2));
    set(kickHead, "transform", `translate(${n(c.kick.x2)} ${n(c.kick.y2)}) rotate(${n(c.kick.turn)})`);
    set(kickDot, "cx", n(c.kick.x));
    set(kickDot, "cy", n(c.kick.y));
    set(kickText, "x", n(c.kick.lx));
    set(kickText, "y", n(c.kick.ly));
    set(kickText, "text-anchor", c.kick.anchor);
    set(kickText, "text", c.kick.label);
  }

  /** One instant. */
  function draw(c: Chart, f: Frame) {
    svg.toggleAttribute("data-free", f.free);
    set(body, "cx", n(f.x));
    set(body, "cy", n(f.y));
    set(ghost, "cx", n(f.gx));
    set(ghost, "cy", n(f.gy));
    // Before the kick the body is where it should be, and one mark is enough.
    set(ghost, "opacity", f.free ? "1" : "0");
    set(radius, "x2", n(f.x));
    set(radius, "y2", n(f.y));
    set(shaft, "x1", n(f.x));
    set(shaft, "y1", n(f.y));
    set(shaft, "x2", n(f.tx));
    set(shaft, "y2", n(f.ty));
    set(head, "transform", `translate(${n(f.tx)} ${n(f.ty)}) rotate(${n(f.heading)})`);
    set(esc, "transform", `translate(${n(f.ex)} ${n(f.ey)}) rotate(${n(f.heading)})`);
    set(flown, "stroke-dasharray", `${n(f.flown)} 4000`);
    // (A round cap paints a dot even on a stroke of no length.)
    set(flown, "opacity", f.flown > 0.4 ? "1" : "0");
    set(wedge, "d", f.wedge);
    set(peri, "opacity", f.past ? "1" : "0");
    set(near, "opacity", f.past ? "1" : "0");
    if (was.get(dots)?.count !== String(f.marks)) {
      was.set(dots, { count: String(f.marks) });
      dots.setAttribute("d", marks(c, f.marks));
    }
    set(out.e, "text", f.e);
    set(out.over, "text", f.over);
    set(out.r, "text", f.r);
    set(out.vinf, "text", f.vinf);
    if (readout) set(readout, "text", `departure ${c.i + 1} · day ${f.day} · ${f.kepler}`);
  }

  // Taken up where the still left it.
  let c = chart(0);
  let t = Number(svg.dataset.still) || 0;
  let gone = 0; // seconds since the plate began to clear; 0 while a departure is playing
  fig.toggleAttribute("data-running", true);

  whileVisible(fig, (dt) => {
    if (gone > 0) {
      // The old departure fades, the next is laid in its place, and that fades in.
      gone += dt;
      if (gone < T.state + 0.05) return;
      gone = 0;
      c = chart(c.i + 1);
      t = -BEFORE;
      lay(c);
      draw(c, frame(c, t));
      svg.removeAttribute("data-swap");
      return;
    }
    t += dt * RATE;
    draw(c, frame(c, t));
    if (t > c.tExit + AFTER) {
      svg.toggleAttribute("data-swap", true);
      gone = dt;
    }
  });
}
