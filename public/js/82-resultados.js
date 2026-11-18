// Imputación, pestaña 4: imputación y resultados.
// Se imputa la variable explicada con los métodos elegidos (el cálculo está en Python, ruta /api/imputar) y se mide
// su error contra el valor real de lo que se quitó en la pestaña 1. Se reparte en sub-pestañas según con qué se
// imputa: "Sin explicativas", "Solo X" (una por explicativa), una o varias "Multivariante" (combinaciones de explicativas a
// la vez, las que se elijan) y, al final, una "Comparación" que junta lo marcado en todas. En el proyecto se guarda qué métodos se eligieron y sus parámetros; los resultados se recalculan al abrir.

// Familias en las que se agrupan los métodos en la lista de la izquierda: cada una es un desplegable
const FAMILIAS_IMPUTACION = [
  { id: "basicos", titulo: "Media y mediana", metodos: ["media", "mediana"] },
  { id: "cercano", titulo: "Valor más cercano", metodos: ["ultimo_valor", "siguiente_valor"] },
  { id: "moviles", titulo: "Medias móviles", metodos: ["media_movil", "media_movil_atras", "media_movil_pond", "media_movil_pond_atras"] },
  { id: "estacional", titulo: "Estacional", metodos: ["media_estacional"] },
  { id: "interpolacion", titulo: "Interpolación", metodos: ["interpolacion", "polinomica", "pchip", "makima"] },
  { id: "modelos", titulo: "Modelos", metodos: ["regresion", "regresion_estocastica", "em", "imputacion_multiple"] },
];

// id (el mismo que usa la API), nombre, grupo, si necesita explicativas, y qué hace (texto al pasar el ratón)
const METODOS_IMPUTACION = [
  { id: "media", nombre: "Media", grupo: "explicito", explicativas: false, ayuda: "Rellena con la media de los datos conocidos." },
  { id: "mediana", nombre: "Mediana", grupo: "explicito", explicativas: false, ayuda: "Rellena con la mediana de los datos conocidos." },
  { id: "regresion", nombre: "Regresión", grupo: "explicito", explicativas: true,
    ayuda: "Ajusta una recta de la explicada sobre las explicativas con los datos conocidos y predice los huecos." },
  { id: "regresion_estocastica", nombre: "Regresión estocástica", grupo: "explicito", explicativas: true,
    ayuda: "Como la regresión, pero en vez de la media condicional imputa una extracción al azar de la distribución condicional: la predicción de la recta más un ruido normal con la varianza de los residuos (Handbook de la OCDE y el JRC, apartado 3.3, ecuación 3). Es una sola imputación por punto, con una semilla para que salga siempre lo mismo. Falla más que la regresión en precisión (suma ruido), pero no aplana la serie: conserva mejor la varianza y las correlaciones. El ruido es independiente en cada punto, así que no reproduce la textura temporal de los residuos. No da intervalo: el manual avisa de que una imputación única sigue subestimando la incertidumbre; la imputación múltiple sí la recoge." },
  { id: "em", nombre: "EM (esperanza-maximización)", grupo: "explicito", explicativas: true,
    ayuda: "Estima las medias y correlaciones de todas las series, rellena lo que falta y repite hasta estabilizarse. Admite huecos en las explicativas." },
  { id: "imputacion_multiple", nombre: "Imputación múltiple (MCMC)", grupo: "explicito", explicativas: true,
    ayuda: "Tal como la describe el Handbook de la OCDE y el JRC (apartado 3.5). Parte de las medias y covarianzas de los puntos sin datos faltantes; en cada iteración simula al azar los valores que faltan (paso de imputación) y recalcula medias y covarianzas con ellos (paso posterior), hasta que se estabiliza, y se queda con la imputación de la última. Repite todo N veces, de forma independiente, y rellena el hueco con la media (o la mediana) de las N. Supone que las series siguen una normal multivariante y que los datos faltan al azar; no usa el orden temporal. El manual no fija N ni las iteraciones: los eliges tú (por defecto, 5 y 100). Con la misma semilla sale siempre lo mismo." },
  { id: "ultimo_valor", nombre: "Último valor conocido", grupo: "referencia", explicativas: false, ayuda: "Repite el último dato conocido (forward fill). Al principio de la serie, donde no hay ninguno antes, no imputa." },
  { id: "siguiente_valor", nombre: "Siguiente valor conocido", grupo: "referencia", explicativas: false,
    ayuda: "Repite el siguiente dato conocido (backward fill). Al final de la serie, donde no hay ninguno después, no imputa." },
  { id: "media_movil", nombre: "Media móvil centrada", grupo: "referencia", explicativas: false,
    ayuda: "Media de los k datos conocidos más cercanos antes del hueco y los k más cercanos después. Tú eliges k (como mucho, los datos conocidos que hay)." },
  { id: "media_movil_atras", nombre: "Media móvil (solo anteriores)", grupo: "referencia", explicativas: false,
    ayuda: "Media de los últimos k datos conocidos antes del punto: solo usa el pasado. Al principio de la serie, donde no hay ninguno antes, no imputa. Tú eliges k." },
  { id: "media_movil_pond", nombre: "Media móvil ponderada centrada", grupo: "referencia", explicativas: false,
    ayuda: "Como la media móvil centrada, pero cada dato pesa 1 / su distancia en el tiempo al punto: uno a 1 punto pesa el doble que uno a 2. Tú eliges k." },
  { id: "media_movil_pond_atras", nombre: "Media móvil ponderada (solo anteriores)", grupo: "referencia", explicativas: false,
    ayuda: "Como la media móvil solo con anteriores, pero cada dato pesa 1 / su distancia en el tiempo al punto. Al principio de la serie no imputa. Tú eliges k." },
  { id: "media_estacional", nombre: "Media estacional", grupo: "referencia", explicativas: false,
    ayuda: "Media de los datos conocidos que están en el mismo momento del ciclo (un periodo antes, dos antes… y después). Con «Quitar la tendencia», antes se quita una recta y luego se vuelve a sumar. El periodo es el de la serie: el de «Descomponer serie» en la fase 1 (o el de su estacionalidad, si es generada)." },
  { id: "interpolacion", nombre: "Interpolación lineal", grupo: "referencia", explicativas: false,
    ayuda: "Une los datos conocidos con rectas. Es la referencia con la que se compara la mejora de cada método." },
  { id: "polinomica", nombre: "Interpolación polinómica (spline cúbica)", grupo: "referencia", explicativas: false,
    ayuda: "Une los datos conocidos con curvas: un polinomio de grado 3 entre cada dos datos, empalmados de forma suave (que coincidan también la pendiente y la curvatura). Eso obliga a resolver un solo sistema con todos los datos conocidos de la serie, así que un dato lejano influye un poco en el hueco, cada vez menos cuanto más lejos esté. En huecos largos puede pasarse de largo y oscilar; PCHIP y makima, que solo usan los datos vecinos, no." },
  { id: "pchip", nombre: "Interpolación PCHIP", grupo: "referencia", explicativas: false,
    ayuda: "Como la spline cúbica (una curva de grado 3 entre cada dos datos), pero eligiendo las pendientes para que la curva no se pase de largo: no sale del rango de sus dos datos vecinos y conserva si sube o baja entre ellos. Es lo que hace pchip en MATLAB. Donde hay un máximo o un mínimo en los datos, la curva se aplana. No recupera un pico escondido dentro de un hueco: solo ve los datos de los lados." },
  { id: "makima", nombre: "Interpolación makima", grupo: "referencia", explicativas: false,
    ayuda: "Como PCHIP, una curva de grado 3 entre cada dos datos, pero con las pendientes de la Akima modificada (la que usa makima en MATLAB): cada pendiente es una media de las de los dos tramos vecinos, que pesa más al que está más de acuerdo con ella. Oscila menos que la spline cúbica y trata mejor los tramos planos que PCHIP, aunque puede pasarse algo de los datos de los lados. No recupera un pico escondido dentro de un hueco: solo ve los datos de los lados." },
];
const REFERENCIA_IMPUTACION = "interpolacion";


const resImp = {
  ui: {}, token: 0, controlador: null, temporizador: 0, cargando: false, error: "",
  sub: "sin", multiActiva: null, familiasAbiertas: new Set(), bloque: "precision", medida: "rmse", dibujar: null, orden: { columna: null, sentido: 1 }, destacado: null, detalleAbierto: true,
  vista: null,      // lo calculado para la sub-pestaña que se ve
  comparacion: null, // lo calculado para la comparación: un resultado por cada ventana con métodos marcados
  cache: new Map(), // lo ya calculado, para no volver a pedirlo (la clave es una huella de la petición)
};

const metodoDeImputacion = (id) => METODOS_IMPUTACION.find((m) => m.id === id);
const idsConExplicativas = () => METODOS_IMPUTACION.filter((m) => m.explicativas).map((m) => m.id);
const idsSinExplicativas = () => METODOS_IMPUTACION.filter((m) => !m.explicativas).map((m) => m.id);
// Cada método tiene un color fijo (sigue al método, no a su fila), de una paleta de 16: los 8 de las series y 8 más.
// El orden está elegido con el validador de paletas para que dos métodos seguidos se distingan también con
// daltonismo. Se salta el color de la explicada, para no confundir un método con su línea.
const ORDEN_COLORES_METODOS = [["series", 7], ["series", 0], ["extra", 2], ["extra", 4], ["series", 3], ["series", 6], ["extra", 6], ["extra", 0],
  ["series", 4], ["series", 5], ["extra", 1], ["extra", 7], ["extra", 3], ["series", 2], ["extra", 5], ["series", 1]];
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

