import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Building2, ChartNoAxesColumnIncreasing, CheckCheck, ChevronRight, ClipboardList, ClipboardPenLine, Compass, Flag, GraduationCap, House, LogIn, MapPinned, Menu, ShieldCheck, Sprout, Tractor, UsersRound, X } from 'lucide-react';
import './home.css';

const categories = [
  { icon: House, name: 'Household survey', description: 'Document living conditions and access to essential services.', path: '/surveys/households/new', color: 'sage' },
  { icon: Flag, name: 'Village problems', description: 'Report infrastructure issues for review and verification.', path: '/surveys/problems/new', color: 'clay' },
  { icon: Building2, name: 'Infrastructure', description: 'Observe the condition and accessibility of local facilities.', path: '/surveys/infrastructure/new', color: 'blue' },
  { icon: Tractor, name: 'Farmer survey', description: 'Record crops, irrigation sources and agricultural challenges.', path: '/surveys/farmers/new', color: 'wheat' },
  { icon: UsersRound, name: 'Self-help groups', description: 'Understand group activities, training and support needs.', path: '/surveys/shgs/new', color: 'sage' },
  { icon: MapPinned, name: 'Panchayat consultations', description: 'Capture local priorities, development projects and planned actions.', path: '/surveys/consultations/new', color: 'clay' },
  { icon: GraduationCap, name: 'Student participation', description: 'Track team assignments and student contributions to fieldwork.', path: '/surveys/students/new', color: 'blue' }
];

export function VillageMark() {
  return <span className="v360-mark" aria-hidden="true"><Sprout size={25} strokeWidth={2.1}/></span>;
}

export default function Home() {
  const [menu, setMenu] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const close = () => setMenu(false);

  // Scroll Progress Tracker & Reveal Observer
  useEffect(() => {
    const handleScroll = () => {
      const totalScroll = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      if (totalScroll > 0) {
        const currentProgress = (window.scrollY / totalScroll) * 100;
        setScrollProgress(Math.min(100, Math.max(0, currentProgress)));
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    // Scroll Reveal Intersection Observer
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -30px 0px' }
    );

    const revealElements = document.querySelectorAll('.v360-reveal');
    revealElements.forEach((el) => observer.observe(el));

    return () => {
      window.removeEventListener('scroll', handleScroll);
      observer.disconnect();
    };
  }, [expanded]);

  return (
    <div className="v360-home">
      {/* Top Scroll Progress Indicator */}
      <div
        className="v360-scroll-progress"
        style={{ width: `${scrollProgress}%` }}
        aria-hidden="true"
      />

      <header className="v360-header">
        <div className="v360-wrap v360-nav">
          <Link className="v360-brand" to="/" aria-label="Village 360 home">
            <VillageMark />
            <span>Village <b>360°</b></span>
          </Link>
          <nav className={menu ? 'v360-links is-open' : 'v360-links'} aria-label="Main navigation">
            <a href="#overview" onClick={close}>Overview</a>
            <a href="#categories" onClick={close}>Survey categories</a>
            <a href="#workflow" onClick={close}>How it works</a>
          </nav>
          <div className="v360-actions">
            <Link className="v360-login" to="/login"><LogIn size={16}/> Sign in</Link>
            <button
              className="v360-menu"
              aria-label={menu ? 'Close navigation' : 'Open navigation'}
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>

      <main>
        <section className="v360-hero" id="overview" aria-labelledby="v360-title">
          <picture>
            <source media="(max-width: 680px)" srcSet="/assets/village-fieldwork-small.webp" width="800" height="267" type="image/webp" />
            <img
              className="v360-hero-img"
              src="/assets/village-fieldwork.webp"
              alt="A rural village surrounded by cultivated fields, coconut palms and distant hills"
              fetchPriority="high"
              width="1600"
              height="533"
              decoding="async"
            />
          </picture>
          <div className="v360-wrap v360-hero-content v360-reveal is-visible">
            <div className="v360-eyebrow hero-eyebrow"><span /> Village research platform</div>
            <h1 id="v360-title">VILLAGE <span>360°</span></h1>
            <h2>Digital Village Survey &amp;<br className="v360-title-break" /> Development Data Management</h2>
            <p>A fieldwork workspace for students and coordinators to collect household surveys, document local issues and track village development.</p>
            <div className="v360-hero-buttons">
              <Link className="v360-primary" to="/surveys/households/new">
                <ClipboardPenLine size={18} />Start survey
              </Link>
              <Link className="v360-secondary" to="/dashboard">
                <ChartNoAxesColumnIncreasing size={18} />View dashboard
              </Link>
            </div>
          </div>
        </section>

        <section className="v360-principles" aria-label="Project objectives">
          <div className="v360-wrap v360-principles-grid v360-reveal">
            <div>
              <span><MapPinned /></span>
              <section>
                <h3>Field collection</h3>
                <p>Village and ward-level surveys</p>
              </section>
            </div>
            <div>
              <span><ShieldCheck /></span>
              <section>
                <h3>Consent-first records</h3>
                <p>Secure, role-based access</p>
              </section>
            </div>
            <div>
              <span><ChartNoAxesColumnIncreasing /></span>
              <section>
                <h3>Research reporting</h3>
                <p>Verified findings and exports</p>
              </section>
            </div>
          </div>
        </section>

        <section className="v360-wrap v360-categories" id="categories">
          <div className="v360-eyebrow v360-reveal"><span /> Survey collection</div>
          <div className="v360-section-heading v360-reveal">
            <div>
              <h2>Survey categories</h2>
              <p>Select a module to begin collecting field data.</p>
            </div>
            <button
              className="v360-show"
              onClick={() => setExpanded(!expanded)}
              aria-expanded={expanded}
            >
              {expanded ? 'Show fewer modules' : 'View all modules'}
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="v360-category-grid v360-reveal">
            {categories.slice(0, expanded ? categories.length : 4).map(({ icon: Icon, name, description, path, color }) => (
              <Link to={path} key={name} className="v360-card">
                <div className="v360-card-top">
                  <span className={'v360-card-icon ' + color}><Icon size={23} /></span>
                  <ArrowUpRight size={17} />
                </div>
                <h3>{name}</h3>
                <p>{description}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="v360-flow" id="workflow">
          <div className="v360-wrap">
            <div className="v360-eyebrow v360-reveal"><span /> Fieldwork process</div>
            <h2 className="v360-reveal">How it works</h2>
            <div className="v360-flow-grid v360-reveal">
              {[
                [Compass, 'Plan the visit', 'Coordinators create villages and wards, then assign survey teams.'],
                [ClipboardList, 'Collect observations', 'Surveyors record consent, complete field forms and submit their findings.'],
                [CheckCheck, 'Review and report', 'Administrators verify submissions and faculty explore approved statistics.']
              ].map(([Icon, title, desc]) => (
                <div key={title} className="v360-flow-step">
                  <Icon size={24} />
                  <h3>{title}</h3>
                  <p>{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="v360-footer">
        <div className="v360-wrap">
          <Link className="v360-brand" to="/">
            <VillageMark />
            <span>Village <b>360°</b></span>
          </Link>
          <p>Smart Village Survey &amp; Database Management System</p>
          <a href="#overview">Back to top</a>
        </div>
      </footer>
    </div>
  );
}
