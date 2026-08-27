# Resultado e Orçamento — CC 2930 Coordenação de Logística

Painel estático que mostra **quanto entrou, quanto saiu e onde o orçamento está
estourando** no centro de custo 2930. Sem servidor, sem build, sem biblioteca no
navegador: dá para publicar no GitHub Pages e abrir por link.

A pergunta que ele responde primeiro: *estou gastando mais do que estou ganhando?*

> **Pendências e defeitos nos dados:** ver [PENDENCIAS.md](PENDENCIAS.md) — dez achados nas fontes e quatro itens que ainda faltam coletar, com o impacto de cada um.

- **Resultado** — receita × custo, mês a mês e acumulado, com o resultado em
  destaque. É a aba que abre.
- **Orçado × Realizado** — orçado, realizado, diferença e execução, por mês e por
  conta, mais a matriz conta × mês.
- **Setores** — em quais grupos de conta o dinheiro está indo, e o desvio de cada um.
- **Onde agir** — o que está estourando o orçado, ordenado pelo excesso **em reais**;
  contas piorando mês a mês; gasto sem orçamento; orçamento parado.
- **Frete faturado** — quanto cada obra pagou de frete carrada, mês a mês, e quanto
  isso representa da receita.
- **Fornecedores** — quem recebeu (vem do razão, cobre parte do custo; ver abaixo).
- **Dados** — de onde vem cada número e a conferência de cada relatório.

Os filtros do topo (período, grupo, conta, busca, **mostrar pessoal**) valem para
tudo ao mesmo tempo: gráficos, tabelas e o Excel exportado.

---

## As fontes, e por que essa ordem

| Fonte | O que dá | Papel |
|---|---|---|
| `planilhas/analise/*.pdf` — **FFOR501, Análise de Custos** | custo realizado por conta e por mês, **e a receita** | **primária** |
| `planilhas/orcamento/*.xls` — Programa Orçamentário | orçado dos 12 meses, nomes de conta, grupos | primária |
| `planilhas/inversoes/*.xlsx` — FFOR001/FFOR401, o razão | fornecedor e documento de cada nota | secundária |
| `planilhas/diesel/*.xlsx` — SECE214 | litros consumidos | secundária |
| `planilhas/frete/*.xlsx` — FRETE CARRADA | faturamento de frete por obra, pelas abas de RESUMO | secundária |

**Por que o PDF e não o razão.** Em jan–jul o razão soma R$ 10,79 mi e a Análise
de Custos R$ 19,00 mi. A diferença é quase toda **óleo diesel** — R$ 6,32 mi que o
razão mostra como zero, porque diesel é baixa de estoque e nunca vira nota em
contas a pagar — mais provisões como o INSS. O razão subestimava o custo em 76%.

**Relatórios que se sobrepõem.** `04 a 06` e `05 a 07` trazem maio e junho os
dois, e discordam: junho saiu com R$ 2.638.995,78 no primeiro e R$ 2.643.116,20 no
segundo, porque o ERP lança retroativo. Onde há sobreposição, **vence o relatório
de período mais recente** — é o que fecha o acumulado impresso. O script ordena
pelo fim do período e apaga os valores do mês antes de regravá-los, para que uma
conta que existia no relatório antigo e não existe no novo não fique pendurada.

Consequência prática: a aba **Fornecedores** cobre só a parte lançada em contas a
pagar (cerca de dois terços do custo) e **não fecha** com as outras abas. Ela está
lá porque é a única fonte de *quem recebeu o dinheiro*; o aviso no topo da aba diz
isso, e ela fica fora dos KPIs.

---

## Adicionar um mês

```bash
python atualizar.py
```

1. No ERP, tire o relatório **Inversão Gerencial / Análise de Custos** (`FFOR501`)
   do centro de custo 2930 para o período novo, em PDF.
2. Salve em `planilhas/analise/`.
3. Rode o comando. Ele confere a conciliação de cada mês e regrava `js/dados.js`.
4. `git add -A && git commit -m "análise de custos de julho" && git push`.

O script **sai com erro se algum mês não conciliar**, de propósito, para não
publicar número errado sem perceber:

```
Análise de Custos — FONTE PRIMÁRIA (2 PDFs)
   mês   soma das contas     rodapé do PDF        Δ
   jan      1.918.222,20      1.918.222,20     0.00
   fev      3.896.283,41      3.896.283,41     0.00
```

