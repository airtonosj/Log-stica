# -*- coding: utf-8 -*-
"""Parser do PDF `FFOR501.GER — INVERSÃO GERENCIAL / ANÁLISE DE CUSTOS`.

É a fonte primária do painel. Diferente do razão (`FFOR001/FFOR401`, um
lançamento por linha), este relatório traz o CUSTO COMPLETO — inclusive o que
nunca vira nota em contas a pagar, como a baixa de óleo diesel do estoque e a
provisão de INSS — além de **Receita** e **Receita (−) Custo**.

Layout (paisagem, ~3 páginas por trimestre):

    Cta | C.C. | Classif | Nomenclatura | <Orçado Realizado> por mês | TOTAL
    ACUMULADO ANO: Orçado | Realizado | Diferença | %

Rodapé: `Custo Indireto`, `Custo Direto`, `Movimentação Novos Negócios`,
`Custo Total Edeconsil`, `Receita`, `Receita (-) Custo`.

DUAS REGRAS QUE SUSTENTAM A LEITURA
-----------------------------------
1. **Mapear número → coluna pela COORDENADA, nunca pela ordem.** Célula vazia é
   comum e não deixa marca no texto. Em maio/2026 a receita realizada está em
   branco: uma leitura sequencial atribuiria o orçado de junho ao realizado de
   maio. Os números são alinhados à direita e a borda direita de cada um
   coincide com a do rótulo da coluna em ~1pt.

2. **O orçado sai da planilha de orçamento, não daqui.** Quando a Nomenclatura é
   longa ela se SOBREPÕE fisicamente à primeira coluna de valor e os caracteres
   se entrelaçam (`( N a o 2M4o9n.6e4ta0r,3ia0)` = "(Nao Monetaria)" +
   "249.640,30"). Nenhum recorte por x separa isso. O orçado lido aqui serve só
   para conferir contra a planilha — 361 de 363 células batem, e as 2 exceções
   são exatamente esse caso.

`TOTAL ACUMULADO ANO` acumula desde JANEIRO, não desde o início do trimestre:
no PDF de abr–jun ele já embute jan–mar. Nunca somar essa coluna entre arquivos.
"""
import re

import pdfplumber

# tolerâncias em pontos (1/72")
TOL_LINHA = 1.5      # rótulo e números da mesma linha vêm com `top` levemente diferente
TOL_COLUNA = 7.0     # distância máxima entre a borda direita do número e a da coluna
X_FIM_NOMENCLATURA = 270.0

_NUMERO = re.compile(r'^-?[\d.]+,\d{2}-?$')
_CODIGO = re.compile(r'^\d{1,3}(\.\d{3})*$')
_MES_ANO = re.compile(r'^(\d{2})/(\d{4})$')
_PERIODO = re.compile(r'(\d{2}/\d{2}/\d{4})\s*a\s*(\d{2}/\d{2}/\d{4})')

TOTAL_DO_CENTRO = '001'
RODAPE_CUSTO = 'Custo Total Edeconsil'
RODAPE_RECEITA = 'Receita'
RODAPE_RESULTADO = 'Receita (-) Custo'


class LayoutDesconhecido(ValueError):
    pass


def _numero(texto):
    """'-1.190.977,54' -> -1190977.54 ; sufixo '-' também é negativo."""
    negativo = texto.startswith('-') or texto.endswith('-')
    limpo = texto.strip('-').replace('.', '').replace(',', '.')
    try:
        valor = float(limpo)
    except ValueError:
        return None
    return -valor if negativo else valor


def _linhas(pagina):
    """Agrupa as palavras da página em linhas visuais."""
    palavras = pagina.extract_words(x_tolerance=1.2, y_tolerance=2)
    grupos = []
    for palavra in sorted(palavras, key=lambda p: (p['top'], p['x0'])):
        for grupo in grupos:
            if abs(grupo['top'] - palavra['top']) <= TOL_LINHA:
                grupo['itens'].append(palavra)
                break
        else:
            grupos.append({'top': palavra['top'], 'itens': [palavra]})
    for grupo in grupos:
        grupo['itens'].sort(key=lambda p: p['x0'])
    return grupos


def _bordas_das_colunas(linhas):
    """Bordas direitas das 10 colunas de valor, da linha `Orçado Realizado …`."""
    for linha in linhas:
        rotulos = [i['text'] for i in linha['itens']]
        if rotulos.count('Orçado') >= 3:
            return [i['x1'] for i in linha['itens']]
    return None


def _meses(linhas):
    """Meses da página, pelos rótulos `MM/AAAA` do cabeçalho."""
    for linha in linhas:
        achados = [_MES_ANO.match(i['text']) for i in linha['itens']]
        achados = [a for a in achados if a]
        if len(achados) >= 2:
            return [(int(a.group(1)), int(a.group(2))) for a in achados]
    return []


def _periodo(linhas):
    for linha in linhas:
        texto = ' '.join(i['text'] for i in linha['itens'])
        achado = _PERIODO.search(texto)
        if achado:
            def iso(t):
                d, m, a = t.split('/')
                return f'{a}-{m}-{d}'
            return iso(achado.group(1)), iso(achado.group(2))
    return None, None


def _celulas(itens, bordas):
    """Distribui os números da linha pelas colunas, pela borda direita."""
    celulas = [None] * len(bordas)
    for item in itens:
        if not _NUMERO.match(item['text']):
            continue
        distancia, indice = min((abs(b - item['x1']), k) for k, b in enumerate(bordas))
        if distancia <= TOL_COLUNA:
            celulas[indice] = _numero(item['text'])
    return celulas


