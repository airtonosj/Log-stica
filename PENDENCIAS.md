# Pendências dos dados — CC 2930

O que está errado nas fontes, o que ainda falta coletar, e o que cada pendência
está bloqueando no painel. Todos os valores foram conferidos contra os arquivos
de origem.

Versão navegável, para compartilhar:
<https://claude.ai/code/artifact/9d744066-d633-485d-b748-37c864c77f00>

> **Atualizado com o relatório `07 a 09` e com as planilhas de frete novas.** O
> relatório trouxe agosto e setembro e, sem estar no pedido, **refez julho**: a
> receita do mês caiu R$ 551.949,85. São **nove meses de custo e oito de
> receita** — setembro ainda não tem receita lançada, então entra no custo e fica
> fora do resultado.
>
> Do lado do frete: chegaram **agosto e setembro**, e o arquivo do agro de maio
> provou que **a aba `ABR-26` é de maio**. Com isso maio deixou de ser o mês sem
> planilha — **agora é abril**. Duas pendências novas do lado do ERP, duas do
> frete resolvidas.

| | |
|---|---|
| Resultado jan–ago | **−R$ 4.199.984,94** — era para ser +R$ 1.469.999,42 |
| Receita jan–ago | **abaixo** do orçado em R$ 517.788,77 — R$ 17.323.714,86 |
| Custo jan–ago | **acima** do orçado em R$ 5.152.195,59 — R$ 21.523.699,80 (131,5%) |
| Custo jan–set | R$ 23.979.247,37 contra R$ 18.818.829,45 orçados (127,4%) |
| Meses no vermelho | **5 de 8** — fevereiro, abril, junho, julho, agosto |
| Concentração do estouro | **3 contas** explicam 83,6% dele, de 33 estouradas |

O ponto que o painel deixa evidente: **o problema é custo.** A receita de jan–ago
ficou R$ 517.788,77 abaixo do orçado, e ficou só por causa da revisão de julho
(`ERP-3`) — até o relatório anterior ela estava acima. O custo passou
R$ 5,15 mi do previsto, dez vezes a falta de receita, e quase toda essa
diferença continua em três contas.

---

## Parte 1 — O que está errado nos dados

O código diz onde consertar: `FC` nas planilhas de frete carrada, `ERP` no
sistema, `ORC` no orçamento aprovado, `PDF` no relatório de análise de custos,
`REC` na conciliação da receita.

### ORC-1 · Três contas explicam 84% do estouro — *aberto*

| Conta | Orçado jan–set | Realizado | Excesso |
|---|---|---|---|
| 380 Óleo diesel | 4.727.675,02 | 8.273.061,07 | **+3.545.386,05** |
| 1200 Peças, acessórios e pneus | 2.055.510,87 | 5.206.274,55 | **+3.150.763,68** |
| 1440 IPVA / Licenciamento | 0,00 | 1.454.717,28 | **+1.454.717,28** |
| | | | **8.150.867,01 de 9.746.990,91** |

É a lista mais curta possível para um plano de ação: três contas, 83,6% do
estouro — a mesma proporção de dois meses atrás, com R$ 1,3 mi a mais dentro
dela. Diesel e peças são consumo de frota; IPVA é o caso do `ORC-2`.

**O grupo inteiro de materiais está em 251,1%** (orçado R$ 2,09 mi, realizado
R$ 5,24 mi) e o de custos diretos em 176,6%.

### ORC-2 · IPVA e licenciamento: R$ 1,45 mi gastos, zero orçado — *aberto*

A conta 1440 não tem nenhum valor previsto no ano e realizou R$ 1.454.717,28 em
jan–set. Como o orçado é zero, o grupo Despesas tributárias aparece com **5.205%
de execução** e a comparação do grupo perde qualquer sentido.

**Decisão que falta:** ou o IPVA entra no orçamento do centro de custo, ou ele
pertence a outro centro e está sendo lançado aqui por engano. Enquanto não se
decide, esse é o terceiro maior estouro do ano e ninguém pode ser cobrado por
ele, porque não havia meta.

### ORC-3 · Diesel estoura enquanto combustível sobra — *aberto*

