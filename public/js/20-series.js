// Series: configuración de cada una, color y nombre, lectura y envío del estado, pestañas.
// ---------- Series: cada una guarda su configuración ----------
let series = [];          // { id, nombre, slot, estado, datos, incluidas }
let contadorSeries = 0;
let activa = null;        // la serie que se edita en el panel
let vista = null;         // lo que muestra la gráfica: id de una serie, o "todas"

// Serie añadida a mano: solo la línea del nivel base. Los bloques están apagados, con valores
// listos para cuando se enciendan.
function estadoSoloNivel() {
  return {
    puntos: "500", nivel_base: "100", valor_final: "",
    tendencia_activa: false, tendencia_valor: "0.5", tendencia_tipo: "lineal", ver_tendencia: false,
    estacionalidad_activa: false, estacionalidades: [{ periodo: PERIODOS_INICIALES[0], modo: "aditiva", minimo: "-10", maximo: "10", minimo_fin: "-20", maximo_fin: "20" }],
    ciclo_activo: false, ciclos: [{ ...CICLO_INICIAL, semilla: String(nuevaSemilla()) }],
    ruido_activo: false, ruido_grado: "3", ruido_tipo: "blanco", ruido_phi: "0.8",
    anomalias_activas: false, anomalias: [], magnitud_alea_min: "10", magnitud_alea_max: "30",
    huecos_activos: false, huecos: [], ver_ocultos: false,
    semilla_ruido: String(nuevaSemilla()), semilla_anomalias: String(nuevaSemilla()),
  };
}

// Semillas al azar (ruido, anomalías aleatorias y ciclo): cada serie arranca con las suyas, se ven y se
// pueden escribir en el panel, y los botones de regenerar sortean otra. Con la misma semilla el
// resultado se repite.
const nuevaSemilla = () => Math.floor(Math.random() * 1_000_000);

