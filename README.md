# Orçado × Realizado — CC 2930 Coordenação de Logística

Dashboard estático que cruza as **inversões gerenciais** do ERP com o **orçamento
aprovado** do centro de custo 2930. Não tem servidor, não tem build, não usa
biblioteca nenhuma: dá para publicar no GitHub Pages e abrir por link.

- **Aba Visão geral** — orçado × realizado por mês, execução acumulada com projeção
  de fechamento, desvio por grupo e composição do gasto.
- **Aba Contas** — maiores contas, concentração (Pareto), execução mês a mês por
  conta e o relatório completo orçado × realizado.
- **Aba Lançamentos** — os ~8.250 lançamentos, por tipo de documento, por dia, e os
  maiores individuais.
- **Aba Fornecedores** — ranking, concentração e ficha de cada fornecedor.
- **Aba Diesel** — litros atendidos e custo por litro.
- **Aba Alertas** — gasto sem orçamento, orçamento sem gasto, contas acima do
  orçado, maior variação entre meses e a conferência de cada planilha.
- **Aba Dados** — arrastar planilhas novas e baixar o Excel.

Todos os filtros do topo (período, grupo, conta, busca, incluir não monetário)
valem para **tudo** ao mesmo tempo: gráficos, tabelas e o Excel exportado.

---

## Adicionar um mês novo

Há dois caminhos. Eles servem a propósitos diferentes.

### 1. Rápido, só para você: arrastar no navegador

Abra a aba **Dados** e arraste o `.xlsx` de inversão gerencial. Ele entra na
análise na hora e fica guardado neste navegador.

O mês é detectado pelo próprio arquivo — não precisa dizer qual é. Se o mês já
estava carregado, o arquivo novo substitui o antigo (retificação do ERP é comum).

Serve para dar uma olhada rápida. **Quem abrir o link não vê esse mês**, porque
ele só existe no seu navegador.

### 2. Definitivo: gerar os dados e publicar

```bash
python atualizar.py
```

1. Coloque o arquivo em `planilhas/inversoes/` (ou `planilhas/diesel/`, ou
   `planilhas/orcamento/` se o orçamento for revisado).
2. Rode o comando acima. Ele confere a conciliação de cada planilha e regrava
   `js/dados.js`.
3. Faça commit e push. Agora todo mundo que abre o link vê o mês novo.

O script **sai com erro se alguma planilha não conciliar** — de propósito, para
não publicar número errado sem perceber. A saída é assim:

```
Inversões gerenciais (7 arquivos)
   mês lay      total do CC           contas      lançamentos    Δ cta   Δ lanç
  -----------------------------------------------------------------------------
   jan   A     1.664.797,04     1.664.797,04     1.664.797,04     0.00     0.00
   jun   A     1.424.212,89     1.424.212,89     1.424.212,89     0.00     0.00
   jul   B     1.544.364,43     1.544.364,43     1.544.364,43     0.00     0.00
```

As três colunas de valor têm de ser iguais: o total do centro de custo, a soma
das 93 contas e a soma dos lançamentos. `Δ` é o quanto elas divergem — o normal
é `0.00`.

Não precisa de nenhuma biblioteca Python instalada. Os leitores de `.xlsx` e de
`.xls` estão em `leitores/`, escritos à mão, porque o `openpyxl` não abre os
arquivos deste ERP (ele quebra no stylesheet).

---

## Publicar no GitHub Pages

```bash
git init
git add -A
git commit -m "dashboard orçado x realizado 2930"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/SEU-REPO.git
git push -u origin main
```

No GitHub: **Settings → Pages → Source: branch `main`, pasta `/ (root)`**.
Em um ou dois minutos o link fica no ar.

Se o repositório for **público**, qualquer pessoa com o link vê os dados
financeiros do centro de custo. Para uso interno, deixe **privado** — o GitHub
Pages de repositório privado exige plano pago; a alternativa é o arquivo único
abaixo.

### Arquivo único, para enviar por e-mail ou abrir sem servidor

```bash
python atualizar.py --bundle
```

Gera `dashboard-completo.html` com CSS, JS e dados embutidos — um arquivo só,
sem nenhuma dependência externa. Dá para mandar anexado ou abrir com duplo
clique.

---

## Baixar o relatório em Excel

Botão **Baixar Excel** no topo. Sai um `.xlsx` com nove abas — Resumo, Por grupo,
Por conta, Conta x mês, Lançamentos, Fornecedores, Alertas, Diesel e Requisições
diesel — já no formato pt-BR, com cabeçalho fixo e filtro automático.

O arquivo respeita os filtros que estiverem ativos na tela. A aba `Resumo`
registra qual recorte foi exportado e quando.

---

## Como os dados se ligam

A chave é o código da conta: o que o orçamento chama de **`CONTA`** é o mesmo que
o relatório do ERP chama de **`Reduzida`** (layout antigo) ou **`Cta`** (layout
novo). As 93 contas que aparecem nos relatórios existem todas no orçamento.