| Conta | Orçado jan–set | Realizado | Desvio |
|---|---|---|---|
| 380 Óleo diesel | 4.727.675,02 | 8.273.061,07 | +3.545.386,05 |
| 820 Combustível | 2.672.164,13 | 2.071.676,28 | −600.487,85 |

O diesel passa muito do previsto enquanto o combustível geral fica abaixo. Isso
sugere que a divisão entre as duas contas no orçamento não corresponde à forma
como o ERP classifica o lançamento — mas **a soma também estoura**:
R$ 7.399.839,15 orçados contra R$ 10.344.737,35 realizados, R$ 2,94 mi acima.
Rever a divisão explica parte do desvio por conta; não explica o desvio total.

### ERP-1 · Junho mudou de valor entre dois relatórios — *contornado*

O mesmo mês, dois relatórios, dois números:

| | relatório `04 a 06` | relatório `05 a 07` | diferença |
|---|---|---|---|
| custo de junho | 2.638.995,78 | **2.643.116,20** | +4.120,42 |
| receita de junho | em branco | **2.385.093,92** | — |
| receita de maio | em branco | **2.386.015,65** | — |

Não é erro do ERP: ele lança retroativo, então o relatório mais novo traz o mês
mais completo. O painel usa o de **período mais recente**, e a prova de que essa
é a escolha certa foi o acumulado impresso: em agosto, jan–jul fechava em
R$ 19.002.148,51 com o junho novo, e não fechava com o antigo.

**Por que fica registrado:** um número já divulgado mudou. Se alguém tem um
relatório de junho impresso antes de agosto, ele está R$ 4.120,42 defasado.

Esse mesmo teste **deixou de fechar** com o relatório de outubro — é o `ERP-4`.

### ERP-3 · Julho perdeu R$ 551.949,85 de receita — *contornado* · novo

Aconteceu de novo, e desta vez para baixo — e com a receita, não com o custo:

| julho | relatório `05 a 07` | relatório `07 a 09` | diferença |
|---|---|---|---|
| custo | 2.820.672,13 | 2.820.672,13 | **0,00** |
| receita | 2.047.536,40 | **1.495.586,55** | **−551.949,85** |
| resultado | −773.135,73 | **−1.325.085,58** | −551.949,85 |

O custo de julho não mudou **em nenhuma das 62 contas** — só a receita. Pela
mesma regra do `ERP-1`, vale o relatório de período mais recente, e o acumulado
de receita impresso (R$ 17.323.714,86) fecha ao centavo com a soma dos meses
usando o julho novo. Ou seja: a revisão é do ERP e está consistente.

**Por que fica registrado:** é a diferença entre julho fechar em −R$ 773 mil ou
em −R$ 1,33 mi, e é o único motivo de a receita de jan–ago aparecer abaixo do
orçado. Vale entender o que foi estornado ou reclassificado — pode ser
faturamento que mudou de mês, e aí ele reaparece em setembro ou outubro.

### ERP-4 · O acumulado não fecha por R$ 2.060,21 — *aberto* · novo

O relatório imprime um `TOTAL ACUMULADO ANO` que acumula desde janeiro,
inclusive os meses que ele não mostra. É a única conferência que enxerga o
passado, e agora ela acusa:

| jan–set | valor |
|---|---|
| custo impresso no relatório `07 a 09` | 23.977.187,16 |
| soma dos nove meses guardados no painel | **23.979.247,37** |
| diferença | **2.060,21** |

Julho, agosto e setembro vêm desse mesmo relatório, então não é ali. **Algum mês
entre janeiro e junho encolheu R$ 2.060,21 no ERP depois que o relatório daquele
mês saiu** — e o relatório novo não mostra as colunas desses meses, então não dá
para saber qual.

A receita, no mesmo teste, fecha ao centavo. O valor é pequeno (0,009% do custo)
e não muda nenhuma conclusão, mas é a prova de que os meses antigos continuam se
mexendo.

**O que resolve:** um `FFOR501` cobrindo jan–jun tirado hoje. O painel aceita
relatórios sobrepostos — o mais recente vence, e `python atualizar.py` mostra na
hora o que mudou de valor.

