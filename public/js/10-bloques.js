// Bloques del formulario: secciones plegables, anomalías, datos faltantes, estacionalidades y ciclos.
// ---------- Secciones plegables ----------
const secciones = [...form.querySelectorAll("fieldset")];

function textoOpcion(select) { return select.selectedOptions[0] ? select.selectedOptions[0].text : ""; }
function cuantos(n, uno, varios) { return n === 1 ? `1 ${uno}` : `${n} ${varios}`; }
function periodos(contenedor, campo) {
  return [...contenedor.children].map((fila) => fila.querySelector(`[name=${campo}]`).value).join(", ");
}

// Una línea por sección, para ver qué hay configurado sin abrirla
function resumenSeccion(i) {
  const f = form.elements;
  if (i > 0 && !f[toggles[i - 1]].checked) return "Desactivada";
  switch (i) {
    case 0: if (esManual(activa)) return resumenManual(activa).replace(/  ·  /g, " · ");
      return `${f.puntos.value} puntos · base ${f.nivel_base.value}` + (f.valor_final.value.trim() !== "" ? ` → ${f.valor_final.value}` : "");
    case 1: return textoOpcion(f.tendencia_tipo) + (f.valor_final.value.trim() !== "" ? ` · hacia ${f.valor_final.value}` : ` · ${f.tendencia_valor.value}`);
    case 2: return lista.children.length ? `${cuantos(lista.children.length, "onda", "ondas")} · periodo ${periodos(lista, "estacionalidad_periodo")}` : "Sin ondas";
    case 3: return listaCiclos.children.length ? `${cuantos(listaCiclos.children.length, "ciclo", "ciclos")} · periodo ${periodos(listaCiclos, "ciclo_periodo")}` : "Sin ciclos";
    case 4: return `${textoOpcion(f.ruido_tipo)} · ${f.ruido_grado.value} %`;
    case 5: return listaAnomalias.children.length ? cuantos(listaAnomalias.children.length, "anomalía", "anomalías") : "Sin anomalías";
    case 6: return listaHuecos.children.length ? cuantos(listaHuecos.children.length, "hueco", "huecos") : "Sin huecos";
  }
  return "";
}

function plegar(seccion, cerrada) {
  seccion.classList.toggle("cerrado", cerrada);
  const boton = seccion.querySelector("button.plegar");
  if (boton) boton.setAttribute("aria-expanded", String(!cerrada));
}

function actualizarResumenes() {
  secciones.forEach((seccion, i) => {
    const cab = seccion.querySelector("legend");
    let resumen = cab.querySelector(".resumen-seccion");
    if (!resumen) {
      resumen = document.createElement("span");
      resumen.className = "resumen-seccion";
      const boton = document.createElement("button");
      boton.type = "button";
      boton.className = "plegar";
      boton.title = "Plegar o desplegar la sección";
      boton.setAttribute("aria-expanded", String(!seccion.classList.contains("cerrado")));
      cab.append(resumen, boton);
    }
    resumen.textContent = resumenSeccion(i);
  });
}

// Pulsar la cabecera pliega o despliega; el interruptor sigue encendiendo y apagando la sección
form.addEventListener("click", (e) => {
  const cab = e.target.closest("legend");
  if (!cab || e.target.closest("label.toggle")) return;
  const seccion = cab.parentElement;
  plegar(seccion, !seccion.classList.contains("cerrado"));
});
// Al apagar una sección se pliega y al encenderla se despliega (después se puede plegar a mano)
form.addEventListener("change", (e) => {
  if (e.target.classList.contains("switch")) plegar(e.target.closest("fieldset"), !e.target.checked);
});
// Estado inicial: todas las secciones empiezan plegadas, salvo la de la serie
secciones.forEach((seccion, i) => plegar(seccion, i > 0));

// ---------- Anomalías (filas del panel) ----------
// Cómo arranca cada fila nueva (van rotando)
const ANOMALIAS_INICIALES = [
  { tipo: "cambio_nivel", punto: 30 },
  { tipo: "puntual", punto: 100 },
  { tipo: "transitorio", punto: 200 },
];

