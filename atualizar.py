# -*- coding: utf-8 -*-
"""Gera js/dados.js a partir dos arquivos em planilhas/.

Uso:
    python atualizar.py                  # regrava js/dados.js
    python atualizar.py --bundle         # gera também o HTML único
    python atualizar.py --pasta OUTRA    # usa outra pasta de origem

Fontes, em ordem de autoridade:

    planilhas/analise/*.pdf      FFOR501 — ANÁLISE DE CUSTOS.  FONTE PRIMÁRIA do
                                 realizado, e a única com Receita. Traz o custo
                                 completo, inclusive o que não vira nota em
                                 contas a pagar (baixa de diesel do estoque,
                                 provisão de INSS).
    planilhas/orcamento/*.xls    PROGRAMA ORÇAMENTÁRIO. Fonte do ORÇADO (12
                                 meses), dos nomes de conta e da hierarquia.
    planilhas/inversoes/*.xlsx   FFOR001/FFOR401 — o razão. SECUNDÁRIA: só serve
                                 para saber QUEM recebeu (fornecedor, documento).
                                 Cobre ~54% do custo, então não entra nos KPIs.
    planilhas/diesel/*.xlsx      SECE214 — litros consumidos.
    planilhas/frete/*.xlsx       FRETE CARRADA — faturamento de frete por obra,
                                 pelas abas de RESUMO. É uma PARTE da receita de
                                 frete; a outra parte vem de fora deste arquivo.

Por que o PDF e não o razão: em jan–jun o razão soma R$ 9,25 mi e a análise de
custos R$ 16,18 mi. A diferença é quase toda óleo diesel (R$ 5,27 mi que o razão
mostra como zero) e provisões. O razão subestimava o custo em 75%.

Sai com código 1 se algum arquivo não conciliar, para não publicar número errado.
"""
import argparse
import datetime
import hashlib
import json
import re
import sys
from pathlib import Path

from leitores import analise_custos, diesel, frete_carrada, inversao, orcamento

RAIZ = Path(__file__).resolve().parent
MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun',
                'jul', 'ago', 'set', 'out', 'nov', 'dez']

# ---------------------------------------------------------------------------
# PESSOAL
#
# As contas de folha ficam no dado, marcadas, e o painel as esconde por padrão
# atrás de um botão. Marcar em vez de excluir é o que permite ligar e desligar
# na tela sem regerar nada — e mantém o total conferindo com o rodapé do PDF
# quando o botão está ligado.
# ---------------------------------------------------------------------------
# FRETE CARRADA — correções de mês confirmadas com quem mantém a planilha
#
# Duas abas têm as datas dos lançamentos digitadas erradas. O mês correto é o do
# NOME da aba; as datas é que estão furadas. Registrado aqui para o painel parar
# de alertar sobre um conflito já resolvido, e para o próximo a mexer no código
# saber por quê.
MES_CONFIRMADO = {
    'RESUMO JAN-26': (1, 'datas digitadas como ago/2025; os dados são de janeiro'),
    'RESUMO ABR-26': (4, 'datas digitadas como mai/2026; os dados são de abril'),
}

# Meses que sabidamente não existem em nenhuma planilha de frete carrada.
MESES_SEM_FRETE_CARRADA = {5: 'maio: a planilha nunca foi feita'}

# ---------------------------------------------------------------------------
# FRETE CARRADA — o detalhe é a fonte, o resumo confere
#
# Comparei os dois em todos os meses. Em fevereiro e junho batem; em março e
# abril os valores batem e só a grafia da obra difere; em julho o resumo somou
# DUERÊ dentro de PALMEIRÓPOLIS (132.686,20 + 16.165,16 = 148.851,36) enquanto o
# detalhe separa as duas; em janeiro divergem em R$ 223.421,39, e o detalhe é o
# correto — confirmado por quem mantém a planilha.
#
# Ou seja: onde discordam, o detalhe é que está certo, nas duas formas em que
# discordaram. O resumo é consolidação manual e passa a ser só conferência.
#
# CONSEQUÊNCIA QUE PRECISA FICAR VISÍVEL: com o detalhe, janeiro fatura
# R$ 1.308.362,10 de frete carrada, e aí frete carrada + frete deixa de fechar
# com a receita que o ERP publica no mês — sobra exatamente a mesma diferença de
# R$ 223.421,39. Se o detalhe está certo, esse valor foi rodado e não foi
# faturado. O painel mostra a receita do ERP (fonte oficial) e aponta a sobra.
FONTE_DO_FRETE = 'detalhe'

# Assets locais do index.html. Dois padrões, um por trabalho:
#   PADRAO_ASSET  só o atributo, para carimbar ?v=<hash> (versionar_assets)
#   TAG_ASSET     a tag inteira, para substituir por <style>/<script> (bundle)
# Os dois toleram o ?v= já presente, então rodar duas vezes não duplica nada.
_CAMINHO = r'((?:css|js)/[\w.-]+)(?:\?v=[0-9a-f]+)?'
PADRAO_ASSET = re.compile(r'(href|src)="' + _CAMINHO + '"')
TAG_ASSET = re.compile(
    r'<link\b[^>]*\bhref="(?P<css>(?:css|js)/[\w.-]+)(?:\?v=[0-9a-f]+)?"[^>]*>'
    r'|<script\b[^>]*\bsrc="(?P<js>(?:css|js)/[\w.-]+)(?:\?v=[0-9a-f]+)?"[^>]*>'
    r'\s*</script\s*>')

