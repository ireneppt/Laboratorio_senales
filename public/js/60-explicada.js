// Imputación, pestaña 1: variable explicada.
// ----- Pestaña 1: Variable explicada -----
// Se elige la serie que se quiere imputar (arrastrándola a un campo) y se le quitan tramos, además de los datos
// que ya le falten. En el proyecto se guarda la serie elegida y los tramos quitados; lo demás (zoom, herramienta,
// vista previa...) es solo de pantalla.
const estadoImputacionVacio = () => ({ explicada: { serieId: null, quitados: [] }, explicativas: [] });
let imputacion = estadoImputacionVacio();

const exp = {
  ui: {}, serie: null, idMostrado: null, y: null, n: 0, vista: null,
  herramienta: "quitar", ghost: true,
  pila: [], rehacer: [],                      // historial de tramos para deshacer y rehacer
  arrastrando: null, encima: null,            // serie que se arrastra y serie sobre el campo
  gesto: null, gestoMapa: null, edicion: null, espacio: false, token: 0,
  aviso: null, temporizadorAviso: 0, graficaPendiente: false, tramosAbierto: true,
  azar: { modo: "sueltos", porcentaje: 10, bloques: 3, tamano: 20, semilla: 1, abierto: false, vista: [] },
};
const impClonar = (x) => JSON.parse(JSON.stringify(x));
const tramosQuitados = () => imputacion.explicada.quitados;
const cambioImputacion = () => programarEstadoProyecto();
const serieExplicada = () => series.find((x) => x.id === imputacion.explicada.serieId) ?? null;

