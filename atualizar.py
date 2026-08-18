# -*- coding: utf-8 -*-
"""Gera js/dados.js a partir das planilhas em planilhas/.

Uso:
    python atualizar.py                  # lê planilhas/ e regrava js/dados.js
    python atualizar.py --pasta OUTRA    # usa outra pasta de planilhas
    python atualizar.py --bundle         # gera também o HTML único (1 arquivo)

Estrutura esperada:
    planilhas/orcamento/*.xls|*.xlsx     PROGRAMA ORÇAMENTÁRIO (F.AP.05)
    planilhas/inversoes/*.xlsx           INVERSÃO GERENCIAL (um arquivo por mês)
    planilhas/diesel/*.xlsx              consumo de óleo diesel (SECE214)

Sai com código 1 se qualquer arquivo não conciliar, para não publicar número
errado sem perceber.
"""
import argparse
import datetime
import json
import sys
from pathlib import Path

from leitores import diesel, inversao, orcamento

RAIZ = Path(__file__).resolve().parent
MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun',
                'jul', 'ago', 'set', 'out', 'nov', 'dez']

# ---------------------------------------------------------------------------
# RECORTE OPERACIONAL
#
# O painel é de operação, não de folha. O grupo 410 (DESPESAS COM PESSOAL) sai
# inteiro: salário, INSS, FGTS, IRRF, férias, 13º, rescisões, plano de saúde,
# odontológico, seguro de vida, alimentação, vale transporte, benefícios,
# empréstimo consignado, pensão, exames.
#
# Excluir o GRUPO inteiro (e não uma lista de contas) é de propósito: se o ERP
# criar uma conta de benefício nova no mês que vem, ela já sai de fora sozinha,
# em vez de entrar sem ninguém notar.
GRUPOS_EXCLUIDOS = {410}

# Encargos de folha que o ERP classificou fora do grupo de pessoal.
CONTAS_EXCLUIDAS = {
    1360,   # Contribuição sindical
    1370,   # Contribuição sindical patronal
}

# Contas do grupo excluído que você quer de volta, por serem operacionais.
# Basta acrescentar o código aqui e rodar o script de novo. Candidatas:
#     510   Diárias  — inclui os carretos pagos a terceiros
#     1860  Prestação de serviço continuado - PJ  — terceirizado, não é folha
#     530   EPIs/Uniformes
#     1770  EPC - Equipamento de proteção coletiva
CONTAS_MANTIDAS = set()


def fora_do_recorte(conta):
    """True quando a conta é de pessoal/folha e deve sair do painel."""
    if conta['cta'] in CONTAS_MANTIDAS:
        return False
    return conta['grupo'] in GRUPOS_EXCLUIDOS or conta['cta'] in CONTAS_EXCLUIDAS


def moeda(v):
    """1234567.89 -> '1.234.567,89'"""
    return f'{v:,.2f}'.replace(',', '\x00').replace('.', ',').replace('\x00', '.')


# --------------------------------------------------------------- coleta
def planilhas(pasta, subpasta, extensoes=('.xlsx',)):
    alvo = pasta / subpasta
    if not alvo.is_dir():
        return []
    achados = [p for p in sorted(alvo.iterdir())
               if p.suffix.lower() in extensoes and not p.name.startswith('~$')]
    return achados


def ler_orcamento(pasta):
    arquivos = planilhas(pasta, 'orcamento', ('.xls', '.xlsx'))
    if not arquivos:
        raise SystemExit(f'ERRO: nenhuma planilha de orçamento em {pasta / "orcamento"}')
    if len(arquivos) > 1:
        print(f'  aviso: {len(arquivos)} planilhas de orçamento; usando '
              f'{arquivos[-1].name}')
    caminho = arquivos[-1]
    dados = orcamento.ler(str(caminho))
    dados['arquivo'] = caminho.name
    return dados


def ler_inversoes(pasta):
    resultados, problemas = [], []
    for caminho in planilhas(pasta, 'inversoes'):
        try:
            relatorio = inversao.ler(str(caminho))
        except Exception as erro:                       # noqa: BLE001
            problemas.append((caminho.name, str(erro)))
            continue
        relatorio['arquivo'] = caminho.name
        relatorio['conciliacao'] = inversao.conciliar(relatorio)
        resultados.append(relatorio)
    resultados.sort(key=lambda r: (r['ano'], r['mes']))
    return resultados, problemas


def ler_diesel(pasta):
    resultados, problemas = [], []
    for caminho in planilhas(pasta, 'diesel'):
        try:
            relatorio = diesel.ler(str(caminho))
        except Exception as erro:                       # noqa: BLE001
            problemas.append((caminho.name, str(erro)))
            continue
        relatorio['arquivo'] = caminho.name
        resultados.append(relatorio)
    return resultados, problemas


