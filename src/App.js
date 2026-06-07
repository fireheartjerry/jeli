import React, { useEffect } from 'react';
import {
  Box,
  Container,
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

const MONO  = '"Geist Mono", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
const SANS  = '"Geist", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const SERIF = '"Instrument Serif", "Iowan Old Style", "Times New Roman", serif';

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
    background: { default: '#0a0a0a', paper: '#0a0a0a' },
    text:       { primary: '#f5f5f5', secondary: '#c8c8c8' },
  },
  typography: {
    fontFamily: SANS,
    body1: { fontSize: '1.25rem', lineHeight: 1.7, fontWeight: 400 },
    body2: { fontSize: '1.125rem', lineHeight: 1.7, fontWeight: 400 },
  },
});

const NAV_ITEMS = ['education', 'contests', 'projects', 'research'];

const scrollTo = (id) => (e) => {
  e.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
};

const Nav = () => (
  <Box sx={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, bgcolor: '#0a0a0a', borderBottom: '1px solid #1a1a1a' }}>
    <Container maxWidth={false} sx={{ maxWidth: '640px', py: 1.5 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography
          component="a" href="#"
          onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          sx={{ fontFamily: MONO, fontSize: '1.19rem', color: '#a0a0a0', textDecoration: 'none', '&:hover': { color: '#f5f5f5' } }}
        >
          jerry li
        </Typography>
        <Stack direction="row" spacing={3} sx={{ display: { xs: 'none', sm: 'flex' } }}>
          {NAV_ITEMS.map((id) => (
            <Box
              key={id} component="a" href={`#${id}`} onClick={scrollTo(id)}
              sx={{ fontFamily: MONO, fontSize: '1rem', color: '#a0a0a0', textDecoration: 'none', '&:hover': { color: '#f5f5f5' } }}
            >
              {id}
            </Box>
          ))}
        </Stack>
      </Stack>
    </Container>
  </Box>
);

const Section = ({ id, title, children }) => (
  <Box component="section" id={id} sx={{ py: { xs: 5, md: 6 }, scrollMarginTop: '52px' }}>
    <Typography sx={{ fontFamily: MONO, fontSize: '1rem', letterSpacing: '0.18em', color: '#808080', mb: 3, textTransform: 'uppercase', fontWeight: 500 }}>
      {title}
    </Typography>
    {children}
  </Box>
);

const Divider = () => <Box sx={{ borderTop: '1px solid #1a1a1a' }} />;

function App() {
  useEffect(() => { bootConsole(); }, []);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Nav />
      <Box sx={{ bgcolor: '#0a0a0a', minHeight: '100vh' }}>
        <Container maxWidth={false} sx={{ maxWidth: '640px', pt: { xs: 5, md: 6 }, pb: 8 }}>

          {/* ── Hero ── */}
          <Box sx={{ pt: { xs: 9, md: 14 }, pb: { xs: 5, md: 7 } }}>
            <Typography
              sx={{
                fontFamily: SERIF, fontStyle: 'italic', fontWeight: 400,
                fontSize: { xs: '3.75rem', md: '5.625rem' },
                letterSpacing: '-0.02em', mb: 3, lineHeight: 1.05, color: '#ffffff',
              }}
            >
              Jerry (Yuze) Li.
            </Typography>
            <Typography sx={{ color: '#d0d0d0', mb: 2.5, lineHeight: 1.7, fontSize: '1.31rem', fontWeight: 500 }}>
              Incoming Waterloo CS · Schulich Leader ($100,000).
            </Typography>
            <Typography sx={{ color: '#c8c8c8', lineHeight: 1.8, fontSize: '1.25rem', maxWidth: '36rem' }}>
              Built{' '}
              <Link href="https://topsoj.com" target="_blank" rel="noopener noreferrer" underline="hover" sx={{ color: '#c8c8c8' }}>
                TopsOJ
              </Link>{' '}
              at 15 because no one else would. Two first-author astrophysics papers by 17.
              I hyperoptimize everything and biohack my body.
              Black-magic C++ (bit hacks, SIMD, branchless, cache-aware) is my love language.
            </Typography>
            <Stack direction="row" spacing={0.25} sx={{ mt: 3.5 }}>
              {[
                { href: me.topsoj,   icon: <Language fontSize="small" />,    mailto: false },
                { href: me.github,   icon: <GitHub fontSize="small" />,      mailto: false },
                { href: me.linkedin, icon: <LinkedIn fontSize="small" />,    mailto: false },
                { href: me.resume,   icon: <Description fontSize="small" />, mailto: false },
                { href: me.email,    icon: <Email fontSize="small" />,       mailto: true  },
              ].map((b, i) => (
                <IconButton
                  key={i} href={b.href}
                  target={b.mailto ? undefined : '_blank'}
                  rel={b.mailto ? undefined : 'noopener noreferrer'}
                  sx={{ color: '#808080', p: 0.75, '&:hover': { color: '#e0e0e0', bgcolor: 'transparent' } }}
                >
                  {b.icon}
                </IconButton>
              ))}
            </Stack>
          </Box>

          <Divider />

          {/* ── Education ── */}
          <Section id="education" title="education">
            <Stack spacing={3.5}>
              {[
                {
                  school: 'University of Waterloo — BCS',
                  period: '2026 – 2031',
                  desc:   'Bachelor of Computer Science · Faculty of Mathematics · Schulich Leader ($100K).',
                },
                {
                  school: 'Marc Garneau C.I. — TOPS Program',
                  period: '2022 – 2026',
                  desc:   "Toronto's flagship advanced-STEM cohort. ~30 admits/year out of thousands.",
                },
              ].map((e) => (
                <Box key={e.school}>
                  <Stack direction="row" justifyContent="space-between" alignItems="baseline" flexWrap="wrap" gap={1}>
                    <Typography sx={{ fontSize: '1.25rem', fontWeight: 500 }}>{e.school}</Typography>
                    <Typography sx={{ fontFamily: MONO, fontSize: '1.03rem', color: '#808080' }}>{e.period}</Typography>
                  </Stack>
                  <Typography sx={{ fontSize: '1.19rem', color: '#c8c8c8', mt: 0.4 }}>{e.desc}</Typography>
                </Box>
              ))}
            </Stack>
          </Section>

          <Divider />

          {/* ── Contests ── */}
          <Section id="contests" title="contests">
            <Stack spacing={0}>
              {contests.map((c, i) => (
                <Stack
                  key={c.name}
                  direction="row" justifyContent="space-between" alignItems="baseline"
                  flexWrap="wrap" gap={1}
                  sx={{ py: 1.5, borderBottom: i < contests.length - 1 ? '1px solid #1a1a1a' : 'none' }}
                >
                  <Typography sx={{ fontFamily: MONO, fontSize: '1.19rem' }}>{c.name}</Typography>
                  <Stack direction="row" alignItems="baseline" gap={1.5} flexWrap="wrap">
                    <Typography sx={{ fontFamily: MONO, fontSize: '1.03rem', color: '#c8c8c8' }}>{c.result}</Typography>
                    {c.sub && <Typography sx={{ fontFamily: MONO, fontSize: '1.03rem', color: '#808080' }}>{c.sub}</Typography>}
                  </Stack>
                </Stack>
              ))}
            </Stack>
            <Typography sx={{ fontFamily: MONO, fontSize: '1rem', color: '#909090', mt: 2 }}>
              + Euclid / Pascal / Hypatia / Fermat / CSMC honour rolls
            </Typography>
          </Section>

          <Divider />

          {/* ── Projects ── */}
          <Section id="projects" title="projects">
            <Stack spacing={3.5}>
              {projects.map((p) => (
                <Box key={p.name} id={p.name === 'TopsOJ' ? 'topsoj' : undefined} sx={{ scrollMarginTop: '56px' }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography sx={{ fontFamily: MONO, fontSize: '0.9rem', fontWeight: 500 }}>{p.name}</Typography>
                    <Link href={p.url} target="_blank" rel="noopener noreferrer" sx={{ color: '#666666', display: 'flex', '&:hover': { color: '#a8a8a8' } }}>
                      <Launch sx={{ fontSize: 14 }} />
                    </Link>
                  </Stack>
                  <Typography sx={{ fontSize: '1.19rem', color: '#666', mt: 0.4, lineHeight: 1.7 }}>{p.blurb}</Typography>
                  <Typography sx={{ fontFamily: MONO, fontSize: '1rem', color: '#909090', mt: 0.75 }}>{p.tags}</Typography>
                </Box>
              ))}
            </Stack>
          </Section>

          <Divider />

          {/* ── Research ── */}
          <Section id="research" title="research">
            <Typography sx={{ fontSize: '1.19rem', color: '#666', mb: 3.5, lineHeight: 1.7 }}>
              Computational astrophysics: binary star mass transfer dynamics. Advised by Dr. Alexander Mushtukov (Oxford).
            </Typography>
            <Stack spacing={3}>
              {papers.map((p) => (
                <Box key={p.url}>
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 500 }}>{p.title}</Typography>
                  <Typography sx={{ fontFamily: MONO, fontSize: '1.03rem', color: '#808080', mt: 0.4 }}>{p.venue}</Typography>
                  <Link
                    href={p.url} target="_blank" rel="noopener noreferrer" underline="hover"
                    sx={{ fontFamily: MONO, fontSize: '1rem', color: '#909090', display: 'inline-flex', alignItems: 'center', gap: 0.4, mt: 0.5, '&:hover': { color: '#888' } }}
                  >
                    {p.url} <Launch sx={{ fontSize: 11 }} />
                  </Link>
                </Box>
              ))}
            </Stack>
          </Section>

          {/* ── Footer ── */}
          <Divider />
          <Box sx={{ pt: 3, pb: 6 }}>
            <Typography sx={{ fontFamily: MONO, fontSize: '1rem', color: '#909090' }}>
              © {new Date().getFullYear()} jerry li
            </Typography>
          </Box>

        </Container>
      </Box>
    </ThemeProvider>
  );
}

export default App;