// Los tramos son pares [desde, hasta] de puntos (ambos incluidos). Para operar con ellos se pasan a una
// máscara (un booleano por punto) y se vuelven a juntar: así se fusionan solos los que se tocan.
function tramosAMascara(tramos, n) {
  const m = new Array(n).fill(false);
  for (const [a, b] of tramos) for (let i = Math.max(a, 0); i <= Math.min(b, n - 1); i++) m[i] = true;
  return m;
}
function mascaraATramos(m) {
  const tramos = [];
  for (let i = 0; i < m.length; i++) {
    if (!m[i]) continue;
    let j = i;
    while (j + 1 < m.length && m[j + 1]) j++;
    tramos.push([i, j]);
    i = j;
  }
  return tramos;
}
function aplicarRangos(tramos, rangos, borrar, n) {
  const m = tramosAMascara(tramos, n);
  for (const [a, b] of rangos) for (let i = Math.max(a, 0); i <= Math.min(b, n - 1); i++) m[i] = !borrar;
  return mascaraATramos(m);
}
function huecosDeOrigen(y) {
  const tramos = [];
  for (let i = 0; i < y.length; i++) {
    if (y[i] !== null) continue;
    let j = i;
    while (j + 1 < y.length && y[j + 1] === null) j++;
    tramos.push([i, j]);
    i = j;
  }
  return tramos;
}
// Generador de números al azar con semilla (mulberry32): la misma semilla da siempre lo mismo
function impAzar(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function asegurarDatos(serie) {
  if (!serie.datos) await cargarSerie(serie);
  return Boolean(serie.datos);
}

// Línea pequeña con la forma de la serie
function impMiniatura(y, color) {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 100 30");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  const valores = y.filter((v) => v !== null);
  if (valores.length < 2) return svg;
  const minimo = Math.min(...valores), maximo = Math.max(...valores), rango = maximo - minimo || 1;
  const paso = Math.max(1, Math.ceil(y.length / 100));
  let d = "", pluma = false;
  for (let i = 0; i < y.length; i += paso) {
    const v = y[i];
    if (v === null) { pluma = false; continue; }
    d += `${pluma ? "L" : "M"}${(i / (y.length - 1)) * 100},${28 - ((v - minimo) / rango) * 26} `;
    pluma = true;
  }
  const ruta = document.createElementNS(NS, "path");
  ruta.setAttribute("d", d);
  ruta.setAttribute("fill", "none");
  ruta.setAttribute("stroke", color);
  ruta.setAttribute("stroke-width", "1.6");
  ruta.setAttribute("vector-effect", "non-scaling-stroke");
  svg.append(ruta);
  return svg;
}

const textoTipo = (serie) => (esManual(serie) ? `serie ${NOMBRE_ORIGEN[serie.origen]}` : "generada");

// ----- Montaje de la pantalla -----
function montarExplicada() {
  const raiz = document.createElement("div");
  raiz.className = "exp";
  raiz.innerHTML = `
    <aside class="exp-lateral">
      <h3>Series del proyecto</h3>
      <p class="ayuda">Arrastra una serie al campo de la derecha (o púlsala) para usarla como variable explicada.</p>
      <ul class="exp-series" id="exp-lista"></ul>
    </aside>
    <section class="exp-principal">
      <div class="campo-soltar" id="exp-campo" aria-live="polite"></div>
      <div class="exp-aviso" id="exp-aviso" hidden></div>
      <div id="exp-trabajo" hidden>
        <div class="exp-barra" role="toolbar" aria-label="Herramientas">
          <div class="exp-grupo" role="group" aria-label="Herramienta">
            <button type="button" data-herr="quitar" title="Quitar datos: arrastra sobre la gráfica (Q)">Quitar</button>
            <button type="button" data-herr="restaurar" title="Restaurar datos que has quitado (R)">Restaurar</button>
          </div>
          <div class="exp-grupo">
            <button type="button" id="exp-deshacer" title="Deshacer (Ctrl+Z)" aria-label="Deshacer">↶</button>
            <button type="button" id="exp-rehacer" title="Rehacer (Ctrl+Mayús+Z)" aria-label="Rehacer">↷</button>
          </div>
          <div class="exp-grupo">
            <button type="button" id="exp-zoom-menos" title="Alejar" aria-label="Alejar">−</button>
            <button type="button" id="exp-zoom-mas" title="Acercar" aria-label="Acercar">+</button>
            <button type="button" id="exp-zoom-todo" title="Ver toda la serie">Todo</button>
          </div>
          <label class="toggle opcion"><input type="checkbox" class="alea" id="exp-ghost" checked> Ver lo quitado</label>
        </div>
        <small class="ayuda" id="exp-ayuda" style="display:block;margin:8px 0 0"></small>
        <div class="exp-caja" id="exp-caja">
          <div id="exp-grafica"></div>
          <div class="exp-capa" id="exp-capa"></div>
          <div class="exp-capa" id="exp-curso"></div>
        </div>
        <canvas id="exp-mapa" height="72" aria-label="Mapa de la serie: arrastra la ventana para moverte"></canvas>
        <div class="exp-contadores" id="exp-contadores"></div>
        <details class="exp-azar" id="exp-azar">
          <summary>Quitar al azar</summary>
          <div class="exp-azar-cuerpo">
            <div class="exp-grupo" role="group" aria-label="Modo">
              <button type="button" data-azar-modo="sueltos">Puntos sueltos</button>
              <button type="button" data-azar-modo="bloques">Bloques</button>
            </div>
            <label data-azar="sueltos">% de puntos <output id="az-pct-v"></output>
              <input type="range" id="az-pct" min="1" max="60" value="10"></label>
            <label data-azar="bloques">Nº de bloques <output id="az-bloques-v"></output>
              <input type="range" id="az-bloques" min="1" max="20" value="3"></label>
            <label data-azar="bloques">Tamaño de cada bloque (puntos) <output id="az-tamano-v"></output>
              <input type="range" id="az-tamano" min="2" max="200" value="20"></label>
            <label>Semilla
              <input type="number" id="az-semilla" min="0" max="1000000" step="1" value="1"></label>
            <button type="button" id="az-otra">Otra semilla</button>
            <button type="button" id="az-aplicar">Aplicar</button>
            <p class="ayuda" id="az-info"></p>
          </div>
        </details>
        <details class="exp-tramos" id="exp-tramos-det" open>
          <summary>Tramos quitados por ti <span id="exp-tramos-cuenta"></span></summary>
          <div class="exp-tramos-cuerpo">
            <div id="exp-tramos-lista"></div>
            <div class="tramo-nuevo">
              <span>Quitar del punto</span>
              <input type="number" id="exp-nuevo-desde" step="1" min="0" aria-label="Desde el punto">
              <span>al</span>
              <input type="number" id="exp-nuevo-hasta" step="1" min="0" placeholder="(solo uno)" aria-label="Hasta el punto">
              <button type="button" id="exp-nuevo-quitar">Quitar tramo</button>
              <button type="button" id="exp-restaurar-todo">Restaurar todo</button>
            </div>
          </div>
        </details>
      </div>
    </section>`;
  const q = (sel) => raiz.querySelector(sel);
  exp.ui = {
    raiz, lista: q("#exp-lista"), campo: q("#exp-campo"), aviso: q("#exp-aviso"), trabajo: q("#exp-trabajo"),
    grafica: q("#exp-grafica"), caja: q("#exp-caja"), capa: q("#exp-capa"), curso: q("#exp-curso"), mapa: q("#exp-mapa"),
    contadores: q("#exp-contadores"), tramosLista: q("#exp-tramos-lista"), ayuda: q("#exp-ayuda"),
    deshacer: q("#exp-deshacer"), rehacer: q("#exp-rehacer"), ghost: q("#exp-ghost"),
    azar: q("#exp-azar"), tramosDet: q("#exp-tramos-det"), tramosCuenta: q("#exp-tramos-cuenta"), nuevoDesde: q("#exp-nuevo-desde"), nuevoHasta: q("#exp-nuevo-hasta"),
  };
  exp.ui.ghost.checked = exp.ghost;
  // las tarjetas de números se crean una vez y luego solo cambian sus valores
  for (const [clave, etiqueta, clase] of [["n", "Puntos", ""], ["origen", "Faltaban de origen", ""], ["quitados", "Quitados por ti", "naranja"], ["total", "A imputar", "naranja"], ["bloques", "Bloques sin datos", ""]]) {
    const tarjeta = document.createElement("div");
    tarjeta.className = "imp-dato " + clase;
    tarjeta.innerHTML = `<span></span><strong data-dato="${clave}">0</strong><small data-nota="${clave}"></small>`;
    tarjeta.querySelector("span").textContent = etiqueta;
    exp.ui.contadores.append(tarjeta);
  }
  enlazarExplicada();
  return raiz;
}

// ----- Lista de series, campo y avisos -----
function pintarLista() {
  const lista = exp.ui.lista;
  lista.replaceChildren();
  const c = colores();
  if (series.length === 0) return;
  for (const serie of series) {
    const li = document.createElement("li");
    li.className = "exp-serie" + (serie.id === imputacion.explicada.serieId ? " usada" : "");
    li.draggable = true;
    li.tabIndex = 0;
    li.setAttribute("role", "button");
    li.dataset.id = serie.id;
    li.setAttribute("aria-label", `Usar ${nombreDe(serie)} como variable explicada`);
    const texto = document.createElement("div");
    const nombre = document.createElement("strong");
    nombre.textContent = nombreDe(serie);
    const detalle = document.createElement("small");
    detalle.textContent = serie.datos ? `${serie.datos.y.length} puntos · ${textoTipo(serie)}` : textoTipo(serie);
    texto.append(nombre, detalle);
    li.append(crearPunto(serie.color), texto);
    if (serie.datos) li.append(impMiniatura(serie.datos.y, colorDe(serie, c)));
    lista.append(li);
  }
}

function pintarCampo() {
  const campo = exp.ui.campo;
  campo.replaceChildren();
  const c = colores();
  const mostrada = exp.encima !== null ? series.find((x) => x.id === exp.encima) : serieExplicada();
  campo.classList.toggle("encima", exp.encima !== null);
  campo.classList.toggle("llena", exp.encima === null && Boolean(mostrada));
  if (!mostrada) {
    campo.textContent = "Arrastra aquí la serie que quieres imputar";
    return;
  }
  const chip = document.createElement("div");
  chip.className = "chip";
  const texto = document.createElement("div");
  const nombre = document.createElement("span");
  nombre.textContent = nombreDe(mostrada);
  const detalle = document.createElement("small");
  detalle.textContent = exp.encima !== null ? "Suelta para usarla como variable explicada" : `Variable explicada · ${textoTipo(mostrada)}`;
  texto.append(nombre, detalle);
  chip.append(crearPunto(mostrada.color), texto);
  campo.append(chip);
  if (mostrada.datos) campo.append(impMiniatura(mostrada.datos.y, colorDe(mostrada, c)));
  if (exp.encima === null) {
    const quitar = document.createElement("button");
    quitar.type = "button";
    quitar.dataset.accion = "quitar-serie";
    quitar.textContent = "Quitar serie";
    campo.append(quitar);
  }
}

function mostrarAvisoExp(texto, deshacerFn = null) {
  const caja = exp.ui.aviso;
  if (!caja) return;
  caja.replaceChildren();
  const span = document.createElement("span");
  span.textContent = texto;
  caja.append(span);
  if (deshacerFn) {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.textContent = "Deshacer";
    boton.addEventListener("click", () => { caja.hidden = true; deshacerFn(); });
    caja.append(boton);
  }
  caja.hidden = false;
  clearTimeout(exp.temporizadorAviso);
  exp.temporizadorAviso = setTimeout(() => { caja.hidden = true; }, deshacerFn ? 9000 : 4500);
}

async function cambiarExplicada(nuevoId) {
  const anterior = impClonar(imputacion.explicada);
  if (anterior.serieId === nuevoId) return;
  const explicativasAntes = [...imputacion.explicativas];
  imputacion.explicada = { serieId: nuevoId, quitados: [] };
  imputacion.explicativas = imputacion.explicativas.filter((id) => id !== nuevoId); // la explicada no puede ser explicativa
  exp.pila = [];
  exp.rehacer = [];
  exp.azar.vista = [];
  cambioImputacion();
  const nueva = serieExplicada();
  const cuantos = anterior.quitados.length;
  const deshacerFn = anterior.serieId !== null
    ? () => { imputacion.explicada = anterior; imputacion.explicativas = explicativasAntes; exp.pila = []; exp.rehacer = []; cambioImputacion(); actualizarExplicada(); }
    : null;
  await actualizarExplicada();
  mostrarAvisoExp(nueva ? `Variable explicada: ${nombreDe(nueva)}.` : "Has quitado la variable explicada." + (cuantos ? ` (Se descartan ${cuantos === 1 ? "1 tramo" : cuantos + " tramos"}.)` : ""), deshacerFn);
}

// Vuelve a leer series y datos y repinta todo lo de la pestaña
async function actualizarExplicada() {
  if (!exp.ui.campo || !exp.ui.campo.isConnected) return;
  const token = ++exp.token;
  guardarActiva();
  await Promise.all(series.map(asegurarDatos));
  if (token !== exp.token || !exp.ui.campo.isConnected) return;
  const serie = serieExplicada();
  if (!serie || !serie.datos) {
    imputacion.explicada = estadoImputacionVacio().explicada;
    exp.serie = null; exp.y = null; exp.n = 0;
  } else {
    exp.serie = serie;
    exp.y = serie.datos.y;
    exp.n = exp.y.length;
    imputacion.explicada.quitados = aplicarRangos(tramosQuitados(), [], false, exp.n); // recorta lo que se salga de la serie
  }
  if (exp.idMostrado !== (serie ? serie.id : null) || !exp.vista || exp.vista[1] > exp.n) {
    exp.vista = [-0.5, exp.n - 0.5];
    exp.idMostrado = serie ? serie.id : null;
  }
  exp.ui.trabajo.hidden = !exp.y;
  pintarLista();
  pintarCampo();
  if (exp.y) {
    exp.ui.nuevoDesde.max = exp.ui.nuevoHasta.max = exp.n - 1;
    await refrescarExplicada();
  }
}

async function refrescarExplicada() {
  if (!exp.y || !exp.ui.grafica.isConnected) return;
  exp.azar.vista = exp.azar.abierto ? calcularAzar() : [];
  pintarContadores();
  pintarTramos();
  pintarBarra();
  pintarMapa();
  pintarInfoAzar();
  await pintarGrafica();
}

// ----- Cambiar los tramos (con historial) -----
function fijarTramos(nuevos) {
  const normal = aplicarRangos(nuevos, [], false, exp.n);
  if (JSON.stringify(normal) === JSON.stringify(tramosQuitados())) { pintarBandas(); return false; }
  exp.pila.push(impClonar(tramosQuitados()));
  if (exp.pila.length > 100) exp.pila.shift();
  exp.rehacer = [];
  imputacion.explicada.quitados = normal;
  cambioImputacion();
  refrescarExplicada();
  return true;
}
function deshacerTramos() {
  if (!exp.pila.length) return;
  exp.rehacer.push(impClonar(tramosQuitados()));
  imputacion.explicada.quitados = exp.pila.pop();
  cambioImputacion();
  refrescarExplicada();
}
function rehacerTramos() {
  if (!exp.rehacer.length) return;
  exp.pila.push(impClonar(tramosQuitados()));
  imputacion.explicada.quitados = exp.rehacer.pop();
  cambioImputacion();
  refrescarExplicada();
}

// Quita (o restaura) rangos, avisando si no había nada que cambiar
function confirmarRangos(rangos, borrar) {
  if (!rangos.length) return;
  const actual = tramosAMascara(tramosQuitados(), exp.n);
  let cambia = false;
  for (const [a, b] of rangos) {
    for (let i = Math.max(a, 0); i <= Math.min(b, exp.n - 1); i++) {
      if (borrar ? actual[i] : exp.y[i] !== null && !actual[i]) { cambia = true; break; }
    }
    if (cambia) break;
  }
  if (!cambia) {
    mostrarAvisoExp(borrar ? "Ahí no había nada quitado que restaurar." : "Ahí no hay datos que quitar: ya estaba vacío.");
    return;
  }
  fijarTramos(aplicarRangos(tramosQuitados(), rangos, borrar, exp.n));
}

// ----- Gráfica principal -----
const tramosActuales = () => {
  const tramos = tramosQuitados();
  return exp.edicion ? tramos.map((t, k) => (k === exp.edicion.k ? [exp.edicion.a, exp.edicion.b] : t)) : tramos;
};

async function pintarGrafica() {
  const { y, n, serie } = exp;
  if (!y || !exp.ui.grafica.isConnected) return;
  const c = colores();
  const color = colorDe(serie, c);
  const quitado = tramosAMascara(tramosQuitados(), n);
  const x = y.map((_, i) => i);
  const visible = y.map((v, i) => (quitado[i] ? null : v));
  const trazas = [{
    x, y: visible, type: "scatter", mode: "lines", name: nombreDe(serie), line: { color, width: 2 },
    hovertemplate: "<b>%{y:.2f}</b>  ·  punto %{x}<extra></extra>",
  }];
  if (exp.ghost) {
    const fantasma = y.map(() => null);
    for (const [a, b] of tramosQuitados()) {
      for (let i = Math.max(a - 1, 0); i <= Math.min(b + 1, n - 1); i++) fantasma[i] = y[i];
    }
    trazas.push({
      x, y: fantasma, type: "scatter", mode: "lines", name: "Quitado", line: { color: c.series[3], width: 2, dash: "dot" },
      hovertemplate: "quitado <b>%{y:.2f}</b>  ·  punto %{x}<extra></extra>",
    });
  }
  // el eje Y se ajusta a lo que se ve en la ventana actual
  const [v0, v1] = exp.vista;
  let minimo = Infinity, maximo = -Infinity;
  for (let i = Math.max(Math.ceil(v0), 0); i <= Math.min(Math.floor(v1), n - 1); i++) {
    if (y[i] === null) continue;
    if (y[i] < minimo) minimo = y[i];
    if (y[i] > maximo) maximo = y[i];
  }
  if (!Number.isFinite(minimo)) { minimo = 0; maximo = 1; }
  const margen = (maximo - minimo) * 0.08 || Math.abs(maximo) * 0.05 || 1;
  const eje = (texto) => ({
    title: texto ? { text: texto, font: { color: c.muted, size: 12 }, standoff: 8 } : undefined,
    gridcolor: c.grid, gridwidth: 1, zeroline: false, linecolor: c.axis, tickfont: { color: c.muted, size: 11 }, ticks: "", fixedrange: true,
  });
  await Plotly.react(exp.ui.grafica, trazas, {
    paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)", font: { family: c.fuente, color: c.ink2 },
    margin: { t: 12, r: 16, b: 40, l: 56 }, dragmode: false, hovermode: "x", showlegend: false,
    xaxis: { ...eje("Punto"), showgrid: false, showline: true, range: [v0, v1] },
    yaxis: { ...eje(""), range: [minimo - margen, maximo + margen], showline: false },
    hoverlabel: { bgcolor: c.surface, bordercolor: c.axis, font: { color: c.ink, family: c.fuente, size: 13 } },
  }, { responsive: true, displaylogo: false, displayModeBar: false, scrollZoom: false });
  pintarBandas();
  pintarCurso();
}

