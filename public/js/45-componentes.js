// Componentes de las series que no se generan (importadas, escritas o dibujadas).
// De estas series no se conocen los bloques con los que se hicieron, así que se estiman en Python (ruta
// /api/componentes): periodo estacional, tendencia, estacionalidad, resto, fuerza de cada componente, pendiente de Sen
// y posibles anomalías. Se ven con el mismo botón "Descomponer serie" que las generadas, y el "?" de su esquina explica
// paso a paso cómo se ha calculado todo, con los números de la serie.
// El periodo se calcula también en segundo plano cada vez que cambia la serie y se guarda con ella: "sugerido" hasta
// que el usuario lo confirma o lo cambia. Lo usa la media estacional de la imputación (sin enseñarlo allí).

const comp = { cache: new Map(), temporizadores: new Map(), token: 0 };
const botonComo = document.getElementById("boton-como");
const MIN_DATOS_COMPONENTES = 8;

const periodoVacio = () => ({ valor: null, estado: null });   // estado: null (sin calcular), "sugerido", "ninguno" o "confirmado"

// Números con coma decimal y pocos decimales
const numeroComp = (v, decimales = 2) => (v === null || v === undefined ? "—"
  : v.toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: decimales }));

async function pedirComponentes(y, periodo) {
  const cuerpo = JSON.stringify({ y, periodo });
  const clave = huellaTexto(cuerpo);
  if (comp.cache.has(clave)) return comp.cache.get(clave);
  const respuesta = await fetch("/api/componentes", { method: "POST", headers: { "Content-Type": "application/json" }, body: cuerpo });
  if (respuesta.status === 404 || respuesta.status === 405) {
    throw new Error("El servidor que está en marcha no sabe calcular componentes (es una versión anterior). Reinícialo con «python dev.py» y recarga la página.");
  }
  const datos = await respuesta.json();
  if (!respuesta.ok) throw new Error(typeof datos.detail === "string" ? datos.detail : "No se han podido calcular los componentes.");
  if (comp.cache.size >= 30) comp.cache.delete(comp.cache.keys().next().value);
  comp.cache.set(clave, datos);
  return datos;
}

// ----- El periodo, en segundo plano -----
// Se espera un segundo desde el último cambio (al dibujar, la serie cambia en cada trazo)
function programarPeriodo(s) {
  if (!esManual(s)) return;
  clearTimeout(comp.temporizadores.get(s.id));
  comp.temporizadores.set(s.id, setTimeout(() => sugerirPeriodo(s), 1000));
}

async function sugerirPeriodo(s) {
  if (!series.includes(s) || s.periodo.estado === "confirmado") return;
  if (s.manual.y.filter((v) => v !== null).length < MIN_DATOS_COMPONENTES) {
    s.periodo = periodoVacio();
    return;
  }
  let r;
  try { r = await pedirComponentes(s.manual.y, null); } catch { return; }   // sin servidor: se volverá a intentar al cambiarla
  if (s.periodo.estado === "confirmado") return;                         // se ha confirmado mientras tanto
  guardarSugerido(s, r.periodo);
}

function guardarSugerido(s, periodo) {
  const nuevo = { valor: periodo, estado: periodo ? "sugerido" : "ninguno" };
  if (s.periodo.valor === nuevo.valor && s.periodo.estado === nuevo.estado) return;
  s.periodo = nuevo;
  alCambiarPeriodo(s);
}

// La imputación usa el periodo de la explicada: si cambia y se está viendo, se recalcula
function alCambiarPeriodo(s) {
  if (serieExplicada() === s && resImp.ui.metodos && resImp.ui.metodos.isConnected) ejecutarImputacion();
}

// El periodo estacional de cualquier serie: el de las manuales (confirmado o sugerido) o, en las generadas, el de su
// estacionalidad de mayor amplitud (la que más pesa en la serie). null si no tiene.
function periodoDeSerie(s) {
  if (!s) return null;
  if (esManual(s)) return s.periodo && s.periodo.valor ? s.periodo.valor : null;
  const e = s.estado;
  if (!e.estacionalidad_activa || !e.estacionalidades.length) return null;
  const amplitud = (x) => Math.abs(Number(x.maximo) - Number(x.minimo)) || 0;
  const mayor = e.estacionalidades.reduce((a, b) => (amplitud(b) > amplitud(a) ? b : a));
  const periodo = parseInt(mayor.periodo);
  return Number.isInteger(periodo) && periodo >= 2 ? periodo : null;
}

