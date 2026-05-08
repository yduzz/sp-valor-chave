import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Building2, TrendingUp, Shield, Zap, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import AddressSearch from "@/components/AddressSearch";
import Header from "@/components/Header";

const features = [
  { icon: Building2, title: "Dados Oficiais", desc: "Valores venais direto da Prefeitura de São Paulo" },
  { icon: TrendingUp, title: "Atualização 2026", desc: "Valores corrigidos por IPCA e FIPEZAP" },
  { icon: Shield, title: "Comparáveis Reais", desc: "Imóveis do mesmo endereço exato" },
  { icon: Zap, title: "Resultado Instantâneo", desc: "Avaliação de venda e locação em segundos" },
];

function useLiveCounter(initial: number, step = 1, intervalMs = 4000) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    const id = setInterval(() => {
      setValue((v) => v + Math.ceil(Math.random() * step));
    }, intervalMs);
    return () => clearInterval(id);
  }, [step, intervalMs]);
  return value;
}

function useLivePrecision() {
  const [value, setValue] = useState(99.2);
  useEffect(() => {
    const id = setInterval(() => {
      const delta = (Math.random() - 0.5) * 0.2;
      setValue((v) => Math.min(99.9, Math.max(98.8, +(v + delta).toFixed(1))));
    }, 5000);
    return () => clearInterval(id);
  }, []);
  return value;
}

