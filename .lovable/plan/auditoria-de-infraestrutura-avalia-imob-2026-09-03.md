# Auditoria de Infraestrutura — AvalIA Imob

Auditoria somente leitura. Nenhum arquivo, tabela, função ou variável foi alterado.

## 1. Backend atual
- Backend: **Lovable Cloud** (instância Supabase gerenciada pela Lovable).
- Project Ref: `snvevsfmxidzrhoidkao` (também em `supabase/config.toml` → `project_id`).
- URL do projeto: `https://snvevsfmxidzrhoidkao.supabase.co`.
- Cliente do app: `src/integrations/supabase/client.ts` (arquivo autogerado).
- Auth: habilitado, mas **0 usuários** — o app não usa login hoje.

## 2. Tabelas e volumes reais
| Tabela | Linhas | Uso no app |
|---|---|---|
| `public.properties` | 606.452 | Busca de endereços e comparáveis (`supabaseQueries.ts`, `addressSearch.ts`) |
| `public.evaluations` | 27 | Registro de avaliações (somente service_role) |
| `public.market_indexes` | 0 | Índices FipeZAP/CRECI (`marketIndexService.ts`) |
| `public.market_reports` | 7 | Relatórios baixados |
| `public.market_update_logs` | 18 | Logs das atualizações |
| `storage.objects` | 7 | Arquivos do bucket `market-reports` |

Funções de banco: `search_addresses(search_term, max_results)`, `update_updated_at_column()`.

## 3. Migrations
11 arquivos em `supabase/migrations/` (de 2026-04-08 a 2026-08-25). Elas cobrem: criação das tabelas, colunas de transação ITBI (`transaction_value_full`, `proportion_pct`, `venal_reference`, `matricula`, `transaction_date`), índices, `search_addresses`, extensões e as políticas de segurança finais. **Aparentam representar a estrutura atual** — todas as colunas e funções listadas no schema vivo têm origem rastreável nas migrations. Ressalva: a criação do bucket `market-reports` foi feita por ferramenta, não por SQL, então não está nas migrations.

## 4. Edge Functions
| Função | Dependências |
|---|---|
| `import-itbi` | `@supabase/supabase-js@2` (esm.sh), `npm:xlsx@0.18.5`, download da Prefeitura de SP |
| `scrape-properties` | `@supabase/supabase-js@2`, scraping HTTP |
| `update-market-indexes` | `@supabase/supabase-js@2`, `npm:xlsx`, libs internas `lib/http.ts`, `lib/pdf.ts`, `sources/fipezap.ts`, `sources/crecisp.ts` |

Todas leem `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` do ambiente (injetados automaticamente pela plataforma).

## 5. Storage
- Bucket `market-reports` — privado, 7 objetos.

## 6. RLS, policies, triggers, índices
- RLS ativo em todas as tabelas públicas.
  - `properties`: leitura pública; insert/delete só service_role; update negado.
  - `evaluations`: exclusivamente service_role.
  - `market_indexes` / `market_reports` / `market_update_logs`: leitura pública, escrita service_role.
  - `storage.objects`: política "Service role manages market-reports objects".
- Triggers `update_*_updated_at` em `properties`, `market_indexes`, `market_reports`.
- Índices: `idx_properties_address`, `idx_properties_year`, `properties_transaction_date_idx`, `properties_matricula_idx`, `idx_properties_address_trgm` (GIN pg_trgm, crítico para a velocidade do autocomplete), `market_indexes_source_competence_idx`, `market_update_logs_source_idx`.
- Extensões: `pg_trgm` (schema `extensions`), `pg_cron`, `pg_net`.
- Cron jobs ativos: `import-itbi-daily` (09:00 UTC), `daily-itbi-import` (09:00 UTC — **duplicado**, provável sobra), `update-market-indexes-daily` (08:30 UTC).

## 7. Variáveis de ambiente (apenas nomes)
Frontend (`.env`, build-time Vite):
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`
- `VITE_GEOAPIFY_API_KEY` (usada em `src/lib/geoapify.ts`)

Edge Functions (secrets do backend): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_SECRET_KEYS`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `SUPABASE_JWKS`, `LOVABLE_API_KEY`.

Banco: `app.settings.service_role_key` (usado pelos cron jobs no `net.http_post`).

## 8. O que depende do Lovable Cloud
Depende da plataforma (precisa ser recriado/reconfigurado):
- Injeção automática das variáveis `VITE_SUPABASE_*` e dos secrets das Edge Functions.
- Deploy automático das Edge Functions (passará a ser via Supabase CLI).
- `LOVABLE_API_KEY` (AI Gateway) — hoje não é lido por nenhuma função; sem impacto prático.
- Bucket criado por ferramenta da plataforma.

Portável sem mudança de código: schema, RLS, policies, triggers, índices, funções SQL, cron jobs, e o código das Edge Functions (usam apenas variáveis padrão do Supabase).

## 9. Migração sem perda de dados
Sim, é viável sem perda. Precisa transferir:
- Dados: `properties` (606k linhas — maior peso), `evaluations`, `market_reports`, `market_update_logs`, `market_indexes` (vazia).
- Objetos do bucket `market-reports` (7 arquivos).
- Extensões, índices (incluindo o GIN trgm), triggers, funções, policies e grants.
- Cron jobs — recriar apontando para a nova URL de funções e novo service_role key.
- Auth: nada a migrar (0 usuários).
Nada de secreto sai do Lovable Cloud: o `service_role` do projeto atual não é acessível; a migração de dados usa dump via `SUPABASE_DB_URL` disponível no ambiente do backend, ou export por CSV.

## 10. Plano seguro de migração (ordem sugerida)
1. Criar o projeto Supabase externo do usuário e anotar Ref, URL, anon key e service_role key (guardadas pelo usuário).
2. Aplicar as 11 migrations existentes no projeto novo, na ordem cronológica, via Supabase CLI (`db push`) — gera todo o schema, índices, funções, RLS e policies.
3. Criar manualmente o bucket privado `market-reports` e aplicar a policy de storage da migration `20260825142254`.
4. Exportar e importar os dados (dump/`COPY` por tabela, `properties` em lotes) e copiar os 7 objetos do bucket. Validar contagens linha a linha.
5. Configurar os secrets das Edge Functions no projeto novo e fazer deploy das três funções via Supabase CLI.
6. Recriar os cron jobs com a nova URL de funções — e criar apenas dois (eliminar a duplicata `daily-itbi-import`).
7. Trocar a conexão do app: apontar `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PROJECT_ID` e `supabase/config.toml` para o projeto externo. Substituir o cliente autogerado por um cliente próprio (deixa de ser gerenciado pela Lovable).
8. Testar em preview: autocomplete (com e sem número), avaliação completa, índices de mercado, e uma execução manual de cada Edge Function.
9. Só depois de tudo validado, desativar o Lovable Cloud — mantendo o projeto antigo pausado por alguns dias como rollback.

### Riscos a observar
- O índice GIN trgm precisa existir antes do teste de performance, senão o autocomplete fica lento.
- A importação de 606k linhas deve ser feita em lotes para não estourar timeout.
- Após desconectar o Lovable Cloud, as ferramentas de banco/funções da plataforma deixam de operar sobre esse backend; toda manutenção passa a ser por CLI/dashboard do Supabase.