GRUPOS_DE_PESSOAL = {410}          # DESPESAS COM PESSOAL, inteiro
CONTAS_DE_PESSOAL = {1360, 1370}   # contribuição sindical: encargo fora do grupo


def e_pessoal(conta):
    return conta['grupo'] in GRUPOS_DE_PESSOAL or conta['cta'] in CONTAS_DE_PESSOAL


def moeda(v):
    if v is None:
        return '—'
    return f'{v:,.2f}'.replace(',', '\x00').replace('.', ',').replace('\x00', '.')


# --------------------------------------------------------------- coleta
def arquivos(pasta, subpasta, extensoes):
    alvo = pasta / subpasta
    if not alvo.is_dir():
        return []
    return [p for p in sorted(alvo.iterdir())
            if p.suffix.lower() in extensoes and not p.name.startswith('~$')]


def ler_orcamento(pasta):
    achados = arquivos(pasta, 'orcamento', ('.xls', '.xlsx'))
    if not achados:
        raise SystemExit(f'ERRO: nenhuma planilha de orçamento em {pasta / "orcamento"}')
    if len(achados) > 1:
        print(f'  aviso: {len(achados)} planilhas de orçamento; usando {achados[-1].name}')
    dados = orcamento.ler(str(achados[-1]))
    dados['arquivo'] = achados[-1].name
    return dados


def ler_analises(pasta, orcado_por_conta):
    """Lê os PDFs de Análise de Custos.

    Os relatórios se sobrepõem: `04 a 06` e `05 a 07` trazem maio e junho os
    dois. Onde discordam, **vence o de período mais recente**, porque o ERP
    lança retroativo — junho saiu com 2.638.995,78 no relatório de junho e com
    2.643.116,20 no de julho, e é o segundo que fecha o acumulado impresso
    (19.002.148,51 em jan–jul). Por isso a ordenação é pelo FIM do período, não
    pelo nome do arquivo.
    """
    resultados, problemas = [], []
    for caminho in arquivos(pasta, 'analise', ('.pdf',)):
        try:
            r = analise_custos.ler(str(caminho))
        except Exception as erro:                       # noqa: BLE001
            problemas.append((caminho.name, str(erro)))
            continue
        r['arquivo'] = caminho.name
        r['conciliacao'] = analise_custos.conciliar(r)
        r['conferenciaOrcado'] = analise_custos.conferir_orcado(r, orcado_por_conta)
        resultados.append(r)
    resultados.sort(key=lambda r: (r['fim'], r['inicio']))
    return resultados, problemas


def ler_razao(pasta):
    resultados, problemas = [], []
    for caminho in arquivos(pasta, 'inversoes', ('.xlsx',)):
        try:
            r = inversao.ler(str(caminho))
        except Exception as erro:                       # noqa: BLE001
            problemas.append((caminho.name, str(erro)))
            continue
        r['arquivo'] = caminho.name
        r['conciliacao'] = inversao.conciliar(r)
        resultados.append(r)
    resultados.sort(key=lambda r: r['mes'])
    return resultados, problemas


def ler_frete_avulso(pasta):
    """Lê planilhas/frete/faturamento-frete.csv — o frete que não é carrada.

    Formato `mes;valor;observacao`, uma linha por mês, com `#` para comentário.
    Mês ausente fica ausente: o painel mostra em branco em vez de supor zero.
    """
    caminho = pasta / 'frete' / 'faturamento-frete.csv'
    if not caminho.is_file():
        return {}, []
    porMes, problemas = {}, []
    for n, linha in enumerate(caminho.read_text(encoding='utf-8').splitlines(), 1):
        bruto = linha.strip()
        if not bruto or bruto.startswith('#') or bruto.lower().startswith('mes;'):
            continue
        partes = [p.strip() for p in bruto.split(';')]
        if len(partes) < 2:
            problemas.append((caminho.name, f'linha {n}: esperava mes;valor'))
            continue
        try:
            mes = int(partes[0])
            texto = partes[1].replace('.', '').replace(',', '.')                 if ',' in partes[1] else partes[1]
            valor = round(float(texto), 2)
        except ValueError:
            problemas.append((caminho.name, f'linha {n}: não entendi {bruto!r}'))
            continue
        if not 1 <= mes <= 12:
            problemas.append((caminho.name, f'linha {n}: mês {mes} fora de 1..12'))
            continue
        porMes[mes] = {'valor': valor,
                       'observacao': partes[2] if len(partes) > 2 else ''}
    return porMes, problemas


