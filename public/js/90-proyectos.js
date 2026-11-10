// Proyectos: guardar, abrir, exportar y copia automática.
// ---------- Proyectos: guardar, abrir y exportar el trabajo ----------
// Un proyecto es el conjunto de series de la pantalla. De cada serie generada se guarda solo su configuración
// (con las semillas, así que sale idéntica); de las manuales, sus valores. Nada de lo que es solo de pantalla
// (pestaña abierta, zoom, secciones plegadas) forma parte del proyecto.
const FORMATO = "laboratorio-senales";
const VERSION_FORMATO = 5;          // sube cuando cambie el formato; MIGRACIONES[n] pasa de la versión n a la n+1
const MIGRACIONES = {
  1: (doc) => ({ ...doc, version: 2, imputacion: estadoImputacionVacio() }), // v2 añade la fase de imputación
  2: (doc) => ({ ...doc, version: 3, imputacion: { ...doc.imputacion, explicativas: [] } }), // v3 añade las variables explicativas
  3: (doc) => ({ ...doc, version: 4, imputacion: { ...doc.imputacion, metodos: [], parametros: PARAMETROS_IMPUTACION_INICIALES() } }), // v4 añade los métodos de imputación
  4: (doc) => {                                                                                                                       // v5: los métodos se eligen por ventana (sin / todas / solo X)
    const antiguos = Array.isArray(doc.imputacion.metodos) ? doc.imputacion.metodos : [];
    const elegidos = (conExplicativas) => METODOS_IMPUTACION.filter((m) => m.explicativas === conExplicativas && antiguos.includes(m.id)).map((m) => m.id);
    const metodos = { sin: elegidos(false), todas: elegidos(true) };
    for (const id of doc.imputacion.explicativas || []) metodos[`solo:${id}`] = elegidos(true);
    return { ...doc, version: 5, imputacion: { ...doc.imputacion, metodos } };
  },
};
const ID_BORRADOR = "__borrador__"; // copia automática del trabajo sin guardar, por si se cierra la página
const NOMBRE_SIN_TITULO = "Proyecto sin título";
const inputProyecto = document.getElementById("p-nombre");
const estadoProyecto = document.getElementById("p-estado");
const dialogoProyectos = document.getElementById("dialogo-proyectos");
const listaProyectos = document.getElementById("lista-proyectos");
const bannerRecuperar = document.getElementById("banner-recuperar");

const ahora = () => new Date().toISOString();
const nuevoId = () => (self.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const nombreProyecto = () => inputProyecto.value.trim() || NOMBRE_SIN_TITULO;
const fechaLegible = (iso) => new Date(iso).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });

// Almacén de proyectos: lo único que sabe DÓNDE se guarda. Hoy es el navegador (IndexedDB); un servidor lo
// sustituiría con las mismas cuatro operaciones, sin tocar el resto de la página.
const almacen = (() => {
  const TIENDA = "proyectos";
  let bd = null;
  const abrir = () => bd ? Promise.resolve(bd) : new Promise((listo, fallo) => {
    if (!self.indexedDB) return fallo(new Error("Este navegador no permite guardar proyectos."));
    const peticion = indexedDB.open("laboratorio-senales", 1);
    peticion.onupgradeneeded = () => peticion.result.createObjectStore(TIENDA, { keyPath: "id" });
    peticion.onsuccess = () => { bd = peticion.result; listo(bd); };
    peticion.onerror = () => fallo(peticion.error);
  });
  const operar = async (modo, accion) => {
    const base = await abrir();
    return new Promise((listo, fallo) => {
      const transaccion = base.transaction(TIENDA, modo);
      const peticion = accion(transaccion.objectStore(TIENDA));
      transaccion.oncomplete = () => listo(peticion.result);
      transaccion.onerror = transaccion.onabort = () => fallo(transaccion.error);
    });
  };
  return {
    // [{ id, nombre, modificado, nSeries }], el más reciente primero
    async listar() {
      const todos = await operar("readonly", (t) => t.getAll());
      return todos.filter((p) => p.id !== ID_BORRADOR)
        .map((p) => ({ id: p.id, nombre: p.nombre, modificado: p.modificado, nSeries: p.series.length }))
        .sort((a, b) => b.modificado.localeCompare(a.modificado));
    },
    leer: (id) => operar("readonly", (t) => t.get(id)),
    guardar: (registro) => operar("readwrite", (t) => t.put(registro)),
    borrar: (id) => operar("readwrite", (t) => t.delete(id)),
  };
})();

