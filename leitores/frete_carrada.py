# -*- coding: utf-8 -*-
"""Leitor das planilhas de FRETE CARRADA (faturamento de frete por obra).

Cada mês tem duas abas: uma de detalhe (`FRETE CARRADAS MMM-26`, uma linha por
viagem, com CR e data) e um resumo (`RESUMO MMM-26`, o total por CR).

**O DETALHE é a fonte; o resumo é a conferência.** Foi assim depois de comparar
os dois em todos os meses: em fevereiro e junho são idênticos; em março e abril
os valores são idênticos e só a grafia da obra difere; em julho o resumo somou
DUERÊ dentro de PALMEIRÓPOLIS (132.686,20 + 16.165,16 = 148.851,36) enquanto o
detalhe separa as duas; e em janeiro os dois divergem em R$ 223.421,39, com o
detalhe confirmado como correto por quem mantém a planilha. O resumo é uma
consolidação feita à mão, e já errou de duas formas diferentes.

QUATRO ARMADILHAS NESTES ARQUIVOS, todas encontradas na conferência
------------------------------------------------------------------
1. **O nome da aba nem sempre é o mês dos lançamentos.** Em `ABR-26` as 848
   linhas de detalhe têm data de MAIO/2026; em `JAN-26` as 712 linhas têm data de
   AGOSTO/2025. Por isso o leitor devolve o mês do nome E o mês real das datas, e
   marca `conflitoDeData` quando divergem — quem decide o que fazer é o humano,
   não este arquivo.

2. **O detalhe tem uma linha de TOTAL no fim**, sem CR e sem data. Somar tudo dá
   exatamente o dobro do valor real. A linha é identificada e descartada.

3. **Abas duplicadas.** `FRETE CARRADAS JUL-26 ` (com espaço no fim) dentro do
   arquivo principal é uma cópia de junho, não julho. O julho de verdade está no
   arquivo `BASE FRETE CARRADAS ENVIO JUL - 26.xlsx`. Resumo sem valor nenhum é
   ignorado.

4. **A mesma obra aparece com até quatro grafias diferentes**, e não é só
   pontuação: `OLINDA NOVA - MA (PINHEIRO)` no resumo é `OLINDA NOVA - MA` no
   detalhe. Ver `OBRAS_NORMALIZADAS` abaixo.
"""
import re
import unicodedata

from . import xlsx_raw

MESES_NOMES = {
    'JANEIRO': 1, 'FEVEREIRO': 2, 'MARCO': 3, 'ABRIL': 4, 'MAIO': 5, 'JUNHO': 6,
    'JULHO': 7, 'AGOSTO': 8, 'SETEMBRO': 9, 'OUTUBRO': 10, 'NOVEMBRO': 11,
    'DEZEMBRO': 12,
}
MESES_ABREV = {
    'JAN': 1, 'FEV': 2, 'MAR': 3, 'ABR': 4, 'MAI': 5, 'JUN': 6,
    'JUL': 7, 'AGO': 8, 'SET': 9, 'OUT': 10, 'NOV': 11, 'DEZ': 12,
}
_ANO = re.compile(r'(20\d{2})')

