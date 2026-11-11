// Imputación, pestaña 2: variables explicativas.
// ----- Pestaña 2: Variables explicativas -----
// Se eligen, de entre las demás series del proyecto, las que se usarán como datos de entrada. Cada candidata dice
// si sirve para los huecos de la explicada (cobertura) y si es compatible (longitud, datos propios que faltan).
// En el proyecto solo se guarda cuáles se eligieron.
const expl = { ui: {}, token: 0, arrastrando: null, encima: null, normalizacion: "real", detalleAbierto: true };

const candidatasExplicativas = () => series.filter((x) => x.id !== imputacion.explicada.serieId);
const explicativasElegidas = () => imputacion.explicativas.map((id) => series.find((x) => x.id === id)).filter(Boolean);

// Lo que hay que imputar de la explicada: lo que ya le faltaba y lo que se le ha quitado
function objetivoDeExplicada() {
  const serie = serieExplicada();
  if (!serie || !serie.datos) return null;
  const y = serie.datos.y, n = y.length;
  const quitado = tramosAMascara(tramosQuitados(), n);
  const objetivo = y.map((v, i) => v === null || quitado[i]);
  return { serie, y, n, quitado, objetivo, aImputar: objetivo.filter(Boolean).length };
}

// ¿Sirve esta serie para imputar la explicada? Se compara punto a punto (el punto i con el punto i).
function evaluarCandidata(serie, obj) {
  const x = serie.datos.y, nx = x.length;
  let aImputar = 0, cubiertos = 0, comunes = 0, propios = 0;
  for (const v of x) if (v === null) propios++;
  for (let i = 0; i < obj.n; i++) {
    const hay = i < nx && x[i] !== null;
    if (obj.objetivo[i]) { aImputar++; if (hay) cubiertos++; } else if (hay) comunes++;
  }
  let nivel, texto;
  if (aImputar === 0) { nivel = "neutro"; texto = "Aún no hay huecos que cubrir"; }
  else if (cubiertos === 0) { nivel = "malo"; texto = "✕ No cubre ningún hueco"; }
  else if (comunes < 10) { nivel = "malo"; texto = `✕ Solo ${comunes} puntos en común con la explicada`; }
  else if (cubiertos < aImputar) { nivel = "aviso"; texto = `⚠ Cubre ${cubiertos} de ${aImputar} huecos`; }
  else if (nx !== obj.n) { nivel = "aviso"; texto = `⚠ Cubre los ${aImputar} huecos, pero tiene otra longitud`; }
  else { nivel = "ok"; texto = `✓ Cubre los ${aImputar} huecos`; }
  const notas = [];
  if (nx !== obj.n) notas.push(`Longitud ${nx} (la explicada: ${obj.n})`);
  if (propios) notas.push(propios === 1 ? "1 dato faltante propio" : `${propios} datos faltantes propios`);
  return { nx, propios, aImputar, cubiertos, comunes, nivel, texto, nota: notas.join(" · ") };
}

