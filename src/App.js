import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Stack,
  Link,
  IconButton,
  CssBaseline,
} from '@mui/material';
import {
  GitHub,
  LinkedIn,
  Description,
  Launch,
  Language,
  Email,
} from '@mui/icons-material';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { bootConsole } from './consoleChallenge';

const MONO   = '"Geist Mono", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
const SANS   = '"Geist", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const SERIF  = '"Instrument Serif", "Iowan Old Style", "Times New Roman", serif';
// Monochrome by design — the only "accent" is brightness (near-white) against grey.
const ACCENT = '#fafafa';

const RULE = '1px solid rgba(255,255,255,0.08)';

const me = {
  email:    'mailto:fireheartjerry@gmail.com',
  github:   'https://github.com/fireheartjerry',
  linkedin: 'https://www.linkedin.com/in/fireheartjerry/',
  resume:   '/resume.pdf',
  topsoj:   'https://topsoj.com',
};

const contests = [
  { name: 'USACO',                 result: 'Platinum Division',       sub: '1000 / 1000 on Gold' },
  { name: 'PhysicsBowl',           result: '1st Canada · 7th Global', sub: null },
  { name: 'Sir Isaac Newton Exam', result: '4th Canada · 9th Global', sub: null },
  { name: 'AIME',                  result: '3× Qualifier',            sub: '2024 – 2026' },
  { name: 'SAT',                   result: '1570',                    sub: '8× AP 5s' },
];

const projects = [
  {
    name:  'TopsOJ',
    blurb: 'Founder. Competitive-math online judge. Contest infra, judging pipelines, OCR problem ingestion, rating system. Partners: 3Blue1Brown, Leading Aces Academy.',
    url:   'https://topsoj.com',
    tags:  'Founder · Full-stack · Live',
  },
  {
    name:  'Appetizer-IQ',
    blurb: 'Hack the North 2025. AI underwriting dashboard — LLM chat, persona modes, explainability, real-time controls.',
    url:   'https://github.com/fireheartjerry/appetizer-iq',
    tags:  'Hack the North 2025 · LLM',
  },
  {
    name:  'Worldline Engine',
    blurb: 'C++/raylib desktop sim — deterministic seeded universe generation, live physics stepping, saved universes, timeline recording, tests + CI.',
    url:   'https://github.com/fireheartjerry/worldline-engine',
    tags:  'C++ · Physics sim',
  },
  {
    name:  'Quoted Tech Web Scraper',
    blurb: 'Internship. Enterprise scraping + analysis pipeline — Selenium, pandas, scikit-learn, SHAP/LIME explainability.',
    url:   'https://github.com/fireheartjerry/quoted-tech-web-scraper',
    tags:  'Internship · ML / Data',
  },
];

const papers = [
  {
    title: 'Ballistic Mass Transfer in Binary Stars',
    venue: 'Research Notes of the AAS · sole author',
    url:   'https://doi.org/10.3847/2515-5172/ae4513',
  },
  {
    title: 'Instantaneous Mass-Transfer Mappings',
    venue: 'Journal of High School Science · sole author · Best Original Manuscript Vol. 10(1)',
    url:   'https://doi.org/10.64336/001c.159153',
  },
];

const theme = createTheme({
  palette: {
    mode:       'dark',
    primary:    { main: ACCENT },
    background: { default: '#0a0a0a', paper: '#0a0a0a' },
    text:       { primary: '#f2f2f2', secondary: '#bdbdbd' },
  },
  typography: { fontFamily: SANS },
});

// Fluid horizontal padding — content fills the viewport, no fixed box,
// no wasted fringe; the inset simply breathes wider on bigger screens.
const PAGE_X = { xs: 3, sm: 5, md: 8, lg: 12, xl: 'clamp(4rem, 9vw, 16rem)' };

const NAV_ITEMS = ['education', 'contests', 'projects', 'research'];

const scrollTo = (id) => (e) => {
  e.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
};

// Quiet, staggered page-load reveal (hero only — it's above the fold).
const reveal = (delay) => ({ className: 'reveal', style: { animationDelay: `${delay}s` } });

// Reveal as the element scrolls into view (everything below the fold).
const onScrollReveal = (delay = 0) => ({ 'data-reveal': '', style: { transitionDelay: `${delay}s` } });