# ---------------------------------------------------------------------------
# NORMALIZAÇÃO DAS OBRAS
#
# 27 grafias distintas nos arquivos, para 19 obras. Cada união abaixo está
# provada, e a prova está registrada em PROVA_DA_NORMALIZACAO para o painel poder
# mostrar de onde ela vem.
#
# A prova forte é **mesmo valor, mesmo mês, planilhas diferentes**: o resumo e o
# detalhe do mesmo mês trazem o mesmo centavo sob nomes diferentes. Isso não é
# semelhança de nome — é a mesma linha de faturamento escrita duas vezes.
#
# A prova fraca é **nunca aparecerem no mesmo resumo**: um resumo tem uma linha
# por obra, então dois nomes juntos no mesmo mês são obras diferentes. Foi o que
# separou `OLINDA NOVA - MA (PINHEIRO)` de `UA PINHEIRO - MA`, que aparecem
# juntos em março: o parêntese ali indica a unidade, não a obra.
#
# Chave = nome sem acento, sem pontuação e sem espaço, para uma entrada cobrir
# todas as variações de digitação de uma vez.
OBRAS_NORMALIZADAS = {
    'AUGUSTINOPOLISTO': 'AUGUSTINOPOLIS - TO',
    'AUGUSTINOPOLISTOEDEC': 'AUGUSTINOPOLIS - TO',
    'MANUTENCAODEVIASAGETOAUGUSTINOPOLISTO': 'AUGUSTINOPOLIS - TO',

    'PALMEIROPOLISTO': 'PALMEIROPOLIS - TO',
    'CONSORCIOTOCANTISPALMEIROPOLISTO': 'PALMEIROPOLIS - TO',

    'OLINDANOVAMA': 'UA OLINDA NOVA - MA',
    'OLINDANOVAMAPINHEIRO': 'UA OLINDA NOVA - MA',
    'UAOLINDANOVA': 'UA OLINDA NOVA - MA',
    'UAOLINDANOVAMA': 'UA OLINDA NOVA - MA',

    'UAPINHEIRO': 'UA PINHEIRO - MA',
    'UAPINHEIROMA': 'UA PINHEIRO - MA',

    'DUERETO': 'DUERE - TO',
    'TUCUMADUERE': 'DUERE - TO',

    'MINERADORAPF': 'MINERADORA PF',
    'TAIPASTO': 'TAIPAS - TO',
    'GURUPITO': 'GURUPI - TO',
    'SEMOSPSLZ': 'SEMOSP SLZ',
    'UASAOLUIS': 'UA SAO LUIS',
    'UADISTRITO': 'UA DISTRITO',
    'LOTEAMENTOCAXIAS': 'LOTEAMENTO CAXIAS',
}

PROVA_DA_NORMALIZACAO = [
    {'obra': 'AUGUSTINOPOLIS - TO',
     'grafias': ['AUGUSTINOPOLIS-TO', 'AUGUSTINOPOLIS -TO',
                 'AUGUSTINOPOLIS TO (EDEC)',
                 'MANUTENÇAO DE VIAS AGETO(AUGUSTINOPOLIS -TO'],
     'prova': 'forte',
     'como': 'março: o resumo traz 2.251,20 em "MANUTENÇAO DE VIAS AGETO" e o '
             'detalhe traz os mesmos 2.251,20 em "AUGUSTINOPOLIS-TO". Abril: '
             '59.379,04 no resumo como "AUGUSTINOPOLIS-TO" e no detalhe como '
             '"AUGUSTINOPOLIS TO (EDEC)".'},
    {'obra': 'PALMEIROPOLIS - TO',
     'grafias': ['PALMEIROPOLIS-TO', 'CONSORCIO TOCANTIS (PALMEIROPOLIS-TO)'],
     'prova': 'forte',
     'como': 'março: 34.282,75 no resumo como "CONSORCIO TOCANTIS '
             '(PALMEIROPOLIS-TO)" e no detalhe como "PALMEIROPOLIS-TO".'},
    {'obra': 'UA OLINDA NOVA - MA',
     'grafias': ['OLINDA NOVA - MA', 'OLINDA NOVA-MA',
                 'OLINDA NOVA - MA (PINHEIRO)', 'UA OLINDA NOVA',
                 'UA OLINDA NOVA - MA'],
     'prova': 'forte',
     'como': 'março: 272.743,96 no resumo como "OLINDA NOVA - MA (PINHEIRO)" e '
             'no detalhe como "OLINDA NOVA - MA". Abril: 49.717,48 no resumo '
             'como "UA OLINDA NOVA - MA" e no detalhe como "UA OLINDA NOVA". O '
             'parêntese "(PINHEIRO)" é a unidade, não a obra: em março ele '
             'aparece no mesmo resumo que "UA PINHEIRO - MA", que é outra obra.'},
    {'obra': 'UA PINHEIRO - MA',
     'grafias': ['UA PINHEIRO', 'UA PINHEIRO - MA'],
     'prova': 'forte',
     'como': 'abril: 168.052,16 no resumo como "UA PINHEIRO - MA" e no detalhe '
             'como "UA PINHEIRO".'},
    {'obra': 'DUERE - TO',
     'grafias': ['DUERE-TO', 'DUERÉ-TO', 'TUCUMA DUERE'],
     'prova': 'fraca',
     'como': '"DUERE-TO" e "DUERÉ-TO" são a mesma grafia com e sem acento. '
             '"TUCUMA DUERE" aparece só em janeiro e nunca no mesmo resumo que '
             '"DUERE-TO", o que permite a união mas não a prova. É a única '
             'união deste arquivo sem prova de valor — se Tucumã for outra obra, '
             'basta remover a linha TUCUMADUERE de OBRAS_NORMALIZADAS.'},
    {'obra': 'MINERADORA PF · TAIPAS - TO · GURUPI - TO',
     'grafias': ['MINERADORA-PF', 'TAIPAS-TO', 'GURUPI -TO'],
     'prova': 'forte',
     'como': 'diferença só de pontuação e espaço; o nome canônico é a grafia '
             'mais completa que aparece nos arquivos.'},
]


