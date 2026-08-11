# Investigação de Discrepância de Dados: Rua Padre Adelino, 520

O usuário reportou que nossa plataforma encontrou apenas 1 endereço que "bate" com o da Smarty Valuation para a busca "Rua Padre Adelino, 520", enquanto a Smarty teria dados mais atualizados ou abrangentes.

## Fatos Apurados
1. **Dados Presentes:** Em nossa base, uma busca por "Rua Padre Adelino, 520" retorna **347 registros** reais no banco de dados.
2. **Atualização:** As transações retornadas incluem registros de **janeiro, fevereiro e março de 2026** (ex: Ap 261 em 03/2026, Ap 224 em 02/2026).
3. **Discrepância na Interface:** Embora o banco retorne 347 registros, o usuário mencionou ver "apenas 1 endereço". Isso pode ser causado por:
    - O autocomplete sugerir apenas um item (agrupado), e o usuário esperar ver a lista completa já na sugestão.
    - O Smarty Valuation talvez mostre transações de Abril ou Maio de 2026 que ainda não constam nos arquivos oficiais de ITBI da Prefeitura processados pelo nosso robô.
4. **Volume de Dados:** O sistema está filtrando corretamente pelo número 520, trazendo todas as unidades (apartamentos/salas) daquele prédio.

## Conclusão Técnica
Nossa base está atualizada até a última transação disponível na Prefeitura (06/03/2026). Se a Smarty Valuation possui dados de meses posteriores, eles podem estar utilizando fontes secundárias (estimativas baseadas em ofertas ou cartórios com acesso antecipado) ou o robô da Smarty capturou uma atualização da prefeitura que ainda não foi refletida no arquivo público de download.

## Próximos Passos
- Monitorar a próxima execução do robô `import-itbi` (06:00 BRT).
- Confirmar com o usuário se os "347 resultados" que aparecem na tela de resultados (após clicar na sugestão) são o que ele esperava ou se a Smarty realmente mostra transações mais recentes (ex: Abril/Maio 2026).
