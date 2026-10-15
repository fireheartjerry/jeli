/**
 * How the page's own parts arrive.
 *
 * One vocabulary, the cover's: type rises from behind its own line, hairlines
 * are drawn from the left by a pen, and a plate is plotted before the figure
 * on it is drawn. Type arrives once and stays (nobody wants a paragraph taken
 * away because they scrolled up); plates and the title's hand-off to the bar
 * follow the scroll both ways.
 *
 * A block opts in with [data-reveal="<kind>"]. Until this module has taken a
 * block over it is hidden by one CSS rule (html[data-motion]:not([data-revealed])),
 * so nothing flashes on a page that loads part-way down; without JavaScript or
 * under reduced motion that rule never applies and everything is simply there.
 *
 * What is waiting to arrive is only ever made transparent. It keeps its place
 * in the page, in the accessibility tree and in find-in-page, its links can
 * still be reached with the keyboard, and the moment the focus enters a block
 * that is still waiting, the block is simply there.
 */
import { gsap, ScrollTrigger, SplitText, T, trail } from "./motion";
import { speed } from "./scroll";

type Kind = (root: HTMLElement) => void;

/** Where an element is in the window, as fractions of the window's height. */
const where = (el: Element) => {
  const r = el.getBoundingClientRect();
  return { top: r.top / window.innerHeight, bottom: r.bottom / window.innerHeight };
};

/**
 * How hurried the reader is: 1 at a reading scroll, up to 3 when the page is
 * flying past. Arrivals take that much less time, and stagger far less, so a
 * fast scroll is never met by half-empty screens.
 */
const hurry = () => Math.max(1, Math.min(3, Math.abs(speed.now) / (1.2 * window.innerHeight)));

// (A block with nothing of that kind in it is left alone: GSAP warns about an empty target.)
const none = (els: Element | Element[]) => Array.isArray(els) && !els.length;
const hold = (els: Element | Element[]) => none(els) || gsap.set(els, { opacity: 0 });
const show = (els: Element | Element[]) => none(els) || gsap.set(els, { opacity: 1, clearProps: "opacity" });

/**
 * Lines of type rising into place, in reading order across every element
 * given. The split is undone when the last line lands, so the text is left
 * exactly as it was written.
 */
export function rise(els: HTMLElement | HTMLElement[], opts: { delay?: number; each?: number; seconds?: number } = {}) {
  const list = (Array.isArray(els) ? els : [els]).filter(Boolean);
  if (!list.length) return;
  const fast = hurry();
  const { delay = 0, each = 0.05, seconds = T.arrive } = opts;
  show(list);
  // Each element given must hold running text and nothing else: a block inside
  // it would be cut into "lines" too, and its layout would change while it
  // moved. A link standing on its own is an inline box, which cannot hold the
  // slot its line rises through; for the length of the move it is a block of
  // its own, which on one line looks no different.
  const inline = list.filter((el) => getComputedStyle(el).display === "inline");
  inline.forEach((el) => {
    // (An inline box's padding above and below takes no room in its line; a block's
    // does. It is taken back out, so nothing under the link moves.)
    const cs = getComputedStyle(el);
    el.style.margin = `-${cs.paddingTop} 0 -${cs.paddingBottom}`;
    el.style.display = "inline-block";
  });
  SplitText.create(list, {
    type: "lines",
    mask: "lines",
    linesClass: "rise",
    aria: "none",
    autoSplit: true,
    onSplit(split) {
      const n = split.lines.length;
      return gsap.fromTo(
        split.lines,
        { yPercent: 112 },
        {
          yPercent: 0,
          duration: seconds / fast,
          ease: "arrive",
          delay: delay / fast,
          // A long block takes no longer to arrive than a short one takes to read its first line.
          stagger: { amount: Math.min(0.55, n * each) / (fast * fast) },
          onComplete() {
            split.revert();
            split.kill();
            inline.forEach((el) => (el.style.display = el.style.margin = ""));
          },
        },
      );
    },
  });
}

/** Where the browser has set each character of an element, before anything is done to it. */
function glyphs(el: HTMLElement) {
  const out: { x: number; y: number }[] = [];
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walk.nextNode(); node; node = walk.nextNode()) {
    const text = node.textContent ?? "";
    for (let i = 0; i < text.length; i++) {
      if (/\s/.test(text[i])) continue;
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const r = range.getBoundingClientRect();
      out.push({ x: r.left, y: r.top });
    }
  }
  return out;
}

