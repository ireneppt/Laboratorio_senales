// Gráfica de las series y descomposición en componentes.
// ---------- Gráfica ----------
// Texto de cada opción de los desplegables, para el resumen ("lineal", "blanco"...).
const TEXTO_OPCION = {};
for (const name of ["tendencia_tipo", "ruido_tipo"]) {
  TEXTO_OPCION[name] = Object.fromEntries([...form.elements[name].options].map((o) => [o.value, o.textContent.toLowerCase()]));
}

// Los colores salen de las variables CSS, así la gráfica sigue al modo claro/oscuro.
function colores() {
  const css = getComputedStyle(document.documentElement);
  const c = (nombre) => css.getPropertyValue(nombre).trim();
  return {
    ink: c("--ink"), ink2: c("--ink-2"), muted: c("--muted"), grid: c("--grid"), axis: c("--axis"),
    surface: c("--surface"),
    series: Array.from({ length: N_COLORES }, (_, i) => c(`--series-${i + 1}`)),
    extra: Array.from({ length: 5 }, (_, i) => c(`--extra-${i + 1}`)),
    fuente: getComputedStyle(document.body).fontFamily,
  };
}

// Línea bajo el título con lo que hay activo en una serie.
function resumen(e, anomaliasAplicadas, faltantes) {
  const partes = [`${e.puntos} puntos`, e.valor_final.trim() !== "" ? `de ${e.nivel_base} a ${e.valor_final}` : `nivel ${e.nivel_base}`];
  if (e.tendencia_activa) partes.push(`tendencia ${TEXTO_OPCION.tendencia_tipo[e.tendencia_tipo]}`);
  const n = e.estacionalidades.length;
  if (e.estacionalidad_activa && n > 0) partes.push(n === 1 ? "1 estacionalidad" : `${n} estacionalidades`);
  const nc = e.ciclos.length;
  if (e.ciclo_activo && nc > 0) partes.push(nc === 1 ? "1 ciclo" : `${nc} ciclos`);
  if (e.ruido_activo) partes.push(`ruido ${TEXTO_OPCION.ruido_tipo[e.ruido_tipo]} ${e.ruido_grado} %`);
  if (anomaliasAplicadas > 0) {
    partes.push(anomaliasAplicadas === 1 ? "1 anomalía" : `${anomaliasAplicadas} anomalías`);
  }
  if (faltantes > 0) partes.push(faltantes === 1 ? "1 dato faltante" : `${faltantes} datos faltantes`);
  return partes.join("  ·  ");
}