// ----- Montaje -----
function montarExplicativas() {
  const raiz = document.createElement("div");
  raiz.className = "exp";
  raiz.innerHTML = `
    <aside class="exp-lateral">
      <h3>Series disponibles</h3>
      <p class="ayuda">Arrastra las series al campo de la derecha (o púlsalas) para usarlas como explicativas. Cada una indica si sirve para los huecos de la explicada.</p>
      <ul class="exp-series" id="ev-lista"></ul>
    </aside>
    <section class="exp-principal">
      <div class="exp-aviso" id="ev-sin-explicada" hidden>
        <span>Primero elige la variable explicada: hace falta saber qué huecos hay que cubrir.</span>
        <button type="button" id="ev-ir-explicada">Elegir la variable explicada</button>
      </div>
      <div id="ev-trabajo">
        <div class="campo-soltar ev-campo" id="ev-campo" aria-live="polite"></div>
        <div class="ev-sel">
          <button type="button" id="ev-todas">Todas</button>
          <button type="button" id="ev-ninguna">Ninguna</button>
        </div>
        <div id="ev-resumen-caja" hidden>
          <div class="exp-contadores" id="ev-resumen"></div>
          <p class="ayuda" id="ev-resumen-texto" style="margin:10px 0 0"></p>
        </div>
        <div class="ev-sel">
          <label>Ver como
            <select id="ev-norm" aria-label="Escala de la vista previa">
              <option value="real">Tal cual (valores originales)</option>
              <option value="base100">Empezar todas en 100</option>
              <option value="z">Misma escala (media 0)</option>
              <option value="minmax">Min-max (de 0 a 1)</option>
            </select>
          </label>
          <small class="ayuda" style="margin:0">Arrastra sobre la gráfica para acercar; doble clic para verla entera. Lo naranja es lo que hay que imputar.</small>
        </div>
        <div id="ev-grafica"></div>
        <details class="exp-tramos" id="ev-detalle" open>
          <summary>Compatibilidad y cobertura de cada serie elegida</summary>
          <div class="exp-tramos-cuerpo" id="ev-tabla"></div>
        </details>
      </div>
    </section>`;
  const q = (sel) => raiz.querySelector(sel);
  expl.ui = {
    raiz, lista: q("#ev-lista"), campo: q("#ev-campo"), sinExplicada: q("#ev-sin-explicada"), trabajo: q("#ev-trabajo"),
    resumenCaja: q("#ev-resumen-caja"), resumen: q("#ev-resumen"), resumenTexto: q("#ev-resumen-texto"),
    norm: q("#ev-norm"), grafica: q("#ev-grafica"), detalle: q("#ev-detalle"), tabla: q("#ev-tabla"),
  };
  expl.ui.norm.value = expl.normalizacion;
  expl.ui.detalle.open = expl.detalleAbierto;
  for (const [clave, etiqueta, clase] of [["k", "Explicativas elegidas", ""], ["todas", "Cubiertos por todas", ""]]) {
    const tarjeta = document.createElement("div");
    tarjeta.className = "imp-dato " + clase;
    tarjeta.innerHTML = `<span></span><strong data-dato="${clave}">0</strong><small data-nota="${clave}"></small>`;
    tarjeta.querySelector("span").textContent = etiqueta;
    expl.ui.resumen.append(tarjeta);
  }
  enlazarExplicativas();
  return raiz;
}

async function actualizarExplicativas() {
  if (!expl.ui.lista || !expl.ui.lista.isConnected) return;
  const token = ++expl.token;
  guardarActiva();
  await Promise.all(series.map(asegurarDatos));
  if (token !== expl.token || !expl.ui.lista.isConnected) return;
  // lo elegido que ya no existe, o que ahora es la explicada, se quita
  imputacion.explicativas = imputacion.explicativas.filter((id) => id !== imputacion.explicada.serieId && series.some((x) => x.id === id));
  await refrescarExplicativas();
}

// ----- Pintar -----
async function refrescarExplicativas() {
  if (!expl.ui.lista || !expl.ui.lista.isConnected) return;
  const obj = objetivoDeExplicada();
  expl.ui.sinExplicada.hidden = Boolean(obj);
  expl.ui.trabajo.hidden = !obj;
  pintarListaExplicativas(obj);
  if (!obj) return;
  pintarCampoExplicativas(obj);
  pintarResumenExplicativas(obj);
  pintarTablaExplicativas(obj);
  await pintarGraficaExplicativas(obj);
}

function pintarListaExplicativas(obj) {
  const lista = expl.ui.lista, c = colores();
  lista.replaceChildren();
  for (const serie of candidatasExplicativas()) {
    const elegida = imputacion.explicativas.includes(serie.id);
    const li = document.createElement("li");
    li.className = "exp-serie" + (elegida ? " usada" : "");
    li.draggable = Boolean(obj);
    li.tabIndex = 0;
    li.setAttribute("role", "button");
    li.setAttribute("aria-pressed", elegida);
    li.dataset.id = serie.id;
    li.setAttribute("aria-label", `${elegida ? "Quitar" : "Usar"} ${nombreDe(serie)} ${elegida ? "de" : "como"} explicativa`);
    const texto = document.createElement("div");
    const nombre = document.createElement("strong");
    nombre.textContent = nombreDe(serie);
    const marca = document.createElement("span");
    marca.className = "marca";
    marca.textContent = " ✓";
    nombre.append(marca);
    const detalle = document.createElement("small");
    detalle.textContent = serie.datos ? `${serie.datos.y.length} puntos · ${textoTipo(serie)}` : textoTipo(serie);
    texto.append(nombre, detalle);
    li.append(crearPunto(serie.color), texto);
    if (obj && serie.datos) {
      const ev = evaluarCandidata(serie, obj);
      const insignia = document.createElement("div");
      insignia.className = "insignia " + ev.nivel;
      insignia.textContent = ev.texto;
      li.append(insignia);
      if (ev.nota) {
        const nota = document.createElement("div");
        nota.className = "nota";
        nota.textContent = ev.nota;
        li.append(nota);
      }
    }
    if (serie.datos) li.append(impMiniatura(serie.datos.y, colorDe(serie, c)));
    lista.append(li);
  }
  if (!lista.children.length) {
    const vacio = document.createElement("li");
    vacio.className = "ayuda";
    vacio.textContent = "No hay más series en el proyecto. Crea otras en la fase 1 para poder usarlas como explicativas.";
    lista.append(vacio);
  }
}

