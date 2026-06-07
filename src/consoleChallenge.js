// jerry.* — console ecosystem.
// Exposed as window.jerry. Boot once via bootConsole().

/* ───────── styles ───────── */

const FONT = '"Geist Mono", "JetBrains Mono", ui-monospace, Menlo, monospace';

const S = {
  body:    `color:#9a9a9a;font:13px ${FONT};`,
  dim:     `color:#555;font:12px ${FONT};`,
  rule:    `color:#2a2a2a;font:12px ${FONT};`,
  title:   `color:#6ee7b7;font:13px ${FONT};font-weight:700;letter-spacing:0.08em;text-transform:uppercase;`,
  primary: `color:#6ee7b7;font:13px ${FONT};`,
  hint:    `color:#fbbf24;font:13px ${FONT};`,
  ok:      `color:#4ade80;font:13px ${FONT};font-weight:700;`,
  fail:    `color:#ef4444;font:13px ${FONT};font-weight:700;`,
  bar:     `color:#6ee7b7;font:13px ${FONT};`,
  barOff:  `color:#222;font:13px ${FONT};`,
  banner:  `color:#6ee7b7;font:13px ${FONT};line-height:1.1;`,
  cmd:     `color:#ededed;font:13px ${FONT};font-weight:600;`,
};

/* ───────── render helpers ───────── */

const log = (m, s = S.body) => console.log(`%c${m}`, s);
const nl  = () => console.log('');
const rule = (n = 58, ch = '─') => log(ch.repeat(n), S.rule);

function header(text) {
  nl();
  log(`▶ ${text}`, S.title);
  rule();
}

function kv(key, value, keyW = 14) {
  console.log(`%c${key.padEnd(keyW)}%c${value}`, S.dim, S.body);
}

function cmdRow(cmd, desc) {
  console.log(`%c  ${cmd.padEnd(28)}%c${desc}`, S.cmd, S.body);
}

function bar(label, pct, w = 22) {
  const filled = Math.round((pct / 100) * w);
  const empty  = w - filled;
  console.log(
    `%c${label.padEnd(14)}%c${'█'.repeat(filled)}%c${'░'.repeat(empty)}%c ${pct}`,
    S.body, S.bar, S.barOff, S.dim
  );
}

/* ───────── data ───────── */

const SKILLS = [
  ['C++',         95],
  ['Python',      88],
  ['JavaScript',  82],
  ['TypeScript',  78],
  ['React',       75],
  ['SQL',         70],
  ['Java',        72],
  ['Rust',        45],
  ['Assembly',    55],
];

const STACK = {
  'languages':  'C++ · Python · TS/JS · Rust · Java · SQL',
  'frontend':   'React · MUI · Tailwind · vanilla DOM when it matters',
  'backend':    'Node · Flask · FastAPI · Postgres · Redis',
  'systems':    'CMake · raylib · WASM · SIMD intrinsics · perf/VTune',
  'tooling':    'git · vim · vscode · gdb · valgrind · gcc/clang -O3',
  'theory':     'graph algos · DP · number theory · linalg · physics',
};

const FACTS = [
  'wrote first line of C++ at 11.',
  '__builtin_popcountll is a hot friend.',
  'AVX-512 lives rent-free in my head.',
  'a profiler is more honest than peer review.',
];

const FORTUNES = [
  '"premature optimization is the root of all evil." — knuth (the other 3% still matters)',
  'measure twice. branchless once.',
  'a cache miss in the inner loop is a personal insult.',
  'the fastest code is the code you never run.',
];

const ZEN = [
  'profile, do not guess.',
  'data layout > algorithm.',
  'allocate once, reuse forever.',
  'the cache is real. respect it.',
  'branchless beats branchy. usually.',
  'read the assembly.',
];

const NOW = [
  'shipping TopsOJ v2 — judge rewrite, contest UI polish',
  'reading agner fog vol 4 (instruction tables) again',
  'training for a 30k continuous run',
  'writing a deterministic raylib physics engine in C++',
];

const history = [];
const track = (name) => {
  if (history.length > 100) history.shift();
  history.push({ t: new Date().toISOString().slice(11, 19), cmd: name });
};

/* ───────── commands ───────── */