def _rotulo(itens):
    """Texto da coluna Nomenclatura (ignora Cta/C.C./Classif e os valores)."""
    partes = [i['text'] for i in itens
              if i['x0'] >= 120 and i['x1'] < X_FIM_NOMENCLATURA
              and not _NUMERO.match(i['text'])]
    return re.sub(r'\s+', ' ', ' '.join(partes)).strip()


def ler(caminho):
    """Parseia um PDF de Análise de Custos.

    Devolve dict com meses, contas (`{cta: {mes: {orcado, realizado}}}`),
    rodapé por mês e os acumulados que o próprio relatório imprime.
    """
    contas = {}
    rodape = {}
    meses = []
    acumulado = {}
    inicio = fim = None

    with pdfplumber.open(caminho) as pdf:
        for pagina in pdf.pages:
            linhas = _linhas(pagina)
            bordas = _bordas_das_colunas(linhas)
            if not bordas:
                continue
            if not meses:
                meses = _meses(linhas)
                inicio, fim = _periodo(linhas)
            n_meses = len(meses)

            for linha in linhas:
                itens = linha['itens']
                if not any(_NUMERO.match(i['text']) for i in itens):
                    continue
                celulas = _celulas(itens, bordas)
                if not any(c is not None for c in celulas):
                    continue

                primeiro = itens[0]['text']
                classif = next((i['text'] for i in itens
                                if re.fullmatch(r'\d{3}(\.\d{3})?', i['text'])), None)

                # linha de conta: começa com o código e traz uma classificação
                if _CODIGO.match(primeiro) and classif and primeiro != '2930':
                    cta = int(primeiro.replace('.', ''))
                    if classif == TOTAL_DO_CENTRO and cta == 0:
                        alvo = rodape.setdefault('Coordenacao de Logistica', {})
                    else:
                        alvo = contas.setdefault(cta, {})
                else:
                    chave = _rotulo(itens)
                    if not chave:
                        continue
                    alvo = rodape.setdefault(chave, {})

                for k, (mes, _ano) in enumerate(meses):
                    alvo[mes] = {'orcado': celulas[k * 2],
                                 'realizado': celulas[k * 2 + 1]}
                # o bloco final acumula desde janeiro — guardado à parte
                alvo['acumulado'] = {
                    'orcado': celulas[n_meses * 2],
                    'realizado': celulas[n_meses * 2 + 1],
                    'diferenca': celulas[n_meses * 2 + 2],
                    'percentual': celulas[n_meses * 2 + 3]
                    if len(celulas) > n_meses * 2 + 3 else None,
                }

    if not meses:
        raise LayoutDesconhecido(
            'não reconheci o layout de Análise de Custos: não achei a linha de '
            'cabeçalho com os pares Orçado/Realizado')

    acumulado = rodape.get(RODAPE_CUSTO, {}).get('acumulado', {})
    return {
        'fonte': 'FFOR501',
        'meses': [m for m, _a in meses],
        'ano': meses[0][1],
        'inicio': inicio,
        'fim': fim,
        'contas': contas,
        'rodape': rodape,
        'acumuladoDoRelatorio': acumulado,
    }


def conciliar(relatorio):
    """Soma das contas × rodapé `Custo Total`, mês a mês.

    É a checagem que segura tudo: se ela não fecha, o mapeamento de colunas
    saiu do lugar e todo número do painel fica suspeito.
    """
    custo = relatorio['rodape'].get(RODAPE_CUSTO)
    if not custo:
        return {'ok': False, 'erro': f'linha "{RODAPE_CUSTO}" ausente no PDF',
                'meses': {}}

    por_mes = {}
    for mes in relatorio['meses']:
        soma = round(sum((d.get(mes) or {}).get('realizado') or 0.0
                         for d in relatorio['contas'].values()), 2)
        total = round((custo.get(mes) or {}).get('realizado') or 0.0, 2)
        por_mes[mes] = {'somaContas': soma, 'rodape': total,
                        'delta': round(soma - total, 2)}

    return {
        'ok': all(abs(v['delta']) <= 0.02 for v in por_mes.values()),
        'meses': por_mes,
    }


def conferir_orcado(relatorio, orcado_por_conta):
    """Compara o orçado impresso no PDF com a planilha de orçamento.

    `orcado_por_conta`: {cta: [12 valores]}. Divergência esperada: as contas de
    nome longo, cujo número se entrelaça com o texto e não é extraível (ver o
    cabeçalho deste módulo). O painel usa o orçado da planilha; isto é auditoria.
    """
    conferidas = 0
    divergentes = []
    for cta, meses in relatorio['contas'].items():
        base = orcado_por_conta.get(cta)
        if base is None:
            continue
        for mes in relatorio['meses']:
            do_pdf = (meses.get(mes) or {}).get('orcado')
            da_planilha = base[mes - 1]
            if do_pdf is None:
                if abs(da_planilha) < 0.005:
                    conferidas += 1
                else:
                    divergentes.append({'cta': cta, 'mes': mes, 'pdf': None,
                                        'planilha': da_planilha,
                                        'motivo': 'não extraído do PDF'})
                continue
            if abs(do_pdf - da_planilha) > 0.05:
                divergentes.append({'cta': cta, 'mes': mes, 'pdf': do_pdf,
                                    'planilha': da_planilha,
                                    'motivo': 'valores diferentes'})
            else:
                conferidas += 1
    return {'conferidas': conferidas, 'divergentes': divergentes}