// ----- El panel: lo pinta pintarDescomposicion (en 30-grafica) cuando la serie es manual -----
async function pintarComponentesManual(s) {
  const cont = contDescomposicion;
  const abierto = s.descomponer || s.verExplicacion;
  botonDescomponer.textContent = s.descomponer ? "Ocultar descomposición" : "Descomponer serie";
  botonComo.classList.toggle("activo", Boolean(s.verExplicacion));
  botonComo.setAttribute("aria-expanded", Boolean(s.verExplicacion));
  cont.hidden = !abierto;
  if (!abierto) return;
  const token = ++comp.token;
  if (s.manual.y.filter((v) => v !== null).length < MIN_DATOS_COMPONENTES) {
    cont.append(avisoComp(`Hacen falta al menos ${MIN_DATOS_COMPONENTES} datos para analizar la serie.`));
    return;
  }
  const cargando = document.createElement("div");
  cargando.className = "cargando";
  cargando.setAttribute("role", "status");
  cargando.textContent = "Calculando componentes…";
  cont.append(cargando);
  const fijo = s.periodo.estado === "confirmado" ? s.periodo.valor : null;
  let r;
  try {
    r = await pedirComponentes(s.manual.y, fijo);
  } catch (error) {
    if (token !== comp.token) return;
    cargando.replaceWith(avisoComp(error.message, true));
    return;
  }
  if (token !== comp.token || vista !== s.id) return;
  if (!fijo) guardarSugerido(s, r.periodo);                   // por si el cálculo en segundo plano aún no había llegado
  cont.replaceChildren();
  if (s.verExplicacion) cont.append(explicacionComponentes(r));
  if (s.descomponer) montarPanelComponentes(s, r, cont);
}

function avisoComp(texto, esError = false) {
  const p = document.createElement("p");
  p.className = "cp-aviso" + (esError ? " error" : "");
  p.textContent = texto;
  return p;
}

const textoP = (p) => (p < 0.001 ? "p < 0,001" : `p = ${numeroComp(p, 3)}`);
const textoPendiente = (pendiente) => {
  const sentido = pendiente.sen > 0 ? "sube" : pendiente.sen < 0 ? "baja" : "no sube ni baja";
  const cuanto = pendiente.sen ? ` ${numeroComp(Math.abs(pendiente.sen), 3)} por punto` : "";
  return `${sentido}${cuanto}, ${pendiente.significativa ? "significativa" : "no significativa"} (${textoP(pendiente.p)})`;
};

function montarPanelComponentes(s, r, cont) {
  const panel = document.createElement("div");
  panel.className = "cp";
  s.verComp ??= { tendencia: true, estacionalidad: true, resto: true };

  // periodo: sugerido o confirmado; al cambiarlo se recalcula
  const fila = document.createElement("div");
  fila.className = "cp-periodo";
  const etiqueta = document.createElement("label");
  etiqueta.append("Periodo estacional (en puntos) ");
  const entrada = document.createElement("input");
  entrada.type = "number"; entrada.min = 2; entrada.max = Math.floor(r.n / 2); entrada.step = 1;
  entrada.value = r.periodo ?? "";
  entrada.placeholder = "ninguno";
  etiqueta.append(entrada);
  const estado = document.createElement("span");
  estado.className = "cp-estado " + (s.periodo.estado || "");
  estado.textContent = s.periodo.estado === "confirmado" ? "confirmado" : r.periodo ? "sugerido" : "sin estacionalidad";
  fila.append(etiqueta, estado);
  if (s.periodo.estado === "confirmado") {
    const volver = document.createElement("button");
    volver.type = "button";
    volver.textContent = "Volver al sugerido";
    volver.addEventListener("click", () => cambiarPeriodoManual(s, null));
    fila.append(volver);
  }
  entrada.addEventListener("change", () => {
    const valor = entrada.value.trim() === "" ? null : Math.min(Math.max(parseInt(entrada.value) || 2, 2), Math.floor(r.n / 2));
    cambiarPeriodoManual(s, valor);
  });
  panel.append(fila);

  // resumen y avisos
  const ft = r.fuerza_tendencia, fe = r.fuerza_estacionalidad;
  const resumen = document.createElement("p");
  resumen.className = "cp-resumen";
  resumen.textContent = [
    `Tendencia: ${ft.etiqueta ?? "—"} (${numeroComp(ft.valor)})`,
    fe ? `Estacionalidad: ${fe.etiqueta ?? "—"} (${numeroComp(fe.valor)})` : "Sin estacionalidad",
    `${r.anomalias.length} ${r.anomalias.length === 1 ? "posible anomalía" : "posibles anomalías"}`,
  ].join("  ·  ");
  resumen.title = "La fuerza va de 0 a 1: débil por debajo de 0,3, moderada hasta 0,6 y fuerte por encima. El «?» del botón explica cómo se calcula.";
  panel.append(resumen);
  for (const aviso of r.avisos) panel.append(avisoComp(aviso));

  // casillas para mostrar u ocultar cada componente (como en las series generadas)
  const casillas = document.createElement("div");
  casillas.className = "cp-casillas";
  const opciones = [["tendencia", "Tendencia (con la pendiente de Sen)"], ["estacionalidad", "Estacionalidad"], ["resto", "Resto y anomalías"]];
  for (const [clave, texto] of opciones) {
    if (clave === "estacionalidad" && !r.periodo) continue;
    const label = document.createElement("label");
    label.className = "toggle opcion";
    const casilla = document.createElement("input");
    casilla.type = "checkbox"; casilla.className = "alea"; casilla.checked = s.verComp[clave];
    casilla.addEventListener("change", () => { s.verComp[clave] = casilla.checked; pintarAnalisis(); });
    label.append(casilla, ` ${texto}`);
    casillas.append(label);
  }
  panel.append(casillas);
  cont.append(panel);
  pintarGraficasComponentes(s, r, cont);
}