def _sem_acento(texto):
    return ''.join(c for c in unicodedata.normalize('NFD', str(texto))
                   if unicodedata.category(c) != 'Mn').upper()


def _mes_do_nome(texto):
    """'RESUMO ABR-26' ou 'FRETE CARRADAS ABRIL 2026' -> (4, 2026)."""
    limpo = _sem_acento(texto)
    ano = None
    achado = _ANO.search(limpo)
    if achado:
        ano = int(achado.group(1))
    else:
        achado = re.search(r'-\s*(\d{2})\b', limpo)
        if achado:
            ano = 2000 + int(achado.group(1))
    for nome, m in MESES_NOMES.items():
        if nome in limpo:
            return m, ano
    for abrev, m in MESES_ABREV.items():
        if re.search(r'\b' + abrev, limpo):
            return m, ano
    return None, ano


def _numero(v):
    return float(v) if isinstance(v, (int, float)) else None


def _chave_crua(nome):
    """Nome sem acento, sem pontuação, sem espaço — só para casar grafias."""
    return re.sub(r'[^A-Z0-9]', '', _sem_acento(nome))


def nome_da_obra(nome):
    """Nome canônico da obra. Fora do mapa, devolve o nome como está."""
    return OBRAS_NORMALIZADAS.get(_chave_crua(nome), str(nome).strip())


def chave_do_cr(nome):
    """Chave de comparação já normalizada. Duas grafias da mesma obra dão a
    mesma chave, seja pelo mapa `OBRAS_NORMALIZADAS` ou por diferença apenas de
    pontuação."""
    return _chave_crua(nome_da_obra(nome))


def _ler_resumo(aba):
    """Devolve (titulo, [{cr, valor}], total_impresso)."""
    titulo = ''
    itens, total = [], None

    # a coluna do CR é a que tem o rótulo 'CR'; o valor, a que tem 'VALOR'
    col_cr = col_valor = None
    linha_cab = None
    for n in aba.numeros_de_linha():
        linha = aba.linha(n)
        for k, v in linha.items():
            texto = _sem_acento(v).strip()
            if texto == 'CR':
                col_cr, linha_cab = k, n
            elif texto.startswith('VALOR'):
                col_valor = k
        if linha_cab == n and col_cr and col_valor:
            break
        if not titulo:
            for v in linha.values():
                if 'FRETE CARRADA' in _sem_acento(v):
                    titulo = str(v).strip()
    if not (col_cr and col_valor and linha_cab):
        return titulo, [], None

    for n in aba.numeros_de_linha():
        if n <= linha_cab:
            continue
        linha = aba.linha(n)
        valor = _numero(linha.get(col_valor))
        if valor is None:
            continue
        # o nome do CR pode estar na coluna do rótulo ou na seguinte
        nome = None
        for k in (col_cr, chr(ord(col_cr) + 1)):
            candidato = linha.get(k)
            if isinstance(candidato, str) and candidato.strip():
                nome = candidato.strip()
                break
        if nome is None:
            continue
        if _sem_acento(nome).strip().startswith('TOTAL'):
            total = valor
            continue
        itens.append({'cr': nome, 'valor': round(valor, 2)})
    return titulo, itens, total


