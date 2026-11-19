import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Check, Palette } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { THEMES, useTheme } from "@/hooks/use-theme";
import { useAdultMode } from "@/lib/adult-flags";
import SearchIcon from "@/static/images/search-icon.svg";
import DropdownArrowImg from "@/static/images/dropdown-arrow.svg";

/**
 * Netflix-clone shell, ported from netflix-clone-frontend's Navbar/Footer.
 * Renders transparent over the page and turns solid after 50px of scroll.
 * Only active for the netflix theme; every other theme passes straight through.
 */
export function NetflixLayout({ children }: { children: React.ReactNode }) {
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const adultMode = useAdultMode();
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const [scrolling, setScrolling] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolling(window.scrollY > 50);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (theme !== "netflix") return;
    supabase.auth
      .getUser()
      .then(({ data }) => setEmail(data.user?.email ?? null))
      .catch(() => setEmail(null));
  }, [theme]);

  // Close the theme menu on outside click or Escape.
  useEffect(() => {
    if (!themeMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!themeMenuRef.current?.contains(event.target as Node)) setThemeMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setThemeMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [themeMenuOpen]);

  if (theme !== "netflix") return <>{children}</>;

  const initial = (email?.trim()?.[0] ?? "?").toUpperCase();

  async function signOut() {
    await supabase.auth.signOut();
    void navigate({ to: "/auth" });
  }

  return (
    <div className="nf-root">
      <nav className={`nf-nav ${scrolling ? "is-black" : ""}`}>
        <div className="nf-nav__container">
          <div className="nf-nav__left">
            <div className="nf-profile">
              <div className="nf-profile__avatar" aria-hidden="true">
                {email ? initial : "?"}
              </div>
              <img src={DropdownArrowImg} className="nf-profile__arrow" alt="" aria-hidden="true" />

              <div className="nf-dropdown">
                <span className="nf-dropdown__user" title={email ?? "Signed in"}>
                  {email ?? "Signed in"}
                </span>
                <div className="nf-dropdown__divider" />
                <Link to="/browse" className="nf-dropdown__item">
                  Home
                </Link>
                <Link to="/browse/series" className="nf-dropdown__item">
                  TV Shows
                </Link>
                <Link to="/browse/movies" className="nf-dropdown__item">
                  Movies
                </Link>
                <Link to="/browse/anime" className="nf-dropdown__item">
                  Anime
                </Link>
                <Link to="/browse/marvel" className="nf-dropdown__item">
                  Marvel
                </Link>
                {adultMode && (
                  <Link to="/browse/adult" className="nf-dropdown__item">
                    18+
                  </Link>
                )}
                <div className="nf-dropdown__divider" />
                <Link to="/browse/library" className="nf-dropdown__item">
                  My List
                </Link>
                <Link to="/browse/history" className="nf-dropdown__item">
                  Watch history
                </Link>
                <Link to="/dashboard" className="nf-dropdown__item">
                  My Streams
                </Link>
                <div className="nf-dropdown__divider" />
                <Link to="/browse/addons" className="nf-dropdown__item">
                  Add-ons
                </Link>
                <Link to="/browse/settings" className="nf-dropdown__item">
                  Settings
                </Link>
                <button type="button" className="nf-dropdown__item" onClick={() => void signOut()}>
                  Sign out
                </button>
              </div>
            </div>

            <div className="nf-theme" ref={themeMenuRef}>
              <button
                type="button"
                className="nf-theme__btn"
                aria-label="Change theme"
                aria-haspopup="menu"
                aria-expanded={themeMenuOpen}
                onClick={() => setThemeMenuOpen((open) => !open)}
              >
                <Palette aria-hidden="true" />
              </button>

              {themeMenuOpen && (
                <div className="nf-theme__menu" role="menu" aria-label="Theme">
                  {THEMES.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={theme === option.id}
                      className="nf-theme__item"
                      onClick={() => {
                        setTheme(option.id);
                        setThemeMenuOpen(false);
                      }}
                    >
                      <span className="nf-theme__swatch" aria-hidden="true">
                        {option.swatches.map((color, index) => (
                          <span key={index} style={{ background: color }} />
                        ))}
                      </span>
                      <span className="nf-theme__label">{option.label}</span>
                      {theme === option.id && (
                        <Check className="nf-theme__check" aria-hidden="true" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="nf-nav__center">
            <Link
              to="/browse/search"
              className="nf-nav__search"
              aria-label="Search movies and shows"
            >
              <img src={SearchIcon} className="nf-nav__search-icon" alt="" aria-hidden="true" />
            </Link>
            <Link
              to="/browse"
              className="nf-nav__link"
              activeOptions={{ exact: true }}
              activeProps={{ className: "is-active" }}
            >
              Home
            </Link>
            <Link
              to="/browse/series"
              className="nf-nav__link nf-nav__link--optional"
              activeProps={{ className: "is-active" }}
            >
              Shows
            </Link>
            <Link
              to="/browse/movies"
              className="nf-nav__link nf-nav__link--optional"
              activeProps={{ className: "is-active" }}
            >
              Movies
            </Link>
            <Link
              to="/browse/library"
              className="nf-nav__link nf-nav__link--optional"
              activeProps={{ className: "is-active" }}
            >
              My List
            </Link>
          </div>

          <div className="nf-nav__right">
            <Link to="/browse" className="nf-nav__mark" aria-label="MovieBox home" title="MovieBox">
              M
            </Link>
          </div>
        </div>
      </nav>

      {/* A <div>, not <main>: the browse layout already renders the page's <main>. */}
      <div className="nf-main">{children}</div>

      <footer className="nf-footer">
        <div className="nf-footer__copy">
          MovieBox · your personal cinema. Catalogs and streams come from the{" "}
          <Link to="/browse/addons" className="nf-footer__link">
            add-ons
          </Link>{" "}
          you install.
        </div>
      </footer>
    </div>
  );
}
