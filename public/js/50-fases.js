// Fases del proyecto y estructura de las pestañas de imputación.
// ---------- Fases del proyecto ----------
// Un proyecto avanza por fases, cada una con su propia pantalla. Para añadir una fase nueva: una entrada
// en FASES y un <section> con el mismo id que su "panel". La fase 1 es el laboratorio de series.
const FASES = [
  { id: "series", titulo: "Series", panel: "fase-series" },
  { id: "imputacion", titulo: "Imputación", panel: "fase-imputacion", alMostrar: () => renderImputacion() },
];
let faseActiva = "series";

function renderFases() {
  const nav = document.getElementById("fases");
  nav.replaceChildren();
  FASES.forEach((fase, i) => {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.dataset.fase = fase.id;
    boton.className = fase.id === faseActiva ? "activa" : "";
    if (fase.id === faseActiva) boton.setAttribute("aria-current", "step");
    const numero = document.createElement("span");
    numero.className = "numero";
    numero.textContent = i + 1;
    boton.append(numero, fase.titulo);
    nav.append(boton);
  });
}

function irAFase(id) {
  faseActiva = id;
  for (const fase of FASES) document.getElementById(fase.panel).hidden = fase.id !== id;
  renderFases();
  FASES.find((f) => f.id === id).alMostrar?.();
  window.dispatchEvent(new Event("resize")); // las gráficas ocultas se redimensionan al volver a verse
}

document.getElementById("fases").addEventListener("click", (e) => {
  const boton = e.target.closest("button[data-fase]");
  if (boton) irAFase(boton.dataset.fase);
});

// ----- Fase 2: Imputación, en cuatro pestañas (se irán rellenando una a una) -----
const PESTANAS_IMPUTACION = [
  {
    id: "explicada", titulo: "Variable explicada",
    descripcion: "La serie que quieres imputar. Elígela y quítale los tramos que quieras imputar, además de los datos que ya le falten.",
    contenido: [],
  },
  {
    id: "explicativas", titulo: "Variables explicativas",
    descripcion: "Las series que se usan como datos de entrada para imputar la variable explicada. Cada una dice si sirve para los huecos.",
    contenido: [],
  },
  {
    id: "correlacion", titulo: "Correlación",
    descripcion: "Cuánto se relaciona cada variable explicativa con la variable explicada.",
    contenido: [],
  },
  {
    id: "resultados", titulo: "Imputación y resultados",
    descripcion: "Imputar los datos faltantes y comprobar cómo de bien ha salido.",
    contenido: [
      "Elegir el método, y comparar varios sobre los mismos huecos.",
      "Gráfica con los puntos imputados resaltados.",
      "Métricas de error (RMSE, MAE) cuando se conoce el valor real.",
      "Tabla con los valores imputados, descargable.",
    ],
  },
];
let pestanaImputacion = PESTANAS_IMPUTACION[0].id;

function irAPestanaImputacion(id) {
  pestanaImputacion = id;
  renderImputacion();
}

function renderImputacion() {
  if (exp.ui.grafica) { try { Plotly.purge(exp.ui.grafica); } catch { /* ya no está en pantalla */ } }
  if (expl.ui.grafica) { try { Plotly.purge(expl.ui.grafica); } catch { /* ya no está en pantalla */ } }
  if (cor.ui.grafica) { try { Plotly.purge(cor.ui.grafica); } catch { /* ya no está en pantalla */ } }
  exp.ui = {};
  expl.ui = {};
  const barra = document.getElementById("pestanas-imputacion");
  barra.replaceChildren();
  PESTANAS_IMPUTACION.forEach((pestana, i) => {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.dataset.pestana = pestana.id;
    boton.className = pestana.id === pestanaImputacion ? "activa" : "";
    boton.setAttribute("role", "tab");
    boton.setAttribute("aria-selected", pestana.id === pestanaImputacion);
    const numero = document.createElement("span");
    numero.className = "numero-tab";
    numero.textContent = i + 1;
    boton.append(numero, pestana.titulo);
    barra.append(boton);
  });

  const i = PESTANAS_IMPUTACION.findIndex((p) => p.id === pestanaImputacion);
  const pestana = PESTANAS_IMPUTACION[i];
  const panel = document.getElementById("panel-imputacion");
  panel.replaceChildren();
  const contenedor = document.createElement("div");
  contenedor.className = "imp-panel";
  const titulo = document.createElement("h2");
  titulo.textContent = pestana.titulo;
  const descripcion = document.createElement("p");
  descripcion.textContent = pestana.descripcion;
  const lista = document.createElement("ul");
  for (const punto of pestana.contenido) {
    const li = document.createElement("li");
    li.textContent = punto;
    lista.append(li);
  }
  const marcador = document.createElement("div");
  marcador.className = "en-construccion";
  marcador.textContent = "Esta pestaña se montará en el siguiente paso.";
  const nav = document.createElement("div");
  nav.className = "imp-nav";
  const anterior = document.createElement("button");
  anterior.type = "button";
  anterior.textContent = "← Anterior";
  anterior.disabled = i === 0;
  anterior.dataset.ir = i > 0 ? PESTANAS_IMPUTACION[i - 1].id : "";
  const siguiente = document.createElement("button");
  siguiente.type = "button";
  siguiente.textContent = "Siguiente →";
  siguiente.disabled = i === PESTANAS_IMPUTACION.length - 1;
  siguiente.dataset.ir = i < PESTANAS_IMPUTACION.length - 1 ? PESTANAS_IMPUTACION[i + 1].id : "";
  nav.append(anterior, siguiente);
  if (pestana.id === "explicada") {
    contenedor.append(titulo, descripcion, montarExplicada(), nav);
    panel.append(contenedor);
    actualizarExplicada();
  } else if (pestana.id === "correlacion") {
    contenedor.append(titulo, descripcion, montarCorrelacion(), nav);
    panel.append(contenedor);
    actualizarCorrelacion();
  } else if (pestana.id === "explicativas") {
    contenedor.append(titulo, descripcion, montarExplicativas(), nav);
    panel.append(contenedor);
    actualizarExplicativas();
  } else {
    contenedor.append(titulo, descripcion, lista, marcador, nav);
    panel.append(contenedor);
  }
}

document.getElementById("fase-imputacion").addEventListener("click", (e) => {
  const boton = e.target.closest("button[data-pestana], button[data-ir]");
  if (!boton || boton.disabled) return;
  irAPestanaImputacion(boton.dataset.pestana || boton.dataset.ir);
});
