// Imputación, pestaña 4: imputación y resultados.
// Se imputa la variable explicada con los métodos elegidos (el cálculo está en Python, ruta /api/imputar) y se mide
// su error contra el valor real de lo que se quitó en la pestaña 1. Se reparte en sub-pestañas según con qué se
// imputa: "Sin explicativas", "Solo X" (una por explicativa), una o varias "Multivariante" (combinaciones de explicativas a
// la vez, las que se elijan) y, al final, una "Comparación" que junta lo marcado en todas. En el proyecto se guarda qué métodos se eligieron y sus parámetros; los resultados se recalculan al abrir.

const GRUPOS_IMPUTACION = [
  ["explicito", "Explícitos"],
  ["referencia", "De referencia temporal"],
];

// id (el mismo que usa la API), nombre, grupo, si necesita explicativas, y qué hace (texto al pasar el ratón)
const METODOS_IMPUTACION = [
  { id: "media", nombre: "Media", grupo: "explicito", explicativas: false, ayuda: "Rellena con la media de los datos conocidos." },
  { id: "mediana", nombre: "Mediana", grupo: "explicito", explicativas: false, ayuda: "Rellena con la mediana de los datos conocidos." },
  { id: "regresion", nombre: "Regresión", grupo: "explicito", explicativas: true,
    ayuda: "Ajusta una recta de la explicada sobre las explicativas con los datos conocidos y predice los huecos." },
  { id: "em", nombre: "EM (esperanza-maximización)", grupo: "explicito", explicativas: true,
    ayuda: "Estima las medias y correlaciones de todas las series, rellena lo que falta y repite hasta estabilizarse. Admite huecos en las explicativas." },
  { id: "ultimo_valor", nombre: "Último valor conocido", grupo: "referencia", explicativas: false, ayuda: "Repite el último dato conocido (forward fill). Al principio de la serie, donde no hay ninguno antes, no imputa." },
  { id: "siguiente_valor", nombre: "Siguiente valor conocido", grupo: "referencia", explicativas: false,
    ayuda: "Repite el siguiente dato conocido (backward fill). Al final de la serie, donde no hay ninguno después, no imputa." },
  { id: "media_movil", nombre: "Media móvil centrada", grupo: "referencia", explicativas: false,
    ayuda: "Media de los k datos conocidos más cercanos antes del hueco y los k más cercanos después. Tú eliges k (como mucho, los datos conocidos que hay)." },
  { id: "media_movil_atras", nombre: "Media móvil (solo anteriores)", grupo: "referencia", explicativas: false,
    ayuda: "Media de los últimos k datos conocidos antes del punto: solo usa el pasado. Al principio de la serie, donde no hay ninguno antes, no imputa. Tú eliges k." },
  { id: "interpolacion", nombre: "Interpolación lineal", grupo: "referencia", explicativas: false,
    ayuda: "Une los datos conocidos con rectas. Es la referencia con la que se compara la mejora de cada método." },
  { id: "polinomica", nombre: "Interpolación polinómica (spline cúbica)", grupo: "referencia", explicativas: false,
    ayuda: "Une los datos conocidos con curvas: un polinomio de grado 3 entre cada dos datos, empalmados de forma suave. En huecos largos puede pasarse de largo." },
];
const REFERENCIA_IMPUTACION = "interpolacion";

// Medidas que se pueden ver en el resumen: [clave, nombre, ¿más es mejor?]
const MEDIDAS_RESUMEN = [
  ["rmse", "RMSE", false],
  ["mae", "Error absoluto medio (MAE)", false],
  ["rmse_est", "RMSE estandarizado", false],
  ["r2", "R²", true],
  ["mejora", "Mejora sobre la interpolación", true],
];

const resImp = {
  ui: {}, token: 0, controlador: null, temporizador: 0, cargando: false, error: "",
  sub: "sin", multiActiva: null, medida: "rmse", dibujar: null, orden: { columna: null, sentido: 1 }, destacado: null, detalleAbierto: true,
  vista: null,      // lo calculado para la sub-pestaña que se ve
  comparacion: null, // lo calculado para la comparación: un resultado por cada ventana con métodos marcados
  cache: new Map(), // lo ya calculado, para no volver a pedirlo (la clave es una huella de la petición)
};

const metodoDeImputacion = (id) => METODOS_IMPUTACION.find((m) => m.id === id);
const idsConExplicativas = () => METODOS_IMPUTACION.filter((m) => m.explicativas).map((m) => m.id);
const idsSinExplicativas = () => METODOS_IMPUTACION.filter((m) => !m.explicativas).map((m) => m.id);
// Cada método tiene un color fijo (sigue al método, no a su fila), de una paleta de 13: los 8 de las series y 5 más.
// El orden está elegido con el validador de paletas para que dos métodos seguidos se distingan también con
// daltonismo. Se salta el color de la explicada, para no confundir un método con su línea.
const ORDEN_COLORES_METODOS = [["series", 1], ["extra", 4], ["series", 7], ["series", 0], ["series", 5], ["series", 6], ["series", 4],
  ["series", 3], ["extra", 0], ["extra", 1], ["extra", 2], ["extra", 3], ["series", 2]];