// Color de arranque de una serie: los 8 de la paleta validada y, a partir de la novena, uno generado
// (el tono avanza el ángulo áureo para que los vecinos se parezcan lo menos posible).
function colorInicial(slot) {
  if (slot < N_COLORES) return slot;
  const tono = (slot * 137.508) % 360;
  const s = 0.6, l = 0.5;
  const k = (n) => (n + tono / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const canal = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return "#" + [canal(0), canal(8), canal(4)].map((v) => v.toString(16).padStart(2, "0")).join("");
}

// Toda serie nueva, también la inicial, arranca solo con la línea del nivel.
function nuevaSerie() {
  // El color es de la serie y no cambia si se cierran otras: se reutiliza el primer hueco libre.
  const usados = new Set(series.map((s) => s.slot));
  let slot = 0;
  while (usados.has(slot)) slot++;
  contadorSeries++;
  // slot = su hueco de la paleta; color = el que se ve, editable:
  // un número de la paleta o un "#rrggbb" elegido a mano.
  return { id: contadorSeries, nombre: "Serie " + contadorSeries, slot, color: colorInicial(slot), descomponer: false, estado: estadoSoloNivel(), datos: null, incluidas: [] };
}

// Si se borra el nombre, se muestra "Serie N" para que la pestaña nunca quede vacía.
const nombreDe = (s) => s.nombre.trim() || "Serie " + s.id;
const colorDe = (s, c) => (typeof s.color === "number" ? c.series[s.color] : s.color);

// ---------- Identidad de la serie: color y nombre ----------
const botonColor = document.getElementById("boton-color");
const contenedorColores = document.getElementById("colores"); // la paleta flotante
const textoNombre = document.getElementById("nombre-texto");
const inputNombre = form.elements.nombre;
const botonNombre = document.getElementById("boton-nombre");

// Paleta: los 8 colores validados y uno libre (selector del navegador).
for (let i = 0; i < N_COLORES; i++) {
  const muestra = document.createElement("button");
  muestra.type = "button";
  muestra.className = "muestra";
  muestra.dataset.color = i;
  muestra.title = "Color " + (i + 1);
  muestra.style.background = `var(--series-${i + 1})`;
  contenedorColores.append(muestra);
}
const muestraOtro = document.createElement("label");
muestraOtro.className = "muestra-otro";
muestraOtro.title = "Otro color";
const colorOtro = document.createElement("input");
colorOtro.type = "color";
colorOtro.id = "color-otro";
muestraOtro.append(colorOtro);
contenedorColores.append(muestraOtro);

// Pone al día el punto de color y el nombre de la serie activa, y marca el color elegido en la paleta.
function refrescarColor() {
  const propio = typeof activa.color === "string";
  contenedorColores.querySelectorAll(".muestra").forEach((m) => {
    m.classList.toggle("elegida", activa.color === Number(m.dataset.color));
  });
  muestraOtro.classList.toggle("elegida", propio);
  // Sin color propio, el círculo "otro" muestra un arcoíris; con uno elegido, ese color.
  muestraOtro.style.background = propio ? activa.color : "";
  if (propio) colorOtro.value = activa.color;
  botonColor.style.background = propio ? activa.color : `var(--series-${activa.color + 1})`;
}

function refrescarNombre() {
  textoNombre.textContent = nombreDe(activa);
}

function cambiarColor(color) {
  activa.color = color;
  refrescarColor();
  renderPestanas();
  repintar();
}

// La paleta solo aparece al pulsar el punto de color; se cierra al elegir o al pulsar fuera.
function abrirPaleta(abrir) {
  contenedorColores.hidden = !abrir;
  botonColor.setAttribute("aria-expanded", abrir);
}
botonColor.addEventListener("click", () => abrirPaleta(contenedorColores.hidden));
document.addEventListener("click", (e) => {
  if (!contenedorColores.hidden && !e.target.closest(".color-selector")) abrirPaleta(false);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") abrirPaleta(false);
});
contenedorColores.addEventListener("click", (e) => {
  const muestra = e.target.closest(".muestra");
  if (!muestra) return;
  cambiarColor(Number(muestra.dataset.color));
  abrirPaleta(false);
});
colorOtro.addEventListener("input", (e) => {
  e.stopPropagation(); // no es un parámetro de la API: que no dispare una petición
  cambiarColor(colorOtro.value);
});

// El nombre se ve como texto; el lápiz lo convierte en un campo para editarlo.
let nombreAntes = ""; // lo que había al empezar a editar, por si se cancela con Escape
function editarNombre(editar) {
  inputNombre.hidden = !editar;
  textoNombre.hidden = editar;
  botonNombre.hidden = editar;
  if (editar) {
    nombreAntes = inputNombre.value;
    inputNombre.focus();
    inputNombre.select();
  }
}
botonNombre.addEventListener("click", () => editarNombre(true));
inputNombre.addEventListener("blur", () => editarNombre(false));
inputNombre.addEventListener("keydown", (e) => {
  if (e.key === "Enter") inputNombre.blur();
  if (e.key === "Escape") {
    inputNombre.value = nombreAntes; // descarta lo escrito
    draw();
    inputNombre.blur();
  }
});

// Los campos sueltos del panel (los que no son listas de filas), que se guardan con cada serie
const CAMPOS_SIMPLES = [
  "puntos", "nivel_base", "valor_final", "tendencia_valor", "tendencia_tipo", "ruido_grado", "ruido_tipo", "ruido_phi",
  "magnitud_alea_min", "magnitud_alea_max", "semilla_ruido", "semilla_anomalias",
];

// Lo que hay ahora en el panel, como un objeto.
function leerEstado() {
  const e = {};
  for (const name of CAMPOS_SIMPLES) {
    e[name] = form.elements[name].value;
  }
  for (const name of toggles) e[name] = form.elements[name].checked;
  e.ver_tendencia = form.elements.ver_tendencia.checked; // solo de pantalla: no se envía a la API
  e.ver_ocultos = form.elements.ver_ocultos.checked;     // ídem
  e.estacionalidades = [...lista.children].map((fila) => ({
    periodo: fila.querySelector("[name=estacionalidad_periodo]").value,
    modo: fila.querySelector("[name=estacionalidad_modo]").value,
    minimo: fila.querySelector("[name=estacionalidad_minimo]").value,
    maximo: fila.querySelector("[name=estacionalidad_maximo]").value,
    minimo_fin: fila.querySelector("[name=estacionalidad_minimo_fin]").value,
    maximo_fin: fila.querySelector("[name=estacionalidad_maximo_fin]").value,
    definicion: fila.querySelector("[name=estacionalidad_definicion]").value,
  }));
  e.ciclos = [...listaCiclos.children].map((fila) => ({
    ...Object.fromEntries(CAMPOS_CICLO.map((campo) => [campo, fila.querySelector(`[name=ciclo_${campo}]`).value])),
    definicion: fila.querySelector("[name=ciclo_definicion]").value,
  }));
  e.anomalias = [...listaAnomalias.children].map((fila) => ({
    tipo: fila.querySelector(".a-tipo").value,
    punto: fila.querySelector(".a-punto").value,
    puntoAlea: fila.querySelector(".a-punto-alea").checked,
    magnitud: fila.querySelector(".a-magnitud").value,
    magnitudAlea: fila.querySelector(".a-magnitud-alea").checked,
    decaimiento: fila.querySelector(".a-decaimiento").value,
  }));
  e.huecos = [...listaHuecos.children].map((fila) => ({
    tipo: fila.querySelector(".h-tipo").value,
    desde: fila.querySelector(".h-desde").value,
    hasta: fila.querySelector(".h-hasta").value,
  }));
  return e;
}

// Vuelca la configuración de una serie en el panel.
// Vuelca una serie entera (nombre, color y configuración) en el panel.
function aplicarSerie(s) {
  editarNombre(false); // si se estaba editando el nombre de otra serie, se cierra
  abrirPaleta(false);
  form.elements.nombre.value = s.nombre;
  refrescarColor();
  refrescarNombre();
  aplicarEstado(s.estado);
  mostrarModo(s);
}

function aplicarEstado(e) {
  for (const name of CAMPOS_SIMPLES) {
    form.elements[name].value = e[name];
  }
  for (const name of toggles) form.elements[name].checked = e[name];
  form.elements.ver_tendencia.checked = e.ver_tendencia;
  form.elements.ver_ocultos.checked = e.ver_ocultos;
  lista.replaceChildren();
  e.estacionalidades.forEach((est) => anadirEstacionalidad(est.periodo, est.modo, est.minimo, est.maximo, est.minimo_fin, est.maximo_fin, est.definicion));
  listaCiclos.replaceChildren();
  e.ciclos.forEach((ciclo) => nuevaFilaCiclo(ciclo));
  listaAnomalias.replaceChildren();
  e.anomalias.forEach((a) => nuevaFilaAnomalia(a));
  listaHuecos.replaceChildren();
  e.huecos.forEach((h) => nuevaFilaHueco(h));
  renumerar();
  renumerarHuecos();
  renumerarAnomalias();
  syncDisabled();
}

// Parámetros de la API para una serie. Solo se envían los bloques activos, así un campo
// vacío en un bloque apagado no provoca error.
function paramsDeSerie(s) {
  const e = s.estado;
  const p = new URLSearchParams();
  p.set("puntos", e.puntos);
  p.set("nivel_base", e.nivel_base);
  p.set("semilla", e.semilla_ruido);
  p.set("semilla_anomalias", e.semilla_anomalias);
  p.set("tendencia_activa", e.tendencia_activa);
  if (e.tendencia_activa) {
    p.set("tendencia_valor", e.tendencia_valor);
    p.set("tendencia_tipo", e.tendencia_tipo);
  }
  if (e.valor_final.trim() !== "") p.set("valor_final", e.valor_final);
  // Sin ninguna fila de estacionalidad no hay onda que dibujar (el servidor usaría una por defecto).
  const conOndas = e.estacionalidad_activa && e.estacionalidades.length > 0;
  p.set("estacionalidad_activa", conOndas);
  if (conOndas) {
    for (const est of e.estacionalidades) {
      p.append("estacionalidad_periodo", est.periodo);
      p.append("estacionalidad_modo", est.modo);
      p.append("estacionalidad_minimo", est.minimo);
      p.append("estacionalidad_maximo", est.maximo);
      // "al final" vacío (solo en una fila en aditiva, donde se ignora) = igual que al inicio
      p.append("estacionalidad_minimo_fin", est.minimo_fin !== "" ? est.minimo_fin : est.minimo);
      p.append("estacionalidad_maximo_fin", est.maximo_fin !== "" ? est.maximo_fin : est.maximo);
    }
  }
  const conCiclos = e.ciclo_activo && e.ciclos.length > 0;
  p.set("ciclo_activo", conCiclos);
  if (conCiclos) {
    for (const ciclo of e.ciclos) {
      for (const campo of CAMPOS_CICLO) {
        // "al final" vacío = igual que al inicio
        const vacioFin = campo.endsWith("_fin") && ciclo[campo] === "";
        p.append(`ciclo_${campo}`, vacioFin ? ciclo[campo.replace("_fin", "")] : ciclo[campo]);
      }
    }
  }
  p.set("ruido_activo", e.ruido_activo);
  if (e.ruido_activo) {
    p.set("ruido_grado", e.ruido_grado);
    p.set("ruido_tipo", e.ruido_tipo);
    if (e.ruido_tipo.startsWith("autocorrelado")) p.set("ruido_phi", e.ruido_phi);
  }
  p.set("anomalias_activas", e.anomalias_activas);
  if (e.anomalias_activas) {
    p.set("magnitud_aleatoria_min", e.magnitud_alea_min);
    p.set("magnitud_aleatoria_max", e.magnitud_alea_max);
  }
  // Una anomalía por fila; las que tienen un campo vacío se saltan hasta que se rellenen.
  const incluidas = []; // posición en el panel de cada anomalía enviada
  if (e.anomalias_activas) {
    e.anomalias.forEach((a, i) => {
      const texto = textoAnomalia(a);
      if (texto) {
        p.append("anomalia", texto);
        incluidas.push(i);
      }
    });
  }
  // Un hueco por fila; los que tienen un campo vacío se saltan hasta que se rellenen.
  p.set("huecos_activos", e.huecos_activos);
  if (e.huecos_activos) {
    for (const h of e.huecos) {
      const texto = textoHueco(h);
      if (texto) p.append("hueco", texto);
    }
  }
  return { params: p, incluidas };
}

let ultimaPeticion = 0; // si llegan respuestas desordenadas, solo cuenta la última de la serie activa

// Pide los datos de una serie. Devuelve false si la API los rechaza (se conservan los anteriores).
async function cargarSerie(s, numero) {
  if (esManual(s)) return true; // sus datos son locales: no pasan por la API
  const { params, incluidas } = paramsDeSerie(s);
  try {
    const res = await fetch("/api/series?" + params);
    if (!res.ok) return false; // valores fuera de rango mientras se escribe
    const datos = await res.json();
    if (numero !== undefined && numero !== ultimaPeticion) return false; // llegó una petición más nueva
    s.datos = datos;
    s.incluidas = incluidas;
    return true;
  } catch {
    return false;
  }
}

// Nuevo ruido para la serie activa (mismo tipo y grado, otra muestra aleatoria).
document.getElementById("regenerar-ruido").addEventListener("click", () => regenerar("semilla_ruido"));

// ---------- Pestañas ----------
function crearPunto(color) {
  const punto = document.createElement("span");
  punto.className = "punto-color";
  punto.style.background = typeof color === "number" ? `var(--series-${color + 1})` : color;
  return punto;
}

function renderPestanasPanel() {
  const cont = document.getElementById("pestanas-series");
  cont.replaceChildren();
  for (const s of series) {
    const tab = document.createElement("div");
    tab.className = "tab" + (s === activa ? " activa" : "");
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "tab-nombre";
    boton.dataset.accion = "elegir";
    boton.dataset.id = s.id;
    boton.setAttribute("role", "tab");
    boton.setAttribute("aria-selected", s === activa);
    boton.append(crearPunto(s.color), nombreDe(s));
    tab.append(boton);
    if (series.length > 1) {
      const cerrar = document.createElement("button");
      cerrar.type = "button";
      cerrar.className = "cerrar";
      cerrar.dataset.accion = "cerrar";
      cerrar.dataset.id = s.id;
      cerrar.title = "Cerrar " + nombreDe(s);
      cerrar.textContent = "×";
      tab.append(cerrar);
    }
    cont.append(tab);
  }
  // "+ Nueva serie" abre un menú con las formas de crear una serie
  const envoltorio = document.createElement("div");
  envoltorio.className = "nueva-serie";
  const nueva = document.createElement("button");
  nueva.type = "button";
  nueva.className = "anadir-serie";
  nueva.dataset.accion = "menu-nueva";
  nueva.setAttribute("aria-haspopup", "true");
  nueva.textContent = "+ Nueva serie";
  const menu = document.createElement("div");
  menu.className = "menu-nueva";
  menu.hidden = true;
  for (const [accion, titulo, ayuda] of [
    ["nueva", "Generar", "Tendencia, estacionalidad, ruido..."],
    ["nueva-importar", "Importar CSV o Excel", "Desde un archivo"],
    ["nueva-escribir", "Escribir o pegar datos", "Valores a mano o copiados de Excel"],
    ["nueva-dibujar", "Dibujar", "Con el cursor sobre la gráfica"],
  ]) {
    const opcion = document.createElement("button");
    opcion.type = "button";
    opcion.dataset.accion = accion;
    opcion.append(titulo);
    const pequena = document.createElement("small");
    pequena.textContent = ayuda;
    opcion.append(pequena);
    menu.append(opcion);
  }
  envoltorio.append(nueva, menu);
  cont.append(envoltorio);
}

function renderPestanasGrafica() {
  const cont = document.getElementById("pestanas-grafica");
  cont.replaceChildren();
  const pestana = (id, texto, slot) => {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.dataset.vista = id;
    boton.className = vista === id ? "activa" : "";
    boton.setAttribute("role", "tab");
    boton.setAttribute("aria-selected", vista === id);
    if (slot !== undefined) boton.append(crearPunto(slot));
    boton.append(texto);
    cont.append(boton);
  };
  for (const s of series) pestana(s.id, nombreDe(s), s.color);
  if (series.length > 1) pestana("todas", "Todas");
}

function renderPestanas() {
  renderPestanasPanel();
  renderPestanasGrafica();
  refrescarColor();
  refrescarNombre();
}

// Guarda lo que hay en el panel en la serie activa (antes de cambiar de serie).
function guardarActiva() {
  activa.estado = leerEstado();
  activa.nombre = form.elements.nombre.value;
}

function elegirSerie(s) {
  if (s === activa) return;
  guardarActiva();
  activa = s;
  aplicarSerie(s);
  if (vista !== "todas") vista = s.id; // la gráfica sigue a la serie que editas
  renderPestanas();
  mostrarResueltos();
  repintar();
}

function anadirSerie() {
  guardarActiva();
  const s = nuevaSerie();
  series.push(s);
  activa = s;
  aplicarSerie(s);
  if (vista !== "todas") vista = s.id;
  renderPestanas();
  draw();
}

function cerrarSerie(s) {
  if (series.length < 2) return;
  // si era la variable explicada se vacía; si era explicativa, se quita de la lista (el resto de la elección se conserva)
  const { metodos, parametros, combinaciones } = imputacion;
  const explicativasRestantes = imputacion.explicativas.filter((id) => id !== s.id);
  if (imputacion.explicada.serieId === s.id) { imputacion = estadoImputacionVacio(); reiniciarExplicada(); }
  imputacion.explicativas = explicativasRestantes;
  imputacion.metodos = Object.fromEntries(Object.entries(metodos).filter(([clave]) => clave !== `solo:${s.id}`)); // los métodos elegidos se conservan (menos los de la ventana de esta serie)
  imputacion.parametros = parametros;
  imputacion.combinaciones = combinaciones.map((c) => {                                                      // las combinaciones pierden esta serie (con menos de 2, vuelven a "todas")
    const resto = Array.isArray(c.explicativas) ? c.explicativas.filter((id) => id !== s.id) : null;
    return { ...c, explicativas: resto && resto.length >= 2 ? resto : null };
  });
  const vistas = new Set();                                                                                  // las que han quedado iguales se funden en la primera
  imputacion.combinaciones = imputacion.combinaciones.filter((c) => {
    const clave = [...(c.explicativas || explicativasRestantes)].sort((a, b) => a - b).join(",");
    if (vistas.has(clave)) { delete imputacion.metodos[`multi:${c.id}`]; return false; }
    vistas.add(clave);
    return true;
  });
  guardarActiva();
  const posicion = series.indexOf(s);
  series = series.filter((x) => x !== s);
  if (activa === s) {
    activa = series[Math.max(0, posicion - 1)];
    aplicarSerie(activa);
  }
  if (vista === s.id) vista = activa.id;
  if (series.length < 2) vista = series[0].id; // con una sola serie ya no hay pestaña "Todas"
  renderPestanas();
  mostrarResueltos();
  repintar();
}

// El menú de "+ Nueva serie" se cierra al pulsar fuera
document.addEventListener("click", (e) => {
  if (!e.target.closest(".nueva-serie")) document.querySelectorAll(".menu-nueva").forEach((m) => { m.hidden = true; });
});

document.getElementById("pestanas-series").addEventListener("click", (e) => {
  const boton = e.target.closest("button");
  if (!boton) return;
  const s = series.find((x) => x.id === Number(boton.dataset.id));
  if (boton.dataset.accion === "elegir") elegirSerie(s);
  else if (boton.dataset.accion === "cerrar") cerrarSerie(s);
  else if (boton.dataset.accion === "menu-nueva") boton.nextElementSibling.hidden = !boton.nextElementSibling.hidden;
  else if (boton.dataset.accion === "nueva") anadirSerie();
  else if (boton.dataset.accion.startsWith("nueva-")) anadirSerieManual(boton.dataset.accion.slice(6));
});

document.getElementById("pestanas-grafica").addEventListener("click", (e) => {
  const boton = e.target.closest("button");
  if (!boton) return;
  vista = boton.dataset.vista === "todas" ? "todas" : Number(boton.dataset.vista);
  renderPestanasGrafica();
  repintar();
});