export interface Letters {
  /** Raise the letters. Returns the tween. */
  (delay?: number, each?: number): gsap.core.Tween;
  /** How long after the first letter the last one sets off, seconds. */
  span: number;
  /** Put the heading as it was written, at once. */
  skip(): void;
}

/**
 * Characters rising inside their word, the way the name does on the cover:
 * line after line, letter after letter.
 *
 * Letters set one by one lose the kerning between them, so each is first put
 * back exactly where the browser had set it, and when the last has landed the
 * split is undone: the heading ends as the very text it started as, with not
 * a pixel moved. `keep` leaves it split instead, for a caller that goes on
 * moving the letters (the footer's address) and looks after their spacing itself.
 */
export function letters(el: HTMLElement, opts: { keep?: boolean } = {}): Letters {
  const before = opts.keep ? null : glyphs(el);
  const split = SplitText.create(el, { type: "words,chars", mask: "words", wordsClass: "rise-w", charsClass: "rise-c", aria: "auto" });
  const chars = split.chars as HTMLElement[];
  const boxes = chars.map((c) => c.getBoundingClientRect());
  // Only if the letters still fall on the lines they were written on. (Their boxes are
  // not the height of the glyphs in them, so it is the breaks that are compared, not the tops.)
  const breaks = (tops: number[]) => tops.map((t, i) => (i && t - tops[i - 1] > 8 ? 1 : 0)).join("");
  if (before && before.length === chars.length && breaks(before.map((g) => g.y)) === breaks(boxes.map((r) => r.top))) {
    // A word's slot is moved to where the word was, and each letter within its word.
    const slots = split.masks as HTMLElement[];
    (split.words as HTMLElement[]).forEach((word, w) => {
      const first = chars.indexOf(word.querySelector<HTMLElement>(".rise-c")!);
      if (first < 0) return;
      const moved = before[first].x - boxes[first].left;
      gsap.set(slots[w] ?? word, { x: moved });
      for (let i = first; i < chars.length && word.contains(chars[i]); i++) gsap.set(chars[i], { x: before[i].x - boxes[i].left - moved });
    });
  }
  // Each line sets off a little after the one above, so a second line never lands before the first.
  const tops = [...new Set(boxes.map((b) => Math.round(b.top)))].sort((a, b) => a - b);
  const line = boxes.map((b) => tops.indexOf(Math.round(b.top)));
  const place = chars.map((_, i) => chars.slice(0, i).filter((__, k) => line[k] === line[i]).length);
  gsap.set(chars, { yPercent: 130 });
  const undo = () => {
    if (!opts.keep) split.revert();
  };
  const play = ((delay = 0, each = T.step) => {
    const fast = hurry();
    return gsap.to(chars, { yPercent: 0, duration: T.arrive / fast, ease: "arrive", delay: delay / fast, stagger: (i: number) => (line[i] * 0.14 + place[i] * each) / fast, onComplete: undo });
  }) as Letters;
  play.span = Math.max(0, ...chars.map((_, i) => line[i] * 0.14 + place[i] * T.step));
  play.skip = () => {
    gsap.set(chars, { yPercent: 0 });
    undo();
  };
  return play;
}

/**
 * Run `play` the first time `trigger` crosses `line` (a fraction of the
 * window's height). What is already above the window when the page opens is
 * simply there (`late`), and so is anything the keyboard reaches before the
 * scroll does, or that a jump lands well past.
 */
function once(trigger: Element, line: number, play: (late: boolean) => void) {
  const at = where(trigger);
  if (at.bottom < 0) return play(true);
  let done = false;
  let st: ScrollTrigger | undefined;
  const go = (late: boolean) => {
    if (done) return;
    done = true;
    st?.kill();
    trigger.removeEventListener("focusin", focused);
    play(late);
  };
  const focused = () => go(true);
  trigger.addEventListener("focusin", focused);
  if (at.top < line) return go(false);
  st = ScrollTrigger.create({ trigger, start: `top ${Math.round(line * 100)}%`, once: true, onEnter: () => go(where(trigger).top < 0.3) });
}

/** Every word of an element's running text in a span of its own. A link is left whole: it is one word here. */
function words(el: HTMLElement) {
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement?.closest("a") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  const nodes: Text[] = [];
  for (let n = walk.nextNode(); n; n = walk.nextNode()) nodes.push(n as Text);
  for (const node of nodes) {
    const parts = document.createDocumentFragment();
    for (const piece of (node.textContent ?? "").split(/(\s+)/)) {
      if (!piece) continue;
      if (/^\s+$/.test(piece)) parts.append(piece);
      else parts.append(Object.assign(document.createElement("span"), { className: "w", textContent: piece }));
    }
    node.replaceWith(parts);
  }
  return [...el.querySelectorAll<HTMLElement>(".w, a")];
}

