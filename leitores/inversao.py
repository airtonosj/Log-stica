# -*- coding: utf-8 -*-
"""Parser do relatório INVERSÃO GERENCIAL (Plano Financeiro / Orçamentos).

Dois layouts em circulação, distinguidos pela assinatura da linha de cabeçalho
de colunas (e NÃO pelo rodapé FFOR001/FFOR401, que só aparece na última linha):

  A  FFOR001.GER  Nomenclatura em F, Realizado em O, valores em texto pt-BR
                  com sufixo '-' para débito; coluna Orçado vem sempre zerada.
  B  FFOR401.GER  Nomenclatura em D, Realizado em J, floats nativos negativos;
                  coluna Orçado (I) vem preenchida.

Regras que sustentam a conciliação (total do CC == soma das contas == soma dos
lançamentos, delta R$ 0,00):

  * Identificação POSITIVA de linha de dado: coluna do código numérica, coluna
    do centro de custo igual ao CC do relatório, e classificação casando
    `NNN(.NNN)?` (conta) ou começando com `Data:` (lançamento). Filtrar por
    substring de cabeçalho descarta lançamentos cujo fornecedor contenha o
    texto procurado.
  * Sinal preservado: débito = despesa positiva; crédito/estorno = negativa.
    Usar valor absoluto faz estornos somarem em vez de cancelar.
"""
import re

from . import xlsx_raw

CLASSIFICACAO = re.compile(r'^\d{3}(\.\d{3})?$')
TOTAL_DO_CENTRO = '001'

# assinatura da linha de cabeçalho -> mapa de colunas
_LAYOUTS = {
    'A': (
        {'A': 'Reduzida', 'B': 'C. Custos', 'C': 'Classificação',
         'F': 'Nomenclatura', 'L': 'Vlr Orçado', 'O': 'Vlr Realizado'},
        {'codigo': 'A', 'cc': 'B', 'classificacao': 'C',
         'nome': 'F', 'orcado': 'L', 'realizado': 'O'},
    ),
    'B': (
        {'A': 'Cta', 'B': 'C.C.', 'C': 'Classificação',
         'D': 'Nomenclatura', 'I': 'Vlr Orçado', 'J': 'Vlr Realizado'},
        {'codigo': 'A', 'cc': 'B', 'classificacao': 'C',
         'nome': 'D', 'orcado': 'I', 'realizado': 'J'},
    ),
}


class LayoutDesconhecido(ValueError):
    pass


def e_inversao_gerencial(aba):
    return 'INVERSÃO GERENCIAL' in aba.texto_das_primeiras(12).upper() \
        or _detectar_layout(aba) is not None


def valor(bruto):
    """Valor do ERP -> despesa positiva. Estorno/crédito fica negativo."""
    if bruto is None or bruto == '':
        return 0.0
    if isinstance(bruto, (int, float)):
        return -float(bruto)                     # layout B: -1544364.43 -> despesa
    texto = str(bruto).strip()
    debito = texto.endswith('-')
    if debito:
        texto = texto[:-1]
    texto = texto.replace('.', '').replace(',', '.')
    try:
        numero = float(texto)
    except ValueError:
        return 0.0
    return numero if debito else -numero         # layout A: sufixo '-' = débito


def _detectar_layout(aba):
    for n in aba.numeros_de_linha()[:20]:
        linha = {k: str(v).strip() for k, v in aba.linha(n).items()}
        for nome, (assinatura, colunas) in _LAYOUTS.items():
            if all(linha.get(k) == esperado for k, esperado in assinatura.items()):
                return nome, colunas
    return None


def _periodo(aba, col):
    """Serial de início e fim; o rótulo 'Período:' fica ao lado das duas datas."""
    for n in aba.numeros_de_linha()[:20]:
        linha = aba.linha(n)
        if not any(str(v).strip() == 'Período:' for v in linha.values()):
            continue
        seriais = [v for v in linha.values()
                   if isinstance(v, (int, float)) and 40000 < v < 60000]
        if len(seriais) >= 2:
            return (xlsx_raw.serial_para_data(min(seriais)),
                    xlsx_raw.serial_para_data(max(seriais)))
    return None, None


def _centro_de_custo(aba, col):
    """Código do CC: coluna do CC na linha de total ('001')."""
    for n in aba.numeros_de_linha():
        linha = aba.linha(n)
        if (str(linha.get(col['classificacao'])) == TOTAL_DO_CENTRO
                and isinstance(linha.get(col['codigo']), (int, float))):
            return str(linha.get(col['cc'])), str(linha.get(col['nome']) or '')
    return None, ''


_TIPO_DOC = re.compile(
    r'^\s*(.+?)\s*(?="|\d{2}/\d{2}/\d{4}|Seq\.:|$)')
_DOCUMENTO = re.compile(r'"([^"]*)"')
_FORNECEDOR = re.compile(r'Fornec:\s*(.+?)\s*$')
_HISTORICO = re.compile(r'Descrição:\s*(.+?)\s*$')
_SEQUENCIA = re.compile(r'Seq\.:\s*(\d+)')


