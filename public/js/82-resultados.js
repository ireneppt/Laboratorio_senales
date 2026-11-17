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
  { id: "interpolacion", titulo: "Interpolación", metodos: ["interpolacion", "polinomica"] },
  { id: "modelos", titulo: "Modelos", metodos: ["regresion", "em", "imputacion_multiple"] },
];

// id (el mismo que usa la API), nombre, grupo, si necesita explicativas, y qué hace (texto al pasar el ratón)
const METODOS_IMPUTACION = [
  { id: "media", nombre: "Media", grupo: "explicito", explicativas: false, ayuda: "Rellena con la media de los datos conocidos." },
  { id: "mediana", nombre: "Mediana", grupo: "explicito", explicativas: false, ayuda: "Rellena con la mediana de los datos conocidos." },
  { id: "regresion", nombre: "Regresión", grupo: "explicito", explicativas: true,
    ayuda: "Ajusta una recta de la explicada sobre las explicativas con los datos conocidos y predice los huecos." },
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
    ayuda: "Une los datos conocidos con curvas: un polinomio de grado 3 entre cada dos datos, empalmados de forma suave. En huecos largos puede pasarse de largo." },
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

// Multivariante sin ninguna combinación: su pestaña sigue ahí (con «+ combinación» y «Mejor combinación (regresión)»)
const MULTI_VACIA = "multi:0";
const esMultivariante = (s) => Boolean(s.combinacion || s.vacia);

function quitarCombinacion(combinacion) {
  if (!combinacion) return;
  const eraLaActiva = resImp.sub === `multi:${combinacion.id}`;
  const posicion = imputacion.combinaciones.indexOf(combinacion);
  imputacion.combinaciones = imputacion.combinaciones.filter((c) => c !== combinacion);
  delete imputacion.metodos[`multi:${combinacion.id}`];
  if (resImp.dibujar) resImp.dibujar = new Set([...resImp.dibujar].filter((clave) => !clave.endsWith(`@multi:${combinacion.id}`)));
  // si era la que se veía, pasa a la anterior (o a Multivariante vacía); si no, se queda donde estaba
  const anterior = imputacion.combinaciones[Math.max(0, posicion - 1)];
  irAVentana(eraLaActiva ? (anterior ? `multi:${anterior.id}` : MULTI_VACIA) : resImp.sub);
}

const multivarianteVacia = () => imputacion.combinaciones.length === 0;

// Quita todas las combinaciones y sus métodos marcados (lo de las otras ventanas no se toca)
function empezarMultivarianteDeCero() {
  if (multivarianteVacia()) return;
  if (!confirm("¿Quitar todas las combinaciones de Multivariante (y sus métodos marcados) y empezar de cero?")) return;
  imputacion.combinaciones = [];
  for (const k of Object.keys(imputacion.metodos)) if (k.startsWith("multi:")) delete imputacion.metodos[k];
  if (resImp.dibujar) resImp.dibujar = new Set([...resImp.dibujar].filter((clave) => !clave.includes("@multi:")));
  resImp.sugerencia = null;
  irAVentana(MULTI_VACIA);
}

