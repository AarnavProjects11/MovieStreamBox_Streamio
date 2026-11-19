import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Home,
  Film,
  Tv,
  Search,
  Puzzle,
  Bookmark,
  History,
  Settings,
  LayoutGrid,
  Shield,
  Sparkles,
  Lock,
  LogOut,
  UserRound,
} from "lucide-react";
import { ThemePicker } from "@/components/theme-picker";
import { BrowseKeyboard, CommandHint } from "@/components/browse/keyboard";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { setAdultMode, useAdultMode } from "@/lib/adult-flags";
import { useTheme } from "@/hooks/use-theme";

export const Route = createFileRoute("/_authenticated/browse")({
  component: BrowseLayout,
});

const NAV = [
  { to: "/browse", label: "Home", icon: Home, exact: true },
  { to: "/browse/movies", label: "Movies", icon: Film },
  { to: "/browse/series", label: "TV Shows", icon: Tv },
  { to: "/browse/marvel", label: "Marvel", icon: Shield },
  { to: "/browse/anime", label: "Anime", icon: Sparkles },
  { to: "/browse/search", label: "Search", icon: Search },
  { to: "/browse/library", label: "Library", icon: Bookmark },
  { to: "/browse/history", label: "History", icon: History },
  { to: "/browse/addons", label: "Add-ons", icon: Puzzle },
  { to: "/browse/settings", label: "Settings", icon: Settings },
] as const;

/** The 18+ entry appears in the nav only after the age gate is accepted. */
function AdultNavLink() {
  const adultMode = useAdultMode();
  if (!adultMode) return null;

  return (
    <Link
      to="/browse/adult"
      activeProps={{ className: "bg-primary text-primary-foreground" }}
      inactiveProps={{ className: "text-muted-foreground hover:text-foreground" }}
      aria-label="18+"
      className="inline-flex shrink-0 items-center gap-1 rounded-lg px-1 py-1.5 text-xs font-semibold outline-none focus-visible:ring-4 focus-visible:ring-primary"
    >
      <Lock className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">18+</span>
    </Link>
  );
}

function ProfileMenu() {
  const navigate = useNavigate();
  const adultMode = useAdultMode();
  const [email, setEmail] = useState<string | null>(null);
  const [askAge, setAskAge] = useState(false);

  useEffect(() => {
    supabase.auth
      .getUser()
      .then(({ data }) => setEmail(data.user?.email ?? null))
      .catch(() => setEmail(null));
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  const initial = (email?.trim()?.[0] ?? "?").toUpperCase();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label="Account menu"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground outline-none focus-visible:ring-4 focus-visible:ring-primary"
          >
            {email ? initial : <UserRound className="h-4 w-4" />}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
            {email ?? "Signed in"}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              if (adultMode) setAdultMode(false);
              else setAskAge(true);
            }}
          >
            <Lock className="mr-2 h-4 w-4 text-pink-500" />
            18+ content
            <span
              className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                adultMode
                  ? "bg-pink-600 text-pink-50"
                  : "border border-border text-muted-foreground"
              }`}
            >
              {adultMode ? "On" : "Off"}
            </span>
          </DropdownMenuItem>

          {adultMode && (
            <DropdownMenuItem asChild>
              <Link to="/browse/adult">
                <Lock className="mr-2 h-4 w-4" />
                18+ section
              </Link>
            </DropdownMenuItem>
          )}

          <DropdownMenuItem asChild>
            <Link to="/browse/addons">
              <Puzzle className="mr-2 h-4 w-4" />
              Add-ons
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/dashboard">
              <LayoutGrid className="mr-2 h-4 w-4" />
              My Streams
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/browse/settings">
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Link>
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void signOut()} className="text-destructive">
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={askAge} onOpenChange={setAskAge}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-pink-500" /> Are you 18 or older?
            </DialogTitle>
            <DialogDescription className="pt-1 leading-relaxed">
              The 18+ section shows adult catalogs from add-ons you mark as adult. Confirm your age
              to add it to the menu. You can turn it off again from this profile menu at any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <button
              onClick={() => setAskAge(false)}
              className="rounded-lg border border-border px-4 py-2 text-sm font-semibold outline-none focus-visible:ring-4 focus-visible:ring-primary"
            >
              No, take me back
            </button>
            <button
              onClick={() => {
                setAdultMode(true);
                setAskAge(false);
              }}
              className="rounded-lg bg-pink-600 px-4 py-2 text-sm font-semibold text-pink-50 outline-none focus-visible:ring-4 focus-visible:ring-pink-500"
            >
              Yes, I&apos;m 18+
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function BrowseLayout() {
  const { theme } = useTheme();
  const { pathname } = useLocation();
  const isNetflix = theme === "netflix";
  // Only the Netflix home page is edge-to-edge; every other page keeps the column.
  const isFullBleed = isNetflix && /^\/browse\/?$/.test(pathname);

  return (
    <BrowseKeyboard>
      <div className="min-h-screen bg-background text-foreground">
        {!isNetflix && (
          <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
            <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-3">
              <Link
                to="/browse"
                className="font-display text-xl brand-gradient shrink-0 rounded focus-visible:ring-4 focus-visible:ring-primary"
              >
                STREAM BOX
              </Link>
              <nav className="flex flex-1 gap-0.5 overflow-x-auto [scrollbar-width:none]">
                {NAV.map((n) => (
                  <Link
                    key={n.to}
                    to={n.to}
                    activeOptions={{ exact: "exact" in n }}
                    activeProps={{ className: "bg-primary text-primary-foreground" }}
                    inactiveProps={{ className: "text-muted-foreground hover:text-foreground" }}
                    aria-label={n.label}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg px-1 py-1.5 text-xs font-semibold outline-none focus-visible:ring-4 focus-visible:ring-primary"
                  >
                    <n.icon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{n.label}</span>
                  </Link>
                ))}
                <AdultNavLink />
              </nav>
              <Link
                to="/dashboard"
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-1.5 py-1.5 text-xs font-semibold focus-visible:ring-4 focus-visible:ring-primary"
                aria-label="My streams"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">My Streams</span>
              </Link>
              <CommandHint />
              <ThemePicker />
              <ProfileMenu />
            </div>
          </header>
        )}
        <main className={isFullBleed ? undefined : "mx-auto max-w-7xl px-4 py-6"}>
          <Outlet />
        </main>
      </div>
    </BrowseKeyboard>
  );
}
