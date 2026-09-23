import { useState, useEffect } from "react";
import Header from "@/components/Header";
import { Clock, FileText, Loader2 } from "lucide-react";
import { getEvaluationHistory } from "@/lib/supabaseQueries";
import { formatCurrency } from "@/lib/mockData";

interface Evaluation {
  id: string;
  address: string;
  selected_property_ids: string[];
  sale_min: number | null;
  sale_avg: number | null;
  sale_max: number | null;
  per_sqm_min: number | null;
  per_sqm_avg: number | null;
  per_sqm_max: number | null;
  rent_min: number | null;
  rent_avg: number | null;
  rent_max: number | null;
  created_at: string;
  updated_at?: string | null;
}

export default function HistoryPage() {
  const [history, setHistory] = useState<Evaluation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getEvaluationHistory()
      .then((data) => {
        setHistory(data as Evaluation[]);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="container py-8 space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <Clock className="h-6 w-6 text-primary" />
            Histórico de Avaliações
          </h1>

          <p className="text-sm text-muted-foreground mt-1">
            Suas avaliações recentes
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-16 bg-card rounded-xl border border-border">
            <p className="text-muted-foreground">
              Nenhuma avaliação realizada ainda.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((item, i) => (
              <div
                key={item.id}
                className="flex items-center justify-between bg-card border border-border rounded-xl px-6 py-4 shadow-card hover:shadow-card-lg transition-shadow animate-fade-in"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <FileText className="h-4 w-4 text-primary" />
                  </div>

                  <div>
                    <p className="font-medium text-foreground">
                      {item.address}
                    </p>

                    <p className="text-xs text-muted-foreground">
                      {new Date(item.created_at).toLocaleDateString(
                        "pt-BR"
                      )}
                    </p>
                  </div>
                </div>

                <span className="font-display font-bold text-primary">
                  {item.sale_avg
                    ? formatCurrency(item.sale_avg)
                    : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}