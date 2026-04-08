import { useState, useEffect, useRef } from "react";
import { Search, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchAddress, type NominatimResult } from "@/lib/nominatim";

interface AddressSearchProps {
  onSelect: (address: string) => void;
  onSearch: (address: string) => void;
}

export default function AddressSearch({ onSelect, onSearch }: AddressSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
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
    if (query.length < 3) {
      setResults([]);
      setIsOpen(false);
      return;
    }
    setIsLoading(true);
    debounceRef.current = setTimeout(async () => {
      const data = await searchAddress(query);
      setResults(data);
      setIsOpen(data.length > 0);
      setIsLoading(false);
    }, 400);
  }, [query]);

  const handleSelect = (result: NominatimResult) => {
    const name = result.address.road || result.display_name.split(",")[0];
    setQuery(name);
    setIsOpen(false);
    onSelect(name);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      setIsOpen(false);
      onSearch(query);
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
          placeholder="Digite o endereço completo, ex: Rua Cardeal Arcoverde 1070"
          className="h-14 pl-12 pr-4 text-base rounded-xl border-2 border-border bg-card shadow-card focus:border-primary focus:ring-primary"
        />
        {isLoading && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute z-50 w-full mt-2 bg-card border border-border rounded-xl shadow-card-xl overflow-hidden">
          {results.map((result) => (
            <button
              key={result.place_id}
              onClick={() => handleSelect(result)}
              className="flex items-start gap-3 w-full px-4 py-3 text-left hover:bg-muted transition-colors"
            >
              <MapPin className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">{result.display_name.split(",").slice(0, 3).join(",")}</p>
                <p className="text-xs text-muted-foreground">{result.display_name.split(",").slice(3).join(",").trim()}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
