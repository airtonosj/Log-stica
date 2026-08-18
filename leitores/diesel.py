# -*- coding: utf-8 -*-
"""Parser do relatório de consumo de óleo diesel (SECE214.GER, Estoques).

Layout:
  linha 5   'Período:' (col E) + '01/06/2026-30/07/2026' (col F)
  linha 6   cabeçalho: Requisição | Emissão | Código do Produto | Descrição do
            Produto | Atendimento | Pedido | Atendido | Compra
  linha 7   'Centro de Custo:' | código | nome
  linha 8+  uma requisição por linha; a coluna Atendido (K) traz os litros
  fim       'Total das Quantidades por Unidade de Medida' e a linha 'LT | Litro'

Atenção: um arquivo pode cobrir mais de um mês (o exemplo cobre 01/06 a 30/07).
Cada requisição é atribuída ao mês da sua data de ATENDIMENTO, nunca ao período
do relatório como um todo.
"""
import re

from . import xlsx_raw

COL_REQUISICAO, COL_EMISSAO, COL_PRODUTO = 'A', 'B', 'C'
COL_DESCRICAO, COL_ATENDIMENTO, COL_PEDIDO = 'D', 'H', 'J'
COL_ATENDIDO, COL_COMPRA = 'K', 'L'

_ASSINATURA = {COL_REQUISICAO: 'Requisição', COL_EMISSAO: 'Emissão',
               COL_DESCRICAO: 'Descrição do Produto', COL_ATENDIDO: 'Atendido'}
_PERIODO = re.compile(r'(\d{2}/\d{2}/\d{4})\s*-\s*(\d{2}/\d{2}/\d{4})')


def e_relatorio_de_diesel(aba):
    return _linha_do_cabecalho(aba) is not None


def _linha_do_cabecalho(aba):
    for n in aba.numeros_de_linha()[:20]:
        linha = {k: str(v).strip() for k, v in aba.linha(n).items()}
        if all(linha.get(k) == esperado for k, esperado in _ASSINATURA.items()):
            return n
    return None


def _para_iso(texto):
    dia, mes, ano = texto.split('/')
    return f'{int(ano):04d}-{int(mes):02d}-{int(dia):02d}'


def _periodo(aba):
    for n in aba.numeros_de_linha()[:20]:
        for v in aba.linha(n).values():
            achado = _PERIODO.search(str(v))
            if achado:
                return _para_iso(achado.group(1)), _para_iso(achado.group(2))
    return None, None


def _centro_de_custo(aba):
    for n in aba.numeros_de_linha()[:30]:
        linha = aba.linha(n)
        for coluna, v in linha.items():
            if str(v).strip() == 'Centro de Custo:':
                seguintes = sorted(k for k in linha if k > coluna)
                codigo = str(linha.get(seguintes[0], '')).strip() if seguintes else ''
                nome = str(linha.get(seguintes[1], '')).strip() if len(seguintes) > 1 else ''
                if isinstance(linha.get(seguintes[0]) if seguintes else None, float):
                    codigo = str(int(linha[seguintes[0]]))
                return codigo, nome
    return None, ''


def _total_declarado(aba):
    """Litros da linha de totais do próprio relatório, para conferência."""
    for n in aba.numeros_de_linha():
        linha = aba.linha(n)
        if any(str(v).strip() == 'Litro' for v in linha.values()):
            numeros = [v for v in linha.values() if isinstance(v, (int, float))]
            if numeros:
                return round(max(numeros), 2)
    return None


def ler(caminho):
    aba = xlsx_raw.primeira_aba(caminho)
    cabecalho = _linha_do_cabecalho(aba)
    if cabecalho is None:
        raise ValueError('não reconheci o layout do relatório de diesel (SECE214)')

    inicio, fim = _periodo(aba)
    codigo_cc, nome_cc = _centro_de_custo(aba)

    requisicoes = []
    for n in aba.numeros_de_linha():
        if n <= cabecalho:
            continue
        linha = aba.linha(n)
        requisicao = linha.get(COL_REQUISICAO)
        litros = linha.get(COL_ATENDIDO)
        # linhas de dado têm requisição numérica e litros numéricos
        if not isinstance(requisicao, (int, float)) or not isinstance(litros, (int, float)):
            continue
        emissao = linha.get(COL_EMISSAO)
        atendimento = linha.get(COL_ATENDIMENTO)
        if not isinstance(atendimento, (int, float)):
            continue
        data_atendimento = xlsx_raw.serial_para_data(atendimento)
        requisicoes.append({
            'requisicao': int(requisicao),
            'emissao': (xlsx_raw.serial_para_data(emissao).isoformat()
                        if isinstance(emissao, (int, float)) else None),
            'atendimento': data_atendimento.isoformat(),
            'mes': data_atendimento.month,
            'ano': data_atendimento.year,
            'produto': str(linha.get(COL_DESCRICAO) or '').strip(),
            'codigoProduto': str(linha.get(COL_PRODUTO) or '').strip(),
            'pedido': float(linha.get(COL_PEDIDO) or 0.0),
            'litros': float(litros),
        })

    total = round(sum(r['litros'] for r in requisicoes), 2)
    declarado = _total_declarado(aba)
    return {
        'centroCusto': codigo_cc,
        'nomeCentroCusto': nome_cc,
        'inicio': inicio,
        'fim': fim,
        'requisicoes': requisicoes,
        'totalLitros': total,
        'totalDeclarado': declarado,
        'ok': declarado is None or abs(declarado - total) <= 0.5,
    }
