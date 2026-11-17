// El «?» de la barra de arriba abre siempre la misma ayuda: pestañas «Series | Imputación», un índice con las
// secciones de la pestaña y el contenido. Se abre en la pestaña de la fase en la que estás.
//
// Cada pestaña es una lista de secciones { id, grupo, titulo, intro?, entradas: [[término, explicación], …] }.
// Las de Series se escriben aquí; las de Imputación salen de las mismas constantes que sus tooltips
// (seccionesAyudaImputacion, en 82-resultados.js), así no se desincronizan.

const AYUDA_SERIES = [
  { id: "s-trabajo", grupo: "Primeros pasos", titulo: "Cómo se trabaja",
    intro: "Cada serie vive en su propia pestaña, con su configuración y su color.",
    entradas: [
      ["Generada", "Se construye con los parámetros del panel: nivel, tendencia, estacionalidad, ciclos, ruido, anomalías y datos faltantes."],
      ["Importada", "Se lee de un archivo (CSV, TXT o Excel)."],
      ["Escrita o pegada", "Los valores se escriben o se pegan directamente."],
      ["Dibujada", "Se dibuja con el cursor sobre la gráfica."],
    ] },
  { id: "s-base", grupo: "Generar una serie", titulo: "Serie base",
    entradas: [
      ["Número de puntos", "Longitud de la serie (el eje x)."],
      ["Valor inicial", "El nivel de partida, también llamado nivel base."],
      ["Valor final (opcional)", "Si lo pones, la serie va del valor inicial al final con la forma del tipo de tendencia elegido. Mientras haya valor final, la tendencia queda activa y su valor no se usa."],
    ] },
  { id: "s-tendencia", grupo: "Generar una serie", titulo: "Tendencia",
    intro: "El camino de fondo de la serie. Todos los tipos terminan en el mismo punto: solo cambia cómo se curva el camino.",
    entradas: [
      ["Valor", "La proporción que cambia el nivel. Con 0,5 la serie termina un 50 % por encima del valor inicial. No se usa si hay valor final."],
      ["Lineal", "Una recta."],
      ["Cuadrática", "Arranca despacio y va acelerando."],
      ["Amortiguada", "Sube deprisa al principio y se va frenando."],
      ["Logarítmica", "También sube deprisa al principio y se frena, con otra curvatura."],
      ["Exponencial", "Arranca muy despacio y se dispara hacia el final."],
    ] },
  { id: "s-estacionalidad", grupo: "Generar una serie", titulo: "Estacionalidad",
    intro: "Ondas que se repiten con un periodo fijo, medido en puntos. Puedes añadir varias.",
    entradas: [
      ["Aditiva", "La onda tiene siempre la misma amplitud."],
      ["Multiplicativa", "La amplitud puede cambiar a lo largo de la serie, de la del primer punto a la del último (los campos «al final»)."],
      ["Definir la amplitud", "Con un mínimo y un máximo, o con la amplitud total, centrada en el nivel."],
    ] },
  { id: "s-ciclo", grupo: "Generar una serie", titulo: "Ciclo",
    intro: "Como la estacionalidad, pero irregular: la duración de cada vuelta y su altura cambian poco a poco, así que nunca se repite exactamente igual.",
    entradas: [
      ["Periodo medio", "La duración media de una vuelta, en puntos."],
      ["Variaciones", "Cuánto cambian, en %, la duración de cada vuelta y su altura. Con 0 sería una onda fija."],
    ] },
  { id: "s-ruido", grupo: "Generar una serie", titulo: "Ruido",
    intro: "La parte aleatoria que se suma a la serie. El grado es un % del valor de la serie en cada punto: con 3 %, un punto que vale 100 se mueve unos 3 y uno que vale 150, unos 4,5.",
    entradas: [
      ["Blanco", "Cada punto es independiente y con la misma variabilidad."],
      ["Heterocedástico", "La variabilidad crece con el tiempo."],
      ["Autocorrelado positivo", "Cada valor se parece al anterior: rachas suaves."],
      ["Autocorrelado negativo", "Los valores alternan de signo: zigzag."],
      ["GARCH", "Rachas de calma y rachas de volatilidad."],
      ["Colas pesadas", "Casi todo es pequeño, pero de vez en cuando salen valores extremos."],
      ["Fuerza de la dependencia", "Solo cuenta en los autocorrelados: cuanto mayor, más se parece cada valor al anterior."],
      ["Semilla", "Con la misma semilla sale siempre el mismo ruido. «Regenerar ruido» cambia la semilla."],
    ] },
  { id: "s-anomalias", grupo: "Generar una serie", titulo: "Anomalías",
    intro: "Golpes que se añaden a la serie. La magnitud es un % del valor de la serie.",
    entradas: [
      ["Puntual", "Afecta a un solo punto."],
      ["Cambio de nivel", "Desde ese punto en adelante, la serie queda desplazada para siempre."],
      ["Transitorio", "Un golpe que se va apagando poco a poco. El decaimiento es la fracción del golpe que se conserva en cada punto siguiente (de 0 a 0,95)."],
      ["Aleatorias", "El punto y la magnitud pueden ser aleatorios, con su semilla. «Añadir aleatorias» crea varias de golpe."],
    ] },
  { id: "s-huecos", grupo: "Generar una serie", titulo: "Datos faltantes",
    intro: "Tramos de la serie que se dejan sin dato. Sirven para probar después la imputación.",
    entradas: [
      ["Punto suelto", "Un único punto sin dato."],
      ["Rango", "Una tira de puntos seguidos sin dato."],
      ["Mostrar los valores ocultos", "Los dibuja en la gráfica con una línea de puntos."],
    ] },
  { id: "s-importar", grupo: "Series que no se generan", titulo: "Importar, escribir y dibujar",
    entradas: [
      ["Importar un archivo", "Un CSV, un TXT o un Excel (.xlsx). Se usa la primera hoja, y la primera fila puede ser de títulos."],
      ["Escribir o pegar datos", "Escribe o pega los valores directamente."],
      ["Dibujar con el cursor", "Con el dibujo activado, mantén pulsado y arrastra sobre la gráfica: cada punto toma la altura del cursor. Vuelve a pasar por un tramo para corregirlo."],
    ] },
  { id: "s-descomponer", grupo: "Analizar una serie", titulo: "Descomponer serie",
    intro: "Separa la serie en tendencia, estacionalidad y resto, estima su periodo si no lo fijas tú y marca posibles anomalías. El «?» junto al botón explica, paso a paso, cómo se ha calculado cada cifra de la serie que estás viendo.",
    entradas: [
      ["Fuerza", "Va de 0 a 1 y dice cuánto pesa la tendencia o la estacionalidad frente al resto: débil por debajo de 0,3, moderada hasta 0,6 y fuerte por encima."],
      ["Pendiente de Sen", "La mediana de las pendientes entre todos los pares de puntos. Aguanta bien los valores extremos."],
      ["Posibles anomalías", "Puntos cuyo resto se aleja mucho de lo normal, medido con la desviación robusta (MAD)."],
    ] },
];