const Nav = ({ active, scrolled }) => (
  <Box
    component="nav"
    sx={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      backdropFilter: scrolled ? 'blur(16px)' : 'none',
      WebkitBackdropFilter: scrolled ? 'blur(16px)' : 'none',
      bgcolor: scrolled ? 'rgba(10,10,10,0.62)' : 'transparent',
      borderBottom: scrolled ? RULE : '1px solid transparent',
      transition: 'background-color .35s ease, border-color .35s ease',
    }}
  >
    <Box sx={{ px: PAGE_X, py: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography
          component="a" href="#"
          onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          sx={{
            display: 'inline-flex', alignItems: 'center', gap: 1,
            fontFamily: MONO, fontSize: '0.95rem', letterSpacing: '0.02em', color: '#d8d8d8',
            textDecoration: 'none', transition: 'color .25s ease',
            '&:hover': { color: '#ffffff' },
          }}
        >
          <Box component="span" sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: ACCENT, flexShrink: 0 }} />
          jerry li
        </Typography>
        <Stack direction="row" spacing={{ sm: 3.5, md: 5 }} sx={{ display: { xs: 'none', sm: 'flex' } }}>
          {NAV_ITEMS.map((id) => {
            const isActive = active === id;
            return (
              <Box
                key={id} component="a" href={`#${id}`} onClick={scrollTo(id)}
                aria-current={isActive ? 'true' : undefined}
                sx={{
                  position: 'relative', fontFamily: MONO, fontSize: '0.85rem', letterSpacing: '0.04em',
                  color: isActive ? '#f2f2f2' : '#888', textDecoration: 'none', transition: 'color .3s ease',
                  '&::after': {
                    content: '""', position: 'absolute', left: 0, bottom: -5, height: '1px',
                    width: isActive ? '100%' : '0%', bgcolor: 'currentColor',
                    transition: 'width .3s cubic-bezier(.22,.61,.36,1)',
                  },
                  '&:hover': { color: '#f2f2f2' },
                  '&:hover::after': { width: '100%' },
                }}
              >
                {id}
              </Box>
            );
          })}
        </Stack>
      </Stack>
    </Box>
  </Box>
);

const Section = ({ id, index, title, span = 6, delay, children }) => (
  <Box
    component="section"
    id={id}
    {...onScrollReveal(delay)}
    sx={{
      gridColumn: { xs: '1 / -1', md: `span ${span}` },
      borderTop: RULE,
      pt: { xs: 4, md: 5 },
      scrollMarginTop: '92px',
    }}
  >
    <Stack direction="row" alignItems="baseline" spacing={1.5} sx={{ mb: { xs: 3, md: 3.5 } }}>
      <Typography component="span" sx={{ fontFamily: MONO, fontSize: '0.78rem', color: '#565656' }}>
        {index}
      </Typography>
      <Typography
        component="span"
        sx={{ fontFamily: MONO, fontSize: '0.78rem', letterSpacing: '0.24em', color: '#7a7a7a', textTransform: 'uppercase' }}
      >
        {title}
      </Typography>
    </Stack>
    {children}
  </Box>
);

