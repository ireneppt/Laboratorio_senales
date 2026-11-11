// Series que no se generan: importar, escribir o dibujar.
// ---------- Series que no se generan: importadas, escritas o dibujadas ----------
// Una serie de este tipo es una serie normal con tipo "manual", un origen ("importar", "escribir" o "dibujar")
// y su propia lista de valores (null = dato faltante). Cada origen enseña solo su panel.
const MAX_PUNTOS_MANUAL = 10000;
const NOMBRE_ORIGEN = { importar: "importada", escribir: "escrita", dibujar: "dibujada" };
const panelManual = document.getElementById("panel-manual");
const grupos = {
  importar: document.getElementById("grupo-importar"),
  escribir: document.getElementById("grupo-escribir"),
  dibujar: document.getElementById("grupo-dibujar"),
};
// Importar y escribir leen una tabla y dejan elegir la columna: cada uno con su selector y su texto de estado
const tablaUI = {
  importar: { campo: document.getElementById("importar-col-campo"), selector: document.getElementById("importar-columna"), estado: document.getElementById("importar-estado") },
  escribir: { campo: document.getElementById("escribir-col-campo"), selector: document.getElementById("escribir-columna"), estado: document.getElementById("escribir-estado") },
};
const textoManual = document.getElementById("manual-texto");           // en "Escribir o pegar"
const textoDibujo = document.getElementById("manual-texto-dibujar");   // en "Dibujar": los mismos valores, por escrito
const nManual = document.getElementById("manual-n");
const yMinManual = document.getElementById("manual-ymin");
const yMaxManual = document.getElementById("manual-ymax");
const botonDibujar = document.getElementById("manual-dibujar");
const graficaEl = document.getElementById("chart");
let dibujando = false;

function esManual(s) { return Boolean(s) && s.tipo === "manual"; }

// Lo que la gráfica espera de una serie (como lo que devuelve la API, sin componentes).
function recalcularManual(s) {
  const y = s.manual.y;
  s.datos = {
    x: y.map((_, i) => i), y, componentes: null, anomalias: [], huecos: [], y_completa: null,
    n_faltantes: y.filter((v) => v === null).length,
  };
}

function resumenManual(s) {
  const faltan = s.datos.n_faltantes;
  return `${s.manual.y.length} puntos  ·  serie ${NOMBRE_ORIGEN[s.origen]}` + (faltan ? `  ·  ${faltan} ${faltan === 1 ? "dato faltante" : "datos faltantes"}` : "");
}

// ----- Leer texto: una columna de valores, o una tabla (copiada de Excel o de un CSV) -----
// Devuelve { nombres, datos } con datos[fila][columna] = número o null.
function interpretarTexto(texto) {
  const lineas = texto.replace(/\r/g, "").split("\n");
  if (lineas.length && lineas[lineas.length - 1].trim() === "") lineas.pop(); // el salto de línea del final
  if (!lineas.some((l) => l.trim() !== "")) return { nombres: [], datos: [] };
  // Separador: tabulador (Excel), punto y coma o coma. Con coma como separador, los decimales llevan punto;
  // con cualquiera de los otros, la coma es el decimal (1,5).
  const hayTab = lineas.some((l) => l.includes("\t"));
  const hayPuntoComa = lineas.some((l) => l.includes(";"));
  const hayComa = lineas.some((l) => l.includes(","));
  const comaSepara = !hayTab && !hayPuntoComa && hayComa;
  const partir = hayTab ? (l) => l.split("\t") : hayPuntoComa ? (l) => l.split(";")
    : comaSepara ? (l) => l.split(",") : (l) => l.trim().split(/\s+/);
  const numero = (t) => {
    t = t.trim();
    if (t === "") return null;
    const v = Number(comaSepara ? t : t.replace(",", "."));
    return Number.isFinite(v) ? v : NaN; // NaN = texto
  };
  const filas = lineas.map((l) => partir(l).map((t) => t.trim()));
  // Primera fila de títulos: todas sus celdas con algo son texto
  const primera = filas.find((f) => f.some((t) => t !== ""));
  const conTitulos = primera.every((t) => t === "" || Number.isNaN(numero(t)));
  const nColumnas = Math.max(...filas.map((f) => f.length));
  const nombres = Array.from({ length: nColumnas }, (_, k) => (conTitulos && primera[k]) || `Columna ${k + 1}`);
  const cuerpo = conTitulos ? filas.slice(filas.indexOf(primera) + 1) : filas;
  const datos = cuerpo.map((f) => Array.from({ length: nColumnas }, (_, k) => {
    const v = numero(f[k] ?? "");
    return Number.isNaN(v) ? null : v;
  }));
  return { nombres, datos };
}