function cambiarPeriodoManual(s, valor) {
  s.periodo = valor === null ? periodoVacio() : { valor, estado: "confirmado" };
  programarEstadoProyecto();
  alCambiarPeriodo(s);
  pintarAnalisis();
}

function pintarGraficasComponentes(s, r, cont) {
  const c = colores();
  const color = colorDe(s, c);
  const x = r.tendencia.map((_, i) => i);
  const graficas = [];
  const anadir = (titulo, trazas, extra = {}) => {
    const bloque = document.createElement("div");
    bloque.className = "comp";
    const h3 = document.createElement("h3");
    h3.textContent = titulo;
    const grafica = document.createElement("div");
    grafica.className = "graf-comp";
    bloque.append(h3, grafica);
    cont.append(bloque);
    graficas.push([grafica, trazas, extra]);
  };
  if (s.verComp.tendencia) {
    // lo prolongado en los extremos, a trazos; la recta de Sen, punteada
    const dentro = r.tendencia.map((v, i) => (r.prolongado[i] ? null : v));
    const fuera = r.tendencia.map((v, i) => (r.prolongado[i] || r.prolongado[i - 1] || r.prolongado[i + 1] ? v : null));
    const p = r.pendiente;
    anadir(`Tendencia · ${textoPendiente(p)}`, [
      { x, y: s.manual.y, type: "scatter", mode: "lines", name: "Serie", line: { color: c.grid, width: 1.5 }, hovertemplate: "serie <b>%{y:.2f}</b><extra></extra>" },
      { x, y: dentro, type: "scatter", mode: "lines", name: "Tendencia", line: { color, width: 2.4 }, hovertemplate: "tendencia <b>%{y:.2f}</b><extra></extra>" },
      { x, y: fuera, type: "scatter", mode: "lines", name: "Tendencia prolongada", line: { color, width: 2, dash: "dash" }, hovertemplate: "prolongada <b>%{y:.2f}</b><extra></extra>" },
      { x, y: x.map((i) => p.ordenada + p.sen * i), type: "scatter", mode: "lines", name: "Recta de Sen", line: { color: c.ink, width: 1.5, dash: "dot" }, hovertemplate: "Sen <b>%{y:.2f}</b><extra></extra>" },
    ]);
  }
  if (s.verComp.estacionalidad && r.periodo) {
    anadir(`Estacionalidad · periodo ${r.periodo}`, [
      { x, y: r.estacionalidad, type: "scatter", mode: "lines", line: { color, width: 2 }, hovertemplate: "<b>%{y:.2f}</b><extra></extra>" },
    ], { cero: true });
  }
  if (s.verComp.resto) {
    const n = r.anomalias.length;
    anadir(`Resto · ${n} ${n === 1 ? "posible anomalía" : "posibles anomalías"}`, [
      { x, y: r.resto.map((v, i) => (r.rellenado[i] ? null : v)), type: "scatter", mode: "lines", line: { color, width: 1.6 }, hovertemplate: "<b>%{y:.2f}</b><extra></extra>" },
      { x: r.anomalias, y: r.anomalias.map((i) => r.resto[i]), type: "scatter", mode: "markers", name: "Posible anomalía",
        marker: { color: "rgba(0,0,0,0)", size: 12, line: { color: c.ink, width: 2 } }, hovertemplate: "posible anomalía <b>%{y:.2f}</b><extra></extra>" },
    ], { cero: true });
  }
  graficas.forEach(([grafica, trazas, extra], i) => {
    const ultimo = i === graficas.length - 1;
    const eje = (texto) => ({
      title: texto ? { text: texto, font: { color: c.muted, size: 12 }, standoff: 8 } : undefined,
      gridcolor: c.grid, gridwidth: 1, zeroline: Boolean(extra.cero), zerolinecolor: c.axis,
      linecolor: c.axis, tickfont: { color: c.muted, size: 11 }, ticks: "", automargin: true,
    });
    Plotly.newPlot(grafica, trazas, {
      paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)", font: { family: c.fuente, color: c.ink2 },
      margin: { t: 4, r: 12, b: 8, l: 64 }, showlegend: false, hovermode: "x",
      xaxis: { ...eje(ultimo ? "Punto" : ""), showline: true, showgrid: false },
      yaxis: { ...eje(""), showline: false, automargin: false },
      hoverlabel: { bgcolor: c.surface, bordercolor: c.axis, font: { color: c.ink, family: c.fuente, size: 13 } },
    }, { responsive: true, displaylogo: false, displayModeBar: false });
  });
}

