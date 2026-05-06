import { formatCurrency } from "@/lib/mockData";
import type { MarketValuationResult } from "@/lib/marketValuation";
import { TrendingUp, ShieldCheck, BarChart2, Info } from "lucide-react";

interface MarketValuationCardProps {
  valuation: MarketValuationResult;
}

export default function MarketValuationCard({ valuation }: MarketValuationCardProps) {
  const { estimated, perSqm, range, sources, explanation } = valuation;

  return (
    <div className="bg-card rounded-xl border border-border p-6 shadow-card-lg animate-fade-in space-y-5">
      <div className="flex items-center gap-2">
        <div className="p-2 rounded-lg bg-primary/10">
          <ShieldCheck className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="font-display font-semibold text-foreground">
            Avaliação Cruzada de Mercado
          </h3>
          <p className="text-xs text-muted-foreground">
            FipeZAP · CRECI-SP · IBRESP
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-primary/5 rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">Valor Estimado</p>
          <p className="text-2xl font-bold text-primary">{formatCurrency(estimated)}</p>
        </div>
        <div className="bg-muted/40 rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">Preço por m²</p>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(perSqm)}</p>
        </div>
        <div className="bg-muted/40 rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">Faixa de Confiança</p>
          <p className="text-sm font-semibold text-foreground">
            {formatCurrency(range.min)} — {formatCurrency(range.max)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">±10%</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-border">
        <div className="flex items-start gap-2">
          <TrendingUp className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-foreground">FipeZAP</p>
            <p className="text-xs text-muted-foreground">
              Valorização: {((sources.fipezap.factor - 1) * 100).toFixed(1)}% em{" "}
              {sources.fipezap.yearsApplied} ano(s)
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <BarChart2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-foreground">CRECI-SP</p>
            <p className="text-xs text-muted-foreground">
              Ref. atual: {formatCurrency(sources.creci.referencePerSqm)}/m²
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <ShieldCheck className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-foreground">IBRESP</p>
            <p className="text-xs text-muted-foreground">
              Tendência: {sources.ibresp.trendFactor.toFixed(3)}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-2 bg-muted/30 rounded-lg p-3">
        <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground leading-relaxed">{explanation}</p>
      </div>
    </div>
  );
}
