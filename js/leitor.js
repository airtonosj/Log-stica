/* ==========================================================================
   leitor.js — lê .xlsx no navegador e mescla com os dados publicados.

   Descompacta com DecompressionStream('deflate-raw'), nativo do navegador —
   sem biblioteca. As mesmas regras do parser em Python:

     · variante detectada pela ASSINATURA da linha de cabeçalho de colunas;
     · identificação POSITIVA da linha de dado (código numérico + centro de
       custo do relatório + classificação válida);
     · sinal preservado (débito = despesa positiva, estorno = negativa).

   O orçamento (.xls legado) NÃO é lido aqui — fica com atualizar.py, que já
   tem o leitor BIFF8. Este arquivo só precisa das planilhas mensais.
   ========================================================================== */
'use strict';

const Leitor = (() => {

const CHAVE_ARMAZEM = 'planilhas-2930-v1';
const CLASSIFICACAO = /^\d{3}(\.\d{3})?$/;
const TOTAL_DO_CENTRO = '001';

const LAYOUTS = {
  A: {
    assinatura: { A: 'Reduzida', B: 'C. Custos', C: 'Classificação',
                  F: 'Nomenclatura', L: 'Vlr Orçado', O: 'Vlr Realizado' },
    col: { codigo: 'A', cc: 'B', classificacao: 'C', nome: 'F', orcado: 'L', realizado: 'O' },
  },
  B: {
    assinatura: { A: 'Cta', B: 'C.C.', C: 'Classificação',
                  D: 'Nomenclatura', I: 'Vlr Orçado', J: 'Vlr Realizado' },
    col: { codigo: 'A', cc: 'B', classificacao: 'C', nome: 'D', orcado: 'I', realizado: 'J' },
  },
};

const ASSINATURA_DIESEL = { A: 'Requisição', B: 'Emissão',
                            D: 'Descrição do Produto', K: 'Atendido' };

/* ==========================================================================
   descompactação e leitura do xlsx
   ========================================================================== */
async function inflar(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Este navegador não sabe descompactar .xlsx. '
      + 'Use o Chrome ou Edge atualizado, ou o script atualizar.py.');
  }
  const fluxo = new Blob([bytes]).stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(fluxo).arrayBuffer());
}

/** Lê o diretório central do zip e devolve {nome: Uint8Array}. */
async function abrirZip(buffer) {
  const dv = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // localiza o End Of Central Directory de trás para frente
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('arquivo não parece ser um .xlsx válido (zip sem índice)');

  const qtd = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);

  const entradas = [];
  for (let i = 0; i < qtd; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const metodo = dv.getUint16(p + 10, true);
    const tamComprimido = dv.getUint32(p + 20, true);
    const tamNome = dv.getUint16(p + 28, true);
    const tamExtra = dv.getUint16(p + 30, true);
    const tamComentario = dv.getUint16(p + 32, true);
    const deslocamento = dv.getUint32(p + 42, true);
    const nome = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + tamNome));
    entradas.push({ nome, metodo, tamComprimido, deslocamento });
    p += 46 + tamNome + tamExtra + tamComentario;
  }

  const arquivos = {};
  for (const e of entradas) {
    // cabeçalho local: o tamanho do nome/extra pode diferir do índice central
    const base = e.deslocamento;
    if (dv.getUint32(base, true) !== 0x04034b50) continue;
    const tamNomeLocal = dv.getUint16(base + 26, true);
    const tamExtraLocal = dv.getUint16(base + 28, true);
    const inicio = base + 30 + tamNomeLocal + tamExtraLocal;
    const cru = bytes.subarray(inicio, inicio + e.tamComprimido);
    const nome = normalizarCaminho(e.nome);
    if (e.metodo === 0) arquivos[nome] = cru;
    else if (e.metodo === 8) arquivos[nome] = await inflar(cru);
    // outros métodos (bzip2 etc.) não aparecem em xlsx do Excel
  }
  return arquivos;
}

/**
 * O ZIP exige barra normal, mas este ERP grava os nomes com contrabarra
 * (`xl\sheet1.xml`). O zipfile do Python normaliza sozinho; aqui é na mão —
 * senão nenhuma parte do arquivo é encontrada e o upload falha inteiro.
 */