### REC-1 · Janeiro: R$ 223.421,39 rodados e não faturados — *aberto*

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

### FC-1 · A aba `ABR-26` é de maio — *resolvido* · novo

Duas abas têm nome e datas em desacordo, e **a resposta é diferente em cada
uma**:

| Aba | Linhas | Datas | Vence | Por quê |
|---|---|---|---|---|
| `JAN-26` | 712 | ago/2025 | **o nome** | ago/2025 é um ano e um mês antes do exercício: data furada, não mês trocado |
| `ABR-26` | 848 | 01/05 a 31/05/2026 | **a data** | prova de fora da planilha, abaixo |

A prova da aba `ABR-26` veio com os arquivos do agro de maio. Dentro dela há 109
viagens com CR `AGRO` somando **R$ 147.298,31**. O arquivo
`Cms que rotaram no agro Maio-26.xlsx`, criado em 08/06/2026 e intitulado
**"FRETE CARRADA MAIO DE 2026"**, tem 109 viagens somando **R$ 147.298,31** — e
as **109 de 109 linhas são idênticas**: mesma data, mesmo veículo, mesmo valor,
mesma nota fiscal. As 848 linhas cobrem de 1º a 31 de maio, um mês civil
inteiro, não uma sobra de fim de mês.

**O que mudou no painel:** a aba `ABR-26` passou a valer como **maio**
(R$ 1.378.218,13 em 11 obras). Com isso **a pendência de maio caiu** — a
planilha existe, só está com o nome errado — e **abril** é que ficou sem frete
carrada.

**O que resolve de vez:** renomear a aba na planilha. Enquanto não renomeia, a
correção vive em `MES_CONFIRMADO` no topo de `atualizar.py`, e o painel mostra
"aba RESUMO ABR-26 — mês confirmado" na linha de maio para ninguém achar que é
defeito.

### FC-2 · O resumo de julho somou uma obra dentro da outra — *contornado*

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
de R$ 1.604.128,61. O julho verdadeiro está na aba `FRETE CARRADAS JUL-26` (sem
o espaço), no mesmo arquivo.

Antes o painel escapava usando o arquivo `BASE FRETE CARRADAS ENVIO JUL - 26`,
cujo resumo de julho era o único preenchido. Na planilha nova o resumo de julho
está preenchido também, e a escolha pela ordem das abas pegaria a cópia de junho
— somando junho duas vezes, R$ 265.842,66 a mais em julho. **Agora quem desempata
é a data dos lançamentos**: entre duas abas de detalhe do mesmo mês, vale a que
tem as datas do mês (`_escolher_detalhe` em `leitores/frete_carrada.py`). O
terminal lista a aba descartada a cada execução.

**Sugestão, que continua valendo:** apagar a aba duplicada. Quem somar as abas
do arquivo à mão ainda conta junho duas vezes.

### ERP-2 · O razão não vê metade do custo — *entendido, não é defeito*

É o que cada relatório mede. O razão lista uma linha por nota em contas a pagar,
e o óleo diesel é baixa de estoque — nunca vira nota.

| Conta | Análise de custos | Razão |
|---|---|---|
| 380 Óleo diesel | 8.273.061,07 | **0,00** |
| 1200 Peças e pneus | 5.206.274,55 | 3.670.245,38 |
| **Custo total jan–set** | **23.979.247,37** | **13.566.199,59** |

**Consequência:** o painel usa a análise de custos para todo valor, e o razão só
para saber quem recebeu. A aba Fornecedores cobre 57% do custo e avisa isso no
topo — ela não fecha com as outras, e não deve.

### PDF-1 · Uma célula de orçado por PDF não sai do arquivo — *contornado*

O nome da conta 290 é longo o bastante para se sobrepor à primeira coluna de
valor, e os caracteres se entrelaçam. São 4 células em 735 (uma em cada PDF:
janeiro, abril, maio, julho); todas as outras conferem exatamente com a planilha.

O relatório `07 a 09` veio também em `.xlsx`, e lá a célula sai limpa:
R$ 401.702,66, igual à planilha. O arquivo está em `planilhas/analise/` ao lado
do PDF — o leitor usa o PDF, o xlsx fica como conferência.