// Qué columna usar por defecto: la primera que sea en su mayoría numérica, saltándose un índice 0, 1, 2...
function columnaPorDefecto(tabla) {
  const n = tabla.nombres.length;
  const candidatas = [];
  for (let k = 0; k < n; k++) {
    const col = tabla.datos.map((f) => f[k]);
    const numericos = col.filter((v) => v !== null).length;
    if (numericos >= 0.5 * Math.max(col.length, 1) && numericos > 0) candidatas.push(k);
  }
  if (candidatas.length === 0) return 0;
  const esIndice = (k) => {
    const v = tabla.datos.map((f) => f[k]);
    return v.every((x, i) => x !== null && Number.isInteger(x) && (i === 0 || x === v[i - 1] + 1));
  };
  return candidatas.length > 1 && esIndice(candidatas[0]) ? candidatas[1] : candidatas[0];
}

// Ajusta el eje Y a los datos (un 10 % de margen), o a 0-100 si no hay ninguno.
function ajustarEjeY(s) {
  const valores = s.manual.y.filter((v) => v !== null);
  s.manual.baseY = null;
  if (valores.length === 0) { s.manual.yMin = 0; s.manual.yMax = 100; return; }
  const minimo = Math.min(...valores), maximo = Math.max(...valores);
  const margen = (maximo - minimo) * 0.1 || Math.abs(maximo) * 0.1 || 1;
  s.manual.yMin = Math.round((minimo - margen) * 100) / 100;
  s.manual.yMax = Math.round((maximo + margen) * 100) / 100;
}

// ----- Mantener al día panel, datos y gráfica -----
const textoDe = (s) => s.manual.y.map((v) => (v === null ? "" : v)).join("\n") + "\n";

// Rellena el panel de la serie con sus datos. "escribirTexto" es false mientras se teclea en el cuadro.
function pintarPanelManual(s, escribirTexto = true) {
  const total = s.manual.y.length;
  const resumen = `${total - s.datos.n_faltantes} de ${total} puntos con dato.`;
  if (s.origen === "importar" || s.origen === "escribir") {
    const ui = tablaUI[s.origen], tabla = s.manual.tabla;
    ui.campo.hidden = !(tabla && tabla.nombres.length > 1);
    if (tabla) {
      ui.selector.replaceChildren(...tabla.nombres.map((nombre, k) => new Option(nombre, k)));
      ui.selector.value = s.manual.col;
    }
    const archivo = s.origen === "importar" && s.manual.archivo ? `${s.manual.archivo}: ` : "";
    ui.estado.textContent = (s.origen === "importar" && !s.manual.archivo) ? "" : archivo + resumen
      + (s.manual.avisoCorte ? ` Se usaron solo los primeros ${MAX_PUNTOS_MANUAL}.` : "");
  }
  if (s.origen === "escribir" && escribirTexto) textoManual.value = s.manual.y.every((v) => v === null) ? "" : textoDe(s);
  if (s.origen === "dibujar" && escribirTexto) textoDibujo.value = s.manual.y.every((v) => v === null) ? "" : textoDe(s);
  if (s.origen === "dibujar") {
    nManual.value = total;
    yMinManual.value = s.manual.yMin;
    yMaxManual.value = s.manual.yMax;
  }
  actualizarResumenes(); // la línea de la sección "Serie" cuenta puntos y datos faltantes
}

function cambioManual(s, escribirTexto = true) {
  recalcularManual(s);
  pintarPanelManual(s, escribirTexto);
  pintar();
  programarPeriodo(s);   // el periodo estacional sugerido, en segundo plano
}

