import { type PropertyData, formatCurrency } from "@/lib/mockData";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

interface ComparableTableProps {
  properties: PropertyData[];
  selected: string[];
  onToggle: (id: string) => void;
  maxSelection: number;
}

export default function ComparableTable({ properties, selected, onToggle, maxSelection }: ComparableTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="px-4 py-3 text-left font-display font-semibold text-muted-foreground">Selecionar</th>
            <th className="px-4 py-3 text-left font-display font-semibold text-muted-foreground">Endereço</th>
            <th className="px-4 py-3 text-center font-display font-semibold text-muted-foreground">Ano</th>
            <th className="px-4 py-3 text-left font-display font-semibold text-muted-foreground">Detalhes</th>
            <th className="px-4 py-3 text-right font-display font-semibold text-muted-foreground">Valor Original</th>
            <th className="px-4 py-3 text-right font-display font-semibold text-muted-foreground">R$/m²</th>
          </tr>
        </thead>
        <tbody>
          {properties.map((p, i) => {
            const isSelected = selected.includes(p.id);
            const locationDetails = [p.neighborhood, p.fiscalZone ? `Zona ${p.fiscalZone}` : null]
              .filter(Boolean)
              .join(" · ");

            return (
              <tr
                key={p.id}
                className={`border-b border-border transition-colors ${isSelected ? "bg-primary/5" : "hover:bg-muted/30"}`}
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <td className="px-4 py-4">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => onToggle(p.id)}
                    disabled={!isSelected && selected.length >= maxSelection}
                  />
                </td>
                <td className="px-4 py-4">
                  <p className="font-medium text-foreground">{p.address}</p>
                  <p className="text-xs text-muted-foreground">{locationDetails || "Localização complementar indisponível"}</p>
                </td>
                <td className="px-4 py-4 text-center">
                  <Badge variant="outline" className="text-xs">{p.year}</Badge>
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="secondary" className="text-xs">{p.type}</Badge>
                    <Badge variant="outline" className="text-xs">{p.area} m²</Badge>
                  </div>
                </td>
                <td className="px-4 py-4 text-right font-semibold text-foreground">{formatCurrency(p.venalValue)}</td>
                <td className="px-4 py-4 text-right text-muted-foreground">{formatCurrency(p.pricePerSqm)}/m²</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
