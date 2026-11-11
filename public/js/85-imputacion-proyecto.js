// Imputación: cómo se guarda en un proyecto y cómo se reinicia al abrir otro.
// Al abrir otro proyecto o empezar uno nuevo se olvida lo que era solo de pantalla
function reiniciarExplicada() {
  exp.pila = [];
  exp.rehacer = [];
  exp.vista = null;
  exp.idMostrado = null;
  exp.azar.vista = [];
  exp.azar.abierto = false;
}

// Lo guardado en un proyecto -> estado. "mapa" traduce los id de serie guardados a los de ahora.
function imputacionDesdeGuardada(guardada, mapa) {
  const e = estadoImputacionVacio();
  const ex = guardada && guardada.explicada;
  if (ex && mapa[ex.serieId] !== undefined) {
    e.explicada.serieId = mapa[ex.serieId];
    e.explicada.quitados = (Array.isArray(ex.quitados) ? ex.quitados : [])
      .filter((t) => Array.isArray(t) && t.length === 2 && t.every((v) => Number.isInteger(v) && v >= 0))
      .map(([a, b]) => [Math.min(a, b), Math.max(a, b)]);
  }
  const nuevas = (guardada && Array.isArray(guardada.explicativas) ? guardada.explicativas : []).map((id) => mapa[id]);
  e.explicativas = [...new Set(nuevas.filter((id) => id !== undefined && id !== e.explicada.serieId))];
  // métodos de imputación elegidos y sus parámetros (solo los que existen)
  // combinaciones de la ventana multivariante: { id, explicativas } (explicativas null = todas las elegidas)
  const guardadas = guardada && Array.isArray(guardada.combinaciones) && guardada.combinaciones.length ? guardada.combinaciones : [{ id: 1, explicativas: guardada ? guardada.multivariante : null }];
  const usados = new Set();
  e.combinaciones = [];
  for (const c of guardadas.slice(0, 20)) {
    const id = Number.isInteger(c && c.id) && c.id > 0 && !usados.has(c.id) ? c.id : Math.max(0, ...usados) + 1;
    usados.add(id);
    const lista = Array.isArray(c && c.explicativas) ? [...new Set(c.explicativas.map((x) => mapa[x]).filter((x) => x !== undefined && e.explicativas.includes(x)))] : [];
    e.combinaciones.push({ id, explicativas: lista.length >= 2 && lista.length < e.explicativas.length ? lista : null });
  }
  // métodos elegidos en cada ventana ("sin", "solo:<serie>" y "multi:<combinación>"): solo los que existen y valen para esa ventana
  const guardados = guardada && guardada.metodos && !Array.isArray(guardada.metodos) && typeof guardada.metodos === "object" ? guardada.metodos : {};
  for (const [clave, lista] of Object.entries(guardados)) {
    const esSolo = clave.startsWith("solo:");
    const idSolo = esSolo ? mapa[Number(clave.slice(5))] : undefined;
    const idCombinacion = clave === "multi" ? e.combinaciones[0].id : clave.startsWith("multi:") ? Number(clave.slice(6)) : undefined;   // "multi" a secas es el formato anterior
    const esMulti = idCombinacion !== undefined && e.combinaciones.some((c) => c.id === idCombinacion);
    const existe = clave === "sin" || esMulti || (esSolo && idSolo !== undefined && e.explicativas.includes(idSolo));
    if (!existe || !Array.isArray(lista)) continue;
    const ids = METODOS_IMPUTACION.filter((m) => m.explicativas === (clave !== "sin") && lista.includes(m.id)).map((m) => m.id);
    if (ids.length) e.metodos[esSolo ? `solo:${idSolo}` : esMulti ? `multi:${idCombinacion}` : clave] = ids;
  }
  // parámetros de métodos (los de hot deck y serie donante, que ya no existen, se descartan)
  const p = (guardada && guardada.parametros) || {};
  e.parametros = PARAMETROS_IMPUTACION_INICIALES();
  for (const clave of ["k_movil", "k_movil_atras", "k_movil_pond", "k_movil_pond_atras"]) if (Number.isInteger(p[clave]) && p[clave] >= 1) e.parametros[clave] = p[clave];
  if (typeof p.quitar_tendencia === "boolean") e.parametros.quitar_tendencia = p.quitar_tendencia;
  if (Number.isInteger(p.grado_polinomica) && p.grado_polinomica >= 1 && p.grado_polinomica <= 5) e.parametros.grado_polinomica = p.grado_polinomica;
  return e;
}