// ----- De la pantalla al proyecto, y al revés -----
let proyecto = { id: null, creado: null }; // id null = todavía no se ha guardado
let ultimaGuardada = "";                   // cómo estaba el trabajo al guardarlo o abrirlo (para saber si hay cambios)

function serializarSeries() {
  guardarActiva();
  return series.map((s) => {
    const comun = { id: s.id, nombre: s.nombre, slot: s.slot, color: s.color };
    return esManual(s)
      ? { ...comun, tipo: "manual", origen: s.origen, manual: { y: s.manual.y, yMin: s.manual.yMin, yMax: s.manual.yMax, col: s.manual.col, archivo: s.manual.archivo } }
      : { ...comun, tipo: "generada", estado: s.estado };
  });
}

function construirDoc() {
  return { formato: FORMATO, version: VERSION_FORMATO, id: proyecto.id, nombre: nombreProyecto(), creado: proyecto.creado, modificado: ahora(), series: serializarSeries(), imputacion: impClonar(imputacion) };
}

// Claves ordenadas: el mismo contenido da siempre el mismo texto, aunque los campos estén en otro orden
const ordenarClaves = (_, valor) => valor && typeof valor === "object" && !Array.isArray(valor)
  ? Object.fromEntries(Object.entries(valor).sort(([a], [b]) => a.localeCompare(b))) : valor;
const instantanea = () => JSON.stringify({ nombre: nombreProyecto(), series: serializarSeries(), imputacion }, ordenarClaves);

// Un proyecto guardado con menos campos (de una versión anterior) se completa con los valores por defecto.
function estadoDesdeGuardado(guardado) {
  const base = estadoSoloNivel();
  const e = { ...base, ...guardado };
  e.estacionalidades = (guardado.estacionalidades ?? base.estacionalidades).map((x) => ({
    periodo: String(PERIODOS_INICIALES[0]), modo: "aditiva", minimo: "-10", maximo: "10", minimo_fin: "-20", maximo_fin: "20", definicion: "minmax", ...x,
  }));
  e.ciclos = (guardado.ciclos ?? base.ciclos).map((c) => ({ ...CICLO_INICIAL, semilla: String(nuevaSemilla()), definicion: "minmax", ...c }));
  e.anomalias = guardado.anomalias ?? [];
  e.huecos = guardado.huecos ?? [];
  return e;
}

function serieDesdeGuardada(g) {
  const id = ++contadorSeries;
  const slot = Number.isInteger(g.slot) ? g.slot : id - 1;
  const s = {
    id, nombre: String(g.nombre ?? "").slice(0, 30) || "Serie " + id, slot,
    color: g.color ?? colorInicial(slot), descomponer: false, estado: estadoDesdeGuardado(g.estado ?? {}), datos: null, incluidas: [],
  };
  if (g.tipo === "manual") {
    const m = g.manual ?? {};
    const y = (Array.isArray(m.y) ? m.y : []).slice(0, MAX_PUNTOS_MANUAL).map((v) => (typeof v === "number" && Number.isFinite(v) ? v : null));
    s.tipo = "manual";
    s.origen = ["importar", "escribir", "dibujar"].includes(g.origen) ? g.origen : "escribir";
    s.manual = {
      y: y.length >= 2 ? y : Array(100).fill(null), yMin: Number.isFinite(m.yMin) ? m.yMin : 0, yMax: Number.isFinite(m.yMax) ? m.yMax : 100,
      col: Number.isInteger(m.col) ? m.col : 0, tabla: null, archivo: String(m.archivo ?? ""), avisoCorte: false,
    };
    recalcularManual(s);
  }
  return s;
}