// Repinta la gráfica como mucho una vez por fotograma (al hacer zoom o desplazarse)
function programarGrafica() {
  if (exp.graficaPendiente) return;
  exp.graficaPendiente = true;
  requestAnimationFrame(() => { exp.graficaPendiente = false; pintarMapa(); pintarGrafica(); });
}

// Bandas por encima de la gráfica: huecos de origen (gris), tramos quitados (naranja, editables) y vista previa del azar
function geometriaCapas() {
  const lay = exp.ui.grafica._fullLayout;
  if (!lay || !lay.xaxis || !lay.yaxis) return null;
  const { xaxis: xa, yaxis: ya } = lay;
  for (const capa of [exp.ui.capa, exp.ui.curso]) {
    Object.assign(capa.style, { left: xa._offset + "px", top: ya._offset + "px", width: xa._length + "px", height: ya._length + "px" });
  }
  return xa;
}
function ponerBanda(contenedor, xa, a, b, clase) {
  const el = document.createElement("div");
  el.className = "exp-banda " + clase;
  posicionarBanda(el, xa, a, b);
  contenedor.append(el);
  return el;
}
function posicionarBanda(el, xa, a, b) {
  const izq = xa.l2p(a - 0.5), der = xa.l2p(b + 0.5);
  el.style.left = izq + "px";
  el.style.width = Math.max(der - izq, 2) + "px";
}