function paletaDeMetodos(c) {
  const explicada = serieExplicada();
  const ocupado = explicada ? colorDe(explicada, c) : null;
  return ORDEN_COLORES_METODOS.map(([grupo, i]) => c[grupo][i]).filter((color) => color !== ocupado);
}
const indiceDeMetodo = (id) => Math.max(0, METODOS_IMPUTACION.findIndex((m) => m.id === id));
const colorDeMetodo = (id, c) => { const paleta = paletaDeMetodos(c); return paleta[indiceDeMetodo(id) % paleta.length]; };
const explicativasConDatos = () => explicativasElegidas().filter((x) => x.datos);
// las explicativas de una combinación: las que tiene elegidas (al menos 2) o, si no hay elección, todas
function explicativasDe(combinacion) {
  const todas = explicativasConDatos();
  const elegidas = Array.isArray(combinacion.explicativas) ? todas.filter((x) => combinacion.explicativas.includes(x.id)) : todas;
  return elegidas.length >= 2 ? elegidas : todas;
}
const idsDeCombinacion = (combinacion) => explicativasDe(combinacion).map((x) => x.id);
const claveSubconjunto = (ids) => [...ids].sort((a, b) => a - b).join(",");

// el primer subconjunto de 2 o más explicativas que todavía no tiene ventana (de más a menos explicativas), o null
function subconjuntoLibre() {
  const ids = explicativasConDatos().map((x) => x.id);
  const usados = new Set(imputacion.combinaciones.map((c) => claveSubconjunto(idsDeCombinacion(c))));
  const combinar = (desde, tamano) => {
    if (tamano === 0) return [[]];
    const salida = [];
    for (let i = desde; i <= ids.length - tamano; i++) for (const resto of combinar(i + 1, tamano - 1)) salida.push([ids[i], ...resto]);
    return salida;
  };
  for (let tamano = ids.length; tamano >= 2; tamano--) {
    const libre = combinar(0, tamano).find((c) => !usados.has(claveSubconjunto(c)));
    if (libre) return libre;
  }
  return null;
}

function anadirCombinacion() {
  const libre = subconjuntoLibre();
  if (!libre) return;
  const id = Math.max(0, ...imputacion.combinaciones.map((c) => c.id)) + 1;
  imputacion.combinaciones.push({ id, explicativas: libre.length >= explicativasConDatos().length ? null : libre });
  irAVentana(`multi:${id}`);
}

function quitarCombinacion(combinacion) {
  if (!combinacion || imputacion.combinaciones.length < 2) return;
  const eraLaActiva = resImp.sub === `multi:${combinacion.id}`;
  const posicion = imputacion.combinaciones.indexOf(combinacion);
  imputacion.combinaciones = imputacion.combinaciones.filter((c) => c !== combinacion);
  delete imputacion.metodos[`multi:${combinacion.id}`];
  // si era la que se veía, pasa a la anterior; si no, se queda donde estaba
  irAVentana(eraLaActiva ? `multi:${imputacion.combinaciones[Math.max(0, posicion - 1)].id}` : resImp.sub);
}

// cambia de ventana y lo repinta todo (también para guardar el cambio en el proyecto)
function irAVentana(id) {
  resImp.sub = id;
  resImp.destacado = null;
  resImp.orden = { columna: null, sentido: 1 };
  resImp.comparacion = null;
  resImp.vista = null;
  cambioImputacion();
  pintarSubpestanas();
  pintarMetodosImputacion();
  pintarResultados(objetivoDeExplicada());
  ejecutarImputacion();
}

function botonAnadirCombinacion() {
  const boton = document.createElement("button");
  boton.type = "button";
  boton.dataset.accion = "anadir";
  boton.className = "res-anadir";
  boton.title = "Añadir otra combinación de explicativas";
  boton.textContent = "+ combinación";
  return boton;
}

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
  if (clave === "r2" || clave === "rmse_est") return decimalesResultado(v);
  return numeroResultado(v);
}