function pintarCampoExplicativas(obj) {
  const campo = expl.ui.campo;
  campo.replaceChildren();
  const elegidas = explicativasElegidas();
  campo.classList.toggle("encima", expl.encima !== null);
  campo.classList.toggle("llena", elegidas.length > 0 && expl.encima === null);
  if (!elegidas.length) {
    campo.textContent = expl.encima !== null ? "Suelta para usarla como explicativa" : "Arrastra aquí las series explicativas (o púlsalas en la lista)";
    return;
  }
  for (const serie of elegidas) {
    const chip = document.createElement("span");
    chip.className = "ev-chip";
    chip.append(crearPunto(serie.color), nombreDe(serie));
    if (serie.datos) {
      const ev = evaluarCandidata(serie, obj);
      const insignia = document.createElement("span");
      insignia.className = "insignia " + ev.nivel;
      insignia.textContent = ev.texto;
      chip.append(insignia);
    }
    const quitar = document.createElement("button");
    quitar.type = "button";
    quitar.dataset.quitar = serie.id;
    quitar.title = `Quitar ${nombreDe(serie)}`;
    quitar.setAttribute("aria-label", `Quitar ${nombreDe(serie)} de las explicativas`);
    quitar.textContent = "×";
    chip.append(quitar);
    campo.append(chip);
  }
}

function pintarResumenExplicativas(obj) {
  const elegidas = explicativasElegidas().filter((x) => x.datos);
  expl.ui.resumenCaja.hidden = elegidas.length === 0;
  if (!elegidas.length) return;
  let union = 0, todas = 0;
  for (let i = 0; i < obj.n; i++) {
    if (!obj.objetivo[i]) continue;
    const cuantas = elegidas.filter((x) => i < x.datos.y.length && x.datos.y[i] !== null).length;
    if (cuantas > 0) union++;
    if (cuantas === elegidas.length) todas++;
  }
  const poner = (clave, valor, nota = "") => {
    animarNumero(expl.ui.resumen.querySelector(`[data-dato="${clave}"]`), valor);
    expl.ui.resumen.querySelector(`[data-nota="${clave}"]`).textContent = nota;
  };
  const pct = (v) => (obj.aImputar ? `${((v / obj.aImputar) * 100).toFixed(0)} %` : "");
  poner("k", elegidas.length);
  poner("todas", todas, pct(todas));
  const sin = obj.aImputar - union;
  const texto = expl.ui.resumenTexto;
  if (!obj.aImputar) texto.textContent = "Todavía no hay huecos: quita tramos a la explicada en la pestaña 1, o ya tiene datos faltantes propios.";
  else if (sin > 0) texto.textContent = `⚠ ${sin} ${sin === 1 ? "punto" : "puntos"} no ${sin === 1 ? "lo cubre" : "los cubre"} ninguna explicativa: ahí solo se podría imputar con la propia serie.`;
  else if (todas === obj.aImputar) texto.textContent = "✓ Todas las explicativas tienen datos en todos los huecos.";
  else texto.textContent = "✓ Cada hueco lo cubre al menos una explicativa.";
}