# --------------------------------------------------------------- montagem
def montar(orc, inversoes, dieseis):
    """Une orçamento e realizado no formato consumido pelo dashboard."""
    grupos_despesa = orcamento.grupo_de_despesa(orc)
    por_conta = {c['cta']: c for c in orc['contas']}

    # Contas de pessoal/folha: fora do painel operacional.
    ctas_excluidas = {c['cta'] for c in orc['contas'] if fora_do_recorte(c)}

    # Contas que tiveram movimento em algum mês carregado.
    com_movimento = set()
    for relatorio in inversoes:
        for conta in relatorio['contas']:
            com_movimento.add(conta['cta'])

    # Só as contas dentro do escopo do relatório (subárvore de 260), e apenas as
    # que têm substância: algum valor orçado no ano ou algum movimento. O plano
    # de contas traz dezenas de linhas que nunca são usadas neste centro de
    # custo (CPMF, IOF, REFIS...); mantê-las só encheria a tabela de zeros.
    contas = []
    for c in orc['contas']:
        if c['grupo'] not in grupos_despesa:
            continue
        if c['cta'] in ctas_excluidas:
            continue
        if c['total'] == 0 and c['cta'] not in com_movimento:
            continue
        contas.append({
            'cta': c['cta'],
            'nome': c['nome'],
            'grupo': c['grupo'],
            'ordem': c['ordem'],
            'naoMonetaria': c['grupo'] == orcamento.GRUPO_NAO_MONETARIO,
            'orcado': c['orcado'],
        })
    conhecidas = {c['cta'] for c in contas}

    # Contas que aparecem no realizado mas não estão no escopo orçado:
    # entram como grupo None para não desaparecerem da análise.
    extras = {}
    for relatorio in inversoes:
        for conta in relatorio['contas']:
            if conta['cta'] in conhecidas or conta['cta'] in extras:
                continue
            if conta['cta'] in ctas_excluidas:
                continue
            base = por_conta.get(conta['cta'])
            extras[conta['cta']] = {
                'cta': conta['cta'],
                'nome': (base or conta)['nome'],
                'grupo': base['grupo'] if base else None,
                'ordem': 10000 + conta['cta'],
                'naoMonetaria': bool(base and base['grupo'] == orcamento.GRUPO_NAO_MONETARIO),
                'orcado': base['orcado'] if base else [0.0] * 12,
                'foraDoOrcamento': True,
            }
    contas.extend(extras.values())
    contas.sort(key=lambda c: c['ordem'])

    meses, lancamentos = [], []
    for relatorio in inversoes:
        # `realizado` carrega só o recorte operacional; os campos de conciliação
        # continuam medindo o ARQUIVO INTEIRO, senão a conferência de integridade
        # passaria a comparar coisas diferentes e nunca fecharia.
        realizado = {}
        excluido_no_mes = 0.0
        for conta in relatorio['contas']:
            if conta['cta'] in ctas_excluidas:
                excluido_no_mes += conta['realizado']
                continue
            realizado[str(conta['cta'])] = round(
                realizado.get(str(conta['cta']), 0.0) + conta['realizado'], 2)
        conc = relatorio['conciliacao']
        meses.append({
            'totalOperacional': round(sum(realizado.values()), 2),
            'totalPessoal': round(excluido_no_mes, 2),
            'mes': relatorio['mes'],
            'ano': relatorio['ano'],
            'inicio': relatorio['inicio'],
            'fim': relatorio['fim'],
            'arquivo': relatorio['arquivo'],
            'layout': relatorio['layout'],
            'origem': 'base',
            'totalRealizado': relatorio['totalRealizado'],
            'orcadoRelatorio': relatorio['totalOrcado'],
            'conciliado': conc['ok'],
            'somaContas': conc['somaContas'],
            'somaLancamentos': conc['somaLancamentos'],
            'realizado': realizado,
        })
        for l in relatorio['lancamentos']:
            if l['cta'] in ctas_excluidas:
                continue
            lancamentos.append({
                'mes': relatorio['mes'],
                'cta': l['cta'],
                'data': l['data'],
                'tipo': l['tipo'],
                'doc': l['doc'],
                'fornecedor': l['fornecedor'],
                'historico': l['historico'],
                'valor': l['valor'],
            })

    requisicoes_diesel, arquivos_diesel = [], []
    for relatorio in dieseis:
        arquivos_diesel.append({
            'arquivo': relatorio['arquivo'],
            'inicio': relatorio['inicio'],
            'fim': relatorio['fim'],
            'totalLitros': relatorio['totalLitros'],
            'origem': 'base',
        })
        requisicoes_diesel.extend(relatorio['requisicoes'])

    return {
        'centroCusto': {'codigo': orc['centroCusto'], 'nome': orc['nomeCentroCusto']},
        'ano': orc['ano'],
        'arquivoOrcamento': orc['arquivo'],
        'grupos': [
            {'codigo': codigo, 'nome': nome, 'ordem': i,
             'naoMonetario': codigo == orcamento.GRUPO_NAO_MONETARIO}
            for i, (codigo, nome) in enumerate(grupos_despesa.items())
            if codigo not in GRUPOS_EXCLUIDOS
        ],
        'recorte': {
            'grupos': sorted(GRUPOS_EXCLUIDOS),
            'nomesGrupos': [grupos_despesa[g] for g in sorted(GRUPOS_EXCLUIDOS)
                            if g in grupos_despesa],
            'contas': sorted(ctas_excluidas),
            'mantidas': sorted(CONTAS_MANTIDAS),
        },
        'contas': contas,
        'meses': meses,
        'lancamentos': lancamentos,
        'diesel': requisicoes_diesel,
        'arquivosDiesel': arquivos_diesel,
        'geradoEm': datetime.datetime.now().replace(microsecond=0).isoformat(),
    }