A soma das contas de cada mês tem de ser igual ao total impresso no rodapé do PDF.
`Δ` é o quanto elas divergem — o normal é `0.00`. Se sair diferente, a leitura das
colunas saiu do lugar e nenhum número do painel é confiável.

Mês repetido em dois PDFs não duplica: o último arquivo lido vence, e o script avisa.

**PDF não é lido no navegador** — precisaria de uma biblioteca de ~1 MB, e o projeto
não tem dependência de front. Os `.xlsx` do razão, sim: pode arrastar na aba Dados
para atualizar só a aba Fornecedores.

Nenhuma biblioteca Python é necessária além do **pdfplumber**, que lê o PDF. Os
leitores de `.xlsx` e de `.xls` estão em `leitores/`, escritos à mão, porque o
`openpyxl` não abre os arquivos deste ERP (quebra no stylesheet).

---

## Mês parcial: quando só existe o detalhamento

Julho tem o razão (`planilhas/inversoes/`) mas ainda não tem Análise de Custos.
Ele entra no painel **marcado como parcial**, porque o razão vê pouco mais da
metade do custo. Junho, o único mês com as duas fontes, mostra o tamanho do
problema:

| | Junho |
|---|---|
| Análise de Custos | R$ 2.638.995,78 |
| Razão | R$ 1.424.212,89 |
| **O razão vê** | **54% do custo** |

O que o razão não vê, em junho:

| Conta | Análise | Razão | Invisível |
|---|---|---|---|
| **380 Óleo Diesel** | R$ 1.039.941,13 | **R$ 0,00** | R$ 1.039.941,13 |
| 1200 Peças e pneus | R$ 622.270,88 | R$ 465.007,67 | R$ 157.263,21 |

Então o mês parcial:

- **aparece** no gráfico mensal, com hachura na cor da série e o rótulo *parcial*,
  e é selecionável no filtro como *Julho (parcial)*;
- **fica fora** do Acumulado, do desvio por mês, do mapa de calor, da projeção e
  do resultado — somar meio custo aos meses cheios daria um total que não é nem
  uma coisa nem outra;
- ao ser selecionado, **suprime desvio e execução** (aparecem como *não
  comparável*) e desliga a aba **Onde agir**: um desvio calculado sobre metade do
  custo mostraria uma economia que não existe;
- mantém **fornecedores e lançamentos**, que é o dado em que o razão é completo e
  confiável.

Quando o PDF de julho chegar, basta salvá-lo em `planilhas/analise/` e rodar o
script: o mês deixa de ser parcial sozinho, sem mexer em código.

---

## Frete carrada faturado às obras

As planilhas em `planilhas/frete/` trazem, por mês, quanto cada obra pagou de
frete carrada. O painel usa as abas de **RESUMO** (o valor por CR) e confere
contra a aba de detalhe.

Nos meses com receita lançada, o frete carrada é **de 52% a 59% da receita** da
logística — média de 56,8%. Ou seja: é a maior parcela do faturamento, mas **não
é o faturamento todo**. Falta a outra parte do frete, que vem de um relatório
ainda fora do painel.

### A receita é frete carrada + frete

São dois serviços diferentes, para obras diferentes: **frete carrada** (as
planilhas de RESUMO) e **frete** (um relatório separado, em
`planilhas/frete/faturamento-frete.csv`). Somados, dão o faturamento da
logística.

Isso foi **conferido, não suposto**: nos meses em que o ERP publica receita, a
soma dos dois fecha ao centavo.

| Mês | Frete carrada | Frete | Soma | Receita do ERP | Δ |
|---|---|---|---|---|---|
| janeiro | 1.084.940,71 | 1.013.072,36 | 2.098.013,07 | 2.098.013,08 | −0,01 |
| fevereiro | 939.543,50 | 719.052,09 | 1.658.595,59 | 1.658.595,60 | −0,01 |
| março | 1.560.327,29 | 1.066.086,43 | 2.626.413,72 | 2.626.413,74 | −0,02 |

Foi essa conta que identificou a qual mês pertencia cada valor de frete: só um
valor do conjunto fecha a receita de cada mês.