function pintarBandas() {
  if (!exp.y) return;
  const xa = geometriaCapas();
  if (!xa) return;
  const capa = exp.ui.capa;
  capa.replaceChildren();
  huecosDeOrigen(exp.y).forEach(([a, b]) => ponerBanda(capa, xa, a, b, "origen"));
  const editable = exp.herramienta === "quitar";
  tramosQuitados().forEach(([a, b], k) => {
    const el = ponerBanda(capa, xa, a, b, "quitado" + (editable ? " editable" : ""));
    if (!editable) return;
    for (const lado of ["a", "b"]) {
      const asa = document.createElement("div");
      asa.className = "asa asa-" + lado;
      el.append(asa);
    }
    el.addEventListener("pointerdown", (e) => iniciarEdicion(e, el, xa, k, e.target.classList.contains("asa-a") ? "a" : e.target.classList.contains("asa-b") ? "b" : "mover"));
  });
  exp.azar.vista.forEach(([a, b]) => ponerBanda(capa, xa, a, b, "azar"));
}

// Lo que se está haciendo ahora mismo con el ratón: selección, pincel o goma
function pintarCurso() {
  const curso = exp.ui.curso;
  if (!curso || !exp.y) return;
  const xa = geometriaCapas();
  if (!xa) return;
  curso.replaceChildren();
  const g = exp.gesto;
  if (g && g.tipo === "seleccion") ponerBanda(curso, xa, Math.min(g.i0, g.i1), Math.max(g.i0, g.i1), g.borrar ? "goma" : "curso");
}

// ----- Posición del ratón sobre la gráfica -----
function indiceEn(e, recortar = true) {
  const xa = exp.ui.grafica._fullLayout.xaxis;
  const caja = exp.ui.grafica.getBoundingClientRect();
  const i = Math.round(xa.p2l(e.clientX - caja.left - xa._offset));
  return recortar ? Math.min(Math.max(i, 0), exp.n - 1) : i;
}
function dentroDelDibujo(e) {
  const lay = exp.ui.grafica._fullLayout;
  if (!lay || !lay.xaxis) return false;
  const { xaxis: xa, yaxis: ya } = lay;
  const caja = exp.ui.grafica.getBoundingClientRect();
  const px = e.clientX - caja.left - xa._offset, py = e.clientY - caja.top - ya._offset;
  return px >= 0 && px <= xa._length && py >= 0 && py <= ya._length;
}

// ----- Editar un tramo: arrastrar un borde o moverlo entero -----
function iniciarEdicion(e, el, xa, k, parte) {
  if (e.button !== 0 || e.altKey || exp.espacio) return; // con Alt se restaura y con Espacio se desplaza: lo gestiona la gráfica
  e.preventDefault();
  e.stopPropagation();
  const [a0, b0] = tramosQuitados()[k];
  const i0 = indiceEn(e);
  exp.edicion = { k, a: a0, b: b0 };
  exp.gesto = { tipo: "edicion" };
  el.classList.add("arrastrando");
  const mover = (ev) => {
    const i = indiceEn(ev);
    let a = a0, b = b0;
    if (parte === "a") a = Math.min(i, b0);
    else if (parte === "b") b = Math.max(i, a0);
    else {
      const d = Math.max(-a0, Math.min(exp.n - 1 - b0, i - i0));
      a = a0 + d;
      b = b0 + d;
    }
    exp.edicion = { k, a, b };
    posicionarBanda(el, xa, a, b);
  };
  const soltar = () => {
    window.removeEventListener("pointermove", mover);
    window.removeEventListener("pointerup", soltar);
    window.removeEventListener("pointercancel", soltar);
    const { a, b } = exp.edicion;
    exp.edicion = null;
    exp.gesto = null;
    fijarTramos(tramosQuitados().map((t, j) => (j === k ? [a, b] : t)));
  };
  window.addEventListener("pointermove", mover);
  window.addEventListener("pointerup", soltar);
  window.addEventListener("pointercancel", soltar);
}

