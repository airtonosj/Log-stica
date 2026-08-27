# Pendências dos dados — CC 2930

O que está errado nas fontes, o que ainda falta coletar, e o que cada pendência
está bloqueando no painel. Todos os valores foram conferidos contra os arquivos
de origem.

Versão navegável, para compartilhar:
<https://claude.ai/code/artifact/9d744066-d633-485d-b748-37c864c77f00>

> **Atualizado com o relatório `05 a 07`.** Ele trouxe julho e, sem estar no
> pedido, a receita realizada de maio e junho — os dois meses que estavam em
> branco. Agora **os sete meses têm custo e receita**, e o painel calcula
> resultado em todos. Quatro pendências caíram; três apareceram.

| | |
|---|---|
| Resultado jan–jul | **−R$ 3.442.498,97** — era para ser +R$ 1.218.562,80 |
| Receita | **acima** do orçado em R$ 431.751,05 — R$ 15.559.649,54 |
| Custo | **acima** do orçado em R$ 5.092.812,82 — R$ 19.002.148,51 (136,6%) |
| Meses no vermelho | **4 de 7** — fevereiro, abril, junho, julho |
| Concentração do estouro | **3 contas** explicam 80% dele, de 34 estouradas |

O ponto que o painel deixa evidente: **o problema não é faturamento.** A receita
bateu o orçado. O resultado virou porque o custo passou R$ 5,09 mi do previsto, e
quase toda essa diferença está em três contas.

---

## Parte 1 — O que está errado nos dados

O código diz onde consertar: `FC` nas planilhas de frete carrada, `ERP` no
sistema, `ORC` no orçamento aprovado, `PDF` no relatório de análise de custos,
`REC` na conciliação da receita.

### ORC-1 · Três contas explicam 80% do estouro — *aberto*

| Conta | Orçado jan–jul | Realizado | Excesso |
|---|---|---|---|
| 380 Óleo diesel | 3.479.416,66 | 6.318.391,29 | **+2.838.974,63** |
| 1200 Peças, acessórios e pneus | 1.512.789,85 | 4.072.783,35 | **+2.559.993,50** |
| 1440 IPVA / Licenciamento | 0,00 | 1.445.605,02 | **+1.445.605,02** |
| | | | **6.844.573,15 de 8.187.589,65** |

É a lista mais curta possível para um plano de ação: três contas, 83,6% do
estouro. Diesel e peças são consumo de frota; IPVA é o caso do `ORC-2`.

**O grupo inteiro de materiais está em 266,6%** (orçado R$ 1,54 mi, realizado
R$ 4,10 mi) e o de custos diretos em 183,2%.

### ORC-2 · IPVA e licenciamento: R$ 1,45 mi gastos, zero orçado — *aberto*

A conta 1440 não tem nenhum valor previsto no ano e realizou R$ 1.445.605,02 em
jan–jul. Como o orçado é zero, o grupo Despesas tributárias aparece com **6.658%
de execução** e a comparação do grupo perde qualquer sentido.

**Decisão que falta:** ou o IPVA entra no orçamento do centro de custo, ou ele
pertence a outro centro e está sendo lançado aqui por engano. Enquanto não se
decide, esse é o terceiro maior estouro do ano e ninguém pode ser cobrado por
ele, porque não havia meta.

### ORC-3 · Diesel estoura enquanto combustível sobra — *aberto*

| Conta | Orçado jan–jul | Realizado | Desvio |
|---|---|---|---|
| 380 Óleo diesel | 3.479.416,66 | 6.318.391,29 | +2.838.974,63 |
| 820 Combustível | 1.966.626,79 | 1.662.839,78 | −303.787,01 |

O diesel passa muito do previsto enquanto o combustível geral fica abaixo. Isso
sugere que a divisão entre as duas contas no orçamento não corresponde à forma
como o ERP classifica o lançamento — mas, diferente do que parecia com seis
meses, **a soma também estoura**: R$ 5.446.043,45 orçados contra
R$ 7.981.231,07 realizados, R$ 2,54 mi acima. Rever a divisão explica parte do
desvio por conta; não explica o desvio total.

### ERP-1 · Junho mudou de valor entre dois relatórios — *contornado* · novo

O mesmo mês, dois relatórios, dois números:

| | relatório `04 a 06` | relatório `05 a 07` | diferença |
|---|---|---|---|
| custo de junho | 2.638.995,78 | **2.643.116,20** | +4.120,42 |
| receita de junho | em branco | **2.385.093,92** | — |
| receita de maio | em branco | **2.386.015,65** | — |

Não é erro do ERP: ele lança retroativo, então o relatório mais novo traz o mês
mais completo. O painel usa o de **período mais recente**, e a prova de que essa
é a escolha certa é o acumulado impresso: jan–jul fecha em R$ 19.002.148,51 com
o junho novo, e não fecha com o antigo.

**Por que fica registrado:** um número já divulgado mudou. Se alguém tem um
relatório de junho impresso antes de agosto, ele está R$ 4.120,42 defasado.

### REC-1 · Janeiro: R$ 223.421,39 rodados e não faturados — *aberto* · novo

