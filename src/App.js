import React, { useEffect, useState, useRef } from 'react';

const App = () => {
  const [theme, setTheme] = useState('dark');
  const [scrollProgress, setScrollProgress] = useState(0);
  const [navShrink, setNavShrink] = useState(false);
  const [activeSection, setActiveSection] = useState('#top');

  useEffect(() => {
    const stored = localStorage.getItem('theme');
    if (stored) setTheme(stored);
    else setTheme('dark');
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('theme', theme); } catch (e) {}
  }, [theme]);

  const toggleTheme = () => {
    document.documentElement.classList.add('theming');
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    setTimeout(() => {
      document.documentElement.classList.remove('theming');
    }, 480);
  };

  useEffect(() => {
    const handleScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setScrollProgress(max > 0 ? (window.scrollY / max) * 100 : 0);
      setNavShrink(window.scrollY > 24);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const sections = [
      { href: '#top', el: document.querySelector('.hero') },
      { href: '#education', el: document.getElementById('education') },
      { href: '#contests', el: document.getElementById('contests') },
      { href: '#projects', el: document.getElementById('projects') },
      { href: '#research', el: document.getElementById('research') },
    ];

    sections.forEach((section) => {
      if (!section.el) return;
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setActiveSection(section.href);
            }
          });
        },
        { rootMargin: '-45% 0px -50% 0px' }
      );
      observer.observe(section.el);
    });
  }, []);

  useEffect(() => {
    const revealElements = document.querySelectorAll('[data-rev]');
    const ro = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            ro.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -6% 0px' }
    );

    revealElements.forEach((el, i) => {
      if (el.closest('.hero')) {
        el.style.transitionDelay = (Math.min(i, 6) * 0.07) + 's';
      }
      ro.observe(el);
    });

    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const sections = document.querySelectorAll('.sec');
    const lo = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('linein');
            lo.unobserve(entry.target);
          }
        });
      },
      { threshold: 0, rootMargin: '0px 0px -12% 0px' }
    );

    sections.forEach((s) => lo.observe(s));
    return () => lo.disconnect();
  }, []);

  useEffect(() => {
    const anchorLinks = document.querySelectorAll('a[href^="#"]');
    const handleAnchorClick = (e) => {
      const id = e.currentTarget.getAttribute('href').slice(1);
      e.preventDefault();
      if (id === 'top') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      const target = document.getElementById(id);
      if (target) {
        window.scrollTo({
          top: target.getBoundingClientRect().top + window.scrollY - 58,
          behavior: 'smooth',
        });
      }
    };

    anchorLinks.forEach((a) => a.addEventListener('click', handleAnchorClick));
    return () => {
      anchorLinks.forEach((a) => a.removeEventListener('click', handleAnchorClick));
    };
  }, []);

  useEffect(() => {
    const magElements = document.querySelectorAll('[data-mag]');
    magElements.forEach((el) => {
      const handleMouseMove = (e) => {
        const r = el.getBoundingClientRect();
        el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.3}px, ${(e.clientY - r.top - r.height / 2) * 0.3}px) scale(1.14)`;
      };
      const handleMouseLeave = () => {
        el.style.transform = 'translate(0, 0) scale(1)';
      };

      el.addEventListener('mousemove', handleMouseMove);
      el.addEventListener('mouseleave', handleMouseLeave);

      return () => {
        el.removeEventListener('mousemove', handleMouseMove);
        el.removeEventListener('mouseleave', handleMouseLeave);
      };
    });
  }, []);

  const socials = [
    { href: 'https://topsoj.com', label: 'Website', icon: 'globe' },
    { href: 'https://github.com/fireheartjerry', label: 'GitHub', icon: 'github' },
    { href: 'https://www.linkedin.com/in/fireheartjerry/', label: 'LinkedIn', icon: 'linkedin' },
    { href: '/resume.pdf', label: 'Résumé', icon: 'file' },
    { href: 'mailto:fireheartjerry@gmail.com', label: 'Email', icon: 'email' },
  ];

  const education = [
    {
      school: 'University of Waterloo — BCS',
      period: '2026–2031',
      desc: 'Bachelor of Computer Science · Faculty of Mathematics · Schulich Leader ($100,000).',
    },
    {
      school: 'Marc Garneau C.I. — TOPS Program',
      period: '2022–2026',
      desc: 'Toronto\'s flagship advanced-STEM cohort.',
    },
  ];

  const contests = [
    { name: 'USACO', result: 'Platinum Division', sub: '1000 / 1000 on Gold' },
    { name: 'PhysicsBowl', result: '1st Canada · 7th Global', sub: '—' },
    { name: 'Sir Isaac Newton Exam', result: '4th Canada · 9th Global', sub: '—' },
    { name: 'AIME', result: '3× Qualifier', sub: '2024–2026' },
    { name: 'SAT', result: '1570', sub: '8× AP 5s' },
  ];

  const projects = [
    {
      name: 'TopsOJ',
      blurb: 'Founder. Competitive-math online judge. Contest infra, judging pipelines, OCR problem ingestion, rating system. Partners: 3Blue1Brown, Leading Aces Academy.',
      url: 'https://topsoj.com',
      tags: 'Founder · Full-stack · Live',
    },
    {
      name: 'Appetizer-IQ',
      blurb: 'Hack the North 2025. AI underwriting dashboard — LLM chat, persona modes, explainability, real-time controls.',
      url: 'https://github.com/fireheartjerry/appetizer-iq',
      tags: 'Hack the North 2025 · LLM',
    },
    {
      name: 'Worldline Engine',
      blurb: 'C++/raylib desktop sim — deterministic seeded universe generation, live physics stepping, saved universes, timeline recording, tests + CI.',
      url: 'https://github.com/fireheartjerry/worldline-engine',
      tags: 'C++ · Physics sim',
    },
    {
      name: 'Quoted Tech Web Scraper',
      blurb: 'Internship. Enterprise scraping + analysis pipeline — Selenium, pandas, scikit-learn, SHAP/LIME explainability.',
      url: 'https://github.com/fireheartjerry/quoted-tech-web-scraper',
      tags: 'Internship · ML / Data',
    },
  ];

  const papers = [
    {
      title: 'Ballistic Mass Transfer in Binary Stars',
      venue: 'Research Notes of the AAS · sole author',
      url: 'https://doi.org/10.3847/2515-5172/ae4513',
      doi: 'doi.org/10.3847/2515-5172/ae4513',
    },
    {
      title: 'Instantaneous Mass-Transfer Mappings',
      venue: 'Journal of High School Science · sole author · Best Original Manuscript Vol. 10(1)',
      url: 'https://doi.org/10.64336/001c.159153',
      doi: 'doi.org/10.64336/001c.159153',
    },
  ];

  const SocialIcon = ({ type }) => {
    const icons = {
      globe: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <circle cx="12" cy="12" r="9"/>
          <path d="M3 12h18M12 3c2.5 2.5 3.8 5.6 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.6-3.8-9S9.5 5.5 12 3z"/>
        </svg>
      ),
      github: (
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49 0-.24-.01-.88-.01-1.73-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.49-1.11-1.49-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.3 9.3 0 0 1 12 6.86c.85 0 1.71.12 2.51.34 1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.35 4.79-4.58 5.05.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.82 0 .27.18.6.69.49A10.06 10.06 0 0 0 22 12.25C22 6.58 17.52 2 12 2z"/>
        </svg>
      ),
      linkedin: (
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14zM8.34 18.34V9.99H5.67v8.35h2.67zM7 8.84a1.55 1.55 0 1 0 0-3.1 1.55 1.55 0 0 0 0 3.1zm11.34 9.5v-4.57c0-2.45-1.31-3.59-3.06-3.59-1.41 0-2.04.78-2.39 1.32v-1.13h-2.67c.04.75 0 8.35 0 8.35h2.67v-4.66c0-.24.02-.48.09-.65.19-.48.63-.97 1.36-.97.96 0 1.34.73 1.34 1.8v4.48h2.67z"/>
        </svg>
      ),
      file: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/>
          <path d="M14 3v5h5M9 13h6M9 17h6"/>
        </svg>
      ),
      email: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="14" rx="2"/>
          <path d="m3 7 9 6 9-6"/>
        </svg>
      ),
    };
    return icons[type] || null;
  };

  return (
    <div>
      <div id="prog" style={{ width: `${scrollProgress}%` }} />

      <nav className="rail" aria-label="Sections">
        <a href="#top" aria-label="Top"><span className="dlabel">Top</span><span className="ddot"></span></a>
        <a href="#education" aria-label="Education"><span className="dlabel">Education</span><span className="ddot"></span></a>
        <a href="#contests" aria-label="Contests"><span className="dlabel">Contests</span><span className="ddot"></span></a>
        <a href="#projects" aria-label="Projects"><span className="dlabel">Projects</span><span className="ddot"></span></a>
        <a href="#research" aria-label="Research"><span className="dlabel">Research</span><span className="ddot"></span></a>
      </nav>

      <nav className={navShrink ? 'shrink' : ''}>
        <div className="shell">
          <div className="nav-in">
            <a className="brand" href="#top"><span className="mark"></span>Jerry&nbsp;Li</a>
            <div className="nav-right">
              <div className="nav-links">
                <a href="#education" className={activeSection === '#education' ? 'on' : ''}><span className="num">01</span>Education</a>
                <a href="#contests" className={activeSection === '#contests' ? 'on' : ''}><span className="num">02</span>Contests</a>
                <a href="#projects" className={activeSection === '#projects' ? 'on' : ''}><span className="num">03</span>Projects</a>
                <a href="#research" className={activeSection === '#research' ? 'on' : ''}><span className="num">04</span>Research</a>
              </div>
              <button className="toggle" onClick={toggleTheme} aria-label="Toggle colour theme">
                <svg className="t-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                  <circle cx="12" cy="12" r="4.2"/>
                  <path d="M12 2.4v2.6M12 19v2.6M4.6 4.6l1.9 1.9M17.5 17.5l1.9 1.9M2.4 12h2.6M19 12h2.6M4.6 19.4l1.9-1.9M17.5 6.5l1.9-1.9"/>
                </svg>
                <svg className="t-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8z"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main id="top">
        <header className="shell g12 hero">
          <div className="hero-l">
            <div className="kick" data-rev><span className="sq"></span>Est. 2008 — Toronto → Waterloo</div>
            <h1 className="name" data-rev>Jerry <span className="paren">(Yuze)</span> Li<span className="dot">.</span></h1>
            <p className="statement" data-rev>Incoming Waterloo CS · Schulich Leader.</p>
            <p className="bio" data-rev>
              Built <a className="ul" href="https://topsoj.com" target="_blank" rel="noopener">TopsOJ</a>
              {' '}at 15 because no one else would. Two first-author astrophysics papers by 17. I like
              optimization and biohacking. Eventually, I want to land astronauts on Mars.
            </p>
            <div className="social" data-rev>
              {socials.map((social, i) => (
                <a key={i} href={social.href} target={social.label !== 'Email' ? '_blank' : undefined} rel={social.label !== 'Email' ? 'noopener' : undefined} aria-label={social.label} data-mag>
                  <SocialIcon type={social.icon} />
                </a>
              ))}
            </div>
          </div>

          <div className="hero-r index" data-rev>
            <div className="lab">Index</div>
            <a href="#education" className={activeSection === '#education' ? 'on' : ''}><span>Education</span><span className="n">01</span></a>
            <a href="#contests" className={activeSection === '#contests' ? 'on' : ''}><span>Contests</span><span className="n">02</span></a>
            <a href="#projects" className={activeSection === '#projects' ? 'on' : ''}><span>Projects</span><span className="n">03</span></a>
            <a href="#research" className={activeSection === '#research' ? 'on' : ''}><span>Research</span><span className="n">04</span></a>
          </div>
        </header>

        <section className="shell g12 sec" id="education">
          <div className="sec-head" data-rev><div className="sec-no">01</div><div className="sec-lab">Education</div></div>
          <div className="sec-body" data-rev>
            {education.map((edu, i) => (
              <div key={i} className="edu-row">
                <div className="edu-top"><span className="edu-school">{edu.school}</span><span className="edu-when">{edu.period}</span></div>
                <div className="edu-desc">{edu.desc}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="shell g12 sec" id="contests">
          <div className="sec-head" data-rev><div className="sec-no">02</div><div className="sec-lab">Contests</div></div>
          <div className="sec-body" data-rev>
            <div className="thead"><span>Event</span><span>Result</span><span>Detail</span></div>
            {contests.map((contest, i) => (
              <div key={i} className="trow"><span className="t-name">{contest.name}</span><span className="t-res">{contest.result}</span><span className="t-sub">{contest.sub}</span></div>
            ))}
            <div className="honour">+ Euclid / Pascal / Hypatia / Fermat / CSMC honour rolls</div>
          </div>
        </section>

        <section className="shell g12 sec" id="projects">
          <div className="sec-head" data-rev><div className="sec-no">03</div><div className="sec-lab">Projects</div></div>
          <div className="sec-body" data-rev>
            {projects.map((project, i) => (
              <a key={i} className="prow" href={project.url} target="_blank" rel="noopener">
                <div className="p-top"><span className="p-name">{project.name}</span><span className="p-arrow">↗</span></div>
                <div className="p-blurb">{project.blurb}</div>
                <div className="p-tags">{project.tags}</div>
              </a>
            ))}
          </div>
        </section>

        <section className="shell g12 sec" id="research">
          <div className="sec-head" data-rev><div className="sec-no">04</div><div className="sec-lab">Research</div></div>
          <div className="sec-body" data-rev>
            <p className="r-intro">Computational astrophysics: <span className="em">binary star mass transfer dynamics</span>. Advised by Dr. Alexander Mushtukov (Oxford).</p>
            {papers.map((paper, i) => (
              <div key={i} className="paper-row">
                <div className="p-title">{paper.title}</div>
                <div className="p-venue">{paper.venue}</div>
                <a className="p-doi" href={paper.url} target="_blank" rel="noopener">{paper.doi} ↗</a>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
};

export default App;