function renumerarAnomalias() {
  [...listaAnomalias.children].forEach((fila, i) => {
    fila.querySelector(".estac-titulo").textContent = "Anomalía " + (i + 1);
  });
}

// Añade una fila al final. Con "aleatorio" marcado, punto o magnitud los elige el servidor.
function nuevaFilaAnomalia({ tipo, punto = 30, puntoAlea = false, magnitud = 20, magnitudAlea = false, decaimiento = 0.7 }) {
  const fila = plantillaAnomalia.content.firstElementChild.cloneNode(true);
  fila.querySelector(".a-tipo").value = tipo;
  fila.querySelector(".a-decaimiento").value = decaimiento;
  fila.querySelector(".a-punto").value = punto;
  fila.querySelector(".a-punto-alea").checked = puntoAlea;
  fila.querySelector(".a-magnitud").value = magnitud;
  fila.querySelector(".a-magnitud-alea").checked = magnitudAlea;
  listaAnomalias.appendChild(fila);
}

anadirAnomalia.addEventListener("click", () => {
  nuevaFilaAnomalia(ANOMALIAS_INICIALES[listaAnomalias.children.length % ANOMALIAS_INICIALES.length]);
  renumerarAnomalias();
  draw();
});

// Añade N anomalías aleatorias de cada tipo de una vez (hasta el tope).
document.getElementById("anadir-aleatorias").addEventListener("click", () => {
  for (const tipo of ["puntual", "cambio_nivel", "transitorio"]) {
    const n = parseInt(document.getElementById("n-" + tipo).value) || 0;
    for (let i = 0; i < n && listaAnomalias.children.length < MAX_ANOMALIAS; i++) {
      nuevaFilaAnomalia({ tipo, puntoAlea: true, magnitudAlea: true });
    }
  }
  renumerarAnomalias();
  draw();
});

listaAnomalias.addEventListener("click", (e) => {
  const quitar = e.target.closest(".quitar");
  if (!quitar) return;
  quitar.closest(".estac").remove();
  renumerarAnomalias();
  draw();
});

// ---------- Datos faltantes (filas del panel) ----------
// Cómo arranca cada fila nueva (van rotando)
const HUECOS_INICIALES = [
  { tipo: "punto", desde: 30, hasta: 30 },
  { tipo: "rango", desde: 100, hasta: 140 },
  { tipo: "punto", desde: 250, hasta: 250 },
];

function renumerarHuecos() {
  [...listaHuecos.children].forEach((fila, i) => {
    fila.querySelector(".estac-titulo").textContent = "Hueco " + (i + 1);
  });
}

function nuevaFilaHueco({ tipo, desde, hasta }) {
  const fila = plantillaHueco.content.firstElementChild.cloneNode(true);
  fila.querySelector(".h-tipo").value = tipo;
  fila.querySelector(".h-desde").value = desde;
  fila.querySelector(".h-hasta").value = hasta;
  listaHuecos.appendChild(fila);
}

anadirHueco.addEventListener("click", () => {
  nuevaFilaHueco(HUECOS_INICIALES[listaHuecos.children.length % HUECOS_INICIALES.length]);
  renumerarHuecos();
  draw();
});

listaHuecos.addEventListener("click", (e) => {
  const quitar = e.target.closest(".quitar");
  if (!quitar) return;
  quitar.closest(".estac").remove();
  renumerarHuecos();
  draw();
});

// Texto "desde,hasta" que entiende la API (un punto suelto es desde == hasta); null si falta algún número.
function textoHueco(h) {
  const hasta = h.tipo === "punto" ? h.desde : h.hasta;
  if (h.desde === "" || hasta === "") return null;
  return `${h.desde},${hasta}`;
}

// Texto "tipo,punto,magnitud" (más ",decaimiento" en los transitorios) que entiende la API; null si falta algún número.
function textoAnomalia(a) {
  const punto = a.puntoAlea ? "aleatorio" : a.punto;
  const magnitud = a.magnitudAlea ? "aleatorio" : a.magnitud;
  if (punto === "" || magnitud === "") return null;
  if (a.tipo === "transitorio") {
    if (a.decaimiento === "") return null;
    return `${a.tipo},${punto},${magnitud},${a.decaimiento}`;
  }
  return `${a.tipo},${punto},${magnitud}`;
}

