"use strict";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const estado = { evento: {}, codigo: "", yo: null, amigo: null, presupuesto: 25, moneda: "USD" };

// ---------------------------------------------------------------- utilidades

const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const limpiarCodigo = (c) => String(c || "").trim().toLowerCase();
const dinero = (n) => `$${Number(n).toFixed(Number(n) % 1 ? 2 : 0)}`;
const fechaCorta = (iso) => new Date(iso).toLocaleDateString("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const guardar = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} },
};

async function api(ruta, { metodo = "GET", datos } = {}) {
  const r = await fetch(`/api/${ruta}`, {
    method: metodo,
    headers: { "content-type": "application/json", "x-codigo": estado.codigo },
    body: datos ? JSON.stringify(datos) : undefined,
  });
  let cuerpo = null;
  try { cuerpo = await r.json(); } catch {}
  if (!r.ok) throw new Error(cuerpo?.error || "No se pudo conectar. Intenta de nuevo.");
  return cuerpo;
}

async function enviando(form, fn) {
  const btn = $("button:not([type=button])", form);
  if (btn) btn.disabled = true;
  try { await fn(); } finally { if (btn) btn.disabled = false; }
}

// ---------------------------------------------------------------- portada

function pintarEvento() {
  const ev = estado.evento || {};
  document.title = ev.nombre || "Secret Santa";
  $("#evento-nombre").textContent = ev.nombre || "Secret Santa";
  if (ev.mensaje) $("#evento-mensaje").textContent = ev.mensaje;
  if (ev.fecha) {
    const f = new Date(ev.fecha);
    $("#cal-dia").textContent = f.getDate();
    $("#cal-mes").textContent = f.toLocaleDateString("es", { month: "short" }).replace(".", "").toUpperCase();
    $("#tile-fecha").textContent =
      f.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" }) +
      " · " + f.toLocaleTimeString("es", { hour: "numeric", minute: "2-digit" });
  }
  if (ev.lugar) $("#tile-lugar").textContent = ev.lugar;
  estado.presupuesto = Number(ev.presupuesto) || 25;
  estado.moneda = ev.moneda || "USD";
  const lim = `${dinero(estado.presupuesto)} ${estado.moneda}`;
  $("#evento-presupuesto").textContent = lim;
  $$(".limite").forEach((e) => (e.textContent = lim));
  if (ev.fecha) iniciarCuenta(new Date(ev.fecha));
}

function iniciarCuenta(meta) {
  const caja = $("#cuenta");
  const tic = () => {
    let s = Math.max(0, Math.floor((meta - Date.now()) / 1000));
    if (s === 0) { caja.innerHTML = "<p>🎉 ¡Llegó el día del intercambio!</p>"; return false; }
    $("#cd-d").textContent = Math.floor(s / 86400); s %= 86400;
    $("#cd-h").textContent = Math.floor(s / 3600); s %= 3600;
    $("#cd-m").textContent = Math.floor(s / 60);
    $("#cd-s").textContent = s % 60;
    return true;
  };
  caja.hidden = false;
  if (tic()) { const id = setInterval(() => { if (!tic()) clearInterval(id); }, 1000); }
}

// ---------------------------------------------------------------- público

async function cargarPublico() {
  try {
    const r = await fetch("/api/publico", { cache: "no-store" });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    pintarJuegos(d.juegos);
    pintarMarcador(d.marcador);
    return d;
  } catch {
    $("#lista-juegos").innerHTML = `<p class="vacio">No se pudieron cargar los juegos ahora.</p>`;
    return null;
  }
}

// Avatar con la inicial y un color propio para cada nombre
const COLORES = [["#ff7a7f", "#c81f30"], ["#ffd76a", "#d9952a"], ["#7fd38a", "#2f8a3c"], ["#8fc7ff", "#3a78c9"],
  ["#f3a7ff", "#a24fc0"], ["#ffb27a", "#d2652a"], ["#9ee7dc", "#2e9a8a"], ["#ffffff", "#bfc5c0"]];
function avatar(nombre, chico = false) {
  let h = 0;
  for (const c of nombre) h = (h * 31 + c.codePointAt(0)) >>> 0;
  const [a, b] = COLORES[h % COLORES.length];
  const letra = [...nombre.trim()][0]?.toUpperCase() || "?";
  const oscuro = b === "#bfc5c0" ? "color:#173b25;text-shadow:none;" : "";
  return `<span class="avatar${chico ? " chico" : ""}" style="background:linear-gradient(145deg,${a},${b});${oscuro}" aria-hidden="true">${esc(letra)}</span>`;
}