function pintar() {
  const c = colores();
  const todas = vista === "todas";
  const visibles = (todas ? series : series.filter((s) => s.id === vista)).filter((s) => s.datos);

  const trazas = [];
  let hayTendencia = false;
  let hayOcultos = false;
  const bandas = []; // zonas sin dato, sombreadas (solo en la vista de una serie)
  for (const s of visibles) {
    const color = colorDe(s, c);
    const { x, y } = s.datos;
    // Con varias series el tooltip lleva el nombre de la traza; en una sola sobra.
    const etiqueta = todas ? "%{fullData.name}" : "";
    trazas.push({
      x, y, type: "scatter", mode: "lines", name: nombreDe(s),
      line: { color, width: 2 },
      hovertemplate: `<b>%{y:.1f}</b>  ·  punto %{x}<extra>${etiqueta}</extra>`,
    });
    // Datos faltantes: zona sombreada y, si se pide, el valor que tenían (línea de puntos).
    if (!todas && s.datos.huecos && s.datos.huecos.length > 0) {
      for (const h of s.datos.huecos) {
        bandas.push({
          type: "rect", xref: "x", yref: "paper", x0: h.desde - 0.5, x1: h.hasta + 0.5, y0: 0, y1: 1,
          fillcolor: c.muted, opacity: 0.15, line: { width: 0 }, layer: "below",
        });
      }
      if (s.estado.ver_ocultos && s.datos.y_completa) {
        hayOcultos = true;
        const oculto = s.datos.y_completa.map(() => null);
        for (const h of s.datos.huecos) {
          // un punto de más a cada lado, para que la línea de puntos enlace con la serie
          for (let i = Math.max(h.desde - 1, 0); i <= Math.min(h.hasta + 1, oculto.length - 1); i++) oculto[i] = s.datos.y_completa[i];
        }
        trazas.push({
          x, y: oculto, type: "scatter", mode: "lines", name: nombreDe(s) + " · valor oculto",
          line: { color, width: 2, dash: "dot" }, opacity: 0.6,
          hovertemplate: `oculto <b>%{y:.1f}</b><extra></extra>`,
        });
      }
    }
    // Tendencia como línea discontinua encima, en el color de la tinta para que se vea
    // aunque coincida con la serie (por ejemplo, sin estacionalidad ni ruido).
    // Solo en la vista de una serie: en "Todas" no se pinta.
    if (!todas && s.estado.tendencia_activa && s.estado.ver_tendencia && s.datos.componentes) {
      hayTendencia = true;
      trazas.push({
        x, y: s.datos.componentes.tendencia, type: "scatter", mode: "lines",
        name: nombreDe(s) + " · tendencia",
        line: { color: c.ink, width: 2, dash: "dash" },
        opacity: 0.5, // más suave que la serie, para que no tape lo que hay debajo
        hovertemplate: `tendencia <b>%{y:.1f}</b><extra></extra>`,
      });
    }
  }

  // Título y resumen
  const titulo = document.getElementById("titulo-grafica");
  const resumenEl = document.getElementById("resumen");
  if (todas) {
    titulo.textContent = "Todas las series";
    resumenEl.textContent = `${series.length} series superpuestas`;
  } else {
    const s = series.find((x) => x.id === vista);
    titulo.textContent = nombreDe(s);
    resumenEl.textContent = esManual(s) ? resumenManual(s)
      : s.datos ? resumen(s.estado, s.datos.anomalias.length, s.datos.n_faltantes) : "";
  }

  const eje = (texto) => ({
    title: { text: texto, font: { color: c.muted, size: 12 }, standoff: 8 },
    gridcolor: c.grid, gridwidth: 1, zeroline: false,
    linecolor: c.axis, tickfont: { color: c.muted, size: 11 }, ticks: "", automargin: true,
  });
  // Serie manual: con el dibujo activo (o sin datos) los ejes se fijan, para que el cursor siempre
  // corresponda al mismo valor y la gráfica no se mueva mientras se dibuja.
  const unica = todas ? null : visibles[0];
  const manual = esManual(unica);
  const enDibujo = manual && dibujando;
  const fijar = enDibujo || (manual && unica.manual.y.every((v) => v === null));
  const ejeX = fijar ? { range: [-0.5, unica.manual.y.length - 0.5], autorange: false } : manual ? { autorange: true } : {};
  const ejeY = fijar ? { range: [unica.manual.yMin, unica.manual.yMax], autorange: false } : manual ? { autorange: true } : {};
  document.getElementById("chart").classList.toggle("dibujando", enDibujo);
  Plotly.react("chart", trazas, {
    dragmode: enDibujo ? false : "zoom",
    paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: c.fuente, color: c.ink2 },
    margin: { t: fijar ? 24 : 8, r: 12, b: 8, l: 64 }, // margen izquierdo fijo: las gráficas de la descomposición lo comparten; con el eje fijo (dibujando) hace falta sitio arriba para el último valor del eje
    xaxis: {
      ...eje("Punto"), showline: true, showgrid: false, ...ejeX,
      showspikes: true, spikemode: "across", spikesnap: "cursor",
      spikethickness: 1, spikedash: "solid", spikecolor: c.muted,
    },
    yaxis: { ...eje("Valor"), showline: false, automargin: false, ...ejeY },
    hovermode: enDibujo ? false : todas ? "x unified" : "x",
    hoverlabel: { bgcolor: c.surface, bordercolor: c.axis, font: { color: c.ink, family: c.fuente, size: 13 } },
    // Con una sola serie la leyenda sobra, salvo que haya que distinguir la serie de su tendencia.
    showlegend: (todas && visibles.length > 1) || (!todas && (hayTendencia || hayOcultos)),
    shapes: bandas,
    legend: { orientation: "h", x: 0, y: 1.08, font: { color: c.ink2, size: 12 } },
  }, { responsive: true, displaylogo: false, displayModeBar: false });

  pintarAnalisis();
  programarEstadoProyecto();
}

// ---------- Descomposición: los bloques de la serie por separado ----------
// Cada componente es lo que aporta ese bloque: tendencia + estacionalidad + ruido + anomalías = serie.
const COMPONENTES = [
  { clave: "tendencia", titulo: "Nivel y tendencia", visible: () => true },
  { clave: "estacionalidad", titulo: "Estacionalidad", visible: (s) => s.estado.estacionalidad_activa && s.estado.estacionalidades.length > 0 },
  { clave: "ciclo", titulo: "Ciclo", visible: (s) => s.estado.ciclo_activo && s.estado.ciclos.length > 0 },
  { clave: "ruido", titulo: "Ruido", visible: (s) => s.estado.ruido_activo },
  { clave: "anomalias", titulo: "Anomalías", visible: (s) => s.estado.anomalias_activas && s.datos.anomalias.length > 0 },
];
const botonDescomponer = document.getElementById("boton-descomponer");
const contDescomposicion = document.getElementById("descomposicion");

