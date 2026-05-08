import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const links = [
    { to: "/", label: "Início" },
    { to: "/#sobre", label: "Sobre" },
    { to: "/#funcionalidades", label: "Funcionalidades" },
  ];

  const isActive = (to: string) => to === "/" && location.pathname === "/";

  return (
    <header className="sticky top-0 z-50 bg-[hsl(var(--c21-black))] text-white border-b border-[hsl(var(--c21-gold)/0.3)]">
      <div className="container flex items-center justify-between h-16">
        <Link to="/" className="flex items-center gap-2">
          <span className="font-display font-bold text-xl tracking-tight">
            <span className="text-white">Aval</span>
            <span className="text-[hsl(var(--c21-gold))]">IA</span>
            <span className="text-white"> Imob</span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={`transition-colors ${
                isActive(l.to)
                  ? "text-[hsl(var(--c21-gold))]"
                  : "text-white/80 hover:text-[hsl(var(--c21-gold))]"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <Button
          variant="ghost"
          size="icon"
          className="md:hidden text-white hover:bg-white/10 hover:text-[hsl(var(--c21-gold))]"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-[hsl(var(--c21-gold)/0.3)] bg-[hsl(var(--c21-black))] p-4 space-y-1">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              onClick={() => setMobileOpen(false)}
              className="block px-3 py-2.5 rounded-md text-sm font-medium text-white/80 hover:text-[hsl(var(--c21-gold))] hover:bg-white/5"
            >
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