def ler_frete(pasta):
    """Lê as planilhas de frete carrada. Mês repetido: o último arquivo vence."""
    meses, problemas = {}, []
    for caminho in arquivos(pasta, 'frete', ('.xlsx',)):
        try:
            lista = frete_carrada.ler(str(caminho))
        except Exception as erro:                       # noqa: BLE001
            problemas.append((caminho.name, str(erro)))
            continue
        for r in lista:
            correcao = MES_CONFIRMADO.get(r['aba'])
            if correcao:
                r['mes'] = correcao[0]
                r['mesConfirmado'] = correcao[1]
            if r['mes'] is None:
                problemas.append((caminho.name,
                                  f'não descobri o mês da aba {r["aba"]!r}'))
                continue
            r['arquivo'] = caminho.name
            if r['mes'] in meses:
                print(f'  aviso: frete de {MESES_CURTOS[r["mes"] - 1]} aparece em '
                      f'{meses[r["mes"]]["arquivo"]} e em {caminho.name}; o último vence')
            meses[r['mes']] = r
    lista = [meses[m] for m in sorted(meses)]
    unidos = frete_carrada.unificar_grafias(lista)
    repetidas = frete_carrada.obras_repetidas_no_mes(lista)
    divergencias = frete_carrada.divergencias_por_obra(lista)

    # o detalhe é a fonte (ver FONTE_DO_FRETE); sem detalhe, sobra o resumo
    for r in lista:
        if FONTE_DO_FRETE == 'detalhe' and r.get('porCRDetalhe'):
            r['fonte'] = 'detalhe'
            r['porCRUsado'] = r['porCRDetalhe']
            r['total'] = r['conferencia']['somaDetalhe']
        else:
            r['fonte'] = 'resumo'
            r['porCRUsado'] = r['porCR']
            r['total'] = r['totalResumo']

    revisao = {'grafiasUnidas': unidos, 'obrasRepetidas': repetidas,
               'divergenciasPorObra': divergencias,
               'provaDaNormalizacao': frete_carrada.PROVA_DA_NORMALIZACAO}
    return lista, problemas, revisao


def ler_diesel(pasta):
    resultados, problemas = [], []
    for caminho in arquivos(pasta, 'diesel', ('.xlsx',)):
        try:
            r = diesel.ler(str(caminho))
        except Exception as erro:                       # noqa: BLE001
            problemas.append((caminho.name, str(erro)))
            continue
        r['arquivo'] = caminho.name
        resultados.append(r)
    return resultados, problemas


