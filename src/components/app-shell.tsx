import { Link, useNavigate, useLocation } from "@tanstack/react-router";
import {
  Activity,
  BookOpen,
  LayoutDashboard,
  Settings as SettingsIcon,
  Stethoscope,
  Sparkles,
  TestTube2,
  LogOut,
  User as UserIcon,
  CalendarCheck,
  Menu,
  X,
  Mail,
} from "lucide-react";
import { useState, type ReactNode, useEffect } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { isSupabaseConfigured } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/bookings", label: "Bookings", icon: CalendarCheck },
  { to: "/send-email", label: "Send Email", icon: Mail },
  { to: "/analytics", label: "Analytics", icon: Activity },
  { to: "/services", label: "Services", icon: Sparkles },
  { to: "/knowledge", label: "Knowledge Base", icon: BookOpen },
  { to: "/doctors", label: "Doctors", icon: Stethoscope },
  { to: "/test-accounts", label: "Test Accounts", icon: TestTube2 },
  { to: "/settings", label: "Clinic Settings", icon: SettingsIcon },
] as const;

export function AppShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { user, role, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading) {
      if (!user && location.pathname !== "/login") {
        navigate({ to: "/login" });
      } else if (user && role === "staff") {
        const restricted = ["/settings", "/services", "/knowledge", "/doctors", "/test-accounts", "/analytics"];
        if (restricted.some((path) => location.pathname.startsWith(path))) {
          navigate({ to: "/bookings" });
        }
      }
    }
  }, [user, role, loading, location.pathname, navigate]);

  const visibleNav = NAV.filter(({ to }) => {
    if (role === "staff") {
      const allowed = ["/", "/bookings", "/send-email"];
      return allowed.includes(to);
    }
    return true;
  });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-2">
          <Stethoscope className="h-10 w-10 animate-pulse text-primary" />
          <span className="text-sm text-muted-foreground">Checking authentication...</span>
        </div>
      </div>
    );
  }

  if (!user && location.pathname !== "/login") {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Sidebar (lg screens) */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar px-3 py-5 lg:flex">
        <div className="flex items-center gap-2 px-2 pb-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Stethoscope className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-sidebar-foreground">Dental AI</p>
            <p className="text-xs text-muted-foreground">Receptionist console</p>
          </div>
        </div>

        {/* User Card */}
        {user && (
          <div className="mb-4 rounded-lg bg-sidebar-accent/50 p-3 border border-sidebar-border/30">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 border border-slate-700">
                <UserIcon className="h-4 w-4 text-slate-300" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-sidebar-foreground">
                  {user.email}
                </p>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    role === 'admin' 
                      ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' 
                      : 'bg-sky-500/10 text-sky-500 border border-sky-500/20'
                  }`}>
                    {role === 'admin' ? 'Admin' : 'Staff'}
                  </span>
                </div>
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={signOut}
              className="w-full justify-start h-8 px-2 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/5"
            >
              <LogOut className="mr-2 h-3.5 w-3.5" />
              Sign Out
            </Button>
          </div>
        )}

        <nav className="flex flex-1 flex-col gap-0.5">
          {visibleNav.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === "/" }}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              activeProps={{
                className: "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
              }}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
        <p className="px-2.5 text-xs text-muted-foreground">
          {isSupabaseConfigured ? "Database connected" : "Database not connected"}
        </p>
      </aside>

      {/* Mobile Drawer (Menu Overlay) */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-sidebar-border bg-sidebar px-3 py-5 transition-transform duration-300 ease-in-out lg:hidden ${
        mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      }`}>
        <div className="flex items-center justify-between px-2 pb-6 border-b border-sidebar-border/40">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Stethoscope className="h-4 w-4" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-sidebar-foreground">Dental AI</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMobileMenuOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* User Card */}
        {user && (
          <div className="my-4 rounded-lg bg-sidebar-accent/50 p-3 border border-sidebar-border/30">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 border border-slate-700">
                <UserIcon className="h-4 w-4 text-slate-300" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-sidebar-foreground">
                  {user.email}
                </p>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    role === 'admin' 
                      ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' 
                      : 'bg-sky-500/10 text-sky-500 border border-sky-500/20'
                  }`}>
                    {role === 'admin' ? 'Admin' : 'Staff'}
                  </span>
                </div>
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => {
                setMobileMenuOpen(false);
                signOut();
              }}
              className="w-full justify-start h-8 px-2 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/5"
            >
              <LogOut className="mr-2 h-3.5 w-3.5" />
              Sign Out
            </Button>
          </div>
        )}

        <nav className="flex flex-1 flex-col gap-0.5">
          {visibleNav.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              onClick={() => setMobileMenuOpen(false)}
              activeOptions={{ exact: to === "/" }}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              activeProps={{
                className: "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
              }}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
          <div className="flex items-center justify-between px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden h-9 w-9 text-muted-foreground"
              >
                <Menu className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-base font-semibold sm:text-lg">{title}</h1>
                {description ? (
                  <p className="hidden sm:block text-xs text-muted-foreground">{description}</p>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {actions}
              <ThemeToggle />
            </div>
          </div>
        </header>

        <main className="px-4 py-4 sm:px-6 sm:py-6">
          {!isSupabaseConfigured ? (
            <div className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
              <p className="font-medium">Database not connected</p>
              <p className="text-muted-foreground">
                Add your project URL and publishable (anon) key as{" "}
                <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> to see
                live data.
              </p>
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}