# --------------------------------------------------------------- relatório no terminal
def imprimir_conciliacao(orc, inversoes, dieseis, problemas):
    print(f'\nOrçamento: {orc["arquivo"]}')
    print(f'  centro de custo {orc["centroCusto"]} — {orc["nomeCentroCusto"]} / {orc["ano"]}')
    print(f'  {len(orc["contas"])} contas, {len(orc["grupos"])} grupos')
    raiz = orcamento.conferir_raiz(orc)
    marca = 'OK ' if raiz['ok'] else 'FALHA'
    print(f'  [{marca}] soma dos grupos de despesa == linha 260 '
          f'(total anual {moeda(raiz.get("totalRaiz", 0))})')
    if not raiz['ok']:
        print(f'         deltas por mês: {raiz.get("deltas")}')

    print(f'\nInversões gerenciais ({len(inversoes)} arquivos)')
    cab = (f'  {"mês":>4} {"lay":>3} {"total do CC":>16} {"contas":>16} '
           f'{"lançamentos":>16} {"Δ cta":>8} {"Δ lanç":>8}')
    print(cab)
    print('  ' + '-' * (len(cab) - 2))
    for r in inversoes:
        c = r['conciliacao']
        marca = ' ' if c['ok'] else '!'
        print(f'  {MESES_CURTOS[r["mes"] - 1]:>4} {r["layout"]:>3} '
              f'{moeda(c["total"]):>16} {moeda(c["somaContas"]):>16} '
              f'{moeda(c["somaLancamentos"]):>16} '
              f'{c["deltaContas"]:>8.2f} {c["deltaLancamentos"]:>8.2f} {marca}')
        for d in c['contasDivergentes'][:5]:
            print(f'        conta {d["cta"]} {d["nome"][:38]:<38} '
                  f'conta={moeda(d["conta"])} lançamentos={moeda(d["lancamentos"])}')

    if dieseis:
        print(f'\nDiesel ({len(dieseis)} arquivos)')
        for r in dieseis:
            marca = 'OK ' if r['ok'] else 'FALHA'
            print(f'  [{marca}] {r["arquivo"]}: {r["inicio"]} a {r["fim"]}, '
                  f'{len(r["requisicoes"])} requisições, '
                  f'{moeda(r["totalLitros"])} L (relatório declara '
                  f'{moeda(r["totalDeclarado"]) if r["totalDeclarado"] is not None else "—"})')

    if problemas:
        print('\nArquivos não lidos:')
        for nome, erro in problemas:
            print(f'  - {nome}: {erro}')


def imprimir_resumo(dados):
    com_dados = sorted(m['mes'] for m in dados['meses'])
    ausentes = [m for m in range(1, 13) if m not in com_dados]

    # orçado do mês = todas as contas do escopo, não só as que tiveram realizado
    orcado_ytd = sum(c['orcado'][m['mes'] - 1]
                     for m in dados['meses'] for c in dados['contas'])
    realizado_ytd = sum(m['totalOperacional'] for m in dados['meses'])
    pessoal_ytd = sum(m['totalPessoal'] for m in dados['meses'])

    print(f'\nResumo — {dados["centroCusto"]["nome"]} ({dados["centroCusto"]["codigo"]}) '
          f'/ {dados["ano"]}')
    print(f'  meses com dados: {", ".join(MESES_CURTOS[m - 1] for m in com_dados)}')
    if ausentes:
        print(f'  meses SEM dados: {", ".join(MESES_CURTOS[m - 1] for m in ausentes)}')
    print(f'  contas no escopo: {len(dados["contas"])}   '
          f'lançamentos: {len(dados["lancamentos"])}   '
          f'fornecedores: {len({l["fornecedor"] for l in dados["lancamentos"] if l["fornecedor"]})}')
    recorte = dados.get('recorte') or {}
    if recorte.get('contas'):
        print(f'  recorte operacional: {len(recorte["contas"])} contas de pessoal/folha '
              f'fora do painel ({", ".join(recorte.get("nomesGrupos") or []) or "—"})')
        print(f'     pessoal deixado de fora, no período: {moeda(pessoal_ytd):>16}')
        if recorte.get('mantidas'):
            print(f'     mantidas por serem operacionais: {recorte["mantidas"]}')
    print(f'  orçado YTD:    {moeda(orcado_ytd):>18}')
    print(f'  realizado YTD: {moeda(realizado_ytd):>18}   '
          f'({realizado_ytd / orcado_ytd * 100:.1f}% do orçado)' if orcado_ytd else '')
    if dados['diesel']:
        print(f'  diesel: {moeda(sum(d["litros"] for d in dados["diesel"]))} L '
              f'em {len(dados["diesel"])} requisições')


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