# --------------------------------------------------------------- montagem
def montar(orc, analises, razao, dieseis, fretes, revisao, frete_avulso):
    grupos_despesa = orcamento.grupo_de_despesa(orc)
    por_cta = {c['cta']: c for c in orc['contas']}

    # contas que aparecem em algum PDF
    com_movimento = set()
    for a in analises:
        com_movimento |= set(a['contas'])

    contas = []
    for c in orc['contas']:
        if c['grupo'] not in grupos_despesa:
            continue
        # o plano traz dezenas de linhas nunca usadas neste centro de custo
        if c['total'] == 0 and c['cta'] not in com_movimento:
            continue
        contas.append({
            'cta': c['cta'],
            'nome': c['nome'],
            'grupo': c['grupo'],
            'ordem': c['ordem'],
            'pessoal': e_pessoal(c),
            'naoMonetaria': c['grupo'] == orcamento.GRUPO_NAO_MONETARIO,
        })
    conhecidas = {c['cta'] for c in contas}

    # conta que aparece no PDF mas não está no escopo orçado entra sem grupo,
    # para não desaparecer da análise
    for a in analises:
        for cta in a['contas']:
            if cta in conhecidas:
                continue
            base = por_cta.get(cta)
            conhecidas.add(cta)
            contas.append({
                'cta': cta,
                'nome': base['nome'] if base else f'Conta {cta}',
                'grupo': base['grupo'] if base else None,
                'ordem': 10000 + cta,
                'pessoal': e_pessoal(base) if base else False,
                'naoMonetaria': False,
                'foraDoOrcamento': True,
            })
    contas.sort(key=lambda c: c['ordem'])

    # ---- realizado por conta e por mês, e o rodapé
    valores = {}
    meses = []
    vistos = {}
    conflitos = []
    for a in analises:
        conc = a['conciliacao']
        conf = a['conferenciaOrcado']
        custo = a['rodape'].get(analise_custos.RODAPE_CUSTO, {})
        receita = a['rodape'].get(analise_custos.RODAPE_RECEITA, {})
        for mes in a['meses']:
            if mes in vistos:
                anterior = next((m for m in meses if m['mes'] == mes), None)
                conflitos.append({
                    'mes': mes, 'antes': vistos[mes], 'agora': a['arquivo'],
                    'custoAntes': (anterior or {}).get('custoRealizado'),
                    'receitaAntes': (anterior or {}).get('receitaRealizada'),
                })
                meses = [m for m in meses if m['mes'] != mes]
                # o PDF novo é a verdade INTEIRA do mês: uma conta que existia no
                # relatório antigo e não existe neste tem de sair, não ficar
                # pendurada com o valor velho
                for por_mes in valores.values():
                    por_mes.pop(str(mes), None)
            vistos[mes] = a['arquivo']

            for cta, por_mes in a['contas'].items():
                v = (por_mes.get(mes) or {}).get('realizado')
                if v is None:
                    continue
                valores.setdefault(str(cta), {})[str(mes)] = round(v, 2)

            do_mes = custo.get(mes) or {}
            rec = receita.get(mes) or {}
            meses.append({
                'mes': mes,
                'ano': a['ano'],
                'arquivo': a['arquivo'],
                'fonte': a['fonte'],
                'origem': 'base',
                'custoRealizado': round(do_mes.get('realizado') or 0.0, 2),
                'custoOrcadoRelatorio': (round(do_mes['orcado'], 2)
                                         if do_mes.get('orcado') is not None else None),
                # None quando a receita não foi lançada — não é zero, e não pode
                # virar prejuízo fabricado
                'receitaRealizada': (round(rec['realizado'], 2)
                                     if rec.get('realizado') is not None else None),
                'conciliado': conc['ok'],
                'somaContas': conc['meses'].get(mes, {}).get('somaContas'),
                'orcadoConferido': conf['conferidas'],
                'orcadoDivergente': len(conf['divergentes']),
            })
    # ---- meses que só o razão tem: entram MARCADOS como parciais
    #
    # O razão vê ~54% do custo (em junho, onde há as duas fontes, ele mostra a
    # conta 380 Óleo Diesel como zero contra R$ 1,04 mi na Análise de Custos).
    # Então o mês parcial existe no painel, mas fica fora dos acumulados, das
    # comparações de desvio e do resultado: sem isso o gráfico mensal sugeriria
    # uma queda de custo que não houve.
    com_analise = {m['mes'] for m in meses}
    for r in razao:
        if r['mes'] in com_analise:
            continue
        realizado = {}
        for conta in r['contas']:
            chave = str(conta['cta'])
            realizado[chave] = round(realizado.get(chave, 0.0) + conta['realizado'], 2)
            valores.setdefault(chave, {})[str(r['mes'])] = realizado[chave]
        meses.append({
            'mes': r['mes'],
            'ano': r['ano'],
            'arquivo': r['arquivo'],
            'fonte': 'razão',
            'origem': 'base',
            'parcial': True,
            'custoRealizado': round(r['totalRealizado'], 2),
            'custoOrcadoRelatorio': r['totalOrcado'] or None,
            'receitaRealizada': None,
            'conciliado': r['conciliacao']['ok'],
            'somaContas': r['conciliacao']['somaContas'],
            'orcadoConferido': None,
            'orcadoDivergente': None,
        })

    # ---- receita: o ERP é a fonte oficial; onde ele está em branco, o
    # faturamento (frete carrada + frete) preenche. Conferido: nos meses em que
    # o ERP publica receita, a soma dos dois bate ao centavo.
    carrada_por_mes = {f['mes']: f['total'] for f in fretes}
    for m in meses:
        c = carrada_por_mes.get(m['mes'])
        a = (frete_avulso.get(m['mes']) or {}).get('valor')
        soma = round(c + a, 2) if (c is not None and a is not None) else None
        m['freteCarrada'] = c
        m['freteAvulso'] = a
        m['receitaFaturamento'] = soma
        if m.get('receitaRealizada') is not None:
            m['fonteReceita'] = 'ERP'
            m['conferenciaReceita'] = (round(soma - m['receitaRealizada'], 2)
                                       if soma is not None else None)
        elif soma is not None and not m.get('parcial'):
            m['receitaRealizada'] = soma
            m['fonteReceita'] = 'faturamento'
            m['conferenciaReceita'] = None
        else:
            m['fonteReceita'] = None
            m['conferenciaReceita'] = None

    meses.sort(key=lambda m: m['mes'])

    # ---- orçado, da planilha, 12 meses
    orcado_anual = {str(c['cta']): por_cta[c['cta']]['orcado']
                    for c in contas if c['cta'] in por_cta}
    linha_receita = next((g for g in orc['grupos'] if g['codigo'] == 20), None)
    receita_orcada = linha_receita['orcado'] if linha_receita else [0.0] * 12

    # ---- razão: só o detalhe de fornecedor
    lancamentos, meses_razao = [], []
    for r in razao:
        conc = r['conciliacao']
        meses_razao.append({
            'mes': r['mes'], 'arquivo': r['arquivo'], 'layout': r['layout'],
            'totalRealizado': r['totalRealizado'], 'conciliado': conc['ok'],
        })
        for l in r['lancamentos']:
            lancamentos.append({
                'mes': r['mes'], 'cta': l['cta'], 'data': l['data'],
                'tipo': l['tipo'], 'doc': l['doc'], 'fornecedor': l['fornecedor'],
                'historico': l['historico'], 'valor': l['valor'],
            })

    requisicoes, arquivos_diesel = [], []
    for r in dieseis:
        arquivos_diesel.append({
            'arquivo': r['arquivo'], 'inicio': r['inicio'], 'fim': r['fim'],
            'totalLitros': r['totalLitros'], 'origem': 'base',
        })
        requisicoes.extend(r['requisicoes'])

    return {
        'freteAvulso': {str(m): v for m, v in frete_avulso.items()},
        'mesesSemFreteCarrada': {str(m): t for m, t in MESES_SEM_FRETE_CARRADA.items()},
        'freteCarrada': [{
            'mes': f['mes'], 'ano': f['ano'], 'arquivo': f['arquivo'], 'aba': f['aba'],
            'total': f['total'],
            'fonte': f['fonte'],
            'totalResumo': f['totalResumo'],
            'porCR': f['porCRUsado'],
            'confere': f['conferencia'].get('confere'),
            'somaDetalhe': f['conferencia'].get('somaDetalhe'),
            'linhasDetalhe': f['conferencia'].get('linhas'),
            'conflitoDeData': (f['conferencia'].get('conflitoDeData', False)
                               and not f.get('mesConfirmado')),
            'mesConfirmado': f.get('mesConfirmado'),
            'mesReal': f['conferencia'].get('mesReal'),
            'anoReal': f['conferencia'].get('anoReal'),
        } for f in fretes],
        'freteRevisao': revisao,
        'conflitosDePdf': conflitos,
        'centroCusto': {'codigo': orc['centroCusto'], 'nome': orc['nomeCentroCusto']},
        'ano': orc['ano'],
        'arquivoOrcamento': orc['arquivo'],
        'grupos': [{'codigo': codigo, 'nome': nome, 'ordem': i,
                    'pessoal': codigo in GRUPOS_DE_PESSOAL,
                    'naoMonetario': codigo == orcamento.GRUPO_NAO_MONETARIO}
                   for i, (codigo, nome) in enumerate(grupos_despesa.items())],
        'contas': contas,
        'meses': meses,
        'valores': valores,
        'orcadoAnual': orcado_anual,
        'receitaOrcadaAnual': receita_orcada,
        'razao': {
            'meses': meses_razao,
            'lancamentos': lancamentos,
            'diesel': requisicoes,
            'arquivosDiesel': arquivos_diesel,
        },
        'geradoEm': datetime.datetime.now().replace(microsecond=0).isoformat(),
    }