**Como está resolvido:** o orçado vem sempre da planilha, e o PDF serve de
conferência. A aba Dados mostra quantas células conferiram em cada arquivo.

---

## Parte 2 — O que ainda falta coletar

As planilhas de frete novas fecharam agosto, setembro e maio, e abriram abril.
Só o primeiro item abaixo bloqueia número de resultado; o resto é **composição**
da receita — quanto de cada mês veio de frete carrada e quanto veio do outro
serviço.

1. **A receita de setembro.** O ERP traz o mês com custo (R$ 2.455.547,57) e com
   a receita **em branco**. O painel não inventa zero: setembro entra no custo e
   fica fora do resultado, da margem e da contagem de meses no vermelho. É a
   única coisa que falta para o trimestre fechar. Pode ser que ela entre sozinha
   no próximo `FFOR501` — foi o que aconteceu com maio e junho.

2. **O frete (não carrada) de maio a agosto.** Com a receita do ERP conhecida,
   o valor que falta em cada mês é uma subtração, não um chute:

   | Mês | Receita do ERP | − frete carrada | = frete que falta |
   |---|---|---|---|
   | maio | 2.386.015,65 | 1.378.218,13 | **1.007.797,52** |
   | junho | 2.385.093,92 | 1.604.128,61 | **780.965,31** |
   | julho | 1.495.586,55 | 1.338.285,95 | **157.300,60** |
   | agosto | 2.316.015,17 | 1.364.314,60 | **951.700,57** |

   Julho mudou muito aqui: com a receita revista (`ERP-3`), o frete que falta
   caiu de R$ 709.250,45 para R$ 157.300,60. Abril saiu da tabela porque agora é
   ele que está sem frete carrada (`FC-1`), e sem as duas parcelas não dá para
   subtrair. Os três valores enviados que ainda não têm mês são R$ 994.097,85 ·
   R$ 659.741,89 · R$ 775.475,91, e **nenhum fecha nenhum desses meses**: o mais
   próximo é 775.475,91 contra os 780.965,31 de junho, errando por R$ 5.489,40;
   depois 994.097,85 contra os 1.007.797,52 de maio, errando por R$ 13.699,67.
   Em janeiro, fevereiro e março o encaixe foi de 1 a 2 centavos, então essa
   diferença não é arredondamento — ou falta dado, ou esses três valores são de
   outros meses. Preencher em `planilhas/frete/faturamento-frete.csv`.

3. **O frete carrada de abril.** Não existe em nenhuma aba: `ABR-26` é de maio
   (`FC-1`) e não há outra. Abril é o único mês do ano sem a planilha, e sem ela
   não dá para separar a receita de abril em duas parcelas.

4. **Confirmar duas duplas de nome que podem ser a mesma obra.** Nenhuma das
   duas tem prova de valor, então **não** foram unidas — ficam como obras
   separadas no painel até alguém confirmar:

   | Nomes | Onde aparecem | Valor | Situação |
   |---|---|---|---|
   | `EDECOMPEC` · `EDECONPEC` | set · jul | 5.212,80 · 25.858,75 | separados; diferem só no "M"/"N" |
   | `TUCUMA DUERE` · `DUERE-TO` | jan · vários | 62.005,29 | **já unidos**, sem prova |

   `TUCUMA DUERE` é a única união da normalização sem prova de valor (ver
   Parte 3): se forem obras diferentes, some a linha `TUCUMADUERE` de
   `OBRAS_NORMALIZADAS` em `leitores/frete_carrada.py`. `EDECOMPEC`/`EDECONPEC`
   é o caso inverso — se forem a mesma, acrescente a linha.

5. **Um `FFOR501` de jan–jun tirado hoje**, para localizar os R$ 2.060,21 do
   `ERP-4`.

