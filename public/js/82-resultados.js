// Imputación, pestaña 4: imputación y resultados.
// Se imputa la variable explicada con los métodos elegidos (el cálculo está en Python, ruta /api/imputar) y se mide
// su error contra el valor real de lo que se quitó en la pestaña 1. Se reparte en sub-pestañas según con qué se
// imputa: "Sin explicativas", "Todas las explicativas" y "Solo X" (una por explicativa), más un "Resumen" que las
// compara. En el proyecto se guarda qué métodos se eligieron y sus parámetros; los resultados se recalculan al abrir.

const GRUPOS_IMPUTACION = [
  ["implicito", "Implícitos"],
  ["explicito", "Explícitos"],
  ["referencia", "De referencia temporal"],
];

// id (el mismo que usa la API), nombre, grupo, si necesita explicativas, y qué hace (texto al pasar el ratón)
const METODOS_IMPUTACION = [
  { id: "hot_deck", nombre: "Hot deck (vecinos más cercanos)", grupo: "implicito", explicativas: true,
    ayuda: "Copia el dato del punto conocido con explicativas más parecidas (con 1 vecino, un solo donante; con más, la media de los más cercanos)." },
  { id: "donante", nombre: "Serie donante", grupo: "implicito", explicativas: false,
    ayuda: "Copia los valores de otra serie del proyecto en los puntos que faltan (cold deck y sustitución)." },
  { id: "media", nombre: "Media", grupo: "explicito", explicativas: false, ayuda: "Rellena con la media de los datos conocidos." },
  { id: "mediana", nombre: "Mediana", grupo: "explicito", explicativas: false, ayuda: "Rellena con la mediana de los datos conocidos." },
  { id: "regresion", nombre: "Regresión", grupo: "explicito", explicativas: true,
    ayuda: "Ajusta una recta de la explicada sobre las explicativas con los datos conocidos y predice los huecos." },
  { id: "em", nombre: "EM (esperanza-maximización)", grupo: "explicito", explicativas: true,
    ayuda: "Estima las medias y correlaciones de todas las series, rellena lo que falta y repite hasta estabilizarse. Admite huecos en las explicativas." },
  { id: "ultimo_valor", nombre: "Último valor conocido", grupo: "referencia", explicativas: false, ayuda: "Repite el último dato conocido." },
  { id: "interpolacion", nombre: "Interpolación lineal", grupo: "referencia", explicativas: false,
    ayuda: "Une los datos conocidos con rectas. Es la referencia con la que se compara la mejora de cada método." },
];
const REFERENCIA_IMPUTACION = "interpolacion";

// Medidas que se pueden ver en el resumen: [clave, nombre, ¿más es mejor?]
const MEDIDAS_RESUMEN = [
  ["rmse", "RMSE", false],
  ["mae", "Error absoluto medio (MAE)", false],
  ["r2", "R² frente al real", true],
  ["mejora", "Mejora sobre la interpolación", true],
];

const resImp = {
  ui: {}, token: 0, controlador: null, temporizador: 0, cargando: false, error: "",
  sub: "resumen", medida: "rmse", orden: { columna: null, sentido: 1 }, destacado: null, detalleAbierto: true,
  vista: null,      // lo calculado para la sub-pestaña que se ve
  resumen: null,    // lo calculado para el resumen: un resultado por cada conjunto de explicativas
  cache: new Map(), // lo ya calculado, para no volver a pedirlo (la clave es una huella de la petición)
};

const metodoDeImputacion = (id) => METODOS_IMPUTACION.find((m) => m.id === id);
const idsConExplicativas = () => METODOS_IMPUTACION.filter((m) => m.explicativas).map((m) => m.id);
const idsSinExplicativas = () => METODOS_IMPUTACION.filter((m) => !m.explicativas).map((m) => m.id);
const colorDeMetodo = (id, c) => c.series[METODOS_IMPUTACION.findIndex((m) => m.id === id) % c.series.length];
const explicativasConDatos = () => explicativasElegidas().filter((x) => x.datos);