# --------------------------------------------------------------- terminal
def imprimir(orc, analises, razao, dieseis, fretes, revisao, problemas):
    print(f'\nOrçamento: {orc["arquivo"]}')
    print(f'  centro de custo {orc["centroCusto"]} — {orc["nomeCentroCusto"]} / {orc["ano"]}')
    raiz = orcamento.conferir_raiz(orc)
    print(f'  [{"OK " if raiz["ok"] else "FALHA"}] soma dos grupos de despesa == linha 260')

    print(f'\nAnálise de Custos — FONTE PRIMÁRIA ({len(analises)} PDFs)')
    cab = (f'  {"mês":>4} {"soma das contas":>17} {"rodapé do PDF":>17} {"Δ":>8}'
           f'   {"orçado conferido":>17}')
    print(cab)
    print('  ' + '-' * (len(cab) - 2))
    for a in analises:
        conf = a['conferenciaOrcado']
        for mes in a['meses']:
            v = a['conciliacao']['meses'].get(mes, {})
            marca = '' if abs(v.get('delta', 1)) <= 0.02 else '  !'
            print(f'  {MESES_CURTOS[mes - 1]:>4} {moeda(v.get("somaContas")):>17} '
                  f'{moeda(v.get("rodape")):>17} {v.get("delta", 0):>8.2f}{marca}')
        print(f'       {a["arquivo"]}: {conf["conferidas"]} células de orçado conferem '
              f'com a planilha, {len(conf["divergentes"])} divergem')
        for d in conf['divergentes']:
            print(f'          cta {d["cta"]} mês {MESES_CURTOS[d["mes"] - 1]}: '
                  f'PDF {moeda(d["pdf"])} × planilha {moeda(d["planilha"])} '
                  f'({d["motivo"]}) — o painel usa o da planilha')

    if razao:
        print(f'\nRazão — só detalhe de fornecedor ({len(razao)} arquivos)')
        for r in razao:
            c = r['conciliacao']
            print(f'  {MESES_CURTOS[r["mes"] - 1]:>4} layout {r["layout"]} '
                  f'{moeda(r["totalRealizado"]):>16} '
                  f'{"confere" if c["ok"] else "DIVERGENTE"}')

    if dieseis:
        print(f'\nDiesel ({len(dieseis)} arquivos)')
        for r in dieseis:
            print(f'  [{"OK " if r["ok"] else "FALHA"}] {r["arquivo"]}: '
                  f'{r["inicio"]} a {r["fim"]}, {moeda(r["totalLitros"])} L')

    if fretes:
        print(f'\nFrete carrada — faturamento por obra ({len(fretes)} meses)')
        for f in fretes:
            c = f['conferencia']
            print(f'  {MESES_CURTOS[f["mes"] - 1]:>4} {moeda(f["total"]):>16} '
                  f'em {len(f["porCRUsado"])} obras   fonte: {f["fonte"]}   aba {f["aba"]!r}')
            if c.get('temDetalhe') and not c.get('confere'):
                print(f'       ! resumo x detalhe divergem em {moeda(c["delta"])} '
                      f'({moeda(c["somaDetalhe"])} no detalhe)')
            if c.get('conflitoDeData'):
                print(f'       ! CONFLITO DE DATA: a aba diz '
                      f'{MESES_CURTOS[f["mes"] - 1]}/{f["ano"]} mas as datas dos '
                      f'lançamentos são de '
                      f'{MESES_CURTOS[c["mesReal"] - 1]}/{c["anoReal"]}')
        unidos = revisao['grafiasUnidas']
        if unidos:
            decididas = [u for u in unidos if u['origem'] == 'mapa']
            automaticas = [u for u in unidos if u['origem'] != 'mapa']
            print(f'\n  Normalização das obras — {len(unidos)} nomes unidos')
            for titulo, lista in (('decididas (OBRAS_NORMALIZADAS)', decididas),
                                  ('só diferença de grafia', automaticas)):
                if not lista:
                    continue
                print(f'     {titulo}:')
                for u in lista:
                    print(f'        {u["usado"]}')
                    for g in u['grafias']:
                        if g != u['usado']:
                            print(f'            <- {g}')

        if revisao['obrasRepetidas']:
            print('\n  ! GUARDA DA NORMALIZAÇÃO: a mesma obra duas vezes no mesmo '
                  'resumo — ou o resumo repete, ou a união está errada:')
            for a in revisao['obrasRepetidas']:
                print(f'        {MESES_CURTOS[a["mes"] - 1]} {a["obra"]}: '
                      f'{" | ".join(a["grafias"])}')

        if revisao['divergenciasPorObra']:
            print('\n  ! Resumo e detalhe discordam na obra (já normalizados) — '
                  'o painel usa o detalhe:')
            for d in revisao['divergenciasPorObra']:
                print(f'        {MESES_CURTOS[d["mes"] - 1]} {d["obra"]:<24} '
                      f'resumo {moeda(d["resumo"]):>14}   '
                      f'detalhe {moeda(d["detalhe"]):>14}   '
                      f'delta {moeda(d["delta"]):>14}')

    if problemas:
        print('\nArquivos não lidos:')
        for nome, erro in problemas:
            print(f'  - {nome}: {erro}')