def _partes_do_lancamento(descricao):
    """'C. PAGAR "4977" 01 Seq.: 1 Fornec: Tama' -> tipo, doc, fornecedor, ...

    O tipo vai até a primeira aspa, data ou 'Seq.:'. Cortar no primeiro espaço
    truncaria 'L. MANUAL' para 'L.'.
    """
    tipo = _TIPO_DOC.match(descricao)
    documento = _DOCUMENTO.search(descricao)
    fornecedor = _FORNECEDOR.search(descricao)
    historico = _HISTORICO.search(descricao)
    sequencia = _SEQUENCIA.search(descricao)
    return {
        'tipo': (tipo.group(1) if tipo else descricao.split()[0] if descricao else '').strip(),
        'doc': documento.group(1).strip() if documento else '',
        'fornecedor': fornecedor.group(1).strip() if fornecedor else '',
        'historico': historico.group(1).strip() if historico else '',
        'seq': int(sequencia.group(1)) if sequencia else None,
    }


def _data_do_lancamento(classificacao, ano_padrao):
    """'Data: 13/01/2026' -> '2026-01-13'."""
    texto = classificacao[5:].strip()
    partes = texto.split('/')
    if len(partes) == 3:
        dia, mes, ano = partes
        if len(ano) == 2:
            ano = str(ano_padrao)[:2] + ano
        return f'{int(ano):04d}-{int(mes):02d}-{int(dia):02d}'
    return texto


def ler(caminho):
    """Parseia um arquivo de inversão gerencial.

    Devolve dict com: layout, centro de custo, período, mês, total do CC,
    contas (folhas) e lançamentos.
    """
    aba = xlsx_raw.primeira_aba(caminho)
    detectado = _detectar_layout(aba)
    if detectado is None:
        raise LayoutDesconhecido(
            'não reconheci o layout de Inversão Gerencial '
            '(cabeçalho de colunas esperado: Reduzida/C. Custos/... ou Cta/C.C./...)')
    layout, col = detectado

    inicio, fim = _periodo(aba, col)
    if inicio is None:
        raise ValueError('não encontrei a linha "Período:" do relatório')
    codigo_cc, nome_cc = _centro_de_custo(aba, col)
    if codigo_cc is None:
        raise ValueError('não encontrei a linha de total do centro de custo (classificação "001")')

    contas, lancamentos = [], []
    total_cc = None
    orcado_cc = 0.0
    conta_atual = None

    for n in aba.numeros_de_linha():
        linha = aba.linha(n)
        codigo = linha.get(col['codigo'])
        # identificação positiva: código numérico + CC do relatório
        if not isinstance(codigo, (int, float)) or str(linha.get(col['cc'])) != codigo_cc:
            continue
        classificacao = str(linha.get(col['classificacao']) or '')
        nome = str(linha.get(col['nome']) or '')

        if classificacao.startswith('Data:'):
            if conta_atual is None:
                continue
            partes = _partes_do_lancamento(nome)
            partes.update(cta=conta_atual,
                          data=_data_do_lancamento(classificacao, inicio.year),
                          valor=round(valor(linha.get(col['realizado'])), 2))
            lancamentos.append(partes)
        elif CLASSIFICACAO.match(classificacao):
            registro = {
                'cta': int(codigo),
                'classificacao': classificacao,
                'nome': nome,
                'orcado': round(valor(linha.get(col['orcado'])), 2),
                'realizado': round(valor(linha.get(col['realizado'])), 2),
            }
            if classificacao == TOTAL_DO_CENTRO:
                total_cc = registro['realizado']
                orcado_cc = registro['orcado']
                conta_atual = None          # lançamentos nunca pendem do total
            else:
                contas.append(registro)
                conta_atual = registro['cta']

    return {
        'layout': layout,
        'centroCusto': codigo_cc,
        'nomeCentroCusto': nome_cc,
        'inicio': inicio.isoformat(),
        'fim': fim.isoformat(),
        'mes': inicio.month,
        'ano': inicio.year,
        'totalRealizado': total_cc if total_cc is not None else 0.0,
        'totalOrcado': orcado_cc,
        'contas': contas,
        'lancamentos': lancamentos,
    }


def conciliar(relatorio):
    """Confere total do CC == soma das contas == soma dos lançamentos."""
    soma_contas = round(sum(c['realizado'] for c in relatorio['contas']), 2)
    soma_lancamentos = round(sum(l['valor'] for l in relatorio['lancamentos']), 2)
    total = round(relatorio['totalRealizado'], 2)

    por_conta = {}
    for l in relatorio['lancamentos']:
        por_conta[l['cta']] = round(por_conta.get(l['cta'], 0.0) + l['valor'], 2)
    divergentes = [
        {'cta': c['cta'], 'nome': c['nome'],
         'conta': c['realizado'], 'lancamentos': por_conta.get(c['cta'], 0.0)}
        for c in relatorio['contas']
        if abs(por_conta.get(c['cta'], 0.0) - c['realizado']) > 0.02
    ]
    return {
        'total': total,
        'somaContas': soma_contas,
        'somaLancamentos': soma_lancamentos,
        'deltaContas': round(soma_contas - total, 2),
        'deltaLancamentos': round(soma_lancamentos - soma_contas, 2),
        'contasDivergentes': divergentes,
        'ok': (abs(soma_contas - total) <= 0.02
               and abs(soma_lancamentos - soma_contas) <= 0.02
               and not divergentes),
    }
