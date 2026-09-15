import { useState, useEffect } from "react";
import Header from "@/components/Header";
import { Clock, FileText, Loader2 } from "lucide-react";
import { getEvaluationHistory } from "@/lib/supabaseQueries";
import { formatCurrency } from "@/lib/mockData";
import type { Tables } from "@/integrations/supabase/types";

type Evaluation = Tables<"evaluations">;

export default function HistoryPage() {
  const [history, setHistory] = useState<Evaluation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getEvaluationHistory()
      .then(setHistory)
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
          <p className="text-sm text-muted-foreground mt-1">Suas avaliações recentes</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-16 bg-card rounded-xl border border-border">
            <p className="text-muted-foreground">Nenhuma avaliação realizada ainda.</p>
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
                    <p className="font-medium text-foreground">{item.address}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(item.created_at).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                </div>
                <span className="font-display font-bold text-primary">
                  {item.sale_avg ? formatCurrency(item.sale_avg) : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