**Onde o ERP publica receita, ela é a fonte oficial** e a soma serve de
conferência. **Onde o ERP está em branco**, a soma passa a ser a receita, e a
coluna *Fonte* na aba Frete faturado diz qual foi usada. Faltando qualquer uma
das duas parcelas, a receita fica **em branco** — nunca zero.

Para acrescentar um mês, edite `planilhas/frete/faturamento-frete.csv`
(`mes;valor;observacao`) e rode o script.

### Duas armadilhas nestes arquivos

1. **Datas digitadas erradas em duas abas**, já confirmadas com quem mantém a
   planilha e registradas em `MES_CONFIRMADO` no topo de `atualizar.py`:
   `JAN-26` tem lançamentos datados de ago/2025 e `ABR-26` de mai/2026 — em ambos
   o mês certo é o do nome da aba. O painel mostra a data real ao lado, para o
   problema não se perder.
2. **`FRETE CARRADAS JUL-26 `** (com espaço no fim) dentro do arquivo principal é
   uma **cópia de junho**. O julho de verdade está em
   `BASE FRETE CARRADAS ENVIO JUL - 26.xlsx`, e é esse que o painel usa.

Segue aberto: em **janeiro** o resumo (R$ 1.084.940,71) e o detalhe
(R$ 1.308.362,10) divergem em **R$ 223.421,39**. O painel usa o resumo, como
combinado, e a aba de conferência marca a divergência.

### Nome de obra escrito de formas diferentes

O script une automaticamente o que é **só diferença de grafia** — acento,
espaço, hífen — e diz o que uniu:

```
MINERADORA PF     <-  MINERADORA PF, MINERADORA-PF
OLINDA NOVA - MA  <-  OLINDA NOVA - MA, OLINDA NOVA-MA
TAIPAS - TO       <-  TAIPAS - TO, TAIPAS-TO
DUERE-TO          <-  DUERE-TO, DUERÉ-TO
```

O que **não** une, e lista para você confirmar, porque é decisão de quem conhece
o contrato:

| Termo | Nomes distintos |
|---|---|
| AUGUSTINOPOLIS | `AUGUSTINOPOLIS-TO` · `AUGUSTINOPOLIS TO (EDEC)` · `MANUTENÇAO DE VIAS AGETO(AUGUSTINOPOLIS -TO` |
| PALMEIROPOLIS | `PALMEIROPOLIS-TO` · `CONSORCIO TOCANTIS (PALMEIROPOLIS-TO)` |
| PINHEIRO | `UA PINHEIRO` · `UA PINHEIRO - MA` · `OLINDA NOVA - MA (PINHEIRO)` |
| OLINDA NOVA | `OLINDA NOVA - MA` · `UA OLINDA NOVA - MA` · `OLINDA NOVA - MA (PINHEIRO)` |
| DUERE | `DUERE-TO` · `TUCUMA DUERE` |

Se algum par é a mesma obra, padronize o nome na planilha e rode o script de
novo — ou me diga e eu adiciono a regra.

---

## O botão "mostrar pessoal"

Desligado por padrão. Ele esconde as 23 contas de folha — salário, FGTS, INSS,
IRRF, férias, rescisões, plano de saúde, benefícios, vale transporte, contribuição
sindical — para o detalhe de custo ficar legível.

Duas coisas importantes:

- **Ligado, o custo do painel fecha exatamente com o total do relatório do ERP**
  (R$ 19.002.148,51 em jan–jul). Desligado, cai R$ 3.256.120,71, que é a folha.
- **A aba Resultado usa sempre o custo cheio**, com folha, ligado ou desligado.
  O resultado da operação não muda porque alguém escondeu uma coluna. O Excel
  exportado sem folha sai com `-sem-folha` no nome, para não haver confusão depois.

Para mudar o que conta como pessoal, edite no topo de `atualizar.py`:

```python
GRUPOS_DE_PESSOAL = {410}          # DESPESAS COM PESSOAL, inteiro
CONTAS_DE_PESSOAL = {1360, 1370}   # contribuição sindical, fora do grupo
```

Marcar o **grupo** inteiro é de propósito: se o ERP criar uma conta de benefício
nova, ela já entra na marcação sozinha.

---

## Baixar o Excel

Botão no topo. Nove abas — Resumo, Resultado mês a mês, Por grupo, Por conta,
Conta × mês, Onde agir, Fornecedores, Lançamentos e Conferência — em formato pt-BR,
com cabeçalho fixo e filtro automático. Respeita os filtros da tela, e a aba
`Resumo` registra qual recorte foi exportado.