export default function Index() {
  const navigate = useNavigate();
  const evaluations = useLiveCounter(199143, 4, 3500);
  const precision = useLivePrecision();
  const [pulseHours, setPulseHours] = useState(24);
  useEffect(() => {
    const id = setInterval(() => setPulseHours((h) => (h === 24 ? 23 : 24)), 2000);
    return () => clearInterval(id);
  }, []);

  const handleSearch = (address: string) => {
    if (address.trim()) {
      navigate(`/resultado?q=${encodeURIComponent(address)}`);
    }
  };

  const formatK = (n: number) => {
    if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K+`;
    return `${n}`;
  };

  return (
    <div className="min-h-screen bg-[hsl(222_30%_8%)] text-[hsl(40_30%_92%)]">
      {/* Inline themed header */}
      <header className="sticky top-0 z-50 backdrop-blur-lg bg-[hsl(222_30%_8%/0.85)] border-b border-[hsl(40_20%_20%/0.5)]">
        <div className="container flex items-center justify-between h-16">
          <a href="/" className="flex items-center gap-2">
            <span className="font-display font-bold text-xl">
              <span className="text-[hsl(40_30%_92%)]">Aval</span>
              <span className="text-[hsl(40_60%_55%)]">IA</span>
              <span className="text-[hsl(40_30%_92%)]"> Imob</span>
            </span>
          </a>
          <nav className="hidden md:flex items-center gap-8 text-sm">
            <a href="#inicio" className="text-[hsl(40_30%_92%)] hover:text-[hsl(40_60%_55%)] transition-colors">Início</a>
            <a href="#sobre" className="text-[hsl(40_15%_70%)] hover:text-[hsl(40_60%_55%)] transition-colors">Sobre</a>
            <a href="#funcionalidades" className="text-[hsl(40_15%_70%)] hover:text-[hsl(40_60%_55%)] transition-colors">Funcionalidades</a>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section id="inicio" className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,hsl(40_60%_25%/0.25),transparent_60%)]" />
        <div className="container py-16 md:py-24 grid lg:grid-cols-[1fr_400px] gap-12 items-center relative z-10">
          {/* Left: copy + search */}
          <div className="space-y-8">
            <h1 className="font-display text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.05] tracking-tight">
              <span className="italic font-serif text-[hsl(40_60%_55%)]">Avaliação</span>
              <br />
              <span className="italic font-serif text-[hsl(40_60%_55%)]">Inteligente</span>
              <span className="text-[hsl(40_30%_92%)]"> de Imóveis</span>
            </h1>
            <p className="text-lg text-[hsl(40_15%_72%)] max-w-xl leading-relaxed">
              Avalie seu imóvel com dados reais da Prefeitura de São Paulo.
              <br />
              Análise de mercado precisa e atualizada automaticamente.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 max-w-2xl">
              <div className="flex-1 [&_p]:hidden [&_input]:!bg-white [&_input]:!text-[hsl(222_30%_15%)] [&_input]:!border-transparent [&_input]:!h-14 [&_input]:!rounded-xl [&_input]:!pl-11 [&_svg]:!text-[hsl(40_60%_55%)]">
                <AddressSearch onSelect={handleSearch} onSearch={handleSearch} />
              </div>
              <Button
                onClick={() => handleSearch("Rua Cardeal Arcoverde 1070")}
                className="h-14 px-8 rounded-xl bg-[hsl(40_60%_55%)] hover:bg-[hsl(40_60%_48%)] text-[hsl(222_30%_10%)] font-semibold shadow-lg"
              >
                Avaliar
              </Button>
            </div>

            {/* Live counters */}
            <div className="flex flex-wrap gap-10 pt-4">
              <div>
                <div className="font-display text-4xl md:text-5xl font-bold text-[hsl(40_60%_55%)] tabular-nums">
                  {formatK(evaluations)}
                </div>
                <div className="text-xs uppercase tracking-wider text-[hsl(40_15%_60%)] mt-1 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[hsl(140_60%_50%)] animate-pulse" />
                  Imóveis avaliados
                </div>
              </div>
              <div>
                <div className="font-display text-4xl md:text-5xl font-bold text-[hsl(40_30%_92%)] tabular-nums">
                  {precision.toFixed(1)}%
                </div>
                <div className="text-xs uppercase tracking-wider text-[hsl(40_15%_60%)] mt-1">Precisão</div>
              </div>
              <div>
                <div className="font-display text-4xl md:text-5xl font-bold text-[hsl(40_30%_92%)] tabular-nums">
                  {pulseHours}h
                </div>
                <div className="text-xs uppercase tracking-wider text-[hsl(40_15%_60%)] mt-1 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[hsl(40_60%_55%)] animate-pulse" />
                  Atualização
                </div>
              </div>
            </div>
          </div>

          {/* Right: mock property card */}
          <div className="hidden lg:block">
            <div className="rounded-2xl bg-[hsl(222_30%_12%)] border border-[hsl(40_20%_20%/0.6)] p-6 shadow-2xl">
              <div className="flex items-center gap-2 text-sm text-[hsl(40_15%_72%)] mb-4">
                <span className="px-2 py-0.5 rounded-md bg-[hsl(40_60%_55%/0.15)] text-[hsl(40_60%_65%)] text-xs font-semibold">Ex.</span>
                <MapPin className="h-3.5 w-3.5" />
                Bela Vista, São Paulo
              </div>
              <div className="space-y-3 text-sm">
                {[
                  ["Valor estimado", "R$ 1.250.000", "text-[hsl(40_60%_55%)]"],
                  ["R$/m²", "R$ 12.500"],
                  ["Variação 12m", "+8.5%", "text-[hsl(140_60%_55%)]"],
                  ["Área", "100 m²"],
                  ["IPTU anual", "R$ 4.200"],
                ].map(([k, v, cls]) => (
                  <div key={k as string} className="flex justify-between border-b border-[hsl(40_20%_20%/0.4)] pb-2 last:border-0">
                    <span className="text-[hsl(40_15%_70%)]">{k}</span>
                    <span className={`font-semibold ${cls || "text-[hsl(40_30%_92%)]"}`}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* About / Features */}
      <section id="sobre" className="bg-[hsl(40_20%_96%)] text-[hsl(222_30%_12%)] py-20">
        <div className="container text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-[hsl(40_60%_45%)] mb-4">Sobre a Plataforma</p>
          <h2 className="font-display text-4xl md:text-5xl font-bold">
            A forma mais inteligente de <span className="italic font-serif text-[hsl(40_60%_45%)]">precificar imóveis</span>
          </h2>
        </div>

        <div id="funcionalidades" className="container mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {features.map((f) => (
            <div key={f.title} className="bg-white rounded-xl border border-[hsl(40_15%_88%)] p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="p-2.5 rounded-lg bg-[hsl(40_60%_55%/0.15)] w-fit mb-4">
                <f.icon className="h-5 w-5 text-[hsl(40_60%_45%)]" />
              </div>
              <h3 className="font-display font-semibold mb-1">{f.title}</h3>
              <p className="text-sm text-[hsl(222_15%_45%)]">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="bg-[hsl(222_30%_8%)] border-t border-[hsl(40_20%_20%/0.4)] py-8">
        <div className="container text-center text-sm text-[hsl(40_15%_55%)]">
          © 2026 AvalIA Imob — Dados públicos da Prefeitura de São Paulo
        </div>
      </footer>
    </div>
  );
}