function pintarJuegos(juegos) {
  const caja = $("#lista-juegos");
  if (!juegos.length) {
    caja.innerHTML = `<p class="vacio">Todavía nadie propone un juego. ¡Sé la primera persona!</p>`;
    return;
  }
  caja.innerHTML = juegos.map((j) => {
    const meta = [j.jugadores && `👥 ${esc(j.jugadores)}`, j.duracion && `⏱️ ${esc(j.duracion)}`].filter(Boolean).join(" · ");
    return `<article class="juego">
      <span class="tipo">${j.tipo === "interactivo" ? "🙌 Interactivo" : "🎲 De mesa"}</span>
      <h3>${esc(j.titulo)}</h3>
      ${j.descripcion ? `<p class="desc">${esc(j.descripcion)}</p>` : ""}
      ${meta ? `<p class="meta">${meta}</p>` : ""}
      ${j.premio ? `<p class="premio">🏆 <b>Premio:</b> ${esc(j.premio)}</p>` : ""}
      <p class="propone">${avatar(j.propone, true)}<span>Propuesto por <b>${esc(j.propone)}</b></span></p>
    </article>`;
  }).join("");
}

function pintarMarcador(filas) {
  const lista = $("#marcador");
  $("#num-personas").textContent = filas.length ? `${filas.length} personas` : "";
  if (!filas.length) { lista.innerHTML = `<li class="vacio">El organizador todavía no agrega participantes.</li>`; return; }
  const chip = (v, icono, texto) => `<span class="${v ? "si" : ""}" title="${texto}: ${v ? "listo" : "pendiente"}">${icono}</span>`;
  lista.innerHTML = filas.map((f) => {
    const hechos = [f.lista, f.juego, f.comprado].filter(Boolean).length;
    const sub = hechos === 3 ? "¡Todo listo! 🎉" : `${hechos} de 3 listos`;
    return `<li>
      ${avatar(f.nombre)}
      <div class="persona"><b>${esc(f.nombre)}</b><small>${sub}</small></div>
      <div class="estados">${chip(f.lista, "📝", "Lista")}${chip(f.juego, "🎲", "Juego")}${chip(f.comprado, "🎁", "Regalo")}</div>
    </li>`;
  }).join("");
}

// ---------------------------------------------------------------- entrar

async function entrar(codigo, silencioso = false) {
  const err = $("#error-entrar");
  err.textContent = "";
  estado.codigo = limpiarCodigo(codigo);
  if (!estado.codigo) return;
  try {
    const yo = await api("entrar", { metodo: "POST" });
    estado.yo = yo;
    estado.amigo = yo.amigo;
    guardar.set("santa-codigo", estado.codigo);
    mostrarPanel();
  } catch (e) {
    estado.codigo = "";
    guardar.del("santa-codigo");
    if (!silencioso) err.textContent = e.message;
  }
}

function salir() {
  guardar.del("santa-codigo");
  location.href = location.pathname;
}

function mostrarPanel() {
  $("#entrar").hidden = true;
  $("#panel").hidden = false;
  $("#mi-nombre").textContent = estado.yo.nombre;
  $("#comprado").checked = estado.yo.comprado;
  document.body.classList.add("con-panel");
  const hayAmigo = Boolean(estado.amigo);
  $("#sobre").hidden = $("#amigo-extra").hidden = $("#caja-comprado").hidden = !hayAmigo;
  $("#sin-sorteo").hidden = hayAmigo;
  $("#revelar-etiqueta").textContent = hayAmigo ? "Te toca regalarle a…" : "Tu amigo secreto";
  if (hayAmigo) {
    $("#amigo-nombre").textContent = estado.amigo.nombre;
    if (guardar.get(claveRevelado())) revelar();
    else $("#tile-amigo").textContent = "Toca el regalo para verlo";
    cargarAmigo();
  } else {
    $("#tile-amigo").textContent = "Aún no hay sorteo";
  }
  cargarMiLista();
  cargarBuzon();
  cargarMiJuego();
}

const claveRevelado = () => `santa-revelado-${estado.yo.id}-${estado.amigo.id}`;
function revelar() {
  $("#sobre").classList.add("abierto");
  $("#tile-amigo").textContent = estado.amigo.nombre;
  guardar.set(claveRevelado(), "1");
}