function botonEmpezarDeCero() {
  const boton = document.createElement("button");
  boton.type = "button";
  boton.dataset.accion = "reiniciar";
  boton.className = "res-reiniciar";
  boton.title = "Quitar todas las combinaciones y los métodos marcados en Multivariante";
  boton.textContent = "Empezar de cero";
  boton.disabled = multivarianteVacia();
  return boton;
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
const cuerpoSugerencia = () => {
  const obj = objetivoDeExplicada();
  return obj ? JSON.stringify({ y: obj.y, quitados: tramosQuitados(), explicativas: explicativasConDatos().map((x) => x.datos.y) }) : null;
};

async function sugerirCombinacion() {
  const cuerpo = cuerpoSugerencia();
  const panel = resImp.ui.sugerencia;
  if (!cuerpo || explicativasConDatos().length < 2) return;
  const ids = explicativasConDatos().map((x) => x.id);
  panel.hidden = false;
  panel.textContent = "Buscando la mejor combinación…";
  try {
    const respuesta = await fetch("/api/sugerir-explicativas", { method: "POST", headers: { "Content-Type": "application/json" }, body: cuerpo });
    const datos = await respuesta.json();
    if (!respuesta.ok) { panel.textContent = typeof datos.detail === "string" ? datos.detail : "No se ha podido sugerir una combinación con estos datos."; return; }
    const mejor = datos.mejor.map((i) => ids[i]);
    const existente = imputacion.combinaciones.find((c) => claveSubconjunto(idsDeCombinacion(c)) === claveSubconjunto(mejor));
    resImp.sugerencia = { huella: huellaTexto(cuerpo), ids, datos, existia: Boolean(existente) };
    if (existente) { irAVentana(`multi:${existente.id}`); return; }
    const id = Math.max(0, ...imputacion.combinaciones.map((c) => c.id)) + 1;
    imputacion.combinaciones.push({ id, explicativas: mejor.length >= ids.length ? null : mejor });
    irAVentana(`multi:${id}`);
  } catch (e) {
    panel.textContent = "No se ha podido conectar con el servidor para sugerir una combinación.";
  }
}

// la tabla con las mejores combinaciones probadas (solo si sigue siendo para los datos que hay ahora)
function pintarSugerencia() {
  const panel = resImp.ui.sugerencia;
  const s = resImp.sugerencia;
  const cuerpo = cuerpoSugerencia();
  if (!s || !cuerpo || s.huella !== huellaTexto(cuerpo)) { if (s) resImp.sugerencia = null; panel.hidden = true; panel.replaceChildren(); return; }
  const cifra = (v, d = 2) => (v === null || v === undefined ? "—" : v.toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d }));
  const nombre = (i) => { const x = explicativasConDatos().find((e) => e.id === s.ids[i]); return x ? nombreDe(x) : "?"; };
  const d = s.datos;
  const mejorNombre = d.candidatos[0].indices.map(nombre).join(" + ");
  const titular = document.createElement("p");
  titular.className = "res-sugerencia-titular";
  titular.textContent = `Mejor combinación para la regresión: ${mejorNombre} (${s.existia ? "ya la tenías, te he llevado a ella" : "la he añadido como pestaña"}). Se han probado ${d.probados}.`;
  const tabla = document.createElement("table");
  tabla.className = "res-sugerencia-tabla";
  const cabecera = tabla.createTHead().insertRow();
  const columnas = [["#", "Posición según el RMSE"], ["Combinación", "Las explicativas que usa la regresión"],
    ["RMSE", "Error típico al predecir los bloques escondidos, en las unidades de la serie. Menos es mejor."],
    ["MAE", "Error medio absoluto de esos bloques. Menos es mejor."],
    ["R² ajustado", "Qué parte de la variación de la serie explica el modelo con todos sus datos, penalizando usar variables de más. Más es mejor."]];
  for (const [t, ayuda] of columnas) { const th = document.createElement("th"); th.scope = "col"; th.textContent = t; th.title = ayuda; cabecera.append(th); }
  const cuerpoTabla = tabla.createTBody();
  d.candidatos.slice(0, 5).forEach((c, posicion) => {
    const fila = cuerpoTabla.insertRow();
    fila.insertCell().textContent = String(posicion + 1);
    const celda = fila.insertCell();
    celda.textContent = c.indices.map(nombre).join(" + ");
    if (posicion === 0) { const marca = document.createElement("span"); marca.className = "res-sugerencia-mejor"; marca.textContent = "mejor"; celda.append(" ", marca); }
    for (const v of [cifra(c.rmse), cifra(c.mae), cifra(c.r2_ajustado, 3)]) fila.insertCell().textContent = v;
  });
  const pie = document.createElement("p");
  pie.className = "res-sugerencia-pie";
  pie.textContent = `${d.candidatos.length > 5 ? `Se muestran las 5 mejores de ${d.candidatos.length}. ` : ""}Solo vale para la regresión: con EM o imputación múltiple el orden puede ser otro. Las demás combinaciones las puedes añadir con «+ combinación».`;
  const detalle = document.createElement("details");
  const resumen = document.createElement("summary");
  resumen.textContent = "Cómo se ha calculado";
  const texto = document.createElement("p");
  texto.textContent = `${d.metodo === "exhaustivo" ? "Se han probado todas las combinaciones posibles de 2 o más explicativas." : "Como hay muchas explicativas, se ha ido añadiendo la que más baja el error (paso a paso); no garantiza la mejor de todas."} Para cada una se han escondido ${d.bloques} bloques seguidos de los ${d.conocidos} datos conocidos y se han predicho con la regresión, ajustada con el resto. Se ordenan por el RMSE de esos bloques.`;
  detalle.append(resumen, texto);
  panel.replaceChildren(titular, tabla, pie, detalle);
  panel.hidden = false;
}