// Comprueba que es un proyecto nuestro y lo lleva a la versión actual. Lanza un Error con el motivo si no.
function validarDoc(doc) {
  if (!doc || typeof doc !== "object" || doc.formato !== FORMATO) throw new Error("Este archivo no es un proyecto del laboratorio de señales.");
  if (!Number.isInteger(doc.version) || doc.version < 1) throw new Error("El archivo no indica su versión.");
  if (doc.version > VERSION_FORMATO) throw new Error("Este proyecto es de una versión más nueva del laboratorio. Actualiza la página para abrirlo.");
  if (!Array.isArray(doc.series) || doc.series.length === 0) throw new Error("El proyecto no tiene ninguna serie.");
  while (doc.version < VERSION_FORMATO) { doc = MIGRACIONES[doc.version](doc); }
  return doc;
}

// Sustituye el trabajo de la pantalla por las series de un proyecto.
// Devuelve cómo se han renombrado los id de las series (id guardado -> id de ahora)
function reemplazarSeries(guardadas) {
  contadorSeries = 0;
  series = guardadas.map(serieDesdeGuardada);
  const mapa = {};
  guardadas.forEach((g, i) => { if (g.id !== undefined) mapa[g.id] = series[i].id; });
  activa = series[0];
  vista = activa.id;
  aplicarSerie(activa);
  renderPestanas();
  repintar();
  return mapa;
}

// "marcarSinGuardar": el proyecto viene de un archivo o de la copia automática y aún no está en la lista.
function abrirDoc(doc, { id = doc.id, marcarSinGuardar = false } = {}) {
  doc = validarDoc(doc);
  const mapa = reemplazarSeries(doc.series);
  imputacion = imputacionDesdeGuardada(doc.imputacion, mapa);
  reiniciarExplicada();
  if (faseActiva === "imputacion") renderImputacion();
  proyecto = { id, creado: doc.creado ?? ahora() };
  inputProyecto.value = doc.nombre === NOMBRE_SIN_TITULO ? "" : doc.nombre ?? "";
  ultimaGuardada = marcarSinGuardar ? "" : instantanea();
  actualizarEstadoProyecto();
}

function proyectoNuevo() {
  contadorSeries = 0;
  series = [];
  series.push(nuevaSerie());
  activa = series[0];
  vista = activa.id;
  aplicarSerie(activa);
  renderPestanas();
  repintar();
  imputacion = estadoImputacionVacio();
  reiniciarExplicada();
  if (faseActiva === "imputacion") renderImputacion();
  proyecto = { id: null, creado: null };
  inputProyecto.value = "";
  ultimaGuardada = instantanea();
  actualizarEstadoProyecto();
}

// ----- Estado del proyecto: ¿hay cambios sin guardar? Y copia automática por si se cierra la página -----
let temporizadorProyecto = 0;
let ultimoBorrador = "";
let esperandoDecision = false; // mientras se ofrece recuperar un trabajo anterior, no se pisa su copia

function programarEstadoProyecto() {
  clearTimeout(temporizadorProyecto);
  temporizadorProyecto = setTimeout(actualizarEstadoProyecto, 600);
}

const hayCambios = () => instantanea() !== ultimaGuardada;

async function actualizarEstadoProyecto() {
  const actual = instantanea();
  const sucio = actual !== ultimaGuardada;
  estadoProyecto.textContent = sucio ? "● Cambios sin guardar" : proyecto.id ? "✓ Guardado" : "Proyecto nuevo";
  estadoProyecto.classList.toggle("pendiente", sucio);
  if (esperandoDecision) return;
  try {
    if (sucio && actual !== ultimoBorrador) {
      await almacen.guardar({ id: ID_BORRADOR, nombre: nombreProyecto(), modificado: ahora(), series: [], proyectoId: proyecto.id, doc: construirDoc() });
      ultimoBorrador = actual;
    } else if (!sucio && ultimoBorrador) {
      await almacen.borrar(ID_BORRADOR);
      ultimoBorrador = "";
    }
  } catch { /* sin almacenamiento: la copia automática simplemente no existe */ }
}