// ----- Sub-pestañas: con qué se imputa -----
function subpestanasImputacion() {
  const elegidas = explicativasConDatos();
  const lista = [];
  lista.push({ id: "sin", titulo: "Sin explicativas", series: [], ayuda: "Métodos que solo usan la propia serie." });
  for (const s of elegidas) {
    lista.push({
      id: `solo:${s.id}`, titulo: elegidas.length >= 2 ? `Solo ${nombreDe(s)}` : `Con ${nombreDe(s)}`, series: [s], serie: s,
      ayuda: `Los métodos con explicativas, usando únicamente ${nombreDe(s)}.`,
    });
  }
  if (elegidas.length >= 2) {
    for (const combinacion of imputacion.combinaciones) {
      const usadas = explicativasDe(combinacion);
      const nombres = usadas.length === elegidas.length ? "todas" : usadas.map(nombreDe).join(" + ");
      lista.push({
        id: `multi:${combinacion.id}`, titulo: nombres, series: usadas, combinacion,
        ayuda: `Los métodos con explicativas, usando ${usadas.map(nombreDe).join(" + ")} a la vez (eliges cuáles a la izquierda).`,
      });
    }
  }
  lista.push({ id: "comparacion", titulo: "Comparación", ayuda: "Compara en una sola tabla los métodos que has marcado en las otras ventanas." });
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
const elegidosDe = (subId) => (Array.isArray(imputacion.metodos[subId]) ? imputacion.metodos[subId] : []);
// la comparación junta todas las demás ventanas
const ventanasDe = (sub) => (sub.id === "comparacion" ? subpestanasImputacion().filter((s) => s.id !== "comparacion") : [sub]);
function especificacion(sub) {
  const elegidos = METODOS_IMPUTACION.map((m) => m.id).filter((id) => elegidosDe(sub.id).includes(id) && metodosDeSub(sub).includes(id));
  // la interpolación va siempre en la petición (de ella sale la "mejora"), pero solo se enseña como fila si no es la ventana "sin"
  return { sub, series: sub.series || [], ids: elegidos, referencia: elegidos.length > 0 ? REFERENCIA_IMPUTACION : null };
}

// la k de la media móvil llega como mucho a los datos conocidos de la explicada (con más ya no cambia nada)
function maximoKMovil() {
  const obj = objetivoDeExplicada();
  return obj ? Math.max(1, obj.y.filter((v, i) => v !== null && !obj.quitado[i]).length) : 10000;
}
// métodos con k (los datos que entran en la media), y dónde se guarda la de cada uno
const K_DE_METODO = { media_movil: ["k_movil", "Datos a cada lado (k)"], media_movil_atras: ["k_movil_atras", "Datos anteriores (k)"] };
const pedidosDe = (ids) => ids.map((id) => ({ metodo: id, parametros: K_DE_METODO[id] ? { k: imputacion.parametros[K_DE_METODO[id][0]] } : {} }));

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
        <div class="pestanas res-combinaciones" id="res-combinaciones" role="tablist" aria-label="Combinaciones de explicativas" hidden></div>
        <p class="res-aviso" id="res-aviso-combinacion" role="alert" hidden>Ya has hecho esta combinación.</p>
        <p class="ayuda" id="res-info" style="margin:0 0 12px"></p>
        <div class="res-estado" id="res-estado" role="status"></div>
        <div id="res-vista-comp" hidden>
          <div class="res-tabla res-tabla-comp" id="res-tabla-comp" role="table" aria-label="Comparación de los métodos marcados"></div>
          <div class="res-controles">
            <label>Ranking por
              <select id="res-medida" aria-label="Medida del ranking"></select>
            </label>
          </div>
          <div id="res-grafica-ranking"></div>
          <div id="res-grafica-comp"></div>
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
    trabajo: q("#res-trabajo"), subpestanas: q("#res-subpestanas"), combinaciones: q("#res-combinaciones"), avisoCombinacion: q("#res-aviso-combinacion"), info: q("#res-info"), estado: q("#res-estado"),
    vistaComp: q("#res-vista-comp"), medida: q("#res-medida"), tablaComp: q("#res-tabla-comp"), graficaRanking: q("#res-grafica-ranking"), graficaComp: q("#res-grafica-comp"),
    vistaConjunto: q("#res-vista-conjunto"), tabla: q("#res-tabla"), grafica: q("#res-grafica"), detalle: q("#res-detalle"), tramos: q("#res-tramos"),
  };
  for (const [clave, nombre] of MEDIDAS_RESUMEN) resImp.ui.medida.append(new Option(nombre, clave));
  resImp.ui.medida.value = resImp.medida;
  resImp.ui.medida.addEventListener("change", () => { resImp.medida = resImp.ui.medida.value; pintarResultados(objetivoDeExplicada()); });
  resImp.ui.tablaComp.addEventListener("click", alPulsarTabla);
  resImp.ui.tablaComp.addEventListener("change", alMarcarDibujo);
  resImp.ui.detalle.open = resImp.detalleAbierto;
  resImp.ui.detalle.addEventListener("toggle", () => { resImp.detalleAbierto = resImp.ui.detalle.open; });
  q("#res-todos").addEventListener("click", () => cambiarMetodosVisibles(true));
  q("#res-ninguno").addEventListener("click", () => cambiarMetodosVisibles(false));
  resImp.ui.metodos.addEventListener("change", alCambiarMetodo);
  resImp.ui.tabla.addEventListener("click", alPulsarTabla);
  resImp.ui.subpestanas.addEventListener("click", alPulsarVentana);
  resImp.ui.combinaciones.addEventListener("click", alPulsarVentana);
  return raiz;
}