Você decidiu que em janeiro vale o **detalhe** da planilha de frete carrada
(R$ 1.308.362,10) e não o resumo (R$ 1.084.940,71). O painel já trabalha assim.
A consequência aparece na conciliação da receita:

| Mês | Frete carrada | Frete | Soma | Receita do ERP | Sobra |
|---|---|---|---|---|---|
| janeiro | 1.308.362,10 | 1.013.072,36 | 2.321.434,46 | 2.098.013,08 | **+223.421,38** |
| fevereiro | 939.543,50 | 719.052,09 | 1.658.595,59 | 1.658.595,60 | −0,01 |
| março | 1.560.327,29 | 1.066.086,43 | 2.626.413,72 | 2.626.413,74 | −0,02 |

Fevereiro e março fecham ao centavo. Janeiro sobra exatamente a diferença entre
o detalhe e o resumo. **Se o detalhe está certo, esse frete rodou e não entrou na
receita do mês** — não é erro de planilha, é faturamento que faltou.

Vale conferir se esses R$ 223 mil foram faturados em outro mês ou se ficaram
para trás. É o único item desta lista que é dinheiro, não classificação.

### FC-1 · Datas digitadas erradas em duas abas — *contornado*

Em `JAN-26` as 712 linhas de detalhe estão datadas de **agosto de 2025**; em
`ABR-26` as 848 linhas estão datadas de **maio de 2026**. Você confirmou que o
mês certo é o do nome da aba, e o painel trabalha assim (constante
`MES_CONFIRMADO` no topo de `atualizar.py`).

**Por que ainda está aqui:** a correção vive no código do painel, não na
planilha. Quem abrir o arquivo continua vendo as datas erradas.

### FC-2 · O resumo de julho somou uma obra dentro da outra — *contornado* · novo

No `RESUMO FRETE CARRADAS JUL-26`, `DUERE-TO` não aparece e `PALMEIROPOLIS-TO`
aparece com R$ 148.851,36. No detalhe, as duas estão separadas:

```
132.686,20  PALMEIROPOLIS - TO
 16.165,16  DUERE - TO
--------------------
148.851,36  exatamente o valor do resumo
```

Por isso o painel passou a usar o **detalhe** como fonte do frete carrada em
todos os meses, com o resumo servindo de conferência. O total do mês está certo
nos dois; só a divisão por obra está errada no resumo.

### FC-3 · A aba de julho é cópia de junho — *contornado*

`FRETE CARRADAS JUL-26 ` — com espaço no fim do nome — dentro do arquivo
principal traz as mesmas 807 linhas de junho, com as mesmas datas e o mesmo total
de R$ 1.604.128,61. O julho verdadeiro está em
`BASE FRETE CARRADAS ENVIO JUL - 26`, e é esse que o painel usa.

**Sugestão:** apagar a aba duplicada. Quem somar as abas do arquivo hoje conta
junho duas vezes.

### ERP-2 · O razão não vê metade do custo — *entendido, não é defeito*

É o que cada relatório mede. O razão lista uma linha por nota em contas a pagar,
e o óleo diesel é baixa de estoque — nunca vira nota.

| Conta | Análise de custos | Razão |
|---|---|---|
| 380 Óleo diesel | 6.318.391,29 | **0,00** |
| 1200 Peças e pneus | 4.072.783,35 | 2.867.379,00 |
| **Custo total jan–jul** | **19.002.148,51** | **10.789.446,65** |

**Consequência:** o painel usa a análise de custos para todo valor, e o razão só
para saber quem recebeu. A aba Fornecedores cobre 57% do custo e avisa isso no
topo — ela não fecha com as outras, e não deve.

### PDF-1 · Uma célula de orçado por PDF não sai do arquivo — *contornado*

O nome da conta 290 é longo o bastante para se sobrepor à primeira coluna de
valor, e os caracteres se entrelaçam. São 3 células em 549 (uma em cada PDF:
janeiro, abril, maio); todas as outras conferem exatamente com a planilha.

**Como está resolvido:** o orçado vem sempre da planilha, e o PDF serve de
conferência. A aba Dados mostra quantas células conferiram em cada arquivo.

---

## Parte 2 — O que ainda falta coletar

A lista encurtou. Nada aqui bloqueia mais o resultado — a receita e o custo dos
sete meses estão completos. O que falta é a **composição** da receita: saber
quanto de cada mês veio de frete carrada e quanto veio do outro serviço.

1. **O frete (não carrada) de abril, junho e julho.** Agora que a receita do ERP
   é conhecida, o valor que falta em cada mês é uma subtração, não um chute:

   | Mês | Receita do ERP | − frete carrada | = frete que falta |
   |---|---|---|---|
   | abril | 2.357.981,15 | 1.378.218,13 | **979.763,02** |
   | junho | 2.385.093,92 | 1.604.128,61 | **780.965,31** |
   | julho | 2.047.536,40 | 1.338.285,95 | **709.250,45** |

   Os três valores enviados que ainda não têm mês são R$ 994.097,85 ·
   R$ 659.741,89 · R$ 775.475,91, e **nenhum fecha nenhum desses meses**: o mais
   próximo é 775.475,91 contra os 780.965,31 de junho, e erra por R$ 5.489,40.
   Em janeiro, fevereiro e março o encaixe foi de 1 a 2 centavos, então essa
   diferença não é arredondamento — ou falta dado, ou esses três valores são de
   outros meses. Preencher em `planilhas/frete/faturamento-frete.csv`.

