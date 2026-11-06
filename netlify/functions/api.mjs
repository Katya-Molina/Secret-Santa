// API del Secret Santa (Netlify Functions + Netlify Blobs).
//
// Participantes: entran con su código navideño (ej. "reno-canela-27").
// Administrador: entra con la contraseña de la variable de entorno ADMIN_CLAVE.
// Nunca se guarda quién le escribe preguntas o pistas a quién.

import { getStore } from "@netlify/blobs";
import { createHash, randomInt, randomUUID, timingSafeEqual } from "node:crypto";

export const config = { path: "/api/*" };

const MAX_DESEOS = 5;
const MAX_MENSAJES = 40;
const MAX_PARTICIPANTES = 60;

const PALABRAS = [
  "reno", "estrella", "galleta", "campana", "regalo", "trineo", "nieve", "copo", "pino", "esfera",
  "vela", "corona", "lazo", "baston", "dulce", "turron", "ponche", "chocolate", "bufanda", "gorro",
  "guante", "chimenea", "calcetin", "angel", "muerdago", "acebo", "villancico", "posada", "pinata",
  "canela", "jengibre", "malvavisco", "abeto", "lucero", "cometa", "cascabel", "tamal", "rompope",
  "chispa", "elfo", "mazapan", "polvoron", "pastorela", "nochebuena", "farol", "guirnalda",
];

const EVENTO_INICIAL = {
  nombre: "Secret Santa", fecha: "", lugar: "", presupuesto: 25, moneda: "USD", mensaje: "",
};

// ---------------------------------------------------------------- utilidades

const sha = (t) => createHash("sha256").update(String(t), "utf8").digest();
const normalizar = (c) => String(c || "").toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");
const texto = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const ahora = () => new Date().toISOString();

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

class ErrorApi extends Error {
  constructor(status, mensaje) { super(mensaje); this.status = status; }
}
const fallo = (status, mensaje) => { throw new ErrorApi(status, mensaje); };

const almacen = () => getStore({ name: "secret-santa", consistency: "strong" });
const leer = async (store, clave, porDefecto) => (await store.get(clave, { type: "json" })) ?? porDefecto;

async function leerCuerpo(req) {
  try { return await req.json(); } catch { fallo(400, "Datos inválidos."); }
}

async function cargarTodo(store) {
  const [evento, participantes, sorteo] = await Promise.all([
    leer(store, "evento", EVENTO_INICIAL),
    leer(store, "participantes", []),
    leer(store, "sorteo", null),
  ]);
  return { evento: { ...EVENTO_INICIAL, ...evento }, participantes, sorteo };
}

function nuevoCodigo(usados) {
  for (let i = 0; i < 500; i++) {
    const a = PALABRAS[randomInt(PALABRAS.length)];
    let b = PALABRAS[randomInt(PALABRAS.length)];
    if (a === b) continue;
    const codigo = `${a}-${b}-${randomInt(10, 100)}`;
    if (!usados.has(normalizar(codigo))) return codigo;
  }
  fallo(500, "No pude generar un código nuevo.");
}

// ---------------------------------------------------------------- sorteo