// las ventanas se eligen en la barra de arriba y, dentro de "Multivariante", en la de las combinaciones
function alPulsarVentana(e) {
  if (e.target.closest('button[data-accion="anadir"]')) { anadirCombinacion(); return; }
  const quitar = e.target.closest('button[data-accion="quitar"]');
  if (quitar) { quitarCombinacion(imputacion.combinaciones.find((c) => c.id === Number(quitar.dataset.combinacion))); return; }
  const boton = e.target.closest("button[data-sub]");
  if (!boton || boton.dataset.sub === resImp.sub) return;
  resImp.sub = boton.dataset.sub;
  resImp.destacado = null;
  resImp.orden = { columna: null, sentido: 1 };
  resImp.comparacion = null;
  pintarSubpestanas();
  pintarMetodosImputacion();
  pintarResultados(objetivoDeExplicada());   // si ya está calculado se ve al momento
  ejecutarImputacion();
}

async function actualizarResultados() {
  if (!resImp.ui.metodos || !resImp.ui.metodos.isConnected) return;
  const token = ++resImp.token;
  guardarActiva();
  await Promise.all(series.map(asegurarDatos));
  if (token !== resImp.token || !resImp.ui.metodos.isConnected) return;
  // lo elegido que ya no existe, o que ahora es la explicada, se quita
  imputacion.explicativas = imputacion.explicativas.filter((id) => id !== imputacion.explicada.serieId && series.some((x) => x.id === id));
  // lo elegido en ventanas que ya no existen (explicativas quitadas) se olvida
  const validas = new Set(["sin", ...imputacion.combinaciones.map((c) => `multi:${c.id}`), ...imputacion.explicativas.map((id) => `solo:${id}`)]);
  for (const clave of Object.keys(imputacion.metodos)) if (!validas.has(clave)) delete imputacion.metodos[clave];
  pintarSubpestanas();
  pintarMetodosImputacion();
  ejecutarImputacion();
}

function pintarSubpestanas() {
  const barra = resImp.ui.subpestanas;
  const actual = subActual();
  const lista = subpestanasImputacion();
  resImp.ui.raiz.classList.toggle("res-ancha", actual.id === "comparacion");   // la comparación no usa la lista de métodos
  if (actual.combinacion) resImp.multiActiva = actual.id;
  barra.replaceChildren();
  let grupoPuesto = false;
  for (const s of lista) {
    if (s.combinacion) {                       // todas las combinaciones comparten una sola pestaña, "Multivariante"
      if (grupoPuesto) continue;
      grupoPuesto = true;
    }
    const destino = s.combinacion ? lista.find((x) => x.id === resImp.multiActiva) || s : s;
    const activa = s.combinacion ? Boolean(actual.combinacion) : s.id === actual.id;
    const boton = document.createElement("button");
    boton.type = "button";
    boton.dataset.sub = destino.id;
    boton.title = s.combinacion ? "Los métodos con varias explicativas a la vez; tus combinaciones salen dentro." : s.ayuda;
    boton.className = activa ? "activa" : "";
    boton.setAttribute("role", "tab");
    boton.setAttribute("aria-selected", activa);
    if (s.serie) boton.append(crearPunto(s.serie.color));
    boton.append(s.combinacion ? "Multivariante" : s.titulo);
    barra.append(boton);
  }
  // las combinaciones, dentro de la pestaña Multivariante
  const fila = resImp.ui.combinaciones;
  fila.replaceChildren();
  fila.hidden = !actual.combinacion;
  resImp.ui.avisoCombinacion.hidden = true;
  if (!actual.combinacion) return;
  const clavesCombinaciones = lista.filter((x) => x.combinacion).map((x) => claveSubconjunto(x.series.map((y) => y.id)));
  for (const s of lista.filter((x) => x.combinacion)) {
    const pestana = document.createElement("div");
    pestana.className = "tab" + (s.id === actual.id ? " activa" : "");
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "tab-nombre";
    boton.dataset.sub = s.id;
    boton.title = s.ayuda;
    boton.setAttribute("role", "tab");
    boton.setAttribute("aria-selected", s.id === actual.id);
    boton.append(s.titulo);
    pestana.append(boton);
    if (lista.filter((x) => x.combinacion).length > 1) {
      const cerrar = document.createElement("button");
      cerrar.type = "button";
      cerrar.className = "cerrar";
      cerrar.dataset.accion = "quitar";
      cerrar.dataset.combinacion = s.combinacion.id;
      cerrar.title = `Quitar la combinación ${s.titulo}`;
      cerrar.setAttribute("aria-label", cerrar.title);
      cerrar.textContent = "×";
      pestana.append(cerrar);
    }
    fila.append(pestana);
  }
  if (subconjuntoLibre()) fila.append(botonAnadirCombinacion());
  // aviso si la combinación que se ve es igual a otra que ya existe
  const repetida = clavesCombinaciones.filter((clave) => clave === claveSubconjunto(actual.series.map((y) => y.id))).length > 1;
  resImp.ui.avisoCombinacion.hidden = !repetida;
}

