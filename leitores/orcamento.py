# -*- coding: utf-8 -*-
"""Parser do PROGRAMA ORÇAMENTÁRIO (formulário F.AP.05, .xls legado).

Layout da aba Planilha1 (índices base 0):
  linha 7   ano (col 1), nome do centro de custo (col 9), código do CC (col 17)
  linha 9   cabeçalho: DESCRIÇÃO (0) | CONTA (5) | JANEIRO..DEZEMBRO (6..17) | TOTAL (18)
  linha 10+ uma conta por linha

`CONTA` é a mesma chave que o relatório de inversão gerencial chama `Reduzida`
(layout A) ou `Cta` (layout B) — é o que permite cruzar orçado com realizado.

A hierarquia vem da ORDEM das linhas: cada código agregador abre um grupo e as
folhas seguintes pertencem a ele. Não dá para inferir grupo por "descrição em
maiúsculas": contas folha com sigla (FGTS, INSS, IRRF, ICMS, IPTU, ISS, PIS,
COFINS) também são maiúsculas.
"""
from . import xls_biff

LINHA_CABECALHO = 9
PRIMEIRA_LINHA = 10
ULTIMA_LINHA = 200
COL_DESCRICAO, COL_CONTA, COL_JANEIRO, COL_TOTAL = 0, 5, 6, 18

# Códigos que somam filhos em vez de receber lançamentos.
AGREGADORES = {
    20, 30, 40, 140, 150, 190, 230, 240,          # receitas
    260,                                          # CUSTOS E DESPESAS (raiz)
    270, 280, 1650,                               # custos diretos (+ não monetário)
    400, 410,                                     # pessoal
    700, 710,                                     # serviços
    1110, 1120,                                   # materiais
    1220, 1230,                                   # financeiras
    1300, 1310,                                   # tributárias
    1520, 1530,                                   # investimentos
    1710, 1720, 1730,                             # dividendos
}

# Escopo comparável com o relatório (subárvore de 260 CUSTOS E DESPESAS).
RAIZ_DESPESAS = 260
GRUPO_NAO_MONETARIO = 1650

# Agregadores que possuem folhas mas NÃO são despesa: receitas, investimentos e
# dividendos. Os grupos de despesa são deduzidos por exclusão — assim, se a
# planilha ganhar um grupo de despesa novo, ele entra sozinho.
#
# Cuidado: quem "possui" as folhas é o agregador de nível 2, não o de nível 1.
# As folhas de pessoal, por exemplo, ficam sob 410 e não sob 400 (a planilha
# repete o nome do grupo nos dois níveis). Listar os de nível 1 aqui faria os
# grupos sumirem de toda a análise.
AGREGADORES_NAO_DESPESA = {
    40,    # RECEITAS DE OBRAS E SERVIÇOS
    150,   # RECEITAS FINANCEIRAS
    190,   # OUTRAS RECEITAS
    240,   # RECEITAS GERENCIAIS
    1530,  # INVESTIMENTOS
    1730,  # DIVIDENDOS
}


def ler(caminho):
    """Devolve {ano, centroCusto, nomeCentroCusto, grupos, contas}."""
    abas = xls_biff.abrir(caminho)
    celulas = abas.get('Planilha1') or next(iter(abas.values()))

    def celula(linha, coluna):
        return celulas.get((linha, coluna))

    ano = celula(7, 1)
    nome_cc = celula(7, 9)
    codigo_cc = celula(7, 17)

    grupos, contas = [], []
    grupo_atual = None
    ordem = 0
    for linha in range(PRIMEIRA_LINHA, ULTIMA_LINHA):
        descricao, conta = celula(linha, COL_DESCRICAO), celula(linha, COL_CONTA)
        if conta is None:
            continue
        conta = int(conta)
        descricao = str(descricao or '').strip()
        meses = [round(float(celula(linha, c) or 0.0), 2)
                 for c in range(COL_JANEIRO, COL_JANEIRO + 12)]

        if conta in AGREGADORES:
            grupo_atual = conta
            grupos.append({
                'codigo': conta,
                'nome': descricao,
                'ordem': len(grupos),
                'orcado': meses,
                'total': round(sum(meses), 2),
            })
            continue

        ordem += 1
        contas.append({
            'cta': conta,
            'nome': descricao,
            'grupo': grupo_atual,
            'ordem': ordem,
            'orcado': meses,
            'total': round(sum(meses), 2),
        })

    return {
        'ano': int(ano) if isinstance(ano, (int, float)) else None,
        'centroCusto': (str(int(codigo_cc)) if isinstance(codigo_cc, (int, float))
                        else str(codigo_cc or '')),
        'nomeCentroCusto': str(nome_cc or '').strip(),
        'grupos': grupos,
        'contas': contas,
    }


def grupos_com_folhas(orcamento):
    """Códigos de agregador que realmente possuem contas folha, na ordem da planilha."""
    donos = {c['grupo'] for c in orcamento['contas'] if c['grupo'] is not None}
    return [g['codigo'] for g in orcamento['grupos'] if g['codigo'] in donos]


def grupo_de_despesa(orcamento):
    """{codigo_do_grupo: nome} apenas dos grupos comparáveis com o relatório."""
    por_codigo = {g['codigo']: g['nome'] for g in orcamento['grupos']}
    return {c: por_codigo[c] for c in grupos_com_folhas(orcamento)
            if c not in AGREGADORES_NAO_DESPESA}


def conferir_raiz(orcamento):
    """Confere que a soma dos 7 grupos de despesa reproduz a linha 260, mês a mês.

    Se falhar, a lista AGREGADORES está desalinhada com a planilha e todo o
    comparativo orçado × realizado sairia errado.
    """
    por_codigo = {g['codigo']: g for g in orcamento['grupos']}
    raiz = por_codigo.get(RAIZ_DESPESAS)
    if raiz is None:
        return {'ok': False, 'erro': f'grupo {RAIZ_DESPESAS} ausente na planilha'}
    # Somamos os agregadores de nível 2 (os que possuem folhas), nunca os de
    # nível 1, para não contar o mesmo valor duas vezes.
    grupos = list(grupo_de_despesa(orcamento))
    deltas = []
    for m in range(12):
        soma = sum(por_codigo[c]['orcado'][m] for c in grupos)
        deltas.append(round(soma - raiz['orcado'][m], 2))
    return {
        'ok': all(abs(d) <= 0.05 for d in deltas),
        'deltas': deltas,
        'totalRaiz': raiz['total'],
    }