function App() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => { bootConsole(); }, []);

  // Reveal elements as they scroll into view.
  useEffect(() => {
    const els = document.querySelectorAll('[data-reveal]');
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add('is-visible');
            io.unobserve(en.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // Nav background materializes once the user leaves the very top.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Nav scrolled={scrolled} />
      <Box sx={{ position: 'relative', minHeight: '100dvh', overflowX: 'hidden' }}>
        <Box sx={{ px: PAGE_X, pt: { xs: 16, md: 22 }, pb: { xs: 10, md: 16 } }}>

          {/* ── Hero ── */}
          <Box sx={{ pb: { xs: 9, md: 14 }, maxWidth: '64rem' }}>
            <Typography
              {...reveal(0)}
              sx={{ fontFamily: MONO, fontSize: '0.78rem', letterSpacing: '0.26em', color: '#6e6e6e', textTransform: 'uppercase', mb: { xs: 3, md: 4 } }}
            >
              C++ Systems · Competitive Programming · Astrophysics
            </Typography>
            <Typography
              {...reveal(0.06)}
              sx={{
                fontFamily: SERIF, fontStyle: 'italic', fontWeight: 400,
                fontSize: 'clamp(3.25rem, 9vw, 7.5rem)',
                letterSpacing: '-0.025em', mb: { xs: 3.5, md: 4 }, lineHeight: 0.98, color: '#fbfbfb',
              }}
            >
              Jerry (Yuze) Li.
              <Box
                component="span"
                className="caret"
                aria-hidden="true"
                sx={{
                  display: 'inline-block',
                  width: 'clamp(7px, 0.55vw, 12px)',
                  height: '0.74em',
                  ml: '0.14em',
                  verticalAlign: '-0.04em',
                  bgcolor: ACCENT,
                  borderRadius: '1px',
                  boxShadow: '0 0 16px rgba(255,255,255,0.3)',
                }}
              />
            </Typography>
            <Typography
              {...reveal(0.12)}
              sx={{ color: '#e6e6e6', mb: 3, lineHeight: 1.5, fontSize: 'clamp(1.2rem, 2.2vw, 1.55rem)', fontWeight: 500, maxWidth: '44rem' }}
            >
              Incoming Waterloo CS · Schulich Leader.
            </Typography>
            <Typography
              {...reveal(0.18)}
              sx={{ color: '#9a9a9a', lineHeight: 1.85, fontSize: 'clamp(1.05rem, 1.5vw, 1.2rem)', maxWidth: '40rem' }}
            >
              Built{' '}
              <Link
                href="https://topsoj.com" target="_blank" rel="noopener noreferrer"
                sx={{ color: '#ededed', textDecoration: 'none', borderBottom: '1px solid rgba(255,255,255,0.25)', transition: 'border-color .25s ease, color .25s ease', '&:hover': { color: ACCENT, borderColor: ACCENT } }}
              >
                TopsOJ
              </Link>{' '}
              at 15 because no one else would. Two first-author astrophysics papers by 17.
              I hyperoptimize everything and biohack my body.
              Black-magic C++ (bit hacks, SIMD, branchless, cache-aware) is my love language.
            </Typography>
            <Stack {...reveal(0.24)} direction="row" spacing={1} sx={{ mt: { xs: 4.5, md: 5.5 }, ml: -1 }}>
              {[
                { href: me.topsoj,   icon: <Language fontSize="small" />,    label: 'Website',  mailto: false },
                { href: me.github,   icon: <GitHub fontSize="small" />,      label: 'GitHub',   mailto: false },
                { href: me.linkedin, icon: <LinkedIn fontSize="small" />,    label: 'LinkedIn', mailto: false },
                { href: me.resume,   icon: <Description fontSize="small" />, label: 'Résumé',   mailto: false },
                { href: me.email,    icon: <Email fontSize="small" />,       label: 'Email',    mailto: true  },
              ].map((b, i) => (
                <IconButton
                  key={i} href={b.href} aria-label={b.label}
                  target={b.mailto ? undefined : '_blank'}
                  rel={b.mailto ? undefined : 'noopener noreferrer'}
                  sx={{
                    color: '#7a7a7a', p: 1,
                    transition: 'color .25s ease, transform .25s ease',
                    '&:hover': { color: '#ffffff', bgcolor: 'transparent', transform: 'translateY(-2px)' },
                  }}
                >
                  {b.icon}
                </IconButton>
              ))}
            </Stack>
          </Box>

          {/* ── Editorial grid ── */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: 'repeat(12, minmax(0, 1fr))' },
              columnGap: { md: 10, lg: 14 },
              rowGap: { xs: 6, md: 8 },
              alignItems: 'start',
            }}
          >
            {/* Education */}
            <Section id="education" index="01" title="education" delay={0}>
              <Stack spacing={4}>
                {[
                  {
                    school: 'University of Waterloo — BCS',
                    period: '2026 – 2031',
                    desc:   'Bachelor of Computer Science · Faculty of Mathematics · Schulich Leader ($100,000).',
                  },
                  {
                    school: 'Marc Garneau C.I. — TOPS Program',
                    period: '2022 – 2026',
                    desc:   "Toronto's flagship advanced-STEM cohort.",
                  },
                ].map((e) => (
                  <Box key={e.school}>
                    <Stack direction="row" justifyContent="space-between" alignItems="baseline" flexWrap="wrap" gap={1}>
                      <Typography sx={{ fontSize: '1.2rem', fontWeight: 600, color: '#f0f0f0' }}>{e.school}</Typography>
                      <Typography sx={{ fontFamily: MONO, fontSize: '0.9rem', color: '#6e6e6e' }}>{e.period}</Typography>
                    </Stack>
                    <Typography sx={{ fontSize: '1.05rem', color: '#9a9a9a', mt: 0.75, lineHeight: 1.65 }}>{e.desc}</Typography>
                  </Box>
                ))}
              </Stack>
            </Section>

            {/* Contests */}
            <Section id="contests" index="02" title="contests" delay={0.08}>
              <Stack spacing={0}>
                {contests.map((c, i) => (
                  <Stack
                    key={c.name}
                    direction="row" justifyContent="space-between" alignItems="baseline"
                    flexWrap="wrap" gap={1}
                    sx={{ py: 1.6, borderBottom: i < contests.length - 1 ? RULE : 'none' }}
                  >
                    <Typography sx={{ fontFamily: MONO, fontSize: '1.05rem', color: '#9c9c9c' }}>{c.name}</Typography>
                    <Stack direction="row" alignItems="baseline" gap={1.5} flexWrap="wrap">
                      <Typography sx={{ fontFamily: MONO, fontSize: '0.98rem', color: '#f4f4f4', fontWeight: 500 }}>{c.result}</Typography>
                      {c.sub && <Typography sx={{ fontFamily: MONO, fontSize: '0.92rem', color: '#7a7a7a' }}>{c.sub}</Typography>}
                    </Stack>
                  </Stack>
                ))}
              </Stack>
              <Typography sx={{ fontFamily: MONO, fontSize: '0.88rem', color: '#6e6e6e', mt: 2.5 }}>
                + Euclid / Pascal / Hypatia / Fermat / CSMC honour rolls
              </Typography>
            </Section>

            {/* Projects */}
            <Section id="projects" index="03" title="projects" delay={0}>
              <Stack spacing={3.75}>
                {projects.map((p) => (
                  <Box
                    key={p.name}
                    id={p.name === 'TopsOJ' ? 'topsoj' : undefined}
                    sx={{
                      scrollMarginTop: '96px',
                      '&:hover .proj-name': { color: ACCENT },
                      '&:hover .proj-arrow': { opacity: 1, transform: 'translate(3px, -3px)', color: ACCENT },
                    }}
                  >
                    <Link
                      href={p.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${p.name}`}
                      sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, textDecoration: 'none' }}
                    >
                      <Typography className="proj-name" sx={{ fontFamily: MONO, fontSize: '1.05rem', fontWeight: 600, color: '#f0f0f0', transition: 'color .25s ease' }}>{p.name}</Typography>
                      <Launch className="proj-arrow" sx={{ fontSize: 15, color: '#5e5e5e', opacity: 0.55, transition: 'opacity .25s ease, transform .25s ease, color .25s ease' }} />
                    </Link>
                    <Typography sx={{ fontSize: '1.02rem', color: '#919191', mt: 0.75, lineHeight: 1.7 }}>{p.blurb}</Typography>
                    <Typography sx={{ fontFamily: MONO, fontSize: '0.85rem', color: '#636363', mt: 1 }}>{p.tags}</Typography>
                  </Box>
                ))}
              </Stack>
            </Section>

            {/* Research */}
            <Section id="research" index="04" title="research" delay={0.08}>
              <Typography sx={{ fontSize: '1.02rem', color: '#919191', mb: 4, lineHeight: 1.7 }}>
                Computational astrophysics: binary star mass transfer dynamics. Advised by Dr. Alexander Mushtukov (Oxford).
              </Typography>
              <Stack spacing={3.5}>
                {papers.map((p) => (
                  <Box key={p.url}>
                    <Typography sx={{ fontSize: '1.05rem', fontWeight: 600, color: '#f0f0f0', lineHeight: 1.45 }}>{p.title}</Typography>
                    <Typography sx={{ fontFamily: MONO, fontSize: '0.88rem', color: '#7a7a7a', mt: 0.6 }}>{p.venue}</Typography>
                    <Link
                      href={p.url} target="_blank" rel="noopener noreferrer"
                      sx={{ fontFamily: MONO, fontSize: '0.85rem', color: '#636363', display: 'inline-flex', alignItems: 'center', gap: 0.5, mt: 0.9, wordBreak: 'break-all', textDecoration: 'none', transition: 'color .25s ease', '&:hover': { color: ACCENT } }}
                    >
                      {p.url} <Launch sx={{ fontSize: 12 }} />
                    </Link>
                  </Box>
                ))}
              </Stack>
            </Section>
          </Box>

          {/* ── Footer ── */}
          <Box {...onScrollReveal(0)} sx={{ mt: { xs: 9, md: 13 }, pt: 3, borderTop: RULE, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
            <Typography sx={{ fontFamily: MONO, fontSize: '0.85rem', color: '#636363' }}>
              © {new Date().getFullYear()} jerry li
            </Typography>
            <Typography sx={{ fontFamily: MONO, fontSize: '0.85rem', color: '#4e4e4e' }}>
              built from scratch · open the console
            </Typography>
          </Box>

        </Box>
      </Box>
    </ThemeProvider>
  );
}

export default App;