def _ler_detalhe(aba):
    """Lê a aba de detalhe. Devolve (por_cr, meses_das_datas, soma, linhas).

    `por_cr` é [{cr, valor, linhas}] — o faturamento por obra vindo da fonte, uma
    linha por viagem. `meses_das_datas` é {'2026-05': 848}, para detectar as abas
    com data digitada errada.
    """
    linha_cab, rot = None, None
    for n in aba.numeros_de_linha()[:10]:
        mapa = {_sem_acento(v).strip(): k for k, v in aba.linha(n).items()}
        if 'FRETE' in mapa and 'CR' in mapa and 'DATA' in mapa:
            linha_cab, rot = n, mapa
            break
    if not rot:
        return [], {}, None, 0, {}

    col_f, col_cr, col_d = rot['FRETE'], rot['CR'], rot['DATA']
    contagem, por_cr, qtd_cr, grafias = {}, {}, {}, {}
    soma, qtd, sem_cr = 0.0, 0, 0.0
    for n in aba.numeros_de_linha():
        if n <= linha_cab:
            continue
        linha = aba.linha(n)
        valor = _numero(linha.get(col_f))
        if valor is None:
            continue
        cr = str(linha.get(col_cr, '')).strip()
        serial = linha.get(col_d)
        tem_data = isinstance(serial, (int, float)) and 40000 < serial < 60000
        if not cr and not tem_data:
            continue                      # linha de TOTAL do detalhe
        soma += valor
        qtd += 1
        if cr:
            nome = nome_da_obra(cr)
            por_cr[nome] = por_cr.get(nome, 0.0) + valor
            qtd_cr[nome] = qtd_cr.get(nome, 0) + 1
            grafias.setdefault(nome, set()).add(cr)
        else:
            sem_cr += valor
        if tem_data:
            d = xlsx_raw.serial_para_data(serial)
            chave = f'{d.year}-{d.month:02d}'
            contagem[chave] = contagem.get(chave, 0) + 1

    itens = sorted(({'cr': n, 'valor': round(v, 2), 'linhas': qtd_cr[n]}
                    for n, v in por_cr.items()), key=lambda i: -i['valor'])
    if sem_cr:
        itens.append({'cr': '(sem obra na planilha)', 'valor': round(sem_cr, 2),
                      'linhas': 0})
    return itens, contagem, round(soma, 2), qtd, grafias


def _juntar_grafias(itens_resumo, grafias_detalhe):
    """{obra canônica: [grafias cruas vistas]} somando resumo e detalhe."""
    junto = {obra: set(g) for obra, g in grafias_detalhe.items()}
    for i in itens_resumo:
        junto.setdefault(nome_da_obra(i['cr']), set()).add(i['cr'])
    return {obra: sorted(g) for obra, g in junto.items()}


def unificar_grafias(meses):
    """Aplica a normalização das obras e devolve o que foi unido.

    Onde `OBRAS_NORMALIZADAS` decide, o nome canônico é o do mapa. Fora do mapa,
    grafias que diferem só na pontuação ainda são unidas automaticamente, usando
    a grafia mais frequente (empate: a mais longa, que costuma trazer o estado) —
    isso cobre uma obra nova que apareça com dois nomes antes de alguém decidir.
    """
    contagem = {}
    for m in meses:
        for obra, grafias in (m.get('grafiasVistas') or {}).items():
            k = chave_do_cr(obra)
            for g in grafias:
                contagem.setdefault(k, {}).setdefault(g, 0)
                contagem[k][g] += 1

    canonico, unidos = {}, []
    for k, grafias in contagem.items():
        doMapa = {OBRAS_NORMALIZADAS[_chave_crua(g)] for g in grafias
                  if _chave_crua(g) in OBRAS_NORMALIZADAS}
        if doMapa:
            melhor = sorted(doMapa)[0]
            origem = 'mapa'
        else:
            melhor = max(grafias, key=lambda g: (grafias[g], len(g)))
            origem = 'grafia'
        canonico[k] = melhor
        if len(grafias) > 1 or (origem == 'mapa' and melhor not in grafias):
            unidos.append({'usado': melhor, 'grafias': sorted(grafias),
                           'origem': origem})

    for m in meses:
        for campo in ('porCR', 'porCRDetalhe'):
            if not m.get(campo):
                continue
            junto, linhas = {}, {}
            for item in m[campo]:
                nome = canonico[chave_do_cr(item['cr'])]
                junto[nome] = round(junto.get(nome, 0.0) + item['valor'], 2)
                linhas[nome] = linhas.get(nome, 0) + item.get('linhas', 0)
            m[campo] = sorted(({'cr': n, 'valor': v, 'linhas': linhas[n]}
                               for n, v in junto.items()),
                              key=lambda i: -i['valor'])
    return sorted(unidos, key=lambda u: u['usado'])