// Multivariante sin ninguna combinación: su pestaña sigue ahí (con «Manual» y «Stepwise» para crearlas)
const MULTI_VACIA = "multi:0";
// la pestaña «Resumen» de Multivariante compara todas las combinaciones en una tabla
const RESUMEN = "multi:resumen";
const esMultivariante = (s) => Boolean(s.combinacion || s.vacia || s.resumen);
// las vistas que son una tabla comparativa y no una sola ventana con su lista de métodos
const esComparativa = (s) => s.id === "comparacion" || Boolean(s.resumen);

function quitarCombinacion(combinacion) {
  if (!combinacion) return;
  const eraLaActiva = resImp.sub === `multi:${combinacion.id}`;
  const posicion = imputacion.combinaciones.indexOf(combinacion);
  imputacion.combinaciones = imputacion.combinaciones.filter((c) => c !== combinacion);
  delete imputacion.metodos[`multi:${combinacion.id}`];
  if (resImp.dibujar) resImp.dibujar = new Set([...resImp.dibujar].filter((clave) => !clave.endsWith(`@multi:${combinacion.id}`)));
  // si era la que se veía, pasa a la anterior (o a Multivariante vacía); si no, se queda donde estaba
  const anterior = imputacion.combinaciones[Math.max(0, posicion - 1)];
  const resumenDesaparece = resImp.sub === RESUMEN && imputacion.combinaciones.length < 2;
  irAVentana(eraLaActiva || resumenDesaparece ? (anterior ? `multi:${anterior.id}` : MULTI_VACIA) : resImp.sub);
}

const multivarianteVacia = () => imputacion.combinaciones.length === 0;