def imprimir_faturamento(dados):
    """Mostra a composição da receita e o que ficou em branco."""
    carrada = {f['mes']: f['total'] for f in dados['freteCarrada']}
    avulso = {int(k): v['valor'] for k, v in dados['freteAvulso'].items()}
    erp = {m['mes']: m['receitaRealizada'] for m in dados['meses']
           if not m.get('parcial')}
    meses = sorted(set(carrada) | set(avulso) | set(erp))
    if not meses:
        return

    print('\nFaturamento (receita) — frete carrada + frete')
    cab = (f'  {"mês":>4} {"frete carrada":>16} {"frete":>16} {"soma":>16} '
           f'{"receita do ERP":>16} {"Δ":>14}')
    print(cab)
    print('  ' + '-' * (len(cab) - 2))
    faltando, nao_fecham = [], []
    for m in meses:
        c, a = carrada.get(m), avulso.get(m)
        soma = None if (c is None or a is None) else round(c + a, 2)
        r = erp.get(m)
        delta = None if (soma is None or r is None) else round(soma - r, 2)
        marca = ''
        if delta is not None and abs(delta) > 0.05:
            marca = '  !'
            nao_fecham.append((m, delta))
        print(f'  {MESES_CURTOS[m - 1]:>4} {moeda(c):>16} {moeda(a):>16} '
              f'{moeda(soma):>16} {moeda(r):>16} '
              f'{moeda(delta):>14}{marca}')
        if c is None:
            faltando.append(f'{MESES_CURTOS[m - 1]}: frete carrada'
                            + (f' ({MESES_SEM_FRETE_CARRADA[m]})'
                               if m in MESES_SEM_FRETE_CARRADA else ''))
        if a is None:
            faltando.append(f'{MESES_CURTOS[m - 1]}: frete (o outro serviço)')
    if faltando:
        print('  em branco, aguardando dado:')
        for x in faltando:
            print(f'     - {x}')
    if nao_fecham:
        print('  ! frete carrada + frete nao fecha com a receita do ERP:')
        for m, d in nao_fecham:
            print(f'     - {MESES_CURTOS[m - 1]}: sobra {moeda(d)} de frete '
                  f'rodado que a receita do mes nao cobre')


def imprimir_conflitos_de_pdf(dados):
    """Mês que aparece em dois relatórios, e o que mudou entre eles.

    Não é erro: o ERP lança retroativo, então o relatório mais novo traz o mês
    mais completo. Fica visível porque muda número já divulgado.
    """
    conflitos = dados.get('conflitosDePdf') or []
    if not conflitos:
        return
    por_mes = {m['mes']: m for m in dados['meses']}
    print('\nMeses em mais de um relatório — vale o de período mais recente')
    for c in conflitos:
        agora = por_mes.get(c['mes'], {})
        print(f'  {MESES_CURTOS[c["mes"] - 1]}: {c["antes"]} -> {c["agora"]}')
        for rotulo, antes, depois in (
                ('custo  ', c.get('custoAntes'), agora.get('custoRealizado')),
                ('receita', c.get('receitaAntes'), agora.get('receitaRealizada'))):
            if antes is None and depois is None:
                continue
            if antes is None:
                print(f'       {rotulo}: em branco -> {moeda(depois)}  '
                      f'(o relatório antigo não tinha)')
            elif depois is not None and abs(depois - antes) > 0.005:
                print(f'       {rotulo}: {moeda(antes)} -> {moeda(depois)}  '
                      f'(muda {moeda(depois - antes)})')


