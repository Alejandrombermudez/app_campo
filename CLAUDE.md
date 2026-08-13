# app_campo — PWA de Campo (productiva)

React + Vite + TypeScript + Dexie (offline-first) + Supabase anon (sin login). Es la app **productiva**
de la etapa Campo del proceso de Siembra/Restauración. Reemplazó a [`familias-res/`](../familias-res/CLAUDE.md),
que fue la prueba de concepto y quedó desactualizada.

**Contexto completo (traspaso entre sesiones):** [`CONTEXTO_APP_CAMPO.md`](CONTEXTO_APP_CAMPO.md) — léelo
antes de tocar el módulo SIG o el flujo de sincronización, tiene el detalle de qué se hizo, qué falta y decisiones
que no se deben re-litigar sin el usuario.
**Arquitectura de datos del ecosistema:** `../Intranet-AE/docs/ARQUITECTURA_DATOS.md`.

## Qué hace

Un predio solo aparece en esta app si **Jurídica aprobó Y SIG subió ≥1 zona de siembra Y alguien pulsó
"Enviar a Campo" en la intranet** (regla de negocio explícita del usuario — SIG I es obligatorio, doble
candado API + vista SQL). La app **nunca** crea predios ni zonas en blanco.

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
`CONTEXTO_APP_CAMPO.md` punto 10 del backlog.

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

## Reglas

- No ejecutar DDL. Migraciones en `../Intranet-AE/docs/sql/`, las corre el usuario.
- `migration_zona_revision.sql` **ya se corrió** (2026-07-28) y `migration_geo_versionado.sql` también (2026-08-11, verificado por REST el 12: `geo.zonas_lote` existe, `revisar_zona` con 10 argumentos sin sobrecarga duplicada). Las correcciones de zonas hechas en campo sincronizan.
- **Esta app es productiva con gente real usándola.** Al 2026-08-12: 2 predios en campo (La Dalia y Versalles), 27 revisiones de zonas sincronizadas, evaluadores "José Jarlinson vega" y "Natalia". Antes de tocar el flujo de sincronización, ten presente que hay trabajo de terreno en juego.
- `.env` trae la anon key (gitignored) — no hay service role aquí, esta app no la necesita.
- Local: `npm install && npm run dev` (puerto 5173). Type-check: `tsc -b --noEmit`. Build: `npm run build`.
