// Imputación, pestaña 5: selección.
// Se elige qué método deja la serie final y se obtiene esa serie: los datos reales, con los huecos que ya tenía la
// explicada rellenados con el método elegido (los tramos que se quitaron para probar vuelven a su valor real).
// Los candidatos son los métodos marcados en «Imputación y resultados»; sus errores salen de la misma validación.
// En el proyecto solo se guarda cuál se eligió (clave "método@ventana"); la serie se recalcula al abrir.
const sel = { ui: {}, token: 0, controlador: null, cargando: false, error: "", candidatos: null, final: null };

// ----- Cálculo (sin pantalla) -----
// Las dos recomendaciones: la de menor error y la que mejor conserva la variación de la serie (razón de varianzas más cerca de 1)
function recomendaciones(filas) {
  const validas = filas.filter((f) => !f.error && f.metricas);
  const conError = validas.filter((f) => f.metricas.rmse !== null && f.metricas.rmse !== undefined);
  const conVarianza = validas.filter((f) => f.metricas.razon_var !== null && f.metricas.razon_var !== undefined);
  const menor = (lista, valor) => lista.reduce((mejor, f) => (mejor === null || valor(f) < valor(mejor) ? f : mejor), null);
  return {
    menorError: menor(conError, (f) => f.metricas.rmse),
    mejorEstructura: menor(conVarianza, (f) => Math.abs(f.metricas.razon_var - 1)),
  };
}

// La serie final: lo conocido tal cual y, donde faltaba, lo imputado (null si el método no pudo)
const serieFinalDe = (y, imputado) => y.map((v, i) => (v !== null && v !== undefined ? v : (imputado && imputado[i] !== undefined ? imputado[i] : null)));

// Los puntos con intervalo, o null si el método no lo da
function intervaloDe(respuesta, y) {
  const iv = respuesta && respuesta.intervalo;
  if (!iv) return null;
  return { inferior: y.map((v, i) => (v === null ? iv.inferior[i] : null)), superior: y.map((v, i) => (v === null ? iv.superior[i] : null)) };
}

function csvDeSeleccion(y, final, intervalo) {
  const filas = [["punto", "valor", "imputado", "inferior_95", "superior_95"].join(";")];
  for (let i = 0; i < y.length; i++) {
    const imputado = y[i] === null && final[i] !== null;
    filas.push([i, numeroCSV(final[i]), imputado ? 1 : 0, imputado && intervalo ? numeroCSV(intervalo.inferior[i]) : "", imputado && intervalo ? numeroCSV(intervalo.superior[i]) : ""].join(";"));
  }
  return "﻿" + filas.join("\r\n") + "\r\n";
}

// Los parámetros de un método, en palabras ("k 3 · semilla 42")
function textoParametros(pedido) {
  const definiciones = PARAMETROS_DE_METODO[pedido.metodo] || [];
  const partes = Object.entries(pedido.parametros || {}).map(([api, valor]) => {
    const d = definiciones.find((x) => x.api === api);
    const nombre = d ? d.texto.toLowerCase() : api;
    return `${nombre} ${typeof valor === "boolean" ? (valor ? "sí" : "no") : valor}`;
  });
  return partes.join(" · ");
}

// ----- Datos: los candidatos y la serie final -----
async function cargarCandidatos(obj, signal) {
  const specs = subpestanasImputacion().filter((s) => s.id !== "comparacion").map(especificacion).filter((e) => e.ids.length);
  const respuestas = await Promise.all(specs.map((e) => pedirConjunto(e, obj, signal)));
  const fallo = respuestas.find((r) => r.error);
  if (fallo) throw new Error(fallo.error);
  const filas = [];
  specs.forEach((spec, i) => {
    const resultados = (respuestas[i].datos && respuestas[i].datos.resultados) || [];
    for (const m of METODOS_IMPUTACION) {
      if (!spec.ids.includes(m.id)) continue;
      const r = resultados.find((x) => x.metodo === m.id) || { error: "Sin resultado" };
      filas.push({ ...r, clave: `${m.id}@${spec.sub.id}`, metodo: m.id, nombre: m.nombre, ventana: spec.sub, conjunto: etiquetaConjunto(spec.sub) });
    }
  });
  return filas;
}

