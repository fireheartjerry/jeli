/**
 * Going from one page to another.
 *
 * The transition itself is a cross-document view transition and is drawn
 * entirely by styles/transitions.css. This module does the two things a
 * stylesheet cannot.
 *
 * On the page being left, it decides whether the paper's title is carried.
 * The title is carried between the heading in the list of research and the
 * head of the paper's own page, and only if both can be seen: an end that is
 * out of the window is no end at all, and the title then goes or comes with
 * its page instead of flying off the screen to find it.
 *
 * On the page being reached, it remembers that the page was reached by a
 * transition once the transition is over. The carried title is on the new page
 * from the first frame, and the page's own arrivals (scripts/reveal.ts) would
 * otherwise take it back and raise it again a moment later. Two marks, read by
 * transitions.css, keep it where it landed:
 *   html[data-arrived]   this page was reached from another page of the site;
 *   h3[data-landed]      the title came down on this heading (the home page).
 *
 * theme.ts imports this, so it runs wherever there is a bar, and before the
 * page's own script has had the reveals take anything over.
 */
const root = document.documentElement;
const calm = window.matchMedia("(prefers-reduced-motion: reduce)");

/** The title's two seats: the heading on the home page, the head of the paper's page. A page has at most one. */
const heading = document.querySelector<HTMLElement>('.entry h3:has(a[href$="verifying-the-second-agent"])');
const head = document.querySelector<HTMLElement>("main > .head h1");
const seat = heading ?? head;
/** The section of the home page the heading is in: a link to it brings the heading into the window. */
const LIST = "#research";
/** Whether the heading was in the window when the home page was last left. Back returns to that very view. */
const KEPT = "title-in-window";
/** Whether the page just left sent the title across. The page reached reads it. */
const SENT = "title-carried";

/** Session storage, where there is any (in private mode there may be none). */
const note = (key: string, value?: string) => {
  try {
    if (value === undefined) return sessionStorage.getItem(key);
    sessionStorage.setItem(key, value);
  } catch {
    // Nothing kept: each side then goes by what it can see for itself.
  }
  return null;
};

const inWindow = (el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < window.innerHeight;
};

// ---------- leaving ----------

interface Swap extends Event {
  viewTransition: unknown;
  activation?: { entry?: { url: string | null } | null; navigationType?: string } | null;
}

/** The page itself, where it is carried apart from its ground (by night: transitions.css). */
const sheets: [HTMLElement | null, string][] = [
  [document.querySelector<HTMLElement>("main"), "page-out"],
  [document.querySelector<HTMLElement>("body > footer"), "foot-out"],
];

addEventListener("pageswap", (event) => {
  const e = event as Swap;
  if (!e.viewTransition) return;
  // The page being left takes a name of its own, so it goes out where it stands and the next comes in where it will stand.
  for (const [el, name] of sheets) if (el && getComputedStyle(el).viewTransitionName !== "none") el.style.viewTransitionName = name;
  if (!seat) return;
  let carried = inWindow(seat);
  if (heading) note(KEPT, carried ? "1" : "");
  else if (carried && e.activation?.entry?.url) {
    // Leaving the paper for the home page: the heading is in the window there
    // if the link goes to its section, or if Back returns to a view that had it.
    const to = new URL(e.activation.entry.url);
    if (to.pathname === "/") carried = e.activation.navigationType === "traverse" ? note(KEPT) !== "" : to.hash === LIST;
  }
  note(SENT, carried ? "1" : "");
  if (!carried) seat.style.viewTransitionName = "none";
});

// A page kept whole for Back and Forward comes back as it was left.
addEventListener("pageshow", () => {
  seat?.style.removeProperty("view-transition-name");
  for (const [el] of sheets) el?.style.removeProperty("view-transition-name");
});

// ---------- arriving ----------

function crossed() {
  // Without the rule there was no transition, and with reduced motion the stylesheet asks for none.
  if (!("CSSViewTransitionRule" in window) || calm.matches) return false;
  // Where the browser says where this document was reached from, believe it: only another page of this site carries a transition.
  const activation = (window as unknown as { navigation?: { activation?: { from: unknown; navigationType: string } | null } }).navigation?.activation;
  if (activation) return !!activation.from && activation.navigationType !== "reload";
  const how = (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.type;
  if (how === "reload") return false;
  if (how === "back_forward") return true;
  try {
    return !!document.referrer && new URL(document.referrer).origin === location.origin;
  } catch {
    return false;
  }
}

if (crossed()) {
  root.dataset.arrived = "";
  // On the home page the title lands on its heading if the page before sent
  // it. (Where that was not noted, it lands if the heading is where the page
  // has opened, or is about to be: a link to the section scrolls after the first frame.)
  const sent = note(SENT);
  if (heading && (sent === null ? inWindow(heading) || location.hash === LIST : sent === "1")) heading.dataset.landed = "";
  keepTime();
}
// A page brought back whole runs no script again, but its transition wants the same care.
addEventListener("pagereveal", (event) => {
  if ((event as Swap).viewTransition) requestAnimationFrame(keepTime);
});

/**
 * The title's clock stops while the page is held up.
 *
 * Its animations run on the page's own thread (transitions.css says why), so
 * when a script takes that thread for a while they are not drawn, though their
 * time runs on, and the title would next be seen part of the way there. Each
 * time a frame comes late, the time lost is given back to them.
 */
function keepTime() {
  const FRAME = 1000 / 60;
  // The carried title's own: the browser's animation of its place, and ours of its size and its trade.
  // (A title that only comes or goes with its page is drawn off the page's thread, and loses no time.)
  const carried = /^(title-|-ua-view-transition-group-anim-)/;
  const mine = () =>
    document.getAnimations().filter((a) => (a.effect as KeyframeEffect | null)?.pseudoElement?.endsWith("(paper-title)") && carried.test((a as CSSAnimation).animationName ?? ""));
  const give = (ms: number) => {
    for (const a of mine()) if (typeof a.startTime === "number") a.startTime += ms;
  };
  if (!mine().length) return;
  // Held up already: the timeline was last read when the last frame was drawn.
  let last = performance.now();
  const drawn = Number(document.timeline.currentTime ?? last);
  if (last - drawn > 3 * FRAME) give(last - drawn - FRAME);
  const tick = (now: number) => {
    if (!mine().length) return;
    if (now - last > 3 * FRAME) give(now - last - FRAME);
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export {};