O escopo comparável é a subárvore do grupo **260 CUSTOS E DESPESAS**, com sete
grupos: custos diretos (monetário e não monetário), pessoal, serviços, materiais,
financeiras e tributárias.

Alguns detalhes que valem saber ao ler os números:

- **Mês sem planilha não é zero.** Os meses ainda não fechados (ago a dez)
  aparecem como *sem dados*, hachurados, em todo gráfico e tabela. Uma linha de
  tendência que passasse por zero neles estaria mentindo.
- **Despesa é positiva; estorno é negativo.** O ERP marca débito com `-` no fim
  do valor (`1.664.797,04-`). Estornos entram negativos e se cancelam com o
  débito, como devem.
- **A conta 290 (aluguel de máquinas próprias) é rateio interno, não caixa.**
  Por padrão ela entra nos totais, porque é assim que o relatório do ERP fecha.
  Desmarque *Incluir não monetário* para ver só o desembolso real.
- **Dois layouts de relatório.** O ERP mudou o formato entre junho e julho
  (`FFOR001.GER` até junho → `FFOR401.GER` em julho): mudaram as colunas e os números deixaram de
  ser texto. Os dois são lidos automaticamente; a coluna *Layout* na aba Alertas
  mostra qual foi usado em cada mês.
- **O diesel mede consumo, não compra.** O relatório `SECE214` conta litros
  retirados do estoque; as contas 380 e 820 contam a compra lançada no
  financeiro. Os dois não coincidem no mesmo mês, então o custo por litro é
  indicativo. O aviso no topo da aba Diesel repete isso.

---

## O que o dashboard já mostra (jan–jul/2026)

Com os sete meses carregados, o consumo está em **77,6% do orçado** — folga
aparente. A composição, no entanto, está bem deslocada:

| Grupo | Orçado | Realizado | Execução |
|---|---|---|---|
| Despesas tributárias | R$ 22.463 | R$ 1.495.548 | 6.657,8% |
| Despesas de materiais | R$ 1.537.818 | R$ 2.883.932 | 187,5% |
| Despesas com pessoal | R$ 2.724.554 | R$ 2.886.616 | 105,9% |
| Despesas de serviços | R$ 3.873.548 | R$ 3.033.717 | 78,3% |
| Custos diretos (não monetário) | R$ 2.269.185 | R$ 477.429 | 21,0% |
| Custos diretos | R$ 3.481.767 | R$ 12.205 | 0,4% |

Três pontos explicam quase tudo, e os três estão na aba **Alertas**:

- **IPVA/Licenciamento (1440): R$ 1.433.078 gastos, R$ 0 orçados.** É o que leva
  as tributárias a 6.657%.
- **Óleo diesel (380): R$ 3,48 mi orçados no período, R$ 12 mil realizados.** O
  diesel real está lançado em **Combustível (820)**. Ou seja, combustível está
  orçado em duas contas (380 com R$ 6,01 mi no ano e 820 com R$ 3,40 mi) e
  realizado em uma só. Vale alinhar a classificação do orçamento com a do ERP.
- **Peças, acessórios e pneus (1200): 187,5% do orçado**, cerca de R$ 1,35 mi
  acima.

A **projeção de fechamento** (realizado até julho + orçado de ago a dez) dá
**R$ 20,7 mi** contra um orçamento anual de **R$ 23,8 mi**.

Sobre o **custo por litro**: com junho e julho tendo litros e financeiro ao mesmo
tempo, o cálculo sai em R$ 1,23/L e R$ 1,81/L. Isso é bem abaixo do preço de
mercado do diesel, o que reforça o aviso da aba: o `SECE214` conta litros
retirados do estoque e as contas 380/820 contam a compra lançada no financeiro —
os dois não medem a mesma coisa no mesmo mês. Antes de usar esse número como
preço, vale conferir com a contabilidade se todo o combustível consumido pela
logística é lançado nessas duas contas.

## Estrutura

```
index.html              a página
css/estilo.css          paleta e componentes
js/dados.js             gerado por atualizar.py — não edite à mão
js/graficos.js          gráficos em SVG
js/app.js               estado, filtros, agregações e tabelas
js/leitor.js            leitura de .xlsx no navegador
js/xlsx.js              escrita do .xlsx do export + montagem das abas
atualizar.py            planilhas/ -> js/dados.js
leitores/               parsers: xlsx, xls (BIFF8), inversão, orçamento, diesel
planilhas/              onde ficam os arquivos do ERP
```

Requisitos: **Python 3.9+** para o script (nenhum pacote extra) e um navegador
atual para a página — o upload de `.xlsx` e o export usam
`DecompressionStream`/`CompressionStream`, disponíveis no Chrome, Edge, Firefox
e Safari recentes. Sem eles a página continua funcionando; só o upload no
navegador fica indisponível, e aí o caminho é o `atualizar.py`.
