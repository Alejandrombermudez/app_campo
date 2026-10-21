# app_campo — PWA de Campo (productiva)

React + Vite + TypeScript + Dexie (offline-first) + Supabase anon (sin login). Es la app **productiva**
de la etapa Campo del proceso de Siembra/Restauración. Reemplazó a [`familias-res/`](../familias-res/CLAUDE.md),
que fue la prueba de concepto y quedó desactualizada.

**Contexto completo (traspaso entre sesiones):** [`CONTEXTO_APP_CAMPO.md`](CONTEXTO_APP_CAMPO.md) — léelo
antes de tocar el módulo SIG o el flujo de sincronización, tiene el detalle de qué se hizo, qué falta y decisiones
que no se deben re-litigar sin el usuario.
**Arquitectura de datos del ecosistema:** `../Intranet-AE/docs/ARQUITECTURA_DATOS.md`.

## Qué hace

**Regla vigente desde `migration_campo_primero.sql` (2026-10-20, decisión del usuario; rama
`campo-primero-ldh`, migración sin correr):** todo predio que jurídica registra (expediente `activo`) se ve
en esta app de una vez, sin «Enviar a Campo» y sin exigir cartografía. La vista deduce el flujo:
- **`sig_primero`** — el SIG le propuso sitios que siguen en juego: campo los verifica y corrige.
- **`campo_primero`** — no hay propuesta: en terreno se dibujan el **límite del predio** y los **sitios de
  siembra** desde cero y el SIG confirma después. Los sitios que dibuja campo no le cambian el flujo.

La app **nunca** crea predios: el predio existe en jurídica, lo que se dibuja son geometrías por revisiones.
Antes de la migración la vista vieja sigue mandando (solo predios en etapa campo con sitios del SIG) y la
app lo tolera: sin la columna `flujo_campo` todo se trata como `sig_primero`.

**Capas de apoyo** (`geo.capas_apoyo`, RPC `geo.capas_apoyo_campo()`, una sola llamada por descarga): guía
de referencia en el mapa —p. ej. las áreas elegibles de Ley del Árbol y carbono del SHP de Lácteos del
Hogar—. No son sitios: no se tocan, no se evalúan, no se sincronizan. Viven en la copia de
`prediosHabilitados` (no en la familia) y el módulo SIG las pinta debajo de todo, con botón para ocultarlas.
Si la BD no tiene la migración, simplemente no hay capas.

Tres módulos por predio: **SIG** (verificar/corregir zonas de siembra en terreno, SIG II) · **Evaluación de Campo**
(AE-CAMPO-001) · **Encuesta Predial** (socioeconómica).

## Cómo lee/escribe datos (sin login, anon)

- Lee `core.v_predios_campo` — vista angosta, la **única** puerta de lectura de `core.*` para anon.
- Lee geometrías vía RPC `geo.zonas_de_predio`.
- Escribe correcciones de zona **solo** vía RPC `geo.revisar_zona` (SECURITY DEFINER, idempotente por `local_id`) — nunca UPDATE/INSERT directo sobre `geo.zonas`.
- Identidad (nombre, municipio, propietario...) **nunca se duplica** en `siembra.familias`/`evaluaciones_campo` — se lee por JOIN desde `core` a través de la vista.

Si necesitas exponer un dato nuevo del núcleo a esta app, amplía `core.v_predios_campo` (o un RPC), no agregues columnas de identidad sueltas a `siembra.*`.

## El número de zonas del formulario biofísico es siempre derivado, nunca preguntado

`Evaluacion/index.tsx` repite las secciones §3-§5 una vez por zona **vigente** (`reconciliarZonas` en
`types/evaluacion.ts`, contra `zonasVigentes()` de `lib/geo.ts`) — se recalcula cada vez que se vuelve a
`FamiliaDetail` o se abre la evaluación directamente, no queda fijo en lo que había al crearla. Si una zona
ya tiene datos capturados y se descarta después en el SIG, se conserva marcada `descartada` (no se pierde
el trabajo); si no tenía datos, se omite. Existe un módulo legacy (`src/pages/Predio/`, sin botón de acceso
en la UI) que sí tiene un dropdown manual de "número de zonas" y fabrica zonas en blanco — no se tocó, ver
`CONTEXTO_APP_CAMPO.md` punto 10 de la lista de pendientes.

## "Actualizar desde el SIG" (2026-08-05) — el snapshot se refresca sin destruir nada