const kinds: Record<string, Kind> = {
  /**
   * A section's heading: the title by the letter, then its line of description.
   * On its way out under the bar the title sinks back behind its own line, as
   * the bar takes up its name (Header.astro changes the breadcrumb on the same
   * stretch of scroll): the title is handed to the bar, and handed back.
   */
  title(root) {
    const h = root.matches("h1, h2") ? root : root.querySelector<HTMLElement>("h1, h2");
    const rest = [...root.querySelectorAll<HTMLElement>(":scope > p")];
    // A title carried here from the page before (scripts/transit.ts) is already in place: it is not raised again.
    const carried = !!h?.matches("main > .head h1") && document.documentElement.hasAttribute("data-arrived");
    const play = h && !carried ? letters(h) : null;
    hold(rest);
    once(root, 0.88, (late) => {
      if (late) {
        play?.skip();
        show(rest);
        return;
      }
      play?.();
      // The follow sets off when the lead is most of the way in, never before it.
      rise(rest, { delay: play ? 0.16 + 0.6 * play.span : 0.1 });
    });
    if (h?.matches("h2")) {
      gsap.fromTo(
        h,
        { yPercent: 0, clipPath: "inset(-30% -10% 0% -10%)" },
        { yPercent: 100, clipPath: "inset(-30% -10% 100% -10%)", ease: "none", immediateRender: false, scrollTrigger: { trigger: h, start: "top 132px", end: "top 44px", scrub: true } },
      );
    }
  },

  /**
   * An entry: a pen rules the line above it, and its title, the line under
   * that, the paragraphs and the tags follow as one run of lines.
   */
  entry(root) {
    const rule = root.querySelector<HTMLElement>(":scope > .rule");
    const pen = root.querySelector<HTMLElement>(":scope > .rule-pen");
    // (The line under the title is a row of two; each half is taken on its own so the gap between them stays.)
    const parts = [...root.querySelectorAll<HTMLElement>(":scope > .text h3, :scope > .text .meta > span, :scope > .text .body > p, :scope > .text .body li > *, :scope > .text .tags")].filter(
      (el) => !el.matches("h3[data-landed]"), // the paper's title, carried here from its own page: already in place
    );
    hold(parts);
    if (rule) gsap.set(rule, { scaleX: 0 });
    once(root, 0.86, (late) => {
      if (late) {
        show(parts);
        if (rule) gsap.set(rule, { scaleX: 1 });
        return;
      }
      const seconds = T.arrive / hurry();
      if (rule) gsap.to(rule, { scaleX: 1, duration: seconds, ease: "arrive" });
      if (pen) gsap.timeline().fromTo(pen, { "--k": 0, opacity: 1 }, { "--k": 1, duration: seconds, ease: "arrive" }).to(pen, { opacity: 0, duration: seconds * 0.3 }, seconds * 0.7);
      rise(parts, { delay: 0.08 });
    });
  },

  /** A block of type on its own (a caption, a kicker): its lines rise as it comes up. */
  lines(root) {
    hold(root);
    once(root, 0.92, (late) => (late ? show(root) : rise(root)));
  },

  /** Running prose (the paper): each heading and paragraph on its own, as it comes up. */
  prose(root) {
    // What is in the window when the page opens waits its turn behind the
    // title, top to bottom; the rest comes up as the scroll brings it.
    let waiting = 0;
    for (const el of root.querySelectorAll<HTMLElement>(":scope > *")) {
      hold(el);
      const at = where(el);
      const delay = at.bottom > 0 && at.top < 0.9 ? Math.min(0.9, 0.34 + waiting++ * 0.08) : 0;
      once(el, 0.9, (late) => {
        if (late) show(el);
        // A block of code is not type to be set line by line; it comes up whole, from behind its own foot.
        else if (el.matches("pre, .tools")) gsap.fromTo(el, { opacity: 1, yPercent: 100, clipPath: "inset(0% 0% 100% 0%)" }, { yPercent: 0, clipPath: "inset(0% 0% -5% 0%)", duration: T.arrive / hurry(), ease: "arrive", delay, clearProps: "all" });
        else rise(el, { delay });
      });
    }
  },

  /** A list of rows: each row's type rises and its rule draws under it, one after the next. */
  rows(root) {
    const rows = [...root.querySelectorAll<HTMLElement>(":scope > *")];
    const cells = rows.flatMap((row) => [...row.children]);
    gsap.set(rows, { "--rule": 0 });
    hold(cells);
    once(root, 0.86, (late) => {
      if (late) {
        show(cells);
        gsap.set(rows, { "--rule": 1 });
        return;
      }
      const fast = hurry();
      rows.forEach((row, i) => {
        const at = i * 0.07;
        // (A row is a little grid of its own; its cells are what hold the type.)
        rise([...row.children] as HTMLElement[], { delay: at, each: 0.04 });
        gsap.to(row, { "--rule": 1, duration: T.arrive / fast, ease: "arrive", delay: (at + 0.05) / fast });
      });
    });
  },

  /** A strip with a rule along its top (the footer's last line): the rule is drawn, and what stands on it rises. */
  ruled(root) {
    const items = [...root.children] as HTMLElement[];
    gsap.set(root, { "--rule": 0 });
    hold(items);
    once(root, 0.97, (late) => {
      if (late) {
        show(items);
        gsap.set(root, { "--rule": 1 });
        return;
      }
      gsap.to(root, { "--rule": 1, duration: T.arrive, ease: "arrive" });
      items.forEach((el, i) => gsap.fromTo(el, { opacity: 1, yPercent: 110, clipPath: "inset(0% 0% 110% 0%)" }, { yPercent: 0, clipPath: "inset(0% 0% -20% 0%)", duration: T.arrive, ease: "arrive", delay: 0.12 + i * 0.06, clearProps: "all" }));
    });
  },

  /**
   * Type that is read into: each word comes up to full ink as it crosses the
   * lower part of the window, and goes back down if the page goes back.
   */
  read(root) {
    gsap.fromTo(
      words(root),
      { opacity: 0.2 },
      { opacity: 1, ease: "none", stagger: 0.1, scrollTrigger: { trigger: root, start: "top 84%", end: "top 24%", scrub: trail(0.5) } },
    );
  },

  /**
   * A title card over open sky (Passage.astro), played like one in a film: it
   * comes up out of focus as its stretch of sky reaches the middle of the
   * window, holds there, and drifts on and out as the stretch goes, all on the
   * scroll. The line's words come in a little after the place, one by one.
   */
  passage(root) {
    const place = root.querySelector<HTMLElement>(".place");
    const line = root.querySelector<HTMLElement>(".line");
    const rest = root.querySelectorAll<HTMLElement>(".toggle, .log");
    if (!place || !line) return;
    const said = words(line);
    const tl = gsap.timeline({
      defaults: { ease: "none" },
      scrollTrigger: { trigger: root.parentElement!, start: "top 70%", end: "bottom 30%", scrub: trail(0.8) },
    });
    tl.fromTo(place, { opacity: 0, y: 26, filter: "blur(6px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.24, ease: "arrive" }, 0)
      .fromTo(said, { opacity: 0, y: 18, filter: "blur(8px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.2, stagger: 0.012, ease: "arrive" }, 0.04)
      .fromTo(rest, { opacity: 0 }, { opacity: 1, duration: 0.14 }, 0.22)
      .to([place, said, ...rest], { opacity: 0, y: -22, filter: "blur(6px)", duration: 0.22, stagger: 0.004, ease: "swap" }, 0.78);
  },

  /**
   * A figure's plate surfaces out of the dark as it is scrolled to: it rises,
   * comes into focus and out of the sky, all following the scroll, so it is
   * never cut in or outlined; the figure on it then draws by the same hand.
   */
  plate(root) {
    const sheet = root.querySelector<HTMLElement>(":scope > .sheet");
    if (!sheet) return;
    const tween = gsap.fromTo(
      root,
      { opacity: 0, y: 56, scale: 0.97, filter: "blur(10px)" },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        filter: "blur(0px)",
        ease: "arrive",
        scrollTrigger: { trigger: root, start: "top 100%", end: "top 62%", scrub: trail(0.6) },
        onComplete: () => gsap.set(root, { clearProps: "filter" }),
      },
    );
    // The keyboard may reach a control on a plate the scroll has not yet brought up: it is then brought up at once.
    root.addEventListener("focusin", () => {
      if (tween.progress() < 0.999) tween.progress(1);
    });
  },
};

export function reveals() {
  const root = document.documentElement;
  // Late (the page's own fallback has already shown everything): leave it shown.
  if (root.hasAttribute("data-revealed")) return;
  // In page order, so their triggers are measured in the order they are met.
  for (const el of document.querySelectorAll<HTMLElement>("[data-reveal]")) kinds[el.dataset.reveal!]?.(el);
  root.dataset.revealed = "";
}