const PESTANAS_AYUDA = [
  { fase: "series", titulo: "Series", secciones: () => AYUDA_SERIES },
  { fase: "imputacion", titulo: "Imputación", secciones: () => seccionesAyudaImputacion() },
];

const elementoAyuda = (etiqueta, texto, clase) => {
  const e = document.createElement(etiqueta);
  if (texto !== undefined) e.textContent = texto;
  if (clase) e.className = clase;
  return e;
};

const ayuda = { dialogo: null, fase: "series", observador: null };

// Crea la ventana la primera vez: cabecera, pestañas y, debajo, el índice y el contenido
function crearDialogoAyuda() {
  const d = elementoAyuda("dialog", undefined, "ayuda-dialogo");
  d.id = "ayuda-dialogo";
  d.setAttribute("aria-labelledby", "ayuda-titulo");
  const cabecera = elementoAyuda("div", undefined, "ayuda-cabecera");
  const titulo = elementoAyuda("h2", "Ayuda");
  titulo.id = "ayuda-titulo";
  const cerrar = elementoAyuda("button", "Cerrar");
  cerrar.type = "button";
  cerrar.addEventListener("click", () => d.close());
  cabecera.append(titulo, cerrar);
  const pestanas = elementoAyuda("div", undefined, "pestanas ayuda-pestanas");
  pestanas.setAttribute("role", "tablist");
  pestanas.setAttribute("aria-label", "Ayuda de cada fase");
  pestanas.addEventListener("click", (e) => {
    const boton = e.target.closest("button[data-fase]");
    if (boton) pintarAyuda(boton.dataset.fase);
  });
  pestanas.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = PESTANAS_AYUDA.findIndex((p) => p.fase === ayuda.fase);
    const siguiente = PESTANAS_AYUDA[(i + (e.key === "ArrowRight" ? 1 : PESTANAS_AYUDA.length - 1)) % PESTANAS_AYUDA.length];
    pintarAyuda(siguiente.fase);
    d.querySelector(`button[data-fase="${siguiente.fase}"]`)?.focus();
  });
  const cuerpo = elementoAyuda("div", undefined, "ayuda-cuerpo");
  cuerpo.append(elementoAyuda("nav", undefined, "ayuda-indice"), elementoAyuda("div", undefined, "ayuda-contenido"));
  d.append(cabecera, pestanas, cuerpo);
  document.body.append(d);
  return d;
}

