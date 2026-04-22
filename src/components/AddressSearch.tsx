import { useState, useEffect, useRef } from "react";
import { Search, MapPin, Database, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchAddressesInDB, formatStreetDisplay, type AddressSuggestion } from "@/lib/addressSearch";
import { searchAddress, formatResult, type NominatimResult } from "@/lib/nominatim";

interface AddressSearchProps {
  onSelect: (address: string) => void;
  onSearch: (address: string) => void;
}

interface CombinedResult {
  type: "db" | "nominatim";
  label: string;
  sublabel: string;
  searchValue: string;
}

export default function AddressSearch({ onSelect, onSearch }: AddressSearchProps) {
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
      // Run both searches in parallel
      const [dbResults, nominatimResults] = await Promise.all([
        searchAddressesInDB(query).catch(() => [] as AddressSuggestion[]),
        query.length >= 3 ? searchAddress(query).catch(() => [] as NominatimResult[]) : Promise.resolve([] as NominatimResult[]),
      ]);

      const combined: CombinedResult[] = [];

      // DB results first (more precise, from real data)
      for (const r of dbResults) {
        combined.push({
          type: "db",
          label: formatStreetDisplay(r.street),
          sublabel: "São Paulo, SP",
          searchValue: r.street,
        });
      }

      // Nominatim results (broader coverage)
      const seenLabels = new Set(combined.map(c => c.label.toUpperCase()));
      for (const r of nominatimResults) {
        const { primary, secondary, full } = formatResult(r);
        if (!seenLabels.has(primary.toUpperCase())) {
          combined.push({
            type: "nominatim",
            label: primary,
            sublabel: secondary,
            searchValue: full,
          });
          seenLabels.add(primary.toUpperCase());
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
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder="Insira abaixo a localização do imóvel e receba uma avaliação"
          className="h-14 pl-12 pr-4 text-base rounded-xl border-2 border-border bg-card shadow-card focus:border-primary focus:ring-primary"
        />
        {isLoading && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <Loader2 className="h-4 w-4 text-primary animate-spin" />
          </div>
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute z-50 w-full mt-2 bg-card border border-border rounded-xl shadow-card-xl overflow-hidden">
          {results.map((result, i) => (
            <button
              key={`${result.type}-${result.label}-${i}`}
              onClick={() => handleSelect(result)}
              className={`flex items-start gap-3 w-full px-4 py-3 text-left transition-colors ${
                i === activeIndex ? "bg-primary/10" : "hover:bg-muted"
              }`}
            >
              {result.type === "db" ? (
                <Database className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              ) : (
                <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              )}
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