// ----- El "?": cómo se ha calculado, paso a paso, con los números de esta serie -----
function explicacionComponentes(r) {
  const d = r.detalle;
  const caja = document.createElement("div");
  caja.className = "cp-explicacion";
  const titulo = document.createElement("h3");
  titulo.textContent = "Cómo se ha calculado, paso a paso";
  const lista = document.createElement("ol");
  const paso = (nombre, texto) => {
    const li = document.createElement("li");
    const b = document.createElement("strong");
    b.textContent = nombre + ". ";
    li.append(b, texto);
    lista.append(li);
  };
  const n = (v, dec = 3) => numeroComp(v, dec);

  paso("Datos", `La serie tiene ${r.n} puntos.` + (d.huecos
    ? ` Le faltan ${d.huecos}: para este análisis se rellenan uniendo los datos vecinos con rectas (la serie no cambia) y esos puntos no cuentan para las fuerzas, la pendiente ni las anomalías.`
    : " No le falta ninguno."));

  if (r.origen_periodo === "usuario") {
    paso("Periodo", `${r.periodo} puntos: lo has fijado tú.`);
  } else {
    const dp = d.periodo;
    const picos = dp.picos.length
      ? ` Picos encontrados: ${dp.picos.map((x) => `${x.retardo} (${n(x.autocorrelacion, 2)}${x.en_el_doble === null ? "" : `; en el doble, ${n(x.en_el_doble, 2)}`})`).join(", ")}.`
      : " No hay ningún pico.";
    const base = `Se le quita a la serie una recta (pendiente ${n(dp.pendiente_quitada)} por punto) y se calcula la autocorrelación de lo que queda: cuánto se parece a sí misma desplazada k puntos, para k de 1 a ${dp.retardo_max} (un tercio de la serie, para ver al menos 3 ciclos). Un ciclo se nota como un pico de autocorrelación de al menos ${n(dp.umbral_pico, 2)}, y su doble también tiene que tener autocorrelación (al menos ${n(dp.umbral_multiplo, 2)}).${picos}`;
    paso("Periodo", r.periodo
      ? `${base} Se elige el primero que llega al 85 % del más alto (los siguientes suelen ser sus múltiplos): ${r.periodo} puntos.`
      : `${base} Así que no se detecta estacionalidad.`);
  }

  const t = d.tendencia;
  const media = r.periodo
    ? `Media móvil centrada de ${t.longitud} puntos: cada punto, la media de los ${t.longitud} que lo rodean. Como abarca un ciclo entero, la estacionalidad se anula y queda la tendencia.` + (t.doble ? ` Como ${t.longitud} es par, se usa la media «2×${t.longitud}»: ${t.longitud + 1} puntos con los dos de los extremos pesando la mitad, para que quede centrada.` : "")
    : `Media móvil centrada de ${t.longitud} puntos (unos n/10): cada punto, la media de los que lo rodean.`;
  paso("Tendencia", `${media} En los ${t.prolongados_inicio} primeros y ${t.prolongados_fin} últimos puntos la ventana no cabe: ahí la tendencia se prolonga con una recta ajustada a sus valores más cercanos (en la gráfica, a trazos).`);

  if (r.periodo) {
    paso("Estacionalidad", `A la serie se le resta la tendencia y se hace la media de cada posición del ciclo (todas las posiciones 1, todas las 2…), sin los puntos rellenados ni los prolongados. Luego se centra para que el patrón sume 0. El patrón va de ${n(d.patron.minimo, 2)} (posición ${d.patron.posicion_minimo + 1}) a ${n(d.patron.maximo, 2)} (posición ${d.patron.posicion_maximo + 1}) y se repite cada ${r.periodo} puntos.`);
  } else {
    paso("Estacionalidad", "Sin periodo no hay estacionalidad: esta componente es 0.");
  }
  paso("Resto", "Resto = serie − tendencia − estacionalidad. Sumando las tres componentes se recupera la serie exacta.");

  const f = d.fuerzas;
  const etiquetas = `débil por debajo de ${n(f.umbral_debil, 1)}, moderada hasta ${n(f.umbral_fuerte, 1)} y fuerte por encima`;
  let fuerzas = `Fuerza de la tendencia = máx(0, 1 − Var(resto) / Var(tendencia + resto)) = 1 − ${n(f.var_resto)} / ${n(f.var_tendencia_resto)} = ${n(r.fuerza_tendencia.valor)}: ${r.fuerza_tendencia.etiqueta}.`;
  if (r.fuerza_estacionalidad) fuerzas += ` Fuerza de la estacionalidad = máx(0, 1 − Var(resto) / Var(estacionalidad + resto)) = 1 − ${n(f.var_resto)} / ${n(f.var_estacionalidad_resto)} = ${n(r.fuerza_estacionalidad.valor)}: ${r.fuerza_estacionalidad.etiqueta}.`;
  paso("Fuerza", `${fuerzas} Cuanto más se parece el resto a la componente más resto, menos aporta la componente (${etiquetas}). Calculadas con los ${f.puntos} puntos con dato y sin prolongar (Wang, Smith y Hyndman, 2006).`);

  const p = r.pendiente;
  paso("Pendiente", `Pendiente de Sen: la mediana de las pendientes entre todos los pares de puntos (${p.pares.toLocaleString("es-ES")} pares${p.submuestreo ? `, con ${p.puntos} puntos repartidos por igual porque la serie es larga` : ""}) de la serie sin estacionalidad = ${n(p.sen, 4)} por punto. Contraste de Mann-Kendall: S, la suma de +1 por cada par que sube y −1 por cada par que baja, vale ${p.s.toLocaleString("es-ES")}; con la aproximación normal z = ${n(p.z)} y ${textoP(p.p)}, así que la tendencia ${p.significativa ? "es" : "no es"} significativa (p < 0,05). Ojo: si el resto está autocorrelacionado, Mann-Kendall exagera la significación.`);

  const a = d.anomalias;
  paso("Anomalías", `Mediana del resto = ${n(a.mediana_resto)}. MAD escalada (1,4826 × la mediana de las distancias a esa mediana; con datos normales equivale a la desviación típica) = ${n(a.mad_escalada)}. Se marca un punto si su resto se aleja de la mediana más de ${a.veces_mad} × ${n(a.mad_escalada)} = ${n(a.umbral)}.` + (r.anomalias.length
    ? ` Puntos marcados: ${r.anomalias.join(", ")}.` : " No se marca ninguno.")
    + (a.primera_pasada ? ` Como en una primera vuelta salieron ${a.primera_pasada}, la descomposición se repite tratándolas como huecos (así una anomalía grande no arrastra la tendencia ni el patrón y hace parecer anómalos a sus vecinos) y se vuelve a medir.` : ""));
  caja.append(titulo, lista);
  return caja;
}

botonComo.addEventListener("click", () => {
  const s = series.find((x) => x.id === vista);
  if (!s) return;
  s.verExplicacion = !s.verExplicacion;
  pintarAnalisis();
});