const cmds = {

  help() {
    track('help');
    header('jerry.help — command index');
    log('  CORE', S.dim);
    cmdRow('jerry.about()',     'who I am');
    cmdRow('jerry.contact()',   'how to reach me');
    cmdRow('jerry.now()',       'what I am working on');
    cmdRow('jerry.stack()',     'tech I love');
    cmdRow('jerry.skills()',    'skill bar chart');
    cmdRow('jerry.history()',   'commands you have run');
    cmdRow('jerry.clear()',     'clear console + reprint banner');
    nl();
    log('  PERFORMANCE', S.dim);
    cmdRow('jerry.bench(fn)',   'microbenchmark a function (ops/sec)');
    cmdRow('jerry.bits(n)',     'bin / hex / popcount / clz / ctz');
    cmdRow('jerry.zen()',       'the zen of optimization');
    cmdRow('jerry.fortune',     'random optimization quote (getter)');
    nl();
    log('  FUN', S.dim);
    cmdRow('jerry.matrix()',    '5-second green rain');
    cmdRow('jerry.invert()',    'invert page colors (toggle)');
    nl();
    log('  ARCANE', S.dim);
    cmdRow('+jerry',            'Symbol.toPrimitive → age');
    cmdRow('String(jerry)',     'Symbol.toPrimitive → name');
    cmdRow('[...jerry]',        'Symbol.iterator → facts');
    cmdRow('jerry()',           'apply-trap → quick card');
    rule();
  },

  about() {
    track('about');
    header('jerry li');
    kv('age',       new Date().getFullYear() - 2007);
    kv('location',  'toronto → waterloo, ontario');
    kv('education', 'TOPS @ MGCI → Waterloo CS (incoming)');
    kv('award',     'Schulich Leader Scholarship ($100,000)');
    kv('founder',   'TopsOJ — 47k users / 120+ countries');
    kv('research',  '2× sole-author astrophysics papers');
    kv('weapon',    'C++ — bit hacks, SIMD, branchless, cache-aware');
    kv('outside',   '20k runs · arm wrestling · biohacking sleep');
    rule();
  },

  contact() {
    track('contact');
    header('contact');
    kv('email',    'fireheartjerry@gmail.com');
    kv('github',   'github.com/fireheartjerry');
    kv('linkedin', 'linkedin.com/in/fireheartjerry');
    kv('topsoj',   'topsoj.com');
    rule();
  },

  now() {
    track('now');
    header(`now — ${new Date().toISOString().slice(0, 10)}`);
    for (const item of NOW) log(`  · ${item}`, S.body);
    rule();
  },

  stack() {
    track('stack');
    header('stack');
    for (const [k, v] of Object.entries(STACK)) kv(k, v, 12);
    rule();
  },

  skills() {
    track('skills');
    header('skills (self-assessed, harsh)');
    for (const [name, pct] of SKILLS) bar(name, pct);
    log('  bars are vibes. asm goes up when I read more dragon book.', S.dim);
    rule();
  },

  history() {
    track('history');
    header(`history — ${history.length} commands`);
    if (history.length === 0) {
      log('  empty. try jerry.about().', S.dim);
    } else {
      for (const h of history.slice(-20)) {
        console.log(`%c  ${h.t}  %cjerry.${h.cmd}`, S.dim, S.cmd);
      }
    }
    rule();
  },

  clear() {
    console.clear();
    printBanner();
  },

  bench(fn, iters = 100000) {
    track('bench');
    if (typeof fn !== 'function') {
      log('✗ pass a function.', S.fail);
      return;
    }
    for (let i = 0; i < 1000; i++) fn();
    const start = performance.now();
    for (let i = 0; i < iters; i++) fn();
    const elapsed = performance.now() - start;
    const nsPerOp = (elapsed * 1e6) / iters;
    const opsPerSec = Math.round(iters / (elapsed / 1000));
    header(`bench × ${iters.toLocaleString()}`);
    kv('total',   `${elapsed.toFixed(3)} ms`);
    kv('per op',  `${nsPerOp.toFixed(2)} ns`);
    kv('ops/sec', opsPerSec.toLocaleString());
    rule();
    return { iters, ms: elapsed, ns_per_op: nsPerOp, ops_per_sec: opsPerSec };
  },

  bits(n) {
    track('bits');
    n = Number(n) >>> 0;
    const bin = n.toString(2).padStart(32, '0');
    const grouped = bin.match(/.{4}/g).join(' ');
    const popcnt = bin.split('').filter((c) => c === '1').length;
    const clz = bin.indexOf('1') === -1 ? 32 : bin.indexOf('1');
    const ctzRaw = bin.split('').reverse().indexOf('1');
    const ctz = ctzRaw === -1 ? 32 : ctzRaw;
    header(`bits(${n})`);
    kv('decimal',  n.toLocaleString());
    kv('hex',      '0x' + n.toString(16).toUpperCase().padStart(8, '0'));
    kv('binary',   grouped);
    kv('popcount', popcnt);
    kv('clz',      clz);
    kv('ctz',      ctz);
    kv('is_pow2',  (n > 0 && (n & (n - 1)) === 0) ? 'yes' : 'no');
    rule();
  },

  zen() {
    track('zen');
    header('the zen of optimization');
    ZEN.forEach((line, i) => log(`  ${String(i + 1).padStart(2, '0')}.  ${line}`, S.body));
    rule();
  },

  matrix() {
    track('matrix');
    log('matrix mode: 5 seconds. enjoy.', S.ok);
    const cols = 64;
    const chars = '01アァカサタナハマヤラワ'.split('');
    const start = Date.now();
    const id = setInterval(() => {
      let line = '';
      for (let i = 0; i < cols; i++) line += chars[Math.floor(Math.random() * chars.length)];
      console.log(`%c${line}`, 'color:#22c55e;font-family:monospace;');
      if (Date.now() - start > 5000) {
        clearInterval(id);
        log('// matrix off', S.dim);
      }
    }, 70);
  },

  invert() {
    track('invert');
    const cur = document.documentElement.style.filter;
    const target = 'invert(1) hue-rotate(180deg)';
    document.documentElement.style.filter = cur === target ? '' : target;
    log(cur ? 'invert: off' : 'invert: on', S.ok);
  },
};