---

## Detalhes que mudam a leitura dos números

- **Receita não lançada não é prejuízo.** Maio e junho não têm receita lançada. O
  ERP imprime `Receita (-) Custo` de −2,2 mi e −2,6 mi nesses meses, tratando
  receita ausente como zero. O painel mostra *receita não lançada* e **não calcula
  resultado** ali: contar zero produziria um prejuízo que não existe.
- **Mês sem relatório não é zero.** Meses sem nenhuma fonte aparecem hachurados
  e rotulados *sem dados*. Meses que só têm o razão aparecem como *parcial* (ver
  a seção acima).
- **`TOTAL ACUMULADO ANO` do PDF acumula desde janeiro**, não desde o início do
  trimestre. O painel nunca soma essa coluna entre arquivos; usa como conferência.
- **O orçado vem da planilha, não do PDF.** Conferi 363 células: 361 batem. As 2
  exceções são a conta 290, cujo nome longo se sobrepõe fisicamente à primeira
  coluna de valor e entrelaça os caracteres — nenhum recorte separa isso. A aba
  Dados mostra quantas células conferiram em cada arquivo.
- **A conta 290 (aluguel de máquinas próprias) é rateio interno, não caixa.** Está
  nos totais porque é assim que o relatório do ERP fecha.
- **O diesel do SECE214 mede consumo do estoque**, e o custo correspondente está na
  conta 380. São a mesma coisa vista de dois ângulos, e não coincidem mês a mês.

---

## O que os dados mostram hoje (jan–jul/2026)

Nos sete meses, a operação **perdeu R$ 3.442.498,97**: receita de R$ 15,56 mi
contra custo de R$ 19,00 mi — margem de −22,1%. O previsto para os mesmos meses
era **positivo em R$ 1.218.562,80**. Fevereiro, abril, junho e julho fecharam no
vermelho.

**O problema não é faturamento.** A receita realizada ficou R$ 431.751,05 **acima**
do orçado. O resultado virou porque o custo passou R$ 5.092.812,82 do previsto —
136,6% da meta. Três contas explicam 80% desse estouro:

| Conta | Orçado jan–jul | Realizado | Excesso |
|---|---|---|---|
| 380 Óleo diesel | R$ 3,48 mi | R$ 6,32 mi | +R$ 2,84 mi |
| 1200 Peças, acessórios e pneus | R$ 1,51 mi | R$ 4,07 mi | +R$ 2,56 mi |
| 1440 IPVA / Licenciamento | R$ 0 | R$ 1,45 mi | +R$ 1,45 mi |

São R$ 6,84 mi de um estouro total de R$ 8,19 mi, distribuído em 34 contas. O
custo desta coordenação é essencialmente **rodar e manter frota**, e é aí que o
desvio está. A aba **Onde agir** lista tudo ordenado pelo excesso em reais.

Julho é o pior mês corrido: **−R$ 773.135,73**, com a menor receita dos sete
(R$ 2,05 mi) e o segundo maior custo (R$ 2,82 mi).

---

## Estrutura

```
index.html              a página
css/estilo.css          paleta e componentes
js/dados.js             gerado por atualizar.py — não edite à mão
js/graficos.js          gráficos em SVG
js/app.js               estado, filtros, agregações e tabelas
js/leitor.js            leitura de .xlsx de razão no navegador
js/xlsx.js              escrita do Excel + montagem das abas
atualizar.py            planilhas/ -> js/dados.js
leitores/               analise_custos (PDF), orcamento (.xls), inversao, diesel, xlsx_raw, xls_biff
planilhas/              analise/ orcamento/ inversoes/ diesel/
```

Requisitos: **Python 3.9+** com `pdfplumber`, e um navegador atual.

### Publicar

```bash
git add -A && git commit -m "painel de resultado" && git push
```

No GitHub: **Settings → Pages → Source: branch `main`, pasta `/ (root)`**.

Repositório público deixa os dados financeiros do centro de custo legíveis por
qualquer um, e o GitHub mantém cache de commits mesmo depois de apagados. Para uso
interno, deixe privado — Pages privado exige plano pago; a alternativa é
`python atualizar.py --bundle`, que gera `dashboard-completo.html`, um arquivo só,
sem dependência externa, que abre por duplo clique.
