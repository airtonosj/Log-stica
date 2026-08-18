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
   Relatorio — monta as abas do relatório a partir da visão filtrada.
   Respeita os filtros ativos: o Excel é a tela, em planilha.
   ========================================================================== */
const Relatorio = (() => {

const E = Xlsx.ESTILO;
const fmt = G.fmt;

function cabecalhoDoRecorte(estado, v) {
  const f = estado.filtros;
  const base = estado.base;
  const linhas = [
    `${base.centroCusto.nome} (centro de custo ${base.centroCusto.codigo}) — exercício ${base.ano}`,
  ];
  const partes = [];
  partes.push(f.periodo === 'ytd'
    ? 'Período: acumulado dos meses com dados (' + v.mesesFiltro.map(fmt.mes).join(', ') + ')'
    : 'Período: ' + fmt.mesLongo(Number(f.periodo)));
  if (f.grupo) partes.push('Grupo: ' + (v.nomeGrupo[f.grupo] || f.grupo));
  if (f.conta) {
    const c = v.porCta[Number(f.conta)];
    partes.push('Conta: ' + (c ? `${c.cta} · ${c.nome}` : f.conta));
  }
  if (f.busca) partes.push('Busca: ' + f.busca);
  partes.push('Contas não monetárias: ' + (f.naoMonetario ? 'incluídas' : 'excluídas'));
  linhas.push(partes.join('  ·  '));
  return linhas;
}

function abaResumo(v, estado) {
  const ausentes = [];
  for (let m = 1; m <= 12; m++) if (!v.mesesComDados.includes(m)) ausentes.push(m);

  const linhas = [
    ['Orçado no período', v.total.orcado],
    ['Realizado no período', v.total.realizado],
    ['Desvio (realizado − orçado)', v.total.desvio],
    ['Execução do orçado (%)', { v: v.total.execucao, estilo: E.pct }],
    ['Orçamento do ano inteiro', v.total.orcadoAno],
    ['Projeção de fechamento', v.total.projecao],
    ['Desvio projetado', v.total.projecao - v.total.orcadoAno],
    ['Contas no recorte', { v: v.linhasConta.length, estilo: E.inteiro }],
    ['Lançamentos', { v: v.lancamentos.length, estilo: E.inteiro }],
    ['Fornecedores', { v: v.fornecedores.length, estilo: E.inteiro }],
    ['Meses com dados', v.mesesComDados.map(fmt.mesLongo).join(', ')],
    ['Meses sem planilha', ausentes.length ? ausentes.map(fmt.mesLongo).join(', ') : 'nenhum'],
    ['Litros de diesel no período', { v: v.diesel.reduce((s, r) => s + r.litros, 0), estilo: E.inteiro }],
    ['Dados gerados em', estado.dados.geradoEm || '—'],
    ['Planilha de orçamento', estado.base.arquivoOrcamento || '—'],
    ['Relatório exportado em', new Date().toLocaleString('pt-BR')],
  ];

  return {
    nome: 'Resumo',
    titulo: cabecalhoDoRecorte(estado, v),
    colunas: [
      { rotulo: 'Indicador', largura: 34 },
      { rotulo: 'Valor', largura: 26, estilo: E.moeda },
    ],
    linhas,
  };
}

function abaPorGrupo(v) {
  return {
    nome: 'Por grupo',
    colunas: [
      { rotulo: 'Grupo', largura: 46 },
      { rotulo: 'Contas', largura: 9, estilo: E.inteiro },
      { rotulo: 'Orçado', largura: 16, estilo: E.moeda },
      { rotulo: 'Realizado', largura: 16, estilo: E.moeda },
      { rotulo: 'Desvio', largura: 16, estilo: E.moeda },
      { rotulo: 'Execução %', largura: 12, estilo: E.pct },
      { rotulo: 'Orçado no ano', largura: 16, estilo: E.moeda },
      { rotulo: 'Projeção', largura: 16, estilo: E.moeda },
    ],
    linhas: v.linhasGrupo.slice().sort((a, b) => b.realizado - a.realizado).map(g => [
      g.nome, g.contas, g.orcado, g.realizado, g.desvio, g.execucao, g.orcadoAno, g.projecao,
    ]),
    rodape: ['Total', v.linhasConta.length, v.total.orcado, v.total.realizado,
             v.total.desvio, v.total.execucao, v.total.orcadoAno, v.total.projecao],
  };
}

function abaPorConta(v) {
  return {
    nome: 'Por conta',
    colunas: [
      { rotulo: 'Cta', largura: 8, estilo: E.inteiro },
      { rotulo: 'Conta', largura: 40 },
      { rotulo: 'Grupo', largura: 40 },
      { rotulo: 'Não monetária', largura: 13 },
      { rotulo: 'Orçado', largura: 15, estilo: E.moeda },
      { rotulo: 'Realizado', largura: 15, estilo: E.moeda },
      { rotulo: 'Desvio', largura: 15, estilo: E.moeda },
      { rotulo: 'Execução %', largura: 12, estilo: E.pct },
      { rotulo: 'Orçado no ano', largura: 15, estilo: E.moeda },
      { rotulo: 'Realizado no ano', largura: 16, estilo: E.moeda },
      { rotulo: 'Projeção', largura: 15, estilo: E.moeda },
    ],
    linhas: v.linhasConta.slice().sort((a, b) => b.realizado - a.realizado).map(l => [
      l.cta, l.nome, l.nomeGrupo, l.naoMonetaria ? 'sim' : 'não',
      l.orcado, l.realizado, l.desvio, l.execucao,
      l.orcadoAno, l.realizadoAno, l.projecao,
    ]),
    rodape: ['', 'Total', '', '', v.total.orcado, v.total.realizado, v.total.desvio,
             v.total.execucao, v.total.orcadoAno, null, v.total.projecao],
  };
}

function abaContaMes(v) {
  const colunas = [
    { rotulo: 'Cta', largura: 8, estilo: E.inteiro },
    { rotulo: 'Conta', largura: 40 },
    { rotulo: 'Grupo', largura: 34 },
    { rotulo: 'Base', largura: 11 },
  ];
  for (let m = 1; m <= 12; m++) {
    colunas.push({ rotulo: fmt.mesLongo(m).replace(/^./, c => c.toUpperCase()),
                   largura: 14, estilo: E.moeda });
  }
  colunas.push({ rotulo: 'Total', largura: 16, estilo: E.moeda });

  const linhas = [];
  v.linhasConta.slice().sort((a, b) => b.realizadoAno - a.realizadoAno).forEach(l => {
    const orcado = l.porMes.map(m => m.orcado);
    // mês sem planilha vira texto "sem dados" — nunca zero, que mentiria
    const realizado = l.porMes.map(m => m.temDados ? m.realizado : 'sem dados');
    linhas.push([l.cta, l.nome, l.nomeGrupo, 'Orçado', ...orcado,
                 orcado.reduce((s, x) => s + x, 0)]);
    linhas.push([l.cta, l.nome, l.nomeGrupo, 'Realizado', ...realizado,
                 l.porMes.filter(m => m.temDados).reduce((s, m) => s + m.realizado, 0)]);
  });

  return { nome: 'Conta x mês', colunas, linhas };
}

function abaLancamentos(v) {
  return {
    nome: 'Lançamentos',
    colunas: [
      { rotulo: 'Data', largura: 12, estilo: E.padrao },
      { rotulo: 'Mês', largura: 8 },
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
      .map(l => [fmt.data(l.data), fmt.mesLongo(l.mes), l.cta, l.nomeConta, l.nomeGrupo,
                 l.tipo, l.doc, l.fornecedor, l.historico, l.valor]),
    rodape: ['Total', '', '', '', '', '', '', '', '', v.totalLancado],
  };
}

function abaFornecedores(v) {
  return {
    nome: 'Fornecedores',
    colunas: [
      { rotulo: 'Fornecedor', largura: 42 },
      { rotulo: 'Valor', largura: 16, estilo: E.moeda },
      { rotulo: 'Participação %', largura: 14, estilo: E.pct },
      { rotulo: 'Lançamentos', largura: 12, estilo: E.inteiro },
      { rotulo: 'Ticket médio', largura: 15, estilo: E.moeda },
      { rotulo: 'Contas', largura: 9, estilo: E.inteiro },
      { rotulo: 'Meses ativos', largura: 12, estilo: E.inteiro },
    ],
    linhas: v.fornecedores.map(f => [
      f.nome, f.valor, f.participacao, f.lancamentos, f.ticket, f.contas, f.meses,
    ]),
    rodape: ['Total', v.totalLancado, 100, v.lancamentos.length,
             v.lancamentos.length ? v.totalLancado / v.lancamentos.length : 0, null, null],
  };
}

function abaAlertas(v) {
  const linhas = [];
  const secao = titulo => linhas.push([{ v: titulo, estilo: E.negrito }, '', '', '', '', '']);

  const semOrcamento = v.linhasConta
    .filter(l => l.realizado > 0.01 && l.orcado <= 0.01)
    .sort((a, b) => b.realizado - a.realizado);
  const semRealizado = v.linhasConta
    .filter(l => l.orcado > 0.01 && Math.abs(l.realizado) < l.orcado * 0.02)
    .sort((a, b) => b.orcado - a.orcado);
  const acima = v.linhasConta
    .filter(l => l.orcado > 0.01 && l.realizado > l.orcado)
    .sort((a, b) => b.desvio - a.desvio);

  secao('REALIZADO SEM ORÇAMENTO — gasto sem valor orçado para os mesmos meses');
  if (!semOrcamento.length) linhas.push(['(nenhuma)', '', '', '', '', '']);
  semOrcamento.forEach(l => linhas.push([l.cta, l.nome, l.nomeGrupo, 0, l.realizado, l.realizado]));
  linhas.push(['', '', '', '', '', '']);

  secao('ORÇADO SEM REALIZADO — orçamento reservado e execução quase nula');
  if (!semRealizado.length) linhas.push(['(nenhuma)', '', '', '', '', '']);
  semRealizado.forEach(l => linhas.push([l.cta, l.nome, l.nomeGrupo, l.orcado, l.realizado, l.desvio]));
  linhas.push(['', '', '', '', '', '']);

  secao('ACIMA DO ORÇADO — passou de 100% do orçado do período');
  if (!acima.length) linhas.push(['(nenhuma)', '', '', '', '', '']);
  acima.forEach(l => linhas.push([l.cta, l.nome, l.nomeGrupo, l.orcado, l.realizado, l.desvio]));
  linhas.push(['', '', '', '', '', '']);

  secao('QUALIDADE DOS DADOS — conciliação por planilha');
  linhas.push([{ v: 'Mês', estilo: E.negrito }, { v: 'Arquivo', estilo: E.negrito },
               { v: 'Layout', estilo: E.negrito }, { v: 'Total do CC', estilo: E.negrito },
               { v: 'Soma das contas', estilo: E.negrito },
               { v: 'Conciliação', estilo: E.negrito }]);
  v.meses.slice().sort((a, b) => a.mes - b.mes).forEach(m => {
    linhas.push([fmt.mesLongo(m.mes), m.arquivo, m.layout, m.totalRealizado, m.somaContas,
                 m.conciliado ? 'confere' : 'DIVERGENTE']);
  });

  return {
    nome: 'Alertas',
    colunas: [
      { rotulo: 'Cta / item', largura: 14 },
      { rotulo: 'Conta / arquivo', largura: 40 },
      { rotulo: 'Grupo / layout', largura: 34 },
      { rotulo: 'Orçado', largura: 16, estilo: E.moeda },
      { rotulo: 'Realizado', largura: 16, estilo: E.moeda },
      { rotulo: 'Desvio', largura: 16, estilo: E.moeda },
    ],
    linhas,
  };
}

function abaDiesel(v) {
  if (!v.diesel.length) return null;
  const meses12 = Array.from({ length: 12 }, (_, i) => i + 1);
  const resumo = meses12
    .filter(m => v.litrosPorMes[m] !== undefined || v.combustivelPorMes[m] !== undefined)
    .map(m => {
      const litros = v.litrosPorMes[m];
      const custo = v.mesesComDados.includes(m) ? v.combustivelPorMes[m] : undefined;
      return [
        fmt.mesLongo(m),
        litros === undefined ? 'sem dados' : { v: litros, estilo: E.inteiro },
        custo === undefined ? 'sem dados' : custo,
        (litros && custo !== undefined) ? custo / litros : 'sem base',
      ];
    });

  return {
    nome: 'Diesel',
    titulo: ['Consumo de óleo diesel — litros atendidos e custo por litro',
             'Custo = realizado das contas 380 Óleo Diesel + 820 Combustível. '
             + 'Cada requisição entra no mês do seu atendimento.'],
    colunas: [
      { rotulo: 'Mês', largura: 14 },
      { rotulo: 'Litros', largura: 14, estilo: E.inteiro },
      { rotulo: 'Custo de combustível', largura: 20, estilo: E.moeda },
      { rotulo: 'R$ por litro', largura: 14, estilo: E.moeda },
    ],
    linhas: resumo,
    rodape: ['Total', v.diesel.reduce((s, r) => s + r.litros, 0),
             v.mesesFiltro.reduce((s, m) => s + (v.combustivelPorMes[m] || 0), 0), null],
  };
}

function abaRequisicoesDiesel(v) {
  if (!v.diesel.length) return null;
  return {
    nome: 'Requisições diesel',
    colunas: [
      { rotulo: 'Requisição', largura: 13, estilo: E.inteiro },
      { rotulo: 'Emissão', largura: 12 },
      { rotulo: 'Atendimento', largura: 13 },
      { rotulo: 'Mês', largura: 12 },
      { rotulo: 'Produto', largura: 26 },
      { rotulo: 'Pedido', largura: 11, estilo: E.inteiro },
      { rotulo: 'Litros', largura: 11, estilo: E.inteiro },
    ],
    linhas: v.diesel.slice()
      .sort((a, b) => a.atendimento.localeCompare(b.atendimento))
      .map(r => [r.requisicao, fmt.data(r.emissao), fmt.data(r.atendimento),
                 fmt.mesLongo(r.mes), r.produto, r.pedido, r.litros]),
    rodape: ['Total', '', '', '', '', null, v.diesel.reduce((s, r) => s + r.litros, 0)],
  };
}

async function baixarExcel(v, estado) {
  const botao = document.getElementById('btn-excel');
  const rotulo = botao ? botao.textContent : '';
  if (botao) { botao.disabled = true; botao.textContent = 'Gerando…'; }
  try {
    const abas = [
      abaResumo(v, estado),
      abaPorGrupo(v),
      abaPorConta(v),
      abaContaMes(v),
      abaLancamentos(v),
      abaFornecedores(v),
      abaAlertas(v),
      abaDiesel(v),
      abaRequisicoesDiesel(v),
    ];
    const sufixo = estado.filtros.periodo === 'ytd'
      ? 'acumulado' : fmt.mes(Number(estado.filtros.periodo));
    const nome = `Orcado-x-Realizado-${estado.base.centroCusto.codigo}-`
               + `${estado.base.ano}-${sufixo}.xlsx`;
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
