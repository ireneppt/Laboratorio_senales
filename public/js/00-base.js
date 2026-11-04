// Constantes, referencias al formulario, validación de campos y activación de secciones.
const form = document.getElementById("controls");

const toggles = ["tendencia_activa", "estacionalidad_activa", "ciclo_activo", "ruido_activo", "anomalias_activas", "huecos_activos"];

const N_COLORES = 8;             // colores de la paleta validada; más series reciben un color generado
const MAX_ESTACIONALIDADES = 20; // mismo tope que app.py
const MAX_ANOMALIAS = 20;        // mismo tope que app.py
const MAX_CICLOS = 20;           // mismo tope que app.py
const MAX_HUECOS = 20;           // mismo tope que app.py

const lista = document.getElementById("estacionalidades");
const plantilla = document.getElementById("plantilla-estac");
const anadir = document.getElementById("anadir");
const listaAnomalias = document.getElementById("anomalias");
const plantillaAnomalia = document.getElementById("plantilla-anomalia");
const anadirAnomalia = document.getElementById("anadir-anomalia");
const listaHuecos = document.getElementById("huecos");
const plantillaHueco = document.getElementById("plantilla-hueco");
const anadirHueco = document.getElementById("anadir-hueco");

// Escribe (o borra) el aviso que va debajo de un campo numérico y lo marca en rojo.
function mostrarError(el, mensaje) {
  const destino = el.closest(".fila") || el; // en las filas con casilla "aleatorio", el aviso va debajo de la fila
  let aviso = destino.nextElementSibling;
  if (!aviso || !aviso.classList.contains("error")) {
    if (!mensaje) return;
    aviso = document.createElement("small");
    aviso.className = "error";
    destino.after(aviso);
  }
  aviso.textContent = mensaje;
  aviso.hidden = !mensaje;
  el.classList.toggle("invalido", Boolean(mensaje));
  if (mensaje) plegar(el.closest("fieldset"), false); // un error no puede quedar escondido en una sección plegada
}

// Revisa los campos numéricos activos: vacíos o fuera de su mínimo/máximo. Devuelve false si hay alguno mal.
// Así un valor imposible se explica en pantalla, en vez de que la gráfica se quede quieta sin avisar.
function validarCampos() {
  let todoBien = true;
  form.querySelectorAll("input[type=number]").forEach((el) => {
    if (el.disabled || el.closest(".trio")) return mostrarError(el, ""); // apagados y contadores: no se envían
    let mensaje = "";
    if ((el.value === "" && !el.hasAttribute("data-opcional")) || el.validity.badInput) {
      mensaje = "Escribe un número";
    } else if (el.validity.rangeUnderflow || el.validity.rangeOverflow) {
      if (el.min !== "" && el.max !== "") mensaje = `Entre ${el.min} y ${el.max}`;
      else mensaje = el.validity.rangeUnderflow ? `Mínimo ${el.min}` : `Máximo ${el.max}`;
    }
    mostrarError(el, mensaje);
    if (mensaje) todoBien = false;
  });
  // El mínimo de la magnitud aleatoria no puede superar al máximo
  const { magnitud_alea_min: minimo, magnitud_alea_max: maximo } = form.elements;
  if (!maximo.disabled && minimo.value !== "" && maximo.value !== "" && Number(minimo.value) > Number(maximo.value)) {
    mostrarError(maximo, "Debe ser mayor o igual que el mínimo");
    todoBien = false;
  }
  // El final de un hueco no puede ir antes de su inicio
  for (const fila of listaHuecos.children) {
    const desde = fila.querySelector(".h-desde");
    const hasta = fila.querySelector(".h-hasta");
    if (hasta.disabled || fila.querySelector(".h-tipo").value !== "rango") continue;
    if (desde.value !== "" && hasta.value !== "" && Number(hasta.value) < Number(desde.value)) {
      mostrarError(hasta, "Debe ser mayor o igual que el inicio");
      todoBien = false;
    }
  }
  return todoBien;
}

// Un fieldset desactivado deshabilita sus campos; el interruptor del legend queda activo.
function syncDisabled() {
  // Con valor final, la tendencia queda activa (se elige su tipo) y su valor no se usa
  const conFinal = form.elements.valor_final.value.trim() !== "";
  if (conFinal) form.elements.tendencia_activa.checked = true;
  form.elements.tendencia_activa.disabled = conFinal;
  document.getElementById("ayuda-final").hidden = !conFinal;
  for (const name of toggles) {
    const box = form.elements[name];
    box.closest("fieldset").querySelectorAll("input[type=number], input.alea, select, button:not(.plegar)").forEach((el) => {
      el.disabled = !box.checked;
    });
  }
  if (conFinal) form.elements.tendencia_valor.disabled = true; // lo marca el valor final
  // Una anomalía con "aleatorio" marcado no deja editar ese campo.
  for (const fila of listaAnomalias.children) {
    for (const campo of ["punto", "magnitud"]) {
      if (fila.querySelector(`.a-${campo}-alea`).checked) fila.querySelector(`.a-${campo}`).disabled = true;
    }
    // El decaimiento solo existe en los transitorios
    const esTransitorio = fila.querySelector(".a-tipo").value === "transitorio";
    fila.querySelector(".a-decaimiento-campo").hidden = !esTransitorio;
    if (!esTransitorio) fila.querySelector(".a-decaimiento").disabled = true;
  }
  // Un hueco de un solo punto no necesita "hasta"
  for (const fila of listaHuecos.children) {
    const esRango = fila.querySelector(".h-tipo").value === "rango";
    fila.querySelector(".h-hasta-campo").hidden = !esRango;
    fila.querySelector(".h-desde-texto").textContent = esRango ? "Desde el punto" : "Punto (eje x)";
    if (!esRango) fila.querySelector(".h-hasta").disabled = true;
  }
  // Los campos "al final" solo existen en la multiplicativa y solo se ve una forma de definir la amplitud
  for (const [filas, campoModo] of [[lista, "estacionalidad_modo"], [listaCiclos, "ciclo_modo"]]) {
    for (const fila of filas.children) {
      // lo que no se ve (la otra forma de definir la amplitud, o los "al final" en aditiva) no se valida
      fila.querySelectorAll(".campo-mm, .campo-am").forEach((etiqueta) => {
        if (etiqueta.hidden) etiqueta.querySelector("input").disabled = true;
      });
    }
  }
  // La fuerza de la dependencia solo existe en el ruido autocorrelado
  const autocorrelado = form.elements.ruido_tipo.value.startsWith("autocorrelado");
  document.getElementById("campo-phi").hidden = !autocorrelado;
  if (!autocorrelado) form.elements.ruido_phi.disabled = true;
  // Los botones de añadir se bloquean al llegar al tope del servidor.
  if (lista.children.length >= MAX_ESTACIONALIDADES) anadir.disabled = true;
  if (listaCiclos.children.length >= MAX_CICLOS) anadirCiclo.disabled = true;
  if (listaHuecos.children.length >= MAX_HUECOS) anadirHueco.disabled = true;
  if (listaAnomalias.children.length >= MAX_ANOMALIAS) {
    anadirAnomalia.disabled = true;
    document.getElementById("anadir-aleatorias").disabled = true;
  }
  actualizarResumenes();
}
