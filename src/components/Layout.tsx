import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Menu, Moon, RotateCcw, Sun, X } from 'lucide-react';
import { useScenario } from '../state/ScenarioContext';
import { useTheme } from '../state/ThemeContext';
import { useAuth } from '../state/AuthContext';
import { Footer } from './Footer';
import { DemoTour } from './DemoTour';
import { WorkflowStepper } from './WorkflowStepper';
import { EcgMark } from './EcgMark';

const NAV_ITEMS = [
  { to: '/command-center', label: 'Command Center' },
  { to: '/understand', label: 'Understand' },
  { to: '/demand', label: 'Demand Intelligence' },
  { to: '/redistribution', label: 'Redistribution' },
  { to: '/action-center', label: 'Action Center' },
  { to: '/simulator', label: 'Simulator' },
  { to: '/policy', label: 'Policy Brief' },
  { to: '/federation', label: 'Federation' },
];

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isStressed, reset } = useScenario();
  const { theme, toggle: toggleTheme } = useTheme();
  const { user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  // Route change closes the mobile panel; also close on Escape.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileNavOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileNavOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  return (
    <div className="flex min-h-full flex-col">
      {/* Sticky shell block: header + workflow stepper scroll as ONE coherent
          top navigation system (see WorkflowStepper below). */}
      <div className="sticky top-0 z-30">
      <header className="bg-chrome text-white">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2.5 sm:px-6">
          <NavLink to="/" className="flex shrink-0 items-center gap-2" aria-label="HealthFlow home">
            <span className="flex h-7 w-7 items-center justify-center rounded bg-accent">
              <EcgMark className="h-4 w-4" />
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-bold tracking-tight">HealthFlow</span>
              <span className="hidden text-[9px] font-medium uppercase tracking-widest text-chrome-50/70 min-[480px]:block">
                Predict · Move · Protect
              </span>
            </span>
          </NavLink>

          <nav aria-label="Primary" className="ml-2 hidden min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:flex">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `shrink-0 whitespace-nowrap rounded px-2 py-1.5 text-xs font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-light ${
                    isActive
                      ? 'bg-chrome-light text-white shadow-sm'
                      : 'text-chrome-50/80 hover:bg-chrome-light/50 hover:text-white'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* Mobile navigation toggle — the full desktop nav swaps to a
              hamburger below lg; the panel opens under the header. */}
          <button
            onClick={() => setMobileNavOpen((o) => !o)}
            aria-expanded={mobileNavOpen}
            aria-controls="mobile-nav"
            aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
            className="ml-1 rounded p-1.5 text-chrome-50/90 transition hover:bg-chrome-light/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-light lg:hidden"
          >
            {mobileNavOpen ? <X className="h-4 w-4" aria-hidden="true" /> : <Menu className="h-4 w-4" aria-hidden="true" />}
          </button>

          <div className="ml-auto flex min-w-0 items-center gap-2">
            <DemoTour />
            <button
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="rounded p-1.5 text-chrome-50/80 transition hover:bg-chrome-light/40 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-light"
            >
              {theme === 'dark' ? <Sun className="h-3.5 w-3.5" aria-hidden="true" /> : <Moon className="h-3.5 w-3.5" aria-hidden="true" />}
            </button>
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="flex items-center gap-1.5 rounded-full p-0.5 pr-2 text-chrome-50 transition hover:bg-chrome-light/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-light"
                title="Account"
              >
                {user?.picture ? (
                  <img src={user.picture} alt="" className="h-6 w-6 rounded-full" referrerPolicy="no-referrer" />
                ) : (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-chrome-light text-[10px] font-bold text-white">
                    {user?.provider === 'demo' ? 'D' : (user?.name?.[0] ?? '?').toUpperCase()}
                  </span>
                )}
                <span className="hidden max-w-[7rem] truncate text-[11px] font-semibold sm:inline">
                  {user?.provider === 'demo' ? 'Demo User' : user?.name?.split(' ')[0] ?? 'Account'}
                </span>
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-40 mt-1.5 w-48 overflow-hidden rounded-lg border border-line bg-surface-elevated py-1 shadow-drawer"
                >
                  <div className="border-b border-line-soft px-3 py-2">
                    <p className="truncate text-xs font-semibold text-ink">{user?.name}</p>
                    {user?.email && <p className="truncate text-[10px] text-muted">{user.email}</p>}
                    <p className="mt-0.5 text-[9px] font-bold uppercase tracking-widest text-muted">
                      {user?.provider === 'demo' ? 'Demo session' : 'Email account'}
                    </p>
                  </div>
                  <button
                    role="menuitem"
                    onClick={toggleTheme}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-ink hover:bg-surface-2 focus:outline-none"
                  >
                    {theme === 'dark' ? <Sun className="h-3.5 w-3.5" aria-hidden="true" /> : <Moon className="h-3.5 w-3.5" aria-hidden="true" />}
                    Theme: {theme === 'dark' ? 'Dark' : 'Light'}
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      // Reset to clean demo state: a full reload clears the
                      // in-memory scenario, plans and tour flags, restoring the
                      // canonical cold-load demo. Session/auth is preserved.
                      window.location.href = '/';
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-ink hover:bg-surface-2 focus:outline-none"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    Reset demo state
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      signOut();
                      navigate('/login', { replace: true });
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-ink hover:bg-surface-2 focus:outline-none"
                  >
                    <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
            {isStressed && (
              <button
                onClick={reset}
                aria-label="Reset scenario to baseline"
                title="Reset scenario to baseline"
                className="rounded p-1.5 text-chrome-50/80 hover:bg-chrome-light/40 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-light"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* THE single global workflow chronology — rendered ONCE by the shell,
          directly below the header, inside the same sticky top block so
          header + stepper behave as one navigation system on every route. */}
      <WorkflowStepper />
      </div>

      {/* Mobile nav panel — sits under the sticky header+stepper block, inside
          the brand chrome so it reads as part of the shell. */}
      {mobileNavOpen && (
        <nav
          id="mobile-nav"
          aria-label="Primary mobile"
          className="sticky top-[73px] z-30 border-b border-chrome-dark bg-chrome lg:hidden"
        >
          <div className="mx-auto max-w-7xl px-4 py-2 sm:px-6">
            <ul role="list" className="grid grid-cols-2 gap-1">
              {NAV_ITEMS.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      `block rounded px-3 py-2 text-xs font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-light ${
                        isActive
                          ? 'bg-chrome-light text-white'
                          : 'text-chrome-50/85 hover:bg-chrome-light/50 hover:text-white'
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      )}

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        <Outlet />
      </main>

      <Footer />
    </div>
  );
}
