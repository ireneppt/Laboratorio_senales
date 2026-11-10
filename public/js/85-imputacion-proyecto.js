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
  // métodos elegidos en cada ventana ("sin", "todas" y "solo:<serie>"): solo los que existen y valen para esa ventana
  const guardados = guardada && guardada.metodos && !Array.isArray(guardada.metodos) && typeof guardada.metodos === "object" ? guardada.metodos : {};
  for (const [clave, lista] of Object.entries(guardados)) {
    const esSolo = clave.startsWith("solo:");
    const idSolo = esSolo ? mapa[Number(clave.slice(5))] : undefined;
    const existe = clave === "sin" || clave === "todas" || (esSolo && idSolo !== undefined && e.explicativas.includes(idSolo));
    if (!existe || !Array.isArray(lista)) continue;
    const ids = METODOS_IMPUTACION.filter((m) => m.explicativas === (clave !== "sin") && lista.includes(m.id)).map((m) => m.id);
    if (ids.length) e.metodos[esSolo ? `solo:${idSolo}` : clave] = ids;
  }
  const p = (guardada && guardada.parametros) || {};
  const donante = p.donante === null || p.donante === undefined ? undefined : mapa[p.donante];
  e.parametros = {
    k: Number.isInteger(p.k) ? Math.min(Math.max(p.k, 1), 50) : 1,
    donante: donante !== undefined && donante !== e.explicada.serieId ? donante : null,
    escalar: p.escalar === true,
  };
  return e;
}
