# Investigação de Discrepância de Dados: Rua Padre Adelino, 520

O usuário reportou que nossa plataforma encontrou apenas 1 endereço que "bate" com o da Smarty Valuation para a busca "Rua Padre Adelino, 520", enquanto a Smarty teria dados mais atualizados ou abrangentes.

## Fatos Apurados
1. **Dados Presentes:** Em nossa base, uma busca por "Rua Padre Adelino, 520" retorna **347 registros** reais.
2. **Atualização:** As transações retornadas incluem registros de **janeiro, fevereiro e março de 2026** (ex: Ap 261 em 03/2026, Ap 224 em 02/2026).
3. **Comparação Visual:** A tabela exibe os 347 registros corretamente, todos referentes ao número 520.

## Hipóteses para a Percepção do Usuário
- **Filtro de Número:** O usuário pode estar se referindo a uma unidade específica (ex: um apartamento) que a Smarty tem e nós não, ou vice-versa.
- **Formatação de Endereço:** Se a Smarty Valuation agrupa todas as unidades de um mesmo prédio em uma única linha (ou se a busca do usuário foi mais específica), ele pode ter tido a impressão de "apenas 1 resultado".
- **Discrepância de Fonte:** A Smarty pode estar usando fontes além do ITBI (como anúncios ativos ou cartórios de registro de imóveis), embora o usuário tenha mencionado que eles estão "atualizados até o mês 05" (maio/2026?), o que sugere que eles podem ter acesso a guias de ITBI processadas mais recentemente ou projeções.

## Próximos Passos
1. Verificar se a ordenação por data está trazendo os registros de 2026 para o topo (confirmado: `fetchPropertiesFromDatabase` usa `order("transaction_date", { ascending: false })`).
2. Confirmar se o sistema de paginação ou limite de 1000 registros está ocultando dados (improvável para 347 registros).
3. Questionar ao usuário qual dado específico ele encontrou na Smarty que não está aparecendo aqui para identificar se é uma falha de scraping ou de filtragem.
