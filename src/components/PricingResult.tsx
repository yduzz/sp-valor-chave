import { formatCurrency } from "@/lib/mockData";
import { TrendingUp, Home, DollarSign } from "lucide-react";

interface PricingRange {
  min: number;
  avg: number;
  max: number;
}

interface PricingResultProps {
  sale: PricingRange;
  perSqm: PricingRange;
  rent: PricingRange;
}

function RangeCard({ title, icon: Icon, range, suffix }: { title: string; icon: typeof TrendingUp; range: PricingRange; suffix?: string }) {
  return (
    <div className="bg-card rounded-xl border border-border p-6 shadow-card-lg animate-fade-in">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <h3 className="font-display font-semibold text-foreground">{title}</h3>
      </div>
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Mínimo</span>
          <span className="font-semibold text-foreground">{formatCurrency(range.min)}{suffix}</span>
        </div>
        <div className="flex justify-between items-center bg-primary/5 -mx-3 px-3 py-2 rounded-lg">
          <span className="text-sm font-medium text-primary">Médio</span>
          <span className="font-bold text-lg text-primary">{formatCurrency(range.avg)}{suffix}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Máximo</span>
          <span className="font-semibold text-foreground">{formatCurrency(range.max)}{suffix}</span>
        </div>
      </div>
    </div>
  );
}

export default function PricingResult({ sale, perSqm, rent }: PricingResultProps) {
  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl font-bold text-foreground">Resultado da Avaliação — Valores 2026</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <RangeCard title="Valor de Venda" icon={Home} range={sale} />
        <RangeCard title="Valor por m²" icon={DollarSign} range={perSqm} suffix="/m²" />
        <RangeCard title="Locação Estimada" icon={TrendingUp} range={rent} suffix="/mês" />
      </div>
      <p className="text-xs text-muted-foreground text-center mt-2">
        Valores atualizados para 2026 com base nos índices IPCA e FIPEZAP. Estimativas sujeitas a variações de mercado.
      </p>
    </div>
  );
}
