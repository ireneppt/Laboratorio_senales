// Imputación, pestaña 3: correlación.
// ----- Pestaña 3: Correlación -----
// Para cada variable explicativa se calcula su relación con la explicada: correlación (Pearson), correlación por
// orden (Spearman) y R². Solo cuentan los puntos en que las dos series tienen dato y que no se le han quitado a la
// explicada (lo quitado no se conocería en la práctica).
const cor = { ui: {}, token: 0, orden: { columna: null, sentido: -1 }, serieGrafica: null, maxLag: null, medida: "pearson" };
const formatoCor = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function parejasComunes(obj, serie) {
  const x = serie.datos.y, xs = [], ys = [];
  for (let i = 0; i < obj.n; i++) {
    if (obj.objetivo[i] || i >= x.length || x[i] === null) continue;
    xs.push(x[i]);
    ys.push(obj.y[i]);
  }
  return { xs, ys };
}

// Correlación de Pearson: lo que se mueven juntas dos series, de −1 a +1. null si no se puede calcular.
function correlacionPearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null; // una serie constante no se relaciona con nada
  return Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy)));
}

// Posición de cada valor al ordenarlos de menor a mayor; los empates reparten la posición media
function rangosMedios(valores) {
  const orden = valores.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const rangos = new Array(valores.length);
  for (let i = 0; i < orden.length;) {
    let j = i;
    while (j + 1 < orden.length && orden[j + 1][0] === orden[i][0]) j++;
    const medio = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) rangos[orden[k][1]] = medio;
    i = j + 1;
  }
  return rangos;
}
const correlacionSpearman = (xs, ys) => (xs.length < 3 ? null : correlacionPearson(rangosMedios(xs), rangosMedios(ys)));

// Intervalo de confianza del 95 % de una correlación (transformación de Fisher)
function intervaloCorrelacion(r, n) {
  if (r === null || n <= 3 || Math.abs(r) >= 1) return null;
  const z = Math.atanh(r), error = 1 / Math.sqrt(n - 3);
  return [Math.tanh(z - 1.96 * error), Math.tanh(z + 1.96 * error)];
}

// Desfase máximo que se prueba: el que escribe el usuario, o un valor razonable según la longitud de la serie
const desfaseMaximo = (obj) => Math.max(1, Math.min(cor.maxLag ?? Math.max(3, Math.min(30, Math.floor(obj.n / 4))), Math.max(obj.n - 5, 1)));

// Correlación cruzada: la explicada en el punto t frente a la explicativa en el punto t − k.
// Con k > 0 se comparan valores ANTERIORES de la explicativa (va por delante); con k < 0, posteriores (va por detrás).
function correlacionCruzada(obj, serie, maxLag) {
  const x = serie.datos.y, resultado = [];
  for (let k = -maxLag; k <= maxLag; k++) {
    const xs = [], ys = [];
    for (let t = 0; t < obj.n; t++) {
      const j = t - k;
      if (obj.objetivo[t] || j < 0 || j >= x.length || x[j] === null) continue;
      xs.push(x[j]);
      ys.push(obj.y[t]);
    }
    resultado.push({ k, n: xs.length, r: xs.length >= 5 ? correlacionPearson(xs, ys) : null });
  }
  return resultado;
}
// El desfase con más relación (sin fijarse en el signo); si hay empate, el más cercano a 0
function mejorDesfase(cruz) {
  let mejor = null;
  for (const c of cruz) {
    if (c.r === null) continue;
    if (!mejor || Math.abs(c.r) > Math.abs(mejor.r) + 1e-12 || (Math.abs(Math.abs(c.r) - Math.abs(mejor.r)) <= 1e-12 && Math.abs(c.k) < Math.abs(mejor.k))) mejor = c;
  }
  return mejor;
}

function calcularCorrelaciones(obj) {
  const maxLag = desfaseMaximo(obj);
  return explicativasElegidas().filter((x) => x.datos).map((serie) => {
    const { xs, ys } = parejasComunes(obj, serie);
    const r = correlacionPearson(xs, ys);
    const cruz = correlacionCruzada(obj, serie, maxLag);
    return {
      serie, n: xs.length, r, rho: correlacionSpearman(xs, ys), r2: r === null ? null : r * r, intervalo: intervaloCorrelacion(r, xs.length),
      cruz, mejor: mejorDesfase(cruz), r0: (cruz.find((c) => c.k === 0) || {}).r ?? null,
    };
  });
}

