import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { searchProperties, saveEvaluation, type Property } from "@/lib/supabaseQueries";
import { calculatePricing, formatCurrency } from "@/lib/mockData";
import ComparableTable from "@/components/ComparableTable";
import PricingResult from "@/components/PricingResult";
import MarketValuationCard from "@/components/MarketValuationCard";
import { aggregateMarketValuation, type MarketValuationResult } from "@/lib/marketValuation";
import AddressSearch from "@/components/AddressSearch";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BarChart3, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function ResultPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const query = searchParams.get("q") || "";

  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [pricing, setPricing] = useState<ReturnType<typeof calculatePricing> | null>(null);
  const [marketValuation, setMarketValuation] = useState<MarketValuationResult | null>(null);

  useEffect(() => {
    if (!query) return;
    setLoading(true);
    setSelected([]);
    setShowResult(false);
    setPricing(null);

    searchProperties(query)
      .then(setProperties)
      .catch(() => toast.error("Erro ao buscar imóveis"))
      .finally(() => setLoading(false));
  }, [query]);

  const handleToggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : prev.length < 3 ? [...prev, id] : prev
    );
    setShowResult(false);
  };

  const handleCalculate = async () => {
    const selectedProps = properties.filter((p) => selected.includes(p.id));
    const mapped = selectedProps.map((p) => ({
      id: p.id,
      address: p.address,
      neighborhood: p.neighborhood || "",
      area: Number(p.area) || 0,
      venalValue: Number(p.venal_value),
      type: p.property_type || "",
      year: p.year,
      fiscalZone: p.fiscal_zone || "",
      pricePerSqm: Number(p.price_per_sqm) || 0,
    }));

    const result = calculatePricing(mapped);
    setPricing(result);

    // Camada de validação cruzada FipeZAP + CRECI + IBRESP
    const valuation = aggregateMarketValuation(
      mapped
        .filter((m) => m.area > 0 && m.pricePerSqm > 0)
        .map((m) => ({
          area: m.area,
          pricePerSqmBase: m.pricePerSqm,
          baseYear: m.year,
          neighborhood: m.neighborhood,
        })),
    );
    setMarketValuation(valuation);
    setShowResult(true);

    // Save evaluation to history
    try {
      await saveEvaluation({
        address: query,
        selected_property_ids: selected,
        sale: result.sale,
        perSqm: result.perSqm,
        rent: result.rent,
      });
    } catch {
      // silent - history save is non-critical
    }
  };

  const handleSearch = (address: string) => {
    if (address.trim()) {
      navigate(`/resultado?q=${encodeURIComponent(address)}`);
    }
  };

  const mappedForTable = properties.map((p) => ({
    id: p.id,
    address: p.address,
    neighborhood: p.neighborhood || "",
    area: Number(p.area) || 0,
    venalValue: Number(p.venal_value),
    type: p.property_type || "",
    year: p.year,
    fiscalZone: p.fiscal_zone || "",
    pricePerSqm: Number(p.price_per_sqm) || 0,
  }));

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container py-8 space-y-8">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="shrink-0">
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <AddressSearch onSelect={handleSearch} onSearch={handleSearch} />
        </div>

        <div className="animate-fade-in">
          <h1 className="font-display text-2xl font-bold text-foreground">
            Resultados para: <span className="text-primary">{query}</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {loading ? "Buscando..." : `${properties.length} imóvel(is) encontrado(s) — Selecione até 3 comparáveis`}
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : properties.length > 0 ? (
          <ComparableTable properties={mappedForTable} selected={selected} onToggle={handleToggle} maxSelection={3} />
        ) : (
          <div className="text-center py-16 bg-card rounded-xl border border-border">
            <p className="text-muted-foreground">Nenhum imóvel encontrado para este endereço.</p>
            <p className="text-sm text-muted-foreground mt-1">Tente outro endereço de São Paulo ou refine a busca com o número do imóvel.</p>
          </div>
        )}

        {selected.length > 0 && !showResult && (
          <div className="flex justify-center animate-fade-in">
            <Button variant="hero" size="lg" onClick={handleCalculate} className="gap-2">
              <BarChart3 className="h-5 w-5" />
              Calcular valor presente 2026 ({selected.length} selecionado{selected.length > 1 ? "s" : ""})
            </Button>
          </div>
        )}

        {showResult && pricing && <PricingResult sale={pricing.sale} perSqm={pricing.perSqm} rent={pricing.rent} />}
      </div>
    </div>
  );
}