function botonSugerirCombinacion() {
  const boton = document.createElement("button");
  boton.type = "button";
  boton.dataset.accion = "sugerir";
  boton.className = "res-anadir";
  boton.title = "Prueba combinaciones de explicativas con la regresión, las ordena por su error de validación y crea una pestaña con la mejor";
  boton.textContent = "Mejor combinación (regresión)";
  return boton;
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
// Parámetros de cada método: dónde se guardan en el proyecto (clave), cómo se llaman en la API, su texto y sus límites.
// Los enteros se escriben en una casilla de número; "casilla" es un sí/no. El periodo de la media estacional no se
// elige aquí: es el de la serie (el de «Descomponer serie» en la fase 1, o el de su estacionalidad si es generada).
const PARAMETROS_DE_METODO = {
  media_movil: [{ clave: "k_movil", api: "k", texto: "Datos a cada lado (k)", min: 1, max: maximoKMovil }],
  media_movil_atras: [{ clave: "k_movil_atras", api: "k", texto: "Datos anteriores (k)", min: 1, max: maximoKMovil }],
  media_movil_pond: [{ clave: "k_movil_pond", api: "k", texto: "Datos a cada lado (k)", min: 1, max: maximoKMovil }],
  media_movil_pond_atras: [{ clave: "k_movil_pond_atras", api: "k", texto: "Datos anteriores (k)", min: 1, max: maximoKMovil }],
  media_estacional: [{ clave: "quitar_tendencia", api: "quitar_tendencia", texto: "Quitar la tendencia antes", tipo: "casilla" }],
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

// ----- Ayuda («?»): todas las explicaciones juntas, sacadas de las mismas constantes que los tooltips -----
function abrirAyudaImputacion() {
  const d = resImp.ui.ayudaDialogo;
  const el = (etiqueta, texto, clase) => { const e = document.createElement(etiqueta); if (texto !== undefined) e.textContent = texto; if (clase) e.className = clase; return e; };
  const entrada = (nombre, texto) => { const caja = el("div", undefined, "res-ayuda-entrada"); caja.append(el("strong", nombre), el("p", texto)); return caja; };
  const cabecera = el("div", undefined, "dialogo-cab");
  const titulo = el("h2", "Ayuda: imputación y resultados");
  titulo.id = "res-ayuda-titulo";
  const cerrar = el("button", "Cerrar");
  cerrar.type = "button";
  cerrar.addEventListener("click", () => d.close());
  cabecera.append(titulo, cerrar);

  const cuerpo = el("div", undefined, "res-ayuda-cuerpo");
  cuerpo.append(el("h3", "Cómo se lee"));
  cuerpo.append(el("p", "Se quitan tramos de la serie (pestaña 1), cada método los rellena y se compara lo imputado con el valor real que había. En las tablas, la mejor cifra de cada columna va en negrita: en unas es la menor (errores) y en otras la mayor (R², mejora) o la más cercana a 1 (razón de varianzas). Cada métrica lo indica en su explicación."));
  cuerpo.append(el("h3", "Métricas"));
  for (const b of BLOQUES_METRICAS) {
    cuerpo.append(el("h4", b.titulo), el("p", b.explicacion, "res-ayuda-nota"));
    for (const m of b.metricas) cuerpo.append(entrada(m.texto, m.ayuda));
  }
  cuerpo.append(el("h3", "Métodos"));
  for (const familia of FAMILIAS_IMPUTACION) {
    cuerpo.append(el("h4", familia.titulo));
    for (const id of familia.metodos) { const m = metodoDeImputacion(id); if (m) cuerpo.append(entrada(m.nombre, m.ayuda)); }
  }
  cuerpo.append(el("h3", "Mejor combinación (regresión)"));
  cuerpo.append(entrada("Qué hace", "Prueba combinaciones de explicativas con el método Regresión, las ordena por su error de validación y crea una pestaña en Multivariante con la mejor. Con 8 explicativas o menos prueba todas las combinaciones; con más, va añadiendo la que más baja el error (paso a paso), que no garantiza la mejor de todas."));
  cuerpo.append(entrada("Cómo valida", "Esconde bloques seguidos de los datos conocidos, los predice con un modelo ajustado con el resto y mide el error (RMSE y MAE). El R² ajustado se calcula sobre los mismos datos con los que se ajusta, por eso puede no coincidir con el orden."));
  cuerpo.append(entrada("Ojo", "El orden es solo para la regresión: con EM o imputación múltiple puede ser otro."));
  d.replaceChildren(cabecera, cuerpo);
  d.showModal();
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
      <div class="res-cabecera">
        <button type="button" class="res-ayuda-abrir" id="res-ayuda-abrir" title="Qué significa cada método y cada métrica" aria-label="Ayuda: qué significa cada método y cada métrica" aria-haspopup="dialog">?</button>
      </div>
      <dialog id="res-ayuda-dialogo" class="res-ayuda-dialogo" aria-labelledby="res-ayuda-titulo"></dialog>
      <div class="exp-aviso" id="res-falta" hidden>
        <span id="res-falta-texto"></span>
        <button type="button" id="res-falta-ir"></button>
      </div>
      <div id="res-trabajo" hidden>
        <div class="pestanas res-subpestanas" id="res-subpestanas" role="tablist" aria-label="Con qué explicativas se imputa"></div>
        <div class="pestanas res-combinaciones" id="res-combinaciones" role="tablist" aria-label="Combinaciones de explicativas" hidden></div>
        <p class="res-aviso" id="res-aviso-combinacion" role="alert" hidden>Ya has hecho esta combinación.</p>
        <div class="res-sugerencia" id="res-sugerencia" hidden></div>
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
      </div>
    </section>`;
  const q = (sel) => raiz.querySelector(sel);
  resImp.ui = {
    raiz, metodos: q("#res-metodos"), ayudaLateral: q("#res-ayuda-lateral"), falta: q("#res-falta"), faltaTexto: q("#res-falta-texto"), faltaIr: q("#res-falta-ir"),
    trabajo: q("#res-trabajo"), subpestanas: q("#res-subpestanas"), combinaciones: q("#res-combinaciones"), avisoCombinacion: q("#res-aviso-combinacion"), sugerencia: q("#res-sugerencia"), ayudaDialogo: q("#res-ayuda-dialogo"), info: q("#res-info"), bloques: q("#res-bloques"), estado: q("#res-estado"),
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
  resImp.ui.metodos.addEventListener("click", (e) => {            // "Nueva semilla": otra tirada del azar
    const boton = e.target.closest('button[data-accion="nueva-semilla"]');
    if (!boton) return;
    imputacion.parametros[boton.dataset.param] = Math.floor(Math.random() * 1000001);
    cambioImputacion();
    pintarMetodosImputacion();
    ejecutarImputacion();
  });
  resImp.ui.tabla.addEventListener("click", alPulsarTabla);
  q("#res-ayuda-abrir").addEventListener("click", abrirAyudaImputacion);
  resImp.ui.subpestanas.addEventListener("click", alPulsarVentana);
  resImp.ui.combinaciones.addEventListener("click", alPulsarVentana);
  return raiz;
}

// las ventanas se eligen en la barra de arriba y, dentro de "Multivariante", en la de las combinaciones
function alPulsarVentana(e) {
  if (e.target.closest('button[data-accion="anadir"]')) { anadirCombinacion(); return; }
  if (e.target.closest('button[data-accion="sugerir"]')) { sugerirCombinacion(); return; }
  if (e.target.closest('button[data-accion="reiniciar"]')) { empezarMultivarianteDeCero(); return; }
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
  resImp.ui.avisoCombinacion.hidden = true;
  if (!esMultivariante(actual)) { resImp.ui.sugerencia.hidden = true; return; }
  pintarSugerencia();
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
  if (subconjuntoLibre()) fila.append(botonAnadirCombinacion());
  fila.append(botonSugerirCombinacion());
  fila.append(botonEmpezarDeCero());
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
  if (sub.vacia) { resImp.ui.ayudaLateral.textContent = ""; return; }
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
    nota.textContent = "Elige variables explicativas en la pestaña 2 para probar también la regresión, el EM y la imputación múltiple.";
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
  estado.classList.toggle("cargando", resImp.cargando);
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
      u.estado.textContent = esComp ? "Todavía no has marcado ningún método en las otras ventanas." : sub.vacia ? "No hay ninguna combinación: crea una con «+ combinación» o «Mejor combinación (regresión)»." : sub.id === "sin" ? "Marca algún método a la izquierda para ver cómo imputa y cuánto se equivoca."
        : "Marca la regresión, el EM o la imputación múltiple a la izquierda para ver cómo imputan con estas explicativas.";
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
