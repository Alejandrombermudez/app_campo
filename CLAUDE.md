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

## Reglas

- No ejecutar DDL. Migraciones en `../Intranet-AE/docs/sql/`, las corre el usuario.
- `migration_zona_revision.sql` **ya se corrió** (verificado por REST 2026-07-28: `geo.zona_revision` y el RPC `geo.revisar_zona` existen, anon puede ejecutarlo) — las correcciones de zonas hechas en campo ya sincronizan.
- `.env` trae la anon key (gitignored) — no hay service role aquí, esta app no la necesita.
- Local: `npm install && npm run dev` (puerto 5173). Type-check: `tsc -b --noEmit`. Build: `npm run build`.