function pintarTablaExplicativas(obj) {
  const tabla = expl.ui.tabla;
  tabla.replaceChildren();
  const elegidas = explicativasElegidas().filter((x) => x.datos);
  if (!elegidas.length) {
    const p = document.createElement("p");
    p.className = "ayuda";
    p.style.margin = "0";
    p.textContent = "Elige alguna serie para ver aquí su compatibilidad con la explicada.";
    tabla.append(p);
    return;
  }
  const rejilla = document.createElement("div");
  rejilla.className = "ev-tabla";
  for (const titulo of ["Serie", "Longitud", "Datos faltantes propios", "Cobertura de los huecos", "Puntos en común"]) {
    const celda = document.createElement("div");
    celda.className = "cab";
    celda.textContent = titulo;
    rejilla.append(celda);
  }
  for (const serie of elegidas) {
    const ev = evaluarCandidata(serie, obj);
    const celdas = [
      nombreDe(serie),
      ev.nx === obj.n ? `${ev.nx}` : `${ev.nx} (≠ ${obj.n})`,
      ev.propios ? `${ev.propios} (${((ev.propios / ev.nx) * 100).toFixed(1)} %)` : "ninguno",
      obj.aImputar ? `${ev.cubiertos} de ${ev.aImputar} (${((ev.cubiertos / ev.aImputar) * 100).toFixed(0)} %)` : "—",
      `${ev.comunes}`,
    ];
    celdas.forEach((valor, k) => {
      const celda = document.createElement("div");
      celda.textContent = valor;
      if (k === 0) celda.style.fontWeight = "650";
      if (k === 3 && obj.aImputar) {
        const barra = document.createElement("div");
        barra.className = "barra";
        const relleno = document.createElement("i");
        relleno.className = ev.nivel === "malo" ? "malo" : ev.cubiertos < ev.aImputar ? "aviso" : "";
        relleno.style.width = `${(ev.cubiertos / ev.aImputar) * 100}%`;
        barra.append(relleno);
        celda.append(barra);
      }
      rejilla.append(celda);
    });
  }
  tabla.append(rejilla);
}

// Cambia la escala de una serie para poder verla junto a otras. La media y la desviación de la explicada se
// calculan solo con lo que sigue ahí (lo quitado no cuenta: en la práctica no se conocería).
function escalarValores(valores, modo) {
  if (modo === "real") return valores;
  const conocidos = valores.filter((v) => v !== null);
  if (!conocidos.length) return valores;
  if (modo === "base100") {
    const base = conocidos.find((v) => v !== 0);
    return base === undefined ? valores : valores.map((v) => (v === null ? null : (v / Math.abs(base)) * 100));
  }
  if (modo === "minmax") {
    const minimo = Math.min(...conocidos), maximo = Math.max(...conocidos);
    const rango = maximo - minimo || 1;                       // una serie constante se queda en 0
    return valores.map((v) => (v === null ? null : (v - minimo) / rango));
  }
  const media = conocidos.reduce((a, b) => a + b, 0) / conocidos.length;
  const desviacion = Math.sqrt(conocidos.reduce((a, b) => a + (b - media) ** 2, 0) / conocidos.length) || 1;
  return valores.map((v) => (v === null ? null : (v - media) / desviacion));
}

async function pintarGraficaExplicativas(obj) {
  const grafica = expl.ui.grafica;
  if (!grafica || !grafica.isConnected) return;
  const c = colores();
  const modo = expl.normalizacion;
  const conocidaE = obj.y.map((v, i) => (obj.quitado[i] ? null : v));
  const trazas = [{
    x: obj.y.map((_, i) => i), y: escalarValores(conocidaE, modo), type: "scatter", mode: "lines",
    name: `${nombreDe(obj.serie)} (explicada)`, line: { color: colorDe(obj.serie, c), width: 3 },
    hovertemplate: "<b>%{y:.2f}</b>  ·  punto %{x}<extra>%{fullData.name}</extra>",
  }];
  for (const serie of explicativasElegidas()) {
    if (!serie.datos) continue;
    const x = serie.datos.y;
    trazas.push({
      x: x.map((_, i) => i), y: escalarValores(x, modo), type: "scatter", mode: "lines", name: nombreDe(serie),
      line: { color: colorDe(serie, c), width: 1.6 },
      hovertemplate: "<b>%{y:.2f}</b>  ·  punto %{x}<extra>%{fullData.name}</extra>",
    });
  }
  const banda = (a, b, color, opacidad) => ({
    type: "rect", xref: "x", yref: "paper", x0: a - 0.5, x1: b + 0.5, y0: 0, y1: 1,
    fillcolor: color, opacity: opacidad, line: { width: 0 }, layer: "below",
  });
  const bandas = [
    ...huecosDeOrigen(obj.y).map(([a, b]) => banda(a, b, c.muted, 0.2)),
    ...tramosQuitados().map(([a, b]) => banda(a, b, c.series[3], 0.28)),
  ];
  const eje = (texto) => ({
    title: texto ? { text: texto, font: { color: c.muted, size: 12 }, standoff: 8 } : undefined,
    gridcolor: c.grid, gridwidth: 1, zeroline: false, linecolor: c.axis, tickfont: { color: c.muted, size: 11 }, ticks: "",
  });
  await Plotly.react(grafica, trazas, {
    paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)", font: { family: c.fuente, color: c.ink2 },
    margin: { t: 34, r: 16, b: 40, l: 56 }, hovermode: "x unified", shapes: bandas,
    showlegend: trazas.length > 1, legend: { orientation: "h", x: 0, y: 1.14, font: { color: c.ink2, size: 12 } },
    xaxis: { ...eje("Punto"), showgrid: false, showline: true },
    yaxis: { ...eje(modo === "real" ? "Valor" : modo === "base100" ? "Base 100" : "Desviaciones típicas"), showline: false },
    hoverlabel: { bgcolor: c.surface, bordercolor: c.axis, font: { color: c.ink, family: c.fuente, size: 13 } },
  }, { responsive: true, displaylogo: false, displayModeBar: false });
}

