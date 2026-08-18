# -*- coding: utf-8 -*-
"""Leitor mínimo de .xls legado (OLE/CFB + BIFF8), somente leitura.

O formulário de orçamento (F.AP.05) é BIFF8 de verdade. Nenhuma biblioteca de
leitura de .xls está instalada neste ambiente, então implementamos o suficiente:
navegar o compound file, montar a SST e ler as células de valor.
"""
import struct

# --- registros BIFF que nos interessam ---
_BOUNDSHEET = 0x0085
_SST = 0x00FC
_CONTINUE = 0x003C
_LABELSST = 0x00FD
_NUMBER = 0x0203
_RK = 0x027E
_MULRK = 0x00BD
_FORMULA = 0x0006
_STRING = 0x0207
_LABEL = 0x0204
_EOF = 0x000A

_LIVRE = 0xFFFFFFF0          # setores >= este valor não são encadeamento
_ASSINATURA = b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1'


def abrir(caminho):
    """Devolve {nome_da_aba: {(linha, coluna): valor}} com índices base 0."""
    with open(caminho, 'rb') as f:
        bruto = f.read()
    fluxos = _fluxos_ole(bruto)
    livro = fluxos.get('Workbook') or fluxos.get('Book')
    if livro is None:
        raise ValueError(f'{caminho}: não encontrei o fluxo Workbook')
    return _ler_biff(livro)