// Números para las tablas: pocos decimales, más cuanto más pequeños
function numeroResultado(v) {
  if (v === null || v === undefined) return "—";
  const decimales = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2;
  return v.toLocaleString("es-ES", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}
const porcentajeResultado = (v) => (v === null || v === undefined ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v * 100).toLocaleString("es-ES", { maximumFractionDigits: 0 })} %`);
const decimalesResultado = (v) => (v === null || v === undefined ? "—" : v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
function formatoMedida(clave, v) {
  if (clave === "mejora") return porcentajeResultado(v);
  if (clave === "r2") return decimalesResultado(v);
  return numeroResultado(v);
}

// ----- Sub-pestañas: con qué se imputa -----
function subpestanasImputacion() {
  const elegidas = explicativasConDatos();
  const lista = [];
  if (elegidas.length >= 2) lista.push({ id: "resumen", titulo: "Resumen", ayuda: "Compara hot deck, regresión y EM según con qué explicativas se calculan." });
  lista.push({ id: "sin", titulo: "Sin explicativas", series: [], ayuda: "Métodos que solo usan la propia serie (o la serie donante)." });
  if (elegidas.length >= 2) lista.push({ id: "todas", titulo: "Todas las explicativas", series: elegidas, ayuda: "Los métodos con explicativas, usando todas a la vez." });
  for (const s of elegidas) {
    lista.push({
      id: `solo:${s.id}`, titulo: elegidas.length >= 2 ? `Solo ${nombreDe(s)}` : `Con ${nombreDe(s)}`, series: [s], serie: s,
      ayuda: `Los métodos con explicativas, usando únicamente ${nombreDe(s)}.`,
    });
  }
  return lista;
}
function subActual() {
  const lista = subpestanasImputacion();
  const actual = lista.find((s) => s.id === resImp.sub) || lista[0];
  resImp.sub = actual.id;
  return actual;
}

// Qué métodos se ven (y se piden) en cada sub-pestaña
const metodosDeSub = (sub) => (sub.id === "sin" ? idsSinExplicativas() : idsConExplicativas());

// Lo que se pide al servidor para una sub-pestaña: las explicativas que usa y los métodos elegidos de su grupo.
// En las que usan explicativas se añade siempre la interpolación, como referencia.
function especificacion(sub) {
  const elegidos = METODOS_IMPUTACION.map((m) => m.id).filter((id) => imputacion.metodos.includes(id) && metodosDeSub(sub).includes(id));
  const conReferencia = sub.id !== "sin" && elegidos.length > 0;
  return { sub, series: sub.series || [], ids: elegidos, referencia: conReferencia ? REFERENCIA_IMPUTACION : null };
}

function pedidosDe(ids) {
  const p = imputacion.parametros;
  return ids.map((id) => {
    if (id === "hot_deck") return { metodo: id, parametros: { k: p.k } };
    if (id === "donante") {
      const otra = series.find((x) => x.id === p.donante);
      return { metodo: id, parametros: otra && otra.datos ? { donante: otra.datos.y, escalar: p.escalar } : {} };
    }
    return { metodo: id, parametros: {} };
  });
}

// Huella corta de un texto, para reconocer una petición ya calculada
function huellaTexto(texto) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${texto.length}-${(h2 >>> 0).toString(16)}${(h1 >>> 0).toString(16)}`;
}

// ----- Montaje -----
function montarResultados() {
  const raiz = document.createElement("div");
  raiz.className = "res";
  raiz.innerHTML = `
    <aside class="res-lateral">
      <h3>Métodos</h3>
      <p class="ayuda" id="res-ayuda-lateral"></p>
      <div class="res-atajos">
        <button type="button" id="res-todos">Todos</button>
        <button type="button" id="res-ninguno">Ninguno</button>
      </div>
      <div id="res-metodos"></div>
    </aside>
    <section class="res-principal">
      <div class="exp-aviso" id="res-falta" hidden>
        <span id="res-falta-texto"></span>
        <button type="button" id="res-falta-ir"></button>
      </div>
      <div id="res-trabajo" hidden>
        <div class="pestanas res-subpestanas" id="res-subpestanas" role="tablist" aria-label="Con qué explicativas se imputa"></div>
        <p class="ayuda" id="res-info" style="margin:0 0 12px"></p>
        <div class="res-estado" id="res-estado" role="status"></div>
        <div id="res-vista-resumen" hidden>
          <div class="res-controles">
            <label>Ver
              <select id="res-medida" aria-label="Medida que se muestra en el resumen"></select>
            </label>
          </div>
          <div class="res-tabla" id="res-tabla-resumen" role="table" aria-label="Comparación según con qué explicativas se imputa"></div>
          <div id="res-grafica-resumen"></div>
        </div>
        <div id="res-vista-conjunto" hidden>
          <div class="res-tabla" id="res-tabla" role="table" aria-label="Error de cada método"></div>
          <div id="res-grafica"></div>
          <details class="exp-tramos" id="res-detalle" open>
            <summary>Error por tramo</summary>
            <div class="exp-tramos-cuerpo" id="res-tramos"></div>
          </details>
        </div>
      </div>
    </section>`;
  const q = (sel) => raiz.querySelector(sel);
  resImp.ui = {
    raiz, metodos: q("#res-metodos"), ayudaLateral: q("#res-ayuda-lateral"), falta: q("#res-falta"), faltaTexto: q("#res-falta-texto"), faltaIr: q("#res-falta-ir"),
    trabajo: q("#res-trabajo"), subpestanas: q("#res-subpestanas"), info: q("#res-info"), estado: q("#res-estado"),
    vistaResumen: q("#res-vista-resumen"), medida: q("#res-medida"), tablaResumen: q("#res-tabla-resumen"), graficaResumen: q("#res-grafica-resumen"),
    vistaConjunto: q("#res-vista-conjunto"), tabla: q("#res-tabla"), grafica: q("#res-grafica"), detalle: q("#res-detalle"), tramos: q("#res-tramos"),
  };
  for (const [clave, nombre] of MEDIDAS_RESUMEN) resImp.ui.medida.append(new Option(nombre, clave));
  resImp.ui.medida.value = resImp.medida;
  resImp.ui.medida.addEventListener("change", () => { resImp.medida = resImp.ui.medida.value; pintarResultados(objetivoDeExplicada()); });
  resImp.ui.detalle.open = resImp.detalleAbierto;
  resImp.ui.detalle.addEventListener("toggle", () => { resImp.detalleAbierto = resImp.ui.detalle.open; });
  q("#res-todos").addEventListener("click", () => cambiarMetodosVisibles(true));
  q("#res-ninguno").addEventListener("click", () => cambiarMetodosVisibles(false));
  resImp.ui.metodos.addEventListener("change", alCambiarMetodo);
  resImp.ui.tabla.addEventListener("click", alPulsarTabla);
  resImp.ui.subpestanas.addEventListener("click", (e) => {
    const boton = e.target.closest("button[data-sub]");
    if (!boton || boton.dataset.sub === resImp.sub) return;
    resImp.sub = boton.dataset.sub;
    resImp.destacado = null;
    resImp.orden = { columna: null, sentido: 1 };
    pintarSubpestanas();
    pintarMetodosImputacion();
    pintarResultados(objetivoDeExplicada());   // si ya está calculado se ve al momento
    ejecutarImputacion();
  });
  return raiz;
}