// Toma los valores de un texto (escrito, pegado o leído de un archivo).
function leerTexto(s, texto, ajustarEje) {
  const tabla = interpretarTexto(texto);
  let y;
  if (tabla.nombres.length === 0) {
    y = Array(s.manual.y.length || 100).fill(null); // texto vacío: se conserva el número de puntos
    s.manual.tabla = null;
  } else {
    s.manual.tabla = tabla;
    if (!(s.manual.col < tabla.nombres.length) || ajustarEje) s.manual.col = columnaPorDefecto(tabla);
    y = tabla.datos.map((f) => f[s.manual.col]);
  }
  s.manual.avisoCorte = y.length > MAX_PUNTOS_MANUAL;
  s.manual.y = y.slice(0, MAX_PUNTOS_MANUAL);
  if (ajustarEje) ajustarEjeY(s);
  cambioManual(s, false);
}

// ----- Escribir o pegar -----
// Al pegar, además de leer los datos se ajusta el eje Y a ellos; al teclear, el eje no se toca.
let temporizadorTexto = 0;
let pegado = false;
for (const caja of [textoManual, textoDibujo]) {
  caja.addEventListener("paste", () => { pegado = true; });
  caja.addEventListener("input", () => {
    const ajustarEje = pegado;
    pegado = false;
    clearTimeout(temporizadorTexto);
    temporizadorTexto = setTimeout(() => leerTexto(activa, caja.value, ajustarEje), 250);
  });
}

// ----- Elegir columna (importar y escribir) -----
for (const origen of ["importar", "escribir"]) {
  tablaUI[origen].selector.addEventListener("change", () => {
    const s = activa;
    s.manual.col = Number(tablaUI[origen].selector.value);
    s.manual.y = s.manual.tabla.datos.map((f) => f[s.manual.col]).slice(0, MAX_PUNTOS_MANUAL);
    ajustarEjeY(s);
    cambioManual(s, origen === "escribir");
  });
}

// ----- Importar un archivo: CSV / texto, o Excel (con la librería SheetJS, que se descarga al usarla) -----
function cargarXLSX() {
  return new Promise((listo, fallo) => {
    if (window.XLSX) return listo();
    const el = document.createElement("script");
    el.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    el.onload = listo;
    el.onerror = () => fallo(new Error("No se pudo cargar el lector de Excel (¿sin conexión?). Guarda la hoja como CSV e impórtala."));
    document.head.append(el);
  });
}

document.getElementById("manual-archivo").addEventListener("change", async (e) => {
  const archivo = e.target.files[0];
  e.target.value = ""; // permite elegir el mismo archivo otra vez
  if (!archivo) return;
  const s = activa;
  try {
    let texto;
    if (/\.xlsx?$/i.test(archivo.name)) {
      await cargarXLSX();
      const libro = XLSX.read(await archivo.arrayBuffer(), { type: "array" });
      const filas = XLSX.utils.sheet_to_json(libro.Sheets[libro.SheetNames[0]], { header: 1, raw: true, defval: "" });
      texto = filas.map((f) => f.map((c) => String(c)).join("\t")).join("\n");
    } else {
      texto = await archivo.text();
    }
    s.manual.archivo = archivo.name;
    leerTexto(s, texto, true);
  } catch (err) {
    tablaUI.importar.estado.textContent = err.message || "No se pudo leer el archivo.";
  }
});

// ----- Dibujar con el cursor -----
nManual.addEventListener("change", () => {
  const n = Math.min(Math.max(parseInt(nManual.value) || 0, 2), MAX_PUNTOS_MANUAL);
  const y = activa.manual.y;
  activa.manual.y = n <= y.length ? y.slice(0, n) : y.concat(Array(n - y.length).fill(null));
  cambioManual(activa);
});

document.getElementById("manual-borrar").addEventListener("click", () => {
  activa.manual.y = activa.manual.y.map(() => null);
  activa.manual.tabla = null;
  cambioManual(activa);
});