// Quita todas las combinaciones y sus métodos marcados (lo de las otras ventanas no se toca)
function empezarMultivarianteDeCero() {
  if (multivarianteVacia()) return;
  if (!confirm("¿Quitar todas las combinaciones de Multivariante (y sus métodos marcados) y empezar de cero?")) return;
  imputacion.combinaciones = [];
  for (const k of Object.keys(imputacion.metodos)) if (k.startsWith("multi:")) delete imputacion.metodos[k];
  if (resImp.dibujar) resImp.dibujar = new Set([...resImp.dibujar].filter((clave) => !clave.includes("@multi:")));
  resImp.busquedas = {};
  irAVentana(MULTI_VACIA);
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

// ----- Sugerir explicativas: el servidor prueba subconjuntos (validando por bloques) y los ordena por error -----
const cuerpoSugerencia = (series = explicativasConDatos()) => {
  const obj = objetivoDeExplicada();
  return obj ? JSON.stringify({ y: obj.y, quitados: tramosQuitados(), explicativas: series.map((x) => x.datos.y) }) : null;
};

// Hasta cuántas explicativas se pueden marcar en la búsqueda exhaustiva: 8 son 247 combinaciones
const MAX_EXHAUSTIVA = 8;
// El resultado de la última búsqueda de cada modo: { huella, ids (las series que se probaron), datos }
const busquedaDe = (modo) => (resImp.busquedas || {})[modo];

// Busca combinaciones con la regresión. «stepwise»: con todas las explicativas (paso a paso si hay más de 8).
// «exhaustiva»: solo con las marcadas (hasta 8), probando todas las combinaciones entre ellas.
async function sugerirCombinacion(modo = "stepwise") {
  const panel = resImp.ui.sugerencia;
  const todas = explicativasConDatos();
  let series = todas;
  if (modo === "exhaustiva") {
    const marcadas = new Set(marcadasEnExhaustiva());
    series = todas.filter((x) => marcadas.has(x.id));
    if (series.length < 2 || series.length > MAX_EXHAUSTIVA) {
      panel.hidden = false;
      panel.textContent = `Marca entre 2 y ${MAX_EXHAUSTIVA} explicativas para la búsqueda exhaustiva.`;
      return;
    }
  }
  const cuerpo = cuerpoSugerencia(series);
  if (!cuerpo) return;
  panel.hidden = false;
  if (todas.length < 2) { panel.textContent = "Hacen falta al menos 2 explicativas con datos para buscar combinaciones."; return; }
  const ids = series.map((x) => x.id);
  panel.textContent = "Buscando combinaciones…";
  try {
    const respuesta = await fetch("/api/sugerir-explicativas", { method: "POST", headers: { "Content-Type": "application/json" }, body: cuerpo });
    const datos = await respuesta.json();
    if (!respuesta.ok) { panel.textContent = typeof datos.detail === "string" ? datos.detail : "No se han podido buscar combinaciones con estos datos."; return; }
    resImp.busquedas = { ...(resImp.busquedas || {}), [modo]: { huella: huellaTexto(cuerpo), ids, datos } };
    resImp.sugerenciaTodas = false;
    resImp.sugerenciaOrden = ORDEN_SUGERENCIA_INICIAL();
    pintarSugerencia();
  } catch (e) {
    panel.textContent = "No se ha podido conectar con el servidor para buscar combinaciones.";
  }
}

// la búsqueda de ese modo, si sigue siendo para los datos que hay ahora (y para las mismas series)
function sugerenciaVigente(modo = resImp.modoMulti) {
  const s = busquedaDe(modo);
  if (!s) return false;
  const todas = explicativasConDatos();
  const series = modo === "exhaustiva" ? s.ids.map((id) => todas.find((x) => x.id === id)) : todas;
  if (series.some((x) => !x)) return false;
  const cuerpo = cuerpoSugerencia(series);
  return Boolean(cuerpo) && s.huella === huellaTexto(cuerpo);
}

// la combinación (pestaña de Multivariante) que usa justo estas explicativas, o undefined
const combinacionConExplicativas = (idsSerie) => imputacion.combinaciones.find((c) => claveSubconjunto(idsDeCombinacion(c)) === claveSubconjunto(idsSerie));
const MAX_COMBINACIONES = 20;   // las que se guardan en el proyecto

// Crea la combinación y devuelve su id. `metodos`: los que salen marcados al crearla.
function nuevaCombinacion(idsSerie, metodos) {
  const id = Math.max(0, ...imputacion.combinaciones.map((c) => c.id)) + 1;
  imputacion.combinaciones.push({ id, explicativas: idsSerie.length >= explicativasConDatos().length ? null : idsSerie });
  if (metodos.length) imputacion.metodos[`multi:${id}`] = [...metodos];
  return id;
}

// Añade a la lista, SIN cambiar de pestaña (para poder añadir varias seguidas); la pestaña nueva parpadea un momento.
// Si no había ninguna combinación se va a la primera, porque la vista vacía desaparece.
function anadidaSinIr(id, veniaDeVacia) {
  if (veniaDeVacia) { irAVentana(`multi:${id}`); return; }
  resImp.destello = id;
  cambioImputacion();
  pintarSubpestanas();
  ejecutarImputacion();
  setTimeout(() => {
    if (resImp.destello !== id) return;
    resImp.destello = null;
    const pestana = resImp.ui.combinaciones && resImp.ui.combinaciones.querySelector(`[data-sub="multi:${id}"]`);
    if (pestana && pestana.parentElement) pestana.parentElement.classList.remove("destello");
  }, 1600);
}

// Stepwise: añade la combinación con la regresión marcada (es con lo que se ordenan)
function anadirDeSugerencia(indices) {
  const s = busquedaDe(resImp.modoMulti);
  if (!s) return;
  const subconjunto = indices.map((i) => s.ids[i]);
  if (combinacionConExplicativas(subconjunto) || imputacion.combinaciones.length >= MAX_COMBINACIONES) return;
  const veniaDeVacia = resImp.sub === MULTI_VACIA;
  anadidaSinIr(nuevaCombinacion(subconjunto, ["regresion"]), veniaDeVacia);
}

// Manual: las explicativas que se han marcado en el panel
function marcadasEnManual() {
  const existentes = new Set(explicativasConDatos().map((x) => x.id));
  return [...(resImp.manualSel || [])].filter((id) => existentes.has(id));
}

// Manual: añade la combinación y va a ella. Hereda los métodos de la combinación que se estaba viendo (o la regresión)
function anadirManual() {
  const ids = marcadasEnManual();
  if (ids.length < 2 || combinacionConExplicativas(ids) || imputacion.combinaciones.length >= MAX_COMBINACIONES) return;
  const actual = subActual();
  const heredados = actual.combinacion ? elegidosDe(actual.id) : [];
  const id = nuevaCombinacion(ids, heredados.length ? heredados : ["regresion"]);
  resImp.manualSel = new Set();
  irAVentana(`multi:${id}`);
}

// Abre o cierra Manual / Stepwise / Exhaustiva (solo uno a la vez). Al abrir Stepwise sin búsqueda vigente, busca;
// la Exhaustiva espera a que marques las explicativas y pulses «Buscar».
function cambiarModoMulti(modo) {
  resImp.modoMulti = resImp.modoMulti === modo ? null : modo;
  resImp.ui.sugerencia.hidden = true;                    // la tabla del modo anterior no se queda a la vista
  if (resImp.modoMulti === "stepwise" && !sugerenciaVigente("stepwise")) sugerirCombinacion("stepwise");
  pintarSubpestanas();
}

// El panel de «Manual»: las casillas de las explicativas y el botón de añadir
function pintarModoManual() {
  const caja = resImp.ui.modoManual;
  caja.hidden = resImp.modoMulti !== "manual";
  caja.replaceChildren();
  if (caja.hidden) return;
  const encabezado = document.createElement("span");
  encabezado.className = "res-explicativas-titulo";
  encabezado.textContent = "Elige 2 o más explicativas:";
  caja.append(encabezado);
  const marcadas = new Set(marcadasEnManual());
  for (const x of explicativasConDatos()) {
    const etiqueta = document.createElement("label");
    etiqueta.className = "toggle opcion res-multi";
    const casilla = document.createElement("input");
    casilla.type = "checkbox";
    casilla.className = "alea";
    casilla.dataset.manual = x.id;
    casilla.checked = marcadas.has(x.id);
    etiqueta.append(casilla, crearPunto(x.color), ` ${nombreDe(x)}`);
    caja.append(etiqueta);
  }
  const ids = [...marcadas];
  const repetida = ids.length >= 2 && combinacionConExplicativas(ids);
  const llena = imputacion.combinaciones.length >= MAX_COMBINACIONES;
  const boton = document.createElement("button");
  boton.type = "button";
  boton.dataset.accion = "manual-anadir";
  boton.textContent = "Añadir combinación";
  boton.disabled = ids.length < 2 || Boolean(repetida) || llena;
  boton.title = llena ? `Ya hay ${MAX_COMBINACIONES} combinaciones: quita alguna para añadir otra` : repetida ? "Ya tienes esta combinación" : ids.length < 2 ? "Marca al menos 2 explicativas" : "Añadir esta combinación a la lista";
  caja.append(boton);
  if (repetida) {
    const aviso = document.createElement("small");
    aviso.className = "res-multi-aviso";
    aviso.textContent = "Ya tienes esta combinación.";
    caja.append(aviso);
  }
}

// Exhaustiva: las explicativas que se han marcado (solo las que existen)
function marcadasEnExhaustiva() {
  const existentes = new Set(explicativasConDatos().map((x) => x.id));
  return [...(resImp.exhaustivaSel || [])].filter((id) => existentes.has(id));
}

// El panel de «Exhaustiva»: las casillas (hasta 8), cuántas combinaciones se probarían y el botón de buscar
function pintarModoExhaustiva() {
  const caja = resImp.ui.modoExhaustiva;
  caja.hidden = resImp.modoMulti !== "exhaustiva";
  caja.replaceChildren();
  if (caja.hidden) return;
  const todas = explicativasConDatos();
  const marcadas = new Set(marcadasEnExhaustiva());
  const lleno = marcadas.size >= MAX_EXHAUSTIVA;
  const encabezado = document.createElement("span");
  encabezado.className = "res-explicativas-titulo";
  encabezado.textContent = `Elige entre 2 y ${MAX_EXHAUSTIVA} de las ${todas.length} explicativas:`;
  caja.append(encabezado);
  for (const x of todas) {
    const etiqueta = document.createElement("label");
    etiqueta.className = "toggle opcion res-multi";
    const casilla = document.createElement("input");
    casilla.type = "checkbox";
    casilla.className = "alea";
    casilla.dataset.exh = x.id;
    casilla.checked = marcadas.has(x.id);
    casilla.disabled = !casilla.checked && lleno;
    etiqueta.append(casilla, crearPunto(x.color), ` ${nombreDe(x)}`);
    caja.append(etiqueta);
  }
  const cuantas = marcadas.size;
  const combinaciones = cuantas >= 2 ? 2 ** cuantas - cuantas - 1 : 0;
  const contador = document.createElement("small");
  contador.className = "res-multi-aviso";
  contador.textContent = `Marcadas: ${cuantas} de ${MAX_EXHAUSTIVA} como máximo · ${combinaciones ? `se probarían ${combinaciones} combinaciones` : "marca al menos 2"}`;
  const boton = document.createElement("button");
  boton.type = "button";
  boton.dataset.accion = "exhaustiva-buscar";
  boton.textContent = "Buscar";
  boton.disabled = cuantas < 2;
  boton.title = cuantas < 2 ? "Marca al menos 2 explicativas" : "Probar todas las combinaciones entre las marcadas";
  caja.append(boton, contador);
}

// El estado de la barra: qué modo está abierto, si «Exhaustiva» tiene sentido (más de 8 explicativas) y si hay algo que vaciar
function pintarHerramientasMulti() {
  const caja = resImp.ui.multiCaja;
  const hayMuchas = explicativasConDatos().length > MAX_EXHAUSTIVA;
  if (!hayMuchas && resImp.modoMulti === "exhaustiva") resImp.modoMulti = null;       // con 8 o menos, Stepwise ya prueba todas
  for (const boton of caja.querySelectorAll("button[data-modo]")) {
    if (boton.dataset.modo === "exhaustiva") boton.hidden = !hayMuchas;
    const abierto = boton.dataset.modo === resImp.modoMulti;
    boton.classList.toggle("activa", abierto);
    boton.setAttribute("aria-pressed", String(abierto));
  }
  const reiniciar = caja.querySelector('button[data-accion="reiniciar"]');
  if (reiniciar) reiniciar.disabled = multivarianteVacia();
  pintarModoManual();
  pintarModoExhaustiva();
}

// Por qué columna se ordena la tabla de Stepwise. «natural» es el sentido en que va lo mejor primero: 1 = de menor a mayor
// (los errores), -1 = de mayor a menor (el R²). Pulsar la misma columna invierte el orden.
const ORDENES_SUGERENCIA = { rmse: { texto: "RMSE", natural: 1 }, mae: { texto: "MAE", natural: 1 }, r2_ajustado: { texto: "R² ajustado", natural: -1 } };
const ORDEN_SUGERENCIA_INICIAL = () => ({ col: "rmse", invertido: false });

// Las combinaciones ordenadas por esa columna; sin valor, al final; los empates, como venían (por RMSE)
function ordenarCandidatos(candidatos, col, invertido) {
  const direccion = ORDENES_SUGERENCIA[col].natural * (invertido ? -1 : 1);
  return candidatos.map((c, i) => ({ c, i })).sort((a, b) => {
    const va = a.c[col], vb = b.c[col];
    const sinA = va === null || va === undefined, sinB = vb === null || vb === undefined;
    if (sinA !== sinB) return sinA ? 1 : -1;
    if (!sinA && va !== vb) return (va - vb) * direccion;
    return a.i - b.i;
  }).map((x) => x.c);
}

function ordenarSugerencia(col) {
  if (!ORDENES_SUGERENCIA[col]) return;
  const actual = resImp.sugerenciaOrden || ORDEN_SUGERENCIA_INICIAL();
  resImp.sugerenciaOrden = actual.col === col ? { col, invertido: !actual.invertido } : { col, invertido: false };
  pintarSugerencia();
}

// la tabla de «Stepwise» / «Exhaustiva»: las combinaciones probadas, ordenadas por la columna elegida, con «Añadir a la lista»
function pintarSugerencia() {
  const panel = resImp.ui.sugerencia;
  const modo = resImp.modoMulti;
  if (modo !== "stepwise" && modo !== "exhaustiva") { panel.hidden = true; return; }
  const s = busquedaDe(modo);
  if (s && !sugerenciaVigente(modo)) {                   // los datos cambiaron desde la búsqueda
    resImp.busquedas = { ...resImp.busquedas, [modo]: null };
    const aviso = document.createElement("p");
    aviso.className = "res-sugerencia-pie";
    aviso.textContent = "Los datos han cambiado desde la última búsqueda.";
    const otra = document.createElement("button");
    otra.type = "button";
    otra.dataset.sugBuscar = "1";
    otra.textContent = "Buscar de nuevo";
    panel.replaceChildren(aviso, otra);
    panel.hidden = false;
    return;
  }
  if (!s) return;                                        // aún sin buscar (o buscando): no se toca lo que haya
  const cifra = (v, d = 2) => (v === null || v === undefined ? "—" : v.toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d }));
  const nombreDeId = (id) => { const x = explicativasConDatos().find((e) => e.id === id); return x ? nombreDe(x) : "?"; };
  const nombre = (i) => nombreDeId(s.ids[i]);
  const d = s.datos;
  const POR_DEFECTO = 5;
  const todas = Boolean(resImp.sugerenciaTodas) && d.candidatos.length > POR_DEFECTO;
  const orden = resImp.sugerenciaOrden || ORDEN_SUGERENCIA_INICIAL();
  const ordenadas = ordenarCandidatos(d.candidatos, orden.col, orden.invertido);
  const mostradas = todas ? ordenadas : ordenadas.slice(0, POR_DEFECTO);
  const mejorFila = ordenarCandidatos(d.candidatos, orden.col, false)[0];      // la mejor según esa columna, esté donde esté en la lista
  const mejorNombre = mejorFila.indices.map(nombre).join(" + ");
  const titular = document.createElement("p");
  titular.className = "res-sugerencia-titular";
  titular.textContent = `${modo === "exhaustiva" ? `Búsqueda exhaustiva con ${s.ids.map(nombreDeId).join(", ")}. ` : ""}Mejor combinación para la regresión según ${ORDENES_SUGERENCIA[orden.col].texto}: ${mejorNombre}. Se han probado ${d.probados}.`;

  const tabla = document.createElement("table");
  tabla.className = "res-sugerencia-tabla";
  const cabecera = tabla.createTHead().insertRow();
  const columnas = [["#", "Posición en el orden elegido"], ["Combinación", "Las explicativas que usa la regresión"],
    ["RMSE", d.validacion === "tramos" ? "Error típico sobre los tramos que quitaste, medido igual que en la tabla de resultados de abajo. Menos es mejor." : "Error típico al predecir los bloques escondidos, en las unidades de la serie. Menos es mejor."],
    ["MAE", d.validacion === "tramos" ? "Error medio absoluto sobre los tramos que quitaste, igual que en la tabla de resultados. Menos es mejor." : "Error medio absoluto de esos bloques. Menos es mejor."],
    ["R² ajustado", "Qué parte de la variación de la serie explica el modelo con todos sus datos, penalizando usar variables de más. Más es mejor."],
    ["Lista", "Añade esta combinación a la lista de pestañas de arriba, con la regresión marcada"]];
  const columnaDe = { "RMSE": "rmse", "MAE": "mae", "R² ajustado": "r2_ajustado" };
  for (const [t, ayuda] of columnas) {
    const th = document.createElement("th");
    th.scope = "col";
    th.title = columnaDe[t] ? `${ayuda} Pulsa para ordenar por esta columna; otra vez, para invertir el orden.` : ayuda;
    const col = columnaDe[t];
    if (col) {
      const activa = orden.col === col;
      const sentido = ORDENES_SUGERENCIA[col].natural * (orden.invertido ? -1 : 1);         // 1 = de menor a mayor
      th.setAttribute("aria-sort", activa ? (sentido === 1 ? "ascending" : "descending") : "none");
      const boton = document.createElement("button");
      boton.type = "button";
      boton.className = "res-ordenar" + (activa ? " activa" : "");
      boton.dataset.sugOrden = col;
      boton.textContent = activa ? `${t} ${sentido === 1 ? "▲" : "▼"}` : t;
      th.append(boton);
    } else {
      th.textContent = t;
    }
    cabecera.append(th);
  }
  const cuerpoTabla = tabla.createTBody();
  const llena = imputacion.combinaciones.length >= MAX_COMBINACIONES;
  mostradas.forEach((c, posicion) => {
    const fila = cuerpoTabla.insertRow();
    fila.insertCell().textContent = String(posicion + 1);
    const celda = fila.insertCell();
    celda.textContent = c.indices.map(nombre).join(" + ");
    if (c === mejorFila) { const marca = document.createElement("span"); marca.className = "res-sugerencia-mejor"; marca.textContent = "mejor"; celda.append(" ", marca); }
    for (const v of [cifra(c.rmse), cifra(c.mae), cifra(c.r2_ajustado, 3)]) fila.insertCell().textContent = v;
    const yaEsta = Boolean(combinacionConExplicativas(c.indices.map((i) => s.ids[i])));
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "res-sugerencia-anadir" + (yaEsta ? " anadida" : "");
    boton.dataset.sugIndices = c.indices.join(",");
    boton.textContent = yaEsta ? "✓ En la lista" : "Añadir a la lista";
    boton.title = yaEsta ? "Esta combinación ya es una pestaña" : llena ? `Ya hay ${MAX_COMBINACIONES} combinaciones: quita alguna para añadir otra` : "Añadir esta combinación a la lista de pestañas de arriba, con la regresión marcada";
    boton.disabled = yaEsta || llena;
    fila.insertCell().append(boton);
  });
  const caja = document.createElement("div");
  caja.className = "res-sugerencia-caja" + (todas ? " con-scroll" : "");
  caja.append(tabla);

  const controles = document.createElement("div");
  controles.className = "res-sugerencia-controles";
  if (d.candidatos.length > POR_DEFECTO) {
    const alternar = document.createElement("button");
    alternar.type = "button";
    alternar.dataset.sugTodas = "1";
    alternar.setAttribute("aria-expanded", String(todas));
    alternar.textContent = todas ? `Ver solo las ${POR_DEFECTO} mejores` : `Ver las ${d.candidatos.length} combinaciones`;
    controles.append(alternar);
  }
  const pie = document.createElement("p");
  pie.className = "res-sugerencia-pie";
  const cuantas = todas || d.candidatos.length <= POR_DEFECTO
    ? (d.metodo === "exhaustivo" ? `Se muestran las ${d.candidatos.length} combinaciones posibles.` : `Se muestran las ${d.candidatos.length} combinaciones que ha probado por el camino (no todas las posibles).`)
    : `Se muestran las ${POR_DEFECTO} mejores de ${d.candidatos.length}.`;
  pie.textContent = `${cuantas} Solo vale para la regresión: con EM o imputación múltiple el orden puede ser otro.`;
  controles.append(pie);

  const detalle = document.createElement("details");
  const resumen = document.createElement("summary");
  resumen.textContent = "Cómo se ha calculado";
  const texto = document.createElement("p");
  texto.textContent = `${d.metodo === "exhaustivo" ? "Se han probado todas las combinaciones posibles de 2 o más explicativas." : "Como hay muchas explicativas, se ha ido añadiendo la que más baja el error (paso a paso); no garantiza la mejor de todas."} ${d.validacion === "tramos" ? `Para cada una se ha ajustado la regresión con los datos conocidos y se ha medido el error sobre los ${d.quitados} puntos que quitaste, igual que en la tabla de resultados: el RMSE y el MAE de la primera coinciden con los de la fila «Regresión» de esa combinación. Se ordenan por ese RMSE. Como se elige y se mide con los mismos puntos, el error sale algo optimista.` : `Como no has quitado tramos con valor real (o hay muy pocos), para cada una se han escondido ${d.bloques} bloques seguidos de los ${d.conocidos} datos conocidos y se han predicho con la regresión, ajustada con el resto. Se ordenan por el RMSE de esos bloques; no coincide con el de la tabla de resultados, que se mide en tus tramos.`}`;
  detalle.append(resumen, texto);
  panel.replaceChildren(titular, caja, controles, detalle);
  panel.hidden = false;
}