function normalizarCaminho(nome) {
  return String(nome).replace(/\\/g, '/').replace(/^\/+/, '');
}

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

function xml(bytes) {
  const texto = new TextDecoder('utf-8').decode(bytes);
  const doc = new DOMParser().parseFromString(texto, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('XML interno inválido');
  return doc;
}

/** Devolve a primeira aba como {numeroLinha: {A: valor, ...}}. */
async function primeiraAba(buffer) {
  const arquivos = await abrirZip(buffer);

  let compartilhadas = [];
  if (arquivos['xl/sharedStrings.xml']) {
    const doc = xml(arquivos['xl/sharedStrings.xml']);
    compartilhadas = [...doc.getElementsByTagNameNS(NS, 'si')].map(si =>
      [...si.getElementsByTagNameNS(NS, 't')].map(t => t.textContent || '').join(''));
  }

  // resolve o alvo da primeira aba pelo relacionamento
  let alvo = 'xl/worksheets/sheet1.xml';
  if (arquivos['xl/workbook.xml'] && arquivos['xl/_rels/workbook.xml.rels']) {
    const livro = xml(arquivos['xl/workbook.xml']);
    const rels = xml(arquivos['xl/_rels/workbook.xml.rels']);
    const mapa = {};
    [...rels.getElementsByTagName('Relationship')].forEach(r => {
      mapa[r.getAttribute('Id')] = r.getAttribute('Target');
    });
    const aba = livro.getElementsByTagNameNS(NS, 'sheet')[0];
    if (aba) {
      const rid = aba.getAttributeNS(NS_REL, 'id') || aba.getAttribute('r:id');
      const t = mapa[rid] ? normalizarCaminho(mapa[rid]) : null;
      if (t) alvo = t.startsWith('xl/') ? t : 'xl/' + t;
    }
  }
  if (!arquivos[alvo]) {
    // Este ERP põe a aba em xl/sheet1.xml, fora de xl/worksheets/.
    const candidatas = Object.keys(arquivos)
      .filter(n => /^xl\/(worksheets\/)?sheet[^/]*\.xml$/i.test(n))
      .sort();
    if (!candidatas.length) {
      throw new Error('não encontrei nenhuma aba dentro do arquivo (partes: '
        + Object.keys(arquivos).join(', ') + ')');
    }
    alvo = candidatas[0];
  }

  const doc = xml(arquivos[alvo]);
  const linhas = {};
  [...doc.getElementsByTagNameNS(NS, 'row')].forEach(linha => {
    const n = Number(linha.getAttribute('r'));
    const atual = {};
    [...linha.getElementsByTagNameNS(NS, 'c')].forEach(celula => {
      const ref = celula.getAttribute('r') || '';
      const coluna = (ref.match(/^[A-Z]+/) || [''])[0];
      const tipo = celula.getAttribute('t');
      const v = celula.getElementsByTagNameNS(NS, 'v')[0];
      let valor = null;
      if (tipo === 's' && v) {
        const i = Number(v.textContent);
        valor = i < compartilhadas.length ? compartilhadas[i] : null;
      } else if (tipo === 'inlineStr') {
        const is = celula.getElementsByTagNameNS(NS, 'is')[0];
        valor = is ? [...is.getElementsByTagNameNS(NS, 't')].map(t => t.textContent).join('') : null;
      } else if (tipo === 'str' && v) {
        valor = v.textContent;
      } else if (v) {
        const n2 = Number(v.textContent);
        valor = Number.isNaN(n2) ? v.textContent : n2;
      }
      if (valor !== null && valor !== '' && coluna) atual[coluna] = valor;
    });
    if (Object.keys(atual).length) linhas[n] = atual;
  });
  return linhas;
}

/* ==========================================================================
   parsers de domínio
   ========================================================================== */
/** Valor do ERP -> despesa positiva; estorno/crédito fica negativo. */
function valorERP(bruto) {
  if (bruto === null || bruto === undefined || bruto === '') return 0;
  if (typeof bruto === 'number') return -bruto;
  let s = String(bruto).trim();
  const debito = s.endsWith('-');
  if (debito) s = s.slice(0, -1);
  s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  if (Number.isNaN(n)) return 0;
  return debito ? n : -n;
}

function serialParaIso(serial) {
  const ms = (Number(serial) - 25569) * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

function numerosDeLinha(linhas) {
  return Object.keys(linhas).map(Number).sort((a, b) => a - b);
}

function detectarLayout(linhas) {
  const ordenadas = numerosDeLinha(linhas).slice(0, 20);
  for (const n of ordenadas) {
    const linha = linhas[n];
    for (const nome in LAYOUTS) {
      const { assinatura, col } = LAYOUTS[nome];
      const bate = Object.keys(assinatura).every(k =>
        String(linha[k] === undefined ? '' : linha[k]).trim() === assinatura[k]);
      if (bate) return { nome, col };
    }
  }
  return null;
}

function ehDiesel(linhas) {
  const ordenadas = numerosDeLinha(linhas).slice(0, 20);
  return ordenadas.some(n => Object.keys(ASSINATURA_DIESEL).every(k =>
    String(linhas[n][k] === undefined ? '' : linhas[n][k]).trim() === ASSINATURA_DIESEL[k]));
}

function acharPeriodo(linhas) {
  for (const n of numerosDeLinha(linhas).slice(0, 20)) {
    const linha = linhas[n];
    const valores = Object.values(linha);
    if (!valores.some(v => String(v).trim() === 'Período:')) continue;
    const seriais = valores.filter(v => typeof v === 'number' && v > 40000 && v < 60000);
    if (seriais.length >= 2) {
      return { inicio: serialParaIso(Math.min(...seriais)), fim: serialParaIso(Math.max(...seriais)) };
    }
  }
  return null;
}

function partesLancamento(descricao) {
  const s = String(descricao || '');
  // O tipo vai até a primeira aspa, data ou 'Seq.:'. Cortar no primeiro espaço
  // truncaria 'L. MANUAL' para 'L.'.
  const tipo = (s.match(/^\s*(.+?)\s*(?="|\d{2}\/\d{2}\/\d{4}|Seq\.:|$)/) || [, ''])[1].trim();
  const doc = (s.match(/"([^"]*)"/) || [, ''])[1].trim();
  const fornecedor = (s.match(/Fornec:\s*(.+?)\s*$/) || [, ''])[1].trim();
  const historico = (s.match(/Descrição:\s*(.+?)\s*$/) || [, ''])[1].trim();
  return { tipo, doc, fornecedor, historico };
}

function dataLancamento(classificacao) {
  const texto = String(classificacao).slice(5).trim();
  const p = texto.split('/');
  if (p.length !== 3) return texto;
  const ano = p[2].length === 2 ? '20' + p[2] : p[2];
  return `${ano.padStart(4, '0')}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
}

function lerInversao(linhas) {
  const layout = detectarLayout(linhas);
  if (!layout) {
    throw new Error('não reconheci o layout de Inversão Gerencial. '
      + 'Esperava o cabeçalho "Reduzida / C. Custos / …" ou "Cta / C.C. / …".');
  }
  const col = layout.col;
  const periodo = acharPeriodo(linhas);
  if (!periodo) throw new Error('não encontrei a linha "Período:" do relatório');

  const ordenadas = numerosDeLinha(linhas);

  // centro de custo: coluna do CC na linha de total ('001')
  let cc = null;
  let nomeCc = '';
  for (const n of ordenadas) {
    const linha = linhas[n];
    if (String(linha[col.classificacao]) === TOTAL_DO_CENTRO
        && typeof linha[col.codigo] === 'number') {
      cc = String(linha[col.cc]);
      nomeCc = String(linha[col.nome] || '');
      break;
    }
  }
  if (cc === null) throw new Error('não encontrei a linha de total do centro de custo');

  const contas = [];
  const lancamentos = [];
  let total = 0;
  let orcadoRelatorio = 0;
  let contaAtual = null;

  for (const n of ordenadas) {
    const linha = linhas[n];
    const codigo = linha[col.codigo];
    // identificação positiva
    if (typeof codigo !== 'number' || String(linha[col.cc]) !== cc) continue;
    const classificacao = String(linha[col.classificacao] === undefined ? '' : linha[col.classificacao]);
    const nome = String(linha[col.nome] === undefined ? '' : linha[col.nome]);

    if (classificacao.startsWith('Data:')) {
      if (contaAtual === null) continue;
      const partes = partesLancamento(nome);
      lancamentos.push({
        cta: contaAtual,
        data: dataLancamento(classificacao),
        tipo: partes.tipo,
        doc: partes.doc,
        fornecedor: partes.fornecedor,
        historico: partes.historico,
        valor: Math.round(valorERP(linha[col.realizado]) * 100) / 100,
      });
    } else if (CLASSIFICACAO.test(classificacao)) {
      const realizado = Math.round(valorERP(linha[col.realizado]) * 100) / 100;
      if (classificacao === TOTAL_DO_CENTRO) {
        total = realizado;
        orcadoRelatorio = Math.round(valorERP(linha[col.orcado]) * 100) / 100;
        contaAtual = null;
      } else {
        contas.push({ cta: Math.round(codigo), nome, realizado });
        contaAtual = Math.round(codigo);
      }
    }
  }

  const mes = Number(periodo.inicio.slice(5, 7));
  const ano = Number(periodo.inicio.slice(0, 4));
  const somaContas = arredondar(contas.reduce((s, c) => s + c.realizado, 0));
  const somaLancamentos = arredondar(lancamentos.reduce((s, l) => s + l.valor, 0));

  return {
    tipo: 'inversao',
    layout: layout.nome,
    centroCusto: cc, nomeCentroCusto: nomeCc,
    inicio: periodo.inicio, fim: periodo.fim, mes, ano,
    totalRealizado: total, orcadoRelatorio,
    contas, lancamentos,
    somaContas, somaLancamentos,
    conciliado: Math.abs(somaContas - arredondar(total)) <= 0.02
             && Math.abs(somaLancamentos - somaContas) <= 0.02,
  };
}

function arredondar(v) { return Math.round(v * 100) / 100; }

function lerDiesel(linhas) {
  const ordenadas = numerosDeLinha(linhas);
  let cabecalho = null;
  for (const n of ordenadas.slice(0, 20)) {
    const bate = Object.keys(ASSINATURA_DIESEL).every(k =>
      String(linhas[n][k] === undefined ? '' : linhas[n][k]).trim() === ASSINATURA_DIESEL[k]);
    if (bate) { cabecalho = n; break; }
  }
  if (cabecalho === null) throw new Error('não reconheci o layout do relatório de diesel');

  let inicio = null, fim = null;
  for (const n of ordenadas.slice(0, 20)) {
    for (const v of Object.values(linhas[n])) {
      const m = String(v).match(/(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/);
      if (m) {
        const iso = t => { const p = t.split('/'); return `${p[2]}-${p[1]}-${p[0]}`; };
        inicio = iso(m[1]); fim = iso(m[2]);
        break;
      }
    }
    if (inicio) break;
  }

  const requisicoes = [];
  for (const n of ordenadas) {
    if (n <= cabecalho) continue;
    const linha = linhas[n];
    const requisicao = linha.A;
    const litros = linha.K;
    const atendimento = linha.H;
    if (typeof requisicao !== 'number' || typeof litros !== 'number'
        || typeof atendimento !== 'number') continue;
    const iso = serialParaIso(atendimento);
    requisicoes.push({
      requisicao: Math.round(requisicao),
      emissao: typeof linha.B === 'number' ? serialParaIso(linha.B) : null,
      atendimento: iso,
      mes: Number(iso.slice(5, 7)),
      ano: Number(iso.slice(0, 4)),
      produto: String(linha.D || '').trim(),
      codigoProduto: String(linha.C || '').trim(),
      pedido: typeof linha.J === 'number' ? linha.J : 0,
      litros,
    });
  }
  return {
    tipo: 'diesel', inicio, fim, requisicoes,
    totalLitros: arredondar(requisicoes.reduce((s, r) => s + r.litros, 0)),
  };
}

/* ==========================================================================
   armazém local
   ========================================================================== */
function carregarArmazem() {
  try {
    const cru = localStorage.getItem(CHAVE_ARMAZEM);
    return cru ? JSON.parse(cru) : {};
  } catch (e) {
    return {};
  }
}

function gravarArmazem(armazem) {
  try {
    localStorage.setItem(CHAVE_ARMAZEM, JSON.stringify(armazem));
    return true;
  } catch (e) {
    return false;
  }
}

function remover(chave) {
  const armazem = carregarArmazem();
  delete armazem[chave];
  gravarArmazem(armazem);
}

function limpar() {
  try { localStorage.removeItem(CHAVE_ARMAZEM); } catch (e) { /* sem storage */ }
}

/**
 * Junta a base publicada com as planilhas de razão enviadas pelo navegador.
 *
 * O que vem daqui alimenta SÓ a aba Fornecedores. O custo, o orçado e a receita
 * do painel vêm do PDF de Análise de Custos, que é lido por `atualizar.py` —
 * um .xlsx de razão não altera nenhum KPI, porque cobre apenas a parte lançada
 * em contas a pagar.
 *
 * Mês enviado substitui o mês publicado: retificação do ERP é comum e o arquivo
 * mais novo é o que vale.
 */
function mesclar(base) {
  const armazem = carregarArmazem();
  const chaves = Object.keys(armazem);
  if (!chaves.length) return base;

  const razaoBase = base.razao || { meses: [], lancamentos: [], diesel: [], arquivosDiesel: [] };
  const meses = (razaoBase.meses || []).slice();
  let lancamentos = (razaoBase.lancamentos || []).slice();
  let diesel = (razaoBase.diesel || []).slice();
  const arquivosDiesel = (razaoBase.arquivosDiesel || []).slice();

  chaves.sort().forEach(chave => {
    const item = armazem[chave];
    if (!item) return;

    if (item.tipo === 'inversao') {
      const i = meses.findIndex(m => m.mes === item.mes);
      if (i >= 0) {
        lancamentos = lancamentos.filter(l => l.mes !== item.mes);
        meses.splice(i, 1);
      }
      meses.push({
        mes: item.mes, ano: item.ano, arquivo: item.arquivo, layout: item.layout,
        origem: 'enviado', totalRealizado: item.totalRealizado,
        conciliado: item.conciliado,
      });
      item.lancamentos.forEach(l => {
        lancamentos.push({
          mes: item.mes, cta: l.cta, data: l.data, tipo: l.tipo, doc: l.doc,
          fornecedor: l.fornecedor, historico: l.historico, valor: l.valor,
        });
      });
    } else if (item.tipo === 'diesel') {
      const jaTem = arquivosDiesel.findIndex(a => a.arquivo === item.arquivo);
      if (jaTem >= 0) arquivosDiesel.splice(jaTem, 1);
      arquivosDiesel.push({
        arquivo: item.arquivo, inicio: item.inicio, fim: item.fim,
        totalLitros: item.totalLitros, origem: 'enviado',
      });
      diesel = diesel.concat(item.requisicoes);
    }
  });

  meses.sort((a, b) => a.mes - b.mes);
  return Object.assign({}, base, {
    razao: { meses, lancamentos, diesel, arquivosDiesel },
  });
}

/* ==========================================================================
   interface de upload
   ========================================================================== */
function retorno(nivel, mensagem) {
  const alvo = document.getElementById('retorno-upload');
  if (!alvo) return;
  const div = document.createElement('div');
  div.className = 'retorno-item ' + nivel;
  div.textContent = mensagem;
  alvo.appendChild(div);
}

async function processar(arquivo, base) {
  const nome = arquivo.name;
  if (/\.pdf$/i.test(nome)) {
    retorno('falha', `${nome}: PDF não é lido no navegador. Coloque em `
      + 'planilhas/analise/ e rode python atualizar.py — é de lá que vêm o custo, '
      + 'o orçado e a receita do painel.');
    return null;
  }
  if (!/\.xlsx$/i.test(nome)) {
    if (/\.xls$/i.test(nome)) {
      retorno('falha', `${nome}: .xls antigo não é lido no navegador. `
        + 'Coloque em planilhas/orcamento/ e rode python atualizar.py.');
    } else {
      retorno('falha', `${nome}: só aceito arquivos .xlsx.`);
    }
    return null;
  }

  let linhas;
  try {
    linhas = await primeiraAba(await arquivo.arrayBuffer());
  } catch (erro) {
    retorno('falha', `${nome}: não consegui abrir — ${erro.message}`);
    return null;
  }

  try {
    if (ehDiesel(linhas)) {
      const r = lerDiesel(linhas);
      r.arquivo = nome;
      retorno('ok', `${nome}: relatório de diesel de ${r.inicio || '?'} a ${r.fim || '?'}, `
        + `${r.requisicoes.length} requisições, `
        + `${new Intl.NumberFormat('pt-BR').format(r.totalLitros)} litros.`);
      return { chave: 'diesel:' + nome, item: r };
    }

    const r = lerInversao(linhas);
    r.arquivo = nome;

    if (base && String(r.centroCusto) !== String(base.centroCusto.codigo)) {
      retorno('falha', `${nome}: é do centro de custo ${r.centroCusto} `
        + `(${r.nomeCentroCusto}), e este painel é do ${base.centroCusto.codigo}. Não carreguei.`);
      return null;
    }
    if (!r.conciliado) {
      retorno('aviso', `${nome}: carreguei, mas a conciliação não fechou — `
        + `total ${G.fmt.moeda(r.totalRealizado)}, soma das contas ${G.fmt.moeda(r.somaContas)}, `
        + `soma dos lançamentos ${G.fmt.moeda(r.somaLancamentos)}. Confira o arquivo.`);
    } else {
      const razao = (base && base.razao) || { meses: [] };
      const jaExistia = (razao.meses || []).some(m => m.mes === r.mes);
      retorno('ok', `${nome}: ${G.fmt.mesLongo(r.mes)} de ${r.ano}, layout ${r.layout}, `
        + `${r.lancamentos.length} lançamentos, ${G.fmt.moeda(r.totalRealizado)}. `
        + 'Entrou na aba Fornecedores. Os KPIs de custo e receita vêm do PDF de '
        + 'Análise de Custos e não mudam com este arquivo.'
        + (jaExistia ? ' Substituiu o mês que já estava carregado.' : ''));
    }
    return { chave: 'inversao:' + r.mes, item: r };
  } catch (erro) {
    retorno('falha', `${nome}: ${erro.message}`);
    return null;
  }
}

async function receber(arquivos, base, aoTerminar) {
  const alvo = document.getElementById('retorno-upload');
  if (alvo) alvo.innerHTML = '';
  if (!arquivos || !arquivos.length) return;

  const armazem = carregarArmazem();
  let mudou = false;
  for (const arquivo of arquivos) {
    const r = await processar(arquivo, base);
    if (r) { armazem[r.chave] = r.item; mudou = true; }
  }
  if (mudou) {
    if (!gravarArmazem(armazem)) {
      retorno('aviso', 'Os dados entraram na análise, mas não couberam no armazenamento '
        + 'deste navegador — ao recarregar a página eles somem. '
        + 'Use planilhas/ + python atualizar.py para guardar de vez.');
    }
    aoTerminar();
  }
}

function ligarUpload(aoTerminar) {
  const area = document.getElementById('area-solta');
  const entrada = document.getElementById('entrada-arquivo');
  if (!area || !entrada) return;
  const base = App.estado.base;

  area.addEventListener('click', () => entrada.click());
  area.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); entrada.click(); }
  });
  entrada.addEventListener('change', () => {
    receber([...entrada.files], base, aoTerminar);
    entrada.value = '';
  });

  ['dragenter', 'dragover'].forEach(nome => {
    area.addEventListener(nome, e => {
      e.preventDefault();
      area.classList.add('ativa');
    });
  });
  ['dragleave', 'drop'].forEach(nome => {
    area.addEventListener(nome, e => {
      e.preventDefault();
      area.classList.remove('ativa');
    });
  });
  area.addEventListener('drop', e => {
    receber([...(e.dataTransfer ? e.dataTransfer.files : [])], base, aoTerminar);
  });
}

/** Exporta o estado mesclado no mesmo formato de js/dados.js, para publicar. */
function baixarDadosJs(dados) {
  const corpo = JSON.stringify(dados);
  const texto = '// Gerado pelo dashboard (aba Dados) — inclui as planilhas enviadas.\n'
    + `// ${new Date().toISOString().slice(0, 19)}\n`
    + `window.DADOS = ${corpo};\n`;
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/javascript' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'dados.js';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

return { mesclar, ligarUpload, remover, limpar, baixarDadosJs, lerInversao, lerDiesel };

})();