function montarCorrelacion() {
  const raiz = document.createElement("div");
  raiz.className = "cor";
  raiz.innerHTML = `
    <div class="exp-aviso" id="cor-falta" hidden>
      <span id="cor-falta-texto"></span>
      <button type="button" id="cor-falta-ir"></button>
    </div>
    <div id="cor-trabajo" hidden>
      <p class="ayuda" id="cor-info" style="margin:0 0 14px"></p>
      <div class="cor-tabla" id="cor-tabla" role="table" aria-label="Correlación de cada explicativa con la explicada"></div>
      <section class="cor-matriz">
        <h3>Correlación entre las explicativas</h3>
        <div class="cor-controles">
          <label>Medida
            <select id="cor-medida" aria-label="Medida de la matriz">
              <option value="pearson">Correlación (Pearson)</option>
              <option value="spearman">Correlación por orden (Spearman)</option>
            </select>
          </label>
        </div>
        <div class="cor-matriz-rejilla" id="cor-matriz" role="table" aria-label="Correlación de cada explicativa con las demás"></div>
        <p class="ayuda" id="cor-matriz-nota" style="margin:10px 0 0" hidden></p>
      </section>
      <section class="cor-cruzada">
        <h3>Correlación cruzada (con desfases)</h3>
        <div class="cor-controles">
          <label>Serie
            <select id="cor-serie" aria-label="Serie que se muestra en el gráfico"></select>
          </label>
          <label>Desfase máximo (puntos)
            <input type="number" id="cor-maxlag" min="1" max="200" step="1" aria-label="Desfase máximo en puntos">
          </label>
        </div>
        <div id="cor-grafica"></div>
      </section>
    </div>`;
  cor.ui = { raiz, falta: raiz.querySelector("#cor-falta"), faltaTexto: raiz.querySelector("#cor-falta-texto"), faltaIr: raiz.querySelector("#cor-falta-ir"), trabajo: raiz.querySelector("#cor-trabajo"), info: raiz.querySelector("#cor-info"), tabla: raiz.querySelector("#cor-tabla"), serie: raiz.querySelector("#cor-serie"), maxlag: raiz.querySelector("#cor-maxlag"), grafica: raiz.querySelector("#cor-grafica"),
    matriz: raiz.querySelector("#cor-matriz"), matrizNota: raiz.querySelector("#cor-matriz-nota"), medida: raiz.querySelector("#cor-medida") };
  cor.ui.medida.value = cor.medida;
  cor.ui.medida.addEventListener("change", () => { cor.medida = cor.ui.medida.value; pintarMatrizCorrelacion(); });
  cor.ui.serie.addEventListener("change", () => { cor.serieGrafica = cor.ui.serie.value; pintarCorrelacion(); });
  cor.ui.maxlag.addEventListener("change", () => {
    const v = parseInt(cor.ui.maxlag.value);
    cor.maxLag = Number.isInteger(v) ? Math.min(Math.max(v, 1), 200) : null;
    pintarCorrelacion();
  });
  cor.ui.tabla.addEventListener("click", (e) => {
    const boton = e.target.closest("[data-orden]");
    if (!boton) return;
    const columna = boton.dataset.orden;
    cor.orden = cor.orden.columna === columna ? { columna, sentido: -cor.orden.sentido } : { columna, sentido: columna === "nombre" ? 1 : -1 };
    pintarCorrelacion();
  });
  return raiz;
}

async function actualizarCorrelacion() {
  if (!cor.ui.tabla || !cor.ui.tabla.isConnected) return;
  const token = ++cor.token;
  guardarActiva();
  await Promise.all(series.map(asegurarDatos));
  if (token !== cor.token || !cor.ui.tabla.isConnected) return;
  imputacion.explicativas = imputacion.explicativas.filter((id) => id !== imputacion.explicada.serieId && series.some((x) => x.id === id));
  pintarCorrelacion();
}