// ----- Lista de métodos: solo los que valen para la sub-pestaña que se ve -----
function pintarMetodosImputacion() {
  const cont = resImp.ui.metodos;
  cont.replaceChildren();
  const sub = subActual();
  if (sub.id === "comparacion") return;
  const visibles = metodosDeSub(sub);
  const sinExplicativas = sub.id === "sin";
  resImp.ui.ayudaLateral.textContent = sinExplicativas
    ? "Marca los que quieras comparar: todos se calculan sobre los mismos huecos."
    : "Marca los que quieras comparar. La interpolación lineal se añade siempre como referencia.";
  if (sub.combinacion) {
    const encabezado = document.createElement("h4");
    encabezado.textContent = "Explicativas";
    cont.append(encabezado);
    const candidatas = explicativasConDatos();
    const usadas = sub.series;
    for (const s of candidatas) {
      const etiqueta = document.createElement("label");
      etiqueta.className = "toggle opcion res-multi";
      const casilla = document.createElement("input");
      casilla.type = "checkbox";
      casilla.className = "alea";
      casilla.dataset.multi = s.id;
      casilla.checked = usadas.includes(s);
      casilla.disabled = casilla.checked && usadas.length <= 2;      // una combinación necesita al menos 2 (para cambiar una, marca la nueva y quita la otra)
      etiqueta.append(casilla, crearPunto(s.color), ` ${nombreDe(s)}`);
      cont.append(etiqueta);
    }
  }
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
      casilla.checked = elegidosDe(sub.id).includes(m.id);
      etiqueta.append(casilla, ` ${m.nombre}`);
      tarjeta.append(etiqueta);
      if (K_DE_METODO[m.id]) {
        const [parametro, texto] = K_DE_METODO[m.id];
        const campo = document.createElement("label");
        campo.className = "res-param";
        campo.append(`${texto} `);
        const k = document.createElement("input");
        k.type = "number"; k.min = 1; k.max = maximoKMovil(); k.step = 1; k.value = imputacion.parametros[parametro]; k.dataset.param = parametro;
        k.setAttribute("aria-label", `${texto}: ${m.nombre}`);
        campo.append(k);
        tarjeta.append(campo);
      }
      cont.append(tarjeta);
    }
  }
  if (sinExplicativas && !explicativasConDatos().length) {
    const nota = document.createElement("p");
    nota.className = "ayuda";
    nota.textContent = "Elige variables explicativas en la pestaña 2 para probar también la regresión y el EM.";
    cont.append(nota);
  }
}

function alCambiarMetodo(e) {
  const objetivo = e.target;
  if (objetivo.dataset.multi) {
    const id = Number(objetivo.dataset.multi);
    const combinacion = subActual().combinacion;
    const nuevas = explicativasDe(combinacion).map((x) => x.id).filter((otra) => otra !== id);
    if (objetivo.checked) nuevas.push(id);
    const orden = explicativasConDatos().map((x) => x.id);
    const lista = orden.filter((otra) => nuevas.includes(otra));
    combinacion.explicativas = lista.length >= orden.length ? null : lista;
    cambioImputacion();
    resImp.comparacion = null;
    pintarSubpestanas();                                       // el título de la ventana dice qué combinación es
    pintarMetodosImputacion();
    ejecutarImputacion();
    return;
  }
  if (objetivo.dataset.metodo) {
    const elegidos = new Set(elegidosDe(subActual().id));
    if (objetivo.checked) elegidos.add(objetivo.dataset.metodo); else elegidos.delete(objetivo.dataset.metodo);
    cambiarMetodosImputacion(METODOS_IMPUTACION.map((m) => m.id).filter((id) => elegidos.has(id)));
    return;
  }
  const parametro = objetivo.dataset.param;
  if (Object.values(K_DE_METODO).some(([p]) => p === parametro)) {
    const k = Math.min(Math.max(parseInt(objetivo.value) || 1, 1), maximoKMovil());
    objetivo.value = k;
    if (k === imputacion.parametros[parametro]) return;
    imputacion.parametros[parametro] = k;
    cambioImputacion();
    ejecutarImputacion();
  }
}

function cambiarMetodosImputacion(ids) {
  const sub = subActual().id;
  if (JSON.stringify(ids) === JSON.stringify(elegidosDe(sub))) return;
  if (ids.length) imputacion.metodos[sub] = ids; else delete imputacion.metodos[sub];
  cambioImputacion();
  pintarMetodosImputacion();
  ejecutarImputacion();
}