let temporizadorAviso = 0;
function aviso(texto, error = false) {
  const caja = document.getElementById("p-aviso");
  caja.textContent = texto;
  caja.classList.toggle("error", error);
  caja.hidden = false;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => { caja.hidden = true; }, 3500);
}

// ----- Acciones -----
function confirmarDescarte() {
  return !hayCambios() || confirm("Hay cambios sin guardar en el proyecto actual. ¿Continuar y descartarlos?");
}

async function guardarProyecto() {
  try {
    if (!proyecto.id) proyecto = { id: nuevoId(), creado: ahora() };
    await almacen.guardar(construirDoc());
    ultimaGuardada = instantanea();
    await almacen.borrar(ID_BORRADOR).catch(() => {});
    ultimoBorrador = "";
    actualizarEstadoProyecto();
    aviso("Proyecto guardado en este navegador.");
  } catch (err) {
    aviso("No se pudo guardar en el navegador. Usa «Exportar» para no perder el trabajo.", true);
  }
}

function descargarJSON(doc) {
  const nombre = (doc.nombre || NOMBRE_SIN_TITULO).replace(/[^\p{L}\p{N}_-]+/gu, "_").replace(/^_+|_+$/g, "") || "proyecto";
  const enlace = document.createElement("a");
  enlace.href = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" }));
  enlace.download = `${nombre}.senales.json`;
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
}

async function pintarListaProyectos() {
  listaProyectos.replaceChildren();
  let proyectos;
  try {
    proyectos = await almacen.listar();
  } catch (err) {
    const li = document.createElement("li");
    li.textContent = "No se puede usar el almacenamiento de este navegador (¿modo privado?). Puedes seguir con «Exportar» y «Abrir un archivo».";
    listaProyectos.append(li);
    return;
  }
  if (proyectos.length === 0) {
    const li = document.createElement("li");
    li.textContent = "Todavía no hay proyectos guardados.";
    listaProyectos.append(li);
  }
  for (const p of proyectos) {
    const li = document.createElement("li");
    li.className = "proyecto-fila";
    li.dataset.id = p.id;
    const datos = document.createElement("div");
    const titulo = document.createElement("strong");
    titulo.textContent = p.nombre;
    const detalle = document.createElement("small");
    detalle.textContent = `${p.nSeries === 1 ? "1 serie" : p.nSeries + " series"}  ·  ${fechaLegible(p.modificado)}` + (p.id === proyecto.id ? "  ·  abierto" : "");
    datos.append(titulo, detalle);
    const acciones = document.createElement("div");
    acciones.className = "acciones-proyecto";
    for (const [acc, texto] of [["abrir", "Abrir"], ["duplicar", "Duplicar"], ["renombrar", "Renombrar"], ["exportar", ".json"], ["borrar", "Borrar"]]) {
      const boton = document.createElement("button");
      boton.type = "button";
      boton.dataset.acc = acc;
      boton.textContent = texto;
      acciones.append(boton);
    }
    li.append(datos, acciones);
    listaProyectos.append(li);
  }
}