// Qué fila está elegida: la guardada si sigue siendo candidata y, si no, la de menor error (sin guardarla todavía)
function eleccionEfectiva(filas) {
  const guardada = imputacion.seleccion && filas.find((f) => f.clave === imputacion.seleccion.clave && !f.error);
  if (guardada) return { fila: guardada, porDefecto: false };
  const { menorError } = recomendaciones(filas);
  if (menorError) return { fila: menorError, porDefecto: true };
  const primera = filas.find((f) => !f.error);
  return primera ? { fila: primera, porDefecto: true } : { fila: null, porDefecto: true };
}

// Imputa con el método elegido SIN quitar nada: lo que falta de verdad
async function calcularFinal(fila, obj, signal) {
  const pedido = pedidosDe([fila.metodo])[0];
  const cuerpo = JSON.stringify({ y: obj.y, quitados: [], explicativas: (fila.ventana.series || []).map((x) => x.datos.y), metodos: [pedido], comparar_con: [] });
  const respuesta = await fetch("/api/imputar", { method: "POST", headers: { "Content-Type": "application/json" }, body: cuerpo, signal });
  const datos = await respuesta.json();
  if (!respuesta.ok) throw new Error(typeof datos.detail === "string" ? datos.detail : "El servidor no ha podido imputar con estos datos.");
  const resultado = datos.resultados[0];
  if (resultado.error) throw new Error(resultado.error);
  return { clave: fila.clave, pedido, respuesta: resultado, final: serieFinalDe(obj.y, resultado.imputado), intervalo: intervaloDe(resultado, obj.y) };
}

// ----- Montaje -----
function montarSeleccion() {
  const raiz = document.createElement("div");
  raiz.className = "sel";
  raiz.innerHTML = `
    <div class="exp-aviso" id="sel-falta" hidden>
      <span id="sel-falta-texto"></span>
      <button type="button" id="sel-falta-ir"></button>
    </div>
    <div id="sel-trabajo" hidden>
      <section class="sel-bloque">
        <h3>1 · Elige el método</h3>
        <p class="ayuda" id="sel-recomendacion"></p>
        <div class="sel-tabla-caja"><table class="sel-tabla" id="sel-tabla"></table></div>
      </section>
      <section class="sel-bloque">
        <h3>2 · Serie final</h3>
        <div class="res-estado" id="sel-estado" role="status"></div>
        <div id="sel-grafica"></div>
        <dl class="sel-resumen" id="sel-resumen"></dl>
        <div class="sel-acciones">
          <button type="button" id="sel-descargar">Descargar CSV</button>
          <button type="button" id="sel-serie-nueva" title="Añade la serie final como una serie más del proyecto, para usarla en las fases siguientes">Guardar como serie nueva</button>
        </div>
        <p class="ayuda" id="sel-aviso-guardada" role="status" hidden></p>
      </section>
    </div>`;
  const q = (s) => raiz.querySelector(s);
  sel.ui = {
    raiz, falta: q("#sel-falta"), faltaTexto: q("#sel-falta-texto"), faltaIr: q("#sel-falta-ir"), trabajo: q("#sel-trabajo"),
    recomendacion: q("#sel-recomendacion"), tabla: q("#sel-tabla"), estado: q("#sel-estado"), grafica: q("#sel-grafica"), resumen: q("#sel-resumen"),
    descargar: q("#sel-descargar"), serieNueva: q("#sel-serie-nueva"), avisoGuardada: q("#sel-aviso-guardada"),
  };
  sel.ui.tabla.addEventListener("change", (e) => {
    const radio = e.target.closest('input[name="sel-metodo"]');
    if (!radio) return;
    imputacion.seleccion = { clave: radio.value };
    cambioImputacion();
    actualizarSeleccion();
  });
  sel.ui.descargar.addEventListener("click", descargarSeleccion);
  sel.ui.serieNueva.addEventListener("click", guardarSeleccionComoSerie);
  return raiz;
}

function mostrarFalta(texto, boton, destino) {
  sel.ui.falta.hidden = false;
  sel.ui.trabajo.hidden = true;
  sel.ui.faltaTexto.textContent = texto;
  sel.ui.faltaIr.textContent = boton;
  sel.ui.faltaIr.onclick = () => irAPestanaImputacion(destino);
}