def imprimir_resumo(dados):
    com_dados = sorted(m['mes'] for m in dados['meses'])
    ausentes = [m for m in range(1, 13) if m not in com_dados]
    contas = {c['cta']: c for c in dados['contas']}
    pessoais = {c['cta'] for c in dados['contas'] if c['pessoal']}

    def realizado(mes, so_pessoal=None):
        total = 0.0
        for cta, por_mes in dados['valores'].items():
            v = por_mes.get(str(mes))
            if v is None:
                continue
            if so_pessoal is True and int(cta) not in pessoais:
                continue
            if so_pessoal is False and int(cta) in pessoais:
                continue
            total += v
        return total

    completos = [m for m in dados['meses'] if not m.get('parcial')]
    parciais = [m for m in dados['meses'] if m.get('parcial')]
    custo_real = sum(m['custoRealizado'] for m in completos)
    meses_completos = [m['mes'] for m in completos]
    custo_orc = sum(dados['orcadoAnual'].get(str(c), [0] * 12)[m - 1]
                    for m in meses_completos for c in contas)
    pessoal = sum(realizado(m, so_pessoal=True) for m in meses_completos)
    receita_real = sum(m['receitaRealizada'] or 0 for m in completos)
    receita_orc = sum(dados['receitaOrcadaAnual'][m - 1] for m in meses_completos)
    sem_receita = [m['mes'] for m in completos if m['receitaRealizada'] is None]

    print(f'\nResumo — {dados["centroCusto"]["nome"]} ({dados["centroCusto"]["codigo"]})'
          f' / {dados["ano"]}')
    print(f'  meses com Análise de Custos: '
          f'{", ".join(MESES_CURTOS[m - 1] for m in meses_completos)}')
    if parciais:
        print(f'  meses PARCIAIS (só razão, ~54% do custo, fora dos acumulados): '
              f'{", ".join(MESES_CURTOS[m["mes"] - 1] for m in parciais)}')
        for m in parciais:
            print(f'     {MESES_CURTOS[m["mes"] - 1]}: {moeda(m["custoRealizado"])} '
                  f'no razão — sem receita, sem diesel')
    if ausentes:
        print(f'  meses SEM dados: {", ".join(MESES_CURTOS[m - 1] for m in ausentes)}')
    print(f'  contas: {len(dados["contas"])} '
          f'({len(pessoais)} de pessoal, escondidas por padrão)')
    print(f'  custo    orçado {moeda(custo_orc):>17}   '
          f'realizado {moeda(custo_real):>17}'
          + (f'   ({custo_real / custo_orc * 100:.1f}%)' if custo_orc else ''))
    print(f'  receita  orçada {moeda(receita_orc):>17}   '
          f'realizada {moeda(receita_real):>17}')
    por_faturamento = [m['mes'] for m in completos
                       if m.get('fonteReceita') == 'faturamento']
    if por_faturamento:
        print(f'     receita preenchida pelo faturamento em: '
              f'{", ".join(MESES_CURTOS[m - 1] for m in por_faturamento)}')
    if sem_receita:
        print(f'     receita NÃO lançada em: '
              f'{", ".join(MESES_CURTOS[m - 1] for m in sem_receita)} '
              f'— sem resultado calculado nesses meses')
    comparaveis = [m for m in completos if m['receitaRealizada'] is not None]
    if comparaveis:
        res = sum(m['receitaRealizada'] - m['custoRealizado'] for m in comparaveis)
        print(f'  RESULTADO nos meses com receita lançada '
              f'({", ".join(MESES_CURTOS[m["mes"] - 1] for m in comparaveis)}): '
              f'{moeda(res)}')
    print(f'     do qual pessoal: {moeda(pessoal)}')
    razao = dados['razao']
    if razao['lancamentos']:
        soma = sum(l['valor'] for l in razao['lancamentos'])
        # a cobertura só compara os meses que têm as DUAS fontes
        nos_completos = sum(l['valor'] for l in razao['lancamentos']
                            if l['mes'] in meses_completos)
        print(f'  razão (detalhe de fornecedor): {len(razao["lancamentos"])} lançamentos, '
              f'{moeda(soma)}')
        if custo_real:
            print(f'     nos meses com Análise de Custos: {moeda(nos_completos)} = '
                  f'{nos_completos / custo_real * 100:.0f}% do custo')


# --------------------------------------------------------------- saída
def gravar_dados_js(dados, destino):
    destino.parent.mkdir(parents=True, exist_ok=True)
    corpo = json.dumps(dados, ensure_ascii=False, separators=(',', ':'))
    destino.write_text(
        '// Gerado por atualizar.py — não edite à mão.\n'
        f'// {dados["geradoEm"]}\n'
        f'window.DADOS = {corpo};\n',
        encoding='utf-8')
    return destino.stat().st_size