def obras_repetidas_no_mes(meses):
    """Duas grafias da mesma obra no MESMO resumo — a normalização estaria errada.

    Um resumo tem uma linha por obra. Se depois de normalizar duas linhas do mesmo
    resumo caem na mesma obra, ou o resumo está repetido ou as duas são obras
    diferentes e a união em `OBRAS_NORMALIZADAS` é indevida. É a guarda que
    impediu de juntar `OLINDA NOVA - MA (PINHEIRO)` com `UA PINHEIRO - MA`.
    """
    achados = []
    for m in meses:
        contagem = {}
        for item in m.get('porCRBruto') or []:
            contagem.setdefault(chave_do_cr(item['cr']), []).append(item['cr'])
        for k, grafias in contagem.items():
            if len(grafias) > 1:
                achados.append({'mes': m['mes'], 'obra': nome_da_obra(grafias[0]),
                                'grafias': sorted(grafias)})
    return achados


def divergencias_por_obra(meses):
    """Obras em que resumo e detalhe do mesmo mês discordam, já normalizados.

    O que sobra aqui não é grafia: é o resumo alocando valor na obra errada. Em
    julho ele somou DUERÊ dentro de PALMEIRÓPOLIS.
    """
    achados = []
    for m in meses:
        if not m.get('porCRDetalhe'):
            continue
        R = {i['cr']: i['valor'] for i in (m.get('porCR') or [])}
        D = {i['cr']: i['valor'] for i in m['porCRDetalhe']}
        for obra in sorted(set(R) | set(D)):
            r, d = R.get(obra), D.get(obra)
            if abs((r or 0) - (d or 0)) > 0.02:
                achados.append({'mes': m['mes'], 'obra': obra,
                                'resumo': r, 'detalhe': d,
                                'delta': round((d or 0) - (r or 0), 2)})
    return achados


def ler(caminho):
    """Lê um arquivo de frete carrada. Devolve lista de meses."""
    abas = xlsx_raw.abrir(caminho)
    resumos, detalhes = [], {}

    for aba in abas:
        nome = _sem_acento(aba.nome).strip()
        if 'RESUMO' in nome:
            resumos.append(aba)
        elif nome.startswith('FRETE CARRADAS') or 'BASE FRETE' in nome:
            mes, _ano = _mes_do_nome(aba.nome)
            if mes:
                detalhes.setdefault(mes, []).append(aba)

    saida = []
    for aba in resumos:
        titulo, itens, total_impresso = _ler_resumo(aba)
        if not itens:
            continue                      # resumo vazio (aba de rascunho)
        mes, ano = _mes_do_nome(titulo or aba.nome)
        if mes is None:
            mes, ano = _mes_do_nome(aba.nome)
        soma_itens = round(sum(i['valor'] for i in itens), 2)

        # o detalhe do mesmo mês: é a fonte do valor, e o resumo confere
        por_cr_det, conf, grafias_det = None, {'temDetalhe': False}, {}
        for det in detalhes.get(mes, []):
            por_cr, contagem, soma_det, qtd, grafias_det = _ler_detalhe(det)
            if not contagem:
                continue
            principal = max(contagem, key=contagem.get)
            mes_real = int(principal.split('-')[1])
            ano_real = int(principal.split('-')[0])
            por_cr_det = por_cr
            conf = {
                'temDetalhe': True,
                'aba': det.nome,
                'somaDetalhe': soma_det,
                'linhas': qtd,
                'mesesReais': contagem,
                'mesReal': mes_real,
                'anoReal': ano_real,
                'delta': round(soma_det - soma_itens, 2),
                'confere': abs(soma_det - soma_itens) <= 0.02,
                'conflitoDeData': (mes_real != mes) or (ano is not None and ano_real != ano),
            }
            break

        saida.append({
            'mes': mes,
            'ano': ano,
            'aba': aba.nome,
            'titulo': titulo,
            'totalResumo': round(total_impresso, 2) if total_impresso is not None else soma_itens,
            'somaItens': soma_itens,
            'porCR': sorted(({'cr': nome_da_obra(i['cr']), 'valor': i['valor'],
                              'linhas': 0} for i in itens), key=lambda i: -i['valor']),
            'porCRBruto': itens,
            'porCRDetalhe': por_cr_det,
            'grafiasVistas': _juntar_grafias(itens, grafias_det),
            'conferencia': conf,
        })

    saida.sort(key=lambda r: (r['ano'] or 0, r['mes'] or 0))
    return saida