6. **Outubro em diante.** Tudo entra sem ajuste de código. O `FFOR501` e o razão
   (`detalhado.xlsx`) vão para `planilhas/analise/` e `planilhas/inversoes/`,
   podem vir trimestrais e podem repetir meses — o painel resolve a sobreposição
   sozinho e avisa o que mudou de valor. A planilha de frete vai para
   `planilhas/frete/`, e o mês repetido fica com o arquivo que concilia. Depois
   é só rodar `python atualizar.py`.

---

## Parte 3 — O que saiu da lista

### As obras foram normalizadas: 42 grafias, 24 obras

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
| mai | `AUGUSTINOPOLIS-TO` | `AUGUSTINOPOLIS TO (EDEC)` | 59.379,04 |
| mai | `UA PINHEIRO - MA` | `UA PINHEIRO` | 168.052,16 |
| mai | `UA OLINDA NOVA - MA` | `UA OLINDA NOVA` | 49.717,48 |
| ago | `AUGUSTINOPOLIS(EDEC)` | `AUGUSTINOPOLIS -TO` | 57.873,02 |
| ago | `PALMEROPOLIS-TO` | `PALMEIROPOLIS-TO` | 19.627,80 |
| set | `JC GONTIJO` | `JC GOTIJO` | 51.233,82 |

As três últimas vieram com agosto e setembro. Duas são letra faltando
(`PALMEROPOLIS` sem o "I", `GOTIJO` sem o "N") e a prova é a mesma: mesmo
centavo, mesmo mês, resumo contra detalhe. (As linhas de maio aparecem na aba
chamada `ABR-26` — ver `FC-1`.)

Duas coisas que essa conferência impediu:

- **`OLINDA NOVA - MA (PINHEIRO)` não é Pinheiro.** Ela aparece no mesmo resumo
  de março que `UA PINHEIRO - MA`, e um resumo tem uma linha por obra — logo são
  obras diferentes. O parêntese indica a unidade, não a obra. Juntar as duas
  teria somado duas obras distintas.
- **`TUCUMA DUERE` foi unida sem prova de valor.** Ela nunca aparece no mesmo
  resumo que `DUERE-TO`, o que permite a união mas não a prova. Está na Parte 2.

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
de R$ 1.495.586,55, depois da revisão do `ERP-3`. É o **segundo pior mês do
ano** (−R$ 1.325.085,58, atrás só de fevereiro) e o de **menor receita**.

---

## Conferência

- **Conciliação:** nos quatro PDFs, a soma das contas é igual ao rodapé
  `Custo Total Edeconsil`, com diferença de **R$ 0,00 nos 12 meses-relatório**.
- **PDF x xlsx:** o relatório `07 a 09` veio nos dois formatos. As **186 células
  de realizado** (62 contas × 3 meses) batem **exatamente**, uma por uma. A única
  diferença é a célula de orçado do `PDF-1`.
- **Acumulado:** a receita fecha ao centavo com o `TOTAL ACUMULADO ANO` impresso
  (R$ 17.323.714,86). O custo **não fecha por R$ 2.060,21** — é o `ERP-4`.
- **Mês a mês:** as 25 células de custo (9), receita (8) e resultado (8) do
  painel conferem com o rodapé impresso, uma por uma.
- **Razão:** os 9.946 lançamentos conciliam com o total de cada arquivo, e julho
  aparece uma vez só — o arquivo trimestral substitui o mensal (`ERP-3` tem a
  mesma lógica do lado do custo: R$ 1.544.364,43 → R$ 1.659.560,44, o INSS do mês
  lançado depois).
- **Orçado:** 731 das 735 células conferem exatamente com a planilha do programa
  orçamentário (176 + 185 + 185 + 185); as 4 restantes são o caso `PDF-1`.

- **Frete carrada:** nos 8 meses, resumo e detalhe batem obra a obra, menos os
  dois casos conhecidos — janeiro (`REC-1`) e julho (`FC-2`). Agosto e setembro
  fecham ao centavo. As 848 linhas de maio e as 109 do arquivo do agro batem
  linha a linha (`FC-1`).

Fontes: análise de custos `FFOR501` (jan–set, 4 relatórios) · programa
orçamentário `F.AP.05` · razão `FFOR001/FFOR401` (jan–set) · frete carrada
(jan–mar, mai–set) · consumo de diesel `SECE214`.