async function actualizarResultados() {
  if (!resImp.ui.metodos || !resImp.ui.metodos.isConnected) return;
  const token = ++resImp.token;
  guardarActiva();
  await Promise.all(series.map(asegurarDatos));
  if (token !== resImp.token || !resImp.ui.metodos.isConnected) return;
  // lo elegido que ya no existe, o que ahora es la explicada, se quita
  imputacion.explicativas = imputacion.explicativas.filter((id) => id !== imputacion.explicada.serieId && series.some((x) => x.id === id));
  const donante = imputacion.parametros.donante;
  if (donante !== null && (donante === imputacion.explicada.serieId || !series.some((x) => x.id === donante))) imputacion.parametros.donante = null;
  pintarSubpestanas();
  pintarMetodosImputacion();
  ejecutarImputacion();
}

function pintarSubpestanas() {
  const barra = resImp.ui.subpestanas;
  const actual = subActual();
  barra.replaceChildren();
  for (const s of subpestanasImputacion()) {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.dataset.sub = s.id;
    boton.title = s.ayuda;
    boton.className = s.id === actual.id ? "activa" : "";
    boton.setAttribute("role", "tab");
    boton.setAttribute("aria-selected", s.id === actual.id);
    if (s.serie) boton.append(crearPunto(s.serie.color));
    boton.append(s.titulo);
    barra.append(boton);
  }
}

// ----- Lista de métodos: solo los que valen para la sub-pestaña que se ve -----
function pintarMetodosImputacion() {
  const cont = resImp.ui.metodos;
  cont.replaceChildren();
  const sub = subActual();
  const visibles = metodosDeSub(sub);
  const p = imputacion.parametros;
  const sinExplicativas = sub.id === "sin";
  resImp.ui.ayudaLateral.textContent = sinExplicativas
    ? "Marca los que quieras comparar: todos se calculan sobre los mismos huecos."
    : "Marca los que quieras comparar. La interpolación lineal se añade siempre como referencia.";
  for (const [grupo, titulo] of GRUPOS_IMPUTACION) {
    const metodos = METODOS_IMPUTACION.filter((x) => x.grupo === grupo && visibles.includes(x.id));
    if (!metodos.length) continue;
    const encabezado = document.createElement("h4");
    encabezado.textContent = titulo;
    cont.append(encabezado);
    for (const m of metodos) {
      const tarjeta = document.createElement("div");
      tarjeta.className = "res-metodo";
      tarjeta.title = m.ayuda;
      const etiqueta = document.createElement("label");
      etiqueta.className = "toggle opcion";
      const casilla = document.createElement("input");
      casilla.type = "checkbox";
      casilla.className = "alea";
      casilla.dataset.metodo = m.id;
      casilla.checked = imputacion.metodos.includes(m.id);
      etiqueta.append(casilla, ` ${m.nombre}`);
      tarjeta.append(etiqueta);
      if (m.id === "hot_deck") {
        const campo = document.createElement("label");
        campo.className = "res-param";
        campo.append("Vecinos ");
        const k = document.createElement("input");
        k.type = "number"; k.min = 1; k.max = 50; k.step = 1; k.value = p.k; k.dataset.param = "k";
        k.setAttribute("aria-label", "Número de vecinos");
        campo.append(k);
        tarjeta.append(campo);
      } else if (m.id === "donante") {
        const campo = document.createElement("label");
        campo.className = "res-param";
        campo.append("Serie ");
        const selector = document.createElement("select");
        selector.dataset.param = "donante";
        selector.setAttribute("aria-label", "Serie donante");
        selector.append(new Option("Elige una…", ""));
        for (const s of series.filter((x) => x.id !== imputacion.explicada.serieId)) selector.append(new Option(nombreDe(s), s.id));
        selector.value = p.donante === null ? "" : String(p.donante);
        campo.append(selector);
        const escala = document.createElement("label");
        escala.className = "toggle opcion res-param";
        const ajustar = document.createElement("input");
        ajustar.type = "checkbox"; ajustar.className = "alea"; ajustar.dataset.param = "escalar"; ajustar.checked = p.escalar;
        escala.append(ajustar, " Ajustar a la escala de la explicada");
        tarjeta.append(campo, escala);
      }
      cont.append(tarjeta);
    }
  }
  if (sinExplicativas && !explicativasConDatos().length) {
    const nota = document.createElement("p");
    nota.className = "ayuda";
    nota.textContent = "Elige variables explicativas en la pestaña 2 para probar también hot deck, regresión y EM.";
    cont.append(nota);
  }
}

