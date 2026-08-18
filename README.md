# Orçado × Realizado — CC 2930 Coordenação de Logística

Dashboard estático que cruza as **inversões gerenciais** do ERP com o **orçamento
aprovado** do centro de custo 2930. Não tem servidor, não tem build, não usa
biblioteca nenhuma: dá para publicar no GitHub Pages e abrir por link.

> **Recorte operacional.** As contas de pessoal e folha ficam fora: salário,
> INSS, FGTS, IRRF, férias, 13º, rescisões, plano de saúde e odontológico,
> seguro de vida, alimentação, vale transporte, benefícios, consignado, pensão,
> exames, contribuição sindical. São 33 contas e R$ 2,9 mi no período — os
> totais do painel **não** são o custo inteiro do centro de custo. Para mudar o
> recorte, edite as constantes no topo de `atualizar.py` (veja abaixo).

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

## Mudar o recorte operacional

No topo de `atualizar.py`:

```python
GRUPOS_EXCLUIDOS = {410}      # DESPESAS COM PESSOAL, inteiro
CONTAS_EXCLUIDAS = {1360, 1370}   # contribuição sindical (encargo fora do grupo)
CONTAS_MANTIDAS = set()       # contas do grupo excluído que você quer de volta
```

Excluir o **grupo** inteiro, e não uma lista de contas, é de propósito: se o ERP
criar uma conta de benefício nova no mês que vem, ela já sai de fora sozinha em
vez de entrar sem ninguém notar.

Três contas do grupo de pessoal são discutíveis, porque na prática são custo de
operação. Elas saíram junto e você pode trazer de volta pondo o código em
`CONTAS_MANTIDAS`:

| Cta | Conta | No período | Por que reconsiderar |
|---|---|---|---|
| 510 | Diárias | R$ 167.884 | Inclui os **carretos** pagos a terceiros, que são frete |
| 1860 | Prestação de serviço continuado - PJ | R$ 64.400 | Terceirizado, não é folha |
| 530 | EPIs/Uniformes | R$ 157 | Equipamento de segurança |
| 1770 | EPC - Equipamento de proteção coletiva | R$ 1.216 | Equipamento de segurança |

Exemplo, para trazer diárias e o serviço PJ de volta:

```python
CONTAS_MANTIDAS = {510, 1860}
```

Depois rode `python atualizar.py` de novo. Ele imprime quanto ficou de fora, e a
aba **Alertas** mostra, mês a mês, quanto do arquivo original é operacional e
quanto é pessoal.

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

## O que o dashboard já mostra (jan–jul/2026, operacional)

Com os sete meses carregados e sem a folha, o consumo está em **70,5% do
orçado** — R$ 7,88 mi realizados contra R$ 11,17 mi previstos. A folga é
aparente: a composição está bem deslocada.

| Grupo | Orçado | Realizado | Execução |
|---|---|---|---|
| Despesas tributárias | R$ 22.463 | R$ 1.476.495 | 6.573% |
| Despesas de materiais | R$ 1.537.818 | R$ 2.883.932 | 187,5% |
| Despesas de serviços | R$ 3.873.548 | R$ 3.033.717 | 78,3% |
| Custos diretos (não monetário) | R$ 2.269.185 | R$ 477.429 | 21,0% |
| Custos diretos | R$ 3.481.767 | R$ 12.205 | 0,4% |

Quatro contas concentram quase tudo, e as três primeiras estão na aba
**Alertas**:

- **Peças, acessórios e pneus: R$ 2,87 mi realizados contra R$ 1,51 mi
  orçados** — 190%, R$ 1,35 mi acima. É o maior gasto do centro de custo.
- **IPVA/Licenciamento: R$ 1,45 mi gastos, R$ 0 orçados.** É o que leva as
  tributárias a 6.573%.
- **Óleo diesel (380): R$ 3,48 mi orçados no período, R$ 12 mil realizados.** O
  diesel real está lançado em **Combustível (820)**, que tem R$ 1,42 mi
  realizados contra R$ 1,97 mi orçados. Combustível está orçado em duas contas e
  realizado em uma só — vale alinhar a classificação do orçamento com a do ERP.
- **Manutenção de máquinas e veículos: R$ 1,07 mi** contra R$ 1,51 mi orçados.

Junto com peças e pneus, manutenção e combustível somam **R$ 5,36 mi**, ou 68%
do gasto operacional do período: o custo desta coordenação é essencialmente
**rodar e manter frota**.

A **projeção de fechamento** (realizado até julho + orçado de ago a dez) dá
**R$ 16,0 mi**.

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