// Pinta la pestaña de una fase: sus botones, el índice (agrupado) y las secciones
function pintarAyuda(fase) {
  const d = ayuda.dialogo;
  ayuda.fase = fase;
  const pestana = PESTANAS_AYUDA.find((p) => p.fase === fase) || PESTANAS_AYUDA[0];
  const secciones = pestana.secciones();

  const pestanas = d.querySelector(".ayuda-pestanas");
  pestanas.replaceChildren(...PESTANAS_AYUDA.map((p) => {
    const boton = elementoAyuda("button", p.titulo, p.fase === pestana.fase ? "activa" : "");
    boton.type = "button";
    boton.dataset.fase = p.fase;
    boton.setAttribute("role", "tab");
    boton.setAttribute("aria-selected", String(p.fase === pestana.fase));
    boton.tabIndex = p.fase === pestana.fase ? 0 : -1;
    return boton;
  }));

  const indice = d.querySelector(".ayuda-indice");
  indice.setAttribute("aria-label", `Índice de la ayuda de ${pestana.titulo}`);
  indice.replaceChildren(elementoAyuda("h3", "En esta pestaña", "ayuda-indice-titulo"));
  let grupoActual = null;
  for (const s of secciones) {
    if (s.grupo !== grupoActual) { grupoActual = s.grupo; indice.append(elementoAyuda("p", s.grupo, "ayuda-indice-grupo")); }
    const enlace = elementoAyuda("button", s.titulo, "ayuda-indice-item");
    enlace.type = "button";
    enlace.dataset.seccion = s.id;
    indice.append(enlace);
  }
  indice.onclick = (e) => {
    const enlace = e.target.closest("button[data-seccion]");
    if (!enlace) return;
    document.getElementById(enlace.dataset.seccion)?.scrollIntoView({ behavior: "smooth", block: "start" });
    marcarSeccionActiva(enlace.dataset.seccion);
  };

  const contenido = d.querySelector(".ayuda-contenido");
  contenido.replaceChildren(...secciones.map((s) => {
    const seccion = elementoAyuda("section", undefined, "ayuda-seccion");
    seccion.id = s.id;
    seccion.append(elementoAyuda("p", s.grupo, "ayuda-grupo"), elementoAyuda("h3", s.titulo));
    if (s.intro) seccion.append(elementoAyuda("p", s.intro, "ayuda-intro"));
    if (s.entradas && s.entradas.length) {
      const lista = elementoAyuda("dl", undefined, "ayuda-lista");
      for (const [termino, explicacion] of s.entradas) {
        const fila = elementoAyuda("div");
        fila.append(elementoAyuda("dt", termino), elementoAyuda("dd", explicacion));
        lista.append(fila);
      }
      seccion.append(lista);
    }
    return seccion;
  }));
  contenido.scrollTop = 0;
  observarSecciones(contenido);
  marcarSeccionActiva(secciones[0] && secciones[0].id);
}

// Resalta en el índice la sección que se está leyendo
function marcarSeccionActiva(id) {
  for (const item of ayuda.dialogo.querySelectorAll(".ayuda-indice-item")) {
    const activa = item.dataset.seccion === id;
    item.classList.toggle("activa", activa);
    if (activa) item.setAttribute("aria-current", "true"); else item.removeAttribute("aria-current");
  }
}
function observarSecciones(contenido) {
  if (ayuda.observador) ayuda.observador.disconnect();
  if (typeof IntersectionObserver === "undefined") return;
  ayuda.observador = new IntersectionObserver((entradas) => {
    const visible = entradas.find((e) => e.isIntersecting);
    if (visible) marcarSeccionActiva(visible.target.id);
  }, { root: contenido, rootMargin: "0px 0px -75% 0px" });
  for (const seccion of contenido.querySelectorAll(".ayuda-seccion")) ayuda.observador.observe(seccion);
}

// Abre la ayuda en la pestaña de la fase en la que estás
function abrirAyuda() {
  if (!ayuda.dialogo) ayuda.dialogo = crearDialogoAyuda();
  pintarAyuda(PESTANAS_AYUDA.some((p) => p.fase === faseActiva) ? faseActiva : "series");
  if (!ayuda.dialogo.open) ayuda.dialogo.showModal();
}

document.getElementById("p-ayuda")?.addEventListener("click", abrirAyuda);