function alCambiarMetodo(e) {
  const objetivo = e.target;
  if (objetivo.dataset.metodo) {
    const elegidos = new Set(imputacion.metodos);
    if (objetivo.checked) elegidos.add(objetivo.dataset.metodo); else elegidos.delete(objetivo.dataset.metodo);
    cambiarMetodosImputacion(METODOS_IMPUTACION.map((m) => m.id).filter((id) => elegidos.has(id)));
    return;
  }
  const parametro = objetivo.dataset.param;
  if (!parametro) return;
  const p = imputacion.parametros;
  if (parametro === "k") {
    const k = Math.min(Math.max(parseInt(objetivo.value) || 1, 1), 50);
    objetivo.value = k;
    if (k === p.k) return;
    p.k = k;
  } else if (parametro === "donante") {
    p.donante = objetivo.value === "" ? null : Number(objetivo.value);
  } else if (parametro === "escalar") {
    p.escalar = objetivo.checked;
  }
  cambioImputacion();
  ejecutarImputacion();
}

function cambiarMetodosImputacion(ids) {
  if (JSON.stringify(ids) === JSON.stringify(imputacion.metodos)) return;
  imputacion.metodos = ids;
  cambioImputacion();
  pintarMetodosImputacion();
  ejecutarImputacion();
}

// "Todos" y "Ninguno" solo afectan a los métodos que se ven en esta sub-pestaña
function cambiarMetodosVisibles(marcar) {
  const visibles = metodosDeSub(subActual());
  const elegidos = new Set(imputacion.metodos);
  for (const id of visibles) { if (marcar) elegidos.add(id); else elegidos.delete(id); }
  cambiarMetodosImputacion(METODOS_IMPUTACION.map((m) => m.id).filter((id) => elegidos.has(id)));
}

// ----- Pedir el cálculo -----
// Espera un momento por si se siguen cambiando cosas, y pide el cálculo
function ejecutarImputacion() {
  clearTimeout(resImp.temporizador);
  resImp.temporizador = setTimeout(pedirImputacion, 250);
}

// Pide (o saca de lo ya calculado) un conjunto de métodos con unas explicativas
async function pedirConjunto(spec, obj, signal) {
  if (!spec.ids.length) return { vacio: true };
  const ids = spec.referencia ? [...spec.ids, spec.referencia] : spec.ids;
  const texto = JSON.stringify({ y: obj.y, quitados: tramosQuitados(), explicativas: spec.series.map((x) => x.datos.y), metodos: pedidosDe(ids) });
  const clave = huellaTexto(texto);
  if (resImp.cache.has(clave)) return resImp.cache.get(clave);
  const respuesta = await fetch("/api/imputar", { method: "POST", headers: { "Content-Type": "application/json" }, body: texto, signal });
  if (respuesta.status === 404 || respuesta.status === 405) {
    // el servidor no conoce la ruta: es una versión anterior a la imputación
    return { error: "El servidor que está en marcha no tiene la imputación (es una versión anterior). Reinícialo con «python dev.py» y recarga la página." };
  }
  const cuerpo = await respuesta.json();
  if (!respuesta.ok) {
    return { error: typeof cuerpo.detail === "string" ? cuerpo.detail : "El servidor no ha podido imputar con estos datos." };
  }
  const resultado = { datos: cuerpo };
  if (resImp.cache.size >= 60) resImp.cache.delete(resImp.cache.keys().next().value);
  resImp.cache.set(clave, resultado);
  return resultado;
}

// Para el resumen: todas las explicativas juntas y cada una por separado
function resumenEspecificaciones() {
  return subpestanasImputacion().filter((s) => s.id === "todas" || s.id.startsWith("solo:")).map(especificacion);
}

async function pedirImputacion() {
  const u = resImp.ui;
  if (!u.tabla || !u.tabla.isConnected) return;
  const obj = objetivoDeExplicada();
  const falta = !obj ? ["Primero elige la variable explicada.", "Elegir la variable explicada", "explicada"] : null;
  u.falta.hidden = !falta;
  u.trabajo.hidden = Boolean(falta);
  if (falta) {
    u.faltaTexto.textContent = falta[0];
    u.faltaIr.textContent = falta[1];
    u.faltaIr.onclick = () => irAPestanaImputacion(falta[2]);
    return;
  }
  const aImputar = obj.aImputar;
  const quitados = obj.y.filter((v, i) => obj.quitado[i] && v !== null).length;   // los quitados que tienen valor real
  u.info.textContent = aImputar === 0
    ? "Todavía no hay nada que imputar: quita tramos a la explicada en la pestaña 1, o usa una serie con datos faltantes."
    : `Hay ${aImputar} ${aImputar === 1 ? "punto" : "puntos"} que imputar` + (quitados > 0
      ? `: ${quitados} que has quitado tú (con valor real, para medir el error) y ${aImputar - quitados} que ya faltaban.`
      : ". No has quitado ningún tramo con valor real, así que no se puede medir el error (quita alguno en la pestaña 1).");

  const sub = subActual();
  const especificaciones = sub.id === "resumen" ? resumenEspecificaciones() : [especificacion(sub)];
  if (!aImputar || !especificaciones.some((e) => e.ids.length)) {
    resImp.vista = null; resImp.resumen = null; resImp.error = ""; resImp.cargando = false;
    pintarResultados(obj);
    return;
  }

  const token = ++resImp.token;
  if (resImp.controlador) resImp.controlador.abort();
  resImp.controlador = new AbortController();
  resImp.cargando = true;
  resImp.error = "";
  pintarEstadoResultados();
  try {
    const resultados = await Promise.all(especificaciones.map((e) => pedirConjunto(e, obj, resImp.controlador.signal)));
    if (token !== resImp.token) return;
    const error = resultados.find((r) => r.error);
    if (error) { resImp.error = error.error; resImp.vista = null; resImp.resumen = null; }
    else if (sub.id === "resumen") resImp.resumen = especificaciones.map((e, i) => ({ spec: e, datos: resultados[i].datos }));
    else resImp.vista = { spec: especificaciones[0], datos: resultados[0].datos };
  } catch (err) {
    if (err.name === "AbortError" || token !== resImp.token) return;
    resImp.error = "No se pudo conectar con el servidor para imputar.";
    resImp.vista = null; resImp.resumen = null;
  }
  resImp.cargando = false;
  if (u.tabla.isConnected) pintarResultados(objetivoDeExplicada());
}