// Números para las tablas: siempre 2 decimales
function numeroResultado(v) {
  if (v === null || v === undefined) return "—";
  // siempre 2 decimales, para que las cifras de una pantalla se puedan comparar con las de otra
  return v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
const porcentajeResultado = (v) => (v === null || v === undefined ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v * 100).toLocaleString("es-ES", { maximumFractionDigits: 0 })} %`);
const decimalesResultado = (v) => (v === null || v === undefined ? "—" : v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

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
      const nombres = usadas.length === elegidas.length ? "Todas" : usadas.map(nombreDe).join(" + ");
      lista.push({
        id: `multi:${combinacion.id}`, titulo: nombres, series: usadas, combinacion,
        ayuda: `Los métodos con explicativas, usando ${usadas.map(nombreDe).join(" + ")} a la vez (eliges cuáles a la izquierda).`,
      });
    }
    if (!imputacion.combinaciones.length) lista.push({ id: MULTI_VACIA, titulo: "", series: [], vacia: true, ayuda: "" });
    if (imputacion.combinaciones.length >= 2) lista.push({ id: RESUMEN, titulo: "Resumen", series: [], resumen: true, ayuda: "Compara en una tabla todas las combinaciones de Multivariante, con los métodos que has marcado en cada una." });
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
const ventanasDe = (sub) => (sub.id === "comparacion" ? subpestanasImputacion().filter((s) => s.id !== "comparacion")
  : sub.resumen ? subpestanasImputacion().filter((s) => s.combinacion) : [sub]);
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
// Parámetros de cada método: dónde se guardan en el proyecto (clave), cómo se llaman en la API, su texto y sus límites.
// Los enteros se escriben en una casilla de número; "casilla" es un sí/no. El periodo de la media estacional no se
// elige aquí: es el de la serie (el de «Descomponer serie» en la fase 1, o el de su estacionalidad si es generada).
const PARAMETROS_DE_METODO = {
  media_movil: [{ clave: "k_movil", api: "k", texto: "Datos a cada lado (k)", min: 1, max: maximoKMovil }],
  media_movil_atras: [{ clave: "k_movil_atras", api: "k", texto: "Datos anteriores (k)", min: 1, max: maximoKMovil }],
  media_movil_pond: [{ clave: "k_movil_pond", api: "k", texto: "Datos a cada lado (k)", min: 1, max: maximoKMovil }],
  media_movil_pond_atras: [{ clave: "k_movil_pond_atras", api: "k", texto: "Datos anteriores (k)", min: 1, max: maximoKMovil }],
  media_estacional: [{ clave: "quitar_tendencia", api: "quitar_tendencia", texto: "Quitar la tendencia antes", tipo: "casilla" }],
  regresion_estocastica: [{ clave: "re_semilla", api: "semilla", texto: "Semilla", min: 0, max: () => 1000000, nuevaSemilla: true }],
  imputacion_multiple: [
    { clave: "mi_n", api: "n", texto: "Imputaciones (N)", min: 2, max: () => 50 },
    { clave: "mi_iteraciones", api: "iteraciones", texto: "Iteraciones", min: 10, max: () => 500 },
    { clave: "mi_semilla", api: "semilla", texto: "Semilla", min: 0, max: () => 1000000, nuevaSemilla: true },
    { clave: "mi_combinar", api: "combinar", texto: "Combinar con", tipo: "seleccion", opciones: [["media", "la media"], ["mediana", "la mediana"]] },
  ],
};
const definicionDeParametro = (clave) => Object.values(PARAMETROS_DE_METODO).flat().find((d) => d.clave === clave);

function pedidosDe(ids) {
  return ids.map((id) => {
    const parametros = {};
    for (const d of PARAMETROS_DE_METODO[id] || []) {
      const valor = imputacion.parametros[d.clave];
      if (valor !== null && valor !== undefined) parametros[d.api] = valor;
    }
    if (id === "media_estacional") {
      const periodo = periodoDeSerie(serieExplicada());
      if (periodo) parametros.periodo = periodo;
    }
    return { metodo: id, parametros };
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

// ----- Ayuda («?» de la barra de arriba): las secciones de la pestaña Imputación, sacadas de las mismas constantes que los tooltips -----
function seccionesAyudaImputacion() {
  const secciones = [{
    id: "i-lectura", grupo: "Primeros pasos", titulo: "Cómo se lee",
    intro: "Se quitan tramos de la serie (pestaña «Variable explicada»), cada método los rellena y se compara lo imputado con el valor real que había.",
    entradas: [
      ["Mejor valor", "En las tablas, la mejor cifra de cada columna va en negrita: en unas es la menor (los errores), en otras la mayor (R², mejora) y en otras la más cercana a 1 (razón de varianzas). Cada métrica lo dice en su explicación."],
      ["Pestañas", "«Sin explicativas» usa solo la propia serie. «Solo X» usa una explicativa. «Multivariante» usa varias a la vez. «Comparación» junta en una tabla lo que hayas marcado en las demás."],
    ],
  }];
  for (const b of BLOQUES_METRICAS) {
    secciones.push({ id: `i-metricas-${b.id}`, grupo: "Métricas", titulo: b.titulo, intro: b.explicacion, entradas: b.metricas.map((m) => [m.texto, m.ayuda]) });
  }
  for (const familia of FAMILIAS_IMPUTACION) {
    const entradas = familia.metodos.map(metodoDeImputacion).filter(Boolean).map((m) => [m.nombre, m.ayuda]);
    secciones.push({ id: `i-metodos-${familia.id}`, grupo: "Métodos", titulo: familia.titulo, entradas });
  }
  secciones.push({
    id: "i-seleccion", grupo: "Elegir el resultado", titulo: "Selección",
    intro: "La última pestaña de la fase: eliges el método que deja la serie final y la obtienes.",
    entradas: [
      ["Candidatos", "Los métodos que marcaste en «Imputación y resultados», cada uno con su error al validar. Está marcado por defecto el de menor error; la etiqueta «mejor estructura» señala el que mejor conserva cómo varía la serie."],
      ["Serie final", "Los datos reales, con los huecos que ya tenía la serie rellenados con el método elegido. Los tramos que quitaste para probar vuelven a su valor real: solo se imputa lo que de verdad faltaba."],
      ["Fiabilidad", "Si el método da intervalo (regresión y EM), se dibuja y va en el CSV. La regresión estocástica y la imputación múltiple no dan intervalo."],
      ["Descargar CSV", "Los puntos, si cada uno está imputado y su intervalo del 95 % si lo hay."],
      ["Guardar como serie nueva", "Añade la serie final como una serie más del proyecto (fase 1), para usarla en las fases siguientes."],
    ],
  });
  secciones.push({
    id: "i-multivariante", grupo: "Elegir las explicativas", titulo: "Multivariante: combinaciones",
    intro: "En Multivariante trabajas con una lista de combinaciones de explicativas: cada pestaña es una, con sus métodos, errores y gráfica. Para rellenar la lista tienes dos herramientas.",
    entradas: [
      ["Manual", "Marcas tú las explicativas (2 o más) y pulsas «Añadir combinación». Va a esa pestaña, con los métodos marcados de la que estabas viendo (o la regresión)."],
      ["Stepwise", "Prueba combinaciones con la regresión y las ordena por su error. Con 8 explicativas o menos prueba todas las posibles; con más, va añadiendo la que más baja el error (paso a paso), que no garantiza la mejor de todas. «Añadir a la lista» crea la pestaña con la regresión marcada y no te cambia de pestaña, para poder añadir varias seguidas."],
      ["Exhaustiva", "Solo aparece con más de 8 explicativas (con 8 o menos, Stepwise ya prueba todas). Marcas entre 2 y 8 y prueba todas las combinaciones entre ellas (hasta 247), así que es la mejor entre las que marcas. Usa la misma tabla que Stepwise. Si dejas fuera una variable buena, no la verá: puedes mirar antes qué variables salen en Stepwise y marcar esas."],
      ["Ver todas", "La tabla enseña las 5 mejores; «Ver las N combinaciones» despliega todas las probadas."],
      ["Ordenar", "Por defecto va por RMSE. Pulsa la cabecera RMSE, MAE o R² ajustado para ordenar por esa columna (con la flecha ves el sentido); pulsa otra vez para invertir. La etiqueta «mejor» marca la mejor según la columna elegida."],
      ["Cómo valida", "Mide el error sobre los tramos que quitaste, igual que la tabla de resultados: el RMSE y el MAE de una combinación coinciden con los de su fila «Regresión». Si no has quitado tramos con valor real, esconde bloques seguidos de los datos conocidos y los predice con un modelo ajustado con el resto; entonces el RMSE no coincide con el de la tabla. Como se elige y se mide con los mismos puntos, el error sale algo optimista. El R² ajustado se calcula sobre los mismos datos con los que se ajusta, por eso puede no coincidir con el orden."],
      ["Resumen", "La última pestaña (con 2 o más combinaciones): una tabla que compara todas las combinaciones, con los métodos que has marcado en cada una."],
      ["Empezar de cero", "Quita todas las combinaciones y sus métodos marcados."],
      ["Ojo", "El orden de Stepwise vale solo para la regresión: con EM o imputación múltiple puede ser otro."],
    ],
  });
  return secciones;
}

// ----- Montaje -----
function montarResultados() {
  const raiz = document.createElement("div");
  raiz.className = "res";
  raiz.innerHTML = `
    <aside class="res-lateral caja">
      <h3 class="caja-titulo">Métodos</h3>
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
      <div id="res-trabajo" class="res-cajas" hidden>
       <section class="caja">
        <h3 class="caja-titulo">Variables</h3>
        <div class="pestanas res-subpestanas" id="res-subpestanas" role="tablist" aria-label="Con qué explicativas se imputa"></div>
        <div class="res-multi-caja" id="res-multi-caja" hidden>
          <div class="res-multi-barra">
            <span class="res-multi-etiqueta">Añadir combinaciones</span>
            <button type="button" data-modo="manual" aria-pressed="false" aria-controls="res-modo-manual" title="Elige tú las explicativas de la combinación">Manual</button>
            <button type="button" data-modo="stepwise" aria-pressed="false" aria-controls="res-sugerencia" title="Prueba combinaciones con la regresión y las ordena por su error: añade a la lista las que quieras">Stepwise</button>
            <button type="button" data-modo="exhaustiva" aria-pressed="false" aria-controls="res-modo-exhaustiva" hidden title="Marcas hasta 8 explicativas y prueba todas las combinaciones entre ellas">Exhaustiva</button>
            <button type="button" class="res-reiniciar" data-accion="reiniciar" title="Quitar todas las combinaciones y los métodos marcados en Multivariante">Empezar de cero</button>
          </div>
          <div class="res-modo-manual" id="res-modo-manual" hidden></div>
          <div class="res-modo-manual" id="res-modo-exhaustiva" hidden></div>
          <div class="res-sugerencia" id="res-sugerencia" hidden></div>
        </div>
        <div class="pestanas res-combinaciones" id="res-combinaciones" role="tablist" aria-label="Combinaciones de explicativas" hidden></div>
        <p class="res-aviso" id="res-aviso-combinacion" role="alert" hidden>Ya has hecho esta combinación.</p>
        <div class="res-explicativas" id="res-explicativas" hidden></div>
       </section>
       <section class="caja">
        <h3 class="caja-titulo">Errores y gráfico</h3>
        <p class="ayuda" id="res-info" style="margin:0 0 12px"></p>
        <div class="pestanas res-bloques" id="res-bloques" role="tablist" aria-label="Qué métricas se ven"></div>
        <div class="res-estado" id="res-estado" role="status"></div>
        <div id="res-vista-comp" hidden>
          <p class="res-nota">Las métricas de precisión premian acertar el valor esperado. Los métodos que añaden variabilidad aleatoria (como la imputación múltiple) salen igual o algo peor en ellas, pero conservan mejor la varianza y las correlaciones, que importan en la ponderación y en el análisis de sensibilidad.</p>
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
       </section>
      </div>
    </section>`;
  const q = (sel) => raiz.querySelector(sel);
  resImp.ui = {
    raiz, metodos: q("#res-metodos"), ayudaLateral: q("#res-ayuda-lateral"), falta: q("#res-falta"), faltaTexto: q("#res-falta-texto"), faltaIr: q("#res-falta-ir"),
    trabajo: q("#res-trabajo"), subpestanas: q("#res-subpestanas"), combinaciones: q("#res-combinaciones"), avisoCombinacion: q("#res-aviso-combinacion"), explicativas: q("#res-explicativas"), sugerencia: q("#res-sugerencia"), multiCaja: q("#res-multi-caja"), modoManual: q("#res-modo-manual"), modoExhaustiva: q("#res-modo-exhaustiva"), info: q("#res-info"), bloques: q("#res-bloques"), estado: q("#res-estado"),
    vistaComp: q("#res-vista-comp"), medida: q("#res-medida"), tablaComp: q("#res-tabla-comp"), graficaRanking: q("#res-grafica-ranking"), graficaComp: q("#res-grafica-comp"),
    vistaConjunto: q("#res-vista-conjunto"), tabla: q("#res-tabla"), grafica: q("#res-grafica"), detalle: q("#res-detalle"), tramos: q("#res-tramos"),
  };
  // el ranking, por cualquier métrica que tenga un "mejor", agrupadas por bloque
  for (const bloque of BLOQUES_METRICAS) {
    const grupo = document.createElement("optgroup");
    grupo.label = bloque.titulo;
    for (const def of bloque.metricas.filter((m) => m.mejor)) grupo.append(new Option(textoRanking(def), def.clave));
    resImp.ui.medida.append(grupo);
  }
  resImp.ui.medida.value = resImp.medida;
  pintarBloques();
  resImp.ui.bloques.addEventListener("click", (e) => {
    const boton = e.target.closest("button[data-bloque]");
    if (!boton || boton.dataset.bloque === resImp.bloque) return;
    const bloque = BLOQUES_METRICAS.find((b) => b.id === boton.dataset.bloque);
    resImp.bloque = bloque.id;
    resImp.medida = bloque.ranking;                            // el ranking sigue al objetivo elegido
    resImp.ui.medida.value = resImp.medida;
    resImp.orden = { columna: null, sentido: 1 };
    pintarBloques();
    pintarResultados(objetivoDeExplicada());
  });
  resImp.ui.medida.addEventListener("change", () => { resImp.medida = resImp.ui.medida.value; pintarResultados(objetivoDeExplicada()); });
  resImp.ui.tablaComp.addEventListener("click", alPulsarTabla);
  resImp.ui.tablaComp.addEventListener("change", alMarcarDibujo);
  resImp.ui.detalle.open = resImp.detalleAbierto;
  resImp.ui.detalle.addEventListener("toggle", () => { resImp.detalleAbierto = resImp.ui.detalle.open; });
  q("#res-todos").addEventListener("click", () => cambiarMetodosVisibles(true));
  q("#res-ninguno").addEventListener("click", () => cambiarMetodosVisibles(false));
  resImp.ui.metodos.addEventListener("change", alCambiarMetodo);
  resImp.ui.explicativas.addEventListener("change", alCambiarMetodo);   // las casillas de qué explicativas usa la combinación
  resImp.ui.metodos.addEventListener("click", (e) => {            // "Nueva semilla": otra tirada del azar
    const boton = e.target.closest('button[data-accion="nueva-semilla"]');
    if (!boton) return;
    imputacion.parametros[boton.dataset.param] = Math.floor(Math.random() * 1000001);
    cambioImputacion();
    pintarMetodosImputacion();
    ejecutarImputacion();
  });
  resImp.ui.tabla.addEventListener("click", alPulsarTabla);
  resImp.ui.sugerencia.addEventListener("click", (e) => {
    const anadir = e.target.closest("button[data-sug-indices]");
    if (anadir) { anadirDeSugerencia(anadir.dataset.sugIndices.split(",").map(Number)); return; }
    const ordenar = e.target.closest("button[data-sug-orden]");
    if (ordenar) { ordenarSugerencia(ordenar.dataset.sugOrden); return; }
    if (e.target.closest("button[data-sug-buscar]")) { sugerirCombinacion(resImp.modoMulti); return; }
    if (e.target.closest("button[data-sug-todas]")) { resImp.sugerenciaTodas = !resImp.sugerenciaTodas; pintarSugerencia(); }
  });
  resImp.ui.multiCaja.addEventListener("click", (e) => {            // la barra «Manual | Stepwise | Empezar de cero» y el panel Manual
    const modo = e.target.closest("button[data-modo]");
    if (modo) { cambiarModoMulti(modo.dataset.modo); return; }
    if (e.target.closest('button[data-accion="reiniciar"]')) { empezarMultivarianteDeCero(); return; }
    if (e.target.closest('button[data-accion="manual-anadir"]')) { anadirManual(); return; }
    if (e.target.closest('button[data-accion="exhaustiva-buscar"]')) sugerirCombinacion("exhaustiva");
  });
  resImp.ui.multiCaja.addEventListener("change", (e) => {
    const exhaustiva = e.target.closest("input[data-exh]");
    if (exhaustiva) {
      const marcadas = new Set(marcadasEnExhaustiva());
      if (exhaustiva.checked && marcadas.size < MAX_EXHAUSTIVA) marcadas.add(Number(exhaustiva.dataset.exh)); else marcadas.delete(Number(exhaustiva.dataset.exh));
      resImp.exhaustivaSel = marcadas;
      pintarModoExhaustiva();
      return;
    }
    const casilla = e.target.closest("input[data-manual]");
    if (!casilla) return;
    const marcadas = new Set(marcadasEnManual());
    if (casilla.checked) marcadas.add(Number(casilla.dataset.manual)); else marcadas.delete(Number(casilla.dataset.manual));
    resImp.manualSel = marcadas;
    pintarModoManual();
  });
  resImp.ui.subpestanas.addEventListener("click", alPulsarVentana);
  resImp.ui.combinaciones.addEventListener("click", alPulsarVentana);
  return raiz;
}

// las ventanas se eligen en la barra de arriba y, dentro de "Multivariante", en la de las combinaciones
function alPulsarVentana(e) {
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
  resImp.ui.raiz.classList.toggle("res-ancha", esComparativa(actual));   // la comparación y el resumen no usan la lista de métodos
  if (esMultivariante(actual)) resImp.multiActiva = actual.id;
  barra.replaceChildren();
  let grupoPuesto = false;
  for (const s of lista) {
    const multi = esMultivariante(s);
    if (multi) {                       // todas las combinaciones comparten una sola pestaña, "Multivariante"
      if (grupoPuesto) continue;
      grupoPuesto = true;
    }
    const destino = multi ? lista.find((x) => x.id === resImp.multiActiva) || s : s;
    const activa = multi ? esMultivariante(actual) : s.id === actual.id;
    const boton = document.createElement("button");
    boton.type = "button";
    boton.dataset.sub = destino.id;
    boton.title = multi ? "Los métodos con varias explicativas a la vez; tus combinaciones salen dentro." : s.ayuda;
    boton.className = activa ? "activa" : "";
    boton.setAttribute("role", "tab");
    boton.setAttribute("aria-selected", activa);
    if (s.serie) boton.append(crearPunto(s.serie.color));
    boton.append(multi ? "Multivariante" : s.titulo);
    barra.append(boton);
  }
  // las combinaciones, dentro de la pestaña Multivariante
  const fila = resImp.ui.combinaciones;
  fila.replaceChildren();
  fila.hidden = !esMultivariante(actual);
  resImp.ui.multiCaja.hidden = !esMultivariante(actual);
  resImp.ui.avisoCombinacion.hidden = true;
  if (!esMultivariante(actual)) { resImp.ui.sugerencia.hidden = true; return; }
  pintarHerramientasMulti();
  pintarSugerencia();
  const clavesCombinaciones = lista.filter((x) => x.combinacion).map((x) => claveSubconjunto(x.series.map((y) => y.id)));
  for (const s of lista.filter((x) => x.combinacion)) {
    const pestana = document.createElement("div");
    pestana.className = "tab" + (s.id === actual.id ? " activa" : "") + (resImp.destello === s.combinacion.id ? " destello" : "");
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "tab-nombre";
    boton.dataset.sub = s.id;
    boton.title = s.ayuda;
    boton.setAttribute("role", "tab");
    boton.setAttribute("aria-selected", s.id === actual.id);
    boton.append(s.titulo);
    pestana.append(boton);
    {
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
  // «Resumen»: la tabla que compara todas las combinaciones (solo con 2 o más)
  const resumen = lista.find((x) => x.resumen);
  if (resumen) {
    const pestana = document.createElement("div");
    pestana.className = "tab res-resumen-tab" + (resumen.id === actual.id ? " activa" : "");
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "tab-nombre";
    boton.dataset.sub = resumen.id;
    boton.title = resumen.ayuda;
    boton.setAttribute("role", "tab");
    boton.setAttribute("aria-selected", resumen.id === actual.id);
    boton.append(resumen.titulo);
    pestana.append(boton);
    fila.append(pestana);
  }
  // aviso si la combinación que se ve es igual a otra que ya existe
  const repetida = clavesCombinaciones.filter((clave) => clave === claveSubconjunto(actual.series.map((y) => y.id))).length > 1;
  resImp.ui.avisoCombinacion.hidden = !repetida;
}

// ----- Lista de métodos: solo los que valen para la sub-pestaña que se ve -----
function pintarMetodosImputacion() {
  const cont = resImp.ui.metodos;
  cont.replaceChildren();
  const sub = subActual();
  const cajaExplicativas = resImp.ui.explicativas;
  cajaExplicativas.replaceChildren();
  cajaExplicativas.hidden = !sub.combinacion;
  if (esComparativa(sub)) return;
  if (sub.vacia) { resImp.ui.ayudaLateral.textContent = ""; return; }
  const visibles = metodosDeSub(sub);
  const sinExplicativas = sub.id === "sin";
  resImp.ui.ayudaLateral.textContent = sinExplicativas
    ? "Marca los que quieras comparar: todos se calculan sobre los mismos huecos."
    : "Marca los que quieras comparar. La interpolación lineal se añade siempre como referencia.";
  if (sub.combinacion) {
    const encabezado = document.createElement("span");
    encabezado.className = "res-explicativas-titulo";
    encabezado.textContent = "Explicativas que usa:";
    cajaExplicativas.append(encabezado);
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
      cajaExplicativas.append(etiqueta);
    }
  }
  const familias = FAMILIAS_IMPUTACION.map((f) => ({ ...f, lista: METODOS_IMPUTACION.filter((m) => f.metodos.includes(m.id) && visibles.includes(m.id)) }))
    .filter((f) => f.lista.length);
  const elegidos = elegidosDe(sub.id);
  for (const familia of familias) {
    // cerrada salvo que se haya abierto (o que sea la única); en la cabecera, cuántos hay marcados
    const bloque = document.createElement("details");
    bloque.className = "res-familia";
    bloque.dataset.familia = familia.id;
    bloque.open = familias.length === 1 || resImp.familiasAbiertas.has(familia.id);
    const resumen = document.createElement("summary");
    const cuantos = familia.lista.filter((m) => elegidos.includes(m.id)).length;
    const cuenta = document.createElement("small");
    cuenta.className = cuantos ? "con-marcados" : "";
    cuenta.textContent = `${cuantos} de ${familia.lista.length}`;
    resumen.append(familia.titulo, cuenta);
    bloque.append(resumen);
    bloque.addEventListener("toggle", () => {
      if (bloque.open) resImp.familiasAbiertas.add(familia.id); else resImp.familiasAbiertas.delete(familia.id);
    });
    cont.append(bloque);
    for (const m of familia.lista) {
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
      for (const d of PARAMETROS_DE_METODO[m.id] || []) tarjeta.append(campoDeParametro(d, m));
      bloque.append(tarjeta);
    }
  }
  if (sinExplicativas && !explicativasConDatos().length) {
    const nota = document.createElement("p");
    nota.className = "ayuda";
    nota.textContent = "Elige variables explicativas en la pestaña 2 para probar también la regresión (simple o estocástica), el EM y la imputación múltiple.";
    cont.append(nota);
  }
}

// El campo de un parámetro en la tarjeta de su método
function campoDeParametro(d, m) {
  const campo = document.createElement("label");
  campo.className = "res-param" + (d.tipo === "casilla" ? " toggle opcion" : "");
  const entrada = document.createElement("input");
  entrada.dataset.param = d.clave;
  entrada.setAttribute("aria-label", `${d.texto}: ${m.nombre}`);
  if (d.tipo === "casilla") {
    entrada.type = "checkbox";
    entrada.className = "alea";
    entrada.checked = imputacion.parametros[d.clave] !== false;
    campo.append(entrada, ` ${d.texto}`);
    return campo;
  }
  if (d.tipo === "seleccion") {
    const selector = document.createElement("select");
    selector.dataset.param = d.clave;
    selector.setAttribute("aria-label", `${d.texto}: ${m.nombre}`);
    for (const [valor, texto] of d.opciones) selector.append(new Option(texto, valor));
    selector.value = imputacion.parametros[d.clave];
    campo.append(`${d.texto} `, selector);
    return campo;
  }
  entrada.type = "number"; entrada.min = d.min; entrada.max = d.max(); entrada.step = 1;
  entrada.value = imputacion.parametros[d.clave];
  campo.append(`${d.texto} `, entrada);
  if (d.nuevaSemilla) {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "res-detectar";
    boton.dataset.accion = "nueva-semilla";
    boton.dataset.param = d.clave;
    boton.textContent = "Nueva semilla";
    boton.title = "Otra tirada del azar: sale otro resultado (con la misma semilla, siempre el mismo)";
    campo.append(boton);
  }
  return campo;
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
  const d = definicionDeParametro(objetivo.dataset.param);
  if (!d) return;
  let valor;
  if (d.tipo === "casilla") {
    valor = objetivo.checked;
  } else if (d.tipo === "seleccion") {
    valor = objetivo.value;
  } else {
    valor = Math.min(Math.max(parseInt(objetivo.value) || d.min, d.min), d.max());
    objetivo.value = valor;
  }
  if (valor === imputacion.parametros[d.clave]) return;
  imputacion.parametros[d.clave] = valor;
  cambioImputacion();
  ejecutarImputacion();
}

function cambiarMetodosImputacion(ids) {
  const sub = subActual().id;
  if (JSON.stringify(ids) === JSON.stringify(elegidosDe(sub))) return;
  if (ids.length) imputacion.metodos[sub] = ids; else delete imputacion.metodos[sub];
  cambioImputacion();
  const reiniciar = document.querySelector("#res-combinaciones .res-reiniciar");
  if (reiniciar) reiniciar.disabled = multivarianteVacia();
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
  const texto = JSON.stringify({ y: obj.y, quitados: tramosQuitados(), explicativas: spec.series.map((x) => x.datos.y), metodos: pedidosDe(ids), comparar_con: explicativasConDatos().map((x) => x.datos.y) });
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
    else if (esComparativa(sub)) resImp.comparacion = especificaciones.map((e, i) => ({ spec: e, datos: resultados[i].datos }));
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
  estado.classList.toggle("cargando", resImp.cargando);
  estado.hidden = !estado.textContent;
}

function pintarResultados(obj) {
  pintarEstadoResultados();
  const u = resImp.ui;
  const sub = subActual();
  const esComp = esComparativa(sub);
  const especificaciones = ventanasDe(sub).map(especificacion);
  const hayMetodos = especificaciones.some((e) => e.ids.length);
  const datos = esComp ? resImp.comparacion : (resImp.vista && resImp.vista.spec.sub.id === sub.id ? resImp.vista : null);
  const listo = Boolean(obj) && Boolean(datos) && hayMetodos && obj.aImputar > 0;
  u.vistaComp.hidden = !(esComp && listo);
  u.vistaConjunto.hidden = !(!esComp && listo);
  if (!listo) {
    for (const g of [u.grafica, u.graficaRanking, u.graficaComp]) { try { Plotly.purge(g); } catch { /* aún no había gráfica */ } }
    if (!resImp.error && obj && obj.aImputar && !hayMetodos && !resImp.cargando) {
      u.estado.textContent = esComp ? (sub.resumen ? "Todavía no has marcado ningún método en las combinaciones." : "Todavía no has marcado ningún método en las otras ventanas.") : sub.vacia ? "No hay ninguna combinación: crea una con «Manual» o «Stepwise»." : sub.id === "sin" ? "Marca algún método a la izquierda para ver cómo imputa y cuánto se equivoca."
        : "Marca la regresión (simple o estocástica), el EM o la imputación múltiple a la izquierda para ver cómo imputan con estas explicativas.";
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

// ----- Métricas, en tres bloques: la tabla enseña el bloque elegido -----
// mejor: "menor", "mayor" o "uno" (cuanto más cerca de 1); sin "mejor" no se resalta ni sirve para el ranking.
const BLOQUES_METRICAS = [
  { id: "precision", titulo: "Precisión", ranking: "rmse",
    explicacion: "¿Acierta cada valor? Cuánto se aleja lo imputado del valor real en cada punto que quitaste (MAE, RMSE…). Ojo: premia a los métodos que van por el medio, aunque aplanen la serie.",
    metricas: [
    { clave: "mae", texto: "Error absoluto medio (MAE)", formato: numeroResultado, mejor: "menor",
      ayuda: "La media de las distancias entre lo imputado y el valor real, en las unidades de la serie. Menos es mejor." },
    { clave: "rmse", texto: "RMSE", formato: numeroResultado, mejor: "menor", ayuda: "Como el MAE, pero castiga más los fallos grandes. Menos es mejor." },
    { clave: "rmse_est", texto: "RMSE estandarizado", formato: decimalesResultado, mejor: "menor",
      ayuda: "RMSE / desviación típica de los datos conocidos. Es el error sin unidades, para comparar series distintas: 0 = perfecto; 1 = un error tan grande como lo que varía la serie. Menos es mejor." },
    { clave: "r2", texto: "R²", formato: decimalesResultado, mejor: "mayor",
      ayuda: "R² = 1 − Σ(real − imputado)² / Σ(real − media de lo conocido)², sobre los puntos que quitaste. 1 = perfecto; 0 = igual que rellenar con la media; negativo = peor que eso. No es la correlación al cuadrado. Más es mejor." },
    { clave: "d_r", texto: "Índice d_r de Willmott", formato: decimalesResultado, mejor: "mayor",
      ayuda: "Índice de acuerdo d_r (Willmott et al., 2012), de −1 a 1. Con A = Σ|imputado − real| y B = 2·Σ|real − media de lo real|: d_r = 1 − A/B si A ≤ B, y B/A − 1 si A > B. 1 = perfecto; 0 = el error suma el doble de lo que se aleja lo real de su media; negativo = peor que eso. El denominador solo depende de los valores reales, así que es comparable entre métodos. Más es mejor." },
    { clave: "mejora", texto: "Mejora sobre la interpolación", formato: porcentajeResultado, mejor: "mayor",
      ayuda: "1 − RMSE del método / RMSE de la interpolación lineal. Positivo = mejor que la interpolación (35 % = un 35 % menos de error); negativo = peor." },
  ] },
  { id: "estructura", titulo: "Estructura", ranking: "razon_var",
    explicacion: "¿La serie rellenada sigue pareciendo una serie de verdad? Razón de varianzas: si lo imputado sube y baja tanto como lo real (1 = sí; 0 = una línea plana). Cambio en la correlación: si la serie se sigue relacionando igual con las explicativas (0 = igual). Importa porque el índice compuesto se calcula con varianzas, correlaciones y pesos: si la imputación aplana una serie, los sesga, aunque acierte de media.",
    metricas: [
    { clave: "razon_var", texto: "Razón de varianzas", formato: decimalesResultado, mejor: "uno",
      ayuda: "Varianza de lo imputado / varianza de lo real, en los puntos quitados. 1 = conserva la variación; por debajo de 1, la aplana (es lo que pasa al rellenar con la media o con rectas); por encima, la exagera. Lo mejor, cerca de 1." },
    { clave: "sesgo_corr", texto: "Cambio en la correlación", formato: decimalesResultado, mejor: "menor",
      ayuda: "Para cada explicativa elegida: corr(serie con lo imputado, explicativa) − corr(serie real, explicativa), sobre la serie entera. Aquí, la media de esos valores en valor absoluto. 0 = la imputación no cambia la relación con las explicativas. Pasa el ratón por un valor para ver el de cada una. Menos es mejor." },
  ] },
];
const METRICAS = BLOQUES_METRICAS.flatMap((b) => b.metricas.map((m) => ({ ...m, bloque: b.id })));
const metricaPorClave = (clave) => METRICAS.find((m) => m.clave === clave);
const bloqueActual = () => BLOQUES_METRICAS.find((b) => b.id === resImp.bloque) || BLOQUES_METRICAS[0];
const COLUMNA_NOMBRE = { clave: "nombre", texto: "Método", ayuda: "El método de imputación. Pulsa una fila para resaltarlo en la gráfica." };
const COLUMNA_CONJUNTO = { clave: "conjunto", texto: "Explicativas", ayuda: "Con qué explicativas se ha calculado: todas, algunas (X1 + X3), solo una o ninguna (—)." };
const COLUMNA_N = { clave: "n", texto: "Puntos medidos", ayuda: "Puntos quitados por ti, con valor real, que el método ha conseguido imputar." };
const textoRanking = (def) => def.texto + (def.mejor === "uno" ? " (distancia a 1)" : "");

// Lo que cuenta para ordenar, resaltar el mejor y el ranking: el valor o, si lo ideal es 1 o el 95 %, la distancia a eso
function puntuacion(def, v) {
  if (v === null || v === undefined) return null;
  if (def.mejor === "uno") return Math.abs(v - 1);
  return v;
}
const menorEsMejor = (def) => def.mejor !== "mayor";

function pintarBloques() {
  const barra = resImp.ui.bloques;
  barra.replaceChildren();
  for (const b of BLOQUES_METRICAS) {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.dataset.bloque = b.id;
    boton.className = b.id === resImp.bloque ? "activa" : "";
    boton.setAttribute("role", "tab");
    boton.setAttribute("aria-selected", b.id === resImp.bloque);
    boton.textContent = b.titulo;
    boton.title = b.explicacion;
    barra.append(boton);
  }
}

// La tabla de métricas del bloque elegido. En la comparación lleva además la casilla de dibujar y las explicativas.
function pintarTablaMetricas(tabla, filas, { comparacion = false, dibujadas = new Set() } = {}) {
  tabla.replaceChildren();
  const metricas = bloqueActual().metricas;
  const columnas = [COLUMNA_NOMBRE, ...(comparacion ? [COLUMNA_CONJUNTO] : []), ...metricas, COLUMNA_N];
  tabla.style.gridTemplateColumns = (comparacion ? "76px minmax(190px, 1.7fr) minmax(110px, 0.9fr) " : "minmax(200px, 1.7fr) ")
    + `repeat(${metricas.length}, minmax(100px, 1fr)) minmax(100px, 0.8fr)`;
  const esReferencia = (f) => (comparacion ? Boolean(f.esReferencia) : f.metodo === REFERENCIA_IMPUTACION);
  const valor = (f, clave) => {
    if (clave === "nombre" || clave === "conjunto") return String(f[clave]).toLowerCase();
    if (f.error || !f.metricas) return null;
    return clave === "n" ? f.metricas.n : puntuacion(metricaPorClave(clave), f.metricas[clave]);
  };
  const { columna, sentido } = resImp.orden;
  let ordenadas = filas;
  if (columna && columnas.some((c) => c.clave === columna)) {
    ordenadas = [...filas].sort((a, b) => {
      const x = valor(a, columna), y = valor(b, columna);
      if (x === null && y === null) return 0;
      if (x === null) return 1;                      // lo que no tiene valor va siempre al final
      if (y === null) return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * sentido;
    });
  }
  // el mejor de cada columna (si hay con qué comparar)
  const mejor = {};
  for (const def of metricas.filter((m) => m.mejor)) {
    const valores = filas.map((f) => valor(f, def.clave)).filter((v) => v !== null);
    if (valores.length > 1 || (valores.length === 1 && filas.length === 1)) mejor[def.clave] = menorEsMejor(def) ? Math.min(...valores) : Math.max(...valores);
  }

  if (comparacion) {
    const cabeceraFija = document.createElement("div");
    cabeceraFija.className = "cab";
    cabeceraFija.title = "Marca las filas que quieras ver en la gráfica de la serie.";
    cabeceraFija.textContent = "Dibujar";
    tabla.append(cabeceraFija);
  }
  for (const { clave, texto, ayuda } of columnas) {
    const cab = document.createElement("div");
    cab.className = "cab";
    cab.setAttribute("role", "columnheader");
    cab.setAttribute("aria-sort", columna === clave ? (sentido === 1 ? "ascending" : "descending") : "none");
    const boton = document.createElement("button");
    boton.type = "button";
    boton.dataset.orden = clave;
    boton.title = ayuda + " Pulsa para ordenar.";
    boton.append(texto);
    if (columna === clave) {
      const flecha = document.createElement("span");
      flecha.className = "flecha";
      flecha.textContent = sentido === 1 ? "↑" : "↓";
      boton.append(flecha);
    }
    cab.append(boton);
    tabla.append(cab);
  }

  const c = colores();
  const nombresComparar = explicativasConDatos().map(nombreDe);
  for (const f of ordenadas) {
    const tenue = esReferencia(f) && (comparacion || resImp.sub !== "sin") ? " tenue" : "";   // la referencia añadida sale atenuada
    const extra = (!comparacion && resImp.destacado === f.metodo ? " resaltada" : "") + tenue;
    const celda = (clase = "") => {
      const d = document.createElement("div");
      d.setAttribute("role", "cell");
      if (comparacion) d.dataset.clave = f.clave; else d.dataset.metodo = f.metodo;
      d.className = (clase + extra).trim();
      return d;
    };
    if (comparacion) {
      const marca = celda("marca");
      const casilla = document.createElement("input");
      casilla.type = "checkbox";
      casilla.dataset.dibujar = f.clave;
      casilla.checked = dibujadas.has(f.clave) && !f.error;
      casilla.disabled = Boolean(f.error);
      casilla.setAttribute("aria-label", `Dibujar ${etiquetaFila(f)}`);
      marca.append(casilla);
      tabla.append(marca);
    }
    const nombre = celda("nombre");
    const punto = document.createElement("span");
    punto.className = "punto-color";
    punto.style.background = f.colorFila || colorDeMetodo(f.metodo, c);
    const texto = document.createElement("span");
    texto.append(f.nombre);
    if (esReferencia(f)) {
      const referencia = document.createElement("small");
      referencia.textContent = "la referencia";
      texto.append(referencia);
    }
    nombre.append(punto, texto);
    tabla.append(nombre);
    if (comparacion) {
      const conjunto = celda("conjunto");
      conjunto.textContent = f.conjunto;
      tabla.append(conjunto);
    }
    if (f.error) {
      const aviso = celda("sin-calculo");
      aviso.textContent = f.error;
      aviso.style.gridColumn = `${comparacion ? 4 : 2} / -1`;
      tabla.append(aviso);
      continue;
    }
    const m = f.metricas;
    for (const def of metricas) {
      const esMejor = mejor[def.clave] !== undefined && valor(f, def.clave) === mejor[def.clave];
      const d = celda("valor" + (esMejor ? " mejor" : ""));
      d.textContent = def.clave === "mejora" && esReferencia(f) ? "—" : def.formato(m[def.clave]);
      d.title = def.ayuda;
      if (def.clave === "sesgo_corr" && (f.sesgo_correlacion || []).length) {
        d.title = f.sesgo_correlacion.map((v, i) => `${nombresComparar[i] ?? `Serie ${i + 1}`}: ${decimalesResultado(v)}`).join(" · ") + "\n\n" + def.ayuda;
      }
      tabla.append(d);
    }
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

const pintarTablaResultados = (filas) => pintarTablaMetricas(resImp.ui.tabla, filas);

function alPulsarTabla(e) {
  const boton = e.target.closest("[data-orden]");
  if (boton) {
    const columna = boton.dataset.orden;
    const def = metricaPorClave(columna);
    const ascendente = columna === "nombre" || columna === "conjunto" || (def && menorEsMejor(def));   // primero, lo mejor
    resImp.orden = resImp.orden.columna === columna ? { columna, sentido: -resImp.orden.sentido } : { columna, sentido: ascendente ? 1 : -1 };
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
  pintarTablaMetricas(resImp.ui.tablaComp, filas, { comparacion: true, dibujadas });
}

// Barras horizontales: todas las filas, de la mejor a la peor según la medida elegida
function pintarRankingComparacion(filas) {
  const grafica = resImp.ui.graficaRanking;
  const def = metricaPorClave(resImp.medida) || metricaPorClave("rmse");
  const clave = def.clave;
  const nombreMedida = textoRanking(def);
  // La interpolación es la referencia de la mejora: su mejora sobre sí misma es 0 %, y así sigue saliendo en el ranking
  const valor = (f) => (f.esReferencia && clave === "mejora" ? 0 : puntuacion(def, f.metricas[clave]));
  const con = filas.filter((f) => !f.error && f.metricas && valor(f) !== null && valor(f) !== undefined)
    .sort((a, b) => (menorEsMejor(def) ? valor(a) - valor(b) : valor(b) - valor(a)));
  if (!con.length) {
    try { Plotly.purge(grafica); } catch { /* aún no había gráfica */ }
    grafica.style.height = "0";
    return;
  }
  grafica.style.height = `${90 + 34 * con.length}px`;
  const c = colores();
  const enPorcentaje = clave === "mejora";
  const factor = enPorcentaje ? 100 : 1;
  const eje = (texto) => ({
    title: texto ? { text: texto, font: { color: c.muted, size: 12 }, standoff: 8 } : undefined,
    gridcolor: c.grid, gridwidth: 1, zeroline: false, linecolor: c.axis, tickfont: { color: c.muted, size: 11 }, ticks: "",
  });
  Plotly.react(grafica, [{
    type: "bar", orientation: "h", y: con.map(etiquetaFila), x: con.map((f) => valor(f) * factor),
    marker: {
      color: con.map((f) => f.colorFila || colorDeMetodo(f.metodo, c)), opacity: con.map((f) => (f.esReferencia ? 0.4 : 1)),
    },
    hovertemplate: `<b>%{x:.3g}${enPorcentaje ? " %" : ""}</b><extra>%{y}</extra>`,
  }], {
    paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)", font: { family: c.fuente, color: c.ink2 },
    margin: { t: 8, r: 16, b: 48, l: 250 }, showlegend: false, hovermode: "closest",
    xaxis: { ...eje(clave === "mejora" ? `${nombreMedida} (%)` : nombreMedida), showline: false },
    yaxis: { ...eje(""), autorange: "reversed", showgrid: false, showline: true },
    hoverlabel: { bgcolor: c.surface, bordercolor: c.axis, font: { color: c.ink, family: c.fuente, size: 13 } },
  }, { responsive: true, displaylogo: false, displayModeBar: false });
}