# ---------------------------------------------------------------- OLE / CFB
def _fluxos_ole(dados):
    if dados[:8] != _ASSINATURA:
        raise ValueError('não é um arquivo .xls legado (assinatura OLE ausente)')

    tam_setor = 1 << struct.unpack_from('<H', dados, 30)[0]
    tam_mini = 1 << struct.unpack_from('<H', dados, 32)[0]
    qtd_fat = struct.unpack_from('<I', dados, 44)[0]
    dir_inicio = struct.unpack_from('<I', dados, 48)[0]
    mini_inicio = struct.unpack_from('<I', dados, 60)[0]
    difat_inicio = struct.unpack_from('<I', dados, 68)[0]
    qtd_difat = struct.unpack_from('<I', dados, 72)[0]

    def setor(i):
        base = 512 + i * tam_setor
        return dados[base:base + tam_setor]

    # DIFAT: 109 entradas no cabeçalho, o resto em cadeia
    difat = list(struct.unpack_from('<109I', dados, 76))
    atual = difat_inicio
    for _ in range(qtd_difat):
        if atual >= _LIVRE:
            break
        bloco = struct.unpack('<%dI' % (tam_setor // 4), setor(atual))
        difat.extend(bloco[:-1])
        atual = bloco[-1]

    fat = []
    for s in difat[:qtd_fat]:
        if s < _LIVRE:
            fat.extend(struct.unpack('<%dI' % (tam_setor // 4), setor(s)))

    def cadeia(inicio):
        saida, atual, vistos = [], inicio, set()
        while atual < _LIVRE and atual not in vistos:
            vistos.add(atual)
            saida.append(atual)
            atual = fat[atual] if atual < len(fat) else _LIVRE
        return saida

    def ler_cadeia(inicio, tamanho=None):
        b = b''.join(setor(i) for i in cadeia(inicio))
        return b[:tamanho] if tamanho else b

    entradas = _entradas_diretorio(ler_cadeia(dir_inicio))
    raiz = next((e for e in entradas if e[1] == 5), None)
    mini_dados = ler_cadeia(raiz[2]) if raiz and raiz[2] < _LIVRE else b''

    mini_fat = []
    if mini_inicio < _LIVRE:
        b = ler_cadeia(mini_inicio)
        mini_fat = list(struct.unpack('<%dI' % (len(b) // 4), b))

    def ler_mini(inicio, tamanho):
        saida, atual, vistos = b'', inicio, set()
        while atual < _LIVRE and atual not in vistos:
            vistos.add(atual)
            saida += mini_dados[atual * tam_mini:(atual + 1) * tam_mini]
            atual = mini_fat[atual] if atual < len(mini_fat) else _LIVRE
        return saida[:tamanho]

    fluxos = {}
    for nome, tipo, inicio, tamanho in entradas:
        if tipo != 2 or inicio >= _LIVRE:
            continue
        fluxos[nome] = (ler_mini(inicio, tamanho) if tamanho < 4096
                        else ler_cadeia(inicio, tamanho))
    return fluxos


def _entradas_diretorio(dados):
    entradas = []
    for i in range(0, len(dados) - 127, 128):
        e = dados[i:i + 128]
        tam_nome = struct.unpack_from('<H', e, 64)[0]
        nome = e[:max(0, tam_nome - 2)].decode('utf-16-le', 'replace')
        entradas.append((nome, e[66],
                         struct.unpack_from('<I', e, 116)[0],
                         struct.unpack_from('<Q', e, 120)[0]))
    return entradas


# ---------------------------------------------------------------- BIFF8
def _registros(buffer, posicao=0):
    fim = len(buffer)
    while posicao + 4 <= fim:
        tipo, tamanho = struct.unpack_from('<HH', buffer, posicao)
        yield tipo, buffer[posicao + 4:posicao + 4 + tamanho]
        posicao += 4 + tamanho


def _texto(dados, deslocamento, tamanho_em_16_bits=True):
    """XLUnicodeString: contador de 8 ou 16 bits + flag de codificação."""
    if tamanho_em_16_bits:
        qtd = struct.unpack_from('<H', dados, deslocamento)[0]
        deslocamento += 2
    else:
        qtd = dados[deslocamento]
        deslocamento += 1
    flags = dados[deslocamento]
    deslocamento += 1
    if flags & 0x01:
        bruto = dados[deslocamento:deslocamento + qtd * 2]
        return bruto.decode('utf-16-le', 'replace'), deslocamento + qtd * 2
    bruto = dados[deslocamento:deslocamento + qtd]
    return bruto.decode('cp1252', 'replace'), deslocamento + qtd


def _valor_rk(v):
    """RK: inteiro deslocado ou double truncado, opcionalmente /100."""
    if v & 0x02:
        numero = float(v >> 2)
    else:
        numero = struct.unpack('<d', struct.pack('<Q', (v & 0xFFFFFFFC) << 32))[0]
    return numero / 100.0 if v & 0x01 else numero


def _ler_sst(blocos):
    """SST + CONTINUE -> lista de strings. Uma string pode atravessar blocos."""
    if not blocos:
        return []
    indice, dados, pos = 0, blocos[0], 8
    total_unicas = struct.unpack_from('<I', dados, 4)[0]
    strings = []

    def proximo_bloco():
        nonlocal indice, dados, pos
        indice += 1
        if indice >= len(blocos):
            return False
        dados, pos = blocos[indice], 0
        return True

    for _ in range(total_unicas):
        while pos >= len(dados):
            if not proximo_bloco():
                return strings
        if pos + 3 > len(dados) and not proximo_bloco():
            return strings

        qtd = struct.unpack_from('<H', dados, pos)[0]
        pos += 2
        flags = dados[pos]
        pos += 1
        largo = flags & 0x01
        qtd_runs = 0
        bytes_extra = 0
        if flags & 0x08:
            qtd_runs = struct.unpack_from('<H', dados, pos)[0]
            pos += 2
        if flags & 0x04:
            bytes_extra = struct.unpack_from('<i', dados, pos)[0]
            pos += 4

        partes, restam = [], qtd
        while restam > 0:
            disponivel = len(dados) - pos
            if disponivel <= 0:
                if not proximo_bloco():
                    break
                largo = dados[0] & 0x01     # o CONTINUE reinicia a codificação
                pos = 1
                continue
            largura = 2 if largo else 1
            pegar = min(restam, disponivel // largura)
            if pegar == 0:
                if not proximo_bloco():
                    break
                largo = dados[0] & 0x01
                pos = 1
                continue
            bruto = dados[pos:pos + pegar * largura]
            partes.append(bruto.decode('utf-16-le' if largo else 'cp1252', 'replace'))
            pos += pegar * largura
            restam -= pegar

        pular = qtd_runs * 4 + bytes_extra
        while pular > 0:
            disponivel = len(dados) - pos
            if disponivel <= 0:
                if not proximo_bloco():
                    break
                continue
            avanco = min(pular, disponivel)
            pos += avanco
            pular -= avanco

        strings.append(''.join(partes))
    return strings


def _ler_biff(livro):
    registros = list(_registros(livro))
    abas, blocos_sst = [], []
    for i, (tipo, dados) in enumerate(registros):
        if tipo == _BOUNDSHEET:
            posicao = struct.unpack_from('<I', dados, 0)[0]
            nome, _ = _texto(dados, 6, tamanho_em_16_bits=False)
            abas.append((nome, posicao))
        elif tipo == _SST and not blocos_sst:
            blocos_sst = [dados]
            j = i + 1
            while j < len(registros) and registros[j][0] == _CONTINUE:
                blocos_sst.append(registros[j][1])
                j += 1
    sst = _ler_sst(blocos_sst)

    saida = {}
    for nome, inicio in abas:
        saida[nome] = _ler_aba(livro, inicio, sst)
    return saida


def _ler_aba(livro, inicio, sst):
    celulas = {}
    pendente = None                       # FORMULA cujo resultado vem no STRING
    for tipo, dados in _registros(livro, inicio):
        if tipo == _EOF:
            break
        if tipo == _LABELSST:
            linha, coluna, _, indice = struct.unpack_from('<HHHI', dados, 0)
            celulas[(linha, coluna)] = sst[indice] if indice < len(sst) else None
        elif tipo == _NUMBER:
            linha, coluna, _ = struct.unpack_from('<HHH', dados, 0)
            celulas[(linha, coluna)] = struct.unpack_from('<d', dados, 6)[0]
        elif tipo == _RK:
            linha, coluna, _, v = struct.unpack_from('<HHHI', dados, 0)
            celulas[(linha, coluna)] = _valor_rk(v)
        elif tipo == _MULRK:
            linha, primeira = struct.unpack_from('<HH', dados, 0)
            for k in range((len(dados) - 6) // 6):
                v = struct.unpack_from('<I', dados, 4 + k * 6 + 2)[0]
                celulas[(linha, primeira + k)] = _valor_rk(v)
        elif tipo == _LABEL:
            linha, coluna, _ = struct.unpack_from('<HHH', dados, 0)
            celulas[(linha, coluna)], _ = _texto(dados, 6)
        elif tipo == _FORMULA:
            linha, coluna, _ = struct.unpack_from('<HHH', dados, 0)
            resultado = dados[6:14]
            if resultado[6:8] == b'\xff\xff':           # não é número
                marcador = resultado[0]
                if marcador == 0:
                    pendente = (linha, coluna)          # texto vem no STRING
                elif marcador == 1:
                    celulas[(linha, coluna)] = bool(resultado[2])
                elif marcador == 2:
                    celulas[(linha, coluna)] = '#ERRO'
                else:
                    celulas[(linha, coluna)] = None
            else:
                celulas[(linha, coluna)] = struct.unpack('<d', resultado)[0]
        elif tipo == _STRING and pendente:
            celulas[pendente], _ = _texto(dados, 0)
            pendente = None
    return celulas