def gravar_bundle(destino):
    """HTML único com CSS/JS/dados embutidos, para enviar por e-mail ou rodar solto."""
    html = (RAIZ / 'index.html').read_text(encoding='utf-8')
    for marcador, arquivo, molde in (
        ('<link rel="stylesheet" href="css/estilo.css">', RAIZ / 'css/estilo.css',
         '<style>\n{}\n</style>'),
        ('<script src="js/dados.js"></script>', RAIZ / 'js/dados.js', '<script>\n{}\n</script>'),
        ('<script src="js/graficos.js"></script>', RAIZ / 'js/graficos.js', '<script>\n{}\n</script>'),
        ('<script src="js/xlsx.js"></script>', RAIZ / 'js/xlsx.js', '<script>\n{}\n</script>'),
        ('<script src="js/leitor.js"></script>', RAIZ / 'js/leitor.js', '<script>\n{}\n</script>'),
        ('<script src="js/app.js"></script>', RAIZ / 'js/app.js', '<script>\n{}\n</script>'),
    ):
        if marcador not in html:
            print(f'  aviso: marcador não encontrado no index.html: {marcador}')
            continue
        html = html.replace(marcador, molde.format(arquivo.read_text(encoding='utf-8')))
    destino.write_text(html, encoding='utf-8')
    return destino.stat().st_size


def main():
    ap = argparse.ArgumentParser(description='Gera js/dados.js a partir de planilhas/.')
    ap.add_argument('--pasta', default='planilhas', help='pasta com as planilhas')
    ap.add_argument('--bundle', action='store_true',
                    help='gera também dashboard-completo.html (arquivo único)')
    args = ap.parse_args()

    pasta = (RAIZ / args.pasta) if not Path(args.pasta).is_absolute() else Path(args.pasta)
    print(f'Lendo planilhas de {pasta}')

    orc = ler_orcamento(pasta)
    inversoes, problemas_inv = ler_inversoes(pasta)
    dieseis, problemas_diesel = ler_diesel(pasta)
    problemas = problemas_inv + problemas_diesel

    if not inversoes:
        raise SystemExit(f'ERRO: nenhuma inversão gerencial lida em {pasta / "inversoes"}')

    imprimir_conciliacao(orc, inversoes, dieseis, problemas)

    do_cc = [r for r in inversoes if r['centroCusto'] != orc['centroCusto']]
    if do_cc:
        print(f'\nERRO: arquivos de outro centro de custo: '
              f'{", ".join(r["arquivo"] for r in do_cc)}')
        return 1

    duplicados = [m for m in {r['mes'] for r in inversoes}
                  if sum(1 for r in inversoes if r['mes'] == m) > 1]
    if duplicados:
        print(f'\nERRO: mês repetido em mais de um arquivo: '
              f'{", ".join(MESES_CURTOS[m - 1] for m in duplicados)}')
        return 1

    dados = montar(orc, inversoes, dieseis)
    imprimir_resumo(dados)

    tamanho = gravar_dados_js(dados, RAIZ / 'js' / 'dados.js')
    print(f'\nGravado js/dados.js ({tamanho / 1024:.0f} KB)')

    if args.bundle:
        tamanho = gravar_bundle(RAIZ / 'dashboard-completo.html')
        print(f'Gravado dashboard-completo.html ({tamanho / 1024:.0f} KB)')

    falhou = [r for r in inversoes if not r['conciliacao']['ok']]
    falhou += [r for r in dieseis if not r['ok']]
    if falhou or problemas or not orcamento.conferir_raiz(orc)['ok']:
        print('\nATENÇÃO: há arquivos que não conciliaram. Confira antes de publicar.')
        return 1
    print('Conciliação OK em todos os arquivos.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