// "Todos" y "Ninguno" solo afectan a los métodos que se ven en esta sub-pestaña
function cambiarMetodosVisibles(marcar) {
  const visibles = metodosDeSub(subActual());
  const elegidos = new Set(elegidosDe(subActual().id));
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
  const ids = spec.referencia && !spec.ids.includes(spec.referencia) ? [...spec.ids, spec.referencia] : spec.ids;
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
    : (quitados > 0
      ? ""
      : "No has quitado ningún tramo con valor real, así que no se puede medir el error (quita alguno en la pestaña 1).");

  const sub = subActual();
  const especificaciones = ventanasDe(sub).map(especificacion).filter((e) => e.ids.length);
  if (!aImputar || !especificaciones.length) {
    resImp.vista = null; resImp.comparacion = null; resImp.error = ""; resImp.cargando = false;
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
    if (error) { resImp.error = error.error; resImp.vista = null; resImp.comparacion = null; }
    else if (sub.id === "comparacion") resImp.comparacion = especificaciones.map((e, i) => ({ spec: e, datos: resultados[i].datos }));
    else resImp.vista = { spec: especificaciones[0], datos: resultados[0].datos };
  } catch (err) {
    if (err.name === "AbortError" || token !== resImp.token) return;
    resImp.error = "No se pudo conectar con el servidor para imputar.";
    resImp.vista = null; resImp.comparacion = null;
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
  const esComp = sub.id === "comparacion";
  const especificaciones = ventanasDe(sub).map(especificacion);
  const hayMetodos = especificaciones.some((e) => e.ids.length);
  const datos = esComp ? resImp.comparacion : (resImp.vista && resImp.vista.spec.sub.id === sub.id ? resImp.vista : null);
  const listo = Boolean(obj) && Boolean(datos) && hayMetodos && obj.aImputar > 0;
  u.vistaComp.hidden = !(esComp && listo);
  u.vistaConjunto.hidden = !(!esComp && listo);
  if (!listo) {
    for (const g of [u.grafica, u.graficaRanking, u.graficaComp]) { try { Plotly.purge(g); } catch { /* aún no había gráfica */ } }
    if (!resImp.error && obj && obj.aImputar && !hayMetodos && !resImp.cargando) {
      u.estado.textContent = esComp ? "Todavía no has marcado ningún método en las otras ventanas." : sub.id === "sin" ? "Marca algún método a la izquierda para ver cómo imputa y cuánto se equivoca."
        : "Marca la regresión o el EM a la izquierda para ver cómo imputan con estas explicativas.";
      u.estado.classList.remove("error");
      u.estado.hidden = false;
    }
    return;
  }
  if (esComp) {
    pintarComparacionImputacion(obj);
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
  const ids = vista.spec.sub.id !== "sin" && vista.spec.referencia && !vista.spec.ids.includes(vista.spec.referencia) ? [...vista.spec.ids, vista.spec.referencia] : vista.spec.ids;
  return ids.map(metodoDeImputacion).filter(Boolean).map((m) => delServidor[m.id] || { metodo: m.id, nombre: m.nombre, grupo: m.grupo, error: "Sin resultado" });
}

const AYUDA_RESULTADOS = {};   // se rellena justo debajo: la explicación de cada columna, también para sus celdas
const COLUMNAS_RESULTADOS = [
  ["nombre", "Método", "El método de imputación. Pulsa una fila para resaltarlo en la gráfica."],
  ["mae", "Error absoluto medio (MAE)", "La media de las distancias entre lo imputado y el valor real, en las unidades de la serie. Menos es mejor."],
  ["rmse", "RMSE", "Como el MAE, pero castiga más los fallos grandes. Menos es mejor."],
  ["rmse_est", "RMSE estandarizado", "RMSE / desviación típica de los datos conocidos. Es el error sin unidades, para comparar series distintas: 0 = perfecto; 1 = un error tan grande como lo que varía la serie. Menos es mejor."],
  ["r2", "R²", "R² = 1 − Σ(real − imputado)² / Σ(real − media de lo conocido)², sobre los puntos que quitaste. 1 = perfecto; 0 = igual que rellenar con la media; negativo = peor que eso. No es la correlación al cuadrado. Más es mejor."],
  ["mejora", "Mejora sobre la interpolación", "1 − RMSE del método / RMSE de la interpolación lineal. Positivo = mejor que la interpolación (35 % = un 35 % menos de error); negativo = peor."],
  ["n", "Puntos medidos", "Puntos quitados por ti, con valor real, que el método ha conseguido imputar."],
];
for (const [clave, , ayuda] of COLUMNAS_RESULTADOS) AYUDA_RESULTADOS[clave] = ayuda;

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
  for (const [c, mayorEsMejor] of [["mae", false], ["rmse", false], ["rmse_est", false], ["r2", true], ["mejora", true]]) {
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
      d.title = AYUDA_RESULTADOS[clave] || "";
      tabla.append(d);
    };
    poner("mae", numeroResultado(m.mae));
    poner("rmse", numeroResultado(m.rmse));
    poner("rmse_est", decimalesResultado(m.rmse_est));
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
    resImp.orden = resImp.orden.columna === columna ? { columna, sentido: -resImp.orden.sentido } : { columna, sentido: ["mae", "rmse", "rmse_est", "nombre", "conjunto"].includes(columna) ? 1 : -1 };
    pintarResultados(objetivoDeExplicada());
    return;
  }
  const celda = e.target.closest("[data-metodo]");
  if (celda) {   // pulsar una fila resalta ese método en la gráfica (y otra vez, lo suelta)
    resImp.destacado = resImp.destacado === celda.dataset.metodo ? null : celda.dataset.metodo;
    pintarResultados(objetivoDeExplicada());
  }
}

