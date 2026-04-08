import { useState, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { mockProperties, calculatePricing } from "@/lib/mockData";
import ComparableTable from "@/components/ComparableTable";
import PricingResult from "@/components/PricingResult";
import AddressSearch from "@/components/AddressSearch";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BarChart3 } from "lucide-react";

export default function ResultPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const query = searchParams.get("q") || "";

  const [selected, setSelected] = useState<string[]>([]);
  const [showResult, setShowResult] = useState(false);

  const properties = useMemo(() => {
    return mockProperties.filter((p) =>
      p.address.toLowerCase().includes(query.toLowerCase().split(" ").slice(0, 3).join(" ").toLowerCase())
    );
  }, [query]);

  const pricing = useMemo(() => {
    if (selected.length === 0) return null;
    const selectedProps = properties.filter((p) => selected.includes(p.id));
    return calculatePricing(selectedProps);
  }, [selected, properties]);

  const handleToggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : prev.length < 3 ? [...prev, id] : prev
    );
    setShowResult(false);
  };

  const handleSearch = (address: string) => {
    if (address.trim()) {
      navigate(`/resultado?q=${encodeURIComponent(address)}`);
      setSelected([]);
      setShowResult(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="container py-8 space-y-8">
        {/* Back + Search */}
        <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="shrink-0">
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <AddressSearch onSelect={handleSearch} onSearch={handleSearch} />
        </div>

        {/* Info */}
        <div className="animate-fade-in">
          <h1 className="font-display text-2xl font-bold text-foreground">
            Resultados para: <span className="text-primary">{query}</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {properties.length} imóvel(is) encontrado(s) — Selecione até 3 comparáveis
          </p>
        </div>

        {/* Table */}
        {properties.length > 0 ? (
          <ComparableTable
            properties={properties}
            selected={selected}
            onToggle={handleToggle}
            maxSelection={3}
          />
        ) : (
          <div className="text-center py-16 bg-card rounded-xl border border-border">
            <p className="text-muted-foreground">Nenhum imóvel encontrado para este endereço.</p>
            <p className="text-sm text-muted-foreground mt-1">Tente buscar por "Rua Cardeal Arcoverde 1070"</p>
          </div>
        )}

        {/* Evaluate button */}
        {selected.length > 0 && !showResult && (
          <div className="flex justify-center animate-fade-in">
            <Button variant="hero" size="lg" onClick={() => setShowResult(true)} className="gap-2">
              <BarChart3 className="h-5 w-5" />
              Gerar Avaliação ({selected.length} selecionado{selected.length > 1 ? "s" : ""})
            </Button>
          </div>
        )}

        {/* Result */}
        {showResult && pricing && <PricingResult sale={pricing.sale} perSqm={pricing.perSqm} rent={pricing.rent} />}
      </div>
    </div>
  );
}