// ---------- Estacionalidades (filas del panel) ----------
const PERIODOS_INICIALES = [50, 30, 12, 5, 7]; // periodo con el que arranca cada fila nueva

function renumerar() {
  [...lista.children].forEach((fila, i) => {
    fila.querySelector(".estac-titulo").textContent = "Estacionalidad " + (i + 1);
  });
}

// Cada onda se define por mínimo y máximo o por su amplitud total (máximo − mínimo), centrada en el
// nivel: mínimo = −amplitud/2 y máximo = +amplitud/2. A la API siempre van el mínimo y el máximo; el campo
// de amplitud los mantiene al día. Para una onda que no esté centrada, se usa mínimo y máximo.
const SUFIJOS = ["", "_fin"]; // primer punto y último punto (el último solo en multiplicativa)
const redondear = (v) => Math.round(v * 1e6) / 1e6;
const campoDe = (fila, nombre) => fila.querySelector(`[name=${nombre}]`);

function aAmplitud(fila, p) {
  for (const f of SUFIJOS) {
    const minimo = parseFloat(campoDe(fila, `${p}_minimo${f}`).value);
    const maximo = parseFloat(campoDe(fila, `${p}_maximo${f}`).value);
    if (!Number.isFinite(minimo) || !Number.isFinite(maximo)) continue;
    campoDe(fila, `${p}_amplitud${f}`).value = redondear(maximo - minimo);
  }
}

function aMinimoMaximo(fila, p) {
  for (const f of SUFIJOS) {
    const amplitud = parseFloat(campoDe(fila, `${p}_amplitud${f}`).value);
    if (!Number.isFinite(amplitud)) continue;
    campoDe(fila, `${p}_minimo${f}`).value = redondear(-amplitud / 2);
    campoDe(fila, `${p}_maximo${f}`).value = redondear(amplitud / 2);
  }
}

// Qué campos se ven: una sola forma de definir la amplitud, y los "al final" solo en multiplicativa
// (la amplitud pasa de los valores del primer punto a los del último).
function actualizarCampos(fila, p) {
  const mult = campoDe(fila, `${p}_modo`).value === "multiplicativa";
  const porAmplitud = campoDe(fila, `${p}_definicion`).value === "amp";
  fila.querySelectorAll(".unidad-estac").forEach((el) => { el.textContent = mult ? "al inicio (unidades)" : "(unidades)"; });
  fila.querySelectorAll(".campo-mm, .campo-am").forEach((etiqueta) => {
    const esDeAmplitud = etiqueta.classList.contains("campo-am");
    etiqueta.hidden = esDeAmplitud !== porAmplitud || (etiqueta.classList.contains("campo-fin") && !mult);
  });
}

function enlazarDefinicion(contenedor, p) {
  const derivados = ["amplitud", "amplitud_fin"].map((n) => `${p}_${n}`);
  contenedor.addEventListener("input", (e) => {
    if (derivados.includes(e.target.name)) aMinimoMaximo(e.target.closest(".estac"), p);
  });
  contenedor.addEventListener("change", (e) => {
    const fila = e.target.closest(".estac");
    if (!fila || ![`${p}_modo`, `${p}_definicion`].includes(e.target.name)) return;
    if (e.target.name === `${p}_definicion` && e.target.value === "amp") {
      aAmplitud(fila, p);
      aMinimoMaximo(fila, p); // la onda queda centrada en el nivel
    }
    actualizarCampos(fila, p);
    syncDisabled(); // los campos que acaban de aparecer no deben quedar desactivados
  });
}
enlazarDefinicion(lista, "estacionalidad");