for (const [campo, clave] of [[yMinManual, "yMin"], [yMaxManual, "yMax"]]) {
  campo.addEventListener("input", () => {
    const v = parseFloat(campo.value);
    if (!Number.isFinite(v)) return;
    activa.manual[clave] = v;
    activa.manual.baseY = null; // un límite escrito a mano pasa a ser el nuevo original
    if (activa.manual.yMin < activa.manual.yMax) pintar();
  });
}

function actualizarBotonDibujo() {
  botonDibujar.setAttribute("aria-pressed", dibujando);
  botonDibujar.textContent = dibujando ? "Dibujo activado" : "Dibujo desactivado";
}

botonDibujar.addEventListener("click", () => {
  dibujando = !dibujando;
  if (dibujando && vista !== activa.id) { vista = activa.id; renderPestanasGrafica(); } // se dibuja sobre una sola serie
  actualizarBotonDibujo();
  pintar();
});

// Pixel del ratón -> punto de la serie y valor, con los ejes de Plotly. null si está fuera del dibujo.
// Con "libreY" el cursor puede salirse por arriba o por abajo del dibujo (para ampliar el eje y).
function posicionEnGrafica(e, libreY = false) {
  const lay = graficaEl._fullLayout;
  if (!lay || !lay.xaxis || !lay.yaxis) return null;
  const xa = lay.xaxis, ya = lay.yaxis, caja = graficaEl.getBoundingClientRect();
  const px = e.clientX - caja.left - xa._offset, py = e.clientY - caja.top - ya._offset;
  if (px < 0 || px > xa._length || (!libreY && (py < 0 || py > ya._length))) return null;
  // "exceso": cuánto se ha salido el cursor, como fracción de la altura del dibujo (+ por arriba, - por abajo)
  const exceso = py < 0 ? -py / ya._length : py > ya._length ? -(py - ya._length) / ya._length : 0;
  return { i: Math.round(xa.p2l(px)), v: Math.round(ya.p2l(py) * 100) / 100, exceso };
}

let trazo = null;          // último punto dibujado en el trazo en curso { i, v }
let repintadoPendiente = false;
let ultimoCrecimiento = null; // instante del último ajuste del eje y durante el trazo

function marcar(e) {
  const s = activa;
  // en mitad de un trazo el cursor puede salirse por arriba o por abajo: el eje y crece para seguirlo
  const pos = posicionEnGrafica(e, trazo !== null);
  if (!pos || pos.i < 0 || pos.i >= s.manual.y.length) { trazo = null; return; }
  // Fuera del dibujo el eje crece poco a poco: más rápido cuanto más lejos esté el cursor del borde.
  // El trazo se queda pegado al borde, no en el valor al que apunta el cursor (que se escaparía al crecer el eje).
  const m = s.manual;
  if (pos.exceso !== 0) {
    const ahora = performance.now();
    const dt = Math.min(ahora - (ultimoCrecimiento ?? ahora - 16), 100) / 1000;
    ultimoCrecimiento = ahora;
    const paso = (m.yMax - m.yMin) * Math.min(Math.abs(pos.exceso), 1) * dt * 0.3;
    // El eje solo puede crecer un 20 % del rango original (el de los campos Mínimo y Máximo del panel).
    // Ese límite se renueva al cambiar esos campos o al ajustar el eje a los datos.
    if (!m.baseY) m.baseY = { min: m.yMin, max: m.yMax };
    const margenMax = (m.baseY.max - m.baseY.min) * 0.2;
    if (pos.exceso > 0) { m.yMax = Math.min(Math.round((m.yMax + paso) * 100) / 100, m.baseY.max + margenMax); pos.v = m.yMax; }
    else { m.yMin = Math.max(Math.round((m.yMin - paso) * 100) / 100, m.baseY.min - margenMax); pos.v = m.yMin; }
    // los campos del panel muestran el límite actual (asignar .value no dispara "input", así que no renueva el original)
    yMinManual.value = m.yMin;
    yMaxManual.value = m.yMax;
  } else {
    ultimoCrecimiento = null;
  }
  const y = s.manual.y;
  if (trazo && Math.abs(pos.i - trazo.i) > 1) {
    // si el cursor va rápido salta puntos: se rellenan en línea recta entre el anterior y este
    const paso = Math.sign(pos.i - trazo.i);
    for (let k = trazo.i + paso; k !== pos.i; k += paso) {
      y[k] = Math.round((trazo.v + (pos.v - trazo.v) * (k - trazo.i) / (pos.i - trazo.i)) * 100) / 100;
    }
  }
  y[pos.i] = pos.v;
  trazo = pos;
  recalcularManual(s);
  if (!repintadoPendiente) {
    repintadoPendiente = true;
    requestAnimationFrame(() => { repintadoPendiente = false; pintar(); });
  }
}