// ----- Cambios -----
function cambiarExplicativas(ids) {
  const nuevas = [...new Set(ids)].filter((id) => id !== imputacion.explicada.serieId && series.some((x) => x.id === id));
  if (JSON.stringify(nuevas) === JSON.stringify(imputacion.explicativas)) return;
  imputacion.explicativas = nuevas;
  cambioImputacion();
  refrescarExplicativas();
}
const alternarExplicativa = (id) => cambiarExplicativas(
  imputacion.explicativas.includes(id) ? imputacion.explicativas.filter((x) => x !== id) : [...imputacion.explicativas, id],
);

function enlazarExplicativas() {
  const u = expl.ui;
  u.lista.addEventListener("click", (e) => {
    const li = e.target.closest(".exp-serie");
    if (li) alternarExplicativa(Number(li.dataset.id));
  });
  u.lista.addEventListener("keydown", (e) => {
    const li = e.target.closest(".exp-serie");
    if (li && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); alternarExplicativa(Number(li.dataset.id)); }
  });
  u.lista.addEventListener("dragstart", (e) => {
    const li = e.target.closest(".exp-serie");
    if (!li) return;
    e.dataTransfer.setData("text/plain", li.dataset.id);
    e.dataTransfer.effectAllowed = "copy";
    expl.arrastrando = Number(li.dataset.id);
    li.classList.add("arrastrando");
  });
  u.lista.addEventListener("dragend", () => { expl.arrastrando = null; expl.encima = null; refrescarExplicativas(); });
  const sobre = (e) => {
    if (expl.arrastrando === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (expl.encima !== expl.arrastrando) { expl.encima = expl.arrastrando; const obj = objetivoDeExplicada(); if (obj) pintarCampoExplicativas(obj); }
  };
  u.campo.addEventListener("dragenter", sobre);
  u.campo.addEventListener("dragover", sobre);
  u.campo.addEventListener("dragleave", (e) => {
    if (!u.campo.contains(e.relatedTarget) && expl.encima !== null) { expl.encima = null; const obj = objetivoDeExplicada(); if (obj) pintarCampoExplicativas(obj); }
  });
  u.campo.addEventListener("drop", (e) => {
    e.preventDefault();
    const dato = Number(e.dataTransfer.getData("text/plain"));
    const id = Number.isFinite(dato) && dato > 0 ? dato : expl.arrastrando;
    expl.encima = null;
    expl.arrastrando = null;
    if (id && !imputacion.explicativas.includes(id)) cambiarExplicativas([...imputacion.explicativas, id]); else refrescarExplicativas();
  });
  u.campo.addEventListener("click", (e) => {
    const boton = e.target.closest("[data-quitar]");
    if (boton) cambiarExplicativas(imputacion.explicativas.filter((id) => id !== Number(boton.dataset.quitar)));
  });
  u.raiz.querySelector("#ev-todas").addEventListener("click", () => cambiarExplicativas(candidatasExplicativas().map((x) => x.id)));
  u.raiz.querySelector("#ev-ninguna").addEventListener("click", () => cambiarExplicativas([]));
  u.norm.addEventListener("change", () => {
    expl.normalizacion = u.norm.value;
    const obj = objetivoDeExplicada();
    if (obj) pintarGraficaExplicativas(obj);
  });
  u.detalle.addEventListener("toggle", () => { expl.detalleAbierto = u.detalle.open; });
  u.raiz.querySelector("#ev-ir-explicada").addEventListener("click", () => irAPestanaImputacion("explicada"));
}