// ----- Pintar -----
function pintarEstadoResultados() {
  const estado = resImp.ui.estado;
  estado.textContent = resImp.cargando ? "Calculando…" : resImp.error;
  estado.classList.toggle("error", Boolean(resImp.error));
  estado.hidden = !estado.textContent;
}

function pintarResultados(obj) {
  pintarEstadoResultados();
  const u = resImp.ui;
  const sub = subActual();
  const esResumen = sub.id === "resumen";
  const especificaciones = esResumen ? resumenEspecificaciones() : [especificacion(sub)];
  const hayMetodos = especificaciones.some((e) => e.ids.length);
  const datos = esResumen ? resImp.resumen : (resImp.vista && resImp.vista.spec.sub.id === sub.id ? resImp.vista : null);
  const listo = Boolean(obj) && Boolean(datos) && hayMetodos && obj.aImputar > 0;
  u.vistaResumen.hidden = !(esResumen && listo);
  u.vistaConjunto.hidden = !(!esResumen && listo);
  if (!listo) {
    for (const g of [u.grafica, u.graficaResumen]) { try { Plotly.purge(g); } catch { /* aún no había gráfica */ } }
    if (!resImp.error && obj && obj.aImputar && !hayMetodos && !resImp.cargando) {
      u.estado.textContent = sub.id === "sin" ? "Marca algún método a la izquierda para ver cómo imputa y cuánto se equivoca."
        : "Marca hot deck, regresión o EM a la izquierda para ver cómo imputan con estas explicativas.";
      u.estado.classList.remove("error");
      u.estado.hidden = false;
    }
    return;
  }
  if (esResumen) {
    pintarResumenImputacion();
    return;
  }
  const filas = filasDeResultados(resImp.vista);
  pintarTablaResultados(filas, obj);
  pintarGraficaResultados(filas, obj);
  pintarTramosResultados(filas);
}

// Una fila por método elegido (y la referencia, si se añade): lo que devolvió el servidor
function filasDeResultados(vista) {
  const delServidor = Object.fromEntries(((vista.datos && vista.datos.resultados) || []).map((r) => [r.metodo, r]));
  const ids = vista.spec.referencia && !vista.spec.ids.includes(vista.spec.referencia) ? [...vista.spec.ids, vista.spec.referencia] : vista.spec.ids;
  return ids.map(metodoDeImputacion).filter(Boolean).map((m) => delServidor[m.id] || { metodo: m.id, nombre: m.nombre, grupo: m.grupo, error: "Sin resultado" });
}

const COLUMNAS_RESULTADOS = [
  ["nombre", "Método", "El método de imputación. Pulsa una fila para resaltarlo en la gráfica."],
  ["mae", "Error absoluto medio (MAE)", "La media de las distancias entre lo imputado y el valor real, en las unidades de la serie. Menos es mejor."],
  ["rmse", "RMSE", "Como el MAE, pero castiga más los fallos grandes. Menos es mejor."],
  ["r2", "R² frente al real", "Qué parte de lo quitado recupera el método. 1 = perfecto; 0 = igual que imputar la media de lo conocido; negativo = peor que eso. Más es mejor."],
  ["mejora", "Mejora sobre la interpolación", "1 − RMSE del método / RMSE de la interpolación lineal. Positivo = mejor que la interpolación (35 % = un 35 % menos de error); negativo = peor."],
  ["n", "Puntos medidos", "Puntos quitados por ti, con valor real, que el método ha conseguido imputar."],
];