const dibujandoAhora = () => dibujando && esManual(activa) && vista === activa.id;
graficaEl.addEventListener("pointerdown", (e) => {
  if (!dibujandoAhora() || e.button !== 0) return;
  graficaEl.setPointerCapture(e.pointerId);
  trazo = null;
  marcar(e);
});
graficaEl.addEventListener("pointermove", (e) => {
  if (!dibujandoAhora() || !graficaEl.hasPointerCapture(e.pointerId)) return;
  marcar(e);
});
const soltar = (e) => {
  if (!graficaEl.hasPointerCapture(e.pointerId)) return;
  graficaEl.releasePointerCapture(e.pointerId);
  trazo = null;
  pintarPanelManual(activa); // el cuadro de valores refleja lo dibujado
};
graficaEl.addEventListener("pointerup", soltar);
graficaEl.addEventListener("pointercancel", soltar);

// Doble clic para volver del zoom. Plotly solo lo reconoce si los dos clics son muy rápidos.
// Aquí vale cualquier par de clics seguidos (hasta medio segundo) sin arrastrar. Plotly tapa la gráfica
// con una capa mientras se pulsa el ratón, así que el "soltar" se escucha en todo el documento.
let pulsado = null;   // dónde y cuándo se pulsó dentro de la gráfica
let ultimoClic = null;
graficaEl.addEventListener("pointerdown", (e) => { pulsado = { x: e.clientX, y: e.clientY }; });
document.addEventListener("pointerup", (e) => {
  const inicio = pulsado;
  pulsado = null;
  if (!inicio || dibujandoAhora()) { ultimoClic = null; return; } // con el dibujo activo los ejes están fijos
  if (Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) > 5) { ultimoClic = null; return; } // fue un arrastre (zoom)
  const ahora = performance.now();
  if (ultimoClic && ahora - ultimoClic < 500) {
    ultimoClic = null;
    Plotly.relayout(graficaEl, { "xaxis.autorange": true, "yaxis.autorange": true });
  } else {
    ultimoClic = ahora;
  }
});

// ----- Crear series -----
// Enseña solo el panel del tipo de la serie activa; las dibujadas arrancan con el dibujo activado.
function mostrarModo(s) {
  form.classList.toggle("es-manual", esManual(s));
  panelManual.hidden = !esManual(s);
  for (const [origen, grupo] of Object.entries(grupos)) grupo.hidden = !(esManual(s) && s.origen === origen);
  dibujando = esManual(s) && s.origen === "dibujar";
  actualizarBotonDibujo();
  if (esManual(s)) pintarPanelManual(s);
}

function anadirSerieManual(origen) {
  guardarActiva();
  const s = nuevaSerie();
  s.tipo = "manual";
  s.origen = origen;
  s.nombre = `Serie ${NOMBRE_ORIGEN[origen]} ${s.id}`.slice(0, 30);
  s.manual = { y: Array(100).fill(null), yMin: 0, yMax: 100, col: 0, tabla: null, archivo: "", avisoCorte: false };
  s.periodo = periodoVacio();
  recalcularManual(s);
  series.push(s);
  activa = s;
  aplicarSerie(s);
  if (vista !== "todas" || origen === "dibujar") vista = s.id; // dibujar necesita ver solo esta serie
  renderPestanas();
  repintar();
  if (origen === "importar") document.getElementById("manual-archivo").click(); // abre el selector de archivos
  if (origen === "escribir") textoManual.focus();
}