2. **O frete carrada de maio.** Não existe em nenhuma aba — a planilha do mês
   nunca foi feita. Sem ela, maio é o único mês em que não dá para separar a
   receita em duas parcelas de jeito nenhum.

3. **Confirmar se `TUCUMA DUERE` é a mesma obra que `DUERE-TO`.** É a única
   união da normalização que não tem prova de valor (ver Parte 3). Se forem
   obras diferentes, some a linha `TUCUMADUERE` de `OBRAS_NORMALIZADAS` em
   `leitores/frete_carrada.py` e os R$ 62.005,29 de janeiro se separam de novo.

4. **Agosto em diante.** O relatório `FFOR501` de agosto, quando sair, entra sem
   ajuste de código: salvar em `planilhas/analise/` e rodar
   `python atualizar.py`.

---

## Parte 3 — O que saiu da lista

### As obras foram normalizadas: 27 grafias, 19 obras

O ranking por obra estava partido — a mesma obra escrita de até cinco formas
aparecia como cinco linhas menores. Cada união está registrada em
`OBRAS_NORMALIZADAS`, e a prova de cada uma em `PROVA_DA_NORMALIZACAO`.

A prova forte é **mesmo valor, mesmo mês, planilhas diferentes** — o resumo e o
detalhe do mesmo mês trazendo o mesmo centavo sob nomes diferentes:

| Mês | No resumo | No detalhe | Valor |
|---|---|---|---|
| mar | `MANUTENÇAO DE VIAS AGETO(AUGUSTINOPOLIS -TO` | `AUGUSTINOPOLIS-TO` | 2.251,20 |
| mar | `OLINDA NOVA - MA (PINHEIRO)` | `OLINDA NOVA - MA` | 272.743,96 |
| mar | `CONSORCIO TOCANTIS (PALMEIROPOLIS-TO)` | `PALMEIROPOLIS-TO` | 34.282,75 |
| abr | `AUGUSTINOPOLIS-TO` | `AUGUSTINOPOLIS TO (EDEC)` | 59.379,04 |
| abr | `UA PINHEIRO - MA` | `UA PINHEIRO` | 168.052,16 |
| abr | `UA OLINDA NOVA - MA` | `UA OLINDA NOVA` | 49.717,48 |

Duas coisas que essa conferência impediu:

- **`OLINDA NOVA - MA (PINHEIRO)` não é Pinheiro.** Ela aparece no mesmo resumo
  de março que `UA PINHEIRO - MA`, e um resumo tem uma linha por obra — logo são
  obras diferentes. O parêntese indica a unidade, não a obra. Juntar as duas
  teria somado duas obras distintas.
- **`TUCUMA DUERE` foi unida sem prova de valor.** Ela nunca aparece no mesmo
  resumo que `DUERE-TO`, o que permite a união mas não a prova. É o item 3 da
  Parte 2.

Há uma guarda no script para isso: se duas grafias que o mapa une caírem no
mesmo resumo, ele reclama em vez de somar em silêncio.

### A receita de maio e junho existe

O relatório `04 a 06` deixava a receita dos dois meses em branco e imprimia
`Receita (-) Custo` de −R$ 2,23 mi e −R$ 2,64 mi, tratando receita ausente como
zero — um prejuízo que não existia. O relatório `05 a 07` trouxe os valores:
R$ 2.386.015,65 e R$ 2.385.093,92. Maio deu **lucro** de R$ 159.483,91.

### Julho deixou de ser um mês parcial

Antes julho entrava marcado como parcial, com R$ 1.544.364,43 vindos só do
razão — sem diesel e sem receita. Agora tem custo de R$ 2.820.672,13 e receita
de R$ 2.047.536,40, e é o **pior mês corrido do ano**: −R$ 773.135,73, com a
menor receita dos sete meses.

---

## Conferência

- **Conciliação:** nos três PDFs, a soma das contas é igual ao rodapé
  `Custo Total Edeconsil`, com diferença de **R$ 0,00 em todos os meses**.
- **Acumulado:** a soma dos sete meses fecha ao centavo com o
  `TOTAL ACUMULADO ANO` impresso — custo R$ 19.002.148,51, receita
  R$ 15.559.649,54.
- **Mês a mês:** as 21 células de custo, receita e resultado do painel conferem
  com o rodapé impresso, uma por uma.
- **Orçado:** 546 das 549 células conferem exatamente com a planilha do programa
  orçamentário (176 + 185 + 185); as 3 restantes são o caso `PDF-1`.

Fontes: análise de custos `FFOR501` (jan–jul, 3 relatórios) · programa
orçamentário `F.AP.05` · razão `FFOR001/FFOR401` (jan–jul) · frete carrada
(jan–abr, jun–jul) · consumo de diesel `SECE214`.