function pintarTablaResultados(filas, obj) {
  const tabla = resImp.ui.tabla;
  tabla.replaceChildren();
  const { columna, sentido } = resImp.orden;
  const valor = (f, c) => (c === "nombre" ? f.nombre.toLowerCase() : f.error || !f.metricas || f.metricas[c] === null ? null : f.metricas[c]);
  let ordenadas = filas;
  if (columna) {
    ordenadas = [...filas].sort((a, b) => {
      const x = valor(a, columna), y = valor(b, columna);
      if (x === null && y === null) return 0;
      if (x === null) return 1;                      // lo que no tiene valor va siempre al final
      if (y === null) return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * sentido;
    });
  }
  // el mejor de cada columna
  const mejor = {};
  for (const [c, mayorEsMejor] of [["mae", false], ["rmse", false], ["r2", true], ["mejora", true]]) {
    const valores = filas.map((f) => valor(f, c)).filter((v) => v !== null);
    if (valores.length > 1 || (valores.length === 1 && filas.length === 1)) mejor[c] = mayorEsMejor ? Math.max(...valores) : Math.min(...valores);
  }

  for (const [id, texto, ayuda] of COLUMNAS_RESULTADOS) {
    const cab = document.createElement("div");
    cab.className = "cab";
    cab.setAttribute("role", "columnheader");
    cab.setAttribute("aria-sort", columna === id ? (sentido === 1 ? "ascending" : "descending") : "none");
    const boton = document.createElement("button");
    boton.type = "button";
    boton.dataset.orden = id;
    boton.title = ayuda + " Pulsa para ordenar.";
    boton.append(texto);
    if (columna === id) {
      const flecha = document.createElement("span");
      flecha.className = "flecha";
      flecha.textContent = sentido === 1 ? "↑" : "↓";
      boton.append(flecha);
    }
    cab.append(boton);
    tabla.append(cab);
  }

  const c = colores();
  for (const f of ordenadas) {
    const tenue = f.metodo === REFERENCIA_IMPUTACION && resImp.sub !== "sin" ? " tenue" : "";   // la referencia añadida sale atenuada
    const resaltada = (resImp.destacado === f.metodo ? " resaltada" : "") + tenue;
    const celda = (clase = "") => { const d = document.createElement("div"); d.setAttribute("role", "cell"); d.dataset.metodo = f.metodo; d.className = (clase + resaltada).trim(); return d; };
    const nombre = celda("nombre");
    const punto = document.createElement("span");
    punto.className = "punto-color";
    punto.style.background = colorDeMetodo(f.metodo, c);
    const texto = document.createElement("span");
    texto.append(f.nombre);
    if (f.metodo === REFERENCIA_IMPUTACION) {
      const referencia = document.createElement("small");
      referencia.textContent = "la referencia";
      texto.append(referencia);
    }
    nombre.append(punto, texto);
    tabla.append(nombre);
    if (f.error) {
      const aviso = celda("sin-calculo");
      aviso.textContent = f.error;
      aviso.style.gridColumn = "2 / -1";
      tabla.append(aviso);
      continue;
    }
    const m = f.metricas;
    const poner = (clave, texto) => {
      const d = celda("valor" + (mejor[clave] !== undefined && m[clave] === mejor[clave] ? " mejor" : ""));
      d.textContent = texto;
      tabla.append(d);
    };
    poner("mae", numeroResultado(m.mae));
    poner("rmse", numeroResultado(m.rmse));
    poner("r2", decimalesResultado(m.r2));
    poner("mejora", f.metodo === REFERENCIA_IMPUTACION ? "—" : porcentajeResultado(m.mejora));
    const n = celda("n");
    n.textContent = String(m.n);
    if (f.sin_imputar > 0) {
      const sin = document.createElement("small");
      sin.textContent = `${f.sin_imputar} sin imputar`;
      n.append(sin);
    }
    tabla.append(n);
  }
}

function alPulsarTabla(e) {
  const boton = e.target.closest("[data-orden]");
  if (boton) {
    const columna = boton.dataset.orden;
    resImp.orden = resImp.orden.columna === columna ? { columna, sentido: -resImp.orden.sentido } : { columna, sentido: ["mae", "rmse", "nombre"].includes(columna) ? 1 : -1 };
    pintarResultados(objetivoDeExplicada());
    return;
  }
  const celda = e.target.closest("[data-metodo]");
  if (celda) {   // pulsar una fila resalta ese método en la gráfica (y otra vez, lo suelta)
    resImp.destacado = resImp.destacado === celda.dataset.metodo ? null : celda.dataset.metodo;
    pintarResultados(objetivoDeExplicada());
  }
}

