import { type PropertyData, formatCurrency } from "@/lib/mockData";
import { Checkbox } from "@/components/ui/checkbox";

interface ComparableTableProps {
  properties: PropertyData[];
  selected: string[];
  onToggle: (id: string) => void;
  maxSelection: number;
}

// Try to extract floor / unit info from the raw address string
function extractFloorInfo(address: string): string | null {
  const upper = address.toUpperCase();

  // Patterns like "AP 102", "APTO 51", "APT 1203", "AP-302"
  const aptMatch = upper.match(/\bAP(?:TO|T)?[\s.\-N°º]*([0-9]{1,5})\b/);
  if (aptMatch) {
    const num = aptMatch[1];
    // Heuristic: floor = leading digits except last 1-2 (unit number)
    if (num.length >= 3) {
      const floor = num.slice(0, num.length - 2);
      return `${floor}º andar · Ap ${num}`;
    }
    return `Ap ${num}`;
  }

  // Patterns like "ANDAR 5", "5º ANDAR", "5 ANDAR"
  const floorMatch = upper.match(/\b(\d{1,2})\s*[ºO]?\s*ANDAR\b/) || upper.match(/\bANDAR[\s:]*(\d{1,2})\b/);
  if (floorMatch) return `${floorMatch[1]}º andar`;

  return null;
}

function formatPropertyType(type: string): string {
  if (!type) return "Imóvel";
  const t = type.toLowerCase();
  if (t.includes("apart")) return "Apartamento";
  if (t.includes("casa")) return "Casa";
  if (t.includes("cobert")) return "Cobertura";
  if (t.includes("studio") || t.includes("stúdio")) return "Studio";
  if (t.includes("comerc")) return "Comercial";
  return type;
}

export default function ComparableTable({ properties, selected, onToggle, maxSelection }: ComparableTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-4 py-3 text-left font-display font-semibold text-muted-foreground w-12"></th>
              <th className="px-4 py-3 text-left font-display font-semibold text-muted-foreground">Endereço</th>
              <th className="px-4 py-3 text-left font-display font-semibold text-muted-foreground">Detalhes</th>
              <th className="px-4 py-3 text-right font-display font-semibold text-muted-foreground">Preço</th>
              <th className="px-4 py-3 text-right font-display font-semibold text-muted-foreground">R$/m²</th>
              <th className="px-4 py-3 text-center font-display font-semibold text-muted-foreground">Ano</th>
            </tr>
          </thead>
          <tbody>
            {properties.map((p) => {
              const isSelected = selected.includes(p.id);
              const floorInfo = extractFloorInfo(p.address);
              const typeLabel = formatPropertyType(p.type);
              const areaLabel = p.area ? `${p.area}m²` : null;

              const detailParts = [areaLabel, typeLabel, floorInfo].filter(Boolean);
              const locationParts = [p.neighborhood, p.fiscalZone ? `Zona ${p.fiscalZone}` : null].filter(Boolean);

              return (
                <tr
                  key={p.id}
                  onClick={() => {
                    if (isSelected || selected.length < maxSelection) onToggle(p.id);
                  }}
                  className={`border-b border-border last:border-b-0 cursor-pointer transition-colors ${
                    isSelected ? "bg-primary/5" : "hover:bg-muted/30"
                  }`}
                >
                  <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => onToggle(p.id)}
                      disabled={!isSelected && selected.length >= maxSelection}
                    />
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-medium text-foreground leading-tight">{p.address}</p>
                    {locationParts.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-0.5">{locationParts.join(" · ")}</p>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-foreground">{detailParts.join(" | ")}</p>
                  </td>
                  <td className="px-4 py-4 text-right font-semibold text-foreground whitespace-nowrap">
                    {formatCurrency(p.venalValue)}
                  </td>
                  <td className="px-4 py-4 text-right text-muted-foreground whitespace-nowrap">
                    {formatCurrency(p.pricePerSqm)}
                  </td>
                  <td className="px-4 py-4 text-center text-muted-foreground">{p.year}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
