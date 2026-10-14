/**
 * Hairlines that answer the pointer.
 *
 * An inline link's underline (.ln) and a drawn hairline ([data-wire]) are each
 * placed by one number, --u (styles/global.css): 0 at rest, 1 under the pointer.
 * Left to the stylesheet that number goes 0, 1, 0, so a line that drew in from
 * the left leaves the way it came. Here it only ever goes up: 0, 1, 2, 3.
 * Every odd number looks like 1 and every even one like 0, so the line that
 * came in from the left always goes out to the right, and one that is caught
 * half-way keeps going instead of jumping back. The stylesheet still does the
 * moving (it transitions --u); this only says where to.
 *
 * Without this module, or under reduced motion, the stylesheet's own two
 * states are all there is, and they are enough.
 */
import { reducedMotion } from "./motion";

const HOSTS = ".ln, [data-wire]";

type State = { u: number; over: boolean; focus: boolean };
const states = new WeakMap<HTMLElement, State>();
let under: HTMLElement | null = null; // the host the pointer is on

const host = (t: EventTarget | null) => (t instanceof Element ? t.closest<HTMLElement>(HOSTS) : null);

function mark(el: HTMLElement, key: "over" | "focus", on: boolean) {
  let s = states.get(el);
  if (!s) states.set(el, (s = { u: 0, over: false, focus: false }));
  const was = s.over || s.focus;
  s[key] = on;
  if ((s.over || s.focus) === was) return;
  el.style.setProperty("--u", String(++s.u));
}

function leave() {
  if (under) mark(under, "over", false);
  under = null;
}

// Every odd-or-even trick above needs mod() in the stylesheet; without it the two plain states stand.
if (!reducedMotion() && CSS.supports("width", "calc(mod(3, 2) * 1px)")) {
  document.addEventListener("pointerover", (e) => {
    if (e.pointerType === "touch") return;
    const el = host(e.target);
    if (el === under) return;
    // (Also covers a pointerout that never came: a link scrolled out from under a still pointer.)
    leave();
    if (el) mark((under = el), "over", true);
  });
  document.addEventListener("pointerout", (e) => {
    if (under && !under.contains(e.relatedTarget as Node | null)) leave();
  });
  document.addEventListener("focusin", (e) => {
    const el = host(e.target);
    if (el?.matches(":focus-visible")) mark(el, "focus", true);
  });
  document.addEventListener("focusout", (e) => {
    const el = host(e.target);
    if (el) mark(el, "focus", false);
  });
}
