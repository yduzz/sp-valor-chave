import { useNavigate } from "react-router-dom";
import { Building2, TrendingUp, Shield, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import AddressSearch from "@/components/AddressSearch";
import Header from "@/components/Header";

const features = [
  { icon: Building2, title: "Dados Oficiais", desc: "Valores venais direto da Prefeitura de São Paulo" },
  { icon: TrendingUp, title: "Atualização 2026", desc: "Valores corrigidos por IPCA e FIPEZAP" },
  { icon: Shield, title: "Comparáveis Reais", desc: "Imóveis do mesmo endereço exato" },
  { icon: Zap, title: "Resultado Instantâneo", desc: "Avaliação de venda e locação em segundos" },
];

export default function Index() {
  const navigate = useNavigate();

  const handleSearch = (address: string) => {
    if (address.trim()) {
      navigate(`/resultado?q=${encodeURIComponent(address)}`);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 gradient-hero opacity-[0.03]" />
        <div className="container py-20 md:py-32 flex flex-col items-center text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-6 animate-fade-in">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-soft" />
            Plataforma de precificação imobiliária
          </div>

          <h1 className="font-display text-4xl md:text-6xl font-bold text-foreground leading-tight max-w-3xl animate-fade-in" style={{ animationDelay: "100ms" }}>
            Avalie imóveis em{" "}
            <span className="text-gradient">São Paulo</span>{" "}
            com precisão
          </h1>

          <p className="mt-5 text-lg text-muted-foreground max-w-xl animate-fade-in" style={{ animationDelay: "200ms" }}>
            Precificação inteligente com dados da Prefeitura de SP, atualizada para valores de 2026.
          </p>

          <div className="mt-10 w-full flex flex-col items-center gap-4 animate-slide-up" style={{ animationDelay: "300ms" }}>
            <AddressSearch onSelect={handleSearch} onSearch={handleSearch} />
            <Button variant="hero" size="lg" onClick={() => handleSearch("Rua Cardeal Arcoverde 1070")} className="px-8">
              Avaliar Exemplo
            </Button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {features.map((f, i) => (
            <div
              key={f.title}
              className="bg-card rounded-xl border border-border p-6 shadow-card hover:shadow-card-lg transition-shadow animate-fade-in"
              style={{ animationDelay: `${400 + i * 100}ms` }}
            >
              <div className="p-2.5 rounded-lg bg-primary/10 w-fit mb-4">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-display font-semibold text-foreground mb-1">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="container text-center text-sm text-muted-foreground">
          © 2026 SP Valuation — Dados públicos da Prefeitura de São Paulo
        </div>
      </footer>
    </div>
  );
}