async function actualizarSeleccion() {
  const u = sel.ui;
  if (!u.tabla || !u.tabla.isConnected) return;
  const obj = objetivoDeExplicada();
  if (!obj) { mostrarFalta("Primero elige la variable explicada.", "Elegir la variable explicada", "explicada"); return; }
  const faltantes = obj.y.filter((v) => v === null).length;
  if (faltantes === 0) { mostrarFalta("La variable explicada no tiene datos faltantes: no hay nada que imputar. Los tramos que quites en la pestaña 1 sirven solo para probar los métodos.", "Ir a la variable explicada", "explicada"); return; }
  const marcados = subpestanasImputacion().filter((s) => s.id !== "comparacion").some((s) => especificacion(s).ids.length);
  if (!marcados) { mostrarFalta("Aún no has marcado ningún método para comparar.", "Ir a «Imputación y resultados»", "resultados"); return; }
  u.falta.hidden = true;
  u.trabajo.hidden = false;

  const token = ++sel.token;
  if (sel.controlador) sel.controlador.abort();
  sel.controlador = new AbortController();
  sel.cargando = true;
  sel.error = "";
  u.estado.textContent = "Calculando…";
  u.estado.classList.remove("error");
  try {
    sel.candidatos = await cargarCandidatos(obj, sel.controlador.signal);
    if (token !== sel.token) return;
    pintarCandidatos();
    const { fila } = eleccionEfectiva(sel.candidatos);
    if (!fila) { sel.final = null; sel.error = "Ningún método marcado ha podido imputar con estos datos."; }
    else sel.final = await calcularFinal(fila, obj, sel.controlador.signal);
    if (token !== sel.token) return;
  } catch (err) {
    if (err.name === "AbortError" || token !== sel.token) return;
    sel.final = null;
    sel.error = err.message || "No se pudo conectar con el servidor.";
  }
  sel.cargando = false;
  if (u.tabla.isConnected) pintarFinal(obj);
}

// ----- Pintar -----
const metrica = (f, clave, formato) => (f.metricas && f.metricas[clave] !== null && f.metricas[clave] !== undefined ? formato(f.metricas[clave]) : "—");

function pintarCandidatos() {
  const u = sel.ui;
  const filas = sel.candidatos || [];
  const { fila: elegida, porDefecto } = eleccionEfectiva(filas);
  const { menorError, mejorEstructura } = recomendaciones(filas);
  const nombreFila = (f) => (f.conjunto === "—" ? f.nombre : `${f.nombre} · ${f.conjunto}`);

  if (!menorError) {
    u.recomendacion.textContent = "No has quitado ningún tramo con valor real, así que no se puede medir el error de cada método: elige el que prefieras. Para tener una recomendación, quita algún tramo en la pestaña 1.";
  } else {
    let texto = `Menor error: ${nombreFila(menorError)} (RMSE ${metrica(menorError, "rmse", numeroResultado)}).`;
    if (mejorEstructura && mejorEstructura.clave !== menorError.clave) {
      texto += ` Si te importa más conservar cómo varía la serie: ${nombreFila(mejorEstructura)} (razón de varianzas ${metrica(mejorEstructura, "razon_var", decimalesResultado)}, la más cercana a 1).`;
    }
    texto += porDefecto ? " Está marcado el de menor error; cambia la elección si prefieres otro." : "";
    u.recomendacion.textContent = texto;
  }

  const t = u.tabla;
  t.replaceChildren();
  const cab = t.createTHead().insertRow();
  for (const [texto, ayuda] of [["", ""], ["Método", ""], ["Explicativas", "Con qué explicativas se ha calculado"], ["RMSE", "Error típico sobre los tramos quitados. Menos es mejor."],
    ["Razón de varianzas", "Varianza de lo imputado / varianza de lo real. Lo mejor, cerca de 1."], ["Cambio en la correlación", "Cuánto cambia la relación con las explicativas. Menos es mejor."]]) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = texto;
    if (ayuda) th.title = ayuda;
    cab.append(th);
  }
  const cuerpo = t.createTBody();
  for (const f of filas) {
    const tr = cuerpo.insertRow();
    tr.className = elegida && f.clave === elegida.clave ? "elegida" : "";
    const celdaRadio = tr.insertCell();
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "sel-metodo";
    radio.value = f.clave;
    radio.checked = Boolean(elegida && f.clave === elegida.clave);
    radio.disabled = Boolean(f.error);
    radio.setAttribute("aria-label", `Elegir ${nombreFila(f)}`);
    celdaRadio.append(radio);
    const celdaNombre = tr.insertCell();
    celdaNombre.textContent = f.nombre;
    for (const [marca, es] of [["menor error", menorError], ["mejor estructura", mejorEstructura]]) {
      if (es && es.clave === f.clave) { const b = document.createElement("span"); b.className = "sel-marca"; b.textContent = marca; celdaNombre.append(" ", b); }
    }
    tr.insertCell().textContent = f.conjunto === "—" ? "Sin explicativas" : f.conjunto;
    if (f.error) {
      const c = tr.insertCell();
      c.colSpan = 3;
      c.className = "sel-error";
      c.textContent = f.error;
    } else {
      tr.insertCell().textContent = metrica(f, "rmse", numeroResultado);
      tr.insertCell().textContent = metrica(f, "razon_var", decimalesResultado);
      tr.insertCell().textContent = metrica(f, "sesgo_corr", decimalesResultado);
    }
  }
}