function mezclar(lista) {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sortear(participantes, evitarMutuos) {
  const ids = participantes.map((p) => p.id);
  const prohibidos = Object.fromEntries(ids.map((id) => [id, new Set()]));
  for (const p of participantes) {
    for (const otro of p.excluir || []) {
      if (prohibidos[otro]) { prohibidos[p.id].add(otro); prohibidos[otro].add(p.id); }
    }
  }
  const orden = mezclar(ids);
  const asignado = {};
  const usados = new Set();
  let pasos = 0;

  const puede = (da, recibe) =>
    recibe !== da && !usados.has(recibe) && !prohibidos[da].has(recibe) &&
    !(evitarMutuos && ids.length > 2 && asignado[recibe] === da);

  const paso = (i) => {
    if (++pasos > 200000) return false;
    if (i === orden.length) return true;
    const da = orden[i];
    for (const recibe of mezclar(ids)) {
      if (!puede(da, recibe)) continue;
      asignado[da] = recibe; usados.add(recibe);
      if (paso(i + 1)) return true;
      delete asignado[da]; usados.delete(recibe);
    }
    return false;
  };
  return paso(0) ? asignado : null;
}

// ---------------------------------------------------------------- autenticación

function quienSoy(req, participantes) {
  const codigo = normalizar(req.headers.get("x-codigo"));
  if (!codigo) fallo(401, "Falta tu código.");
  const yo = participantes.find((p) => normalizar(p.codigo) === codigo);
  if (!yo) fallo(401, "Ese código no existe. Revisa que esté bien escrito.");
  return yo;
}

function exigirAdmin(req) {
  const clave = process.env.ADMIN_CLAVE;
  if (!clave) fallo(503, "Falta configurar la contraseña de administración (variable ADMIN_CLAVE en Netlify).");
  const dada = req.headers.get("x-admin") || "";
  if (!timingSafeEqual(sha(dada), sha(clave))) fallo(401, "Contraseña incorrecta.");
}

// ---------------------------------------------------------------- validaciones

function validarDeseos(items, presupuesto) {
  if (!Array.isArray(items)) fallo(400, "La lista no es válida.");
  const limpios = [];
  for (const it of items.slice(0, MAX_DESEOS)) {
    const t = texto(it?.texto, 120);
    if (!t) continue;
    let precio = it?.precio;
    if (precio === "" || precio === null || precio === undefined) precio = null;
    else {
      precio = Math.round(Number(precio) * 100) / 100;
      if (!Number.isFinite(precio) || precio < 0) fallo(400, `El precio de "${t}" no es válido.`);
      if (precio > presupuesto) fallo(400, `"${t}" pasa del límite de $${presupuesto}. Elige algo más económico.`);
    }
    let link = texto(it?.link, 300);
    if (link && !/^https?:\/\//i.test(link)) link = `https://${link}`;
    limpios.push({ texto: t, precio, link });
  }
  return limpios;
}

async function progreso(store, participantes) {
  return Promise.all(participantes.map(async (p) => {
    const [deseos, juego, comprado] = await Promise.all([
      leer(store, `deseos/${p.id}`, null),
      leer(store, `juegos/${p.id}`, null),
      leer(store, `comprado/${p.id}`, null),
    ]);
    return { p, deseos, juego, comprado };
  }));
}

// Al repetir el sorteo o cambiar participantes, las preguntas y pistas dejan de tener sentido.
async function borrarMensajes(store, participantes) {
  await Promise.all(participantes.flatMap((p) => [store.delete(`preguntas/${p.id}`), store.delete(`pistas/${p.id}`)]));
}

// ---------------------------------------------------------------- rutas de administración

async function rutasAdmin(req, ruta, metodo, store) {
  exigirAdmin(req);
  const datos = await cargarTodo(store);
  const { participantes } = datos;
  const partes = ruta.split("/"); // admin / recurso / id

  const estado = async () => {
    const filas = await progreso(store, datos.participantes);
    return json({
      evento: datos.evento,
      sorteo: datos.sorteo ? { hecho: datos.sorteo.hecho } : null,
      participantes: filas.map(({ p, deseos, juego, comprado }) => ({
        id: p.id, nombre: p.nombre, codigo: p.codigo, excluir: p.excluir || [],
        lista: Boolean(deseos?.items?.length), juego: Boolean(juego), comprado: Boolean(comprado?.valor),
      })),
    });
  };

  if (partes[1] === "estado" && metodo === "GET") return estado();

  if (partes[1] === "evento" && metodo === "PUT") {
    const b = await leerCuerpo(req);
    const presupuesto = Number(b.presupuesto);
    if (!Number.isFinite(presupuesto) || presupuesto <= 0) fallo(400, "El presupuesto debe ser mayor que 0.");
    if (b.fecha && Number.isNaN(Date.parse(b.fecha))) fallo(400, "La fecha no es válida.");
    datos.evento = {
      nombre: texto(b.nombre, 60) || "Secret Santa",
      fecha: texto(b.fecha, 25),
      lugar: texto(b.lugar, 80),
      presupuesto: Math.round(presupuesto * 100) / 100,
      moneda: texto(b.moneda, 6).toUpperCase() || "USD",
      mensaje: texto(b.mensaje, 160),
    };
    await store.setJSON("evento", datos.evento);
    return estado();
  }

  if (partes[1] === "participantes" && metodo === "POST") {
    const b = await leerCuerpo(req);
    const nombres = String(b.nombres ?? b.nombre ?? "").split(/[,\n]/).map((n) => texto(n, 40)).filter(Boolean);
    if (!nombres.length) fallo(400, "Escribe al menos un nombre.");
    if (participantes.length + nombres.length > MAX_PARTICIPANTES) fallo(400, `El máximo es ${MAX_PARTICIPANTES} participantes.`);
    const existentes = new Set(participantes.map((p) => normalizar(p.nombre)));
    const usados = new Set(participantes.map((p) => normalizar(p.codigo)));
    for (const nombre of nombres) {
      if (existentes.has(normalizar(nombre))) fallo(400, `"${nombre}" ya está en la lista. Usa nombres distintos (ej. "Ana G." y "Ana M.").`);
      existentes.add(normalizar(nombre));
      const codigo = nuevoCodigo(usados);
      usados.add(normalizar(codigo));
      participantes.push({ id: randomUUID().slice(0, 8), nombre, codigo, excluir: [], creado: ahora() });
    }
    await store.setJSON("participantes", participantes);
    if (datos.sorteo) { datos.sorteo = null; await store.delete("sorteo"); await borrarMensajes(store, participantes); }
    return estado();
  }

  if (partes[1] === "participantes" && partes[2]) {
    const p = participantes.find((x) => x.id === partes[2]);
    if (!p) fallo(404, "No encontré a esa persona.");

    if (metodo === "PATCH") {
      const b = await leerCuerpo(req);
      if (b.nombre !== undefined) {
        const nombre = texto(b.nombre, 40);
        if (!nombre) fallo(400, "El nombre no puede quedar vacío.");
        if (participantes.some((x) => x.id !== p.id && normalizar(x.nombre) === normalizar(nombre))) fallo(400, "Ese nombre ya existe.");
        p.nombre = nombre;
      }
      if (b.nuevoCodigo) {
        p.codigo = nuevoCodigo(new Set(participantes.map((x) => normalizar(x.codigo))));
      }
      if (Array.isArray(b.excluir)) {
        const validos = new Set(participantes.map((x) => x.id));
        const nuevos = [...new Set(b.excluir)].filter((id) => validos.has(id) && id !== p.id);
        // la exclusión aplica en ambos sentidos
        for (const x of participantes) {
          if (x.id === p.id) continue;
          const tiene = (x.excluir || []).includes(p.id);
          const debe = nuevos.includes(x.id);
          if (debe && !tiene) x.excluir = [...(x.excluir || []), p.id];
          if (!debe && tiene) x.excluir = x.excluir.filter((id) => id !== p.id);
        }
        const cambio = JSON.stringify([...(p.excluir || [])].sort()) !== JSON.stringify([...nuevos].sort());
        p.excluir = nuevos;
        if (cambio && datos.sorteo) { datos.sorteo = null; await store.delete("sorteo"); await borrarMensajes(store, participantes); }
      }
      await store.setJSON("participantes", participantes);
      return estado();
    }

    if (metodo === "DELETE") {
      const restantes = participantes.filter((x) => x.id !== p.id)
        .map((x) => ({ ...x, excluir: (x.excluir || []).filter((id) => id !== p.id) }));
      await store.setJSON("participantes", restantes);
      await Promise.all(["deseos", "juegos", "comprado", "preguntas", "pistas"].map((k) => store.delete(`${k}/${p.id}`)));
      datos.participantes = restantes;
      if (datos.sorteo) { datos.sorteo = null; await store.delete("sorteo"); await borrarMensajes(store, restantes); }
      return estado();
    }
  }

  if (partes[1] === "sorteo" && metodo === "POST") {
    if (participantes.length < 3) fallo(400, "Se necesitan al menos 3 participantes.");
    const asignacion = sortear(participantes, true) || sortear(participantes, false);
    if (!asignacion) fallo(400, "Con esas exclusiones es imposible hacer el sorteo. Quita alguna exclusión e inténtalo de nuevo.");
    if (datos.sorteo) await borrarMensajes(store, participantes);
    datos.sorteo = { hecho: ahora(), asignacion };
    await store.setJSON("sorteo", datos.sorteo);
    return estado();
  }

  fallo(404, "Ruta no encontrada.");
}

// ---------------------------------------------------------------- rutas

async function manejar(req) {
  const url = new URL(req.url);
  const ruta = url.pathname.replace(/^\/api\/?/, "").replace(/\/$/, "");
  const metodo = req.method;
  const store = almacen();

  if (ruta === "admin" || ruta.startsWith("admin/")) return rutasAdmin(req, ruta, metodo, store);

  const { evento, participantes, sorteo } = await cargarTodo(store);
  const presupuesto = Number(evento.presupuesto) || 25;

  // Público: evento, juegos propuestos y marcador
  if (ruta === "publico" && metodo === "GET") {
    const filas = await progreso(store, participantes);
    return json({
      evento,
      sorteoHecho: Boolean(sorteo),
      hayParticipantes: participantes.length > 0,
      juegos: filas.filter((f) => f.juego).map((f) => ({ ...f.juego, propone: f.p.nombre }))
        .sort((a, b) => a.creado.localeCompare(b.creado)),
      marcador: filas.map((f) => ({
        nombre: f.p.nombre,
        lista: Boolean(f.deseos?.items?.length),
        juego: Boolean(f.juego),
        comprado: Boolean(f.comprado?.valor),
      })),
    });
  }

  const yo = quienSoy(req, participantes);
  const miAmigoId = sorteo?.asignacion?.[yo.id] || null;
  const miAmigo = participantes.find((p) => p.id === miAmigoId) || null;
  const exigirAmigo = (para) => {
    if (!sorteo) fallo(409, "El sorteo todavía no se ha hecho.");
    if (para !== miAmigoId) fallo(403, "Solo puedes escribirle a tu amigo secreto.");
  };

  if (ruta === "entrar" && metodo === "POST") {
    const comprado = await leer(store, `comprado/${yo.id}`, null);
    return json({
      id: yo.id, nombre: yo.nombre, comprado: Boolean(comprado?.valor),
      sorteo: sorteo ? sorteo.hecho : null,
      amigo: miAmigo ? { id: miAmigo.id, nombre: miAmigo.nombre } : null,
    });
  }

  // Lista de deseos: la tuya, o la de tu amigo secreto
  if (ruta === "deseos" && metodo === "GET") {
    const de = url.searchParams.get("de") || yo.id;
    if (de !== yo.id && de !== miAmigoId) fallo(403, "Solo puedes ver la lista de tu amigo secreto.");
    return json(await leer(store, `deseos/${de}`, { items: [], actualizado: null }));
  }
  if (ruta === "deseos" && metodo === "PUT") {
    const body = await leerCuerpo(req);
    const datos = { items: validarDeseos(body.items, presupuesto), actualizado: ahora() };
    await store.setJSON(`deseos/${yo.id}`, datos);
    return json(datos);
  }

  // Mi buzón: preguntas y pistas que me dejó mi Santa
  if (ruta === "buzon" && metodo === "GET") {
    const [preguntas, pistas] = await Promise.all([
      leer(store, `preguntas/${yo.id}`, []),
      leer(store, `pistas/${yo.id}`, []),
    ]);
    return json({ preguntas, pistas });
  }

  // Hilo con mi amigo secreto (solo su Santa lo ve)
  if (ruta === "hilo" && metodo === "GET") {
    const para = url.searchParams.get("para");
    exigirAmigo(para);
    const [preguntas, pistas] = await Promise.all([
      leer(store, `preguntas/${para}`, []),
      leer(store, `pistas/${para}`, []),
    ]);
    return json({ preguntas, pistas });
  }

  if ((ruta === "preguntas" || ruta === "pistas") && metodo === "POST") {
    const body = await leerCuerpo(req);
    const para = String(body.para || "");
    exigirAmigo(para);
    const t = texto(body.texto, 280);
    if (!t) fallo(400, "Escribe algo primero.");
    const clave = `${ruta}/${para}`;
    const lista = await leer(store, clave, []);
    if (lista.length >= MAX_MENSAJES) fallo(429, "Ya enviaste muchos mensajes. ¡Guarda algo de misterio!");
    lista.push(ruta === "preguntas"
      ? { id: randomUUID(), texto: t, creado: ahora(), respuesta: null, respondido: null }
      : { id: randomUUID(), texto: t, creado: ahora() });
    await store.setJSON(clave, lista);
    return json(lista);
  }

  if (ruta === "responder" && metodo === "POST") {
    const body = await leerCuerpo(req);
    const respuesta = texto(body.respuesta, 280);
    if (!respuesta) fallo(400, "Escribe tu respuesta.");
    const clave = `preguntas/${yo.id}`;
    const lista = await leer(store, clave, []);
    const q = lista.find((x) => x.id === body.id);
    if (!q) fallo(404, "No encontré esa pregunta.");
    q.respuesta = respuesta;
    q.respondido = ahora();
    await store.setJSON(clave, lista);
    return json(lista);
  }

  // Propuesta de juego (pública, con nombre)
  if (ruta === "juego" && metodo === "GET") return json(await leer(store, `juegos/${yo.id}`, null));
  if (ruta === "juego" && metodo === "PUT") {
    const body = await leerCuerpo(req);
    const titulo = texto(body.titulo, 80);
    if (!titulo) fallo(400, "Ponle nombre a tu juego.");
    const previo = await leer(store, `juegos/${yo.id}`, null);
    const juego = {
      titulo,
      tipo: body.tipo === "interactivo" ? "interactivo" : "mesa",
      descripcion: texto(body.descripcion, 500),
      jugadores: texto(body.jugadores, 40),
      duracion: texto(body.duracion, 40),
      premio: texto(body.premio, 120),
      creado: previo?.creado || ahora(),
      actualizado: ahora(),
    };
    await store.setJSON(`juegos/${yo.id}`, juego);
    return json(juego);
  }
  if (ruta === "juego" && metodo === "DELETE") {
    await store.delete(`juegos/${yo.id}`);
    return json({ ok: true });
  }

  if (ruta === "comprado" && metodo === "PUT") {
    const body = await leerCuerpo(req);
    await store.setJSON(`comprado/${yo.id}`, { valor: Boolean(body.valor), cuando: ahora() });
    return json({ comprado: Boolean(body.valor) });
  }

  fallo(404, "Ruta no encontrada.");
}

export default async (req) => {
  try {
    return await manejar(req);
  } catch (e) {
    if (e instanceof ErrorApi) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: "Algo salió mal. Intenta de nuevo en un momento." }, 500);
  }
};