function pintarCorrelacion() {
  const u = cor.ui;
  if (!u.tabla || !u.tabla.isConnected) return;
  const obj = objetivoDeExplicada();
  const faltaAlgo = !obj ? ["Primero elige la variable explicada.", "Elegir la variable explicada", "explicada"]
    : !explicativasElegidas().length ? ["Elige alguna variable explicativa para ver su correlación.", "Elegir las explicativas", "explicativas"] : null;
  u.falta.hidden = !faltaAlgo;
  u.trabajo.hidden = Boolean(faltaAlgo);
  if (faltaAlgo) {
    u.faltaTexto.textContent = faltaAlgo[0];
    u.faltaIr.textContent = faltaAlgo[1];
    u.faltaIr.onclick = () => irAPestanaImputacion(faltaAlgo[2]);
    return;
  }
  const observados = obj.n - obj.aImputar;
  u.info.textContent = `Variable explicada: ${nombreDe(obj.serie)}. Se usan solo los puntos en que las dos series tienen dato y que no has quitado a la explicada (la explicada tiene ${observados} de ${obj.n}).`;

  const todas = calcularCorrelaciones(obj);
  let filas = todas;
  const { columna, sentido } = cor.orden;
  if (columna) {
    const clave = { nombre: (f) => nombreDe(f.serie).toLowerCase(), r: (f) => (f.r === null ? -1 : Math.abs(f.r)), rho: (f) => (f.rho === null ? -1 : Math.abs(f.rho)), r2: (f) => (f.r2 === null ? -1 : f.r2), lag: (f) => (f.mejor ? Math.abs(f.mejor.r) : -1), n: (f) => f.n }[columna];
    filas = [...filas].sort((a, b) => (clave(a) < clave(b) ? -1 : clave(a) > clave(b) ? 1 : 0) * sentido);
  }

  const tabla = u.tabla;
  tabla.replaceChildren();
  const CABECERAS = [
    ["nombre", "Serie", "La variable explicativa."],
    ["r", "Correlación (Pearson)", "De −1 a +1: cuánto suben y bajan juntas en línea recta. Cerca de 0, no hay relación; negativa, cuando una sube la otra baja."],
    ["rho", "Correlación por orden (Spearman)", "Lo mismo, pero fijándose solo en el orden de los valores: no le afectan los valores extremos ni las curvas."],
    ["r2", "R² (parte que explica)", "La correlación (Pearson) al cuadrado: qué parte de lo que se mueve la explicada la explica esta serie."],
    ["lag", "Mejor desfase", "Los puntos de desfase con los que más se parecen la explicada y la explicativa (de la correlación cruzada). Positivo: la explicativa va por delante; negativo: va por detrás; 0: sin desfase."],
    ["n", "Puntos usados", "Puntos en que las dos series tienen dato y que no has quitado a la explicada."],
  ];
  for (const [id, texto, ayuda] of CABECERAS) {
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

  const celda = () => { const d = document.createElement("div"); d.setAttribute("role", "cell"); return d; };
  const numero = (v, clase = "") => {
    const d = celda();
    const valor = document.createElement("div");
    valor.className = "valor" + (v === null ? " sin" : "");
    valor.textContent = v === null ? "—" : formatoCor.format(v);
    d.append(valor);
    if (v !== null && clase !== "r2") {
      const barra = document.createElement("div");
      barra.className = "cor-barra";
      const relleno = document.createElement("i");
      relleno.className = v < 0 ? "neg" : "";
      relleno.style.left = v < 0 ? `${50 + v * 50}%` : "50%";
      relleno.style.width = `${Math.abs(v) * 50}%`;
      barra.append(relleno);
      d.append(barra);
    }
    return d;
  };
  for (const f of filas) {
    const nombre = celda();
    nombre.className = "nombre";
    nombre.append(crearPunto(f.serie.color), nombreDe(f.serie));
    tabla.append(nombre);

    const pearson = numero(f.r);
    const nota = document.createElement("small");
    nota.textContent = f.intervalo ? `intervalo 95 %: ${formatoCor.format(f.intervalo[0])} a ${formatoCor.format(f.intervalo[1])}`
      : f.r === null ? (f.n < 3 ? "muy pocos puntos" : "una de las dos series es constante") : "";
    if (nota.textContent) pearson.append(nota);
    tabla.append(pearson, numero(f.rho));

    const r2 = celda();
    const valor = document.createElement("div");
    valor.className = "valor" + (f.r2 === null ? " sin" : "");
    valor.textContent = f.r2 === null ? "—" : `${(f.r2 * 100).toFixed(0)} %`;
    r2.append(valor);
    if (f.r2 !== null) {
      const barra = document.createElement("div");
      barra.className = "cor-barra r2";
      const relleno = document.createElement("i");
      relleno.style.width = `${f.r2 * 100}%`;
      barra.append(relleno);
      r2.append(barra);
    }
    tabla.append(r2);

    const lag = celda();
    const valorLag = document.createElement("div");
    valorLag.className = "valor desfase" + (f.mejor ? "" : " sin");
    valorLag.textContent = f.mejor ? (f.mejor.k > 0 ? `+${f.mejor.k}` : String(f.mejor.k)) : "—";
    lag.append(valorLag);
    if (f.mejor) {
      valorLag.classList.toggle("cambia", f.mejor.k !== 0);
      const notaLag = document.createElement("small");
      notaLag.textContent = f.mejor.k === 0 ? `correlación ${formatoCor.format(f.mejor.r)}`
        : `${formatoCor.format(f.mejor.r)} (con desfase 0: ${f.r0 === null ? "—" : formatoCor.format(f.r0)})`;
      lag.append(notaLag);
    }
    tabla.append(lag);

    const puntos = celda();
    puntos.textContent = String(f.n);
    tabla.append(puntos);
  }
  pintarMatrizCorrelacion();
  pintarCruzada(obj, todas);
}

// ----- Gráfico de la correlación cruzada -----
async function pintarCruzada(obj, filas) {
  const u = cor.ui;
  if (!u.grafica || !u.grafica.isConnected) return;
  // selector: cada explicativa, o todas a la vez
  const opciones = [...filas.map((f) => [String(f.serie.id), nombreDe(f.serie)]), ...(filas.length > 1 ? [["todas", "Todas (líneas)"]] : [])];
  if (!opciones.some(([v]) => v === cor.serieGrafica)) cor.serieGrafica = opciones[0][0];
  u.serie.replaceChildren(...opciones.map(([valor, texto]) => new Option(texto, valor)));
  u.serie.value = cor.serieGrafica;
  u.maxlag.value = desfaseMaximo(obj);

  const c = colores();
  const maxLag = desfaseMaximo(obj);
  const elegidas = cor.serieGrafica === "todas" ? filas : filas.filter((f) => String(f.serie.id) === cor.serieGrafica);
  const trazas = [];
  for (const f of elegidas) {
    const x = f.cruz.map((d) => d.k), y = f.cruz.map((d) => d.r), n = f.cruz.map((d) => d.n);
    const plantilla = "desfase %{x}: <b>%{y:.2f}</b>  ·  %{customdata} puntos<extra>" + nombreDe(f.serie) + "</extra>";
    if (cor.serieGrafica === "todas") {
      trazas.push({ x, y, customdata: n, type: "scatter", mode: "lines+markers", name: nombreDe(f.serie), line: { color: colorDe(f.serie, c), width: 2 }, marker: { size: 5 }, hovertemplate: plantilla, connectgaps: false });
    } else {
      const mejor = f.mejor ? f.mejor.k : null;
      trazas.push({
        x, y, customdata: n, type: "bar", name: nombreDe(f.serie), hovertemplate: plantilla,
        marker: { color: y.map((v) => (v !== null && v < 0 ? c.series[3] : c.series[0])), // azul si es positiva y naranja si es negativa, como en la tabla
        opacity: x.map((k) => (k === mejor ? 1 : 0.5)), line: { color: c.ink, width: x.map((k) => (k === mejor ? 2 : 0)) } },
      });
    }
  }
  // línea del desfase 0 y límites del 95 % (lo que queda dentro puede ser casualidad)
  const n0 = Math.max(...elegidas.map((f) => (f.cruz.find((d) => d.k === 0) || { n: 0 }).n), 0);
  const limite = n0 > 3 ? 1.96 / Math.sqrt(n0) : null;
  const linea = (y, dash) => ({ type: "line", xref: "paper", x0: 0, x1: 1, yref: "y", y0: y, y1: y, line: { color: c.muted, width: 1, dash } });
  const formas = [{ type: "line", xref: "x", x0: 0, x1: 0, yref: "paper", y0: 0, y1: 1, line: { color: c.axis, width: 1 } }, linea(0, "solid")];
  if (limite !== null && limite < 1) formas.push(linea(limite, "dot"), linea(-limite, "dot"));
  const eje = (texto) => ({
    title: texto ? { text: texto, font: { color: c.muted, size: 12 }, standoff: 8 } : undefined,
    gridcolor: c.grid, gridwidth: 1, zeroline: false, linecolor: c.axis, tickfont: { color: c.muted, size: 11 }, ticks: "",
  });
  await Plotly.react(u.grafica, trazas, {
    paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)", font: { family: c.fuente, color: c.ink2 },
    margin: { t: 20, r: 16, b: 48, l: 56 }, shapes: formas, bargap: 0.25, hovermode: "closest",
    showlegend: cor.serieGrafica === "todas", legend: { orientation: "h", x: 0, y: 1.12, font: { color: c.ink2, size: 12 } },
    xaxis: { ...eje("Desfase (puntos)"), showgrid: false, showline: true, dtick: maxLag > 20 ? 5 : 1, range: [-maxLag - 0.6, maxLag + 0.6] },
    yaxis: { ...eje("Correlación"), range: [-1.05, 1.05], showline: false },
    hoverlabel: { bgcolor: c.surface, bordercolor: c.axis, font: { color: c.ink, family: c.fuente, size: 13 } },
  }, { responsive: true, displaylogo: false, displayModeBar: false });
}
// ----- Matriz de correlaciones entre las explicativas -----
// Sirve para detectar explicativas repetidas: si dos van casi iguales, meter las dos aporta poco. Se usan los puntos en
// que las dos series tienen dato (aquí no interviene la explicada, así que sus tramos quitados no cuentan).
const UMBRAL_PARECIDAS = 0.9;

