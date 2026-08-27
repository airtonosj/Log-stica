/* ==========================================================================
   app.js — estado, filtros, agregações, tabelas e montagem das abas.

   Convenções que valem em todo o arquivo:

   · Custo é POSITIVO. Receita é POSITIVA. Resultado = receita − custo, então
     resultado negativo significa que saiu mais do que entrou.
   · Mês sem relatório carregado é `null` em toda série — nunca 0. É o que
     impede um gráfico de tendência de mentir sobre agosto a dezembro.
   · Receita não lançada também é `null`, e nesse mês NÃO se calcula resultado.
     O ERP imprime receita ausente como zero, o que faz maio parecer um prejuízo
     de R$ 2,2 mi quando o que houve foi falta de lançamento.
   · O botão "mostrar pessoal" recorta o DETALHE de custo, não o resultado. O
     resultado da empresa não muda porque alguém escondeu uma coluna, então a
     aba Resultado usa sempre o custo cheio.
   ========================================================================== */
'use strict';

const App = (() => {

const fmt = G.fmt;
const POR_PAGINA = 100;

/* ----------------------------------------------------------- estado */
const estado = {
  base: null,
  dados: null,
  filtros: { periodo: 'ytd', grupo: '', conta: '', busca: '', pessoal: false },
  ordem: {},
  pagina: { lancamentos: 1 },
  abaAtiva: 'resultado',
};

const porId = id => document.getElementById(id);

/** Minúsculas e sem acento, para busca tolerante. */
function normalizar(s) {
  return String(s == null ? '' : s)
    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Desvio de CUSTO: gastar acima do orçado é ruim, abaixo é bom. */
function classeDesvio(v) {
  if (v > 0.005) return 'ruim';
  if (v < -0.005) return 'bom';
  return 'neutro';
}

/** Resultado, margem, receita: aqui MAIS é melhor, então o sinal se inverte.
 *  Usar `classeDesvio` nestes campos pintava de vermelho o melhor mês do ano. */
function classeGanho(v) {
  if (v > 0.005) return 'bom';
  if (v < -0.005) return 'ruim';
  return 'neutro';
}

/** Sinal explícito: o leitor precisa ver a direção, não deduzir. */
function comSinal(v, formatar = fmt.moeda) {
  if (v === null || v === undefined) return '—';
  if (Math.abs(v) < 0.005) return formatar(0);
  return (v > 0 ? '+' : '−') + formatar(Math.abs(v));
}

/* ==========================================================================
   visão dos dados — única fonte de verdade para gráficos, tabelas e Excel
   ========================================================================== */
function construirVisao() {
  const d = estado.dados;
  const f = estado.filtros;

  const nomeGrupo = {};
  d.grupos.forEach(g => { nomeGrupo[g.codigo] = g.nome; });

  const mesesComDados = d.meses.map(m => m.mes).sort((a, b) => a - b);
  const porMes = {};
  d.meses.forEach(m => { porMes[m.mes] = m; });

  // Mês PARCIAL vem só do razão, que vê ~54% do custo (não vê o diesel baixado
  // do estoque). Ele existe no painel, mas fica fora do "Acumulado": somar um
  // mês incompleto aos completos daria um total que não é nem uma coisa nem
  // outra. Selecionando o mês no filtro, ele aparece com o aviso.
  const mesesCompletos = d.meses.filter(m => !m.parcial)
    .map(m => m.mes).sort((a, b) => a - b);
  const mesesParciais = d.meses.filter(m => m.parcial)
    .map(m => m.mes).sort((a, b) => a - b);

  const mesesFiltro = f.periodo === 'ytd'
    ? mesesCompletos
    : mesesComDados.filter(m => m === Number(f.periodo));
  const filtroTemParcial = mesesFiltro.some(m => mesesParciais.includes(m));

  const orcadoDe = cta => d.orcadoAnual[String(cta)] || new Array(12).fill(0);
  const realizadoDe = (cta, mes) => {
    const v = (d.valores[String(cta)] || {})[String(mes)];
    return v === undefined ? 0 : v;
  };

  // ---- contas do recorte
  const busca = normalizar(f.busca);
  const contas = d.contas.filter(c => {
    if (!f.pessoal && c.pessoal) return false;
    if (f.grupo && String(c.grupo) !== f.grupo) return false;
    if (f.conta && String(c.cta) !== f.conta) return false;
    if (busca) {
      const alvo = normalizar(`${c.cta} ${c.nome} ${nomeGrupo[c.grupo] || ''}`);
      if (!alvo.includes(busca)) return false;
    }
    return true;
  });

  const linhaDaConta = c => {
    const orcado12 = orcadoDe(c.cta);
    let orcado = 0, realizado = 0;
    mesesFiltro.forEach(m => {
      orcado += orcado12[m - 1] || 0;
      realizado += realizadoDe(c.cta, m);
    });
    let orcadoAno = 0, realizadoAno = 0, orcadoRestante = 0;
    for (let m = 1; m <= 12; m++) {
      orcadoAno += orcado12[m - 1] || 0;
      if (mesesComDados.includes(m)) realizadoAno += realizadoDe(c.cta, m);
      else orcadoRestante += orcado12[m - 1] || 0;
    }
    return {
      cta: c.cta, nome: c.nome, grupo: c.grupo,
      nomeGrupo: nomeGrupo[c.grupo] || 'Fora do orçamento',
      pessoal: !!c.pessoal, naoMonetaria: !!c.naoMonetaria,
      orcado, realizado,
      desvio: realizado - orcado,
      execucao: orcado > 0 ? (realizado / orcado) * 100 : null,
      orcadoAno, realizadoAno, projecao: realizadoAno + orcadoRestante,
      porMes: orcado12.map((o, i) => ({
        mes: i + 1, orcado: o,
        realizado: mesesComDados.includes(i + 1) ? realizadoDe(c.cta, i + 1) : 0,
        temDados: mesesComDados.includes(i + 1),
      })),
    };
  };

  const linhasConta = contas.map(linhaDaConta);

  const total = linhasConta.reduce((a, l) => {
    a.orcado += l.orcado; a.realizado += l.realizado;
    a.orcadoAno += l.orcadoAno; a.projecao += l.projecao;
    return a;
  }, { orcado: 0, realizado: 0, orcadoAno: 0, projecao: 0 });
  total.desvio = total.realizado - total.orcado;
  total.execucao = total.orcado > 0 ? (total.realizado / total.orcado) * 100 : null;

  // ---- por grupo
  const linhasGrupo = d.grupos.map(g => {
    const doGrupo = linhasConta.filter(l => l.grupo === g.codigo);
    const orcado = doGrupo.reduce((s, l) => s + l.orcado, 0);
    const realizado = doGrupo.reduce((s, l) => s + l.realizado, 0);
    return {
      codigo: g.codigo, nome: g.nome, pessoal: !!g.pessoal,
      contas: doGrupo.length, orcado, realizado,
      desvio: realizado - orcado,
      execucao: orcado > 0 ? (realizado / orcado) * 100 : null,
      orcadoAno: doGrupo.reduce((s, l) => s + l.orcadoAno, 0),
    };
  }).filter(g => g.orcado !== 0 || g.realizado !== 0);

  // ---- série mensal do custo (respeita o recorte) e do resultado (não respeita)
  const orcadoTotalDoMes = mes => d.contas.reduce(
    (s, c) => s + (orcadoDe(c.cta)[mes - 1] || 0), 0);

  const serie = [];
  for (let mes = 1; mes <= 12; mes++) {
    const temDados = mesesComDados.includes(mes);
    const parcial = mesesParciais.includes(mes);
    const m = porMes[mes];
    const custoOrcadoRecorte = contas.reduce((s, c) => s + (orcadoDe(c.cta)[mes - 1] || 0), 0);
    const custoRealizadoRecorte = temDados
      ? contas.reduce((s, c) => s + realizadoDe(c.cta, mes), 0) : null;

    // resultado sempre com o custo CHEIO, inclusive folha — e nunca de mês
    // parcial, cujo custo está subestimado
    const custoCheio = (temDados && !parcial) ? m.custoRealizado : null;
    const receitaRealizada = (temDados && !parcial) ? m.receitaRealizada : null;
    const receitaOrcada = d.receitaOrcadaAnual[mes - 1] || 0;
    const custoOrcadoCheio = orcadoTotalDoMes(mes);

    serie.push({
      mes, temDados, parcial,
      // o que o razão mostra no mês parcial, só para a dica e a tabela
      custoParcial: parcial ? m.custoRealizado : null,
      custoOrcado: custoOrcadoRecorte,
      custoRealizado: custoRealizadoRecorte,
      execucao: temDados && custoOrcadoRecorte > 0
        ? (custoRealizadoRecorte / custoOrcadoRecorte) * 100 : null,
      desvio: temDados ? custoRealizadoRecorte - custoOrcadoRecorte : null,
      custoCheio, custoOrcadoCheio,
      receitaRealizada, receitaOrcada,
      // resultado só existe quando a receita foi lançada
      resultado: (receitaRealizada === null || receitaRealizada === undefined
                  || custoCheio === null) ? null : receitaRealizada - custoCheio,
      resultadoOrcado: receitaOrcada - custoOrcadoCheio,
      margem: (receitaRealizada && custoCheio !== null)
        ? ((receitaRealizada - custoCheio) / receitaRealizada) * 100 : null,
      semReceita: temDados && !parcial
        && (receitaRealizada === null || receitaRealizada === undefined),
    });
  }

  const mesesComResultado = serie.filter(s => s.resultado !== null);
  const resultado = {
    receitaRealizada: mesesComResultado.reduce((s, m) => s + m.receitaRealizada, 0),
    custoRealizado: mesesComResultado.reduce((s, m) => s + m.custoCheio, 0),
    receitaOrcada: mesesComResultado.reduce((s, m) => s + m.receitaOrcada, 0),
    custoOrcado: mesesComResultado.reduce((s, m) => s + m.custoOrcadoCheio, 0),
    meses: mesesComResultado.map(m => m.mes),
    mesesSemReceita: serie.filter(s => s.semReceita).map(s => s.mes),
    mesesNegativos: mesesComResultado.filter(m => m.resultado < 0).map(m => m.mes),
  };
  resultado.valor = resultado.receitaRealizada - resultado.custoRealizado;
  resultado.orcado = resultado.receitaOrcada - resultado.custoOrcado;
  resultado.margem = resultado.receitaRealizada
    ? (resultado.valor / resultado.receitaRealizada) * 100 : null;

  // custo cheio do período filtrado, para a nota do recorte
  const cheioNoFiltro = mesesFiltro.reduce((s, m) => s + (porMes[m] ? porMes[m].custoRealizado : 0), 0);
  // A cobertura do razão só faz sentido comparando os MESMOS meses. O razão pode
  // ter mês que a Análise de Custos ainda não tem (julho), e dividir 7 meses de
  // razão por 6 meses de custo daria uma cobertura inventada.
  const pessoalNoFiltro = cheioNoFiltro - d.contas
    .filter(c => !c.pessoal)
    .reduce((s, c) => s + mesesFiltro.reduce((t, m) => t + realizadoDe(c.cta, m), 0), 0);

  // ---- razão (subconjunto: só detalhe de fornecedor)
  const razao = d.razao || { lancamentos: [], diesel: [], meses: [], arquivosDiesel: [] };
  const porCta = {};
  d.contas.forEach(c => { porCta[c.cta] = c; });
  const mesesRazao = razao.meses.map(m => m.mes);
  const mesesRazaoFiltro = f.periodo === 'ytd'
    ? mesesRazao : mesesRazao.filter(m => m === Number(f.periodo));

  const lancamentos = razao.lancamentos.filter(l => {
    if (!mesesRazaoFiltro.includes(l.mes)) return false;
    const c = porCta[l.cta];
    if (!f.pessoal && c && c.pessoal) return false;
    if (f.grupo && c && String(c.grupo) !== f.grupo) return false;
    if (f.conta && String(l.cta) !== f.conta) return false;
    if (busca) {
      const alvo = normalizar(`${l.fornecedor} ${l.doc} ${l.tipo} ${l.historico} `
        + `${(c || {}).nome || ''} ${l.cta}`);
      if (!alvo.includes(busca)) return false;
    }
    return true;
  }).map(l => Object.assign({}, l, {
    nomeConta: (porCta[l.cta] || {}).nome || String(l.cta),
    nomeGrupo: nomeGrupo[(porCta[l.cta] || {}).grupo] || 'Fora do orçamento',
  }));

  const totalLancado = lancamentos.reduce((s, l) => s + l.valor, 0);
  const mesesComAmbos = mesesRazaoFiltro.filter(m => mesesFiltro.includes(m));
  const razaoNosMesesComAmbos = lancamentos
    .filter(l => mesesComAmbos.includes(l.mes))
    .reduce((s, l) => s + l.valor, 0);
  const custoNosMesesComAmbos = mesesComAmbos
    .reduce((s, m) => s + (porMes[m] ? porMes[m].custoRealizado : 0), 0);
  const cobertura = custoNosMesesComAmbos
    ? (razaoNosMesesComAmbos / custoNosMesesComAmbos) * 100 : null;
  const mesesSoNoRazao = mesesRazaoFiltro.filter(m => !mesesFiltro.includes(m));
  const mapaForn = new Map();
  lancamentos.forEach(l => {
    const nome = l.fornecedor || '(sem fornecedor identificado)';
    let x = mapaForn.get(nome);
    if (!x) { x = { nome, valor: 0, lancamentos: 0, contas: new Set(), meses: new Set() }; mapaForn.set(nome, x); }
    x.valor += l.valor; x.lancamentos += 1; x.contas.add(l.cta); x.meses.add(l.mes);
  });
  const fornecedores = [...mapaForn.values()].map(x => ({
    nome: x.nome, valor: x.valor, lancamentos: x.lancamentos,
    contas: x.contas.size, meses: x.meses.size,
    ticket: x.lancamentos ? x.valor / x.lancamentos : 0,
    participacao: totalLancado ? (x.valor / totalLancado) * 100 : 0,
  })).sort((a, b) => b.valor - a.valor);

  const litrosPorMes = {};
  (razao.diesel || []).forEach(r => {
    litrosPorMes[r.mes] = (litrosPorMes[r.mes] || 0) + r.litros;
  });

  // ---- frete carrada faturado às obras
  const freteBruto = d.freteCarrada || [];
  const receitaDoMes = mes => {
    const m = porMes[mes];
    if (!m || m.parcial) return null;
    return m.receitaRealizada === undefined ? null : m.receitaRealizada;
  };
  const freteMeses = freteBruto.map(x => Object.assign({}, x, {
    receita: receitaDoMes(x.mes),
    freteAvulso: ((d.freteAvulso || {})[String(x.mes)] || {}).valor,
  })).sort((a2, b2) => a2.mes - b2.mes);

  // composição da receita mês a mês, com a fonte de cada um
  const composicao = [];
  for (let mes = 1; mes <= 12; mes++) {
    const m = porMes[mes];
    const carrada = (freteBruto.find(x => x.mes === mes) || {}).total;
    const avulso = ((d.freteAvulso || {})[String(mes)] || {}).valor;
    if (carrada === undefined && avulso === undefined && !m) continue;
    composicao.push({
      mes,
      carrada: carrada === undefined ? null : carrada,
      avulso: avulso === undefined ? null : avulso,
      soma: (carrada === undefined || avulso === undefined)
        ? null : Math.round((carrada + avulso) * 100) / 100,
      receita: m && !m.parcial && m.receitaRealizada !== undefined
        ? m.receitaRealizada : null,
      fonte: m ? m.fonteReceita || null : null,
      conferencia: m ? m.conferenciaReceita : null,
      semFreteCarrada: (d.mesesSemFreteCarrada || {})[String(mes)] || null,
    });
  }

  const freteNoPeriodo = f.periodo === 'ytd'
    ? freteMeses : freteMeses.filter(x => x.mes === Number(f.periodo));

  const mapaObra = new Map();
  freteNoPeriodo.forEach(x => {
    x.porCR.forEach(i => {
      let o = mapaObra.get(i.cr);
      if (!o) { o = { cr: i.cr, valor: 0, meses: 0, porMes: {} }; mapaObra.set(i.cr, o); }
      o.valor += i.valor;
      o.meses += 1;
      o.porMes[x.mes] = (o.porMes[x.mes] || 0) + i.valor;
    });
  });

  const problemasFrete = [];
  freteNoPeriodo.forEach(x => {
    if (x.conflitoDeData) {
      problemasFrete.push(`a aba ${x.aba} diz ${fmt.mesLongo(x.mes)} mas os `
        + `lançamentos têm data de ${fmt.mesLongo(x.mesReal)}/${x.anoReal}`);
    }
    if (x.confere === false) {
      problemasFrete.push(`em ${fmt.mesLongo(x.mes)}, o resumo e o detalhe da `
        + `planilha divergem em ${fmt.moeda(Math.abs((x.somaDetalhe || 0) - x.total))}`);
    }
  });

  const frete = {
    composicao,
    meses: freteMeses,
    doPeriodo: freteNoPeriodo,
    porObra: [...mapaObra.values()].sort((a2, b2) => b2.valor - a2.valor),
    problemas: problemasFrete,
  };

  return {
    frete,
    grupos: d.grupos, nomeGrupo, porCta,
    mesesComDados, mesesCompletos, mesesParciais, mesesFiltro, filtroTemParcial, serie,
    linhasConta, linhasGrupo, total, resultado,
    cheioNoFiltro, pessoalNoFiltro,
    lancamentos, fornecedores, totalLancado, litrosPorMes,
    cobertura, mesesComAmbos, mesesSoNoRazao,
    mesesRazao, arquivosDiesel: razao.arquivosDiesel || [],
    meses: d.meses,
  };
}

/* ==========================================================================
   tabelas e KPIs (reaproveitados da versão anterior)
   ========================================================================== */
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
      td.textContent = col.fmt ? col.fmt(v, linha)
        : (v === null || v === undefined ? '—' : String(v));
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
      td.textContent = v === undefined || v === null ? ''
        : (col.fmtRodape || col.fmt || String)(v, rodape);
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
    th.textContent = c;
    if (i > 0) th.classList.add('num');
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
    const dd = document.createElement('div');
    dd.className = 'kpi-delta ' + (cfg.deltaBom ? 'bom' : 'ruim');
    dd.textContent = cfg.delta;
    div.appendChild(dd);
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
   ABA 1 — RESULTADO
   ========================================================================== */
function renderResultado(v) {
  const r = v.resultado;
  const nomes = r.meses.map(fmt.mesLongo).join(', ');

  porId('nota-resultado').textContent =
    'O resultado usa sempre o custo cheio do centro de custo, inclusive folha de '
    + 'pagamento — esconder pessoal muda o detalhe do custo, não o que a operação '
    + 'ganhou ou perdeu.'
    + (r.mesesSemReceita.length
        ? ` ${r.mesesSemReceita.length === 1 ? 'O mês de' : 'Os meses de'} `
          + r.mesesSemReceita.map(fmt.mesLongo).join(' e ')
          + ' ainda não tem receita lançada, então fica fora da conta: contar '
          + 'receita zero ali produziria um prejuízo que não existe.'
        : '');

  // número herói
  const heroi = porId('heroi');
  heroi.innerHTML = '';
  heroi.className = 'heroi ' + (r.valor >= 0 ? 'positivo' : 'negativo');
  const bloco = (rotulo, valor, nota, secundario) => {
    const div = document.createElement('div');
    div.className = 'heroi-bloco' + (secundario ? ' heroi-secundario' : '');
    const a = document.createElement('div');
    a.className = 'heroi-rotulo';
    a.textContent = rotulo;
    const b = document.createElement('div');
    b.className = 'heroi-valor';
    b.textContent = valor;
    div.append(a, b);
    if (nota) {
      const c = document.createElement('div');
      c.className = 'heroi-nota';
      c.textContent = nota;
      div.appendChild(c);
    }
    return div;
  };
  heroi.appendChild(bloco(
    r.valor >= 0 ? 'Sobrou no período' : 'Faltou no período',
    comSinal(r.valor),
    nomes ? `receita menos custo em ${nomes}` : 'sem mês com receita lançada'));
  heroi.appendChild(bloco('Previsto para os mesmos meses', comSinal(r.orcado),
    r.valor - r.orcado < 0 ? 'resultado pior que o planejado'
                           : 'resultado melhor que o planejado', true));

  preencherKpis(porId('kpis-resultado'), [
    { rotulo: 'Receita realizada', valor: fmt.moeda(r.receitaRealizada),
      nota: `orçado ${fmt.moeda(r.receitaOrcada)}`,
      delta: comSinal(r.receitaRealizada - r.receitaOrcada),
      deltaBom: r.receitaRealizada >= r.receitaOrcada },
    { rotulo: 'Custo realizado', valor: fmt.moeda(r.custoRealizado),
      nota: `orçado ${fmt.moeda(r.custoOrcado)}`,
      delta: comSinal(r.custoRealizado - r.custoOrcado),
      deltaBom: r.custoRealizado <= r.custoOrcado },
    { rotulo: 'Margem sobre a receita', valor: fmt.pct(r.margem),
      nota: r.margem < 0 ? 'cada real faturado dá prejuízo' : 'sobre a receita lançada' },
    { rotulo: 'Meses no vermelho', valor: `${r.mesesNegativos.length} de ${r.meses.length}`,
      nota: r.mesesNegativos.length ? r.mesesNegativos.map(fmt.mes).join(', ') : 'nenhum' },
  ]);

  const rotulos = v.serie.map(s => fmt.mes(s.mes));
  const semDados = v.serie.map(s => !s.temDados);

  // 1. Receita × Custo por mês
  G.registrar(porId('g-receita-custo'), () => {
    G.colunasAgrupadas(porId('g-receita-custo'), {
      categorias: rotulos,
      semDados,
      series: [
        { nome: 'Receita', cor: G.cor.serie(2),
          valores: v.serie.map(s => s.receitaRealizada) },
        { nome: 'Custo', cor: G.cor.serie(1),
          valores: v.serie.map(s => s.custoCheio) },
      ],
      tituloDica: i => fmt.mesLongo(v.serie[i].mes),
      notasDica: i => {
        const s = v.serie[i];
        if (!s.temDados) return null;
        if (s.semReceita) return ['Receita ainda não lançada neste mês.'];
        return [`Resultado ${comSinal(s.resultado)} · margem ${fmt.pct(s.margem)}`];
      },
    });
  });
  tabelaSimples(porId('t-g-receita-custo'),
    ['Mês', 'Receita realizada', 'Custo realizado', 'Resultado'],
    v.serie.filter(s => s.temDados && !s.parcial).map(s => [
      fmt.mesLongo(s.mes),
      s.receitaRealizada === null ? 'não lançada' : fmt.moeda(s.receitaRealizada),
      fmt.moeda(s.custoCheio),
      s.resultado === null ? '—' : comSinal(s.resultado),
    ]));

  // 2. Resultado por mês
  G.registrar(porId('g-resultado-mes'), () => {
    G.colunas(porId('g-resultado-mes'), {
      categorias: rotulos,
      valores: v.serie.map(s => s.resultado),
      semDados: v.serie.map(s => !s.temDados || s.semReceita),
      // resultado: o lado ruim é o negativo (faltou), ao contrário de um desvio
      // de custo, em que o lado ruim é o positivo
      sinalRuim: -1,
      rotuloBom: 'sobrou no mês',
      rotuloRuim: 'faltou no mês',
      nomeSerie: 'Resultado',
      formatarValor: fmt.curta,
      formatarDica: x => comSinal(x),
      tituloDica: i => fmt.mesLongo(v.serie[i].mes),
      notasDica: i => {
        const s = v.serie[i];
        if (s.semReceita) return ['Receita ainda não lançada neste mês.'];
        if (!s.temDados) return null;
        return [`Receita ${fmt.moeda(s.receitaRealizada)} · custo ${fmt.moeda(s.custoCheio)}`];
      },
    });
  });
  tabelaSimples(porId('t-g-resultado-mes'), ['Mês', 'Resultado', 'Margem'],
    v.serie.filter(s => s.temDados && !s.parcial).map(s => [
      fmt.mesLongo(s.mes),
      s.resultado === null ? 'receita não lançada' : comSinal(s.resultado),
      s.margem === null ? '—' : fmt.pct(s.margem),
    ]));

  // 3. Acumulado receita × custo
  let accR = 0, accC = 0;
  const acumR = [], acumC = [];
  v.serie.forEach(s => {
    if (s.temDados && s.receitaRealizada !== null) { accR += s.receitaRealizada; acumR.push(accR); }
    else acumR.push(null);
    if (s.temDados) { accC += s.custoCheio; acumC.push(accC); }
    else acumC.push(null);
  });
  G.registrar(porId('g-acumulado-resultado'), () => {
    G.linhas(porId('g-acumulado-resultado'), {
      categorias: rotulos,
      series: [
        { nome: 'Receita acumulada', cor: G.cor.serie(2), valores: acumR },
        { nome: 'Custo acumulado', cor: G.cor.serie(1), valores: acumC },
      ],
      tituloDica: i => fmt.mesLongo(v.serie[i].mes),
    });
  });
  tabelaSimples(porId('t-g-acumulado-resultado'),
    ['Mês', 'Receita acumulada', 'Custo acumulado', 'Diferença'],
    v.serie.map((s, i) => [
      fmt.mesLongo(s.mes),
      acumR[i] === null ? '—' : fmt.moeda(acumR[i]),
      acumC[i] === null ? '—' : fmt.moeda(acumC[i]),
      (acumR[i] === null || acumC[i] === null) ? '—' : comSinal(acumR[i] - acumC[i]),
    ]));

  // tabela do resultado
  tabela(porId('t-resultado'), {
    id: 'resultado', semOrdenacao: true,
    colunas: [
      { chave: 'mes', rotulo: 'Mês', valor: s => s.mes, fmt: fmt.mesLongo },
      { chave: 'receitaOrcada', rotulo: 'Receita orçada', num: true,
        valor: s => s.receitaOrcada, fmt: fmt.moeda },
      { chave: 'receitaRealizada', rotulo: 'Receita realizada', num: true,
        valor: s => s.receitaRealizada,
        fmt: (x, s) => s.semReceita ? 'não lançada' : (x === null ? '—' : fmt.moeda(x)) },
      { chave: 'custoOrcadoCheio', rotulo: 'Custo orçado', num: true,
        valor: s => s.custoOrcadoCheio, fmt: fmt.moeda },
      { chave: 'custoCheio', rotulo: 'Custo realizado', num: true,
        valor: s => s.custoCheio, fmt: x => x === null ? '—' : fmt.moeda(x) },
      { chave: 'resultadoOrcado', rotulo: 'Resultado orçado', num: true,
        valor: s => s.resultadoOrcado, fmt: x => comSinal(x), classe: classeGanho },
      { chave: 'resultado', rotulo: 'Resultado realizado', num: true,
        valor: s => s.resultado, fmt: x => comSinal(x),
        classe: x => x === null ? 'neutro' : classeGanho(x) },
      { chave: 'margem', rotulo: 'Margem', num: true, valor: s => s.margem,
        fmt: x => fmt.pct(x), classe: x => x === null ? 'neutro' : classeGanho(x) },
    ],
    linhas: v.serie.filter(s => s.temDados && !s.parcial),
    rodape: {
      mes: 'Total', receitaOrcada: r.receitaOrcada, receitaRealizada: r.receitaRealizada,
      custoOrcadoCheio: r.custoOrcado, custoCheio: r.custoRealizado,
      resultadoOrcado: r.orcado, resultado: r.valor, margem: r.margem,
    },
    semDados: 'Nenhum relatório de Análise de Custos carregado.',
  });
}

/* ==========================================================================
   ABA 2 — ORÇADO × REALIZADO
   ========================================================================== */
function renderOrcado(v) {
  // Com mês parcial no recorte, desvio e execução são suprimidos: comparar
  // metade do custo com o orçado cheio mostraria uma economia que não existe.
  const parcial = v.filtroTemParcial;
  preencherKpis(porId('kpis-orcado'), parcial ? [
    { rotulo: 'Orçado no período', valor: fmt.moeda(v.total.orcado) },
    { rotulo: 'Realizado lançado no razão', valor: fmt.moeda(v.total.realizado),
      nota: 'cobre cerca de metade do custo real' },
    { rotulo: 'Desvio', valor: 'não comparável',
      nota: 'o realizado está incompleto' },
    { rotulo: 'Execução do orçado', destaque: true, valor: 'não comparável',
      nota: 'aguardando a Análise de Custos do mês' },
    { rotulo: 'Contas com movimento',
      valor: fmt.n0(v.linhasConta.filter(l => l.realizado > 0).length),
      nota: `de ${fmt.n0(v.linhasConta.length)} no recorte` },
  ] : [
    { rotulo: 'Orçado no período', valor: fmt.moeda(v.total.orcado) },
    { rotulo: 'Realizado no período', valor: fmt.moeda(v.total.realizado) },
    { rotulo: 'Desvio', valor: comSinal(v.total.desvio),
      delta: v.total.desvio > 0 ? 'acima do orçado' : 'abaixo do orçado',
      deltaBom: v.total.desvio <= 0 },
    { rotulo: 'Execução do orçado', destaque: true, valor: fmt.pct(v.total.execucao),
      medidor: v.total.execucao,
      nota: v.total.execucao > 100 ? 'passou do previsto' : 'dentro do previsto' },
    { rotulo: 'Projeção de fechamento', valor: fmt.moeda(v.total.projecao),
      nota: `orçamento anual ${fmt.moeda(v.total.orcadoAno)}`,
      delta: comSinal(v.total.projecao - v.total.orcadoAno),
      deltaBom: v.total.projecao <= v.total.orcadoAno },
  ]);

  const rotulos = v.serie.map(s => fmt.mes(s.mes));
  const semDados = v.serie.map(s => !s.temDados);

  G.registrar(porId('g-orcado-mes'), () => {
    G.colunasAgrupadas(porId('g-orcado-mes'), {
      categorias: rotulos, semDados,
      parcial: v.serie.map(s => s.parcial),
      rotuloParcial: 'Parcial — só o razão, sem diesel',
      series: [
        { nome: 'Orçado', cor: G.cor.serie(0),
          valores: v.serie.map(s => s.custoOrcado), semDadosValor: true },
        { nome: 'Realizado', cor: G.cor.serie(1),
          valores: v.serie.map(s => s.custoRealizado) },
      ],
      tituloDica: i => fmt.mesLongo(v.serie[i].mes)
        + (v.serie[i].parcial ? ' (parcial)' : ''),
      notasDica: i => {
        const s = v.serie[i];
        if (!s.temDados) return null;
        if (s.parcial) {
          return ['Só o razão: cobre cerca de metade do custo e não inclui o '
                  + 'diesel baixado do estoque.',
                  'Fora dos acumulados e do resultado até chegar a Análise de Custos.'];
        }
        return [`Execução ${fmt.pct(s.execucao)} · desvio ${comSinal(s.desvio)}`];
      },
    });
  });
  tabelaSimples(porId('t-g-orcado-mes'), ['Mês', 'Orçado', 'Realizado', 'Desvio', 'Execução'],
    v.serie.map(s => [
      fmt.mesLongo(s.mes) + (s.parcial ? ' (parcial)' : ''),
      fmt.moeda(s.custoOrcado),
      s.temDados ? fmt.moeda(s.custoRealizado) : 'sem dados',
      s.parcial ? 'não comparável' : (s.temDados ? comSinal(s.desvio) : '—'),
      s.parcial ? 'não comparável' : (s.temDados ? fmt.pct(s.execucao) : '—'),
    ]));

  // mês parcial fora do desvio: comparar meio custo com o orçado cheio daria um
  // "economizou" que não existe
  const comDados = v.serie.filter(s => s.temDados && !s.parcial);
  G.registrar(porId('g-desvio-mes'), () => {
    G.barrasDivergentes(porId('g-desvio-mes'), {
      itens: comDados.map(s => ({
        rotulo: fmt.mesLongo(s.mes), valor: s.desvio,
        linhasExtra: [
          { serie: 'Orçado', valor: fmt.moeda(s.custoOrcado) },
          { serie: 'Realizado', valor: fmt.moeda(s.custoRealizado) },
          { serie: 'Execução', valor: fmt.pct(s.execucao) },
        ],
      })),
      larguraRotulo: 90,
    });
  });
  tabelaSimples(porId('t-g-desvio-mes'), ['Mês', 'Desvio', 'Execução'],
    comDados.map(s => [fmt.mesLongo(s.mes), comSinal(s.desvio), fmt.pct(s.execucao)]));

  const paraMapa = v.linhasConta.slice()
    .filter(l => l.orcadoAno > 0 || l.realizadoAno > 0)
    .sort((a, b) => b.realizadoAno - a.realizadoAno).slice(0, 25);
  const meses12 = Array.from({ length: 12 }, (_, i) => i + 1);
  G.registrar(porId('g-heatmap'), () => {
    G.mapaCalor(porId('g-heatmap'), {
      meses: meses12,
      semDados: meses12.map(m => !v.mesesCompletos.includes(m)),
      linhasDados: paraMapa.map(l => ({ rotulo: `${l.cta} · ${l.nome}`, celulas: l.porMes })),
    });
  });

  tabela(porId('t-contas'), {
    id: 'contas',
    ordemInicial: { coluna: 'realizado', direcao: 'desc' },
    colunas: [
      { chave: 'cta', rotulo: 'Cta', num: true, valor: l => l.cta, fmt: String },
      { chave: 'nome', rotulo: 'Conta', texto: true, valor: l => l.nome },
      { chave: 'nomeGrupo', rotulo: 'Grupo', texto: true, valor: l => l.nomeGrupo },
      { chave: 'orcado', rotulo: 'Orçado', num: true, valor: l => l.orcado, fmt: fmt.moeda },
      { chave: 'realizado', rotulo: 'Realizado', num: true, valor: l => l.realizado, fmt: fmt.moeda },
      { chave: 'desvio', rotulo: 'Desvio', num: true, valor: l => l.desvio,
        fmt: x => comSinal(x), classe: classeDesvio },
      { chave: 'execucao', rotulo: 'Execução', num: true, valor: l => l.execucao,
        fmt: x => fmt.pct(x),
        classe: x => x === null ? 'neutro' : x > 100 ? 'acima' : 'abaixo' },
      { chave: 'orcadoAno', rotulo: 'Orçado no ano', num: true, valor: l => l.orcadoAno, fmt: fmt.moeda },
      { chave: 'projecao', rotulo: 'Projeção', num: true, valor: l => l.projecao, fmt: fmt.moeda },
    ],
    linhas: v.linhasConta,
    rodape: {
      nome: 'Total', orcado: v.total.orcado, realizado: v.total.realizado,
      desvio: v.total.desvio, execucao: v.total.execucao,
      orcadoAno: v.total.orcadoAno, projecao: v.total.projecao,
    },
  });
}

/* ==========================================================================
   ABA 3 — SETORES
   ========================================================================== */
function renderSetores(v) {
  const grupos = v.linhasGrupo.slice().sort((a, b) => b.realizado - a.realizado);

  G.registrar(porId('g-grupos'), () => {
    G.barrasHorizontais(porId('g-grupos'), {
      itens: grupos.map(g => ({
        rotulo: g.nome, realizado: g.realizado, orcado: g.orcado,
        linhasExtra: [
          { serie: 'Execução', valor: fmt.pct(g.execucao) },
          { serie: 'Desvio', valor: comSinal(g.desvio) },
        ],
        notas: [`${g.contas} ${g.contas === 1 ? 'conta' : 'contas'}`],
      })),
      series: [
        { nome: 'Realizado', cor: G.cor.serie(1), valor: i => i.realizado },
        { nome: 'Orçado', cor: G.cor.serie(0), valor: i => i.orcado },
      ],
      larguraRotulo: 200,
    });
  });
  tabelaSimples(porId('t-g-grupos'), ['Grupo', 'Realizado', 'Orçado', 'Execução'],
    grupos.map(g => [g.nome, fmt.moeda(g.realizado), fmt.moeda(g.orcado), fmt.pct(g.execucao)]));

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
  tabelaSimples(porId('t-g-desvio-grupo'), ['Grupo', 'Desvio', 'Execução'],
    desvios.map(g => [g.nome, comSinal(g.desvio), fmt.pct(g.execucao)]));

  G.registrar(porId('g-composicao'), () => {
    G.rosca(porId('g-composicao'), {
      itens: v.linhasGrupo.map(g => ({ rotulo: g.nome, valor: g.realizado })),
    });
  });
  const totalComp = v.linhasGrupo.reduce((s, g) => s + Math.max(0, g.realizado), 0);
  tabelaSimples(porId('t-g-composicao'), ['Grupo', 'Realizado', 'Participação'],
    grupos.map(g => [g.nome, fmt.moeda(g.realizado),
                     fmt.pct(totalComp ? (g.realizado / totalComp) * 100 : 0)]));

  const grupoSel = estado.filtros.grupo;
  porId('titulo-contas-do-grupo').textContent = grupoSel
    ? `Contas de ${v.nomeGrupo[grupoSel] || 'grupo'}` : 'Maiores contas';
  porId('legenda-contas-do-grupo').textContent = grupoSel
    ? 'Realizado de cada conta do grupo, com o orçado como referência.'
    : 'As 15 contas com maior realizado. Escolha um grupo no filtro para ver só as dele.';

  const top = v.linhasConta.slice().filter(l => l.realizado > 0)
    .sort((a, b) => b.realizado - a.realizado).slice(0, 15);
  G.registrar(porId('g-top-contas'), () => {
    G.barrasHorizontais(porId('g-top-contas'), {
      itens: top.map(l => ({
        rotulo: l.nome, realizado: l.realizado, orcado: l.orcado,
        linhasExtra: [
          { serie: 'Execução', valor: fmt.pct(l.execucao) },
          { serie: 'Desvio', valor: comSinal(l.desvio) },
        ],
        notas: [`Conta ${l.cta} · ${l.nomeGrupo}`],
      })),
      series: [
        { nome: 'Realizado', cor: G.cor.serie(1), valor: i => i.realizado },
        { nome: 'Orçado', cor: G.cor.serie(0), valor: i => i.orcado },
      ],
    });
  });
  tabelaSimples(porId('t-g-top-contas'), ['Conta', 'Realizado', 'Orçado', 'Execução'],
    top.map(l => [l.nome, fmt.moeda(l.realizado), fmt.moeda(l.orcado), fmt.pct(l.execucao)]));

  tabela(porId('t-grupos'), {
    id: 'grupos',
    ordemInicial: { coluna: 'realizado', direcao: 'desc' },
    colunas: [
      { chave: 'nome', rotulo: 'Grupo', texto: true, valor: g => g.nome },
      { chave: 'contas', rotulo: 'Contas', num: true, valor: g => g.contas, fmt: fmt.n0 },
      { chave: 'orcado', rotulo: 'Orçado', num: true, valor: g => g.orcado, fmt: fmt.moeda },
      { chave: 'realizado', rotulo: 'Realizado', num: true, valor: g => g.realizado, fmt: fmt.moeda },
      { chave: 'desvio', rotulo: 'Desvio', num: true, valor: g => g.desvio,
        fmt: x => comSinal(x), classe: classeDesvio },
      { chave: 'execucao', rotulo: 'Execução', num: true, valor: g => g.execucao,
        fmt: x => fmt.pct(x),
        classe: x => x === null ? 'neutro' : x > 100 ? 'acima' : 'abaixo' },
      { chave: 'orcadoAno', rotulo: 'Orçado no ano', num: true, valor: g => g.orcadoAno, fmt: fmt.moeda },
    ],
    linhas: v.linhasGrupo,
    rodape: {
      nome: 'Total', contas: v.linhasConta.length, orcado: v.total.orcado,
      realizado: v.total.realizado, desvio: v.total.desvio,
      execucao: v.total.execucao, orcadoAno: v.total.orcadoAno,
    },
  });
}

/* ==========================================================================
   ABA 4 — ONDE AGIR
   ========================================================================== */
function calcularAgir(v) {
  const acima = v.linhasConta.filter(l => l.desvio > 0.01)
    .sort((a, b) => b.desvio - a.desvio);
  const totalEstouro = acima.reduce((s, l) => s + l.desvio, 0);
  acima.forEach(l => { l.parteDoEstouro = totalEstouro ? (l.desvio / totalEstouro) * 100 : 0; });

  const semOrcamento = v.linhasConta.filter(l => l.realizado > 0.01 && l.orcado <= 0.01)
    .sort((a, b) => b.realizado - a.realizado);
  const semRealizado = v.linhasConta
    .filter(l => l.orcado > 0.01 && Math.abs(l.realizado) < l.orcado * 0.02)
    .sort((a, b) => b.orcado - a.orcado);

  // piorando: desvio médio dos últimos meses contra os anteriores
  const comDados = v.mesesComDados;
  const metade = Math.max(1, Math.floor(comDados.length / 2));
  const recentes = comDados.slice(-metade);
  const antigos = comDados.slice(0, comDados.length - metade);
  const piorando = v.linhasConta.map(l => {
    const desvioDe = meses => meses.reduce((s, m) => {
      const x = l.porMes[m - 1];
      return s + (x.realizado - x.orcado);
    }, 0) / (meses.length || 1);
    if (!antigos.length) return null;
    const antes = desvioDe(antigos);
    const agora = desvioDe(recentes);
    return {
      cta: l.cta, nome: l.nome, nomeGrupo: l.nomeGrupo,
      antes, agora, piora: agora - antes, desvio: l.desvio,
    };
  }).filter(x => x && x.piora > 0.01).sort((a, b) => b.piora - a.piora);

  return { acima, totalEstouro, semOrcamento, semRealizado, piorando, recentes, antigos };
}

function renderAgir(v) {
  const a = calcularAgir(v);
  porId('pilula-agir').textContent = String(a.acima.length || '');

  if (v.filtroTemParcial) {
    porId('nota-agir').textContent =
      'O período selecionado inclui mês com dados parciais (só o razão). Um desvio '
      + 'calculado sobre metade do custo não serve para plano de ação: escolha '
      + '"Acumulado" ou um mês com Análise de Custos.';
    ['t-acima', 't-piorando', 't-sem-orcamento', 't-sem-realizado'].forEach(id => {
      const alvo = porId(id);
      alvo.innerHTML = '';
      const p = document.createElement('p');
      p.className = 'vazio-tabela';
      p.textContent = 'Indisponível para mês parcial.';
      alvo.appendChild(p);
    });
    [['g-estouro', 't-g-estouro'], ['g-pareto-estouro', 't-g-pareto-estouro']]
      .forEach(([g, t]) => {
        G.vazio(porId(g), 'Indisponível para mês parcial.');
        porId(t).innerHTML = '';
      });
    return;
  }

  const noventa = (() => {
    let acc = 0, n = 0;
    for (const l of a.acima) { acc += l.desvio; n += 1; if (acc >= a.totalEstouro * 0.8) break; }
    return n;
  })();

  porId('nota-agir').textContent = a.acima.length
    ? `${a.acima.length} contas passaram do orçado no período, somando `
      + `${fmt.moeda(a.totalEstouro)}. As ${noventa} maiores respondem por 80% disso — `
      + 'é onde o plano de ação tem mais efeito.'
    : 'Nenhuma conta passou do orçado no período filtrado.';

  const top = a.acima.slice(0, 15);
  G.registrar(porId('g-estouro'), () => {
    G.barrasHorizontais(porId('g-estouro'), {
      itens: top.map(l => ({
        rotulo: l.nome, valor: l.desvio,
        linhasExtra: [
          { serie: 'Orçado', valor: fmt.moeda(l.orcado) },
          { serie: 'Realizado', valor: fmt.moeda(l.realizado) },
          { serie: 'Execução', valor: fmt.pct(l.execucao) },
        ],
        notas: [`Conta ${l.cta} · ${l.nomeGrupo}`,
                `${fmt.pct(l.parteDoEstouro)} do estouro total`],
      })),
      series: [{ nome: 'Excesso', cor: G.cor.serie(1), valor: i => i.valor }],
    });
  });
  tabelaSimples(porId('t-g-estouro'), ['Conta', 'Excesso', 'Execução', '% do estouro'],
    top.map(l => [l.nome, comSinal(l.desvio), fmt.pct(l.execucao), fmt.pct(l.parteDoEstouro)]));

  G.registrar(porId('g-pareto-estouro'), () => {
    G.pareto(porId('g-pareto-estouro'), {
      itens: a.acima.slice(0, 20).map(l => ({ rotulo: l.nome, valor: l.desvio })),
      rotuloEixo: 'contas ordenadas do maior para o menor excesso',
    });
  });
  {
    const lista = a.acima.slice(0, 20);
    const tot = lista.reduce((s, l) => s + l.desvio, 0);
    let acc = 0;
    tabelaSimples(porId('t-g-pareto-estouro'), ['Conta', 'Excesso', 'Participação', 'Acumulado'],
      lista.map(l => {
        acc += l.desvio;
        return [l.nome, fmt.moeda(l.desvio), fmt.pct(tot ? (l.desvio / tot) * 100 : 0),
                fmt.pct(tot ? (acc / tot) * 100 : 0)];
      }));
  }

  tabela(porId('t-acima'), {
    id: 'acima',
    ordemInicial: { coluna: 'desvio', direcao: 'desc' },
    colunas: [
      { chave: 'cta', rotulo: 'Cta', num: true, valor: l => l.cta, fmt: String },
      { chave: 'nome', rotulo: 'Conta', texto: true, valor: l => l.nome },
      { chave: 'nomeGrupo', rotulo: 'Grupo', texto: true, valor: l => l.nomeGrupo },
      { chave: 'orcado', rotulo: 'Orçado', num: true, valor: l => l.orcado, fmt: fmt.moeda },
      { chave: 'realizado', rotulo: 'Realizado', num: true, valor: l => l.realizado, fmt: fmt.moeda },
      { chave: 'desvio', rotulo: 'Excesso', num: true, valor: l => l.desvio,
        fmt: x => comSinal(x), classe: () => 'acima' },
      { chave: 'execucao', rotulo: 'Execução', num: true, valor: l => l.execucao,
        fmt: x => fmt.pct(x), classe: () => 'acima' },
      { chave: 'parteDoEstouro', rotulo: '% do estouro', num: true,
        valor: l => l.parteDoEstouro, fmt: x => fmt.pct(x) },
    ],
    linhas: a.acima,
    rodape: { nome: 'Total', desvio: a.totalEstouro, parteDoEstouro: 100 },
    semDados: 'Nenhuma conta acima do orçado no período. ✓',
  });

  tabela(porId('t-piorando'), {
    id: 'piorando',
    ordemInicial: { coluna: 'piora', direcao: 'desc' },
    limite: 20,
    colunas: [
      { chave: 'cta', rotulo: 'Cta', num: true, valor: l => l.cta, fmt: String },
      { chave: 'nome', rotulo: 'Conta', texto: true, valor: l => l.nome },
      { chave: 'nomeGrupo', rotulo: 'Grupo', texto: true, valor: l => l.nomeGrupo },
      { chave: 'antes', rotulo: 'Desvio médio antes', num: true, valor: l => l.antes,
        fmt: x => comSinal(x), classe: classeDesvio },
      { chave: 'agora', rotulo: 'Desvio médio agora', num: true, valor: l => l.agora,
        fmt: x => comSinal(x), classe: classeDesvio },
      { chave: 'piora', rotulo: 'Piorou', num: true, valor: l => l.piora,
        fmt: x => comSinal(x), classe: () => 'acima' },
    ],
    linhas: a.piorando,
    semDados: a.antigos.length
      ? 'Nenhuma conta piorando no período. ✓'
      : 'É preciso pelo menos dois meses com dados para comparar.',
  });

  tabela(porId('t-sem-orcamento'), {
    id: 'sem-orcamento',
    ordemInicial: { coluna: 'realizado', direcao: 'desc' },
    colunas: [
      { chave: 'cta', rotulo: 'Cta', num: true, valor: l => l.cta, fmt: String },
      { chave: 'nome', rotulo: 'Conta', texto: true, valor: l => l.nome },
      { chave: 'nomeGrupo', rotulo: 'Grupo', texto: true, valor: l => l.nomeGrupo },
      { chave: 'realizado', rotulo: 'Realizado', num: true, valor: l => l.realizado,
        fmt: fmt.moeda, classe: () => 'acima' },
      { chave: 'orcadoAno', rotulo: 'Orçado no ano', num: true, valor: l => l.orcadoAno, fmt: fmt.moeda },
    ],
    linhas: a.semOrcamento,
    rodape: { nome: 'Total', realizado: a.semOrcamento.reduce((s, l) => s + l.realizado, 0) },
    semDados: 'Nenhum gasto fora do orçamento no período. ✓',
  });

  tabela(porId('t-sem-realizado'), {
    id: 'sem-realizado',
    ordemInicial: { coluna: 'orcado', direcao: 'desc' },
    colunas: [
      { chave: 'cta', rotulo: 'Cta', num: true, valor: l => l.cta, fmt: String },
      { chave: 'nome', rotulo: 'Conta', texto: true, valor: l => l.nome },
      { chave: 'nomeGrupo', rotulo: 'Grupo', texto: true, valor: l => l.nomeGrupo },
      { chave: 'orcado', rotulo: 'Orçado no período', num: true, valor: l => l.orcado, fmt: fmt.moeda },
      { chave: 'realizado', rotulo: 'Realizado', num: true, valor: l => l.realizado, fmt: fmt.moeda },
      { chave: 'execucao', rotulo: 'Execução', num: true, valor: l => l.execucao,
        fmt: x => fmt.pct(x), classe: () => 'abaixo' },
    ],
    linhas: a.semRealizado,
    rodape: { nome: 'Total', orcado: a.semRealizado.reduce((s, l) => s + l.orcado, 0) },
    semDados: 'Todas as contas orçadas tiveram execução. ✓',
  });
}

/* ==========================================================================
   ABA — FRETE FATURADO (frete carrada)
   ========================================================================== */
function renderFrete(v) {
  const f = v.frete;

  porId('nota-frete').textContent =
    'Frete carrada faturado às obras, pelas abas de RESUMO das planilhas de frete. '
    + 'É uma PARTE do frete que a logística cobra — a outra parte vem de um '
    + 'relatório que ainda não está no painel, então este número não é o '
    + 'faturamento total de frete.';

  const alerta = porId('alerta-frete');
  if (f.problemas.length) {
    alerta.hidden = false;
    alerta.textContent = 'Conferir na planilha: ' + f.problemas.join(' · ')
      + '. Os valores estão no painel como estão na planilha — não mexi em nada.';
  } else {
    alerta.hidden = true;
  }

  const totalPeriodo = f.doPeriodo.reduce((s, m) => s + m.total, 0);
  const receitaComparavel = f.doPeriodo
    .filter(m => m.receita !== null)
    .reduce((s, m) => s + m.receita, 0);
  const freteComReceita = f.doPeriodo
    .filter(m => m.receita !== null)
    .reduce((s, m) => s + m.total, 0);
  const parcela = receitaComparavel ? (freteComReceita / receitaComparavel) * 100 : null;
  const maior = f.porObra[0];

  preencherKpis(porId('kpis-frete'), [
    { rotulo: 'Frete carrada no período', valor: fmt.moeda(totalPeriodo),
      nota: `${f.doPeriodo.length} ${f.doPeriodo.length === 1 ? 'mês' : 'meses'}` },
    { rotulo: 'Obras faturadas', valor: fmt.n0(f.porObra.length),
      nota: 'centros de resultado distintos' },
    { rotulo: 'Parcela da receita', valor: parcela === null ? '—' : fmt.pct(parcela),
      medidor: parcela, nota: parcela === null ? 'sem mês comparável'
        : 'nos meses com receita lançada' },
    { rotulo: 'Maior pagadora', valor: maior ? fmt.moeda(maior.valor) : '—',
      nota: maior ? maior.cr : '' },
  ]);

  const meses12 = Array.from({ length: 12 }, (_, i) => i + 1);
  const porMes = {};
  f.meses.forEach(m => { porMes[m.mes] = m; });

  // 1. frete por mês
  G.registrar(porId('g-frete-mes'), () => {
    G.colunas(porId('g-frete-mes'), {
      categorias: meses12.map(fmt.mes),
      valores: meses12.map(m => porMes[m] ? porMes[m].total : null),
      parcial: meses12.map(m => !!(porMes[m] && (porMes[m].conflitoDeData
                                                || porMes[m].confere === false))),
      rotuloParcial: 'Divergência na planilha — conferir',
      cor: G.cor.serie(2),
      nomeSerie: 'Frete carrada',
      formatarValor: fmt.curta,
      formatarDica: fmt.moeda,
      tituloDica: i => fmt.mesLongo(meses12[i]),
      notasDica: i => {
        const m = porMes[meses12[i]];
        if (!m) return null;
        const notas = [`${m.porCR.length} obras · aba ${m.aba}`];
        if (m.conflitoDeData) {
          notas.push(`Atenção: as datas dos lançamentos são de `
            + `${fmt.mesLongo(m.mesReal)}/${m.anoReal}, não deste mês.`);
        }
        if (m.confere === false) notas.push('Resumo e detalhe da planilha divergem.');
        return notas;
      },
    });
  });
  tabelaSimples(porId('t-g-frete-mes'),
    ['Mês', 'Frete carrada', 'Obras', 'Observação'],
    meses12.filter(m => porMes[m]).map(m => {
      const x = porMes[m];
      const obs = [];
      if (x.conflitoDeData) obs.push(`datas de ${fmt.mes(x.mesReal)}/${x.anoReal}`);
      if (x.confere === false) obs.push('resumo ≠ detalhe');
      return [fmt.mesLongo(m), fmt.moeda(x.total), fmt.n0(x.porCR.length),
              obs.join('; ') || '—'];
    }));

  // 2. por obra
  const topObras = f.porObra.slice(0, 15);
  G.registrar(porId('g-frete-obra'), () => {
    if (!topObras.length) {
      return G.vazio(porId('g-frete-obra'), 'Nenhuma planilha de frete no período.');
    }
    G.barrasHorizontais(porId('g-frete-obra'), {
      itens: topObras.map(o => ({
        rotulo: o.cr, valor: o.valor,
        linhasExtra: [
          { serie: 'Participação', valor: fmt.pct(totalPeriodo ? (o.valor / totalPeriodo) * 100 : 0) },
          { serie: 'Meses', valor: fmt.n0(o.meses) },
        ],
      })),
      series: [{ nome: 'Frete', cor: G.cor.serie(2), valor: i => i.valor }],
      larguraRotulo: 220,
    });
  });
  tabelaSimples(porId('t-g-frete-obra'), ['Obra (CR)', 'Frete carrada', 'Participação', 'Meses'],
    f.porObra.map(o => [o.cr, fmt.moeda(o.valor),
      fmt.pct(totalPeriodo ? (o.valor / totalPeriodo) * 100 : 0), fmt.n0(o.meses)]));

  // 3. frete dentro da receita
  G.registrar(porId('g-frete-receita'), () => {
    const comReceita = f.meses.filter(m => m.receita !== null);
    if (!comReceita.length) {
      return G.vazio(porId('g-frete-receita'),
        'Nenhum mês tem frete carrada e receita lançada ao mesmo tempo.');
    }
    G.colunasAgrupadas(porId('g-frete-receita'), {
      categorias: meses12.map(fmt.mes),
      semDados: meses12.map(m => !(porMes[m] && porMes[m].receita !== null)),
      series: [
        { nome: 'Receita total', cor: G.cor.serie(0),
          valores: meses12.map(m => (porMes[m] && porMes[m].receita !== null)
            ? porMes[m].receita : 0) },
        { nome: 'Frete carrada', cor: G.cor.serie(2),
          valores: meses12.map(m => (porMes[m] && porMes[m].receita !== null)
            ? porMes[m].total : 0) },
      ],
      tituloDica: i => fmt.mesLongo(meses12[i]),
      notasDica: i => {
        const m = porMes[meses12[i]];
        if (!m || m.receita === null) return null;
        return [`Frete carrada é ${fmt.pct((m.total / m.receita) * 100)} da receita do mês`];
      },
    });
  });
  tabelaSimples(porId('t-g-frete-receita'),
    ['Mês', 'Receita total', 'Frete carrada', 'Parcela'],
    meses12.filter(m => porMes[m]).map(m => {
      const x = porMes[m];
      return [fmt.mesLongo(m),
              x.receita === null ? 'não lançada' : fmt.moeda(x.receita),
              fmt.moeda(x.total),
              x.receita === null ? '—' : fmt.pct((x.total / x.receita) * 100)];
    }));

  // 3b. composição da receita
  tabela(porId('t-frete-composicao'), {
    id: 'frete-composicao', semOrdenacao: true,
    colunas: [
      { chave: 'mes', rotulo: 'Mês', valor: c => c.mes, fmt: fmt.mesLongo },
      { chave: 'carrada', rotulo: 'Frete carrada', num: true, valor: c => c.carrada,
        fmt: (x, c) => x === null
          ? (c.semFreteCarrada ? 'não existe' : 'falta') : fmt.moeda(x),
        classe: x => x === null ? 'neutro' : '' },
      { chave: 'avulso', rotulo: 'Frete', num: true, valor: c => c.avulso,
        fmt: x => x === null ? 'falta' : fmt.moeda(x),
        classe: x => x === null ? 'neutro' : '' },
      { chave: 'soma', rotulo: 'Faturamento (soma)', num: true, valor: c => c.soma,
        fmt: x => x === null ? '—' : fmt.moeda(x) },
      { chave: 'receita', rotulo: 'Receita usada', num: true, valor: c => c.receita,
        fmt: x => x === null ? 'em branco' : fmt.moeda(x),
        classe: x => x === null ? 'neutro' : '' },
      { chave: 'fonte', rotulo: 'Fonte', valor: c => c.fonte,
        fmt: x => x === 'ERP' ? 'ERP' : x === 'faturamento' ? 'faturamento' : '—',
        classe: x => x === 'faturamento' ? 'marca-status aviso' : '' },
      { chave: 'conferencia', rotulo: 'Soma × ERP', num: true, valor: c => c.conferencia,
        fmt: x => x === null ? '—' : comSinal(x),
        classe: x => x === null ? '' : (Math.abs(x) <= 0.05 ? 'abaixo' : 'acima') },
    ],
    linhas: f.composicao,
    semDados: 'Nenhum dado de faturamento carregado.',
  });

  // 4. matriz obra × mês
  const mesesComFrete = f.meses.map(m => m.mes);
  const colunas = [
    { chave: 'cr', rotulo: 'Obra (CR)', texto: true, valor: o => o.cr },
  ];
  mesesComFrete.forEach(m => {
    colunas.push({
      chave: 'm' + m, rotulo: fmt.mesLongo(m).replace(/^./, c => c.toUpperCase()),
      num: true, valor: o => o.porMes[m] || null,
      fmt: x => x === null ? '—' : fmt.moeda(x),
    });
  });
  colunas.push({ chave: 'valor', rotulo: 'Total', num: true, valor: o => o.valor,
                 fmt: fmt.moeda });

  const rodape = { cr: 'Total', valor: totalPeriodo };
  mesesComFrete.forEach(m => {
    rodape['m' + m] = porMes[m] ? porMes[m].total : null;
  });

  tabela(porId('t-frete-matriz'), {
    id: 'frete-matriz',
    ordemInicial: { coluna: 'valor', direcao: 'desc' },
    colunas, linhas: f.porObra, rodape,
    semDados: 'Nenhuma planilha de frete carrada carregada.',
  });

  // 5. conferência
  tabela(porId('t-frete-conferencia'), {
    id: 'frete-conferencia', semOrdenacao: true,
    colunas: [
      { chave: 'mes', rotulo: 'Mês', valor: m => m.mes, fmt: fmt.mesLongo },
      { chave: 'aba', rotulo: 'Aba', texto: true, valor: m => m.aba },
      { chave: 'arquivo', rotulo: 'Arquivo', texto: true, valor: m => m.arquivo },
      { chave: 'total', rotulo: 'Resumo', num: true, valor: m => m.total, fmt: fmt.moeda },
      { chave: 'somaDetalhe', rotulo: 'Detalhe', num: true, valor: m => m.somaDetalhe,
        fmt: x => x === null || x === undefined ? '—' : fmt.moeda(x) },
      { chave: 'linhasDetalhe', rotulo: 'Linhas', num: true, valor: m => m.linhasDetalhe,
        fmt: x => x === null || x === undefined ? '—' : fmt.n0(x) },
      { chave: 'confere', rotulo: 'Resumo × detalhe', valor: m => m.confere,
        fmt: x => x === null || x === undefined ? '—' : (x ? 'confere' : 'divergente'),
        classe: x => x === null || x === undefined ? ''
          : 'marca-status ' + (x ? 'ok' : 'falha') },
      { chave: 'data', rotulo: 'Mês das datas', valor: m => m,
        fmt: (x, m) => m.mesReal ? fmt.mesLongo(m.mesReal) + '/' + m.anoReal : '—',
        classe: (x, m) => m.conflitoDeData ? 'marca-status aviso' : '' },
    ],
    linhas: f.meses,
    semDados: 'Nenhuma planilha de frete carrada carregada.',
  });
}

/* ==========================================================================
   ABA 5 — FORNECEDORES (razão: subconjunto)
   ========================================================================== */
function renderFornecedores(v) {
  const cobertura = v.cobertura;
  porId('nota-fornecedores').textContent =
    'Esta aba vem do razão do ERP, que lista uma linha por nota em contas a pagar. '
    + 'Ela é a única fonte de QUEM recebeu, mas cobre só '
    + (cobertura === null ? 'parte' : fmt.pct(cobertura))
    + ' do custo dos meses comparáveis: baixa de estoque (óleo diesel) e provisões '
    + '(INSS) não passam por contas a pagar. Por isso os números daqui não fecham '
    + 'com as outras abas.'
    + (v.mesesSoNoRazao.length
        ? ' Atenção: ' + v.mesesSoNoRazao.map(fmt.mesLongo).join(' e ')
          + (v.mesesSoNoRazao.length === 1 ? ' aparece' : ' aparecem')
          + ' só aqui — ainda não há Análise de Custos desse período, então esse '
          + 'valor não entra em nenhuma outra aba nem no cálculo de cobertura.'
        : '');

  const top10 = v.fornecedores.slice(0, 10).reduce((s, f) => s + f.valor, 0);
  preencherKpis(porId('kpis-fornecedores'), [
    { rotulo: 'Fornecedores', valor: fmt.n0(v.fornecedores.length) },
    { rotulo: 'Valor lançado', valor: fmt.moeda(v.totalLancado),
      nota: cobertura === null ? ''
        : `${fmt.pct(cobertura)} do custo em ${v.mesesComAmbos.map(fmt.mes).join(', ')}` },
    { rotulo: 'Concentração no top 10',
      valor: fmt.pct(v.totalLancado ? (top10 / v.totalLancado) * 100 : 0),
      medidor: v.totalLancado ? (top10 / v.totalLancado) * 100 : 0 },
    { rotulo: 'Maior fornecedor',
      valor: fmt.moeda(v.fornecedores.length ? v.fornecedores[0].valor : 0),
      nota: v.fornecedores.length ? v.fornecedores[0].nome : '' },
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
    const tot = paretoForn.reduce((s, f) => s + f.valor, 0);
    let acc = 0;
    tabelaSimples(porId('t-g-pareto-fornecedores'),
      ['Fornecedor', 'Valor', 'Participação', 'Acumulado'],
      paretoForn.map(f => {
        acc += f.valor;
        return [f.nome, fmt.moeda(f.valor), fmt.pct(tot ? (f.valor / tot) * 100 : 0),
                fmt.pct(tot ? (acc / tot) * 100 : 0)];
      }));
  }

  tabela(porId('t-fornecedores'), {
    id: 'fornecedores',
    ordemInicial: { coluna: 'valor', direcao: 'desc' },
    colunas: [
      { chave: 'nome', rotulo: 'Fornecedor', texto: true, valor: f => f.nome },
      { chave: 'valor', rotulo: 'Valor', num: true, valor: f => f.valor, fmt: fmt.moeda },
      { chave: 'participacao', rotulo: 'Participação', num: true,
        valor: f => f.participacao, fmt: x => fmt.pct(x) },
      { chave: 'lancamentos', rotulo: 'Lançamentos', num: true, valor: f => f.lancamentos, fmt: fmt.n0 },
      { chave: 'ticket', rotulo: 'Ticket médio', num: true, valor: f => f.ticket, fmt: fmt.moeda },
      { chave: 'contas', rotulo: 'Contas', num: true, valor: f => f.contas, fmt: fmt.n0 },
      { chave: 'meses', rotulo: 'Meses ativos', num: true, valor: f => f.meses, fmt: fmt.n0 },
    ],
    linhas: v.fornecedores,
    rodape: { nome: 'Total', valor: v.totalLancado, participacao: 100,
              lancamentos: v.lancamentos.length },
    semDados: 'Nenhum lançamento de razão carregado para este recorte.',
  });

  // lançamentos, paginados
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
    `${fmt.n0(v.lancamentos.length)} lançamentos · ${fmt.moeda(v.totalLancado)}`;
  tabela(porId('t-lancamentos'), {
    id: 'lancamentos', ordemInicial: ordem,
    colunas: [
      { chave: 'data', rotulo: 'Data', valor: l => l.data, fmt: fmt.data },
      { chave: 'cta', rotulo: 'Cta', num: true, valor: l => l.cta, fmt: String },
      { chave: 'nomeConta', rotulo: 'Conta', texto: true, valor: l => l.nomeConta },
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

  // diesel
  const meses12 = Array.from({ length: 12 }, (_, i) => i + 1);
  const litros = Object.values(v.litrosPorMes).reduce((s, x) => s + x, 0);
  porId('legenda-diesel').textContent = litros
    ? `${fmt.litros(litros)} atendidos, por mês de atendimento. O relatório mede `
      + 'consumo retirado do estoque; o custo correspondente está na conta 380, nas '
      + 'outras abas.'
    : 'Nenhum relatório de consumo de diesel carregado.';
  G.registrar(porId('g-litros'), () => {
    if (!litros) return G.vazio(porId('g-litros'), 'Nenhum relatório de diesel carregado.');
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
}

function montarPaginacao(alvo, chave, paginas, total, inicio) {
  alvo.innerHTML = '';
  if (!total) return;
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
   ABA 6 — DADOS
   ========================================================================== */
function renderDados(v) {
  const d = estado.dados;
  const fontes = [];
  fontes.push({
    o_que: 'Custo realizado e receita',
    fonte: 'Análise de Custos (FFOR501), PDF',
    arquivos: [...new Set(d.meses.map(m => m.arquivo))].join(', ') || '—',
    cobertura: d.meses.length
      ? d.meses.map(m => fmt.mes(m.mes)).join(', ') : 'nenhum mês',
  });
  fontes.push({
    o_que: 'Orçado, nomes de conta e grupos',
    fonte: 'Programa Orçamentário, planilha',
    arquivos: d.arquivoOrcamento || '—',
    cobertura: 'os 12 meses do ano',
  });
  const razao = d.razao || {};
  fontes.push({
    o_que: 'Fornecedor e documento (só a aba Fornecedores)',
    fonte: 'Razão (FFOR001/FFOR401), planilhas',
    arquivos: (razao.meses || []).map(m => m.arquivo).join(', ') || '—',
    cobertura: (razao.meses || []).length
      ? (razao.meses || []).map(m => fmt.mes(m.mes)).join(', ') : 'nenhum mês',
  });
  if ((razao.arquivosDiesel || []).length) {
    fontes.push({
      o_que: 'Litros de diesel',
      fonte: 'Consumo por centro de custo (SECE214), planilha',
      arquivos: razao.arquivosDiesel.map(a => a.arquivo).join(', '),
      cobertura: razao.arquivosDiesel
        .map(a => `${fmt.data(a.inicio)} a ${fmt.data(a.fim)}`).join('; '),
    });
  }
  tabela(porId('t-fontes'), {
    id: 'fontes', semOrdenacao: true,
    colunas: [
      { chave: 'o_que', rotulo: 'O que', texto: true, valor: x => x.o_que },
      { chave: 'fonte', rotulo: 'De onde vem', texto: true, valor: x => x.fonte },
      { chave: 'arquivos', rotulo: 'Arquivos', texto: true, valor: x => x.arquivos },
      { chave: 'cobertura', rotulo: 'Cobertura', texto: true, valor: x => x.cobertura },
    ],
    linhas: fontes,
  });

  tabela(porId('t-conferencia'), {
    id: 'conferencia', semOrdenacao: true,
    colunas: [
      { chave: 'mes', rotulo: 'Mês', valor: m => m.mes,
        fmt: (x, m) => fmt.mesLongo(x) + (m.parcial ? ' (parcial)' : '') },
      { chave: 'fonte', rotulo: 'Fonte', valor: m => m.fonte,
        classe: (x, m) => m.parcial ? 'neutro' : '' },
      { chave: 'arquivo', rotulo: 'Arquivo', texto: true, valor: m => m.arquivo },
      { chave: 'custoRealizado', rotulo: 'Total do rodapé', num: true,
        valor: m => m.custoRealizado, fmt: fmt.moeda },
      { chave: 'somaContas', rotulo: 'Soma das contas', num: true,
        valor: m => m.somaContas, fmt: x => x === null ? '—' : fmt.moeda(x) },
      { chave: 'conciliado', rotulo: 'Conciliação', valor: m => m.conciliado,
        fmt: x => x ? 'confere' : 'divergente',
        classe: x => 'marca-status ' + (x ? 'ok' : 'falha') },
      { chave: 'orcadoConferido', rotulo: 'Orçado conferido', num: true,
        valor: m => m.orcadoConferido, fmt: fmt.n0 },
      { chave: 'orcadoDivergente', rotulo: 'Orçado divergente', num: true,
        valor: m => m.orcadoDivergente, fmt: fmt.n0,
        classe: x => x ? 'neutro' : '' },
      { chave: 'receitaRealizada', rotulo: 'Receita', num: true,
        valor: m => m.receitaRealizada,
        fmt: x => x === null ? 'não lançada' : fmt.moeda(x),
        classe: x => x === null ? 'neutro' : '' },
    ],
    linhas: d.meses.slice().sort((a, b) => a.mes - b.mes),
    semDados: 'Nenhum PDF de Análise de Custos carregado.',
  });

  const ausentes = [];
  for (let m = 1; m <= 12; m++) if (!v.mesesComDados.includes(m)) ausentes.push(m);
  const partes = [`Gerado em ${d.geradoEm || '—'}`];
  if (ausentes.length) {
    partes.push('meses sem Análise de Custos: ' + ausentes.map(fmt.mesLongo).join(', '));
  }
  porId('rodape-texto').textContent = partes.join(' · ');
}

/* ==========================================================================
   controles
   ========================================================================== */
function preencherFiltros() {
  const d = estado.dados;

  const periodo = porId('f-periodo');
  const anterior = estado.filtros.periodo;
  periodo.innerHTML = '';
  const acum = document.createElement('option');
  acum.value = 'ytd';
  acum.textContent = 'Acumulado (meses com Análise de Custos)';
  periodo.appendChild(acum);
  d.meses.slice().sort((a, b) => a.mes - b.mes).forEach(m => {
    const op = document.createElement('option');
    op.value = String(m.mes);
    op.textContent = fmt.mesLongo(m.mes).replace(/^./, c => c.toUpperCase())
      + (m.parcial ? ' (parcial)' : '');
    periodo.appendChild(op);
  });
  periodo.value = [...periodo.options].some(o => o.value === anterior) ? anterior : 'ytd';
  estado.filtros.periodo = periodo.value;

  const grupo = porId('f-grupo');
  const grupoAnterior = estado.filtros.grupo;
  grupo.innerHTML = '<option value="">Todos os grupos</option>';
  d.grupos.filter(g => estado.filtros.pessoal || !g.pessoal).forEach(g => {
    const op = document.createElement('option');
    op.value = String(g.codigo);
    op.textContent = g.nome;
    grupo.appendChild(op);
  });
  grupo.value = [...grupo.options].some(o => o.value === grupoAnterior) ? grupoAnterior : '';
  estado.filtros.grupo = grupo.value;

  atualizarOpcoesConta();
}

function atualizarOpcoesConta() {
  const conta = porId('f-conta');
  const anterior = estado.filtros.conta;
  const grupoSel = estado.filtros.grupo;
  conta.innerHTML = '<option value="">Todas as contas</option>';
  estado.dados.contas
    .filter(c => !grupoSel || String(c.grupo) === grupoSel)
    .filter(c => estado.filtros.pessoal || !c.pessoal)
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

  porId('f-pessoal').addEventListener('change', e => {
    estado.filtros.pessoal = e.target.checked;
    preencherFiltros();
    renderizar();
  });

  porId('btn-limpar').addEventListener('click', () => {
    estado.filtros = { periodo: 'ytd', grupo: '', conta: '', busca: '', pessoal: false };
    estado.pagina = { lancamentos: 1 };
    porId('f-busca').value = '';
    porId('f-pessoal').checked = false;
    preencherFiltros();
    renderizar();
  });

  document.querySelectorAll('.aba').forEach(botao => {
    botao.addEventListener('click', () => trocarAba(botao.id.replace('aba-', '')));
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
    Relatorio.baixarExcel(construirVisao(), estado);
  });
  porId('btn-baixar-dados').addEventListener('click', () => Leitor.baixarDadosJs(estado.dados));
  porId('btn-limpar-enviados').addEventListener('click', () => {
    if (!confirm('Remover as planilhas de razão enviadas por este navegador?')) return;
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
  // no primeiro quadro o painel que apareceu pode não ter largura ainda
  G.redesenhar();
  requestAnimationFrame(() => G.redesenhar());
}

/* ----------------------------------------------------------- render */
function mostrarNotaDoRecorte(v) {
  const alvo = porId('nota-recorte');
  if (estado.filtros.pessoal) {
    alvo.hidden = false;
    alvo.textContent = 'Mostrando também as contas de pessoal e folha. '
      + 'Com elas, o custo do painel fecha com o total do relatório do ERP.';
    return;
  }
  alvo.hidden = false;
  alvo.textContent =
    'As contas de pessoal e folha estão escondidas — salário, FGTS, INSS, IRRF, '
    + 'férias, benefícios e encargos, '
    + `${fmt.moeda(v.pessoalNoFiltro)} no período filtrado. `
    + 'Marque "Mostrar pessoal" nos filtros para incluí-las. '
    + 'A aba Resultado usa sempre o custo cheio.';
}

/**
 * Aviso do mês parcial. Sem ele alguém compararia o custo de julho, que vem só
 * do razão, com os meses cheios e concluiria que o gasto caiu pela metade.
 */
function mostrarNotaDoParcial(v) {
  const alvo = porId('nota-parcial');
  if (!alvo) return;
  if (!v.mesesParciais.length) { alvo.hidden = true; return; }

  const nomes = v.mesesParciais.map(fmt.mesLongo).join(' e ');
  const selecionado = v.filtroTemParcial;
  alvo.hidden = false;
  alvo.className = 'nota nota-parcial' + (selecionado ? ' nota-parcial-ativa' : '');
  alvo.textContent = selecionado
    ? `Você está vendo ${nomes}, que ainda não tem Análise de Custos. `
      + 'O número vem do razão, que cobre cerca de metade do custo e mostra o óleo '
      + 'diesel como zero — em junho isso era R$ 1,04 mi invisível. Trate como '
      + 'parcial: serve para ver fornecedores e o que já foi lançado, não para '
      + 'comparar com o orçado nem para medir resultado.'
    : `${nomes} tem dados parciais (só o razão) e fica fora do acumulado, do `
      + 'desvio e do resultado. Selecione o mês no filtro para ver o que já existe.';
}

function renderizar() {
  const v = construirVisao();
  mostrarNotaDoRecorte(v);
  mostrarNotaDoParcial(v);

  const aviso = porId('aviso-filtro');
  const partes = [];
  if (estado.filtros.grupo) partes.push('grupo: ' + (v.nomeGrupo[estado.filtros.grupo] || ''));
  if (estado.filtros.conta) {
    const c = v.porCta[Number(estado.filtros.conta)];
    partes.push('conta: ' + (c ? c.nome : estado.filtros.conta));
  }
  if (estado.filtros.busca) partes.push('busca: “' + estado.filtros.busca + '”');
  if (partes.length) {
    aviso.hidden = false;
    aviso.textContent = 'Recorte ativo — ' + partes.join(' · ')
      + `. ${v.linhasConta.length} de ${estado.dados.contas.length} contas.`;
  } else {
    aviso.hidden = true;
  }

  renderResultado(v);
  renderOrcado(v);
  renderSetores(v);
  renderAgir(v);
  renderFrete(v);
  renderFornecedores(v);
  renderDados(v);
  G.redesenhar();
}

function recarregar() {
  estado.dados = Leitor.mesclar(estado.base);
  preencherFiltros();
  renderizar();
}

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
  porId('titulo').textContent = `Resultado e Orçamento — ${cc.nome}`;
  document.title = `Resultado e Orçamento — ${cc.nome} ${estado.base.ano}`;
  const n = estado.dados.meses.length;
  porId('subtitulo').textContent =
    `Centro de custo ${cc.codigo} · exercício ${estado.base.ano} · `
    + `${n} ${n === 1 ? 'mês' : 'meses'} de Análise de Custos`;

  ligarControles();
  preencherFiltros();
  Leitor.ligarUpload(recarregar);
  renderizar();
  trocarAba('resultado');
}

return { iniciar, estado, construirVisao, recarregar, renderizar, tabelaSimples };

})();

document.addEventListener('DOMContentLoaded', App.iniciar);