function cambiarTab(nombre) {
  $$(".pestanas button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === nombre)));
  $$(".tab").forEach((t) => (t.hidden = t.dataset.panel !== nombre));
  if (nombre === "buzon") cargarBuzon();
  guardar.set("santa-tab", nombre);
}

// ---------------------------------------------------------------- mi amigo secreto

async function cargarAmigo() {
  const lista = $("#deseos-amigo");
  try {
    const [deseos, hilo] = await Promise.all([
      api(`deseos?de=${estado.amigo.id}`),
      api(`hilo?para=${estado.amigo.id}`),
    ]);
    lista.innerHTML = deseos.items.length
      ? deseos.items.map((d) => `<li><span>${esc(d.texto)}${d.link ? ` · <a href="${esc(d.link)}" target="_blank" rel="noopener noreferrer">ver</a>` : ""}</span>${d.precio != null ? `<span class="monto">${dinero(d.precio)}</span>` : ""}</li>`).join("")
      : `<li class="vacio">${esc(estado.amigo.nombre)} todavía no escribe su lista. Puedes preguntarle algo mientras tanto.</li>`;
    pintarHiloSanta(hilo);
  } catch (e) {
    lista.innerHTML = `<li class="vacio">${esc(e.message)}</li>`;
  }
}

function pintarHiloSanta({ preguntas, pistas }) {
  $("#hilo-preguntas").innerHTML = preguntas.slice().reverse().map((q) => `<li>
      <div>❓ ${esc(q.texto)}</div>
      ${q.respuesta ? `<div class="resp">💬 ${esc(q.respuesta)}</div>` : `<div class="fecha">Esperando respuesta…</div>`}
    </li>`).join("");
  $("#hilo-pistas").innerHTML = pistas.slice().reverse().map((p) => `<li>🕵️ ${esc(p.texto)} <span class="fecha">· ${fechaCorta(p.creado)}</span></li>`).join("");
}

async function enviarAlAmigo(form, ruta) {
  await enviando(form, async () => {
    const input = form.elements.texto;
    try {
      await api(ruta, { metodo: "POST", datos: { para: estado.amigo.id, texto: input.value } });
      input.value = "";
      pintarHiloSanta(await api(`hilo?para=${estado.amigo.id}`));
    } catch (e) { alert(e.message); }
  });
}

// ---------------------------------------------------------------- mi lista

function filaDeseo(d = {}) {
  const nodo = $("#fila-deseo").content.firstElementChild.cloneNode(true);
  nodo.querySelector("[name=texto]").value = d.texto || "";
  nodo.querySelector("[name=precio]").value = d.precio ?? "";
  nodo.querySelector("[name=link]").value = d.link || "";
  nodo.querySelector(".quitar").onclick = () => { nodo.remove(); revisarBotonAgregar(); };
  nodo.querySelector("[name=precio]").oninput = (ev) => {
    ev.target.classList.toggle("mal", Number(ev.target.value) > estado.presupuesto);
  };
  $("#filas-lista").append(nodo);
  revisarBotonAgregar();
}
const revisarBotonAgregar = () => { $("#agregar-deseo").hidden = $$("#filas-lista .fila-deseo").length >= 5; };

async function cargarMiLista() {
  $("#filas-lista").innerHTML = "";
  try {
    const { items } = await api(`deseos?de=${estado.yo.id}`);
    (items.length ? items : [{}, {}, {}]).forEach(filaDeseo);
  } catch { [{}, {}, {}].forEach(filaDeseo); }
}

async function guardarLista(ev) {
  ev.preventDefault();
  const form = ev.currentTarget;
  const err = $("#error-lista"), ok = $("#ok-lista");
  err.textContent = ok.textContent = "";
  const items = $$("#filas-lista .fila-deseo").map((f) => ({
    texto: f.querySelector("[name=texto]").value,
    precio: f.querySelector("[name=precio]").value,
    link: f.querySelector("[name=link]").value,
  })).filter((i) => i.texto.trim());
  const caro = items.find((i) => i.precio !== "" && Number(i.precio) > estado.presupuesto);
  if (caro) { err.textContent = `"${caro.texto}" pasa del límite de ${dinero(estado.presupuesto)}. Elige algo más económico.`; return; }
  await enviando(form, async () => {
    try {
      await api("deseos", { metodo: "PUT", datos: { items } });
      ok.textContent = "¡Lista guardada! Tu Santa ya puede verla. 🎁";
      cargarPublico();
    } catch (e) { err.textContent = e.message; }
  });
}

// ---------------------------------------------------------------- buzón

async function cargarBuzon() {
  try {
    const { preguntas, pistas } = await api("buzon");
    const sinResponder = preguntas.filter((q) => !q.respuesta).length;
    $("#burbuja-buzon").hidden = !sinResponder;
    $("#burbuja-buzon").textContent = sinResponder;
    $("#buzon-preguntas").innerHTML = preguntas.length
      ? preguntas.slice().reverse().map((q) => `<li>
          <div>❓ ${esc(q.texto)} <span class="fecha">· ${fechaCorta(q.creado)}</span></div>
          ${q.respuesta
            ? `<div class="resp">💬 ${esc(q.respuesta)}</div>`
            : `<form class="pildora" data-id="${esc(q.id)}"><input name="respuesta" maxlength="280" placeholder="Tu respuesta…" required><button class="btn">Responder</button></form>`}
        </li>`).join("")
      : `<li class="vacio">Tu Santa aún no te ha preguntado nada.</li>`;
    $("#buzon-pistas").innerHTML = pistas.length
      ? pistas.slice().reverse().map((p) => `<li>🕵️ ${esc(p.texto)} <span class="fecha">· ${fechaCorta(p.creado)}</span></li>`).join("")
      : `<li class="vacio">Todavía no hay pistas.</li>`;
    $$("#buzon-preguntas form").forEach((f) => f.addEventListener("submit", responder));
  } catch (e) {
    $("#buzon-preguntas").innerHTML = `<li class="vacio">${esc(e.message)}</li>`;
  }
}

async function responder(ev) {
  ev.preventDefault();
  const form = ev.currentTarget;
  await enviando(form, async () => {
    try {
      await api("responder", { metodo: "POST", datos: { id: form.dataset.id, respuesta: form.elements.respuesta.value } });
      cargarBuzon();
    } catch (e) { alert(e.message); }
  });
}

// ---------------------------------------------------------------- mi juego

async function cargarMiJuego() {
  try {
    const j = await api("juego");
    const f = $("#form-juego");
    $("#borrar-juego").hidden = !j;
    if (!j) return;
    for (const k of ["titulo", "descripcion", "jugadores", "duracion", "premio"]) f.elements[k].value = j[k] || "";
    f.elements.tipo.value = j.tipo;
  } catch {}
}

async function guardarJuego(ev) {
  ev.preventDefault();
  const form = ev.currentTarget;
  const err = $("#error-juego"), ok = $("#ok-juego");
  err.textContent = ok.textContent = "";
  const datos = Object.fromEntries(new FormData(form));
  await enviando(form, async () => {
    try {
      await api("juego", { metodo: "PUT", datos });
      ok.textContent = "¡Tu juego ya aparece en la lista pública! 🎲";
      $("#borrar-juego").hidden = false;
      cargarPublico();
    } catch (e) { err.textContent = e.message; }
  });
}

async function borrarJuego() {
  if (!confirm("¿Retirar tu propuesta de juego?")) return;
  try {
    await api("juego", { metodo: "DELETE" });
    $("#form-juego").reset();
    $("#borrar-juego").hidden = true;
    $("#ok-juego").textContent = "Propuesta retirada.";
    cargarPublico();
  } catch (e) { $("#error-juego").textContent = e.message; }
}

// ---------------------------------------------------------------- inicio

async function iniciar() {
  const publico = await cargarPublico();
  if (!publico) {
    $("#error-entrar").textContent = "No se pudo conectar con el servidor. Intenta recargar la página.";
    return;
  }
  estado.evento = publico.evento;
  pintarEvento();

  if (!publico.hayParticipantes) {
    $("#form-entrar").hidden = true;
    $("#error-entrar").textContent = "El organizador todavía está preparando el juego. ¡Vuelve pronto!";
    return;
  }

  $("#form-entrar").addEventListener("submit", (ev) => {
    ev.preventDefault();
    enviando(ev.currentTarget, () => entrar($("#codigo").value));
  });
  $("#salir").onclick = salir;
  $$(".pestanas button").forEach((b) => (b.onclick = () => cambiarTab(b.dataset.tab)));
  $("#sobre").onclick = revelar;
  $("#comprado").onchange = async (ev) => {
    try { await api("comprado", { metodo: "PUT", datos: { valor: ev.target.checked } }); cargarPublico(); }
    catch (e) { ev.target.checked = !ev.target.checked; alert(e.message); }
  };
  $("#form-pregunta").addEventListener("submit", (ev) => { ev.preventDefault(); enviarAlAmigo(ev.currentTarget, "preguntas"); });
  $("#form-pista").addEventListener("submit", (ev) => { ev.preventDefault(); enviarAlAmigo(ev.currentTarget, "pistas"); });
  $("#agregar-deseo").onclick = () => filaDeseo();
  $("#form-lista").addEventListener("submit", guardarLista);
  $("#form-juego").addEventListener("submit", guardarJuego);
  $("#borrar-juego").onclick = borrarJuego;

  // Enlace personal ?c=CODIGO (se quita de la barra para que no quede a la vista)
  const params = new URLSearchParams(location.search);
  const delEnlace = params.get("c");
  if (delEnlace) history.replaceState(null, "", location.pathname);
  const codigo = delEnlace || guardar.get("santa-codigo");
  if (codigo) {
    await entrar(codigo, !delEnlace);
    const tab = guardar.get("santa-tab");
    if (estado.yo && tab) cambiarTab(tab);
  }
}

iniciar();
