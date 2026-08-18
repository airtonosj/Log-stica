/* ==========================================================================
   app.js — estado, filtros, agregações, tabelas e montagem das abas.

   Convenções de valor:
     · Despesa é POSITIVA. Estorno/crédito fica negativo.
     · Mês sem planilha carregada é `null` em toda série — nunca 0. Isso é o
       que impede um gráfico de tendência de mentir sobre junho.
   ========================================================================== */
'use strict';

const App = (() => {

const fmt = G.fmt;
const MESES = G.MESES;
const POR_PAGINA = 100;

/* ----------------------------------------------------------- estado */
const estado = {
  base: null,            // window.DADOS, imutável
  dados: null,           // base + planilhas enviadas pelo navegador
  filtros: { periodo: 'ytd', grupo: '', conta: '', busca: '', naoMonetario: true },
  ordem: {},             // {idTabela: {coluna, direcao}}
  pagina: { lancamentos: 1, diesel: 1 },
  abaAtiva: 'visao',
};

/* ----------------------------------------------------------- helpers */
const porId = id => document.getElementById(id);

/** Minúsculas e sem acento, para busca tolerante ("otimo" acha "Ótimo"). */
function normalizar(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function classeDesvio(v) {
  if (v > 0.005) return 'acima';
  if (v < -0.005) return 'abaixo';
  return 'neutro';
}

/** Sinal explícito no desvio: o leitor precisa ver a direção, não deduzir. */
function comSinal(v, formatar = fmt.moeda) {
  if (Math.abs(v) < 0.005) return formatar(0);
  return (v > 0 ? '+' : '−') + formatar(Math.abs(v));
}

/* ----------------------------------------------------------- visão dos dados */
/**
 * Recorta os dados pelos filtros e devolve tudo o que as abas consomem.
 * Uma única fonte de verdade: gráficos, tabelas, KPIs e Excel leem daqui,
 * então os números nunca discordam entre si.
 */
function construirVisao() {
  const d = estado.dados;
  const f = estado.filtros;

  const grupos = d.grupos;
  const nomeGrupo = {};
  grupos.forEach(g => { nomeGrupo[g.codigo] = g.nome; });

  const mesesComDados = d.meses.map(m => m.mes).sort((a, b) => a - b);
  const realizadoPorMes = {};
  d.meses.forEach(m => { realizadoPorMes[m.mes] = m.realizado; });

  // meses do recorte
  const mesesFiltro = f.periodo === 'ytd'
    ? mesesComDados
    : mesesComDados.filter(m => m === Number(f.periodo));

  // contas do recorte
  const busca = normalizar(f.busca);
  const contas = d.contas.filter(c => {
    if (!f.naoMonetario && c.naoMonetaria) return false;
    if (f.grupo && String(c.grupo) !== f.grupo) return false;
    if (f.conta && String(c.cta) !== f.conta) return false;
    if (busca) {
      const alvo = normalizar(`${c.cta} ${c.nome} ${nomeGrupo[c.grupo] || ''}`);
      if (!alvo.includes(busca)) return false;
    }
    return true;
  });
  const contasNoRecorte = new Set(contas.map(c => c.cta));
  const porCta = {};
  d.contas.forEach(c => { porCta[c.cta] = c; });

  // ---- linhas por conta, com orçado/realizado do recorte e do ano
  const linhasConta = contas.map(c => {
    let orcado = 0, realizado = 0;
    mesesFiltro.forEach(m => {
      orcado += c.orcado[m - 1] || 0;
      realizado += (realizadoPorMes[m] || {})[String(c.cta)] || 0;
    });
    const orcadoAno = c.orcado.reduce((s, v) => s + v, 0);
    // projeção: realizado dos meses com dados + orçado dos meses sem dados
    let realizadoAno = 0;
    mesesComDados.forEach(m => {
      realizadoAno += (realizadoPorMes[m] || {})[String(c.cta)] || 0;
    });
    let orcadoRestante = 0;
    for (let m = 1; m <= 12; m++) {
      if (!mesesComDados.includes(m)) orcadoRestante += c.orcado[m - 1] || 0;
    }
    return {
      cta: c.cta,
      nome: c.nome,
      grupo: c.grupo,
      nomeGrupo: nomeGrupo[c.grupo] || 'Fora do orçamento',
      naoMonetaria: !!c.naoMonetaria,
      orcado, realizado,
      desvio: realizado - orcado,
      execucao: orcado > 0 ? (realizado / orcado) * 100 : null,
      orcadoAno,
      realizadoAno,
      projecao: realizadoAno + orcadoRestante,
      porMes: c.orcado.map((o, i) => ({
        mes: i + 1,
        orcado: o,
        realizado: (realizadoPorMes[i + 1] || {})[String(c.cta)] || 0,
        temDados: mesesComDados.includes(i + 1),
      })),
    };
  });

  // ---- totais do recorte
  const total = linhasConta.reduce((acc, l) => {
    acc.orcado += l.orcado;
    acc.realizado += l.realizado;
    acc.orcadoAno += l.orcadoAno;
    acc.projecao += l.projecao;
    return acc;
  }, { orcado: 0, realizado: 0, orcadoAno: 0, projecao: 0 });
  total.desvio = total.realizado - total.orcado;
  total.execucao = total.orcado > 0 ? (total.realizado / total.orcado) * 100 : null;

  // ---- por grupo
  const linhasGrupo = grupos.map(g => {
    const doGrupo = linhasConta.filter(l => l.grupo === g.codigo);
    const orcado = doGrupo.reduce((s, l) => s + l.orcado, 0);
    const realizado = doGrupo.reduce((s, l) => s + l.realizado, 0);
    return {
      codigo: g.codigo, nome: g.nome, contas: doGrupo.length,
      orcado, realizado, desvio: realizado - orcado,
      execucao: orcado > 0 ? (realizado / orcado) * 100 : null,
      orcadoAno: doGrupo.reduce((s, l) => s + l.orcadoAno, 0),
      projecao: doGrupo.reduce((s, l) => s + l.projecao, 0),
    };
  }).filter(g => g.orcado !== 0 || g.realizado !== 0);

  const semGrupo = linhasConta.filter(l => l.grupo === null || l.grupo === undefined);
  if (semGrupo.length) {
    const orcado = semGrupo.reduce((s, l) => s + l.orcado, 0);
    const realizado = semGrupo.reduce((s, l) => s + l.realizado, 0);
    if (orcado || realizado) {
      linhasGrupo.push({
        codigo: null, nome: 'Fora do orçamento', contas: semGrupo.length,
        orcado, realizado, desvio: realizado - orcado,
        execucao: orcado > 0 ? (realizado / orcado) * 100 : null,
        orcadoAno: semGrupo.reduce((s, l) => s + l.orcadoAno, 0),
        projecao: semGrupo.reduce((s, l) => s + l.projecao, 0),
      });
    }
  }

  // ---- série mensal (12 meses; null onde não há planilha)
  const serieMensal = [];
  for (let m = 1; m <= 12; m++) {
    const temDados = mesesComDados.includes(m);
    const orcado = contas.reduce((s, c) => s + (c.orcado[m - 1] || 0), 0);
    const realizado = temDados
      ? contas.reduce((s, c) => s + ((realizadoPorMes[m] || {})[String(c.cta)] || 0), 0)
      : null;
    serieMensal.push({
      mes: m, temDados, orcado, realizado,
      execucao: temDados && orcado > 0 ? (realizado / orcado) * 100 : null,
    });
  }

  // ---- lançamentos do recorte
  const lancamentos = d.lancamentos.filter(l => {
    if (!mesesFiltro.includes(l.mes)) return false;
    if (!contasNoRecorte.has(l.cta)) return false;
    if (busca) {
      const c = porCta[l.cta] || {};
      const alvo = normalizar(
        `${l.fornecedor} ${l.doc} ${l.tipo} ${l.historico} ${c.nome || ''} ${l.cta}`);
      if (!alvo.includes(busca)) return false;
    }
    return true;
  }).map(l => Object.assign({}, l, {
    nomeConta: (porCta[l.cta] || {}).nome || String(l.cta),
    nomeGrupo: nomeGrupo[(porCta[l.cta] || {}).grupo] || 'Fora do orçamento',
  }));

  // ---- fornecedores
  const mapaFornecedor = new Map();
  lancamentos.forEach(l => {
    const nome = l.fornecedor || '(sem fornecedor identificado)';
    let f2 = mapaFornecedor.get(nome);
    if (!f2) {
      f2 = { nome, valor: 0, lancamentos: 0, contas: new Set(), meses: new Set() };
      mapaFornecedor.set(nome, f2);
    }
    f2.valor += l.valor;
    f2.lancamentos += 1;
    f2.contas.add(l.cta);
    f2.meses.add(l.mes);
  });
  const totalLancado = lancamentos.reduce((s, l) => s + l.valor, 0);
  const fornecedores = [...mapaFornecedor.values()].map(f2 => ({
    nome: f2.nome, valor: f2.valor, lancamentos: f2.lancamentos,
    contas: f2.contas.size, meses: f2.meses.size,
    ticket: f2.lancamentos ? f2.valor / f2.lancamentos : 0,
    participacao: totalLancado ? (f2.valor / totalLancado) * 100 : 0,
  })).sort((a, b) => b.valor - a.valor);

  // ---- tipos de documento
  const mapaTipo = new Map();
  lancamentos.forEach(l => {
    const t = l.tipo || '(sem tipo)';
    mapaTipo.set(t, (mapaTipo.get(t) || 0) + l.valor);
  });
  const tipos = [...mapaTipo.entries()]
    .map(([rotulo, valor]) => ({ rotulo, valor }))
    .sort((a, b) => b.valor - a.valor);

  // ---- por dia
  const mapaDia = new Map();
  lancamentos.forEach(l => {
    mapaDia.set(l.data, (mapaDia.get(l.data) || 0) + l.valor);
  });
  const porDia = [...mapaDia.entries()]
    .map(([data, valor]) => ({ data, valor }))
    .sort((a, b) => a.data.localeCompare(b.data));

  // ---- diesel
  const diesel = (d.diesel || []).filter(r =>
    f.periodo === 'ytd' ? true : r.mes === Number(f.periodo));
  const litrosPorMes = {};
  (d.diesel || []).forEach(r => {
    litrosPorMes[r.mes] = (litrosPorMes[r.mes] || 0) + r.litros;
  });
  // combustível = Óleo Diesel (380) + Combustível (820)
  const CTAS_COMBUSTIVEL = [380, 820];
  const combustivelPorMes = {};
  mesesComDados.forEach(m => {
    combustivelPorMes[m] = CTAS_COMBUSTIVEL.reduce(
      (s, cta) => s + ((realizadoPorMes[m] || {})[String(cta)] || 0), 0);
  });

  return {
    grupos, nomeGrupo, porCta,
    mesesComDados, mesesFiltro,
    linhasConta, linhasGrupo, total, serieMensal,
    lancamentos, fornecedores, tipos, porDia, totalLancado,
    diesel, litrosPorMes, combustivelPorMes, mesesComDiesel: Object.keys(litrosPorMes).map(Number).sort((a, b) => a - b),
    arquivosDiesel: d.arquivosDiesel || [],
    meses: d.meses,
  };
}

/* ----------------------------------------------------------- tabelas */
/**
 * Monta uma tabela ordenável.
 * colunas: [{chave, rotulo, num?, texto?, classe?, valor(linha), fmt(v, linha)}]
 */
function tabela(alvo, cfg) {
  const { colunas, linhas, id, rodape, semDados = 'Nada a mostrar com os filtros atuais.' } = cfg;
  alvo.innerHTML = '';
  if (!linhas.length) {
    const p = document.createElement('p');
    p.className = 'vazio-tabela';
    p.textContent = semDados;
    alvo.appendChild(p);
    return;
  }

  const ordem = estado.ordem[id] || cfg.ordemInicial || null;
  let dados = linhas.slice();
  if (ordem) {
    const col = colunas.find(c => c.chave === ordem.coluna);
    if (col) {
      dados.sort((a, b) => {
        const va = col.valor(a), vb = col.valor(b);
        let r;
        if (typeof va === 'number' && typeof vb === 'number') r = va - vb;
        else if (va === null || va === undefined) r = -1;
        else if (vb === null || vb === undefined) r = 1;
        else r = String(va).localeCompare(String(vb), 'pt-BR');
        return ordem.direcao === 'asc' ? r : -r;
      });
    }
  }
  if (cfg.limite) dados = dados.slice(0, cfg.limite);

  const t = document.createElement('table');
  t.className = 'dados';

  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  colunas.forEach(col => {
    const th = document.createElement('th');
    th.textContent = col.rotulo;
    if (col.num) th.classList.add('num');
    if (!cfg.semOrdenacao) {
      th.classList.add('ordenavel');
      th.setAttribute('role', 'button');
      th.setAttribute('tabindex', '0');
      if (ordem && ordem.coluna === col.chave) {
        th.classList.add('ordenada');
        const seta = document.createElement('span');
        seta.className = 'seta';
        seta.textContent = ordem.direcao === 'asc' ? ' ▲' : ' ▼';
        th.appendChild(seta);
      }
      const acionar = () => {
        const atual = estado.ordem[id];
        const mesma = atual && atual.coluna === col.chave;
        estado.ordem[id] = {
          coluna: col.chave,
          direcao: mesma && atual.direcao === 'desc' ? 'asc' : 'desc',
        };
        renderizar();
      };
      th.addEventListener('click', acionar);
      th.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); acionar(); }
      });
    }
    trh.appendChild(th);
  });
  thead.appendChild(trh);
  t.appendChild(thead);

  const tbody = document.createElement('tbody');
  dados.forEach(linha => {
    const tr = document.createElement('tr');
    colunas.forEach(col => {
      const td = document.createElement('td');
      const v = col.valor(linha);
      td.textContent = col.fmt ? col.fmt(v, linha) : (v === null || v === undefined ? '—' : String(v));
      if (col.num) td.classList.add('num');
      if (col.texto) td.classList.add('texto');
      const extra = col.classe && col.classe(v, linha);
      if (extra) td.classList.add(...extra.split(' '));
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  t.appendChild(tbody);

  if (rodape) {
    const tfoot = document.createElement('tfoot');
    const tr = document.createElement('tr');
    colunas.forEach(col => {
      const td = document.createElement('td');
      const v = rodape[col.chave];
      td.textContent = v === undefined || v === null ? '' : (col.fmtRodape || col.fmt || String)(v, rodape);
      if (col.num) td.classList.add('num');
      const extra = col.classe && v !== undefined && col.classe(v, rodape);
      if (extra) td.classList.add(...extra.split(' '));
      tr.appendChild(td);
    });
    tfoot.appendChild(tr);
    t.appendChild(tfoot);
  }

  alvo.appendChild(t);
}

/** Tabela simples usada como "ver como tabela" dos gráficos (relevo de contraste). */
function tabelaSimples(alvo, cabecalhos, linhas) {
  alvo.innerHTML = '';
  const rol = document.createElement('div');
  rol.className = 'tabela-rolagem';
  const t = document.createElement('table');
  t.className = 'dados';
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  cabecalhos.forEach((c, i) => {
    const th = document.createElement('th');
    th.textContent = typeof c === 'string' ? c : c.rotulo;
    if (typeof c !== 'string' && c.num) th.classList.add('num');
    else if (i > 0) th.classList.add('num');
    trh.appendChild(th);
  });
  thead.appendChild(trh);
  t.appendChild(thead);
  const tbody = document.createElement('tbody');
  linhas.forEach(linha => {
    const tr = document.createElement('tr');
    linha.forEach((celula, i) => {
      const td = document.createElement('td');
      td.textContent = celula === null || celula === undefined ? '—' : String(celula);
      if (i > 0) td.classList.add('num');
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  t.appendChild(tbody);
  rol.appendChild(t);
  alvo.appendChild(rol);
}

/* ----------------------------------------------------------- KPIs */
function kpi(cfg) {
  const div = document.createElement('div');
  div.className = 'kpi' + (cfg.destaque ? ' kpi-destaque' : '');

  const rot = document.createElement('div');
  rot.className = 'kpi-rotulo';
  rot.textContent = cfg.rotulo;
  div.appendChild(rot);

  const val = document.createElement('div');
  val.className = 'kpi-valor';
  val.textContent = cfg.valor;
  if (cfg.unidade) {
    const u = document.createElement('span');
    u.className = 'unidade';
    u.textContent = ' ' + cfg.unidade;
    val.appendChild(u);
  }
  div.appendChild(val);

  if (cfg.delta) {
    const d = document.createElement('div');
    d.className = 'kpi-delta ' + (cfg.deltaBom ? 'bom' : 'ruim');
    d.textContent = cfg.delta;
    div.appendChild(d);
  }
  if (cfg.medidor !== undefined && cfg.medidor !== null) {
    const m = document.createElement('div');
    m.className = 'medidor' + (cfg.medidor > 100 ? ' acima' : '');
    const i = document.createElement('i');
    i.style.width = Math.min(100, Math.max(0, cfg.medidor)) + '%';
    m.appendChild(i);
    div.appendChild(m);
  }
  if (cfg.nota) {
    const n = document.createElement('div');
    n.className = 'kpi-nota';
    n.textContent = cfg.nota;
    div.appendChild(n);
  }
  return div;
}

function preencherKpis(alvo, lista) {
  alvo.innerHTML = '';
  lista.forEach(c => alvo.appendChild(kpi(c)));
}

/* ==========================================================================
   ABA 1 — VISÃO GERAL
   ========================================================================== */
function renderVisao(v) {
  const rotuloPeriodo = estado.filtros.periodo === 'ytd'
    ? `${v.mesesFiltro.length} ${v.mesesFiltro.length === 1 ? 'mês' : 'meses'} com dados`
    : fmt.mesLongo(Number(estado.filtros.periodo));

  preencherKpis(porId('kpis'), [
    { rotulo: 'Orçado no período', valor: fmt.moeda(v.total.orcado), nota: rotuloPeriodo },
    { rotulo: 'Realizado no período', valor: fmt.moeda(v.total.realizado), nota: rotuloPeriodo },
    {
      rotulo: 'Desvio', valor: comSinal(v.total.desvio),
      delta: v.total.desvio > 0 ? 'acima do orçado' : 'abaixo do orçado',
      deltaBom: v.total.desvio <= 0,
    },
    {
      rotulo: 'Execução do orçado', destaque: true,
      valor: fmt.pct(v.total.execucao), medidor: v.total.execucao,
      nota: v.total.execucao > 100 ? 'ultrapassou o previsto' : 'dentro do previsto',
    },
    {
      rotulo: 'Projeção de fechamento', valor: fmt.moeda(v.total.projecao),
      nota: `orçamento anual ${fmt.moeda(v.total.orcadoAno)}`,
      delta: comSinal(v.total.projecao - v.total.orcadoAno),
      deltaBom: v.total.projecao <= v.total.orcadoAno,
    },
    {
      rotulo: 'Lançamentos', valor: fmt.n0(v.lancamentos.length),
      nota: `${fmt.n0(v.fornecedores.length)} fornecedores`,
    },
  ]);

  // As cores são lidas DENTRO de cada closure de desenho: `G.redesenhar()` roda
  // de novo na troca de tema, e uma cor capturada aqui ficaria congelada no tema
  // anterior — barra de tema escuro sobre superfície clara.
  const mesesRotulo = v.serieMensal.map(m => fmt.mes(m.mes));
  const semDados = v.serieMensal.map(m => !m.temDados);

  // 1. Orçado × Realizado por mês
  G.registrar(porId('g-mensal'), () => {
    const corOrcado = G.cor.serie(0);
    const corRealizado = G.cor.serie(1);
    G.colunasAgrupadas(porId('g-mensal'), {
      categorias: mesesRotulo,
      semDados,
      series: [
        { nome: 'Orçado', cor: corOrcado, valores: v.serieMensal.map(m => m.orcado), semDadosValor: true },
        { nome: 'Realizado', cor: corRealizado, valores: v.serieMensal.map(m => m.realizado) },
      ],
      tituloDica: i => fmt.mesLongo(v.serieMensal[i].mes),
      notasDica: i => {
        const m = v.serieMensal[i];
        if (!m.temDados) return null;
        return [`Execução: ${fmt.pct(m.execucao)} · desvio ${comSinal(m.realizado - m.orcado)}`];
      },
    });
  });
  tabelaSimples(porId('t-g-mensal'),
    ['Mês', 'Orçado', 'Realizado', 'Desvio', 'Execução'],
    v.serieMensal.map(m => [
      fmt.mesLongo(m.mes), fmt.moeda(m.orcado),
      m.temDados ? fmt.moeda(m.realizado) : 'sem dados',
      m.temDados ? comSinal(m.realizado - m.orcado) : '—',
      m.temDados ? fmt.pct(m.execucao) : '—',
    ]));

  // 2. Execução acumulada, com projeção
  let accO = 0, accR = 0;
  const acumOrcado = [], acumRealizado = [], acumProjecao = [];
  v.serieMensal.forEach(m => {
    accO += m.orcado;
    acumOrcado.push(accO);
    if (m.temDados) { accR += m.realizado; acumRealizado.push(accR); acumProjecao.push(null); }
    else { acumRealizado.push(null); acumProjecao.push(null); }
  });
  // trecho de projeção: parte do último mês com dados e soma o orçado dos que faltam
  const ultimoComDados = v.serieMensal.reduce((u, m, i) => m.temDados ? i : u, -1);
  if (ultimoComDados >= 0 && ultimoComDados < 11) {
    let proj = acumRealizado[ultimoComDados];
    acumProjecao[ultimoComDados] = proj;
    for (let i = ultimoComDados + 1; i < 12; i++) {
      if (!v.serieMensal[i].temDados) proj += v.serieMensal[i].orcado;
      acumProjecao[i] = proj;
    }
  }
  G.registrar(porId('g-acumulado'), () => {
    const corOrcado = G.cor.serie(0);
    const corRealizado = G.cor.serie(1);
    G.linhas(porId('g-acumulado'), {
      categorias: mesesRotulo,
      series: [
        { nome: 'Orçado acumulado', cor: corOrcado, valores: acumOrcado },
        { nome: 'Realizado acumulado', cor: corRealizado, valores: acumRealizado },
        { nome: 'Projeção', cor: corRealizado, valores: acumProjecao, tracejada: true },
      ],
      tituloDica: i => fmt.mesLongo(v.serieMensal[i].mes),
    });
  });
  tabelaSimples(porId('t-g-acumulado'),
    ['Mês', 'Orçado acumulado', 'Realizado acumulado', 'Projeção'],
    v.serieMensal.map((m, i) => [
      fmt.mesLongo(m.mes), fmt.moeda(acumOrcado[i]),
      acumRealizado[i] === null ? '—' : fmt.moeda(acumRealizado[i]),
      acumProjecao[i] === null ? '—' : fmt.moeda(acumProjecao[i]),
    ]));

  // 3. % de execução por mês
  G.registrar(porId('g-execucao'), () => {
    G.colunas(porId('g-execucao'), {
      categorias: mesesRotulo,
      valores: v.serieMensal.map(m => m.execucao),
      semDados,
      cor: G.cor.serie(1),
      nomeSerie: 'Execução',
      meta: 100,
      rotuloMeta: '100% = orçado',
      formatarValor: x => fmt.n0(x) + '%',
      formatarDica: x => fmt.pct(x),
      tituloDica: i => fmt.mesLongo(v.serieMensal[i].mes),
      notasDica: i => {
        const m = v.serieMensal[i];
        if (!m.temDados) return null;
        return [`Orçado ${fmt.moeda(m.orcado)} · realizado ${fmt.moeda(m.realizado)}`];
      },
    });
  });
  tabelaSimples(porId('t-g-execucao'), ['Mês', 'Execução do orçado'],
    v.serieMensal.map(m => [fmt.mesLongo(m.mes), m.temDados ? fmt.pct(m.execucao) : 'sem dados']));

  // 4. Desvio por grupo
  const desvios = v.linhasGrupo.slice().sort((a, b) => b.desvio - a.desvio);
  G.registrar(porId('g-desvio-grupo'), () => {
    G.barrasDivergentes(porId('g-desvio-grupo'), {
      itens: desvios.map(g => ({
        rotulo: g.nome, valor: g.desvio,
        linhasExtra: [
          { serie: 'Orçado', valor: fmt.moeda(g.orcado) },
          { serie: 'Realizado', valor: fmt.moeda(g.realizado) },
          { serie: 'Execução', valor: fmt.pct(g.execucao) },
        ],
      })),
    });
  });
  tabelaSimples(porId('t-g-desvio-grupo'),
    ['Grupo', 'Orçado', 'Realizado', 'Desvio', 'Execução'],
    desvios.map(g => [g.nome, fmt.moeda(g.orcado), fmt.moeda(g.realizado),
                      comSinal(g.desvio), fmt.pct(g.execucao)]));

  // 5. Composição do realizado
  G.registrar(porId('g-composicao'), () => {
    G.rosca(porId('g-composicao'), {
      itens: v.linhasGrupo.map(g => ({ rotulo: g.nome, valor: g.realizado })),
    });
  });
  const totalComposicao = v.linhasGrupo.reduce((s, g) => s + Math.max(0, g.realizado), 0);
  tabelaSimples(porId('t-g-composicao'), ['Grupo', 'Realizado', 'Participação'],
    v.linhasGrupo.slice().sort((a, b) => b.realizado - a.realizado).map(g => [
      g.nome, fmt.moeda(g.realizado),
      fmt.pct(totalComposicao ? (g.realizado / totalComposicao) * 100 : 0),
    ]));

  // Tabela: resumo por grupo
  tabela(porId('t-grupos'), {
    id: 'grupos',
    ordemInicial: { coluna: 'realizado', direcao: 'desc' },
    colunas: [
      { chave: 'nome', rotulo: 'Grupo', texto: true, valor: l => l.nome },
      { chave: 'contas', rotulo: 'Contas', num: true, valor: l => l.contas, fmt: fmt.n0 },
      { chave: 'orcado', rotulo: 'Orçado', num: true, valor: l => l.orcado, fmt: fmt.moeda },
      { chave: 'realizado', rotulo: 'Realizado', num: true, valor: l => l.realizado, fmt: fmt.moeda },
      { chave: 'desvio', rotulo: 'Desvio', num: true, valor: l => l.desvio,
        fmt: v2 => comSinal(v2), classe: classeDesvio },
      { chave: 'execucao', rotulo: 'Execução', num: true, valor: l => l.execucao,
        fmt: v2 => fmt.pct(v2), classe: v2 => v2 > 100 ? 'acima' : v2 === null ? 'neutro' : 'abaixo' },
      { chave: 'orcadoAno', rotulo: 'Orçado no ano', num: true, valor: l => l.orcadoAno, fmt: fmt.moeda },
      { chave: 'projecao', rotulo: 'Projeção', num: true, valor: l => l.projecao, fmt: fmt.moeda },
    ],
    linhas: v.linhasGrupo,
    rodape: {
      nome: 'Total', contas: v.linhasConta.length,
      orcado: v.total.orcado, realizado: v.total.realizado,
      desvio: v.total.desvio, execucao: v.total.execucao,
      orcadoAno: v.total.orcadoAno, projecao: v.total.projecao,
    },
  });
}

/* ==========================================================================
   ABA 2 — CONTAS
   ========================================================================== */
function renderContas(v) {
  const top = v.linhasConta.slice()
    .filter(l => l.realizado > 0)
    .sort((a, b) => b.realizado - a.realizado)
    .slice(0, 15);

  G.registrar(porId('g-top-contas'), () => {
    const corOrcado = G.cor.serie(0);
    const corRealizado = G.cor.serie(1);
    G.barrasHorizontais(porId('g-top-contas'), {
      itens: top.map(l => ({
        rotulo: l.nome,
        realizado: l.realizado,
        orcado: l.orcado,
        linhasExtra: [
          { serie: 'Execução', valor: fmt.pct(l.execucao) },
          { serie: 'Desvio', valor: comSinal(l.desvio) },
        ],
        notas: [`Conta ${l.cta} · ${l.nomeGrupo}`],
      })),
      series: [
        { nome: 'Realizado', cor: corRealizado, valor: i => i.realizado },
        { nome: 'Orçado', cor: corOrcado, valor: i => i.orcado },
      ],
    });
  });
  tabelaSimples(porId('t-g-top-contas'),
    ['Conta', 'Realizado', 'Orçado', 'Desvio', 'Execução'],
    top.map(l => [l.nome, fmt.moeda(l.realizado), fmt.moeda(l.orcado),
                  comSinal(l.desvio), fmt.pct(l.execucao)]));

  // Pareto de contas
  const paretoContas = v.linhasConta.filter(l => l.realizado > 0)
    .sort((a, b) => b.realizado - a.realizado).slice(0, 20);
  G.registrar(porId('g-pareto'), () => {
    G.pareto(porId('g-pareto'), {
      itens: paretoContas.map(l => ({ rotulo: l.nome, valor: l.realizado })),
      rotuloEixo: 'contas ordenadas do maior para o menor realizado',
    });
  });
  {
    const total = paretoContas.reduce((s, l) => s + l.realizado, 0);
    let acc = 0;
    tabelaSimples(porId('t-g-pareto'), ['Conta', 'Realizado', 'Participação', 'Acumulado'],
      paretoContas.map(l => {
        acc += l.realizado;
        return [l.nome, fmt.moeda(l.realizado),
                fmt.pct(total ? (l.realizado / total) * 100 : 0),
                fmt.pct(total ? (acc / total) * 100 : 0)];
      }));
  }

  // Mapa de calor conta × mês
  const paraMapa = v.linhasConta.slice()
    .filter(l => l.orcadoAno > 0 || l.realizadoAno > 0)
    .sort((a, b) => b.realizadoAno - a.realizadoAno)
    .slice(0, 25);
  const meses12 = Array.from({ length: 12 }, (_, i) => i + 1);
  G.registrar(porId('g-heatmap'), () => {
    G.mapaCalor(porId('g-heatmap'), {
      meses: meses12,
      semDados: meses12.map(m => !v.mesesComDados.includes(m)),
      linhasDados: paraMapa.map(l => ({
        rotulo: `${l.cta} · ${l.nome}`,
        celulas: l.porMes,
      })),
    });
  });

  // Tabela principal
  tabela(porId('t-contas'), {
    id: 'contas',
    ordemInicial: { coluna: 'realizado', direcao: 'desc' },
    colunas: [
      { chave: 'cta', rotulo: 'Cta', num: true, valor: l => l.cta, fmt: v2 => String(v2) },
      { chave: 'nome', rotulo: 'Conta', texto: true, valor: l => l.nome },
      { chave: 'nomeGrupo', rotulo: 'Grupo', texto: true, valor: l => l.nomeGrupo },
      { chave: 'orcado', rotulo: 'Orçado', num: true, valor: l => l.orcado, fmt: fmt.moeda },
      { chave: 'realizado', rotulo: 'Realizado', num: true, valor: l => l.realizado, fmt: fmt.moeda },
      { chave: 'desvio', rotulo: 'Desvio', num: true, valor: l => l.desvio,
        fmt: v2 => comSinal(v2), classe: classeDesvio },
      { chave: 'execucao', rotulo: 'Execução', num: true, valor: l => l.execucao,
        fmt: v2 => fmt.pct(v2), classe: v2 => v2 === null ? 'neutro' : v2 > 100 ? 'acima' : 'abaixo' },
      { chave: 'orcadoAno', rotulo: 'Orçado no ano', num: true, valor: l => l.orcadoAno, fmt: fmt.moeda },
      { chave: 'projecao', rotulo: 'Projeção', num: true, valor: l => l.projecao, fmt: fmt.moeda },
    ],
    linhas: v.linhasConta,
    rodape: {
      nome: 'Total', cta: '', nomeGrupo: '',
      orcado: v.total.orcado, realizado: v.total.realizado,
      desvio: v.total.desvio, execucao: v.total.execucao,
      orcadoAno: v.total.orcadoAno, projecao: v.total.projecao,
    },
  });
}

/* ==========================================================================
   ABA 3 — LANÇAMENTOS
   ========================================================================== */
function renderLancamentos(v) {
  const maiores = v.lancamentos.slice().sort((a, b) => b.valor - a.valor).slice(0, 15);

  preencherKpis(porId('kpis-lancamentos'), [
    { rotulo: 'Lançamentos', valor: fmt.n0(v.lancamentos.length) },
    { rotulo: 'Valor total', valor: fmt.moeda(v.totalLancado) },
    {
      rotulo: 'Ticket médio',
      valor: fmt.moeda(v.lancamentos.length ? v.totalLancado / v.lancamentos.length : 0),
    },
    {
      rotulo: 'Maior lançamento',
      valor: fmt.moeda(maiores.length ? maiores[0].valor : 0),
      nota: maiores.length ? maiores[0].fornecedor || maiores[0].tipo : '',
    },
  ]);

  G.registrar(porId('g-tipos'), () => {
    G.rosca(porId('g-tipos'), { itens: v.tipos, maxFatias: 6 });
  });
  tabelaSimples(porId('t-g-tipos'), ['Tipo de documento', 'Valor', 'Participação'],
    v.tipos.map(t => [t.rotulo, fmt.moeda(t.valor),
                      fmt.pct(v.totalLancado ? (t.valor / v.totalLancado) * 100 : 0)]));

  G.registrar(porId('g-por-dia'), () => {
    G.colunas(porId('g-por-dia'), {
      categorias: v.porDia.map(d => {
        const [, m, dd] = d.data.split('-');
        return v.mesesFiltro.length > 1 ? `${dd}/${m}` : dd;
      }),
      valores: v.porDia.map(d => d.valor),
      cor: G.cor.serie(1),
      nomeSerie: 'Valor lançado',
      formatarValor: fmt.curta,
      formatarDica: fmt.moeda,
      tituloDica: i => fmt.data(v.porDia[i].data),
    });
  });
  tabelaSimples(porId('t-g-por-dia'), ['Data', 'Valor lançado'],
    v.porDia.map(d => [fmt.data(d.data), fmt.moeda(d.valor)]));

  tabela(porId('t-maiores-lancamentos'), {
    id: 'maiores', semOrdenacao: true,
    colunas: [
      { chave: 'data', rotulo: 'Data', valor: l => l.data, fmt: fmt.data },
      { chave: 'nomeConta', rotulo: 'Conta', texto: true, valor: l => l.nomeConta },
      { chave: 'fornecedor', rotulo: 'Fornecedor', texto: true,
        valor: l => l.fornecedor || l.historico || '—' },
      { chave: 'tipo', rotulo: 'Tipo', valor: l => l.tipo },
      { chave: 'doc', rotulo: 'Documento', valor: l => l.doc || '—' },
      { chave: 'valor', rotulo: 'Valor', num: true, valor: l => l.valor, fmt: fmt.moeda },
    ],
    linhas: maiores,
  });

  // paginação
  const paginas = Math.max(1, Math.ceil(v.lancamentos.length / POR_PAGINA));
  if (estado.pagina.lancamentos > paginas) estado.pagina.lancamentos = paginas;
  const inicio = (estado.pagina.lancamentos - 1) * POR_PAGINA;

  const ordem = estado.ordem.lancamentos || { coluna: 'valor', direcao: 'desc' };
  const ordenados = v.lancamentos.slice().sort((a, b) => {
    const va = a[ordem.coluna], vb = b[ordem.coluna];
    let r;
    if (typeof va === 'number' && typeof vb === 'number') r = va - vb;
    else r = String(va == null ? '' : va).localeCompare(String(vb == null ? '' : vb), 'pt-BR');
    return ordem.direcao === 'asc' ? r : -r;
  });

  porId('contagem-lancamentos').textContent =
    `${fmt.n0(v.lancamentos.length)} lançamentos · ${fmt.moeda(v.totalLancado)} no total`;

  tabela(porId('t-lancamentos'), {
    id: 'lancamentos',
    ordemInicial: ordem,
    colunas: [
      { chave: 'data', rotulo: 'Data', valor: l => l.data, fmt: fmt.data },
      { chave: 'mes', rotulo: 'Mês', valor: l => l.mes, fmt: fmt.mes },
      { chave: 'cta', rotulo: 'Cta', num: true, valor: l => l.cta, fmt: v2 => String(v2) },
      { chave: 'nomeConta', rotulo: 'Conta', texto: true, valor: l => l.nomeConta },
      { chave: 'nomeGrupo', rotulo: 'Grupo', texto: true, valor: l => l.nomeGrupo },
      { chave: 'tipo', rotulo: 'Tipo', valor: l => l.tipo },
      { chave: 'doc', rotulo: 'Documento', valor: l => l.doc || '—' },
      { chave: 'fornecedor', rotulo: 'Fornecedor', texto: true, valor: l => l.fornecedor || '—' },
      { chave: 'historico', rotulo: 'Histórico', texto: true, valor: l => l.historico || '—' },
      { chave: 'valor', rotulo: 'Valor', num: true, valor: l => l.valor, fmt: fmt.moeda },
    ],
    linhas: ordenados.slice(inicio, inicio + POR_PAGINA),
    semDados: 'Nenhum lançamento com os filtros atuais.',
  });

  montarPaginacao(porId('paginacao-lancamentos'), 'lancamentos', paginas,
                  v.lancamentos.length, inicio);
}

function montarPaginacao(alvo, chave, paginas, total, inicio) {
  alvo.innerHTML = '';
  if (total === 0) return;
  const fim = Math.min(total, inicio + POR_PAGINA);

  const criar = (rotulo, destino, desabilitado) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = rotulo;
    b.disabled = !!desabilitado;
    b.addEventListener('click', () => { estado.pagina[chave] = destino; renderizar(); });
    alvo.appendChild(b);
  };
  const atual = estado.pagina[chave];
  criar('‹ Anterior', atual - 1, atual <= 1);
  const info = document.createElement('span');
  info.textContent = `${fmt.n0(inicio + 1)}–${fmt.n0(fim)} de ${fmt.n0(total)}`
                   + `  ·  página ${atual} de ${paginas}`;
  alvo.appendChild(info);
  criar('Próxima ›', atual + 1, atual >= paginas);
}

/* ==========================================================================
   ABA 4 — FORNECEDORES
   ========================================================================== */
function renderFornecedores(v) {
  const top10 = v.fornecedores.slice(0, 10).reduce((s, f) => s + f.valor, 0);

  preencherKpis(porId('kpis-fornecedores'), [
    { rotulo: 'Fornecedores', valor: fmt.n0(v.fornecedores.length) },
    { rotulo: 'Valor total', valor: fmt.moeda(v.totalLancado) },
    {
      rotulo: 'Concentração no top 10',
      valor: fmt.pct(v.totalLancado ? (top10 / v.totalLancado) * 100 : 0),
      medidor: v.totalLancado ? (top10 / v.totalLancado) * 100 : 0,
    },
    {
      rotulo: 'Maior fornecedor',
      valor: fmt.moeda(v.fornecedores.length ? v.fornecedores[0].valor : 0),
      nota: v.fornecedores.length ? v.fornecedores[0].nome : '',
    },
  ]);

  const top = v.fornecedores.slice(0, 15);
  G.registrar(porId('g-top-fornecedores'), () => {
    G.barrasHorizontais(porId('g-top-fornecedores'), {
      itens: top.map(f => ({
        rotulo: f.nome, valor: f.valor,
        linhasExtra: [
          { serie: 'Lançamentos', valor: fmt.n0(f.lancamentos) },
          { serie: 'Ticket médio', valor: fmt.moeda(f.ticket) },
          { serie: 'Participação', valor: fmt.pct(f.participacao) },
        ],
        notas: [`Aparece em ${f.contas} ${f.contas === 1 ? 'conta' : 'contas'}`],
      })),
      series: [{ nome: 'Valor', cor: G.cor.serie(0), valor: i => i.valor }],
      larguraRotulo: 200,
    });
  });
  tabelaSimples(porId('t-g-top-fornecedores'),
    ['Fornecedor', 'Valor', 'Lançamentos', 'Participação'],
    top.map(f => [f.nome, fmt.moeda(f.valor), fmt.n0(f.lancamentos), fmt.pct(f.participacao)]));

  const paretoForn = v.fornecedores.slice(0, 20);
  G.registrar(porId('g-pareto-fornecedores'), () => {
    G.pareto(porId('g-pareto-fornecedores'), {
      itens: paretoForn.map(f => ({ rotulo: f.nome, valor: f.valor })),
      rotuloEixo: 'fornecedores ordenados do maior para o menor valor',
    });
  });
  {
    const total = paretoForn.reduce((s, f) => s + f.valor, 0);
    let acc = 0;
    tabelaSimples(porId('t-g-pareto-fornecedores'),
      ['Fornecedor', 'Valor', 'Participação', 'Acumulado'],
      paretoForn.map(f => {
        acc += f.valor;
        return [f.nome, fmt.moeda(f.valor),
                fmt.pct(total ? (f.valor / total) * 100 : 0),
                fmt.pct(total ? (acc / total) * 100 : 0)];
      }));
  }

  tabela(porId('t-fornecedores'), {
    id: 'fornecedores',
    ordemInicial: { coluna: 'valor', direcao: 'desc' },
    colunas: [
      { chave: 'nome', rotulo: 'Fornecedor', texto: true, valor: f => f.nome },
      { chave: 'valor', rotulo: 'Valor', num: true, valor: f => f.valor, fmt: fmt.moeda },
      { chave: 'participacao', rotulo: 'Participação', num: true,
        valor: f => f.participacao, fmt: v2 => fmt.pct(v2) },
      { chave: 'lancamentos', rotulo: 'Lançamentos', num: true, valor: f => f.lancamentos, fmt: fmt.n0 },
      { chave: 'ticket', rotulo: 'Ticket médio', num: true, valor: f => f.ticket, fmt: fmt.moeda },
      { chave: 'contas', rotulo: 'Contas', num: true, valor: f => f.contas, fmt: fmt.n0 },
      { chave: 'meses', rotulo: 'Meses ativos', num: true, valor: f => f.meses, fmt: fmt.n0 },
    ],
    linhas: v.fornecedores,
    rodape: {
      nome: 'Total', valor: v.totalLancado, participacao: 100,
      lancamentos: v.lancamentos.length,
      ticket: v.lancamentos.length ? v.totalLancado / v.lancamentos.length : 0,
    },
    semDados: 'Nenhum fornecedor com os filtros atuais.',
  });
}

/* ==========================================================================
   ABA 5 — DIESEL
   ========================================================================== */
function renderDiesel(v) {
  const aviso = porId('nota-diesel');
  if (!v.diesel.length && !(estado.dados.diesel || []).length) {
    aviso.hidden = false;
    aviso.textContent = 'Nenhum relatório de consumo de diesel carregado. '
      + 'Adicione o arquivo na aba Dados ou em planilhas/diesel/.';
  } else {
    // O relatório de diesel pode cobrir período diferente dos meses financeiros.
    const semFinanceiro = v.mesesComDiesel.filter(m => !v.mesesComDados.includes(m));
    const lista = semFinanceiro.map(fmt.mesLongo);
    const emPortugues = lista.length > 1
      ? lista.slice(0, -1).join(', ') + ' e ' + lista[lista.length - 1]
      : lista[0];
    aviso.hidden = false;
    aviso.textContent =
      'O relatório de diesel mede CONSUMO retirado do estoque; as contas 380 e 820 '
      + 'medem a COMPRA lançada no financeiro. Os dois não coincidem no mesmo mês, '
      + 'então o custo por litro é indicativo, não o preço pago no litro.'
      + (semFinanceiro.length
          ? ` Além disso, há litros atendidos em ${emPortugues}, `
            + `${lista.length > 1 ? 'meses' : 'mês'} sem planilha financeira carregada — `
            + 'o custo por litro não é calculado nesses meses.'
          : '');
  }

  const litros = v.diesel.reduce((s, r) => s + r.litros, 0);
  const combustivel = v.mesesFiltro.reduce((s, m) => s + (v.combustivelPorMes[m] || 0), 0);

  // O custo por litro só faz sentido somando NUMERADOR e DENOMINADOR nos MESMOS
  // meses. Dividir o combustível do ano pelos litros de um mês daria um número
  // sem significado nenhum.
  const mesesComAmbos = v.mesesFiltro
    .filter(m => v.litrosPorMes[m] && v.mesesComDados.includes(m));
  const custoComparavel = mesesComAmbos.reduce((s, m) => s + (v.combustivelPorMes[m] || 0), 0);
  const litrosComparavel = mesesComAmbos.reduce((s, m) => s + (v.litrosPorMes[m] || 0), 0);

  preencherKpis(porId('kpis-diesel'), [
    { rotulo: 'Litros atendidos', valor: fmt.n0(litros), unidade: 'L',
      nota: `${fmt.n0(v.diesel.length)} requisições` },
    { rotulo: 'Realizado de combustível', valor: fmt.moeda(combustivel),
      nota: 'contas 380 Óleo Diesel + 820 Combustível' },
    {
      rotulo: 'Custo por litro',
      valor: litrosComparavel ? fmt.moeda(custoComparavel / litrosComparavel) : '—',
      nota: litrosComparavel
        ? `${fmt.moeda(custoComparavel)} ÷ ${fmt.n0(litrosComparavel)} L em `
          + mesesComAmbos.map(fmt.mes).join(', ')
        : 'nenhum mês tem litros e financeiro juntos',
    },
    {
      rotulo: 'Média por requisição',
      valor: v.diesel.length ? fmt.n0(litros / v.diesel.length) : '0', unidade: 'L',
    },
  ]);

  const meses12 = Array.from({ length: 12 }, (_, i) => i + 1);
  G.registrar(porId('g-litros'), () => {
    G.colunas(porId('g-litros'), {
      categorias: meses12.map(fmt.mes),
      valores: meses12.map(m => v.litrosPorMes[m] === undefined ? null : v.litrosPorMes[m]),
      cor: G.cor.serie(0),
      nomeSerie: 'Litros',
      formatarValor: fmt.curta,
      formatarDica: fmt.litros,
      tituloDica: i => fmt.mesLongo(meses12[i]),
    });
  });
  tabelaSimples(porId('t-g-litros'), ['Mês', 'Litros'],
    meses12.map(m => [fmt.mesLongo(m),
      v.litrosPorMes[m] === undefined ? 'sem dados' : fmt.litros(v.litrosPorMes[m])]));

  // custo por litro: só onde há litros E financeiro
  const precos = meses12.map(m => {
    const l = v.litrosPorMes[m];
    const c = v.combustivelPorMes[m];
    if (!l || c === undefined || !v.mesesComDados.includes(m)) return null;
    return c / l;
  });
  G.registrar(porId('g-preco-litro'), () => {
    if (!precos.some(p => p !== null)) {
      return G.vazio(porId('g-preco-litro'),
        'Nenhum mês tem litros e realizado financeiro ao mesmo tempo.');
    }
    G.linhas(porId('g-preco-litro'), {
      categorias: meses12.map(fmt.mes),
      series: [{ nome: 'R$ por litro', cor: G.cor.serie(1), valores: precos }],
      formatarValor: v2 => 'R$ ' + fmt.n2(v2),
      formatarDica: v2 => 'R$ ' + fmt.n2(v2) + ' /L',
      tituloDica: i => fmt.mesLongo(meses12[i]),
    });
  });
  tabelaSimples(porId('t-g-preco-litro'), ['Mês', 'Litros', 'Combustível', 'R$ por litro'],
    meses12.map((m, i) => [
      fmt.mesLongo(m),
      v.litrosPorMes[m] === undefined ? '—' : fmt.litros(v.litrosPorMes[m]),
      v.combustivelPorMes[m] === undefined ? '—' : fmt.moeda(v.combustivelPorMes[m]),
      precos[i] === null ? '—' : 'R$ ' + fmt.n2(precos[i]),
    ]));

  const paginas = Math.max(1, Math.ceil(v.diesel.length / POR_PAGINA));
  if (estado.pagina.diesel > paginas) estado.pagina.diesel = paginas;
  const inicio = (estado.pagina.diesel - 1) * POR_PAGINA;
  const ordenados = v.diesel.slice().sort((a, b) => b.litros - a.litros);

  tabela(porId('t-diesel'), {
    id: 'diesel',
    ordemInicial: { coluna: 'litros', direcao: 'desc' },
    colunas: [
      { chave: 'requisicao', rotulo: 'Requisição', valor: r => r.requisicao, fmt: v2 => String(v2) },
      { chave: 'emissao', rotulo: 'Emissão', valor: r => r.emissao, fmt: fmt.data },
      { chave: 'atendimento', rotulo: 'Atendimento', valor: r => r.atendimento, fmt: fmt.data },
      { chave: 'mes', rotulo: 'Mês', valor: r => r.mes, fmt: fmt.mes },
      { chave: 'produto', rotulo: 'Produto', texto: true, valor: r => r.produto },
      { chave: 'pedido', rotulo: 'Pedido', num: true, valor: r => r.pedido, fmt: fmt.n0 },
      { chave: 'litros', rotulo: 'Litros', num: true, valor: r => r.litros, fmt: fmt.n0 },
    ],
    linhas: ordenados.slice(inicio, inicio + POR_PAGINA),
    rodape: { requisicao: 'Total', litros: litros },
    semDados: 'Nenhuma requisição de diesel no período filtrado.',
  });
  montarPaginacao(porId('paginacao-diesel'), 'diesel', paginas, v.diesel.length, inicio);
}

/* ==========================================================================
   ABA 6 — ALERTAS
   ========================================================================== */
function calcularAlertas(v) {
  const semOrcamento = v.linhasConta
    .filter(l => l.realizado > 0.01 && l.orcado <= 0.01)
    .sort((a, b) => b.realizado - a.realizado);

  const semRealizado = v.linhasConta
    .filter(l => l.orcado > 0.01 && Math.abs(l.realizado) < l.orcado * 0.02)
    .sort((a, b) => b.orcado - a.orcado);

  const acima = v.linhasConta
    .filter(l => l.orcado > 0.01 && l.realizado > l.orcado)
    .sort((a, b) => b.desvio - a.desvio);

  const variacao = v.linhasConta.map(l => {
    const comDados = l.porMes.filter(m => m.temDados);
    if (comDados.length < 2) return null;
    const valores = comDados.map(m => m.realizado);
    const maior = Math.max(...valores);
    const menor = Math.min(...valores);
    const iMaior = comDados[valores.indexOf(maior)].mes;
    const iMenor = comDados[valores.indexOf(menor)].mes;
    return {
      cta: l.cta, nome: l.nome, nomeGrupo: l.nomeGrupo,
      maior, menor, mesMaior: iMaior, mesMenor: iMenor,
      amplitude: maior - menor,
      media: valores.reduce((s, x) => s + x, 0) / valores.length,
    };
  }).filter(Boolean).sort((a, b) => b.amplitude - a.amplitude);

  return { semOrcamento, semRealizado, acima, variacao };
}

function renderAlertas(v) {
  const a = calcularAlertas(v);

  porId('pilula-alertas').textContent =
    String(a.semOrcamento.length + a.acima.length) || '';

  tabela(porId('t-sem-orcamento'), {
    id: 'sem-orcamento',
    ordemInicial: { coluna: 'realizado', direcao: 'desc' },
    colunas: [
      { chave: 'cta', rotulo: 'Cta', num: true, valor: l => l.cta, fmt: v2 => String(v2) },
      { chave: 'nome', rotulo: 'Conta', texto: true, valor: l => l.nome },
      { chave: 'nomeGrupo', rotulo: 'Grupo', texto: true, valor: l => l.nomeGrupo },
      { chave: 'realizado', rotulo: 'Realizado', num: true, valor: l => l.realizado,
        fmt: fmt.moeda, classe: () => 'acima' },
      { chave: 'orcadoAno', rotulo: 'Orçado no ano', num: true, valor: l => l.orcadoAno, fmt: fmt.moeda },
    ],
    linhas: a.semOrcamento,
    rodape: { nome: 'Total', realizado: a.semOrcamento.reduce((s, l) => s + l.realizado, 0) },
    semDados: 'Nenhuma conta com gasto fora do orçamento no período. ✓',
  });

  tabela(porId('t-sem-realizado'), {
    id: 'sem-realizado',
    ordemInicial: { coluna: 'orcado', direcao: 'desc' },
    colunas: [
      { chave: 'cta', rotulo: 'Cta', num: true, valor: l => l.cta, fmt: v2 => String(v2) },
      { chave: 'nome', rotulo: 'Conta', texto: true, valor: l => l.nome },
      { chave: 'nomeGrupo', rotulo: 'Grupo', texto: true, valor: l => l.nomeGrupo },
      { chave: 'orcado', rotulo: 'Orçado no período', num: true, valor: l => l.orcado, fmt: fmt.moeda },
      { chave: 'realizado', rotulo: 'Realizado', num: true, valor: l => l.realizado, fmt: fmt.moeda },
      { chave: 'execucao', rotulo: 'Execução', num: true, valor: l => l.execucao,
        fmt: v2 => fmt.pct(v2), classe: () => 'abaixo' },
    ],
    linhas: a.semRealizado,
    rodape: { nome: 'Total', orcado: a.semRealizado.reduce((s, l) => s + l.orcado, 0) },
    semDados: 'Todas as contas orçadas tiveram execução no período. ✓',
  });

  tabela(porId('t-acima'), {
    id: 'acima',
    ordemInicial: { coluna: 'desvio', direcao: 'desc' },
    colunas: [
      { chave: 'cta', rotulo: 'Cta', num: true, valor: l => l.cta, fmt: v2 => String(v2) },
      { chave: 'nome', rotulo: 'Conta', texto: true, valor: l => l.nome },
      { chave: 'nomeGrupo', rotulo: 'Grupo', texto: true, valor: l => l.nomeGrupo },
      { chave: 'orcado', rotulo: 'Orçado', num: true, valor: l => l.orcado, fmt: fmt.moeda },
      { chave: 'realizado', rotulo: 'Realizado', num: true, valor: l => l.realizado, fmt: fmt.moeda },
      { chave: 'desvio', rotulo: 'Excesso', num: true, valor: l => l.desvio,
        fmt: v2 => comSinal(v2), classe: () => 'acima' },
      { chave: 'execucao', rotulo: 'Execução', num: true, valor: l => l.execucao,
        fmt: v2 => fmt.pct(v2), classe: () => 'acima' },
    ],
    linhas: a.acima,
    rodape: { nome: 'Total', desvio: a.acima.reduce((s, l) => s + l.desvio, 0) },
    semDados: 'Nenhuma conta acima do orçado no período. ✓',
  });

  tabela(porId('t-variacao'), {
    id: 'variacao',
    ordemInicial: { coluna: 'amplitude', direcao: 'desc' },
    limite: 25,
    colunas: [
      { chave: 'cta', rotulo: 'Cta', num: true, valor: l => l.cta, fmt: v2 => String(v2) },
      { chave: 'nome', rotulo: 'Conta', texto: true, valor: l => l.nome },
      { chave: 'menor', rotulo: 'Menor mês', num: true, valor: l => l.menor, fmt: fmt.moeda },
      { chave: 'mesMenor', rotulo: 'Em', valor: l => l.mesMenor, fmt: fmt.mes },
      { chave: 'maior', rotulo: 'Maior mês', num: true, valor: l => l.maior, fmt: fmt.moeda },
      { chave: 'mesMaior', rotulo: 'Em', valor: l => l.mesMaior, fmt: fmt.mes },
      { chave: 'media', rotulo: 'Média', num: true, valor: l => l.media, fmt: fmt.moeda },
      { chave: 'amplitude', rotulo: 'Amplitude', num: true, valor: l => l.amplitude, fmt: fmt.moeda },
    ],
    linhas: a.variacao,
    semDados: 'É preciso ao menos dois meses com dados para comparar.',
  });

  const ausentes = [];
  for (let m = 1; m <= 12; m++) if (!v.mesesComDados.includes(m)) ausentes.push(m);
  const linhasQualidade = estado.dados.meses.slice()
    .sort((a2, b2) => a2.mes - b2.mes)
    .map(m => ({
      mes: m.mes, arquivo: m.arquivo, layout: m.layout,
      origem: m.origem === 'enviado' ? 'enviado pelo navegador' : 'planilhas/',
      total: m.totalRealizado, contas: m.somaContas, lancamentos: m.somaLancamentos,
      operacional: m.totalOperacional === undefined ? m.totalRealizado : m.totalOperacional,
      pessoal: m.totalPessoal || 0,
      conciliado: m.conciliado,
    }));

  // As três primeiras colunas de valor conferem o ARQUIVO inteiro (inclusive a
  // folha). As duas últimas mostram como esse total se divide entre o que o
  // painel analisa e o que o recorte operacional deixou de fora.
  tabela(porId('t-qualidade'), {
    id: 'qualidade', semOrdenacao: true,
    colunas: [
      { chave: 'mes', rotulo: 'Mês', valor: l => l.mes, fmt: fmt.mesLongo },
      { chave: 'arquivo', rotulo: 'Arquivo', texto: true, valor: l => l.arquivo },
      { chave: 'origem', rotulo: 'Origem', valor: l => l.origem },
      { chave: 'layout', rotulo: 'Layout', valor: l => l.layout },
      { chave: 'total', rotulo: 'Total do CC no arquivo', num: true, valor: l => l.total, fmt: fmt.moeda },
      { chave: 'contas', rotulo: 'Soma das contas', num: true, valor: l => l.contas, fmt: fmt.moeda },
      { chave: 'lancamentos', rotulo: 'Soma dos lançamentos', num: true,
        valor: l => l.lancamentos, fmt: fmt.moeda },
      { chave: 'conciliado', rotulo: 'Conciliação', valor: l => l.conciliado,
        fmt: v2 => v2 ? 'confere' : 'divergente',
        classe: v2 => 'marca-status ' + (v2 ? 'ok' : 'falha') },
      { chave: 'operacional', rotulo: 'Operacional (no painel)', num: true,
        valor: l => l.operacional, fmt: fmt.moeda },
      { chave: 'pessoal', rotulo: 'Pessoal (fora)', num: true,
        valor: l => l.pessoal, fmt: fmt.moeda, classe: () => 'neutro' },
    ],
    linhas: linhasQualidade,
    rodape: {
      mes: 'Total', arquivo: '', origem: '', layout: '',
      total: linhasQualidade.reduce((a, l) => a + l.total, 0),
      contas: linhasQualidade.reduce((a, l) => a + l.contas, 0),
      lancamentos: linhasQualidade.reduce((a, l) => a + l.lancamentos, 0),
      operacional: linhasQualidade.reduce((a, l) => a + l.operacional, 0),
      pessoal: linhasQualidade.reduce((a, l) => a + l.pessoal, 0),
    },
  });

  const rodape = porId('rodape-texto');
  const partes = [`Gerado em ${estado.dados.geradoEm || '—'}`,
                  `orçamento: ${estado.base.arquivoOrcamento || '—'}`];
  if (ausentes.length) {
    partes.push('meses sem planilha: ' + ausentes.map(fmt.mesLongo).join(', '));
  }
  rodape.textContent = partes.join(' · ');
}

/* ==========================================================================
   ABA 7 — DADOS
   ========================================================================== */
function renderDados() {
  const linhas = estado.dados.meses.slice().sort((a, b) => a.mes - b.mes).map(m => ({
    tipo: 'Inversão gerencial',
    periodo: fmt.mesLongo(m.mes),
    arquivo: m.arquivo,
    origem: m.origem === 'enviado' ? 'enviado' : 'planilhas/',
    layout: m.layout,
    total: m.totalOperacional === undefined ? m.totalRealizado : m.totalOperacional,
    conciliado: m.conciliado,
    chave: m.origem === 'enviado' ? 'inversao:' + m.mes : null,
  })).concat((estado.dados.arquivosDiesel || []).map(a => ({
    tipo: 'Consumo de diesel',
    periodo: `${fmt.data(a.inicio)} a ${fmt.data(a.fim)}`,
    arquivo: a.arquivo,
    origem: a.origem === 'enviado' ? 'enviado' : 'planilhas/',
    layout: 'SECE214',
    total: null,
    litros: a.totalLitros,
    conciliado: true,
    chave: a.origem === 'enviado' ? 'diesel:' + a.arquivo : null,
  })));

  const alvo = porId('t-arquivos');
  alvo.innerHTML = '';
  const t = document.createElement('table');
  t.className = 'dados';
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  ['Tipo', 'Período', 'Arquivo', 'Origem', 'Layout', 'Total / litros', 'Conciliação', '']
    .forEach((c, i) => {
      const th = document.createElement('th');
      th.textContent = c;
      if (i === 5) th.classList.add('num');
      trh.appendChild(th);
    });
  thead.appendChild(trh);
  t.appendChild(thead);

  const tbody = document.createElement('tbody');
  linhas.forEach(l => {
    const tr = document.createElement('tr');
    const cel = (txt, classe) => {
      const td = document.createElement('td');
      td.textContent = txt;
      if (classe) td.classList.add(...classe.split(' '));
      tr.appendChild(td);
      return td;
    };
    cel(l.tipo);
    cel(l.periodo);
    cel(l.arquivo, 'texto');
    cel(l.origem);
    cel(l.layout);
    cel(l.total !== null && l.total !== undefined ? fmt.moeda(l.total) : fmt.litros(l.litros || 0), 'num');
    cel(l.conciliado ? 'confere' : 'divergente', 'marca-status ' + (l.conciliado ? 'ok' : 'falha'));
    const tdAcao = document.createElement('td');
    if (l.chave) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'botao botao-discreto';
      b.textContent = 'Remover';
      b.addEventListener('click', () => {
        Leitor.remover(l.chave);
        recarregar();
      });
      tdAcao.appendChild(b);
    }
    tr.appendChild(tdAcao);
    tbody.appendChild(tr);
  });
  t.appendChild(tbody);
  alvo.appendChild(t);
}

/* ==========================================================================
   controles
   ========================================================================== */
function preencherFiltros() {
  const d = estado.dados;

  const periodo = porId('f-periodo');
  const anterior = estado.filtros.periodo;
  periodo.innerHTML = '';
  const opAcum = document.createElement('option');
  opAcum.value = 'ytd';
  opAcum.textContent = 'Acumulado (todos os meses com dados)';
  periodo.appendChild(opAcum);
  d.meses.slice().sort((a, b) => a.mes - b.mes).forEach(m => {
    const op = document.createElement('option');
    op.value = String(m.mes);
    op.textContent = fmt.mesLongo(m.mes).replace(/^./, c => c.toUpperCase());
    periodo.appendChild(op);
  });
  periodo.value = [...periodo.options].some(o => o.value === anterior) ? anterior : 'ytd';
  estado.filtros.periodo = periodo.value;

  const grupo = porId('f-grupo');
  const grupoAnterior = estado.filtros.grupo;
  grupo.innerHTML = '<option value="">Todos os grupos</option>';
  d.grupos.forEach(g => {
    const op = document.createElement('option');
    op.value = String(g.codigo);
    op.textContent = g.nome;
    grupo.appendChild(op);
  });
  grupo.value = [...grupo.options].some(o => o.value === grupoAnterior) ? grupoAnterior : '';
  estado.filtros.grupo = grupo.value;

  atualizarOpcoesConta();
}

/** As contas ofertadas seguem o grupo selecionado — nunca oferta combinação vazia. */
function atualizarOpcoesConta() {
  const conta = porId('f-conta');
  const anterior = estado.filtros.conta;
  const grupoSel = estado.filtros.grupo;
  conta.innerHTML = '<option value="">Todas as contas</option>';
  estado.dados.contas
    .filter(c => !grupoSel || String(c.grupo) === grupoSel)
    .filter(c => estado.filtros.naoMonetario || !c.naoMonetaria)
    .slice()
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    .forEach(c => {
      const op = document.createElement('option');
      op.value = String(c.cta);
      op.textContent = `${c.cta} · ${c.nome}`;
      conta.appendChild(op);
    });
  conta.value = [...conta.options].some(o => o.value === anterior) ? anterior : '';
  estado.filtros.conta = conta.value;
}

function ligarControles() {
  porId('f-periodo').addEventListener('change', e => {
    estado.filtros.periodo = e.target.value;
    estado.pagina.lancamentos = 1;
    estado.pagina.diesel = 1;
    renderizar();
  });
  porId('f-grupo').addEventListener('change', e => {
    estado.filtros.grupo = e.target.value;
    atualizarOpcoesConta();
    renderizar();
  });
  porId('f-conta').addEventListener('change', e => {
    estado.filtros.conta = e.target.value;
    renderizar();
  });

  let temporizador = null;
  porId('f-busca').addEventListener('input', e => {
    clearTimeout(temporizador);
    const valor = e.target.value;
    temporizador = setTimeout(() => {
      estado.filtros.busca = valor;
      estado.pagina.lancamentos = 1;
      renderizar();
    }, 200);
  });

  porId('f-nao-monetario').addEventListener('change', e => {
    estado.filtros.naoMonetario = e.target.checked;
    atualizarOpcoesConta();
    renderizar();
  });

  porId('btn-limpar').addEventListener('click', () => {
    estado.filtros = { periodo: 'ytd', grupo: '', conta: '', busca: '', naoMonetario: true };
    estado.pagina = { lancamentos: 1, diesel: 1 };
    porId('f-busca').value = '';
    porId('f-nao-monetario').checked = true;
    preencherFiltros();
    renderizar();
  });

  // abas
  document.querySelectorAll('.aba').forEach(botao => {
    botao.addEventListener('click', () => {
      const id = botao.id.replace('aba-', '');
      trocarAba(id);
    });
    botao.addEventListener('keydown', e => {
      const abas = [...document.querySelectorAll('.aba')];
      const i = abas.indexOf(botao);
      let destino = null;
      if (e.key === 'ArrowRight') destino = abas[(i + 1) % abas.length];
      if (e.key === 'ArrowLeft') destino = abas[(i - 1 + abas.length) % abas.length];
      if (destino) {
        e.preventDefault();
        destino.focus();
        trocarAba(destino.id.replace('aba-', ''));
      }
    });
  });

  // tema — três estados: claro, escuro, e o do sistema quando nada foi escolhido
  porId('btn-tema').addEventListener('click', () => {
    const atual = document.documentElement.getAttribute('data-theme');
    const escuroDoSistema = matchMedia('(prefers-color-scheme: dark)').matches;
    const proximo = atual ? (atual === 'dark' ? 'light' : 'dark')
                          : (escuroDoSistema ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', proximo);
    try { localStorage.setItem('tema-2930', proximo); } catch (e) { /* sem storage */ }
    G.redesenhar();
  });

  porId('btn-excel').addEventListener('click', () => {
    const v = construirVisao();
    Relatorio.baixarExcel(v, estado);
  });

  porId('btn-baixar-dados').addEventListener('click', () => Leitor.baixarDadosJs(estado.dados));
  porId('btn-limpar-enviados').addEventListener('click', () => {
    if (!confirm('Remover todas as planilhas enviadas por este navegador?')) return;
    Leitor.limpar();
    recarregar();
  });

  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!document.documentElement.getAttribute('data-theme')) G.redesenhar();
  });
}

function trocarAba(id) {
  estado.abaAtiva = id;
  document.querySelectorAll('.aba').forEach(b => {
    b.setAttribute('aria-selected', String(b.id === 'aba-' + id));
  });
  document.querySelectorAll('main > section').forEach(s => {
    s.hidden = s.id !== 'painel-' + id;
  });
  // painel escondido tem largura zero; ao aparecer precisa redesenhar
  G.redesenhar();
}

/* ----------------------------------------------------------- render */
function renderizar() {
  const v = construirVisao();

  mostrarNotaDoRecorte(v);

  const aviso = porId('aviso-filtro');
  const partes = [];
  if (estado.filtros.grupo || estado.filtros.conta || estado.filtros.busca
      || !estado.filtros.naoMonetario) {
    if (!estado.filtros.naoMonetario) partes.push('contas não monetárias excluídas');
    if (estado.filtros.grupo) partes.push('grupo: ' + (v.nomeGrupo[estado.filtros.grupo] || ''));
    if (estado.filtros.conta) {
      const c = v.porCta[Number(estado.filtros.conta)];
      partes.push('conta: ' + (c ? c.nome : estado.filtros.conta));
    }
    if (estado.filtros.busca) partes.push('busca: “' + estado.filtros.busca + '”');
  }
  if (partes.length) {
    aviso.hidden = false;
    aviso.textContent = 'Recorte ativo — ' + partes.join(' · ')
      + `. ${v.linhasConta.length} de ${estado.dados.contas.length} contas.`;
  } else {
    aviso.hidden = true;
  }

  renderVisao(v);
  renderContas(v);
  renderLancamentos(v);
  renderFornecedores(v);
  renderDiesel(v);
  renderAlertas(v);
  renderDados();

  G.redesenhar();
}

/**
 * Nota fixa sobre o recorte operacional. Sem ela alguém leria o total do painel
 * como se fosse o custo inteiro do centro de custo, que é bem maior.
 */
function mostrarNotaDoRecorte(v) {
  const alvo = porId('nota-recorte');
  if (!alvo) return;
  const recorte = estado.base.recorte || {};
  if (!recorte.contas || !recorte.contas.length) { alvo.hidden = true; return; }

  const pessoal = estado.dados.meses
    .filter(m => v.mesesFiltro.includes(m.mes))
    .reduce((soma, m) => soma + (m.totalPessoal || 0), 0);

  alvo.hidden = false;
  alvo.textContent =
    'Painel operacional: as contas de pessoal e folha estão fora — '
    + (recorte.nomesGrupos || []).join(', ')
    + `, ${recorte.contas.length} contas, ${fmt.moeda(pessoal)} no período filtrado. `
    + 'Os totais aqui não são o custo inteiro do centro de custo. '
    + 'A aba Alertas mostra a conciliação do arquivo original, com folha e tudo.';
}

function recarregar() {
  estado.dados = Leitor.mesclar(estado.base);
  preencherFiltros();
  renderizar();
}

/* ----------------------------------------------------------- início */
function iniciar() {
  try {
    const tema = localStorage.getItem('tema-2930');
    if (tema) document.documentElement.setAttribute('data-theme', tema);
  } catch (e) { /* sem storage */ }

  if (!window.DADOS || !window.DADOS.contas) {
    document.body.insertAdjacentHTML('afterbegin',
      '<p class="nota">Não encontrei <code>js/dados.js</code>. '
      + 'Rode <code>python atualizar.py</code> para gerá-lo.</p>');
    return;
  }

  estado.base = window.DADOS;
  estado.dados = Leitor.mesclar(estado.base);

  const cc = estado.base.centroCusto;
  porId('titulo').textContent = `Orçado × Realizado — ${cc.nome}`;
  document.title = `Orçado × Realizado — ${cc.nome} ${estado.base.ano}`;
  const recorte = estado.base.recorte || {};
  const partesSub = [
    `Centro de custo ${cc.codigo}`,
    `exercício ${estado.base.ano}`,
    `${estado.dados.meses.length} ${estado.dados.meses.length === 1 ? 'mês' : 'meses'} carregados`,
  ];
  if (recorte.contas && recorte.contas.length) {
    partesSub.push('recorte operacional (sem folha de pagamento)');
  }
  porId('subtitulo').textContent = partesSub.join(' · ');

  ligarControles();
  preencherFiltros();
  Leitor.ligarUpload(recarregar);
  renderizar();
  trocarAba('visao');
}

return { iniciar, estado, construirVisao, recarregar, renderizar, tabelaSimples };

})();

document.addEventListener('DOMContentLoaded', App.iniciar);