Un predio se descarga como **snapshot** (`familia.zonas_sig` / `zonas_finca`); si el SIG rehace el límite
o las zonas después, la app no se entera sola. El botón vive en `components/ui/ActualizarSig.tsx` sobre
`lib/actualizarSig.ts` y siempre son **dos pasos**: `consultarCambiosSig` (solo lee y arma el diff — un
toque por error no escribe nada) y `aplicarCambiosSig` (escribe, ya confirmado el resumen). Sin señal el
botón está deshabilitado; con señal falsa (antena sin datos) la consulta falla con timeout de 20 s y no
escribe.

El servidor tampoco destruye: cada subida del SIG es un **lote versionado** (`geo.zonas_lote`, backup 1,
2, 3...) y lo anterior queda `vigente=false`, no borrado — `migration_geo_versionado.sql`. Por eso
`geo.revisar_zona` ya nunca falla porque el SIG haya cambiado algo: si la zona fue retirada la **revive**,
y si el SIG la borró de raíz la **recrea** con la geometría de respaldo que manda el propio celular
(`p_geojson_respaldo`, ver `syncPendingRevisiones`). El RPC puede devolver un `zona_id` distinto al
enviado: ese es el bueno, y `remapearZonaId` reapunta familia + evaluación + revisiones.

Invariantes que **no** se pueden romper al tocar esto:
- `fetchZonasPredio` **lanza** si la consulta falla — nunca devuelve `[]` por un error de red. Una lista
  vacía significa "el SIG no tiene zonas" y sobrescribir el snapshot con eso borraría el trabajo de campo.
  Por lo mismo `refreshPrediosHabilitados` no hace `clear()` si la descarga se cayó a mitad, y aplicar se
  bloquea si el SIG responde cero zonas.
- Aplicar solo reemplaza geometrías + identidad en `db.familias`. Jamás toca `revisiones`, `evaluaciones`,
  `encuestas` ni `photos`.
- Una zona que desaparece del SIG con trabajo hecho encima **no se borra**: `zonasVigentes` la conserva
  visible (`retirada_del_sig`) y `reconciliarZonas` mantiene sus datos marcados `descartada`.

## Una geometría corregida en terreno no se pierde por una acción posterior

Bug real reportado desde campo (2026-08-06, arreglado el 11): se corrige el polígono, se guarda, y al
pulsar **"Confirmar"** —que se lee como "confirmo mi corrección"— la zona volvía a su forma original.
`confirmarZona()` manda `geojson: null` y `upsertRevision` sobrescribía la revisión pendiente con todo lo
recibido, nulos incluidos; como `zonasVigentes` resuelve `rev.geojson ?? z.geojson`, el mapa caía de vuelta
al polígono del SIG. Y al sincronizar viajaba `confirmada`, que en el servidor solo pone `estado='validada'`
sin escribir geometría: la corrección se perdía también en la nube.

La fusión vive ahora en `fusionarRevision` (`types/revision.ts`), función pura: la última acción manda,
**pero una geometría corregida nunca se pierde por una acción posterior que no traiga geometría propia**.
Confirmar una zona ya corregida la deja en `modificada` — la única acción con la que `geo.revisar_zona`
escribe la geometría nueva. En la UI, una zona con corrección local pendiente muestra "Ya corregida"
(deshabilitado) en vez de ofrecer el botón que la destruía.

## Campo primero: límite del predio y sitios desde cero (2026-10-20)

Mismo módulo SIG, no uno aparte (es el mismo mapa, el mismo GPS y la misma cola de revisiones; un segundo
camino a `geo.zonas` es justo la clase de bug que ya costó correcciones). Lo que cambió:

- `PredioHabilitado.flujo_campo` / `FamiliaRecord.flujo_campo`: lo deduce la vista (no es columna de
  `core.expedientes`). `lib/core.ts` lo pide y, si la BD no tiene `migration_campo_primero.sql` (42703), repite
  sin la columna: todo queda «SIG primero» como antes. Al reabrir un predio desde la lista se toma el flujo nuevo.
- Descarga de la lista (`refreshPrediosHabilitados`): con 120+ predios, las zonas se piden de a 6 en paralelo,
  una descarga en curso se comparte y una reciente (< 60 s) se reutiliza; sigue sin vaciar la copia si la
  señal se cae a mitad. La vista pone «Sin nombre» a los predios sin nombre: el índice de Dexie por
  `nombre_predio` deja por fuera los registros con nombre nulo.
- `RevisionRecord.tipo`: `'restauracion'` (sitio, y todas las revisiones viejas que no lo traen) o `'finca'`
  (límite del predio). `zonasVigentes` **ignora** las de límite —si no, su `zona_id` saldría como un sitio
  «retirado del SIG»— y `limitesVigentes` las resuelve aparte con las mismas reglas.