def versionar_assets(indice):
    """Poe ?v=<hash do conteudo> nas referencias de CSS e JS do index.html.

    Sem isso o navegador serve do cache o `dados.js` velho e a pessoa le numero
    antigo sem nenhum sinal de que esta velho -- o pior tipo de erro num painel.
    O hash vem do conteudo, entao a URL so muda quando o arquivo muda de fato, e
    o diff do git fica limpo entre publicacoes que nao mexeram no codigo.
    """
    html = indice.read_text(encoding='utf-8')
    original = html
    trocas = []

    def carimbar(m):
        atr, caminho = m.group(1), m.group(2)
        arquivo = indice.parent / caminho
        if not arquivo.is_file():
            return m.group(0)
        h = hashlib.sha256(arquivo.read_bytes()).hexdigest()[:8]
        trocas.append((caminho, h))
        return atr + '="' + caminho + '?v=' + h + '"'

    html = re.sub(PADRAO_ASSET, carimbar, html)
    if html != original:
        indice.write_text(html, encoding='utf-8')
    return trocas


def gravar_bundle(destino):
    """HTML único com CSS/JS/dados embutidos, para enviar por e-mail ou abrir solto.

    Casa os assets pelo mesmo PADRAO_ASSET que `versionar_assets` usa, e não por
    string literal: com `?v=<hash>` no caminho, uma lista de marcadores literais
    deixaria de casar e o bundle sairia com referência externa — quebrado
    justamente no uso em que ele existe para funcionar solto.
    """
    html = (RAIZ / 'index.html').read_text(encoding='utf-8')
    faltando, inlinados = [], []

    def inlinar(m):
        caminho = m.group('css') or m.group('js')
        arquivo = RAIZ / caminho
        if not arquivo.is_file():
            faltando.append(caminho)
            return m.group(0)
        corpo = arquivo.read_text(encoding='utf-8')
        inlinados.append(caminho)
        if caminho.endswith('.css'):
            return '<style>\n' + corpo + '\n</style>'
        # '</script' dentro de uma string JS fecharia a tag antes da hora
        return '<script>\n' + corpo.replace('</script', '<\\/script') + '\n</script>'

    html = TAG_ASSET.sub(inlinar, html)
    if faltando:
        print(f'  aviso: assets não encontrados para o bundle: {", ".join(faltando)}')
    if len(inlinados) < 6:
        print(f'  aviso: só {len(inlinados)} de 6 assets entraram no bundle — '
              f'ele não vai funcionar solto')
    destino.write_text(html, encoding='utf-8')
    return destino.stat().st_size


def main():
    ap = argparse.ArgumentParser(description='Gera js/dados.js a partir de planilhas/.')
    ap.add_argument('--pasta', default='planilhas')
    ap.add_argument('--bundle', action='store_true',
                    help='gera também dashboard-completo.html')
    args = ap.parse_args()

    pasta = Path(args.pasta)
    if not pasta.is_absolute():
        pasta = RAIZ / pasta
    print(f'Lendo de {pasta}')

    orc = ler_orcamento(pasta)
    orcado_por_conta = {c['cta']: c['orcado'] for c in orc['contas']}
    analises, p1 = ler_analises(pasta, orcado_por_conta)
    razao, p2 = ler_razao(pasta)
    dieseis, p3 = ler_diesel(pasta)
    fretes, p4, revisao = ler_frete(pasta)
    frete_avulso, p5 = ler_frete_avulso(pasta)
    problemas = p1 + p2 + p3 + p4 + p5

    if not analises:
        raise SystemExit(
            f'ERRO: nenhum PDF de Análise de Custos em {pasta / "analise"}.\n'
            'É a fonte primária do painel: tire no ERP o relatório FFOR501 '
            '(INVERSÃO GERENCIAL - ANÁLISE DE CUSTOS) do centro de custo.')

    imprimir(orc, analises, razao, dieseis, fretes, revisao, problemas)
    dados = montar(orc, analises, razao, dieseis, fretes, revisao, frete_avulso)
    imprimir_conflitos_de_pdf(dados)
    imprimir_faturamento(dados)
    imprimir_resumo(dados)

    tamanho = gravar_dados_js(dados, RAIZ / 'js' / 'dados.js')
    print(f'\nGravado js/dados.js ({tamanho / 1024:.0f} KB)')
    trocas = versionar_assets(RAIZ / 'index.html')
    if trocas:
        print(f'index.html: {len(trocas)} assets com ?v= do conteudo')
    if args.bundle:
        tamanho = gravar_bundle(RAIZ / 'dashboard-completo.html')
        print(f'Gravado dashboard-completo.html ({tamanho / 1024:.0f} KB)')

    falhou = [a for a in analises if not a['conciliacao']['ok']]
    if falhou or problemas or not orcamento.conferir_raiz(orc)['ok']:
        print('\nATENÇÃO: há arquivos que não conciliaram. Confira antes de publicar.')
        return 1
    print('Conciliação OK em todos os PDFs de Análise de Custos.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
