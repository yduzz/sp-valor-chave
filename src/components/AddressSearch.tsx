import { useState, useEffect, useRef } from "react";
import { Search, MapPin, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchAddressesInDB, formatStreetDisplay, type AddressSuggestion } from "@/lib/addressSearch";

interface AddressSearchProps {
  onSelect: (address: string) => void;
  onSearch: (address: string) => void;
}

export default function AddressSearch({ onSelect, onSearch }: AddressSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AddressSuggestion[]>([]);
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
      const data = await searchAddressesInDB(query);
      setResults(data);
      setIsOpen(data.length > 0);
      setIsLoading(false);
      setActiveIndex(-1);
    }, 300);
  }, [query]);

  const handleSelect = (result: AddressSuggestion) => {
    const display = formatStreetDisplay(result.street);
    setQuery(display);
    setIsOpen(false);
    // Use the raw street name for search (matches DB format)
    onSelect(result.street);
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
      } else {
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
          placeholder="Digite o endereço, ex: Rua Cardeal Arcoverde 1070"
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
          {results.map((result, i) => {
            const display = formatStreetDisplay(result.street);
            return (
              <button
                key={result.street}
                onClick={() => handleSelect(result)}
                className={`flex items-start gap-3 w-full px-4 py-3 text-left transition-colors ${
                  i === activeIndex ? "bg-primary/10" : "hover:bg-muted"
                }`}
              >
                <MapPin className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">{display}</p>
                  <p className="text-xs text-muted-foreground">{result.count} registro(s) encontrado(s)</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
