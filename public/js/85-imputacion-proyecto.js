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
  return e;
}
