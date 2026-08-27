/* ==========================================================================
   xlsx.js — escreve .xlsx sem biblioteca.

   Um .xlsx é um zip de XML. Comprimimos com CompressionStream('deflate-raw'),
   nativo; se não existir, gravamos as entradas como "stored" (método 0), que o
   Excel também abre. O CRC-32 é calculado aqui mesmo.
   ========================================================================== */
'use strict';

const Xlsx = (() => {

/* ----------------------------------------------------------- CRC-32 */
const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) {
    c = TABELA_CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

async function deflacionar(bytes) {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const fluxo = new Blob([bytes]).stream()
      .pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(fluxo).arrayBuffer());
  } catch (e) {
    return null;
  }
}

/* ----------------------------------------------------------- zip */
const utf8 = new TextEncoder();

async function zipar(entradas) {
  const partes = [];
  const indice = [];
  let deslocamento = 0;

  for (const entrada of entradas) {
    const cru = typeof entrada.conteudo === 'string'
      ? utf8.encode(entrada.conteudo) : entrada.conteudo;
    const comprimido = await deflacionar(cru);
    const usaDeflate = comprimido && comprimido.length < cru.length;
    const dados = usaDeflate ? comprimido : cru;
    const metodo = usaDeflate ? 8 : 0;
    const nome = utf8.encode(entrada.nome);
    const crc = crc32(cru);

    const local = new Uint8Array(30 + nome.length);
    const dvl = new DataView(local.buffer);
    dvl.setUint32(0, 0x04034b50, true);
    dvl.setUint16(4, 20, true);            // versão necessária
    dvl.setUint16(6, 0x0800, true);        // nome em UTF-8
    dvl.setUint16(8, metodo, true);
    dvl.setUint16(10, 0, true);            // hora
    dvl.setUint16(12, 0x2821, true);       // data fixa (1 jan 2020) — build reproduzível
    dvl.setUint32(14, crc, true);
    dvl.setUint32(18, dados.length, true);
    dvl.setUint32(22, cru.length, true);
    dvl.setUint16(26, nome.length, true);
    dvl.setUint16(28, 0, true);
    local.set(nome, 30);

    partes.push(local, dados);
    indice.push({ nome, metodo, crc, comprimido: dados.length, cru: cru.length, deslocamento });
    deslocamento += local.length + dados.length;
  }

  const inicioIndice = deslocamento;
  let tamanhoIndice = 0;
  for (const e of indice) {
    const central = new Uint8Array(46 + e.nome.length);
    const dvc = new DataView(central.buffer);
    dvc.setUint32(0, 0x02014b50, true);
    dvc.setUint16(4, 20, true);
    dvc.setUint16(6, 20, true);
    dvc.setUint16(8, 0x0800, true);
    dvc.setUint16(10, e.metodo, true);
    dvc.setUint16(12, 0, true);
    dvc.setUint16(14, 0x2821, true);
    dvc.setUint32(16, e.crc, true);
    dvc.setUint32(20, e.comprimido, true);
    dvc.setUint32(24, e.cru, true);
    dvc.setUint16(28, e.nome.length, true);
    dvc.setUint32(42, e.deslocamento, true);
    central.set(e.nome, 46);
    partes.push(central);
    tamanhoIndice += central.length;
  }

  const fim = new Uint8Array(22);
  const dvf = new DataView(fim.buffer);
  dvf.setUint32(0, 0x06054b50, true);
  dvf.setUint16(8, indice.length, true);
  dvf.setUint16(10, indice.length, true);
  dvf.setUint32(12, tamanhoIndice, true);
  dvf.setUint32(16, inicioIndice, true);
  partes.push(fim);

  return new Blob(partes, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/* ----------------------------------------------------------- XML */
function escapar(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // caracteres de controle são inválidos em XML e travam o Excel
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

function letraColuna(n) {
  let s = '';
  n += 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/* ----------------------------------------------------------- estilos
   0 padrão · 1 cabeçalho · 2 R$ · 3 inteiro · 4 percentual
   5 negrito · 6 R$ negrito · 7 inteiro negrito · 8 data · 9 percentual negrito */
const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3">
<numFmt numFmtId="164" formatCode="#,##0.00"/>
<numFmt numFmtId="165" formatCode="#,##0"/>
<numFmt numFmtId="166" formatCode="0.0&quot;%&quot;"/>
</numFmts>
<fonts count="3">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><name val="Calibri"/></font>
</fonts>
<fills count="3">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF2A78D6"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top style="thin"><color rgb="FFC3C2B7"/></top><bottom/><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="10">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
<xf numFmtId="164" fontId="2" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="165" fontId="2" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="2" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const ESTILO = {
  padrao: 0, cabecalho: 1, moeda: 2, inteiro: 3, pct: 4,
  negrito: 5, moedaNegrito: 6, inteiroNegrito: 7, data: 8, pctNegrito: 9,
};

/** Estilo do rodapé (negrito) correspondente ao estilo normal da coluna. */
function estiloRodape(estilo) {
  switch (estilo) {
    case ESTILO.moeda: return ESTILO.moedaNegrito;
    case ESTILO.inteiro: return ESTILO.inteiroNegrito;
    case ESTILO.pct: return ESTILO.pctNegrito;
    default: return ESTILO.negrito;
  }
}

/* ----------------------------------------------------------- aba */
/**
 * aba = { nome, colunas: [{rotulo, largura, estilo}], linhas: [[valor…]],
 *         rodape?: [valor…], titulo?: 'texto acima do cabeçalho' }
 * Cada valor é número, string, null, ou {v, estilo}.
 */
function montarAba(aba) {
  const colunas = aba.colunas || [];
  const linhas = [];

  let n = 1;
  const blocosTitulo = aba.titulo ? (Array.isArray(aba.titulo) ? aba.titulo : [aba.titulo]) : [];
  blocosTitulo.forEach(t => {
    linhas.push(`<row r="${n}"><c r="A${n}" t="inlineStr" s="${ESTILO.negrito}">`
      + `<is><t xml:space="preserve">${escapar(t)}</t></is></c></row>`);
    n += 1;
  });
  if (blocosTitulo.length) { linhas.push(`<row r="${n}"/>`); n += 1; }

  const linhaCabecalho = n;
  linhas.push(`<row r="${n}" ht="26" customHeight="1">` + colunas.map((c, i) =>
    `<c r="${letraColuna(i)}${n}" t="inlineStr" s="${ESTILO.cabecalho}">`
    + `<is><t xml:space="preserve">${escapar(c.rotulo)}</t></is></c>`).join('') + '</row>');
  n += 1;

  const celula = (valor, i, r, estiloPadrao) => {
    let v = valor;
    let estilo = estiloPadrao;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      estilo = v.estilo === undefined ? estilo : v.estilo;
      v = v.v;
    }
    const ref = letraColuna(i) + r;
    if (v === null || v === undefined || v === '') {
      return estilo ? `<c r="${ref}" s="${estilo}"/>` : '';
    }
    if (typeof v === 'number' && isFinite(v)) {
      return `<c r="${ref}" s="${estilo}"><v>${v}</v></c>`;
    }
    return `<c r="${ref}" t="inlineStr" s="${estilo}">`
         + `<is><t xml:space="preserve">${escapar(v)}</t></is></c>`;
  };

  (aba.linhas || []).forEach(linha => {
    linhas.push(`<row r="${n}">` + linha.map((valor, i) =>
      celula(valor, i, n, (colunas[i] && colunas[i].estilo) || ESTILO.padrao)).join('') + '</row>');
    n += 1;
  });

  if (aba.rodape) {
    linhas.push(`<row r="${n}">` + aba.rodape.map((valor, i) =>
      celula(valor, i, n, estiloRodape((colunas[i] && colunas[i].estilo) || ESTILO.padrao))
    ).join('') + '</row>');
    n += 1;
  }

  const cols = colunas.length
    ? '<cols>' + colunas.map((c, i) =>
        `<col min="${i + 1}" max="${i + 1}" width="${c.largura || 14}" customWidth="1"/>`).join('') + '</cols>'
    : '';

  // painéis congelados abaixo do cabeçalho
  const congelar = `<sheetViews><sheetView workbookViewId="0">`
    + `<pane ySplit="${linhaCabecalho}" topLeftCell="A${linhaCabecalho + 1}" `
    + `activePane="bottomLeft" state="frozen"/>`
    + `<selection pane="bottomLeft" activeCell="A${linhaCabecalho + 1}" `
    + `sqref="A${linhaCabecalho + 1}"/></sheetView></sheetViews>`;

  const ultimaColuna = letraColuna(Math.max(0, colunas.length - 1));
  const autoFiltro = colunas.length
    ? `<autoFilter ref="A${linhaCabecalho}:${ultimaColuna}${Math.max(linhaCabecalho, n - 1)}"/>`
    : '';

  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + congelar + cols
    + '<sheetData>' + linhas.join('') + '</sheetData>'
    + autoFiltro
    + '</worksheet>';
}

/* ----------------------------------------------------------- pasta de trabalho */
async function gerar(abas, nomeArquivo) {
  const validas = abas.filter(Boolean);

  // O Excel rejeita nome de aba > 31 caracteres ou com : \ / ? * [ ]
  const usados = new Set();
  validas.forEach(aba => {
    let nome = String(aba.nome || 'Planilha').replace(/[:\\/?*[\]]/g, '-').slice(0, 31);
    let tentativa = nome, i = 2;
    while (usados.has(tentativa.toLowerCase())) {
      tentativa = nome.slice(0, 28) + '(' + i++ + ')';
    }
    usados.add(tentativa.toLowerCase());
    aba.nomeFinal = tentativa;
  });

  const entradas = [
    {
      nome: '[Content_Types].xml',
      conteudo: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Default Extension="xml" ContentType="application/xml"/>'
        + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        + validas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" `
            + 'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')
        + '</Types>',
    },
    {
      nome: '_rels/.rels',
      conteudo: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        + '</Relationships>',
    },
    {
      nome: 'xl/workbook.xml',
      conteudo: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
        + validas.map((aba, i) =>
            `<sheet name="${escapar(aba.nomeFinal)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')
        + '</sheets></workbook>',
    },
    {
      nome: 'xl/_rels/workbook.xml.rels',
      conteudo: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + validas.map((_, i) => `<Relationship Id="rId${i + 1}" `
            + 'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
            + `Target="worksheets/sheet${i + 1}.xml"/>`).join('')
        + `<Relationship Id="rId${validas.length + 1}" `
        + 'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" '
        + 'Target="styles.xml"/>'
        + '</Relationships>',
    },
    { nome: 'xl/styles.xml', conteudo: ESTILOS },
  ];

  validas.forEach((aba, i) => {
    entradas.push({ nome: `xl/worksheets/sheet${i + 1}.xml`, conteudo: montarAba(aba) });
  });

  const blob = await zipar(entradas);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

return { gerar, ESTILO };

})();


/* ==========================================================================
   Relatorio — monta as abas do Excel a partir da visão filtrada.

   Respeita os filtros ativos: o arquivo é a tela, em planilha. A aba `Resumo`
   registra qual recorte foi exportado, para ninguém confundir depois um export
   sem folha com o custo cheio.
   ========================================================================== */
const Relatorio = (() => {

const E = Xlsx.ESTILO;
const fmt = G.fmt;

function cabecalho(estado, v) {
  const f = estado.filtros;
  const base = estado.base;
  const linhas = [
    `${base.centroCusto.nome} (centro de custo ${base.centroCusto.codigo}) — `
    + `exercício ${base.ano}`,
  ];
  const partes = [];
  partes.push(f.periodo === 'ytd'
    ? 'Período: acumulado (' + v.mesesFiltro.map(fmt.mes).join(', ') + ')'
    : 'Período: ' + fmt.mesLongo(Number(f.periodo)));
  if (f.grupo) partes.push('Grupo: ' + (v.nomeGrupo[f.grupo] || f.grupo));
  if (f.conta) {
    const c = v.porCta[Number(f.conta)];
    partes.push('Conta: ' + (c ? `${c.cta} · ${c.nome}` : f.conta));
  }
  if (f.busca) partes.push('Busca: ' + f.busca);
  partes.push('Pessoal/folha: ' + (f.pessoal ? 'incluído' : 'ESCONDIDO'));
  linhas.push(partes.join('  ·  '));
  linhas.push('Custo e receita vêm do PDF de Análise de Custos (FFOR501); '
    + 'o orçado vem da planilha de orçamento.');
  return linhas;
}

function abaResumo(v, estado) {
  const r = v.resultado;
  const ausentes = [];
  for (let m = 1; m <= 12; m++) if (!v.mesesComDados.includes(m)) ausentes.push(m);

  const linhas = [
    ['RESULTADO (sempre com o custo cheio, inclusive folha)', ''],
    ['Receita realizada', r.receitaRealizada],
    ['Custo realizado', r.custoRealizado],
    ['Resultado realizado', r.valor],
    ['Margem sobre a receita (%)', { v: r.margem, estilo: E.pct }],
    ['Resultado orçado para os mesmos meses', r.orcado],
    ['Meses no cálculo', r.meses.map(fmt.mesLongo).join(', ') || 'nenhum'],
    ['Meses sem receita lançada (fora do cálculo)',
     r.mesesSemReceita.map(fmt.mesLongo).join(', ') || 'nenhum'],
    ['Meses no vermelho', r.mesesNegativos.map(fmt.mesLongo).join(', ') || 'nenhum'],
    ['', ''],
    ['CUSTO NO RECORTE DESTE ARQUIVO', ''],
    ['Orçado no período', v.total.orcado],
    ['Realizado no período', v.total.realizado],
    ['Desvio', v.total.desvio],
    ['Execução do orçado (%)', { v: v.total.execucao, estilo: E.pct }],
    ['Orçamento do ano', v.total.orcadoAno],
    ['Projeção de fechamento', v.total.projecao],
    ['Contas no recorte', { v: v.linhasConta.length, estilo: E.inteiro }],
    ['Pessoal/folha no período', v.pessoalNoFiltro],
    ['', ''],
    ['Meses com Análise de Custos', v.mesesComDados.map(fmt.mesLongo).join(', ')],
    ['Meses sem Análise de Custos', ausentes.map(fmt.mesLongo).join(', ') || 'nenhum'],
    ['Dados gerados em', estado.dados.geradoEm || '—'],
    ['Planilha de orçamento', estado.base.arquivoOrcamento || '—'],
    ['Exportado em', new Date().toLocaleString('pt-BR')],
  ];

  return {
    nome: 'Resumo',
    titulo: cabecalho(estado, v),
    colunas: [{ rotulo: 'Indicador', largura: 44 },
              { rotulo: 'Valor', largura: 26, estilo: E.moeda }],
    linhas,
  };
}

function abaResultado(v) {
  const r = v.resultado;
  return {
    nome: 'Resultado mês a mês',
    titulo: ['Receita, custo e resultado — custo cheio, inclusive folha',
             'Mês sem receita lançada não entra no resultado: contar receita zero '
             + 'produziria um prejuízo que não existe.'],
    colunas: [
      { rotulo: 'Mês', largura: 14 },
      { rotulo: 'Receita orçada', largura: 17, estilo: E.moeda },
      { rotulo: 'Receita realizada', largura: 17, estilo: E.moeda },
      { rotulo: 'Custo orçado', largura: 17, estilo: E.moeda },
      { rotulo: 'Custo realizado', largura: 17, estilo: E.moeda },
      { rotulo: 'Resultado orçado', largura: 17, estilo: E.moeda },
      { rotulo: 'Resultado realizado', largura: 18, estilo: E.moeda },
      { rotulo: 'Margem %', largura: 11, estilo: E.pct },
    ],
    linhas: v.serie.filter(s => s.temDados).map(s => [
      fmt.mesLongo(s.mes), s.receitaOrcada,
      s.semReceita ? 'não lançada' : s.receitaRealizada,
      s.custoOrcadoCheio, s.custoCheio,
      s.resultadoOrcado,
      s.resultado === null ? 'sem receita' : s.resultado,
      s.margem === null ? '—' : s.margem,
    ]),
    rodape: ['Total', r.receitaOrcada, r.receitaRealizada, r.custoOrcado,
             r.custoRealizado, r.orcado, r.valor, r.margem],
  };
}

function abaPorConta(v) {
  return {
    nome: 'Por conta',
    colunas: [
      { rotulo: 'Cta', largura: 8, estilo: E.inteiro },
      { rotulo: 'Conta', largura: 40 },
      { rotulo: 'Grupo', largura: 40 },
      { rotulo: 'Pessoal', largura: 9 },
      { rotulo: 'Orçado', largura: 16, estilo: E.moeda },
      { rotulo: 'Realizado', largura: 16, estilo: E.moeda },
      { rotulo: 'Desvio', largura: 16, estilo: E.moeda },
      { rotulo: 'Execução %', largura: 12, estilo: E.pct },
      { rotulo: 'Orçado no ano', largura: 16, estilo: E.moeda },
      { rotulo: 'Realizado no ano', largura: 17, estilo: E.moeda },
      { rotulo: 'Projeção', largura: 16, estilo: E.moeda },
    ],
    linhas: v.linhasConta.slice().sort((a, b) => b.realizado - a.realizado).map(l => [
      l.cta, l.nome, l.nomeGrupo, l.pessoal ? 'sim' : 'não',
      l.orcado, l.realizado, l.desvio, l.execucao,
      l.orcadoAno, l.realizadoAno, l.projecao,
    ]),
    rodape: ['', 'Total', '', '', v.total.orcado, v.total.realizado, v.total.desvio,
             v.total.execucao, v.total.orcadoAno, null, v.total.projecao],
  };
}

function abaPorGrupo(v) {
  return {
    nome: 'Por grupo',
    colunas: [
      { rotulo: 'Grupo', largura: 46 },
      { rotulo: 'Contas', largura: 9, estilo: E.inteiro },
      { rotulo: 'Orçado', largura: 17, estilo: E.moeda },
      { rotulo: 'Realizado', largura: 17, estilo: E.moeda },
      { rotulo: 'Desvio', largura: 17, estilo: E.moeda },
      { rotulo: 'Execução %', largura: 12, estilo: E.pct },
      { rotulo: 'Orçado no ano', largura: 17, estilo: E.moeda },
    ],
    linhas: v.linhasGrupo.slice().sort((a, b) => b.realizado - a.realizado).map(g => [
      g.nome, g.contas, g.orcado, g.realizado, g.desvio, g.execucao, g.orcadoAno,
    ]),
    rodape: ['Total', v.linhasConta.length, v.total.orcado, v.total.realizado,
             v.total.desvio, v.total.execucao, v.total.orcadoAno],
  };
}

function abaContaMes(v) {
  const colunas = [
    { rotulo: 'Cta', largura: 8, estilo: E.inteiro },
    { rotulo: 'Conta', largura: 40 },
    { rotulo: 'Grupo', largura: 32 },
    { rotulo: 'Base', largura: 11 },
  ];
  for (let m = 1; m <= 12; m++) {
    colunas.push({ rotulo: fmt.mesLongo(m).replace(/^./, c => c.toUpperCase()),
                   largura: 15, estilo: E.moeda });
  }
  colunas.push({ rotulo: 'Total', largura: 16, estilo: E.moeda });

  const linhas = [];
  v.linhasConta.slice().sort((a, b) => b.realizadoAno - a.realizadoAno).forEach(l => {
    const orcado = l.porMes.map(m => m.orcado);
    // mês sem relatório vira texto, nunca zero — zero mentiria sobre o mês
    const realizado = l.porMes.map(m => m.temDados ? m.realizado : 'sem dados');
    linhas.push([l.cta, l.nome, l.nomeGrupo, 'Orçado', ...orcado,
                 orcado.reduce((s, x) => s + x, 0)]);
    linhas.push([l.cta, l.nome, l.nomeGrupo, 'Realizado', ...realizado,
                 l.porMes.filter(m => m.temDados).reduce((s, m) => s + m.realizado, 0)]);
  });
  return { nome: 'Conta x mês', colunas, linhas };
}

function abaOndeAgir(v) {
  const acima = v.linhasConta.filter(l => l.desvio > 0.01)
    .sort((a, b) => b.desvio - a.desvio);
  const total = acima.reduce((s, l) => s + l.desvio, 0);
  const semOrcamento = v.linhasConta.filter(l => l.realizado > 0.01 && l.orcado <= 0.01)
    .sort((a, b) => b.realizado - a.realizado);
  const semRealizado = v.linhasConta
    .filter(l => l.orcado > 0.01 && Math.abs(l.realizado) < l.orcado * 0.02)
    .sort((a, b) => b.orcado - a.orcado);

  const linhas = [];
  const secao = t => linhas.push([{ v: t, estilo: E.negrito }, '', '', '', '', '', '']);
  let acumulado = 0;

  secao('ACIMA DO ORÇADO — ordenado pelo excesso em reais');
  if (!acima.length) linhas.push(['(nenhuma)', '', '', '', '', '', '']);
  acima.forEach(l => {
    acumulado += l.desvio;
    linhas.push([l.cta, l.nome, l.nomeGrupo, l.orcado, l.realizado, l.desvio,
                 total ? (acumulado / total) * 100 : 0]);
  });
  linhas.push(['', '', '', '', '', '', '']);

  secao('GASTO SEM ORÇAMENTO');
  if (!semOrcamento.length) linhas.push(['(nenhuma)', '', '', '', '', '', '']);
  semOrcamento.forEach(l => linhas.push([l.cta, l.nome, l.nomeGrupo, 0,
                                         l.realizado, l.realizado, null]));
  linhas.push(['', '', '', '', '', '', '']);

  secao('ORÇAMENTO PARADO — verba reservada e execução quase nula');
  if (!semRealizado.length) linhas.push(['(nenhuma)', '', '', '', '', '', '']);
  semRealizado.forEach(l => linhas.push([l.cta, l.nome, l.nomeGrupo, l.orcado,
                                         l.realizado, l.desvio, null]));

  return {
    nome: 'Onde agir',
    colunas: [
      { rotulo: 'Cta', largura: 12 },
      { rotulo: 'Conta', largura: 40 },
      { rotulo: 'Grupo', largura: 34 },
      { rotulo: 'Orçado', largura: 16, estilo: E.moeda },
      { rotulo: 'Realizado', largura: 16, estilo: E.moeda },
      { rotulo: 'Desvio', largura: 16, estilo: E.moeda },
      { rotulo: 'Acumulado do estouro %', largura: 20, estilo: E.pct },
    ],
    linhas,
  };
}

function abaFornecedores(v) {
  if (!v.fornecedores.length) return null;
  const cobertura = v.cobertura;
  return {
    nome: 'Fornecedores',
    titulo: ['Fornecedores — vem do RAZÃO do ERP, não da Análise de Custos',
             'Cobre só a parte lançada em contas a pagar'
             + (cobertura === null ? ''
                : ` (${fmt.pct(cobertura)} do custo em `
                  + v.mesesComAmbos.map(fmt.mes).join(', ') + ')')
             + ': baixa de estoque e provisões não passam por aqui. '
             + 'Não fecha com as outras abas, e não deve.'],
    colunas: [
      { rotulo: 'Fornecedor', largura: 42 },
      { rotulo: 'Valor', largura: 16, estilo: E.moeda },
      { rotulo: 'Participação %', largura: 14, estilo: E.pct },
      { rotulo: 'Lançamentos', largura: 12, estilo: E.inteiro },
      { rotulo: 'Ticket médio', largura: 15, estilo: E.moeda },
      { rotulo: 'Contas', largura: 9, estilo: E.inteiro },
      { rotulo: 'Meses ativos', largura: 12, estilo: E.inteiro },
    ],
    linhas: v.fornecedores.map(f => [f.nome, f.valor, f.participacao, f.lancamentos,
                                     f.ticket, f.contas, f.meses]),
    rodape: ['Total', v.totalLancado, 100, v.lancamentos.length, null, null, null],
  };
}

function abaLancamentos(v) {
  if (!v.lancamentos.length) return null;
  return {
    nome: 'Lançamentos',
    titulo: ['Lançamentos do razão — subconjunto do custo, só o que passou por '
             + 'contas a pagar'],
    colunas: [
      { rotulo: 'Data', largura: 12 },
      { rotulo: 'Mês', largura: 12 },
      { rotulo: 'Cta', largura: 8, estilo: E.inteiro },
      { rotulo: 'Conta', largura: 34 },
      { rotulo: 'Grupo', largura: 30 },
      { rotulo: 'Tipo', largura: 14 },
      { rotulo: 'Documento', largura: 18 },
      { rotulo: 'Fornecedor', largura: 34 },
      { rotulo: 'Histórico', largura: 40 },
      { rotulo: 'Valor', largura: 16, estilo: E.moeda },
    ],
    linhas: v.lancamentos.slice()
      .sort((a, b) => a.data.localeCompare(b.data) || b.valor - a.valor)
      .map(l => [fmt.data(l.data), fmt.mesLongo(l.mes), l.cta, l.nomeConta,
                 l.nomeGrupo, l.tipo, l.doc, l.fornecedor, l.historico, l.valor]),
    rodape: ['Total', '', '', '', '', '', '', '', '', v.totalLancado],
  };
}

function abaConferencia(v, estado) {
  return {
    nome: 'Conferência',
    titulo: ['Conferência dos relatórios de Análise de Custos',
             'A soma das contas de cada mês tem de ser igual ao total impresso no '
             + 'rodapé do PDF. É o que garante que a leitura das colunas não saiu '
             + 'do lugar.'],
    colunas: [
      { rotulo: 'Mês', largura: 14 },
      { rotulo: 'Arquivo', largura: 34 },
      { rotulo: 'Total do rodapé', largura: 18, estilo: E.moeda },
      { rotulo: 'Soma das contas', largura: 18, estilo: E.moeda },
      { rotulo: 'Conciliação', largura: 13 },
      { rotulo: 'Orçado conferido', largura: 16, estilo: E.inteiro },
      { rotulo: 'Orçado divergente', largura: 17, estilo: E.inteiro },
      { rotulo: 'Receita realizada', largura: 18, estilo: E.moeda },
    ],
    linhas: estado.dados.meses.slice().sort((a, b) => a.mes - b.mes).map(m => [
      fmt.mesLongo(m.mes), m.arquivo, m.custoRealizado, m.somaContas,
      m.conciliado ? 'confere' : 'DIVERGENTE',
      m.orcadoConferido, m.orcadoDivergente,
      m.receitaRealizada === null ? 'não lançada' : m.receitaRealizada,
    ]),
  };
}

async function baixarExcel(v, estado) {
  const botao = document.getElementById('btn-excel');
  const rotulo = botao ? botao.textContent : '';
  if (botao) { botao.disabled = true; botao.textContent = 'Gerando…'; }
  try {
    const abas = [
      abaResumo(v, estado),
      abaResultado(v),
      abaPorGrupo(v),
      abaPorConta(v),
      abaContaMes(v),
      abaOndeAgir(v),
      abaFornecedores(v),
      abaLancamentos(v),
      abaConferencia(v, estado),
    ];
    const sufixo = estado.filtros.periodo === 'ytd'
      ? 'acumulado' : fmt.mes(Number(estado.filtros.periodo));
    const nome = `Resultado-${estado.base.centroCusto.codigo}-`
               + `${estado.base.ano}-${sufixo}`
               + (estado.filtros.pessoal ? '' : '-sem-folha') + '.xlsx';
    await Xlsx.gerar(abas, nome);
  } catch (erro) {
    alert('Não consegui gerar o Excel: ' + erro.message);
    throw erro;
  } finally {
    if (botao) { botao.disabled = false; botao.textContent = rotulo; }
  }
}

return { baixarExcel };

})();
