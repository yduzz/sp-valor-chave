import Header from "@/components/Header";
import { Clock, FileText } from "lucide-react";

const mockHistory = [
  { id: "1", address: "Rua Cardeal Arcoverde, 1070", date: "2026-04-07", result: "R$ 690.000" },
  { id: "2", address: "Av. Paulista, 1578", date: "2026-04-05", result: "R$ 1.250.000" },
  { id: "3", address: "Rua Oscar Freire, 300", date: "2026-04-01", result: "R$ 980.000" },
];

export default function HistoryPage() {
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

        <div className="space-y-3">
          {mockHistory.map((item, i) => (
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
                  <p className="text-xs text-muted-foreground">{new Date(item.date).toLocaleDateString("pt-BR")}</p>
                </div>
              </div>
              <span className="font-display font-bold text-primary">{item.result}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