// ----- Zoom y desplazamiento -----
function zoomExp(factor, centro = null) {
  const [v0, v1] = exp.vista;
  const total = exp.n, ancho = v1 - v0;
  const nuevo = Math.min(Math.max(ancho * factor, Math.min(4, total)), total);
  const cx = centro ?? (v0 + v1) / 2;
  const prop = (cx - v0) / ancho;
  let n0 = cx - prop * nuevo, n1 = n0 + nuevo;
  if (n0 < -0.5) { n1 += -0.5 - n0; n0 = -0.5; }
  if (n1 > total - 0.5) { n0 -= n1 - (total - 0.5); n1 = total - 0.5; }
  exp.vista = [Math.max(n0, -0.5), n1];
  programarGrafica();
}
function desplazarExp(delta) {
  const [v0, v1] = exp.vista;
  const ancho = v1 - v0;
  const n0 = Math.min(Math.max(v0 + delta, -0.5), exp.n - 0.5 - ancho);
  exp.vista = [n0, n0 + ancho];
  programarGrafica();
}

// ----- Mapa de la serie: toda la serie, los huecos y la ventana que se está viendo -----
function pintarMapa() {
  const lienzo = exp.ui.mapa;
  if (!lienzo || !exp.y || !lienzo.isConnected) return;
  const dpr = window.devicePixelRatio || 1;
  const W = lienzo.clientWidth, H = 72;
  if (!W) return;
  lienzo.width = Math.round(W * dpr);
  lienzo.height = Math.round(H * dpr);
  const g = lienzo.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const c = colores();
  const { y, n } = exp;
  const xm = (v) => ((v + 0.5) / n) * W;
  const quitado = tramosAMascara(tramosQuitados(), n);
  const valores = y.filter((v) => v !== null);
  const minimo = valores.length ? Math.min(...valores) : 0, maximo = valores.length ? Math.max(...valores) : 1, rango = maximo - minimo || 1;
  const yy = (v) => 4 + (1 - (v - minimo) / rango) * 44;
  const trazar = (filtro, color, ancho) => {
    g.strokeStyle = color; g.lineWidth = ancho; g.beginPath();
    let pluma = false;
    const paso = Math.max(1, Math.floor(n / (W * 2)));
    for (let i = 0; i < n; i += paso) {
      if (y[i] === null || !filtro(i)) { pluma = false; continue; }
      const px = xm(i), py = yy(y[i]);
      if (pluma) g.lineTo(px, py); else g.moveTo(px, py);
      pluma = true;
    }
    g.stroke();
  };
  trazar(() => true, c.axis, 1);                              // toda la serie, suave
  trazar((i) => !quitado[i], colorDe(exp.serie, c), 1.6);     // lo que queda
  // tira de huecos
  g.fillStyle = c.grid; g.fillRect(0, 54, W, 10);
  g.fillStyle = c.muted;
  huecosDeOrigen(y).forEach(([a, b]) => g.fillRect(xm(a - 0.5), 54, Math.max(xm(b + 0.5) - xm(a - 0.5), 1.5), 10));
  g.fillStyle = c.series[3];
  tramosActuales().forEach(([a, b]) => g.fillRect(xm(a - 0.5), 54, Math.max(xm(b + 0.5) - xm(a - 0.5), 1.5), 10));
  g.globalAlpha = 0.45;
  exp.azar.vista.forEach(([a, b]) => g.fillRect(xm(a - 0.5), 54, Math.max(xm(b + 0.5) - xm(a - 0.5), 1.5), 10));
  g.globalAlpha = 1;
  // ventana actual
  const x0 = xm(exp.vista[0] - 0.5 + 0.5), x1 = xm(exp.vista[1] - 0.5 + 0.5);
  g.fillStyle = c.series[0]; g.globalAlpha = 0.14; g.fillRect(x0, 0, x1 - x0, H); g.globalAlpha = 1;
  g.strokeStyle = c.series[0]; g.lineWidth = 2; g.strokeRect(x0 + 1, 1, Math.max(x1 - x0 - 2, 2), H - 2);
  g.fillStyle = c.series[0]; g.fillRect(x0 - 1, 24, 4, 24); g.fillRect(x1 - 3, 24, 4, 24);
}

function enlazarMapa() {
  const lienzo = exp.ui.mapa;
  const posicion = (e) => {
    const r = lienzo.getBoundingClientRect();
    return { x: e.clientX - r.left, W: r.width };
  };
  lienzo.addEventListener("pointerdown", (e) => {
    if (!exp.y || e.button !== 0) return;
    const { x, W } = posicion(e);
    const aIndice = (px) => (px / W) * exp.n - 0.5;
    const [v0, v1] = exp.vista;
    const x0 = ((v0 + 0.5) / exp.n) * W, x1 = ((v1 + 0.5) / exp.n) * W;
    let parte;
    if (Math.abs(x - x0) <= 8) parte = "a";
    else if (Math.abs(x - x1) <= 8) parte = "b";
    else {
      parte = "mover";
      if (x < x0 || x > x1) { // un clic fuera de la ventana la centra ahí
        const ancho = v1 - v0, c0 = Math.min(Math.max(aIndice(x) - ancho / 2, -0.5), exp.n - 0.5 - ancho);
        exp.vista = [c0, c0 + ancho];
        programarGrafica();
      }
    }
    lienzo.setPointerCapture(e.pointerId);
    exp.gestoMapa = { parte, inicio: aIndice(x), vista: [...exp.vista] };
  });
  lienzo.addEventListener("pointermove", (e) => {
    const g = exp.gestoMapa;
    if (!g) return;
    const { x, W } = posicion(e);
    const i = (x / W) * exp.n - 0.5;
    const [v0, v1] = g.vista;
    const minimoAncho = Math.min(4, exp.n);
    if (g.parte === "a") exp.vista = [Math.min(Math.max(i, -0.5), v1 - minimoAncho), v1];
    else if (g.parte === "b") exp.vista = [v0, Math.max(Math.min(i, exp.n - 0.5), v0 + minimoAncho)];
    else {
      const ancho = v1 - v0, n0 = Math.min(Math.max(v0 + (i - g.inicio), -0.5), exp.n - 0.5 - ancho);
      exp.vista = [n0, n0 + ancho];
    }
    programarGrafica();
  });
  const fin = (e) => { exp.gestoMapa = null; try { lienzo.releasePointerCapture(e.pointerId); } catch { /* ya soltado */ } };
  lienzo.addEventListener("pointerup", fin);
  lienzo.addEventListener("pointercancel", fin);
  lienzo.addEventListener("pointermove", (e) => {
    if (exp.gestoMapa || !exp.y) return;
    const { x, W } = posicion(e);
    const x0 = ((exp.vista[0] + 0.5) / exp.n) * W, x1 = ((exp.vista[1] + 0.5) / exp.n) * W;
    lienzo.style.cursor = Math.abs(x - x0) <= 8 || Math.abs(x - x1) <= 8 ? "ew-resize" : x > x0 && x < x1 ? "grab" : "pointer";
  });
}