listaProyectos.addEventListener("click", async (e) => {
  const boton = e.target.closest("button[data-acc]");
  if (!boton) return;
  const id = boton.closest("li").dataset.id;
  try {
    const doc = await almacen.leer(id);
    if (!doc) return pintarListaProyectos();
    if (boton.dataset.acc === "abrir") {
      if (!confirmarDescarte()) return;
      abrirDoc(doc);
      dialogoProyectos.close();
    } else if (boton.dataset.acc === "duplicar") {
      await almacen.guardar({ ...doc, id: nuevoId(), nombre: `${doc.nombre} (copia)`.slice(0, 60), creado: ahora(), modificado: ahora() });
      await pintarListaProyectos();
    } else if (boton.dataset.acc === "renombrar") {
      const nombre = prompt("Nuevo nombre del proyecto:", doc.nombre);
      if (nombre === null || nombre.trim() === "") return;
      await almacen.guardar({ ...doc, nombre: nombre.trim().slice(0, 60), modificado: ahora() });
      if (id === proyecto.id) { inputProyecto.value = nombre.trim().slice(0, 60); ultimaGuardada = instantanea(); actualizarEstadoProyecto(); }
      await pintarListaProyectos();
    } else if (boton.dataset.acc === "exportar") {
      descargarJSON(doc);
    } else if (boton.dataset.acc === "borrar") {
      if (!confirm(`¿Borrar el proyecto «${doc.nombre}»? No se puede deshacer.`)) return;
      await almacen.borrar(id);
      if (id === proyecto.id) { proyecto = { id: null, creado: null }; ultimaGuardada = ""; actualizarEstadoProyecto(); } // sigue en pantalla, pero ya sin guardar
      await pintarListaProyectos();
    }
  } catch (err) {
    aviso(err.message || "No se pudo completar la acción.", true);
  }
});

document.getElementById("p-guardar").addEventListener("click", guardarProyecto);
document.getElementById("p-exportar").addEventListener("click", () => descargarJSON(construirDoc()));
document.getElementById("p-abrir").addEventListener("click", () => { pintarListaProyectos(); dialogoProyectos.showModal(); });
document.getElementById("p-cerrar").addEventListener("click", () => dialogoProyectos.close());
document.getElementById("p-nuevo").addEventListener("click", () => {
  if (!confirmarDescarte()) return;
  proyectoNuevo();
  dialogoProyectos.close();
});
inputProyecto.addEventListener("input", programarEstadoProyecto);

document.getElementById("p-archivo").addEventListener("change", async (e) => {
  const archivo = e.target.files[0];
  e.target.value = "";
  if (!archivo) return;
  try {
    let doc;
    try { doc = JSON.parse(await archivo.text()); } catch { throw new Error("El archivo no es un JSON válido."); }
    validarDoc(doc); // si no vale, falla antes de preguntar nada
    if (!confirmarDescarte()) return;
    abrirDoc(doc, { id: null, marcarSinGuardar: true }); // se abre como proyecto nuevo: no pisa ninguno de la lista
    dialogoProyectos.close();
    aviso("Proyecto abierto. Pulsa «Guardar» para añadirlo a tu lista.");
  } catch (err) {
    aviso(err.message, true);
  }
});

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    guardarProyecto();
  }
});

// ----- Al abrir la página: ¿había trabajo sin guardar? -----
async function iniciarProyectos() {
  ultimaGuardada = instantanea();
  estadoProyecto.textContent = "Proyecto nuevo";
  try {
    const borrador = await almacen.leer(ID_BORRADOR);
    if (!borrador || !borrador.doc) return;
    esperandoDecision = true;
    document.getElementById("banner-texto").textContent =
      `Tienes trabajo sin guardar de ${fechaLegible(borrador.modificado)} (${borrador.doc.nombre}). ¿Lo recuperas?`;
    bannerRecuperar.hidden = false;
    const cerrar = () => { bannerRecuperar.hidden = true; esperandoDecision = false; };
    document.getElementById("banner-recuperar-si").onclick = () => {
      try { abrirDoc(borrador.doc, { id: borrador.proyectoId ?? null, marcarSinGuardar: true }); }
      catch (err) { aviso(err.message, true); }
      cerrar();
    };
    document.getElementById("banner-recuperar-no").onclick = async () => {
      await almacen.borrar(ID_BORRADOR).catch(() => {});
      cerrar();
    };
  } catch { /* sin almacenamiento: no hay nada que recuperar */ }
}
