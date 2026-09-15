import { formatCurrency } from "@/lib/mockData";
import type { RefinedPricing } from "@/lib/refinedPricing";
import { Info } from "lucide-react";
import type { ReactNode } from "react";

interface Props {
  refined: RefinedPricing;
}

function Row({
  label,
  range,
  suffix,
}: {
  label: ReactNode;
  range: { min: number; avg: number; max: number };
  suffix?: string;
}) {
  return (
    <div className="py-5">
      <p className="text-center text-sm md:text-base text-muted-foreground mb-3">
        {label}
      </p>
      <div className="grid grid-cols-3 items-center gap-3">
        <div className="text-center">
          <p className="text-base md:text-lg font-bold text-emerald-600">
            {formatCurrency(range.min)}
            {suffix}
          </p>
          <p className="text-xs text-emerald-600/80 mt-1">mínimo encontrado</p>
        </div>
        <div className="text-center">
          <p className="text-2xl md:text-3xl font-extrabold text-primary">
            {formatCurrency(range.avg)}
            {suffix}
          </p>
        </div>
        <div className="text-center">
          <p className="text-base md:text-lg font-bold text-rose-600">
            {formatCurrency(range.max)}
            {suffix}
          </p>
          <p className="text-xs text-rose-600/80 mt-1">máximo encontrado</p>
        </div>
      </div>
    </div>
  );
}

export default function RefinedPricingCard({ refined }: Props) {
  const ratio = refined.sale.avg > 0 ? refined.sale.avg / refined.perSqm.avg : 1;
  const rentPerSqm = {
    min: Math.round(refined.rent.min / Math.max(1, ratio)),
    avg: Math.round(refined.rent.avg / Math.max(1, ratio)),
    max: Math.round(refined.rent.max / Math.max(1, ratio)),
  };

  return (
    <div className="bg-card rounded-xl border border-border p-6 shadow-card-lg animate-fade-in">
      <h3 className="font-display text-lg font-semibold text-center text-foreground mb-2">
        Avaliação Refinada de Mercado
      </h3>

      <Row
        label={<>Valor estimado para <strong>VENDA</strong> é de:</>}
        range={refined.sale}
      />
      <div className="border-t border-border" />
      <Row label="Valor estimado por M² é de:" range={refined.perSqm} suffix="/m²" />
      <div className="border-t border-border" />
      <Row
        label={<>Valor estimado para <strong>LOCAÇÃO</strong> é de:</>}
        range={refined.rent}
      />
      <div className="border-t border-border" />
      <Row label="Valor estimado por M² é de:" range={rentPerSqm} suffix="/m²" />

      <div className="flex items-start gap-2 bg-muted/40 rounded-lg p-3 mt-4">
        <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground leading-relaxed">{refined.note}</p>
      </div>
    </div>
  );
}