// ----- Números en vivo -----
function animarNumero(el, destino, formato = (v) => String(Math.round(v))) {
  const desde = Number(el.dataset.valor ?? 0);
  el.dataset.valor = destino;
  cancelAnimationFrame(Number(el.dataset.anim || 0));
  if (desde === destino) { el.textContent = formato(destino); return; }
  const inicio = performance.now();
  const paso = (ahora) => {
    const t = Math.min((ahora - inicio) / 260, 1);
    el.textContent = formato(desde + (destino - desde) * (1 - Math.pow(1 - t, 3)));
    if (t < 1) el.dataset.anim = requestAnimationFrame(paso);
    else el.textContent = formato(destino);
  };
  el.dataset.anim = requestAnimationFrame(paso);
}

function pintarContadores() {
  const { y, n } = exp;
  const quitado = tramosAMascara(tramosQuitados(), n);
  let origen = 0, quitados = 0, bloques = 0, mayor = 0, racha = 0;
  for (let i = 0; i < n; i++) {
    if (y[i] === null) origen++; else if (quitado[i]) quitados++;
    if (y[i] === null || quitado[i]) { racha++; if (racha === 1) bloques++; mayor = Math.max(mayor, racha); } else racha = 0;
  }
  const total = origen + quitados;
  const poner = (clave, valor, nota = "") => {
    animarNumero(exp.ui.contadores.querySelector(`[data-dato="${clave}"]`), valor);
    exp.ui.contadores.querySelector(`[data-nota="${clave}"]`).textContent = nota;
  };
  poner("n", n);
  poner("origen", origen, origen ? `${((origen / n) * 100).toFixed(1)} %` : "");
  const previa = exp.azar.vista.reduce((suma, [a, b]) => suma + (b - a + 1), 0);
  poner("quitados", quitados, previa ? `+${previa} con la vista previa` : quitados ? `${((quitados / n) * 100).toFixed(1)} %` : "");
  poner("total", total, total ? `${((total / n) * 100).toFixed(1)} % de la serie` : "");
  poner("bloques", bloques, mayor ? `el más largo: ${mayor} puntos` : "");
}

// ----- Lista de tramos, con números que se pueden escribir -----
function pintarTramos() {
  const cont = exp.ui.tramosLista;
  cont.replaceChildren();
  const tramos = tramosQuitados();
  exp.ui.tramosCuenta.textContent = tramos.length ? `(${tramos.length})` : "";
  if (!tramos.length) {
    const p = document.createElement("p");
    p.className = "ayuda";
    p.style.margin = "0";
    p.textContent = "Todavía no has quitado ningún tramo. Arrastra sobre la gráfica, quita al azar o escribe los puntos más abajo.";
    cont.append(p);
    return;
  }
  tramos.forEach(([a, b], k) => {
    const fila = document.createElement("div");
    fila.className = "tramo-fila";
    const nombre = document.createElement("span");
    nombre.textContent = `Tramo ${k + 1}: del punto`;
    const desde = document.createElement("input");
    const hasta = document.createElement("input");
    for (const [campo, valor, etiqueta] of [[desde, a, "Desde el punto"], [hasta, b, "Hasta el punto"]]) {
      campo.type = "number"; campo.step = 1; campo.min = 0; campo.max = exp.n - 1; campo.value = valor;
      campo.setAttribute("aria-label", `${etiqueta} (tramo ${k + 1})`);
    }
    const al = document.createElement("span");
    al.textContent = "al";
    const tamano = document.createElement("span");
    tamano.className = "tamano";
    tamano.textContent = b - a + 1 === 1 ? "1 punto" : `${b - a + 1} puntos`;
    const borrar = document.createElement("button");
    borrar.type = "button";
    borrar.textContent = "Restaurar";
    borrar.title = "Restaura los datos de este tramo";
    const editar = () => {
      const d = Number(desde.value), h = Number(hasta.value);
      if (!Number.isInteger(d) || !Number.isInteger(h) || d < 0 || h > exp.n - 1 || d > h) {
        mostrarAvisoExp(`Escribe dos puntos entre 0 y ${exp.n - 1}, con el primero menor o igual que el segundo.`);
        desde.value = a; hasta.value = b;
        return;
      }
      fijarTramos(tramosQuitados().map((t, j) => (j === k ? [d, h] : t)));
    };
    desde.addEventListener("change", editar);
    hasta.addEventListener("change", editar);
    borrar.addEventListener("click", () => fijarTramos(tramosQuitados().filter((_, j) => j !== k)));
    fila.append(nombre, desde, al, hasta, tamano, borrar);
    cont.append(fila);
  });
}

function quitarEscrito() {
  const d = Number(exp.ui.nuevoDesde.value);
  const hVacio = exp.ui.nuevoHasta.value.trim() === "";
  const h = hVacio ? d : Number(exp.ui.nuevoHasta.value);
  if (exp.ui.nuevoDesde.value.trim() === "" || !Number.isInteger(d) || !Number.isInteger(h) || d < 0 || h > exp.n - 1 || d > h) {
    mostrarAvisoExp(`Escribe el punto de inicio (y, si quieres, el final) entre 0 y ${exp.n - 1}.`);
    return;
  }
  confirmarRangos([[d, h]], false);
  exp.ui.nuevoDesde.value = "";
  exp.ui.nuevoHasta.value = "";
}

// ----- Barra de herramientas -----
const AYUDA_HERRAMIENTA = {
  quitar: "Arrastra sobre la gráfica para quitar un tramo (un clic quita un punto). Arrastra los bordes de un tramo naranja para cambiarlo, o su centro para moverlo. Con Alt pulsado, restauras.",
  restaurar: "Arrastra sobre un tramo naranja para devolver esos datos (un clic restaura un punto).",
};
function pintarBarra() {
  const u = exp.ui;
  u.raiz.querySelectorAll("[data-herr]").forEach((b) => {
    b.setAttribute("aria-pressed", b.dataset.herr === exp.herramienta);
  });
  u.ayuda.textContent = AYUDA_HERRAMIENTA[exp.herramienta] + "  Rueda: zoom · Mayús+rueda o Espacio+arrastrar: desplazarte.";
  u.deshacer.disabled = !exp.pila.length;
  u.rehacer.disabled = !exp.rehacer.length;
}
function elegirHerramienta(h) {
  exp.herramienta = h;
  pintarBarra();
  pintarBandas();
  pintarCurso();
}

