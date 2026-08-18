/* ==========================================================================
   graficos.js — gráficos em SVG, sem dependência externa.

   Regras seguidas (método dataviz):
     · Um único eixo por gráfico. Nenhum gráfico tem segundo eixo y.
     · Categórico atribuído em ordem fixa (--serie-1..6), nunca ciclado.
     · Barra <= 24px, ponta arredondada 4px e quadrada na linha de base.
     · Linha 2px, marcador r>=4 com anel de 2px na cor da superfície.
     · Vão de 2px na cor da superfície separando marcas vizinhas.
     · Grade e eixos: hairline sólido, recessivos. Nunca tracejado.
     · Legenda sempre que houver 2+ séries; nenhuma quando houver 1.
     · Rótulo direto seletivo — nunca um número em cada ponto.
     · Texto usa tokens de tinta, nunca a cor da série.
     · Hover e foco por teclado mostram a mesma dica.
   ========================================================================== */
'use strict';

const G = (() => {

const SVG = 'http://www.w3.org/2000/svg';
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun',
               'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
                      'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const BARRA_MAX = 24;      // espessura máxima da barra
const VAO = 2;             // vão na cor da superfície entre marcas vizinhas
const RAIO_PONTA = 4;      // arredondamento só na ponta do dado

/* ----------------------------------------------------------- formatação */
const _n0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const _n1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const _n2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmt = {
  n0: v => _n0.format(v || 0),
  n1: v => _n1.format(v || 0),
  n2: v => _n2.format(v || 0),
  moeda: v => 'R$ ' + _n2.format(v || 0),
  /** R$ compacto para eixos e rótulos: 1.234.567 -> "1,2 mi" */
  curta(v) {
    const a = Math.abs(v || 0);
    const s = v < 0 ? '−' : '';
    if (a >= 1e9) return s + _n1.format(a / 1e9) + ' bi';
    if (a >= 1e6) return s + _n1.format(a / 1e6) + ' mi';
    if (a >= 1e3) return s + _n0.format(a / 1e3) + ' mil';
    return s + _n0.format(a);
  },
  pct(v, casas = 1) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    return (casas ? _n1.format(v) : _n0.format(v)) + '%';
  },
  litros: v => _n0.format(v || 0) + ' L',
  mes: m => MESES[m - 1] || String(m),
  mesLongo: m => MESES_LONGOS[m - 1] || String(m),
  data(iso) {
    if (!iso) return '—';
    const [a, m, d] = iso.split('-');
    return `${d}/${m}/${a}`;
  },
};

/* ----------------------------------------------------------- tokens de cor */
function token(nome) {
  return getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
}
const cor = {
  serie: i => token(`--serie-${((i % 6) + 6) % 6 + 1}`),
  superficie: () => token('--superficie'),
  // rampa divergente: frio (abaixo) -> neutro -> quente (acima)
  divergente: () => [
    token('--div-frio-forte'), token('--div-frio'), token('--div-frio-fraco'),
    token('--div-neutro'),
    token('--div-quente-fraco'), token('--div-quente'), token('--div-quente-forte'),
  ],
  frio: () => token('--div-frio'),
  quente: () => token('--div-quente'),
};

/* ----------------------------------------------------------- utilidades DOM */
function el(nome, atributos, pai) {
  const n = document.createElementNS(SVG, nome);
  for (const k in atributos) {
    if (atributos[k] !== null && atributos[k] !== undefined) {
      n.setAttribute(k, atributos[k]);
    }
  }
  if (pai) pai.appendChild(n);
  return n;
}

/** Texto sempre via textContent — rótulos vêm de planilha, são dado não confiável. */
function texto(pai, x, y, conteudo, classe, extras) {
  const t = el('text', Object.assign({ x, y, class: classe || 'g-tick' }, extras || {}), pai);
  t.textContent = conteudo;
  return t;
}

function limpar(alvo) {
  while (alvo.firstChild) alvo.removeChild(alvo.firstChild);
}

/** Corta o texto para caber em `max` px (estimativa por largura média do glifo). */
function encurtar(s, max, px = 11) {
  const larguraMedia = px * 0.55;
  const cabe = Math.max(3, Math.floor(max / larguraMedia));
  s = String(s == null ? '' : s);
  return s.length <= cabe ? s : s.slice(0, cabe - 1) + '…';
}

function larguraTexto(s, px = 11) {
  return String(s == null ? '' : s).length * px * 0.55;
}

/* ----------------------------------------------------------- escalas */
function escalaLinear(dominio, alcance) {
  const [d0, d1] = dominio;
  const [r0, r1] = alcance;
  const vao = (d1 - d0) || 1;
  const f = v => r0 + ((v - d0) / vao) * (r1 - r0);
  f.dominio = dominio;
  f.alcance = alcance;
  return f;
}

/** Marcas de eixo em números redondos (1 / 2 / 5 × 10^k). */
function marcasRedondas(min, max, alvo = 5) {
  if (!isFinite(min) || !isFinite(max) || min === max) {
    return { min: 0, max: max || 1, marcas: [0, max || 1] };
  }
  const bruto = (max - min) / alvo;
  const mag = Math.pow(10, Math.floor(Math.log10(bruto)));
  const norm = bruto / mag;
  const passo = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const p0 = Math.floor(min / passo) * passo;
  const p1 = Math.ceil(max / passo) * passo;
  const marcas = [];
  for (let v = p0; v <= p1 + passo * 1e-9; v += passo) {
    marcas.push(Math.abs(v) < passo * 1e-9 ? 0 : v);
  }
  return { min: p0, max: p1, marcas };
}

/* ----------------------------------------------------------- caminho de barra */
/**
 * Barra com ponta arredondada no lado do dado e quadrada na linha de base.
 * `lado`: 'cima' | 'baixo' | 'direita' | 'esquerda' — onde fica a ponta do dado.
 */
function caminhoBarra(x, y, largura, altura, lado, raio = RAIO_PONTA) {
  const w = Math.max(0, largura);
  const h = Math.max(0, altura);
  const r = Math.max(0, Math.min(raio, (lado === 'cima' || lado === 'baixo') ? w / 2 : h / 2,
                                 (lado === 'cima' || lado === 'baixo') ? h : w));
  if (r <= 0.5) return `M${x},${y}h${w}v${h}h${-w}Z`;
  switch (lado) {
    case 'cima':
      return `M${x},${y + h}V${y + r}a${r},${r} 0 0 1 ${r},${-r}h${w - 2 * r}`
           + `a${r},${r} 0 0 1 ${r},${r}V${y + h}Z`;
    case 'baixo':
      return `M${x},${y}V${y + h - r}a${r},${r} 0 0 0 ${r},${r}h${w - 2 * r}`
           + `a${r},${r} 0 0 0 ${r},${-r}V${y}Z`;
    case 'direita':
      return `M${x},${y}h${w - r}a${r},${r} 0 0 1 ${r},${r}v${h - 2 * r}`
           + `a${r},${r} 0 0 1 ${-r},${r}H${x}Z`;
    default: // esquerda
      return `M${x + w},${y}H${x + r}a${r},${r} 0 0 0 ${-r},${r}v${h - 2 * r}`
           + `a${r},${r} 0 0 0 ${r},${r}H${x + w}Z`;
  }
}

/* ----------------------------------------------------------- dica (tooltip) */
const dica = {
  no: null,
  garantir() {
    if (!this.no) this.no = document.getElementById('dica');
    return this.no;
  },
  mostrar(evento, conteudo) {
    const n = this.garantir();
    if (!n) return;
    limpar(n);
    if (conteudo.titulo) {
      const t = document.createElement('div');
      t.className = 'dica-titulo';
      t.textContent = conteudo.titulo;
      n.appendChild(t);
    }
    (conteudo.linhas || []).forEach(linha => {
      const l = document.createElement('div');
      l.className = 'dica-linha';
      if (linha.cor) {
        const chave = document.createElement('span');
        chave.className = 'dica-chave';
        chave.style.background = linha.cor;
        l.appendChild(chave);
      }
      const v = document.createElement('span');
      v.className = 'dica-valor';
      v.textContent = linha.valor;
      l.appendChild(v);
      if (linha.serie) {
        const s = document.createElement('span');
        s.className = 'dica-serie';
        s.textContent = linha.serie;
        l.appendChild(s);
      }
      n.appendChild(l);
    });
    (conteudo.notas || []).forEach(nota => {
      const p = document.createElement('div');
      p.className = 'dica-nota';
      p.textContent = nota;
      n.appendChild(p);
    });
    n.classList.add('visivel');
    n.setAttribute('aria-hidden', 'false');
    this.posicionar(evento);
  },
  posicionar(evento) {
    const n = this.garantir();
    if (!n) return;
    let x, y;
    if (evento && evento.clientX !== undefined && evento.clientX !== 0) {
      x = evento.clientX + 14;
      y = evento.clientY + 14;
    } else if (evento && evento.target && evento.target.getBoundingClientRect) {
      const r = evento.target.getBoundingClientRect();
      x = r.right + 8;
      y = r.top;
    } else {
      return;
    }
    const c = n.getBoundingClientRect();
    if (x + c.width > innerWidth - 8) x = Math.max(8, x - c.width - 28);
    if (y + c.height > innerHeight - 8) y = Math.max(8, innerHeight - c.height - 8);
    n.style.left = x + 'px';
    n.style.top = y + 'px';
  },
  esconder() {
    const n = this.garantir();
    if (!n) return;
    n.classList.remove('visivel');
    n.setAttribute('aria-hidden', 'true');
  },
};

/**
 * Torna uma marca alvo de hover e de foco por teclado com a mesma dica.
 * A área de acerto é maior que a marca pintada (inclui o vão de 2px).
 */
function ligarDica(grupo, conteudo, rotuloAcessivel) {
  grupo.classList.add('g-alvo');
  grupo.setAttribute('tabindex', '0');
  grupo.setAttribute('role', 'img');
  if (rotuloAcessivel) grupo.setAttribute('aria-label', rotuloAcessivel);
  const abrir = e => dica.mostrar(e, conteudo);
  grupo.addEventListener('pointerenter', abrir);
  grupo.addEventListener('pointermove', e => dica.posicionar(e));
  grupo.addEventListener('pointerleave', () => dica.esconder());
  grupo.addEventListener('focus', abrir);
  grupo.addEventListener('blur', () => dica.esconder());
}

/* ----------------------------------------------------------- moldura */
function moldura(alvo, altura, margem) {
  limpar(alvo);
  const largura = Math.max(280, alvo.clientWidth || 560);
  const svg = el('svg', {
    width: largura, height: altura,
    viewBox: `0 0 ${largura} ${altura}`,
    role: 'img',
  }, alvo);
  const m = Object.assign({ cima: 16, direita: 16, baixo: 30, esquerda: 52 }, margem || {});
  return {
    svg, largura, altura, m,
    l: largura - m.esquerda - m.direita,     // largura da área de plotagem
    a: altura - m.cima - m.baixo,            // altura da área de plotagem
  };
}

/** Hachura 45° para "mês sem planilha carregada" — nunca decorativa. */
function defHachura(svg, id) {
  const defs = el('defs', {}, svg);
  const p = el('pattern', {
    id, width: 6, height: 6, patternUnits: 'userSpaceOnUse',
    patternTransform: 'rotate(45)',
  }, defs);
  el('rect', { width: 6, height: 6, fill: 'transparent' }, p);
  el('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: token('--eixo'), 'stroke-width': 1.5 }, p);
  return `url(#${id})`;
}

let contadorId = 0;
const novoId = prefixo => `${prefixo}-${++contadorId}`;

const ROTULO_SEM_DADOS = 'sem dados';

/**
 * Escreve "sem dados" sob a faixa hachurada — mas só se couber com folga.
 * Com seis meses vazios num cartão estreito os rótulos se sobrepõem; nesse caso
 * a hachura, a legenda e a dica já dizem o mesmo, sem sujar o gráfico.
 */
function rotularSemDados(pai, x, y, larguraDisponivel) {
  if (larguraTexto(ROTULO_SEM_DADOS, 10.5) + 4 > larguraDisponivel) return;
  texto(pai, x, y, ROTULO_SEM_DADOS, 'g-tick', { 'text-anchor': 'middle' });
}

/* ----------------------------------------------------------- grade e eixos */
function eixoY(q, escala, marcas, formatar) {
  const g = el('g', {}, q.svg);
  marcas.forEach(v => {
    const y = escala(v);
    el('line', {
      x1: q.m.esquerda, y1: y, x2: q.m.esquerda + q.l, y2: y,
      class: v === 0 ? 'g-eixo' : 'g-grade',
    }, g);
    texto(g, q.m.esquerda - 8, y + 3.5, formatar(v), 'g-tick', { 'text-anchor': 'end' });
  });
  return g;
}

/**
 * Rótulos do eixo x, desbastados para não colidirem.
 * Com 164 dias em 560px não cabe um rótulo por categoria: rotulamos de N em N,
 * sempre incluindo o último. O valor de cada barra continua na dica e na tabela.
 */
function eixoXCategorias(q, categorias, posicao, classe) {
  const g = el('g', {}, q.svg);
  const base = q.m.cima + q.a;
  el('line', {
    x1: q.m.esquerda, y1: base, x2: q.m.esquerda + q.l, y2: base, class: 'g-eixo',
  }, g);

  const larguraMaxima = Math.max(...categorias.map(c => larguraTexto(c, 10.5)));
  const porRotulo = larguraMaxima + 10;              // rótulo + respiro
  const cabem = Math.max(1, Math.floor(q.l / porRotulo));
  const passo = Math.max(1, Math.ceil(categorias.length / cabem));

  categorias.forEach((c, i) => {
    // desenha de `passo` em `passo`, contando de trás para frente para o
    // último rótulo (o mais informativo) nunca cair fora
    if (passo > 1 && (categorias.length - 1 - i) % passo !== 0) return;
    texto(g, posicao(i), base + 16, c, classe || 'g-tick', { 'text-anchor': 'middle' });
  });
  return g;
}

/* ----------------------------------------------------------- legenda */
function legenda(alvo, itens) {
  const div = document.createElement('div');
  div.className = 'g-legenda';
  itens.forEach(item => {
    const s = document.createElement('span');
    s.className = 'g-legenda-item';
    const marca = document.createElement('span');
    marca.className = 'g-legenda-marca' + (item.forma === 'linha' ? ' linha' : '')
                    + (item.forma === 'hachura' ? ' hachura' : '');
    if (item.cor) marca.style.background = item.cor;
    s.appendChild(marca);
    const rot = document.createElement('span');
    rot.textContent = item.rotulo;
    s.appendChild(rot);
    div.appendChild(s);
  });
  alvo.appendChild(div);
  return div;
}

function vazio(alvo, mensagem) {
  limpar(alvo);
  const d = document.createElement('div');
  d.className = 'g-vazio';
  d.textContent = mensagem;
  alvo.appendChild(d);
}

/* ==========================================================================
   1. Colunas agrupadas — Orçado × Realizado por mês
   Duas séries, eixo único em R$. Mês sem planilha vem hachurado e rotulado.
   ========================================================================== */
function colunasAgrupadas(alvo, cfg) {
  const { categorias, series, semDados = [], formatarValor = fmt.curta,
          formatarDica = fmt.moeda, altura = 300 } = cfg;
  if (!categorias.length) return vazio(alvo, 'Sem dados no período filtrado.');

  const q = moldura(alvo, altura, { esquerda: 58, baixo: 44, cima: 14 });
  const hachura = defHachura(q.svg, novoId('hachura'));

  const maximo = Math.max(0, ...series.flatMap(s => s.valores.map(v => v || 0)));
  const { min, max, marcas } = marcasRedondas(0, maximo || 1, 5);
  const y = escalaLinear([min, max], [q.m.cima + q.a, q.m.cima]);
  eixoY(q, y, marcas, formatarValor);

  const faixa = q.l / categorias.length;
  const centro = i => q.m.esquerda + faixa * (i + 0.5);
  const nSeries = series.length;
  const larguraGrupo = Math.min(faixa * 0.72, BARRA_MAX * nSeries + VAO * (nSeries - 1));
  const larguraBarra = Math.max(3, (larguraGrupo - VAO * (nSeries - 1)) / nSeries);
  const base = q.m.cima + q.a;

  const camada = el('g', {}, q.svg);
  categorias.forEach((rotulo, i) => {
    const x0 = centro(i) - larguraGrupo / 2;

    if (semDados[i]) {
      // Faixa hachurada ocupando o slot: comunica "sem planilha", não zero.
      const g = el('g', {}, camada);
      el('rect', {
        x: x0, y: q.m.cima, width: larguraGrupo, height: q.a,
        fill: hachura, class: 'g-marca',
      }, g);
      rotularSemDados(g, centro(i), base + 30, faixa);
      ligarDica(g, {
        titulo: cfg.tituloDica ? cfg.tituloDica(i) : rotulo,
        linhas: series.map(s => ({
          cor: s.cor, serie: s.nome,
          valor: s.semDadosValor ? formatarDica(s.valores[i] || 0) : '—',
        })),
        notas: ['Planilha deste mês não carregada.'],
      }, `${rotulo}: sem dados`);
      return;
    }

    series.forEach((s, j) => {
      const v = s.valores[i] || 0;
      const x = x0 + j * (larguraBarra + VAO);
      const h = Math.abs(y(v) - y(0));
      const g = el('g', {}, camada);
      el('path', {
        d: caminhoBarra(x, y(Math.max(v, 0)), larguraBarra, h, 'cima'),
        fill: s.cor, class: 'g-marca',
      }, g);
      // área de acerto maior que a marca pintada
      el('rect', {
        x: x - VAO, y: q.m.cima, width: larguraBarra + VAO * 2, height: q.a,
        fill: 'transparent',
      }, g);
      ligarDica(g, {
        titulo: cfg.tituloDica ? cfg.tituloDica(i) : rotulo,
        linhas: series.map(s2 => ({
          cor: s2.cor, serie: s2.nome, valor: formatarDica(s2.valores[i] || 0),
        })),
        notas: cfg.notasDica ? cfg.notasDica(i) : null,
      }, `${rotulo}, ${s.nome}: ${formatarDica(v)}`);
    });
  });

  eixoXCategorias(q, categorias, centro);

  const itens = series.map(s => ({ cor: s.cor, rotulo: s.nome }));
  if (semDados.some(Boolean)) itens.push({ forma: 'hachura', rotulo: 'Sem planilha carregada' });
  legenda(alvo, itens);
}

/* ==========================================================================
   2. Linhas — execução acumulada (com trecho de projeção pontilhado)
   ========================================================================== */
function linhas(alvo, cfg) {
  const { categorias, series, formatarValor = fmt.curta,
          formatarDica = fmt.moeda, altura = 300 } = cfg;
  if (!categorias.length) return vazio(alvo, 'Sem dados no período filtrado.');

  const q = moldura(alvo, altura, { esquerda: 58, baixo: 34, cima: 16, direita: 20 });
  const todos = series.flatMap(s => s.valores.filter(v => v !== null && v !== undefined));
  const { min, max, marcas } = marcasRedondas(0, Math.max(1, ...todos), 5);
  const y = escalaLinear([min, max], [q.m.cima + q.a, q.m.cima]);
  eixoY(q, y, marcas, formatarValor);

  const passo = categorias.length > 1 ? q.l / (categorias.length - 1) : 0;
  const x = i => q.m.esquerda + passo * i;
  const superficie = cor.superficie();

  series.forEach(s => {
    // trechos contínuos (ignora buracos) — nunca liga por cima de um vazio
    const trechos = [];
    let atual = [];
    s.valores.forEach((v, i) => {
      if (v === null || v === undefined) { if (atual.length) trechos.push(atual); atual = []; }
      else atual.push([x(i), y(v), i]);
    });
    if (atual.length) trechos.push(atual);

    trechos.forEach(pontos => {
      if (pontos.length === 1) {
        el('circle', {
          cx: pontos[0][0], cy: pontos[0][1], r: 4, fill: s.cor,
          stroke: superficie, 'stroke-width': 2,
        }, q.svg);
        return;
      }
      el('path', {
        d: 'M' + pontos.map(p => `${p[0]},${p[1]}`).join('L'),
        fill: 'none', stroke: s.cor, 'stroke-width': 2,
        'stroke-linejoin': 'round', 'stroke-linecap': 'round',
        'stroke-dasharray': s.tracejada ? '5 4' : null,
      }, q.svg);
    });

    // marcador no último ponto real + rótulo direto (seletivo: só a ponta)
    const ultimo = [...s.valores].reverse().findIndex(v => v !== null && v !== undefined);
    if (ultimo >= 0 && !s.semMarcador) {
      const i = s.valores.length - 1 - ultimo;
      el('circle', {
        cx: x(i), cy: y(s.valores[i]), r: 4.5, fill: s.cor,
        stroke: superficie, 'stroke-width': 2,
      }, q.svg);
    }
  });

  // uma área de acerto por categoria: a dica lista todas as séries naquele x
  categorias.forEach((rotulo, i) => {
    const g = el('g', {}, q.svg);
    el('rect', {
      x: x(i) - Math.max(12, passo / 2), y: q.m.cima,
      width: Math.max(24, passo), height: q.a, fill: 'transparent',
    }, g);
    el('line', {
      x1: x(i), y1: q.m.cima, x2: x(i), y2: q.m.cima + q.a,
      class: 'g-grade', opacity: 0,
    }, g);
    const linhasDica = series
      .filter(s => s.valores[i] !== null && s.valores[i] !== undefined)
      .map(s => ({ cor: s.cor, serie: s.nome, valor: formatarDica(s.valores[i]) }));
    if (!linhasDica.length) return;
    g.addEventListener('pointerenter', () => { g.querySelector('line').setAttribute('opacity', 1); });
    g.addEventListener('pointerleave', () => { g.querySelector('line').setAttribute('opacity', 0); });
    ligarDica(g, { titulo: cfg.tituloDica ? cfg.tituloDica(i) : rotulo, linhas: linhasDica },
         `${rotulo}: ` + linhasDica.map(l => `${l.serie} ${l.valor}`).join(', '));
  });

  eixoXCategorias(q, categorias, x);
  if (series.length > 1) {
    legenda(alvo, series.map(s => ({
      cor: s.cor, forma: 'linha', rotulo: s.nome + (s.tracejada ? ' (projeção)' : ''),
    })));
  }
}

/* ==========================================================================
   3. Colunas simples — % de execução por mês, com linha de meta em 100%
   Uma série, sem legenda: o título já diz o que está plotado.
   ========================================================================== */
function colunas(alvo, cfg) {
  const { categorias, valores, cor: corBarra, meta = null, semDados = [],
          formatarValor = fmt.n0, formatarDica = v => fmt.pct(v),
          rotularTodas = false, altura = 260 } = cfg;
  if (!categorias.length) return vazio(alvo, 'Sem dados no período filtrado.');

  const q = moldura(alvo, altura, { esquerda: 52, baixo: 44, cima: 18 });
  const hachura = defHachura(q.svg, novoId('hachura'));

  const validos = valores.filter(v => v !== null && v !== undefined && isFinite(v));
  const topo = Math.max(meta || 0, ...(validos.length ? validos : [1]));
  const { min, max, marcas } = marcasRedondas(0, topo || 1, 5);
  const y = escalaLinear([min, max], [q.m.cima + q.a, q.m.cima]);
  eixoY(q, y, marcas, formatarValor);

  const faixa = q.l / categorias.length;
  const centro = i => q.m.esquerda + faixa * (i + 0.5);
  const largura = Math.min(faixa - VAO * 2, BARRA_MAX);
  const base = q.m.cima + q.a;
  const corFinal = corBarra || cor.serie(0);

  // maior valor recebe rótulo direto; os demais ficam no eixo e na dica
  const iMaior = valores.reduce((melhor, v, i) =>
    (v !== null && v !== undefined && (melhor < 0 || v > valores[melhor])) ? i : melhor, -1);

  categorias.forEach((rotulo, i) => {
    const g = el('g', {}, q.svg);
    const v = valores[i];
    const x = centro(i) - largura / 2;

    if (semDados[i] || v === null || v === undefined || !isFinite(v)) {
      el('rect', {
        x, y: q.m.cima, width: largura, height: q.a, fill: hachura, class: 'g-marca',
      }, g);
      rotularSemDados(g, centro(i), base + 30, faixa);
      ligarDica(g, { titulo: cfg.tituloDica ? cfg.tituloDica(i) : rotulo,
                linhas: [{ valor: '—', serie: cfg.nomeSerie || '' }],
                notas: ['Planilha deste mês não carregada.'] },
           `${rotulo}: sem dados`);
      return;
    }

    const h = Math.abs(y(v) - y(0));
    el('path', {
      d: caminhoBarra(x, y(Math.max(v, 0)), largura, h, v < 0 ? 'baixo' : 'cima'),
      fill: corFinal, class: 'g-marca',
    }, g);
    el('rect', {
      x: x - VAO, y: q.m.cima, width: largura + VAO * 2, height: q.a, fill: 'transparent',
    }, g);
    if (rotularTodas || i === iMaior) {
      texto(g, centro(i), y(v) - 6, formatarDica(v), 'g-valor', { 'text-anchor': 'middle' });
    }
    ligarDica(g, {
      titulo: cfg.tituloDica ? cfg.tituloDica(i) : rotulo,
      linhas: [{ cor: corFinal, serie: cfg.nomeSerie || '', valor: formatarDica(v) }],
      notas: cfg.notasDica ? cfg.notasDica(i) : null,
    }, `${rotulo}: ${formatarDica(v)}`);
  });

  if (meta !== null && meta >= min && meta <= max) {
    el('line', {
      x1: q.m.esquerda, y1: y(meta), x2: q.m.esquerda + q.l, y2: y(meta), class: 'g-meta',
    }, q.svg);
    texto(q.svg, q.m.esquerda + q.l, y(meta) - 5, cfg.rotuloMeta || 'meta',
          'g-tick-forte', { 'text-anchor': 'end' });
  }

  eixoXCategorias(q, categorias, centro);
  if (semDados.some(Boolean) || valores.some(v => v === null || v === undefined)) {
    legenda(alvo, [{ forma: 'hachura', rotulo: 'Sem planilha carregada' }]);
  }
}

/* ==========================================================================
   4. Barras divergentes horizontais — desvio (realizado − orçado)
   Polaridade: frio à esquerda (abaixo do orçado), quente à direita (acima).
   ========================================================================== */
function barrasDivergentes(alvo, cfg) {
  const { itens, formatarValor = fmt.curta, formatarDica = fmt.moeda } = cfg;
  if (!itens.length) return vazio(alvo, 'Sem dados no período filtrado.');

  const larguraRotulo = cfg.larguraRotulo || 150;
  const alturaLinha = 30;
  const altura = itens.length * alturaLinha + 56;
  const q = moldura(alvo, altura, {
    esquerda: larguraRotulo + 10, direita: 74, cima: 12, baixo: 32,
  });

  const extremo = Math.max(1, ...itens.map(i => Math.abs(i.valor)));
  const { min, max, marcas } = marcasRedondas(-extremo, extremo, 4);
  const x = escalaLinear([min, max], [q.m.esquerda, q.m.esquerda + q.l]);
  const zero = x(0);

  // grade vertical + eixo zero
  marcas.forEach(v => {
    el('line', {
      x1: x(v), y1: q.m.cima, x2: x(v), y2: q.m.cima + q.a,
      class: v === 0 ? 'g-eixo' : 'g-grade',
    }, q.svg);
    texto(q.svg, x(v), q.m.cima + q.a + 16, formatarValor(v), 'g-tick',
          { 'text-anchor': 'middle' });
  });

  const espessura = Math.min(BARRA_MAX, alturaLinha - 10);
  const frio = cor.frio();
  const quente = cor.quente();

  itens.forEach((item, i) => {
    const yc = q.m.cima + alturaLinha * i + alturaLinha / 2;
    const acima = item.valor > 0;
    const largura = Math.abs(x(item.valor) - zero);
    const g = el('g', {}, q.svg);

    texto(g, q.m.esquerda - 10, yc + 3.5, encurtar(item.rotulo, larguraRotulo - 4),
          'g-rotulo', { 'text-anchor': 'end' });

    if (largura >= 0.5) {
      el('path', {
        d: caminhoBarra(acima ? zero : zero - largura, yc - espessura / 2,
                        largura, espessura, acima ? 'direita' : 'esquerda'),
        fill: acima ? quente : frio, class: 'g-marca',
      }, g);
    }
    // valor no fim da barra, sempre fora da marca
    texto(g, acima ? zero + largura + 7 : zero - largura - 7, yc + 3.5,
          formatarValor(item.valor), 'g-valor',
          { 'text-anchor': acima ? 'start' : 'end' });

    el('rect', {
      x: q.m.esquerda - larguraRotulo, y: yc - alturaLinha / 2,
      width: larguraRotulo + q.l, height: alturaLinha, fill: 'transparent',
    }, g);
    ligarDica(g, {
      titulo: item.rotulo,
      linhas: [
        { cor: acima ? quente : frio, serie: 'Desvio', valor: formatarDica(item.valor) },
        ...(item.linhasExtra || []),
      ],
      notas: [acima ? 'Acima do orçado no período.' : 'Abaixo do orçado no período.'],
    }, `${item.rotulo}: desvio ${formatarDica(item.valor)}`);
  });

  legenda(alvo, [
    { cor: frio, rotulo: 'Abaixo do orçado' },
    { cor: quente, rotulo: 'Acima do orçado' },
  ]);
}

/* ==========================================================================
   5. Barras horizontais agrupadas — top contas (realizado × orçado)
      e simples — top fornecedores (uma série, sem legenda).
   ========================================================================== */
function barrasHorizontais(alvo, cfg) {
  const { itens, series, formatarValor = fmt.curta, formatarDica = fmt.moeda } = cfg;
  if (!itens.length) return vazio(alvo, 'Sem dados no período filtrado.');

  const larguraRotulo = cfg.larguraRotulo || 170;
  const nSeries = series.length;
  const alturaLinha = nSeries > 1 ? 34 : 26;
  const altura = itens.length * alturaLinha + 52;
  const q = moldura(alvo, altura, {
    esquerda: larguraRotulo + 10, direita: 76, cima: 10, baixo: 30,
  });

  const maximo = Math.max(1, ...itens.flatMap(it => series.map(s => s.valor(it) || 0)));
  const { min, max, marcas } = marcasRedondas(0, maximo, 4);
  const x = escalaLinear([min, max], [q.m.esquerda, q.m.esquerda + q.l]);

  marcas.forEach(v => {
    el('line', {
      x1: x(v), y1: q.m.cima, x2: x(v), y2: q.m.cima + q.a,
      class: v === 0 ? 'g-eixo' : 'g-grade',
    }, q.svg);
    texto(q.svg, x(v), q.m.cima + q.a + 16, formatarValor(v), 'g-tick',
          { 'text-anchor': 'middle' });
  });

  const espessura = Math.min(BARRA_MAX, (alturaLinha - 10 - VAO * (nSeries - 1)) / nSeries);

  itens.forEach((item, i) => {
    const yTopo = q.m.cima + alturaLinha * i;
    const yc = yTopo + alturaLinha / 2;
    const g = el('g', {}, q.svg);

    texto(g, q.m.esquerda - 10, yc + 3.5, encurtar(item.rotulo, larguraRotulo - 4),
          'g-rotulo', { 'text-anchor': 'end' });

    const alturaBloco = espessura * nSeries + VAO * (nSeries - 1);
    series.forEach((s, j) => {
      const v = s.valor(item) || 0;
      const largura = Math.abs(x(Math.max(v, 0)) - x(0));
      const yb = yc - alturaBloco / 2 + j * (espessura + VAO);
      if (largura >= 0.5) {
        el('path', {
          d: caminhoBarra(x(0), yb, largura, espessura, 'direita'),
          fill: s.cor, class: 'g-marca',
        }, g);
      }
      // rótulo direto só na série principal, sempre fora da barra
      if (j === 0) {
        texto(g, x(0) + largura + 7, yb + espessura / 2 + 3.5, formatarValor(v),
              'g-valor', { 'text-anchor': 'start' });
      }
    });

    el('rect', {
      x: q.m.esquerda - larguraRotulo, y: yTopo,
      width: larguraRotulo + q.l, height: alturaLinha, fill: 'transparent',
    }, g);
    ligarDica(g, {
      titulo: item.rotulo,
      linhas: series.map(s => ({
        cor: s.cor, serie: s.nome, valor: formatarDica(s.valor(item) || 0),
      })).concat(item.linhasExtra || []),
      notas: item.notas,
    }, `${item.rotulo}: ` + series.map(s => `${s.nome} ${formatarDica(s.valor(item) || 0)}`).join(', '));
  });

  if (nSeries > 1) legenda(alvo, series.map(s => ({ cor: s.cor, rotulo: s.nome })));
}

/* ==========================================================================
   6. Pareto — participação e acumulado, ambos em % no MESMO eixo.
   (Barras em R$ com linha em % seria eixo duplo; por isso as barras também
   são percentuais.)
   ========================================================================== */
function pareto(alvo, cfg) {
  const { itens, altura = 300 } = cfg;      // itens: {rotulo, valor}
  if (!itens.length) return vazio(alvo, 'Sem dados no período filtrado.');

  const total = itens.reduce((s, i) => s + i.valor, 0);
  if (total <= 0) return vazio(alvo, 'Sem valores positivos no período filtrado.');

  // `cima` maior que o padrão: o acumulado termina em 100% e o rótulo do
  // ponto final fica acima dele; com 16 ele passava do topo do svg.
  const q = moldura(alvo, altura, { esquerda: 46, baixo: 40, cima: 28, direita: 22 });
  const { min, max, marcas } = marcasRedondas(0, 100, 5);
  const y = escalaLinear([min, max], [q.m.cima + q.a, q.m.cima]);
  eixoY(q, y, marcas, v => fmt.n0(v) + '%');

  const faixa = q.l / itens.length;
  const centro = i => q.m.esquerda + faixa * (i + 0.5);
  const largura = Math.min(faixa - VAO * 2, BARRA_MAX);
  const corBarra = cor.serie(0);
  const corLinha = cor.serie(1);
  const superficie = cor.superficie();

  let acumulado = 0;
  const pontos = [];
  const dados = itens.map((item, i) => {
    const parte = (item.valor / total) * 100;
    acumulado += parte;
    pontos.push([centro(i), y(acumulado)]);
    return { item, parte, acumulado };
  });

  dados.forEach((d, i) => {
    const g = el('g', {}, q.svg);
    const h = Math.abs(y(d.parte) - y(0));
    el('path', {
      d: caminhoBarra(centro(i) - largura / 2, y(d.parte), largura, h, 'cima'),
      fill: corBarra, class: 'g-marca',
    }, g);
    el('rect', {
      x: centro(i) - faixa / 2, y: q.m.cima, width: faixa, height: q.a, fill: 'transparent',
    }, g);
    ligarDica(g, {
      titulo: d.item.rotulo,
      linhas: [
        { cor: corBarra, serie: 'Participação', valor: fmt.pct(d.parte) },
        { cor: corLinha, serie: 'Acumulado', valor: fmt.pct(d.acumulado) },
        { serie: 'Valor', valor: fmt.moeda(d.item.valor) },
      ],
      notas: [`${i + 1}ª maior do período`],
    }, `${d.item.rotulo}: ${fmt.pct(d.parte)} do total, acumulado ${fmt.pct(d.acumulado)}`);
  });

  el('path', {
    d: 'M' + pontos.map(p => `${p[0]},${p[1]}`).join('L'),
    fill: 'none', stroke: corLinha, 'stroke-width': 2,
    'stroke-linejoin': 'round', 'stroke-linecap': 'round',
  }, q.svg);
  const ultimo = pontos[pontos.length - 1];
  el('circle', {
    cx: ultimo[0], cy: ultimo[1], r: 4.5, fill: corLinha,
    stroke: superficie, 'stroke-width': 2,
  }, q.svg);
  texto(q.svg, ultimo[0] - 6, ultimo[1] - 9, fmt.pct(acumulado), 'g-valor',
        { 'text-anchor': 'end' });

  // Eixo x pela POSIÇÃO no ranking, não pelo nome.
  // Vinte nomes de conta na diagonal ficam truncados, ilegíveis e transbordam o
  // cartão; o nome de cada barra está na dica e em "Ver como tabela".
  const gx = el('g', {}, q.svg);
  const base = q.m.cima + q.a;
  el('line', { x1: q.m.esquerda, y1: base, x2: q.m.esquerda + q.l, y2: base, class: 'g-eixo' }, gx);
  const passoRotulo = Math.max(1, Math.ceil(itens.length / Math.max(1, Math.floor(q.l / 26))));
  itens.forEach((item, i) => {
    if (i !== 0 && i !== itens.length - 1 && (i + 1) % passoRotulo !== 0) return;
    texto(gx, centro(i), base + 16, String(i + 1), 'g-tick', { 'text-anchor': 'middle' });
  });
  texto(gx, q.m.esquerda + q.l / 2, base + 33,
        cfg.rotuloEixo || 'posição no ranking (maior para menor)',
        'g-titulo-eixo', { 'text-anchor': 'middle' });

  legenda(alvo, [
    { cor: corBarra, rotulo: 'Participação no total (%)' },
    { cor: corLinha, forma: 'linha', rotulo: 'Acumulado (%)' },
  ]);
}

/* ==========================================================================
   7. Rosca — composição (parte-do-todo, no máximo 6 fatias + "Outros")
   ========================================================================== */
function rosca(alvo, cfg) {
  const { itens, formatarDica = fmt.moeda, altura = 280, maxFatias = 6 } = cfg;
  const positivos = itens.filter(i => i.valor > 0).sort((a, b) => b.valor - a.valor);
  if (!positivos.length) return vazio(alvo, 'Sem valores positivos no período filtrado.');

  // Nunca gerar cor além dos slots: o excedente vira "Outros".
  let fatias = positivos;
  if (positivos.length > maxFatias) {
    const cabeca = positivos.slice(0, maxFatias - 1);
    const resto = positivos.slice(maxFatias - 1);
    fatias = cabeca.concat([{
      rotulo: `Outros (${resto.length})`,
      valor: resto.reduce((s, i) => s + i.valor, 0),
      detalhe: resto.map(r => r.rotulo).join(', '),
    }]);
  }

  const total = fatias.reduce((s, i) => s + i.valor, 0);
  limpar(alvo);
  const largura = Math.max(280, alvo.clientWidth || 460);
  const svg = el('svg', {
    width: largura, height: altura, viewBox: `0 0 ${largura} ${altura}`, role: 'img',
  }, alvo);

  const raio = Math.min(altura / 2 - 12, 100);
  const espessura = Math.max(20, raio * 0.4);
  const cx = Math.min(raio + 16, largura / 3);
  const cy = altura / 2;
  const superficie = cor.superficie();

  let angulo = -Math.PI / 2;
  const ponto = (a, r) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];

  fatias.forEach((fatia, i) => {
    const fracao = fatia.valor / total;
    const varredura = fracao * Math.PI * 2;
    const a0 = angulo;
    const a1 = angulo + varredura;
    angulo = a1;

    const rExterno = raio;
    const rInterno = raio - espessura;
    const [x0, y0] = ponto(a0, rExterno);
    const [x1, y1] = ponto(a1, rExterno);
    const [x2, y2] = ponto(a1, rInterno);
    const [x3, y3] = ponto(a0, rInterno);
    const grande = varredura > Math.PI ? 1 : 0;

    const g = el('g', {}, svg);
    el('path', {
      d: `M${x0},${y0}A${rExterno},${rExterno} 0 ${grande} 1 ${x1},${y1}`
       + `L${x2},${y2}A${rInterno},${rInterno} 0 ${grande} 0 ${x3},${y3}Z`,
      fill: cor.serie(i),
      // vão de 2px na cor da superfície separando fatias vizinhas
      stroke: superficie, 'stroke-width': VAO,
      class: 'g-marca',
    }, g);
    ligarDica(g, {
      titulo: fatia.rotulo,
      linhas: [
        { cor: cor.serie(i), serie: 'Realizado', valor: formatarDica(fatia.valor) },
        { serie: 'Participação', valor: fmt.pct(fracao * 100) },
      ],
      notas: fatia.detalhe ? ['Inclui: ' + fatia.detalhe] : null,
    }, `${fatia.rotulo}: ${formatarDica(fatia.valor)}, ${fmt.pct(fracao * 100)}`);
  });

  // total no miolo
  texto(svg, cx, cy - 4, fmt.curta(total), 'g-valor',
        { 'text-anchor': 'middle', style: 'font-size:15px' });
  texto(svg, cx, cy + 12, 'total', 'g-tick', { 'text-anchor': 'middle' });

  // rótulos diretos à direita — também servem de relevo de contraste
  const xLista = cx + raio + 24;
  const disponivel = largura - xLista - 8;
  if (disponivel > 120) {
    const alturaItem = Math.min(24, (altura - 16) / fatias.length);
    fatias.forEach((fatia, i) => {
      const y = 14 + alturaItem * (i + 0.5);
      el('rect', {
        x: xLista, y: y - 5, width: 10, height: 10, rx: 3, fill: cor.serie(i),
      }, svg);
      texto(svg, xLista + 16, y + 3.5,
            encurtar(fatia.rotulo, disponivel - 118, 11), 'g-rotulo');
      texto(svg, largura - 6, y + 3.5,
            `${fmt.pct((fatia.valor / total) * 100, 0)} · ${fmt.curta(fatia.valor)}`,
            'g-valor', { 'text-anchor': 'end' });
    });
  } else {
    legenda(alvo, fatias.map((f, i) => ({
      cor: cor.serie(i),
      rotulo: `${f.rotulo} — ${fmt.pct((f.valor / total) * 100, 0)}`,
    })));
  }
}

/* ==========================================================================
   8. Mapa de calor conta × mês — % de execução, divergente em torno de 100%
   Três passos por braço + neutro. Célula sem planilha vem hachurada.
   ========================================================================== */
const FAIXAS_EXECUCAO = [
  { ate: 40, i: 0, rotulo: 'até 40%' },
  { ate: 70, i: 1, rotulo: '40–70%' },
  { ate: 95, i: 2, rotulo: '70–95%' },
  { ate: 105, i: 3, rotulo: '95–105%' },
  { ate: 130, i: 4, rotulo: '105–130%' },
  { ate: 200, i: 5, rotulo: '130–200%' },
  { ate: Infinity, i: 6, rotulo: 'acima de 200%' },
];

function faixaExecucao(pct) {
  return FAIXAS_EXECUCAO.find(f => pct <= f.ate) || FAIXAS_EXECUCAO[6];
}

function mapaCalor(alvo, cfg) {
  const { linhasDados, meses, semDados = [] } = cfg;
  if (!linhasDados.length) return vazio(alvo, 'Sem dados no período filtrado.');

  // A coluna de nomes acompanha a largura disponível: fixada em 210 num cartão
  // estreito ela come as células e os meses do cabeçalho passam a se sobrepor.
  const larguraDisponivel = Math.max(280, alvo.clientWidth || 560);
  const larguraRotulo = Math.min(cfg.larguraRotulo || 210,
                                 Math.max(90, larguraDisponivel * 0.42));
  const alturaLinha = 22;
  const altura = linhasDados.length * alturaLinha + 46;
  const q = moldura(alvo, altura, {
    esquerda: larguraRotulo + 8, direita: 14, cima: 26, baixo: 16,
  });

  const larguraCelula = q.l / meses.length;
  const rampa = cor.divergente();
  const superficie = cor.superficie();
  const hachura = defHachura(q.svg, novoId('hachura'));

  // cabeçalho de mês: desbasta se a célula não couber o rótulo
  const passoMes = larguraCelula >= larguraTexto('mai', 10.5) + 4 ? 1 : 2;
  meses.forEach((m, j) => {
    if (j % passoMes !== 0) return;
    texto(q.svg, q.m.esquerda + larguraCelula * (j + 0.5), q.m.cima - 9,
          fmt.mes(m), 'g-tick', { 'text-anchor': 'middle' });
  });

  linhasDados.forEach((linha, i) => {
    const y = q.m.cima + alturaLinha * i;
    texto(q.svg, q.m.esquerda - 8, y + alturaLinha / 2 + 3.5,
          encurtar(linha.rotulo, larguraRotulo - 4), 'g-rotulo', { 'text-anchor': 'end' });

    meses.forEach((m, j) => {
      const celula = linha.celulas[j] || {};
      const x = q.m.esquerda + larguraCelula * j;
      const g = el('g', {}, q.svg);
      // vão de 2px separando células vizinhas
      const cx = x + VAO / 2;
      const cy = y + VAO / 2;
      const cw = Math.max(1, larguraCelula - VAO);
      const ch = Math.max(1, alturaLinha - VAO);

      let preenchimento;
      let notas;
      let rotuloAcessivel;
      if (semDados[j]) {
        preenchimento = hachura;
        notas = ['Planilha deste mês não carregada.'];
        rotuloAcessivel = `${linha.rotulo}, ${fmt.mesLongo(m)}: sem dados`;
      } else if (!celula.orcado && !celula.realizado) {
        preenchimento = superficie;
        notas = ['Sem orçamento e sem movimento no mês.'];
        rotuloAcessivel = `${linha.rotulo}, ${fmt.mesLongo(m)}: sem movimento`;
      } else if (!celula.orcado) {
        preenchimento = rampa[6];
        notas = ['Gasto sem orçamento previsto para o mês.'];
        rotuloAcessivel = `${linha.rotulo}, ${fmt.mesLongo(m)}: gasto sem orçamento`;
      } else {
        const pct = (celula.realizado / celula.orcado) * 100;
        preenchimento = rampa[faixaExecucao(pct).i];
        rotuloAcessivel = `${linha.rotulo}, ${fmt.mesLongo(m)}: ${fmt.pct(pct)} do orçado`;
      }

      el('rect', {
        x: cx, y: cy, width: cw, height: ch, rx: 2,
        fill: preenchimento,
        stroke: preenchimento === superficie ? token('--grade') : 'none',
        'stroke-width': preenchimento === superficie ? 1 : 0,
        class: 'g-marca',
      }, g);

      const pct = celula.orcado ? (celula.realizado / celula.orcado) * 100 : null;
      ligarDica(g, {
        titulo: `${linha.rotulo} — ${fmt.mesLongo(m)}`,
        linhas: [
          { serie: 'Orçado', valor: fmt.moeda(celula.orcado || 0) },
          { serie: 'Realizado', valor: fmt.moeda(celula.realizado || 0) },
          { serie: 'Execução', valor: pct === null ? '—' : fmt.pct(pct) },
        ],
        notas,
      }, rotuloAcessivel);
    });
  });

  // legenda da escala: sequência ordenada com rótulos
  const div = document.createElement('div');
  div.className = 'g-legenda';
  FAIXAS_EXECUCAO.forEach(f => {
    const s = document.createElement('span');
    s.className = 'g-legenda-item';
    const marca = document.createElement('span');
    marca.className = 'g-legenda-marca';
    marca.style.background = rampa[f.i];
    s.appendChild(marca);
    const r = document.createElement('span');
    r.textContent = f.rotulo;
    s.appendChild(r);
    div.appendChild(s);
  });
  ['Sem movimento', 'Sem planilha'].forEach((rotulo, k) => {
    const s = document.createElement('span');
    s.className = 'g-legenda-item';
    const marca = document.createElement('span');
    marca.className = 'g-legenda-marca' + (k === 1 ? ' hachura' : '');
    if (k === 0) {
      marca.style.background = superficie;
      marca.style.border = '1px solid var(--grade)';
    }
    s.appendChild(marca);
    const r = document.createElement('span');
    r.textContent = rotulo;
    s.appendChild(r);
    div.appendChild(s);
  });
  alvo.appendChild(div);
}

/* ----------------------------------------------------------- re-render responsivo */
const registros = new Map();
let observador = null;

/** Guarda a função de desenho e redesenha quando a largura do cartão mudar. */
function registrar(alvo, desenhar) {
  if (!alvo) return;
  registros.set(alvo, desenhar);
  if (!observador && typeof ResizeObserver !== 'undefined') {
    let ultimo = new Map();
    observador = new ResizeObserver(entradas => {
      entradas.forEach(entrada => {
        const largura = Math.round(entrada.contentRect.width);
        if (!largura) return;                         // painel escondido
        if (ultimo.get(entrada.target) === largura) return;
        ultimo.set(entrada.target, largura);
        const fn = registros.get(entrada.target);
        if (fn) fn();
      });
    });
  }
  if (observador) { observador.unobserve(alvo); observador.observe(alvo); }
  // Desenha já, mesmo sem largura ainda: `moldura` cai numa largura padrão e o
  // observador redesenha na largura real. Esperar por clientWidth deixaria o
  // gráfico em branco para sempre quando o layout chega depois do script.
  desenhar();
}

/** Redesenha todos os gráficos visíveis (troca de aba, troca de tema). */
function redesenhar() {
  registros.forEach(desenhar => desenhar());
}

return {
  fmt, cor, MESES, MESES_LONGOS, FAIXAS_EXECUCAO, faixaExecucao,
  colunasAgrupadas, colunas, linhas, barrasDivergentes, barrasHorizontais,
  pareto, rosca, mapaCalor,
  registrar, redesenhar, vazio, dica,
};

})();