function pintarFinal(obj) {
  const u = sel.ui;
  u.avisoGuardada.hidden = true;
  const f = sel.final;
  u.descargar.disabled = u.serieNueva.disabled = !f;
  u.resumen.replaceChildren();
  if (!f) {
    u.estado.textContent = sel.error || "";
    u.estado.classList.toggle("error", Boolean(sel.error));
    try { Plotly.purge(u.grafica); } catch { /* aún no había gráfica */ }
    return;
  }
  u.estado.textContent = "";
  u.estado.classList.remove("error");
  const c = colores();
  const y = obj.y, n = y.length, final = f.final;
  const x = y.map((_, i) => i);
  const fila = (sel.candidatos || []).find((r) => r.clave === f.clave);
  const nombreMetodo = fila ? fila.nombre : f.pedido.metodo;
  const colorMetodo = colorDeMetodo(f.pedido.metodo, c);

  // lo conocido y, aparte, lo imputado (con un punto de cada lado para que la línea no quede cortada)
  const imputadoTraza = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (y[i] !== null) continue;
    for (const j of [i - 1, i, i + 1]) if (j >= 0 && j < n && final[j] !== null) imputadoTraza[j] = final[j];
  }
  const trazas = [];
  if (f.intervalo) {
    const rodear = (valores) => valores.map((v, i) => (v !== null ? v : [i - 1, i + 1].some((j) => j >= 0 && j < n && y[j] === null && valores[j] !== null) ? final[i] : null));
    trazas.push({ x, y: rodear(f.intervalo.superior), type: "scatter", mode: "lines", line: { width: 0 }, hoverinfo: "skip", showlegend: false });
    trazas.push({ x, y: rodear(f.intervalo.inferior), type: "scatter", mode: "lines", line: { width: 0 }, fill: "tonexty", fillcolor: colorMetodo + "33", hoverinfo: "skip", name: "Intervalo del 95 %" });
  }
  trazas.push({ x, y, type: "scatter", mode: "lines", name: `${nombreDe(obj.serie)} (conocido)`, line: { color: colorDe(obj.serie, c), width: 2 }, hovertemplate: "<b>%{y:.2f}</b>  ·  punto %{x}<extra>conocido</extra>" });
  trazas.push({ x, y: imputadoTraza, type: "scatter", mode: "lines+markers", name: `Imputado (${nombreMetodo})`, line: { color: colorMetodo, width: 2 }, marker: { size: 4 }, hovertemplate: "<b>%{y:.2f}</b>  ·  punto %{x}<extra>imputado</extra>" });
  const eje = (texto) => ({ title: { text: texto, font: { color: c.muted, size: 12 }, standoff: 8 }, gridcolor: c.grid, gridwidth: 1, zeroline: false, linecolor: c.axis, tickfont: { color: c.muted, size: 11 }, ticks: "" });
  const bandas = huecosDeOrigen(y).map(([a, b]) => ({ type: "rect", xref: "x", yref: "paper", x0: a - 0.5, x1: b + 0.5, y0: 0, y1: 1, fillcolor: c.muted, opacity: 0.15, line: { width: 0 }, layer: "below" }));
  Plotly.react(u.grafica, trazas, {
    paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)", font: { family: c.fuente, color: c.ink2 },
    margin: { t: 16, r: 16, b: 90, l: 56 }, hovermode: "x unified", shapes: bandas, showlegend: true,
    legend: { orientation: "h", x: 0, y: -0.3, yanchor: "top", font: { color: c.ink2, size: 12 } },
    xaxis: { ...eje("Punto"), showgrid: false, showline: true }, yaxis: { ...eje("Valor"), showline: false },
    hoverlabel: { bgcolor: c.surface, bordercolor: c.axis, font: { color: c.ink, family: c.fuente, size: 13 } },
  }, { responsive: true, displaylogo: false, displayModeBar: false });

  // resumen
  const faltantes = y.filter((v) => v === null).length;
  const sinImputar = y.filter((v, i) => v === null && final[i] === null).length;
  const imputados = faltantes - sinImputar;
  const porcentaje = (faltantes / n) * 100;
  const formatoPorcentaje = porcentaje.toLocaleString("es-ES", { maximumFractionDigits: 1 });
  const entradas = [
    ["Serie", `${nombreDe(obj.serie)} · ${n} puntos`],
    ["Datos faltantes", `${faltantes} (${formatoPorcentaje} %)${porcentaje > 5 ? ". Regla orientativa del manual: con más de un 5 % no se descartan los casos, se imputan. Conviene interpretar lo imputado con cuidado." : ""}`],
    ["Imputados", sinImputar ? `${imputados} de ${faltantes}. ${sinImputar} no se han podido imputar con este método (quedan sin dato).` : `${imputados} de ${faltantes}`],
    ["Método", [nombreMetodo, fila && fila.conjunto !== "—" ? `con ${fila.conjunto}` : "", textoParametros(f.pedido)].filter(Boolean).join(" · ")],
  ];
  if (fila && fila.metricas && fila.metricas.rmse !== null && fila.metricas.rmse !== undefined) {
    entradas.push(["Error al validar", `RMSE ${metrica(fila, "rmse", numeroResultado)} · MAE ${metrica(fila, "mae", numeroResultado)}, sobre los ${fila.metricas.n} puntos que quitaste para probar.`]);
  } else {
    entradas.push(["Error al validar", "No se ha podido medir: no has quitado ningún tramo con valor real."]);
  }
  if (f.intervalo) {
    const anchos = y.map((v, i) => (v === null && f.intervalo.superior[i] !== null && f.intervalo.inferior[i] !== null ? f.intervalo.superior[i] - f.intervalo.inferior[i] : null)).filter((v) => v !== null);
    const media = anchos.length ? anchos.reduce((a, b) => a + b, 0) / anchos.length : null;
    entradas.push(["Fiabilidad", `Intervalo del 95 % en cada valor imputado${media !== null ? `, de anchura media ${numeroResultado(media)}` : ""}. Va en el CSV.`]);
  } else {
    entradas.push(["Fiabilidad", f.pedido.metodo === "imputacion_multiple" ? "Este método da N series; aquí se usa su combinación y no se muestra su dispersión." : "Este método no da intervalo de los valores imputados."]);
  }
  for (const [nombre, texto] of entradas) {
    const caja = document.createElement("div");
    const dt = document.createElement("dt");
    dt.textContent = nombre;
    const dd = document.createElement("dd");
    dd.textContent = texto;
    caja.append(dt, dd);
    u.resumen.append(caja);
  }
}