// ----- Quitar al azar, con vista previa en vivo -----
function calcularAzar() {
  const { y, n } = exp;
  const a = exp.azar, rnd = impAzar(a.semilla);
  const ocupado = tramosAMascara(tramosQuitados(), n);
  if (a.modo === "sueltos") {
    const libres = [];
    for (let i = 0; i < n; i++) if (y[i] !== null && !ocupado[i]) libres.push(i);
    const k = Math.min(libres.length, Math.round((libres.length * a.porcentaje) / 100));
    for (let j = 0; j < k; j++) {
      const r = j + Math.floor(rnd() * (libres.length - j));
      [libres[j], libres[r]] = [libres[r], libres[j]];
    }
    return libres.slice(0, k).sort((p, q) => p - q).map((i) => [i, i]);
  }
  const rangos = [], tomado = ocupado.slice();
  for (let bloque = 0; bloque < a.bloques; bloque++) {
    for (let intento = 0; intento < 300; intento++) {
      const ini = Math.floor(rnd() * (n - a.tamano + 1));
      if (ini < 0) break;
      let libre = true;
      for (let i = ini; i < ini + a.tamano; i++) if (y[i] === null || tomado[i]) { libre = false; break; }
      if (!libre) continue;
      for (let i = ini; i < ini + a.tamano; i++) tomado[i] = true;
      rangos.push([ini, ini + a.tamano - 1]);
      break;
    }
  }
  return rangos;
}
function pintarInfoAzar() {
  const u = exp.ui, a = exp.azar;
  u.azar.querySelectorAll("[data-azar-modo]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.azarModo === a.modo));
  u.azar.querySelectorAll("label[data-azar]").forEach((l) => { l.hidden = l.dataset.azar !== a.modo; });
  u.azar.querySelector("#az-pct-v").textContent = a.porcentaje + " %";
  u.azar.querySelector("#az-bloques-v").textContent = a.bloques;
  u.azar.querySelector("#az-tamano-v").textContent = a.tamano;
  const puntos = a.vista.reduce((suma, [d, h]) => suma + (h - d + 1), 0);
  const info = u.azar.querySelector("#az-info");
  if (!a.abierto) info.textContent = "";
  else if (a.modo === "bloques" && a.vista.length < a.bloques) info.textContent = `Solo caben ${a.vista.length} de ${a.bloques} bloques (${puntos} puntos). Prueba con bloques más cortos o con menos bloques.`;
  else info.textContent = puntos ? `Vista previa: se quitarían ${puntos} ${puntos === 1 ? "punto" : "puntos"} en ${a.vista.length} ${a.vista.length === 1 ? "tramo" : "tramos"}. Pulsa «Aplicar» para quitarlos.` : "No queda nada que quitar con estos ajustes.";
  u.azar.querySelector("#az-aplicar").disabled = !puntos;
}
function cambiarAzar(cambios) {
  Object.assign(exp.azar, cambios);
  if (!exp.y) return;
  exp.azar.vista = exp.azar.abierto ? calcularAzar() : [];
  pintarInfoAzar();
  pintarBandas();
  pintarContadores();
  pintarMapa();
}

// ----- Todos los eventos de la pestaña -----
function enlazarExplicada() {
  const u = exp.ui;
  // lista de series: arrastrar, pulsar o teclear
  u.lista.addEventListener("dragstart", (e) => {
    const li = e.target.closest(".exp-serie");
    if (!li) return;
    e.dataTransfer.setData("text/plain", li.dataset.id);
    e.dataTransfer.effectAllowed = "copy";
    exp.arrastrando = Number(li.dataset.id);
    li.classList.add("arrastrando");
  });
  u.lista.addEventListener("dragend", () => { exp.arrastrando = null; exp.encima = null; pintarLista(); pintarCampo(); });
  u.lista.addEventListener("click", (e) => {
    const li = e.target.closest(".exp-serie");
    if (li) cambiarExplicada(Number(li.dataset.id));
  });
  u.lista.addEventListener("keydown", (e) => {
    const li = e.target.closest(".exp-serie");
    if (li && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); cambiarExplicada(Number(li.dataset.id)); }
  });
  // campo donde soltar
  const idDelEvento = (e) => {
    const dato = Number(e.dataTransfer.getData("text/plain"));
    return Number.isFinite(dato) && dato > 0 ? dato : exp.arrastrando;
  };
  const sobreCampo = (e) => {
    if (exp.arrastrando === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (exp.encima !== exp.arrastrando) { exp.encima = exp.arrastrando; pintarCampo(); }
  };
  u.campo.addEventListener("dragenter", sobreCampo);
  u.campo.addEventListener("dragover", sobreCampo);
  u.campo.addEventListener("dragleave", (e) => {
    if (!u.campo.contains(e.relatedTarget) && exp.encima !== null) { exp.encima = null; pintarCampo(); }
  });
  u.campo.addEventListener("drop", (e) => {
    e.preventDefault();
    const id = idDelEvento(e);
    exp.encima = null;
    exp.arrastrando = null;
    if (id && series.some((x) => x.id === id)) cambiarExplicada(id); else pintarCampo();
  });
  u.campo.addEventListener("click", (e) => {
    if (e.target.closest("[data-accion=quitar-serie]")) cambiarExplicada(null);
  });

  // herramientas
  u.raiz.querySelectorAll("[data-herr]").forEach((b) => b.addEventListener("click", () => elegirHerramienta(b.dataset.herr)));
  u.deshacer.addEventListener("click", deshacerTramos);
  u.rehacer.addEventListener("click", rehacerTramos);
  u.raiz.querySelector("#exp-zoom-mas").addEventListener("click", () => zoomExp(0.6));
  u.raiz.querySelector("#exp-zoom-menos").addEventListener("click", () => zoomExp(1 / 0.6));
  u.raiz.querySelector("#exp-zoom-todo").addEventListener("click", () => { exp.vista = [-0.5, exp.n - 0.5]; programarGrafica(); });
  u.ghost.addEventListener("change", () => { exp.ghost = u.ghost.checked; pintarGrafica(); });

  // tramos escritos
  u.raiz.querySelector("#exp-nuevo-quitar").addEventListener("click", quitarEscrito);
  for (const campo of [u.nuevoDesde, u.nuevoHasta]) campo.addEventListener("keydown", (e) => { if (e.key === "Enter") quitarEscrito(); });
  u.raiz.querySelector("#exp-restaurar-todo").addEventListener("click", () => fijarTramos([]));

  // azar
  u.tramosDet.open = exp.tramosAbierto;
  u.tramosDet.addEventListener("toggle", () => { exp.tramosAbierto = u.tramosDet.open; });
  u.azar.open = exp.azar.abierto;
  u.azar.addEventListener("toggle", () => { cambiarAzar({ abierto: u.azar.open }); });
  u.azar.querySelectorAll("[data-azar-modo]").forEach((b) => b.addEventListener("click", () => cambiarAzar({ modo: b.dataset.azarModo })));
  const deslizador = (id, clave) => {
    const campo = u.azar.querySelector(id);
    campo.value = exp.azar[clave];
    campo.addEventListener("input", () => cambiarAzar({ [clave]: Number(campo.value) }));
  };
  deslizador("#az-pct", "porcentaje");
  deslizador("#az-bloques", "bloques");
  deslizador("#az-tamano", "tamano");
  const semilla = u.azar.querySelector("#az-semilla");
  semilla.value = exp.azar.semilla;
  semilla.addEventListener("input", () => { const v = parseInt(semilla.value); if (Number.isInteger(v) && v >= 0) cambiarAzar({ semilla: v }); });
  u.azar.querySelector("#az-otra").addEventListener("click", () => {
    const nueva = Math.floor(Math.random() * 1_000_000);
    semilla.value = nueva;
    cambiarAzar({ semilla: nueva });
  });
  u.azar.querySelector("#az-aplicar").addEventListener("click", () => {
    const rangos = exp.azar.vista;
    if (!rangos.length) return;
    const quitados = rangos.reduce((suma, [a, b]) => suma + (b - a + 1), 0);
    const nueva = Math.floor(Math.random() * 1_000_000);
    fijarTramos(aplicarRangos(tramosQuitados(), rangos, false, exp.n));
    mostrarAvisoExp(`Quitados ${quitados} ${quitados === 1 ? "punto" : "puntos"} al azar.`);
    semilla.value = nueva; // la siguiente vista previa ya es otra
    cambiarAzar({ semilla: nueva });
  });

  // la gráfica: seleccionar, pincel, goma, zoom y desplazamiento
  const caja = u.caja;
  caja.addEventListener("pointerdown", (e) => {
    if (!exp.y || exp.gesto) return;
    if (e.button === 1 || (e.button === 0 && exp.espacio)) {
      e.preventDefault();
      caja.setPointerCapture(e.pointerId);
      exp.gesto = { tipo: "pan", x0: e.clientX, vista: [...exp.vista] };
      return;
    }
    if (e.button !== 0 || !dentroDelDibujo(e)) return;
    const borrar = e.altKey || exp.herramienta === "restaurar";
    caja.setPointerCapture(e.pointerId);
    const i = indiceEn(e);
    exp.gesto = { tipo: "seleccion", borrar, i0: i, i1: i };
    pintarCurso();
  });
  caja.addEventListener("pointermove", (e) => {
    const g = exp.gesto;
    if (g && g.tipo === "pan") {
      const xa = exp.ui.grafica._fullLayout.xaxis;
      const ancho = g.vista[1] - g.vista[0];
      const n0 = Math.min(Math.max(g.vista[0] - ((e.clientX - g.x0) / xa._length) * ancho, -0.5), exp.n - 0.5 - ancho);
      exp.vista = [n0, n0 + ancho];
      programarGrafica();
    } else if (g && g.tipo === "seleccion") {
      g.i1 = indiceEn(e);
      pintarCurso();
    }
  });
  caja.addEventListener("pointerenter", () => { exp.sobre = true; });
  caja.addEventListener("pointerleave", () => { exp.sobre = false; });
  const terminar = (e) => {
    const g = exp.gesto;
    if (!g || g.tipo === "edicion") return;
    exp.gesto = null;
    try { caja.releasePointerCapture(e.pointerId); } catch { /* ya soltado */ }
    if (g.tipo === "seleccion") confirmarRangos([[Math.min(g.i0, g.i1), Math.max(g.i0, g.i1)]], g.borrar);
    pintarCurso();
  };
  caja.addEventListener("pointerup", terminar);
  caja.addEventListener("pointercancel", terminar);
  caja.addEventListener("wheel", (e) => {
    if (!exp.y) return;
    e.preventDefault();
    const xa = exp.ui.grafica._fullLayout.xaxis;
    if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      desplazarExp(((e.deltaX || e.deltaY) / xa._length) * (exp.vista[1] - exp.vista[0]));
    } else {
      const caja2 = exp.ui.grafica.getBoundingClientRect();
      zoomExp(e.deltaY > 0 ? 1.25 : 0.8, xa.p2l(e.clientX - caja2.left - xa._offset));
    }
  }, { passive: false });
  enlazarMapa();
  pintarBarra();
}