- Las revisiones de límite viajan por **`geo.revisar_zona_campo`** (con `p_tipo`); las de sitios siguen por
  `geo.revisar_zona`, sin cambio. Si el RPC nuevo no existe, la revisión queda en el celular con el aviso y se
  reintenta en cada sincronización: no se pierde.
- Módulo SIG: dos capas («Sitios de siembra» / «Límite del predio»), dibujo sobre el satelital o **trazado
  caminando** (un vértice por «Marcar punto» con el GPS, `metodo='gps'`). `fusionarRevision` aplica igual al
  límite: confirmar no borra un límite corregido.
- «Actualizar desde el SIG» solo bloquea el «cero zonas» si el celular tenía zonas del SIG que perder.
- Pruebas sin red: `npm run pruebas` (rolldown + stubs de Dexie y Supabase en `scripts/`).

## Predios de práctica (capacitación) — `lib/practica.ts`

Dos predios locales, uno por flujo, que `asegurarPracticas()` crea en el inicio si faltan: **Práctica 1 ·
Verificar al SIG** (límite + 3 sitios) y **Práctica 2 · Campo primero** (sin límite ni sitios, con una capa de
apoyo de ejemplo guardada en la propia familia: `FamiliaRecord.capas_apoyo`, que solo usa la práctica).
`es_practica` hace que `lib/sync.ts` los marque «sincronizados» sin tocar la red. Las geometrías nacen en
Florencia y se regeneran alrededor del GPS apenas hay predio **y** GPS (efecto en `Sig/index.tsx`, no en el
callback del GPS: si el primer fix llegaba antes que el predio y el celular estaba quieto, la práctica se
quedaba lejos). «Empezar de nuevo» (`reiniciarPractica`) borra sitios, límite, evaluación con fotos y encuesta.
El primer encuadre del mapa va **sin animación**: Leaflet ignora cualquier cambio de vista mientras anima un zoom.

## Manual de usuario — `manual/`

`Manual_Usuario_App_Campo.pdf` se rehace cuando cambie la app: `node manual/servidor_manual.mjs` (entrada
`app_campo-manual` de `.claude/launch.json`: un «Supabase» con predios y personas **inventados** y la app en
:5190), `node manual/capturas.mjs` (puppeteer-core con el Chrome instalado; `npm install` dentro de `manual/`)
y `python manual/build_manual.py` (reportlab, con Poppins y Fraunces convertidas a TTF en `manual/fuentes/`).
Las fincas de ejemplo están en potreros de Morelia (`manual/centro.mjs`); el guion pone el GPS dentro de cada una.

## Estilo (2026-10-20)

Paleta del manual 2024 y las familias de Tailwind remapeadas a la marca en `src/index.css` (como la intranet):
`gray` cálido, `emerald`/`teal` bosque, `amber` ámbar, `red` arcilla, `blue` pizarra. Utilidades propias:
`cabecera`, `vidrio`, `vidrio-oscuro`, `tarjeta`, `rotulo`, `boton` + `boton-bosque|ambar|pizarra|arcilla|vidrio`,
`boton-mapa`. Poppins + Fraunces van **dentro** de la app (`src/assets/fuentes`, solo latín) para que existan sin
señal. Los colores del mapa NO pasan por la paleta (son los de `lib/colores-campo.ts` de la intranet).
No escribas hexadecimales en clases: usa `bosque`, `ambar`, `hueso`…

## Reglas

- No ejecutar DDL. Migraciones en `../Intranet-AE/docs/sql/`, las corre el usuario.
- `migration_zona_revision.sql` **ya se corrió** (2026-07-28) y `migration_geo_versionado.sql` también (2026-08-11, verificado por REST el 12: `geo.zonas_lote` existe, `revisar_zona` con 10 argumentos sin sobrecarga duplicada). Las correcciones de zonas hechas en campo sincronizan.
- **Esta app es productiva con gente real usándola.** Al 2026-08-12: 2 predios en campo (La Dalia y Versalles), 27 revisiones de zonas sincronizadas, evaluadores "José Jarlinson vega" y "Natalia". Antes de tocar el flujo de sincronización, ten presente que hay trabajo de terreno en juego.
- `.env` trae la anon key (gitignored) — no hay service role aquí, esta app no la necesita.
- Local: `npm install && npm run dev` (puerto 5173). Type-check: `tsc -b --noEmit`. Build: `npm run build`.
