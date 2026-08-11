import { useState, useEffect, useRef } from "react";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchAddressesInDB, formatStreetDisplay, type AddressSuggestion } from "@/lib/addressSearch";
import { geoapifyAutocomplete, type GeoapifyResult } from "@/lib/geoapify";

interface AddressSearchProps {
  onSelect: (address: string) => void;
  onSearch: (address: string) => void;
  onQueryChange?: (value: string) => void;
}

interface CombinedResult {
  type: "db" | "geoapify";
  label: string;
  sublabel: string;
  searchValue: string;
}

function extractTypedNumber(value: string): string | null {
  const normalized = value.replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  const match = normalized.match(/\s(\d+[A-Za-z0-9/-]*)$/);
  return match ? match[1] : null;
}

export default function AddressSearch({ onSelect, onSearch, onQueryChange }: AddressSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CombinedResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }
    setIsLoading(true);
    debounceRef.current = setTimeout(async () => {
      const [dbResults, geoResults] = await Promise.all([
        searchAddressesInDB(query).catch(() => [] as AddressSuggestion[]),
        geoapifyAutocomplete(query).catch(() => [] as GeoapifyResult[]),
      ]);

      const combined: CombinedResult[] = [];
      const typedNumber = extractTypedNumber(query);

      // DB results first (real transactions)
      for (const r of dbResults) {
        const hood = r.neighborhood ? formatStreetDisplay(r.neighborhood) : "";
        const streetLabel = formatStreetDisplay(r.street);
        const label = typedNumber ? `${streetLabel}, ${typedNumber}` : streetLabel;
        combined.push({
          type: "db",
          label,
          sublabel: [hood, "São Paulo", "SP"].filter(Boolean).join(", "),
          searchValue: label,
        });
      }

      // Geoapify results (broad geocoding coverage)
      const seenLabels = new Set(combined.map(c => c.label.toUpperCase()));
      for (const r of geoResults) {
        const key = r.primary.toUpperCase();
        if (!seenLabels.has(key)) {
          // Build a clean search value: prefer "street, number" over the long formatted string
          const cleanSearch = r.street
            ? (r.housenumber ? `${r.street}, ${r.housenumber}` : r.street)
            : r.primary;
          combined.push({
            type: "geoapify",
            label: r.primary,
            sublabel: r.secondary,
            searchValue: cleanSearch,
          });
          seenLabels.add(key);
        }
      }


      setResults(combined.slice(0, 10));
      setIsOpen(combined.length > 0);
      setIsLoading(false);
      setActiveIndex(-1);
    }, 300);
  }, [query]);

  const handleSelect = (result: CombinedResult) => {
    setQuery(result.label);
    setIsOpen(false);
    onSelect(result.searchValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && results[activeIndex]) {
        handleSelect(results[activeIndex]);
      } else if (query.trim()) {
        setIsOpen(false);
        onSearch(query);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative w-full max-w-2xl">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => { setQuery(e.target.value); onQueryChange?.(e.target.value); }}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder="Digite o CEP ou o endereço do imóvel"
          className="h-14 pl-12 pr-4 text-base rounded-xl border-2 border-border bg-white text-foreground placeholder:text-muted-foreground shadow-card focus:border-primary focus:ring-primary"
        />
        {isLoading && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <Loader2 className="h-4 w-4 text-primary animate-spin" />
          </div>
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute z-50 w-full mt-2 bg-card border border-border rounded-xl shadow-card-xl overflow-y-auto max-h-[min(60vh,22rem)] overscroll-contain">
          {results.map((result, i) => (
            <button
              key={`${result.type}-${result.label}-${i}`}
              onClick={() => handleSelect(result)}
              className={`flex items-start gap-3 w-full px-4 py-3 text-left transition-colors ${
                i === activeIndex ? "bg-primary/10" : "hover:bg-muted"
              }`}
            >
              <div>
                <p className="text-sm font-medium text-foreground">{result.label}</p>
                <p className="text-xs text-muted-foreground">{result.sublabel}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