function pintarGraficaResultados(filas, obj) {
  const grafica = resImp.ui.grafica;
  if (!grafica || !grafica.isConnected || !obj) return;
  const c = colores();
  const { y, n, quitado, objetivo, serie } = obj;
  const x = y.map((_, i) => i);
  const trazas = [{
    x, y: y.map((v, i) => (quitado[i] ? null : v)), type: "scatter", mode: "lines", name: `${nombreDe(serie)} (conocido)`,
    line: { color: colorDe(serie, c), width: 2 }, hovertemplate: "<b>%{y:.2f}</b>  ·  punto %{x}<extra>conocido</extra>",
  }];
  // lo que se quitó, con su valor real
  const real = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (!quitado[i]) continue;
    for (const j of [i - 1, i, i + 1]) if (j >= 0 && j < n && y[j] !== null) real[j] = y[j];
  }
  trazas.push({ x, y: real, type: "scatter", mode: "lines", name: "Valor real de lo quitado", opacity: 0.4, line: { color: c.ink, width: 2, dash: "dot" }, hovertemplate: "real <b>%{y:.2f}</b>  ·  punto %{x}<extra></extra>" });
  for (const f of filas) {
    if (f.error) continue;
    const trazo = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
      if (!objetivo[i]) continue;
      for (const j of [i - 1, i, i + 1]) if (j >= 0 && j < n && f.imputado[j] !== null) trazo[j] = f.imputado[j];
    }
    const atenuado = resImp.destacado !== null && resImp.destacado !== f.metodo;
    const comoReferencia = f.metodo === REFERENCIA_IMPUTACION && resImp.sub !== "sin";
    trazas.push({
      x, y: trazo, type: "scatter", mode: "lines+markers", name: f.nombre, opacity: atenuado ? 0.25 : comoReferencia ? 0.4 : 1,
      line: { color: colorDeMetodo(f.metodo, c), width: resImp.destacado === f.metodo ? 3.5 : 1.8 }, marker: { size: 4 },
      hovertemplate: "<b>%{y:.2f}</b>  ·  punto %{x}<extra>" + f.nombre + "</extra>",
    });
  }
  const banda = (a, b, color, opacidad) => ({ type: "rect", xref: "x", yref: "paper", x0: a - 0.5, x1: b + 0.5, y0: 0, y1: 1, fillcolor: color, opacity: opacidad, line: { width: 0 }, layer: "below" });
  const formas = [
    ...huecosDeOrigen(y).map(([a, b]) => banda(a, b, c.muted, 0.2)),
    ...tramosQuitados().map(([a, b]) => banda(a, b, c.series[3], 0.2)),
  ];
  const eje = (texto) => ({
    title: texto ? { text: texto, font: { color: c.muted, size: 12 }, standoff: 8 } : undefined,
    gridcolor: c.grid, gridwidth: 1, zeroline: false, linecolor: c.axis, tickfont: { color: c.muted, size: 11 }, ticks: "",
  });
  Plotly.react(grafica, trazas, {
    paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)", font: { family: c.fuente, color: c.ink2 },
    margin: { t: 16, r: 16, b: 120, l: 56 }, hovermode: "x unified", shapes: formas, showlegend: true,
    legend: { orientation: "h", x: 0, y: -0.3, yanchor: "top", font: { color: c.ink2, size: 12 } },
    xaxis: { ...eje("Punto"), showgrid: false, showline: true }, yaxis: { ...eje("Valor"), showline: false },
    hoverlabel: { bgcolor: c.surface, bordercolor: c.axis, font: { color: c.ink, family: c.fuente, size: 13 } },
  }, { responsive: true, displaylogo: false, displayModeBar: false });
}

// Error (MAE) de cada método en cada tramo que se quitó: una fila por tramo y una columna por método
function pintarTramosResultados(filas) {
  const cont = resImp.ui.tramos;
  cont.replaceChildren();
  const validas = filas.filter((f) => !f.error);
  const tramos = validas.length ? validas[0].por_tramo : [];
  if (!tramos.length) {
    const p = document.createElement("p");
    p.className = "ayuda";
    p.style.margin = "0";
    p.textContent = "No has quitado ningún tramo con valor real, así que no hay error que medir.";
    cont.append(p);
    return;
  }
  const rejilla = document.createElement("div");
  rejilla.className = "res-tabla res-tramos-tabla";
  rejilla.style.gridTemplateColumns = `minmax(130px, 1fr) repeat(${validas.length}, minmax(110px, 1fr))`;
  const cabecera = (texto, ayuda = "") => { const d = document.createElement("div"); d.className = "cab"; d.textContent = texto; if (ayuda) d.title = ayuda; return d; };
  rejilla.append(cabecera("Tramo", "Puntos del tramo y cuántos se miden"));
  for (const f of validas) rejilla.append(cabecera(f.nombre, "Error absoluto medio del método en cada tramo. Al pasar el ratón por un valor, también sale el RMSE."));
  tramos.forEach((t, k) => {
    const nombre = document.createElement("div");
    nombre.className = "nombre-tramo";
    nombre.textContent = `${t.desde}–${t.hasta}`;
    const largo = document.createElement("small");
    largo.textContent = `${t.hasta - t.desde + 1} ${t.hasta === t.desde ? "punto" : "puntos"}`;
    nombre.append(largo);
    rejilla.append(nombre);
    const maes = validas.map((f) => f.por_tramo[k].mae);
    const minimo = Math.min(...maes.filter((v) => v !== null));
    validas.forEach((f) => {
      const d = document.createElement("div");
      const dato = f.por_tramo[k];
      d.className = "valor" + (dato.mae !== null && dato.mae === minimo && maes.filter((v) => v !== null).length > 1 ? " mejor" : "");
      d.textContent = numeroResultado(dato.mae);
      d.title = dato.mae === null ? "Sin valor real que medir o sin imputar" : `RMSE ${numeroResultado(dato.rmse)} · ${dato.n} ${dato.n === 1 ? "punto medido" : "puntos medidos"}`;
      rejilla.append(d);
    });
  });
  cont.append(rejilla);
}

