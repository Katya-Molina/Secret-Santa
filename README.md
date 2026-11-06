# 🎁 Secret Santa

Página para organizar el intercambio de regalos.

**Para el organizador** (`/admin`, con contraseña):
- Datos del evento: nombre, fecha, lugar, presupuesto y mensaje.
- Agregar participantes (uno o varios a la vez, separados por comas).
- Cada persona recibe un **código navideño fácil**, como `reno-canela-27`.
- Copiar el código, el enlace o un mensaje listo, o enviarlo directo por **WhatsApp**.
- Exclusiones: marcar quiénes no se pueden tocar entre sí (parejas, familia).
- **Hacer el sorteo con un botón.** Nadie se saca a sí mismo y se evita, si se puede, que dos personas se regalen mutuamente. Ni el organizador ve quién le tocó a quién.
- Ver el avance de cada persona: lista, juego y regalo comprado.

**Para los participantes** (página principal, con su código):
- Revelar a su amigo secreto tocando un regalo.
- **Lista de deseos** de hasta 5 ideas, con límite de **$25** por idea.
- **Buzón anónimo**: preguntarle cosas a su amigo secreto sin que sepa quién es.
- **Pistas misteriosas** para adivinar quién es su Santa.
- **Propuesta de juego** (de mesa o interactivo), visible para todos con su nombre y con la opción de aportar un regalo para el ganador.
- Cuenta regresiva y marcador de participantes.

## Cómo está hecho

| Parte | Tecnología |
|---|---|
| Página | HTML, CSS y JavaScript en `public/`, responsive |
| Panel del organizador | `public/admin.html` y `public/admin.js` |
| Servidor (sorteo, códigos, datos) | Netlify Functions en `netlify/functions/api.mjs` |
| Guardado de datos | Netlify Blobs (se activa solo, sin configurar base de datos) |
| Ilustraciones | Imágenes 3D con fondo transparente en `public/img/` |

---

## Probar en tu computadora

1. Instala las dependencias:
   ```bash
   npm install
   ```
2. Crea tu contraseña de organizador para pruebas:
   ```bash
   cp .env.ejemplo .env
   ```
   Abre `.env` y cambia `cambia-esta-clave` por la contraseña que quieras.
3. Arranca la página:
   ```bash
   npx netlify-cli dev
   ```
4. Abre `http://localhost:8888/admin`, entra con tu contraseña, agrega participantes y haz el sorteo.

Lo que guardes en tu computadora no pasa al sitio publicado.

## Publicar en Netlify

1. Sube el proyecto a GitHub (en VS Code: **Source Control → Publish to GitHub**, repositorio privado). El archivo `.env` no se sube; ya está en `.gitignore`.
2. En [app.netlify.com](https://app.netlify.com): **Add new project → Import an existing project → GitHub** y elige el repositorio. Deja el *build command* vacío; *publish directory* `public`. Pulsa **Deploy**.
3. **Crea la contraseña de organizador en Netlify:** ve a **Project configuration → Environment variables → Add a variable**.
   - Key: `ADMIN_CLAVE`
   - Value: tu contraseña
4. Vuelve a publicar para que tome la contraseña: **Deploys → Trigger deploy → Deploy project**.
5. Cambia el nombre del sitio en **Project configuration → Change project name** si quieres una dirección más bonita.
6. Entra a `https://tu-sitio.netlify.app/admin` y organiza el juego.

## Organizar el juego

1. En `/admin`, llena los **datos del evento** y guarda.
2. **Agrega a los participantes.** Si hay parejas, ábrelas en "No se pueden tocar entre sí".
3. Pulsa **Hacer el sorteo**.
4. Envía a cada persona su código con el botón de **WhatsApp** o **Copiar mensaje**.

Detalles importantes:
- **Los códigos no cambian al repetir el sorteo.** Solo cambia a quién le toca a cada quien.
- **Agregar o quitar personas, o cambiar exclusiones, anula el sorteo** y hay que repetirlo. También se borran las preguntas y pistas, porque los amigos secretos cambian. Las listas de deseos y los juegos se conservan.
- **Si alguien comparte su código por error,** usa **Nuevo código** en su fila; el anterior deja de funcionar.

## Personalizar

- **Colores**: variables al inicio de `public/estilos.css`.
- **Palabras de los códigos**: lista `PALABRAS` al inicio de `netlify/functions/api.mjs`.
- **Límites** (5 ideas por lista, 40 mensajes, 60 participantes): al inicio de `netlify/functions/api.mjs`.
- **Ilustraciones**: en `public/img/`. Si vienen de un sitio de stock, revisa que la licencia permita usarlas en una página publicada.
