import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
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

/** Live counter that cycles increment steps 1 → 2 → 4 → 1 ... to feel organic. */
function useLiveEvaluations(initial: number) {
  const [value, setValue] = useState(initial);
  const stepRef = useRef(0);
  useEffect(() => {
    const steps = [1, 2, 4];
    const id = setInterval(() => {
      const inc = steps[stepRef.current % steps.length];
      stepRef.current += 1;
      setValue((v) => v + inc);
    }, 1800);
    return () => clearInterval(id);
  }, []);
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
  const evaluations = useLiveEvaluations(199143);
  const precision = useLivePrecision();

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
    <div className="min-h-screen bg-white">
      <Header />

      {/* Hero */}
      <section id="inicio" className="relative overflow-hidden bg-[hsl(var(--c21-black))] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,hsl(var(--c21-gold)/0.18),transparent_60%)]" />
        <div className="container py-16 md:py-24 grid lg:grid-cols-[1fr_400px] gap-12 items-center relative z-10">
          {/* Left: copy + search */}
          <div className="space-y-8">
            <h1 className="font-display text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.05] tracking-tight">
              <span className="italic font-serif text-[hsl(var(--c21-gold))]">Avaliação</span>
              <br />
              <span className="italic font-serif text-[hsl(var(--c21-gold))]">Inteligente</span>
              <span className="text-white"> de Imóveis</span>
            </h1>
            <p className="text-lg text-white/75 max-w-xl leading-relaxed">
              Avalie seu imóvel com dados reais da Prefeitura de São Paulo.
              <br />
              Análise de mercado precisa e atualizada automaticamente.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 max-w-2xl items-start">
              <div className="flex-1 w-full">
                <AddressSearch onSelect={handleSearch} onSearch={handleSearch} />
              </div>
              <Button
                onClick={() => handleSearch("Rua Cardeal Arcoverde 1070")}
                className="h-14 px-8 rounded-xl bg-[hsl(var(--c21-gold))] hover:bg-[hsl(var(--c21-gold)/0.9)] text-[hsl(var(--c21-black))] font-semibold shadow-lg mt-9"
              >
                Avaliar
              </Button>
            </div>

            {/* Live counters */}
            <div className="flex flex-wrap gap-10 pt-4">
              <div>
                <div className="font-display text-4xl md:text-5xl font-bold text-[hsl(var(--c21-gold))] tabular-nums">
                  {formatK(evaluations)}
                </div>
                <div className="text-xs uppercase tracking-wider text-white/60 mt-1 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[hsl(140_60%_50%)] animate-pulse" />
                  Imóveis avaliados
                </div>
              </div>
              <div>
                <div className="font-display text-4xl md:text-5xl font-bold text-white tabular-nums">
                  {precision.toFixed(1)}%
                </div>
                <div className="text-xs uppercase tracking-wider text-white/60 mt-1">Precisão</div>
              </div>
              <div>
                <div className="font-display text-4xl md:text-5xl font-bold text-white tabular-nums">
                  24h
                </div>
                <div className="text-xs uppercase tracking-wider text-white/60 mt-1">Atualização</div>
              </div>
            </div>
          </div>

          {/* Right: mock property card */}
          <div className="hidden lg:block">
            <div className="rounded-2xl bg-white/5 backdrop-blur border border-white/10 p-6 shadow-2xl">
              <div className="flex items-center gap-2 text-sm text-white/75 mb-4">
                <span className="px-2 py-0.5 rounded-md bg-[hsl(var(--c21-gold)/0.2)] text-[hsl(var(--c21-gold))] text-xs font-semibold">Ex.</span>
                <MapPin className="h-3.5 w-3.5" />
                Bela Vista, São Paulo
              </div>
              <div className="space-y-3 text-sm">
                {[
                  ["Valor estimado", "R$ 1.250.000", "text-[hsl(var(--c21-gold))]"],
                  ["R$/m²", "R$ 12.500"],
                  ["Variação 12m", "+8.5%", "text-[hsl(140_60%_55%)]"],
                  ["Área", "100 m²"],
                  ["IPTU anual", "R$ 4.200"],
                ].map(([k, v, cls]) => (
                  <div key={k as string} className="flex justify-between border-b border-white/10 pb-2 last:border-0">
                    <span className="text-white/70">{k}</span>
                    <span className={`font-semibold ${cls || "text-white"}`}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* About / Features */}
      <section id="sobre" className="bg-white text-foreground py-20">
        <div className="container text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-[hsl(var(--c21-gold))] mb-4">Sobre a Plataforma</p>
          <h2 className="font-display text-4xl md:text-5xl font-bold">
            A forma mais inteligente de <span className="italic font-serif text-[hsl(var(--c21-gold))]">precificar imóveis</span>
          </h2>
        </div>

        <div id="funcionalidades" className="container mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {features.map((f) => (
            <div key={f.title} className="bg-white rounded-xl border border-border p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="p-2.5 rounded-lg bg-[hsl(var(--c21-gold)/0.15)] w-fit mb-4">
                <f.icon className="h-5 w-5 text-[hsl(var(--c21-gold))]" />
              </div>
              <h3 className="font-display font-semibold mb-1">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="bg-[hsl(var(--c21-black))] border-t border-white/10 py-8">
        <div className="container text-center text-sm text-white/55">
          © 2026 AvalIA Imob — Dados públicos da Prefeitura de São Paulo
        </div>
      </footer>
    </div>
  );
}