// ----- Resumen: cada método con explicativas, según con cuáles se calcula -----
function pintarResumenImputacion() {
  const u = resImp.ui;
  const conjuntos = resImp.resumen;                                   // [{ spec, datos }] : "todas" y cada "solo"
  const [clave, nombreMedida, mayorEsMejor] = MEDIDAS_RESUMEN.find((m) => m[0] === resImp.medida) || MEDIDAS_RESUMEN[0];
  const ids = conjuntos[0].spec.ids;                                  // los métodos elegidos con explicativas
  const valorDe = (conjunto, id) => {
    const r = (conjunto.datos.resultados || []).find((x) => x.metodo === id);
    return !r || r.error || !r.metricas ? { v: null, r } : { v: r.metricas[clave], r };
  };
  const etiqueta = (cj) => (cj.spec.sub.id === "todas" ? "Todas" : `Solo ${nombreDe(cj.spec.sub.serie)}`);
  const tabla = u.tablaResumen;
  tabla.replaceChildren();
  tabla.style.gridTemplateColumns = `minmax(200px, 1.6fr) repeat(${conjuntos.length}, minmax(120px, 1fr))`;
  const c = colores();
  const cabecera = (texto, ayuda = "") => { const d = document.createElement("div"); d.className = "cab"; d.textContent = texto; if (ayuda) d.title = ayuda; return d; };
  tabla.append(cabecera(nombreMedida, "Cada fila es un método y cada columna, el conjunto de explicativas con el que se calcula. El mejor de cada fila va resaltado."));
  for (const cj of conjuntos) tabla.append(cabecera(etiqueta(cj), cj.spec.sub.ayuda));

  const filaDe = (id, esReferencia) => {
    const m = metodoDeImputacion(id);
    const nombre = document.createElement("div");
    nombre.className = "nombre" + (esReferencia ? " tenue" : "");
    const punto = document.createElement("span");
    punto.className = "punto-color";
    punto.style.background = colorDeMetodo(id, c);
    const texto = document.createElement("span");
    texto.append(m.nombre);
    if (esReferencia) {
      const nota = document.createElement("small");
      nota.textContent = "la referencia (igual en todas)";
      texto.append(nota);
    }
    nombre.append(punto, texto);
    tabla.append(nombre);
    const valores = conjuntos.map((cj) => valorDe(cj, id));
    const validos = valores.map((x) => x.v).filter((v) => v !== null);
    const mejorFila = validos.length > 1 ? (mayorEsMejor ? Math.max(...validos) : Math.min(...validos)) : null;
    valores.forEach(({ v, r }) => {
      const d = document.createElement("div");
      d.className = "valor" + (esReferencia ? " tenue" : "") + (!esReferencia && v !== null && v === mejorFila ? " mejor" : "");
      d.textContent = esReferencia && clave === "mejora" ? "—" : formatoMedida(clave, v);
      if (r && r.error) { d.textContent = "—"; d.title = r.error; }
      if (r && r.sin_imputar > 0) {
        const sin = document.createElement("small");
        sin.textContent = `${r.sin_imputar} sin imputar`;
        d.append(sin);
      }
      tabla.append(d);
    });
  };
  ids.forEach((id) => filaDe(id, false));
  filaDe(REFERENCIA_IMPUTACION, true);
  pintarGraficaResumen(conjuntos, ids, clave, nombreMedida, valorDe, etiqueta);
}

function pintarGraficaResumen(conjuntos, ids, clave, nombreMedida, valorDe, etiqueta) {
  const grafica = resImp.ui.graficaResumen;
  if (!grafica || !grafica.isConnected) return;
  const c = colores();
  const etiquetas = conjuntos.map(etiqueta);
  const factor = clave === "mejora" ? 100 : 1;
  const trazas = ids.map((id) => ({
    x: etiquetas, y: conjuntos.map((cj) => { const v = valorDe(cj, id).v; return v === null ? null : v * factor; }),
    type: "bar", name: metodoDeImputacion(id).nombre, marker: { color: colorDeMetodo(id, c) },
    hovertemplate: `<b>%{y:.3g}${clave === "mejora" ? " %" : ""}</b><extra>${metodoDeImputacion(id).nombre}</extra>`,
  }));
  const referencia = valorDe(conjuntos[0], REFERENCIA_IMPUTACION).v;
  if (referencia !== null && clave !== "mejora") {
    trazas.push({
      x: etiquetas, y: etiquetas.map(() => referencia), type: "scatter", mode: "lines", name: "Interpolación lineal (referencia)",
      opacity: 0.4, line: { color: c.ink, width: 2, dash: "dash" }, hovertemplate: `<b>%{y:.3g}</b><extra>Interpolación (referencia)</extra>`,
    });
  }
  const eje = (texto) => ({
    title: texto ? { text: texto, font: { color: c.muted, size: 12 }, standoff: 8 } : undefined,
    gridcolor: c.grid, gridwidth: 1, zeroline: false, linecolor: c.axis, tickfont: { color: c.muted, size: 11 }, ticks: "",
  });
  Plotly.react(grafica, trazas, {
    paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)", font: { family: c.fuente, color: c.ink2 },
    margin: { t: 16, r: 16, b: 90, l: 64 }, barmode: "group", showlegend: true, hovermode: "closest",
    legend: { orientation: "h", x: 0, y: -0.25, yanchor: "top", font: { color: c.ink2, size: 12 } },
    xaxis: { ...eje(""), showgrid: false, showline: true }, yaxis: { ...eje(clave === "mejora" ? `${nombreMedida} (%)` : nombreMedida), showline: false },
    hoverlabel: { bgcolor: c.surface, bordercolor: c.axis, font: { color: c.ink, family: c.fuente, size: 13 } },
  }, { responsive: true, displaylogo: false, displayModeBar: false });
}