// ----- Acciones -----
function descargarSeleccion() {
  const obj = objetivoDeExplicada();
  const f = sel.final;
  if (!obj || !f) return;
  descargarArchivo(csvDeSeleccion(obj.y, f.final, f.intervalo), "text/csv;charset=utf-8", `${nombreParaArchivo(nombreDe(obj.serie), "serie")}_imputada.csv`);
}

// La serie final como una serie más del proyecto (escrita a mano, no ligada al método), por si hace falta en las fases siguientes
function guardarSeleccionComoSerie() {
  const obj = objetivoDeExplicada();
  const f = sel.final;
  if (!obj || !f) return;
  guardarActiva();
  const s = nuevaSerie();
  s.tipo = "manual";
  s.origen = "escribir";
  s.nombre = `${nombreDe(obj.serie)} (imputada)`.slice(0, 30);
  const valores = f.final.map((v) => (v === null ? null : Number(v)));
  const conocidos = valores.filter((v) => v !== null);
  s.manual = { y: valores, yMin: conocidos.length ? Math.min(...conocidos) : 0, yMax: conocidos.length ? Math.max(...conocidos) : 100, col: 0, tabla: null, archivo: "", avisoCorte: false };
  s.periodo = periodoVacio();
  recalcularManual(s);
  series.push(s);
  renderPestanas();
  if (typeof programarPeriodo === "function") programarPeriodo(s);
  programarEstadoProyecto();
  sel.ui.avisoGuardada.textContent = `Añadida como «${nombreDe(s)}» a las series del proyecto (fase 1).`;
  sel.ui.avisoGuardada.hidden = false;
}