// Atajos de teclado (solo con esta pestaña a la vista)
const explicadaVisible = () => Boolean(exp.y) && exp.ui.caja && exp.ui.caja.isConnected && faseActiva === "imputacion";
document.addEventListener("keydown", (e) => {
  if (!explicadaVisible()) return;
  const escribiendo = e.target.closest && e.target.closest("input:not([type=range]):not([type=checkbox]), textarea, select");
  const enBoton = e.target.closest && e.target.closest("button, summary, [role=button]");
  if ((e.ctrlKey || e.metaKey) && !escribiendo) {
    const tecla = e.key.toLowerCase();
    if (tecla === "z" && !e.shiftKey) { e.preventDefault(); deshacerTramos(); }
    else if ((tecla === "z" && e.shiftKey) || tecla === "y") { e.preventDefault(); rehacerTramos(); }
    return;
  }
  if (escribiendo || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === "Space" && (exp.sobre || !enBoton)) { // con el ratón sobre la gráfica, el espacio es para desplazarse
    e.preventDefault();
    if (!exp.espacio) { exp.espacio = true; exp.ui.caja.classList.add("espacio"); }
  } else if (!enBoton) {
    const herramienta = { q: "quitar", r: "restaurar" }[e.key.toLowerCase()];
    if (herramienta) elegirHerramienta(herramienta);
  }
});
document.addEventListener("keyup", (e) => {
  if (e.code === "Space" && exp.espacio) { e.preventDefault(); exp.espacio = false; if (exp.ui.caja) exp.ui.caja.classList.remove("espacio"); }
});