function pintarGraficaResultados(filas, obj, grafica = resImp.ui.grafica) {
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
      line: { color: f.color || colorDeMetodo(f.metodo, c), width: resImp.destacado === f.metodo ? 3.5 : 1.8 },
      marker: { size: 4 },
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

// ----- Comparación: lo marcado en todas las ventanas, en una sola tabla -----
const etiquetaConjunto = (sub) => (sub.id === "sin" ? "—" : sub.combinacion ? (sub.series.length === explicativasConDatos().length ? "Todas" : sub.series.map(nombreDe).join(" + ")) : nombreDe(sub.serie));
const etiquetaFila = (f) => (f.conjunto === "—" ? f.nombre : `${f.nombre} · ${f.conjunto}`);
const COLUMNAS_COMPARACION = [
  COLUMNAS_RESULTADOS[0],
  ["conjunto", "Explicativas", "Con qué explicativas se ha calculado: todas, algunas (X1 + X3), solo una o ninguna (—)."],
  ...COLUMNAS_RESULTADOS.slice(1),
];

// Una fila por método marcado y ventana, ordenadas por método; la interpolación va una sola vez, al final, como referencia
function filasComparacion() {
  const filas = [];
  const delServidor = (cj, id) => (cj.datos.resultados || []).find((x) => x.metodo === id);
  for (const m of METODOS_IMPUTACION) {
    if (m.id === REFERENCIA_IMPUTACION) continue;
    for (const cj of resImp.comparacion) {
      if (!cj.spec.ids.includes(m.id)) continue;
      const r = delServidor(cj, m.id) || { error: "Sin resultado" };
      filas.push({ ...r, clave: `${m.id}@${cj.spec.sub.id}`, metodo: m.id, nombre: m.nombre, conjunto: etiquetaConjunto(cj.spec.sub) });
    }
  }
  const referencia = resImp.comparacion.map((cj) => delServidor(cj, REFERENCIA_IMPUTACION)).find(Boolean);
  if (referencia) filas.push({ ...referencia, clave: REFERENCIA_IMPUTACION, metodo: REFERENCIA_IMPUTACION, nombre: metodoDeImputacion(REFERENCIA_IMPUTACION).nombre, conjunto: "—", esReferencia: true });
  return filas;
}

// Qué filas se dibujan: las que el usuario marque; mientras no marque ninguna, las 3 con menos error
function dibujadasComparacion(filas) {
  if (resImp.dibujar) return resImp.dibujar;
  const mejores = filas.filter((f) => !f.error && !f.esReferencia && f.metricas && f.metricas.rmse !== null).sort((a, b) => a.metricas.rmse - b.metricas.rmse).slice(0, 3);
  return new Set(mejores.map((f) => f.clave));
}

function alMarcarDibujo(e) {
  const casilla = e.target.closest("input[data-dibujar]");
  if (!casilla) return;
  const dibujar = new Set(dibujadasComparacion(filasComparacion()));
  if (casilla.checked) dibujar.add(casilla.dataset.dibujar); else dibujar.delete(casilla.dataset.dibujar);
  resImp.dibujar = dibujar;
  pintarResultados(objetivoDeExplicada());
}

function pintarComparacionImputacion(obj) {
  const c = colores();
  // en la comparación el color es de la fila (un mismo método puede salir con varias explicativas): el mismo en la
  // tabla, el ranking y la gráfica, y fijo aunque se marquen o desmarquen otras filas para dibujar
  const paleta = paletaDeMetodos(c);
  const filas = filasComparacion().map((f, i) => ({ ...f, colorFila: paleta[i % paleta.length] }));
  const dibujadas = dibujadasComparacion(filas);
  pintarTablaComparacion(filas, dibujadas);
  pintarRankingComparacion(filas);
  const paraDibujar = filas.filter((f) => dibujadas.has(f.clave) && !f.error)
    .map((f) => ({ ...f, metodo: f.esReferencia ? REFERENCIA_IMPUTACION : f.clave, nombre: etiquetaFila(f), color: f.colorFila }));
  pintarGraficaResultados(paraDibujar, obj, resImp.ui.graficaComp);
}

function pintarTablaComparacion(filas, dibujadas) {
  const tabla = resImp.ui.tablaComp;
  tabla.replaceChildren();
  const { columna, sentido } = resImp.orden;
  const valor = (f, c) => (c === "nombre" || c === "conjunto" ? String(f[c]).toLowerCase() : f.error || !f.metricas || f.metricas[c] === null ? null : f.metricas[c]);
  let ordenadas = filas;
  if (columna) {
    ordenadas = [...filas].sort((a, b) => {
      const x = valor(a, columna), y = valor(b, columna);
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * sentido;
    });
  }
  const mejor = {};
  for (const [c, mayorEsMejor] of [["mae", false], ["rmse", false], ["rmse_est", false], ["r2", true], ["mejora", true]]) {
    const valores = filas.map((f) => valor(f, c)).filter((v) => v !== null);
    if (valores.length > 1 || (valores.length === 1 && filas.length === 1)) mejor[c] = mayorEsMejor ? Math.max(...valores) : Math.min(...valores);
  }

  const cabeceraFija = document.createElement("div");
  cabeceraFija.className = "cab";
  cabeceraFija.title = "Marca las filas que quieras ver en la gráfica de la serie.";
  cabeceraFija.textContent = "Dibujar";
  tabla.append(cabeceraFija);
  for (const [id, texto, ayuda] of COLUMNAS_COMPARACION) {
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
    const tenue = f.esReferencia ? " tenue" : "";
    const celda = (clase = "") => { const d = document.createElement("div"); d.setAttribute("role", "cell"); d.dataset.clave = f.clave; d.className = (clase + tenue).trim(); return d; };
    const marca = celda("marca");
    const casilla = document.createElement("input");
    casilla.type = "checkbox";
    casilla.dataset.dibujar = f.clave;
    casilla.checked = dibujadas.has(f.clave) && !f.error;
    casilla.disabled = Boolean(f.error);
    casilla.setAttribute("aria-label", `Dibujar ${etiquetaFila(f)}`);
    marca.append(casilla);
    tabla.append(marca);
    const nombre = celda("nombre");
    const punto = document.createElement("span");
    punto.className = "punto-color";
    punto.style.background = f.colorFila || colorDeMetodo(f.metodo, c);
    const texto = document.createElement("span");
    texto.append(f.nombre);
    if (f.esReferencia) {
      const referencia = document.createElement("small");
      referencia.textContent = "la referencia";
      texto.append(referencia);
    }
    nombre.append(punto, texto);
    tabla.append(nombre);
    const conjunto = celda("conjunto");
    conjunto.textContent = f.conjunto;
    tabla.append(conjunto);
    if (f.error) {
      const aviso = celda("sin-calculo");
      aviso.textContent = f.error;
      aviso.style.gridColumn = "4 / -1";
      tabla.append(aviso);
      continue;
    }
    const m = f.metricas;
    const poner = (clave, texto) => {
      const d = celda("valor" + (mejor[clave] !== undefined && m[clave] === mejor[clave] ? " mejor" : ""));
      d.textContent = texto;
      d.title = AYUDA_RESULTADOS[clave] || "";
      tabla.append(d);
    };
    poner("mae", numeroResultado(m.mae));
    poner("rmse", numeroResultado(m.rmse));
    poner("rmse_est", decimalesResultado(m.rmse_est));
    poner("r2", decimalesResultado(m.r2));
    poner("mejora", f.esReferencia ? "—" : porcentajeResultado(m.mejora));
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

// Barras horizontales: todas las filas, de la mejor a la peor según la medida elegida
function pintarRankingComparacion(filas) {
  const grafica = resImp.ui.graficaRanking;
  const [clave, nombreMedida, mayorEsMejor] = MEDIDAS_RESUMEN.find((m) => m[0] === resImp.medida) || MEDIDAS_RESUMEN[0];
  // La interpolación es la referencia de la mejora: su mejora sobre sí misma es 0 %, y así sigue saliendo en el ranking
  const valor = (f) => (f.esReferencia && clave === "mejora" ? 0 : f.metricas[clave]);
  const con = filas.filter((f) => !f.error && f.metricas && (f.esReferencia && clave === "mejora" ? true : f.metricas[clave] !== null && f.metricas[clave] !== undefined))
    .sort((a, b) => (mayorEsMejor ? valor(b) - valor(a) : valor(a) - valor(b)));
  if (!con.length) {
    try { Plotly.purge(grafica); } catch { /* aún no había gráfica */ }
    grafica.style.height = "0";
    return;
  }
  grafica.style.height = `${90 + 34 * con.length}px`;
  const c = colores();
  const factor = clave === "mejora" ? 100 : 1;
  const eje = (texto) => ({
    title: texto ? { text: texto, font: { color: c.muted, size: 12 }, standoff: 8 } : undefined,
    gridcolor: c.grid, gridwidth: 1, zeroline: false, linecolor: c.axis, tickfont: { color: c.muted, size: 11 }, ticks: "",
  });
  Plotly.react(grafica, [{
    type: "bar", orientation: "h", y: con.map(etiquetaFila), x: con.map((f) => valor(f) * factor),
    marker: {
      color: con.map((f) => f.colorFila || colorDeMetodo(f.metodo, c)), opacity: con.map((f) => (f.esReferencia ? 0.4 : 1)),
    },
    hovertemplate: `<b>%{x:.3g}${clave === "mejora" ? " %" : ""}</b><extra>%{y}</extra>`,
  }], {
    paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)", font: { family: c.fuente, color: c.ink2 },
    margin: { t: 8, r: 16, b: 48, l: 250 }, showlegend: false, hovermode: "closest",
    xaxis: { ...eje(clave === "mejora" ? `${nombreMedida} (%)` : nombreMedida), showline: false },
    yaxis: { ...eje(""), autorange: "reversed", showgrid: false, showline: true },
    hoverlabel: { bgcolor: c.surface, bordercolor: c.axis, font: { color: c.ink, family: c.fuente, size: 13 } },
  }, { responsive: true, displaylogo: false, displayModeBar: false });
}