/* ───────── banner ───────── */

const BANNER = String.raw`
   ┌──────────────────────────────────────────────────┐
   │                                                  │
   │      ░▀▀█ █▀▀ █▀▀▄ █▀▀▄ █  █     █    ░▀░       │
   │      ░░░█ █▀▀ █▄▄▀ █▄▄▀ ▀▀▀█     █    ▀█▀       │
   │      ░▀▀▀ ▀▀▀ ▀░▀▀ ▀░▀▀ ░░░▀     ▀▀▀  ▀▀▀       │
   │                                                  │
   │                   v0.1.337 · jerry li            │
   │                                                  │
   └──────────────────────────────────────────────────┘
`;

function printBanner() {
  console.log(`%c${BANNER}`, S.banner);
  log('you opened devtools. nice.', S.body);
  console.log(`%ctype %cjerry.help()%c to begin.`, S.body, S.hint, S.body);
  rule();
}

/* ───────── proxy ───────── */

function buildJerry() {
  return new Proxy(cmds, {
    get(t, prop, recv) {
      if (prop === 'fortune') {
        track('fortune');
        return FORTUNES[Math.floor(Math.random() * FORTUNES.length)];
      }
      if (prop === Symbol.toPrimitive) {
        return (hint) => hint === 'number' ? new Date().getFullYear() - 2007 : 'jerry';
      }
      if (prop === Symbol.iterator) {
        return function* () { for (const f of FACTS) yield f; };
      }
      if (prop === Symbol.toStringTag) return 'Jerry';
      return Reflect.get(t, prop, recv);
    },
    apply() {
      cmds.about();
      return undefined;
    },
    ownKeys(t) {
      return [...Reflect.ownKeys(t), 'fortune'];
    },
    getOwnPropertyDescriptor(t, prop) {
      if (prop === 'fortune') {
        return { configurable: true, enumerable: true, value: undefined };
      }
      return Reflect.getOwnPropertyDescriptor(t, prop);
    },
  });
}

/* ───────── boot ───────── */

export function bootConsole() {
  if (typeof window === 'undefined') return;
  if (window.__jerryBooted) return;
  window.__jerryBooted = true;
  window.jerry = buildJerry();
  printBanner();
}