function pintarDescomposicion() {
  // Se deshace lo anterior (gráficas incluidas) y se vuelve a montar.
  contDescomposicion.querySelectorAll(".graf-comp").forEach((g) => Plotly.purge(g));
  contDescomposicion.replaceChildren();

  const s = vista === "todas" ? null : series.find((x) => x.id === vista);
  botonDescomponer.hidden = !s || esManual(s); // en "Todas" y en las manuales no hay descomposición
  if (!s || !s.datos || !s.descomponer) {
    contDescomposicion.hidden = true;
    botonDescomponer.textContent = "Descomponer serie";
    return;
  }
  botonDescomponer.textContent = "Ocultar descomposición";
  contDescomposicion.hidden = false;

  const c = colores();
  const color = colorDe(s, c);
  const paneles = COMPONENTES.filter((comp) => comp.visible(s));
  paneles.forEach((comp, i) => {
    const bloque = document.createElement("div");
    bloque.className = "comp";
    const titulo = document.createElement("h3");
    titulo.textContent = comp.titulo;
    const grafica = document.createElement("div");
    grafica.className = "graf-comp";
    bloque.append(titulo, grafica);
    contDescomposicion.append(bloque);

    const ultimo = i === paneles.length - 1;
    const eje = (texto) => ({
      title: texto ? { text: texto, font: { color: c.muted, size: 12 }, standoff: 8 } : undefined,
      gridcolor: c.grid, gridwidth: 1, zeroline: comp.clave !== "tendencia", zerolinecolor: c.axis,
      linecolor: c.axis, tickfont: { color: c.muted, size: 11 }, ticks: "", automargin: true,
    });
    Plotly.newPlot(grafica, [{
      x: s.datos.x, y: s.datos.componentes[comp.clave], type: "scatter", mode: "lines",
      line: { color, width: 2 },
      hovertemplate: `<b>%{y:.2f}</b>  ·  punto %{x}<extra></extra>`,
    }], {
      paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
      font: { family: c.fuente, color: c.ink2 },
      margin: { t: 4, r: 12, b: 8, l: 64 },
      xaxis: { ...eje(ultimo ? "Punto" : ""), showline: true, showgrid: false },
      yaxis: { ...eje(""), showline: false, automargin: false },
      hovermode: "x",
      hoverlabel: { bgcolor: c.surface, bordercolor: c.axis, font: { color: c.ink, family: c.fuente, size: 13 } },
    }, { responsive: true, displaylogo: false, displayModeBar: false });
  });
}

botonDescomponer.addEventListener("click", () => {
  const s = series.find((x) => x.id === vista);
  if (!s) return;
  s.descomponer = !s.descomponer;
  pintarAnalisis();
});

// Pinta lo que va debajo de la gráfica y fija la tarjeta si hay algo abierto.
function pintarAnalisis() {
  pintarDescomposicion();
  document.querySelector(".tarjeta-grafica").classList.toggle("abierta", !contDescomposicion.hidden);
}

// Antes de pintar, se piden las series que aún no tienen datos (por ejemplo al abrir "Todas").
async function repintar() {
  const necesarias = vista === "todas" ? series : series.filter((s) => s.id === vista);
  await Promise.all(necesarias.filter((s) => !s.datos).map((s) => cargarSerie(s)));
  pintar();
}

// Debajo de cada anomalía del panel, lo que se aplicó de verdad (útil con las aleatorias).
function mostrarResueltos() {
  for (const fila of listaAnomalias.children) fila.querySelector(".resuelto").textContent = "";
  if (!activa.datos || !activa.estado.anomalias_activas) return;
  activa.incluidas.forEach((posicion, i) => {
    const a = activa.datos.anomalias[i];
    const fila = listaAnomalias.children[posicion];
    if (a && fila) fila.querySelector(".resuelto").textContent =
      `Aplicada en el punto ${a.punto}, ${a.magnitud > 0 ? "+" : ""}${a.magnitud} %`;
  });
}

async function draw() {
  const numero = ++ultimaPeticion;
  syncDisabled();
  guardarActiva();
  renderPestanas(); // por si se ha cambiado el nombre de la serie
  if (esManual(activa)) { await repintar(); return; } // el panel de generación no se usa
  if (!validarCampos()) return; // hay un valor imposible: se avisa en el campo y se conserva la gráfica
  const ok = await cargarSerie(activa, numero);
  if (numero !== ultimaPeticion) return;
  if (ok) mostrarResueltos();
  await repintar();
}

form.addEventListener("input", draw);
form.addEventListener("submit", (e) => e.preventDefault());
// Si el sistema cambia entre claro y oscuro, se repinta con los colores del nuevo tema.
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", pintar);