function parejasEntre(a, b) {
  const x = a.datos.y, y = b.datos.y, xs = [], ys = [];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] === null || y[i] === null) continue;
    xs.push(x[i]);
    ys.push(y[i]);
  }
  return { xs, ys };
}

// celdas[i][j] = { r, n }: la correlación de la explicativa i con la j y los puntos usados
function matrizDeCorrelaciones(elegidas, medida) {
  const calcular = medida === "spearman" ? correlacionSpearman : correlacionPearson;
  return elegidas.map((a, i) => elegidas.map((b, j) => {
    if (i === j) return { r: 1, n: a.datos.y.filter((v) => v !== null).length };
    const { xs, ys } = parejasEntre(a, b);
    return { r: calcular(xs, ys), n: xs.length };
  }));
}

function pintarMatrizCorrelacion() {
  const u = cor.ui;
  if (!u.matriz || !u.matriz.isConnected) return;
  // la explicada va la primera (sin lo quitado: en la práctica no se conocería); detrás, las explicativas
  const obj = objetivoDeExplicada();
  const explicada = obj ? { ...obj.serie, datos: { y: obj.y.map((v, i) => (obj.quitado[i] ? null : v)) }, esExplicada: true } : null;
  const elegidas = [...(explicada ? [explicada] : []), ...explicativasElegidas().filter((x) => x.datos)];
  const rejilla = u.matriz;
  rejilla.replaceChildren();
  u.matrizNota.hidden = true;
  u.medida.disabled = elegidas.length < 2;
  if (elegidas.length < 2) {
    rejilla.style.gridTemplateColumns = "";
    const aviso = document.createElement("p");
    aviso.className = "ayuda";
    aviso.style.margin = "0";
    aviso.textContent = "Elige al menos una variable explicativa para ver cómo se relacionan entre sí.";
    rejilla.append(aviso);
    return;
  }
  const celdas = matrizDeCorrelaciones(elegidas, cor.medida);
  rejilla.style.gridTemplateColumns = `minmax(110px, 1.2fr) repeat(${elegidas.length}, minmax(62px, 1fr))`;

  const esquina = document.createElement("div");
  esquina.className = "esq";
  rejilla.append(esquina);
  elegidas.forEach((s, j) => {
    const cab = document.createElement("div");
    cab.className = "cab-col";
    cab.dataset.col = j;
    cab.title = nombreDe(s);
    cab.setAttribute("role", "columnheader");
    cab.textContent = nombreDe(s);
    cab.classList.toggle("explicada", Boolean(s.esExplicada));
    if (s.esExplicada) cab.title = `${nombreDe(s)} (variable explicada)`;
    rejilla.append(cab);
  });

  const parecidas = [];
  elegidas.forEach((fila, i) => {
    const cab = document.createElement("div");
    cab.className = "cab-fila";
    cab.dataset.fila = i;
    cab.setAttribute("role", "rowheader");
    cab.append(crearPunto(fila.color), nombreDe(fila));
    if (fila.esExplicada) {
      cab.classList.add("explicada");
      const marca = document.createElement("small");
      marca.textContent = "explicada";
      cab.append(marca);
    }
    rejilla.append(cab);
    elegidas.forEach((_, j) => {
      const { r, n } = celdas[i][j];
      const celda = document.createElement("div");
      celda.setAttribute("role", "cell");
      celda.dataset.fila = i;
      celda.dataset.col = j;
      celda.className = "celda" + (i === j ? " diagonal" : "");
      if (r === null) {
        celda.classList.add("sin");
        celda.textContent = "—";
        celda.title = n < 3 ? `${nombreDe(fila)} y ${nombreDe(elegidas[j])}: muy pocos puntos en común (${n})` : `${nombreDe(fila)} y ${nombreDe(elegidas[j])}: una de las dos series es constante`;
      } else {
        celda.textContent = formatoCor.format(r);
        if (i !== j) {
          const intensidad = Math.round(Math.abs(r) * 85);
          celda.style.background = `color-mix(in srgb, var(${r < 0 ? "--series-4" : "--series-1"}) ${intensidad}%, var(--surface))`;
          celda.title = `${nombreDe(fila)} y ${nombreDe(elegidas[j])}: ${formatoCor.format(r)} (${n} puntos)`;
          if (Math.abs(r) >= UMBRAL_PARECIDAS && !fila.esExplicada && !elegidas[j].esExplicada) {   // con la explicada, alta es lo bueno
            celda.classList.add("alta");
            if (j > i) parecidas.push([nombreDe(fila), nombreDe(elegidas[j]), r]);
          }
        } else {
          celda.title = nombreDe(fila);
        }
      }
      rejilla.append(celda);
    });
  });

  // al pasar el ratón por una celda se resaltan su fila y su columna
  rejilla.onmouseover = (e) => {
    const c = e.target.closest("[data-fila][data-col]");
    rejilla.querySelectorAll(".resaltada").forEach((x) => x.classList.remove("resaltada"));
    if (!c) return;
    rejilla.querySelectorAll(`[data-fila="${c.dataset.fila}"], [data-col="${c.dataset.col}"]`).forEach((x) => x.classList.add("resaltada"));
  };
  rejilla.onmouseleave = () => rejilla.querySelectorAll(".resaltada").forEach((x) => x.classList.remove("resaltada"));

  if (parecidas.length) {
    const lista = parecidas.slice(0, 6).map(([a, b, r]) => `${a} y ${b} (${formatoCor.format(r)})`).join("; ");
    u.matrizNota.textContent = `Muy parecidas entre sí (correlación de ${formatoCor.format(UMBRAL_PARECIDAS)} o más, en valor absoluto): ${lista}${parecidas.length > 6 ? "…" : ""}. Meter las dos aporta poco.`;
    u.matrizNota.hidden = false;
  }
}
