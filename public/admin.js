"use strict";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

let clave = "";
let datos = null; // último estado del servidor

const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sesion = {
  get: () => { try { return sessionStorage.getItem("santa-admin") || ""; } catch { return ""; } },
  set: (v) => { try { sessionStorage.setItem("santa-admin", v); } catch {} },
  del: () => { try { sessionStorage.removeItem("santa-admin"); } catch {} },
};

async function api(ruta, metodo = "GET", cuerpo) {
  const r = await fetch(`/api/admin/${ruta}`, {
    method: metodo,
    headers: { "content-type": "application/json", "x-admin": clave },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  let d = null;
  try { d = await r.json(); } catch {}
  if (!r.ok) {
    const e = new Error(d?.error || "No se pudo conectar. Intenta de nuevo.");
    e.status = r.status;
    throw e;
  }
  return d;
}

let temporizador;
function avisar(texto) {
  const a = $("#aviso");
  a.textContent = texto;
  a.hidden = false;
  clearTimeout(temporizador);
  temporizador = setTimeout(() => (a.hidden = true), 2200);
}

async function copiar(texto, mensaje = "¡Copiado!") {
  try {
    await navigator.clipboard.writeText(texto);
  } catch {
    const t = document.createElement("textarea");
    t.value = texto; document.body.append(t); t.select();
    try { document.execCommand("copy"); } catch {}
    t.remove();
  }
  avisar(mensaje);
}

async function enviando(boton, fn) {
  if (boton) boton.disabled = true;
  try { await fn(); } finally { if (boton) boton.disabled = false; }
}

// Avatar con la inicial (mismos colores que la página principal)
const COLORES = [["#ff7a7f", "#c81f30"], ["#ffd76a", "#d9952a"], ["#7fd38a", "#2f8a3c"], ["#8fc7ff", "#3a78c9"],
  ["#f3a7ff", "#a24fc0"], ["#ffb27a", "#d2652a"], ["#9ee7dc", "#2e9a8a"], ["#ffffff", "#bfc5c0"]];
function avatar(nombre) {
  let h = 0;
  for (const c of nombre) h = (h * 31 + c.codePointAt(0)) >>> 0;
  const [a, b] = COLORES[h % COLORES.length];
  const oscuro = b === "#bfc5c0" ? "color:#173b25;text-shadow:none;" : "";
  return `<span class="avatar" style="background:linear-gradient(145deg,${a},${b});${oscuro}" aria-hidden="true">${esc([...nombre.trim()][0]?.toUpperCase() || "?")}</span>`;
}

const fechaCorta = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("es", { day: "numeric", month: "long" });

const enlace = (p) => `${location.origin}/?c=${encodeURIComponent(p.codigo)}`;
function mensaje(p) {
  const ev = datos.evento;
  const fecha = ev.fecha
    ? `\n📅 ${new Date(ev.fecha).toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" })}`
    : "";
  return `🎅 ¡Hola ${p.nombre}! Ya estás en el ${ev.nombre}.${fecha}\n\n` +
    `🔑 Tu código secreto es: *${p.codigo}*\n` +
    `👉 Entra aquí: ${enlace(p)}\n\n` +
    `Ahí verás a quién te toca regalarle, puedes escribir tu lista de deseos (máximo $${ev.presupuesto} ${ev.moneda}) y proponer un juego. ` +
    (ev.fechaLimite ? `\n\n⏰ Tienes hasta el *${fechaCorta(ev.fechaLimite)}* para dejar tu lista de deseos y tu juego.\n\n` : "") +
    `No le compartas tu código a nadie 🤫`;
}

// ---------------------------------------------------------------- pintar

function pintar(d) {
  datos = d;
  const ev = d.evento;
  const n = d.participantes.length;
  $("#admin-titulo").textContent = ev.nombre;
  $("#r-personas").textContent = n;
  $("#r-sorteo").textContent = d.sorteo ? "Hecho ✅" : "Pendiente";
  $("#r-listas").textContent = d.participantes.filter((p) => p.lista).length;
  $("#r-juegos").textContent = d.participantes.filter((p) => p.juego).length;

  // Evento
  const f = $("#form-evento");
  if (!f.dataset.editando) {
    f.elements.nombre.value = ev.nombre;
    f.elements.fecha.value = (ev.fecha || "").slice(0, 16);
    f.elements.lugar.value = ev.lugar;
    f.elements.presupuesto.value = ev.presupuesto;
    f.elements.moneda.value = ev.moneda;
    f.elements.mensaje.value = ev.mensaje;
    f.elements.fechaLimite.value = ev.fechaLimite || "";
  }

  // Sorteo
  const btn = $("#hacer-sorteo");
  if (n < 3) {
    $("#sorteo-texto").textContent = `Agrega al menos 3 participantes para poder sortear (llevas ${n}).`;
    btn.disabled = true;
    btn.textContent = "🎲 Hacer el sorteo";
  } else if (!d.sorteo) {
    $("#sorteo-texto").textContent = `Todo listo para sortear a ${n} personas. Respeta las exclusiones y evita, si se puede, que dos personas se regalen entre sí.`;
    btn.disabled = false;
    btn.textContent = "🎲 Hacer el sorteo";
  } else {
    const cuando = new Date(d.sorteo.hecho).toLocaleString("es", { day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });
    $("#sorteo-texto").textContent = `✅ Sorteo hecho el ${cuando}. Cada persona ya puede ver a quién le toca con su código.`;
    btn.disabled = false;
    btn.textContent = "🔁 Repetir el sorteo";
  }

  // Participantes
  const lista = $("#lista-admin");
  if (!n) {
    lista.innerHTML = `<li class="vacio">Todavía no hay participantes. Agrega el primero arriba.</li>`;
    return;
  }
  const abiertos = new Set($$("details.exclusiones[open]").map((x) => x.dataset.id));
  lista.innerHTML = d.participantes.map((p) => {
    const hechos = [p.lista, p.juego, p.comprado].filter(Boolean).length;
    const otros = d.participantes.filter((x) => x.id !== p.id);
    const wa = `https://wa.me/?text=${encodeURIComponent(mensaje(p))}`;
    return `<li class="fila-admin" data-id="${esc(p.id)}">
      <div class="fila-top">
        ${avatar(p.nombre)}
        <div class="persona"><b>${esc(p.nombre)}</b><small title="Lista ${p.lista ? "lista" : "pendiente"} · Juego ${p.juego ? "propuesto" : "pendiente"} · Regalo ${p.comprado ? "comprado" : "pendiente"}">${hechos === 3 ? "¡Todo listo! 🎉" : `${hechos} de 3 listos`}</small></div>
        <div class="estados">${[[p.lista, "📝"], [p.juego, "🎲"], [p.comprado, "🎁"]].map(([v, i]) => `<span class="${v ? "si" : ""}">${i}</span>`).join("")}</div>
        <button class="icono" data-acc="borrar" title="Eliminar a ${esc(p.nombre)}" aria-label="Eliminar a ${esc(p.nombre)}">🗑</button>
      </div>
      <div class="codigo-caja">
        <code>${esc(p.codigo)}</code>
        <button class="btn-mini" data-acc="copiar-codigo">Copiar código</button>
      </div>
      <div class="acciones-fila">
        <a class="chip-btn verde" href="${wa}" target="_blank" rel="noopener">💬 Enviar por WhatsApp</a>
        <button class="chip-btn" data-acc="copiar-mensaje">📋 Copiar mensaje</button>
        <button class="chip-btn" data-acc="copiar-enlace">🔗 Copiar enlace</button>
        <button class="chip-btn" data-acc="codigo">🔄 Nuevo código</button>
      </div>
      ${otros.length ? `<details class="exclusiones" data-id="${esc(p.id)}" ${abiertos.has(p.id) ? "open" : ""}>
        <summary>🚫 No se pueden tocar entre sí ${p.excluir.length ? `<span class="burbuja">${p.excluir.length}</span>` : ""}</summary>
        <div class="checks">
          ${otros.map((o) => `<label><input type="checkbox" value="${esc(o.id)}" ${p.excluir.includes(o.id) ? "checked" : ""}><span>${esc(o.nombre)}</span></label>`).join("")}
        </div>
        <p class="suave nota-chica">Úsalo para parejas o familia. Aplica en ambos sentidos.</p>
      </details>` : ""}
    </li>`;
  }).join("");
}

const avisoSorteo = "Ya hiciste el sorteo. Este cambio lo anulará y tendrás que repetirlo; también se borran las preguntas y pistas enviadas. Los códigos no cambian. ¿Continuar?";

// ---------------------------------------------------------------- acciones

async function entrar(c, silencioso = false) {
  clave = c;
  $("#error-admin").textContent = "";
  try {
    const d = await api("estado");
    sesion.set(clave);
    $("#entrar-admin").hidden = true;
    $("#admin").hidden = false;
    pintar(d);
  } catch (e) {
    clave = "";
    sesion.del();
    if (!silencioso) $("#error-admin").textContent = e.message;
  }
}

async function agregar(ev) {
  ev.preventDefault();
  const form = ev.currentTarget;
  const err = $("#error-agregar");
  err.textContent = "";
  if (datos.sorteo && !confirm(avisoSorteo)) return;
  await enviando($("button", form), async () => {
    try {
      pintar(await api("participantes", "POST", { nombres: form.elements.nombres.value }));
      form.reset();
      avisar("¡Participantes agregados! 🎄");
    } catch (e) { err.textContent = e.message; }
  });
}

async function accionFila(ev) {
  const el = ev.target.closest("[data-acc]");
  if (!el) return;
  const id = el.closest(".fila-admin").dataset.id;
  const p = datos.participantes.find((x) => x.id === id);
  const acc = el.dataset.acc;

  if (acc === "copiar-codigo") return copiar(p.codigo, `Código de ${p.nombre} copiado`);
  if (acc === "copiar-enlace") return copiar(enlace(p), `Enlace de ${p.nombre} copiado`);
  if (acc === "copiar-mensaje") return copiar(mensaje(p), `Mensaje para ${p.nombre} copiado`);

  if (acc === "codigo") {
    if (!confirm(`¿Darle un código nuevo a ${p.nombre}? El anterior dejará de funcionar.`)) return;
    await enviando(el, async () => {
      try { pintar(await api(`participantes/${id}`, "PATCH", { nuevoCodigo: true })); avisar("Código nuevo listo"); }
      catch (e) { alert(e.message); }
    });
  }

  if (acc === "borrar") {
    const extra = datos.sorteo ? "\n\nTambién se anulará el sorteo y tendrás que repetirlo." : "";
    if (!confirm(`¿Eliminar a ${p.nombre}? Se borrarán su lista, su juego y sus mensajes.${extra}`)) return;
    await enviando(el, async () => {
      try { pintar(await api(`participantes/${id}`, "DELETE")); avisar(`${p.nombre} eliminado`); }
      catch (e) { alert(e.message); }
    });
  }
}

async function cambiarExclusion(ev) {
  const check = ev.target;
  if (check.type !== "checkbox") return;
  const det = check.closest("details");
  const id = det.dataset.id;
  if (datos.sorteo && !confirm(avisoSorteo)) { check.checked = !check.checked; return; }
  const excluir = $$("input:checked", det).map((c) => c.value);
  try { pintar(await api(`participantes/${id}`, "PATCH", { excluir })); }
  catch (e) { check.checked = !check.checked; alert(e.message); }
}

async function sortear() {
  const btn = $("#hacer-sorteo");
  $("#error-sorteo").textContent = $("#ok-sorteo").textContent = "";
  if (datos.sorteo && !confirm("¿Repetir el sorteo? Todos tendrán un amigo secreto nuevo y se borrarán las preguntas y pistas. Los códigos no cambian.")) return;
  await enviando(btn, async () => {
    try {
      pintar(await api("sorteo", "POST"));
      $("#ok-sorteo").textContent = "¡Sorteo listo! 🎉 Ya puedes enviar los códigos.";
    } catch (e) { $("#error-sorteo").textContent = e.message; }
  });
}

async function guardarEvento(ev) {
  ev.preventDefault();
  const form = ev.currentTarget;
  $("#error-evento").textContent = $("#ok-evento").textContent = "";
  await enviando($("button", form), async () => {
    try {
      delete form.dataset.editando;
      pintar(await api("evento", "PUT", Object.fromEntries(new FormData(form))));
      $("#ok-evento").textContent = "Datos guardados ✅";
    } catch (e) { $("#error-evento").textContent = e.message; }
  });
}

// ---------------------------------------------------------------- inicio

$("#form-admin").addEventListener("submit", (ev) => {
  ev.preventDefault();
  enviando($("button", ev.currentTarget), () => entrar($("#clave").value));
});
$("#salir-admin").onclick = () => { sesion.del(); location.reload(); };
$("#form-agregar").addEventListener("submit", agregar);
$("#lista-admin").addEventListener("click", accionFila);
$("#lista-admin").addEventListener("change", cambiarExclusion);
$("#hacer-sorteo").onclick = sortear;
$("#form-evento").addEventListener("submit", guardarEvento);
$("#form-evento").addEventListener("input", (ev) => (ev.currentTarget.dataset.editando = "1"));

// Actualiza el progreso cada minuto mientras el panel está abierto
setInterval(async () => {
  if (!clave || document.hidden) return;
  try { pintar(await api("estado")); } catch {}
}, 60000);

const guardada = sesion.get();
if (guardada) entrar(guardada, true);
