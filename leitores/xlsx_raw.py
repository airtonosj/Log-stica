# -*- coding: utf-8 -*-
"""Leitor de .xlsx direto do zip + XML.

Os arquivos exportados por este ERP têm um stylesheet que o openpyxl rejeita
(`TypeError: Border.left should be Side but value is str`), por isso lemos o
SpreadsheetML na mão. Só precisamos de valores, nunca de formatação.
"""
import datetime
import re
import zipfile
import xml.etree.ElementTree as ET

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
NS_REL = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
_COL_RE = re.compile(r'[A-Z]+')
_EPOCH = datetime.date(1899, 12, 30)


def serial_para_data(n):
    """Serial de data do Excel -> datetime.date."""
    return _EPOCH + datetime.timedelta(days=int(n))


class Planilha:
    """Uma aba, como {numero_da_linha: {'A': valor, 'B': valor, ...}}."""

    def __init__(self, nome, linhas):
        self.nome = nome
        self.linhas = linhas

    def linha(self, n):
        return self.linhas.get(n, {})

    def numeros_de_linha(self):
        return sorted(self.linhas)

    def texto_das_primeiras(self, quantas=12):
        """Concatena o texto das primeiras linhas — para identificar o relatório."""
        return ' '.join(
            str(v)
            for n in self.numeros_de_linha()[:quantas]
            for v in self.linhas[n].values()
        )


def abrir(caminho):
    """Devolve a lista de Planilha de um .xlsx."""
    with zipfile.ZipFile(caminho) as z:
        compartilhadas = _strings_compartilhadas(z)
        return [
            Planilha(nome, _celulas(z, alvo, compartilhadas))
            for nome, alvo in _abas(z)
        ]


def primeira_aba(caminho):
    abas = abrir(caminho)
    if not abas:
        raise ValueError(f'{caminho}: arquivo sem abas')
    return abas[0]


def _strings_compartilhadas(z):
    if 'xl/sharedStrings.xml' not in z.namelist():
        return []
    raiz = ET.fromstring(z.read('xl/sharedStrings.xml'))
    return [
        ''.join(t.text or '' for t in item.iter(NS + 't'))
        for item in raiz
    ]


def _abas(z):
    livro = ET.fromstring(z.read('xl/workbook.xml'))
    rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
    destino = {r.get('Id'): r.get('Target') for r in rels}
    saida = []
    for aba in livro.iter(NS + 'sheet'):
        alvo = destino[aba.get(NS_REL + 'id')].lstrip('/')
        if not alvo.startswith('xl/'):
            alvo = 'xl/' + alvo
        saida.append((aba.get('name'), alvo))
    return saida


def _celulas(z, alvo, compartilhadas):
    raiz = ET.fromstring(z.read(alvo))
    linhas = {}
    for linha in raiz.iter(NS + 'row'):
        atual = {}
        for celula in linha.iter(NS + 'c'):
            valor = _valor(celula, compartilhadas)
            if valor is None or valor == '':
                continue
            atual[_COL_RE.match(celula.get('r')).group()] = valor
        if atual:
            linhas[int(linha.get('r'))] = atual
    return linhas


def _valor(celula, compartilhadas):
    tipo = celula.get('t')
    v = celula.find(NS + 'v')
    if tipo == 's' and v is not None:
        indice = int(v.text)
        return compartilhadas[indice] if indice < len(compartilhadas) else None
    if tipo == 'inlineStr':
        embutido = celula.find(NS + 'is')
        if embutido is None:
            return None
        return ''.join(t.text or '' for t in embutido.iter(NS + 't'))
    if tipo == 'str' and v is not None:      # resultado de fórmula em texto
        return v.text
    if v is None:
        return None
    try:
        return float(v.text)
    except (TypeError, ValueError):
        return v.text