function anadirEstacionalidad(periodo, modo = "aditiva", minimo = -10, maximo = 10, minimoFin = "-20", maximoFin = "20", definicion = "minmax") {
  const fila = plantilla.content.firstElementChild.cloneNode(true);
  fila.querySelector("[name=estacionalidad_periodo]").value =
    periodo ?? PERIODOS_INICIALES[lista.children.length % PERIODOS_INICIALES.length];
  fila.querySelector("[name=estacionalidad_modo]").value = modo;
  fila.querySelector("[name=estacionalidad_minimo]").value = minimo;
  fila.querySelector("[name=estacionalidad_maximo]").value = maximo;
  fila.querySelector("[name=estacionalidad_minimo_fin]").value = minimoFin;
  fila.querySelector("[name=estacionalidad_maximo_fin]").value = maximoFin;
  fila.querySelector("[name=estacionalidad_definicion]").value = definicion;
  aAmplitud(fila, "estacionalidad");
  actualizarCampos(fila, "estacionalidad");
  lista.appendChild(fila);
  renumerar();
}

anadir.addEventListener("click", () => {
  anadirEstacionalidad();
  draw();
});

lista.addEventListener("click", (e) => {
  const quitar = e.target.closest(".quitar");
  if (!quitar) return;
  quitar.closest(".estac").remove();
  renumerar();
  draw();
});

// ---------- Ciclos (filas del panel) ----------
const listaCiclos = document.getElementById("ciclos");
const plantillaCiclo = document.getElementById("plantilla-ciclo");
const anadirCiclo = document.getElementById("anadir-ciclo");
// Los valores de un ciclo, con el nombre del campo del formulario y de la API
const CAMPOS_CICLO = ["periodo", "var_periodo", "minimo", "maximo", "minimo_fin", "maximo_fin", "var_amplitud", "modo", "semilla"];
const CICLO_INICIAL = { periodo: "100", var_periodo: "20", minimo: "-10", maximo: "10", minimo_fin: "-20", maximo_fin: "20", var_amplitud: "25", modo: "aditiva" };
const PERIODOS_CICLO = [100, 250, 60, 400]; // periodo con el que arranca cada ciclo nuevo

function renumerarCiclos() {
  [...listaCiclos.children].forEach((fila, i) => {
    fila.querySelector(".estac-titulo").textContent = "Ciclo " + (i + 1);
  });
}

enlazarDefinicion(listaCiclos, "ciclo");

function nuevaFilaCiclo(valores = {}) {
  const fila = plantillaCiclo.content.firstElementChild.cloneNode(true);
  const v = { ...CICLO_INICIAL, periodo: PERIODOS_CICLO[listaCiclos.children.length % PERIODOS_CICLO.length], semilla: String(nuevaSemilla()), ...valores };
  for (const campo of CAMPOS_CICLO) fila.querySelector(`[name=ciclo_${campo}]`).value = v[campo];
  fila.querySelector("[name=ciclo_definicion]").value = v.definicion ?? "minmax";
  aAmplitud(fila, "ciclo");
  actualizarCampos(fila, "ciclo");
  listaCiclos.appendChild(fila);
  renumerarCiclos();
}

anadirCiclo.addEventListener("click", () => {
  nuevaFilaCiclo();
  draw();
});

listaCiclos.addEventListener("click", (e) => {
  const quitar = e.target.closest(".quitar");
  if (!quitar) return;
  quitar.closest(".estac").remove();
  renumerarCiclos();
  draw();
});

// Escribe una semilla nueva en su campo y repinta: misma configuración, otra muestra aleatoria.
function regenerar(campo) {
  form.elements[campo].value = nuevaSemilla();
  draw();
}

// Otra muestra aleatoria de ESE ciclo (los demás no cambian): cambian sus vueltas y alturas.
listaCiclos.addEventListener("click", (e) => {
  const boton = e.target.closest(".regenerar-ciclo");
  if (!boton) return;
  boton.closest(".estac").querySelector("[name=ciclo_semilla]").value = nuevaSemilla();
  draw();
});
// Otros puntos y magnitudes para las anomalías que están en "aleatorio".
document.getElementById("regenerar-anomalias").addEventListener("click", () => regenerar("semilla_anomalias"));
