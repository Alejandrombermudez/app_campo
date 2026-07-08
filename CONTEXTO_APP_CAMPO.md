# Contexto — App de Campo (app_campo)

> **Documento de traspaso entre sesiones.** Qué es esta app, qué se hizo, qué falta y cómo retomar.
> Última actualización: 2026-07-08. Escrito al cierre de la sesión que reconectó la app al núcleo `core` y construyó el módulo SIG.
>
> Documentos maestros del ecosistema (en `Intranet-AE/docs/`): `EMPEZAR_AQUI.md` (índice), `ARQUITECTURA_DATOS.md` (ER y parámetros de todo — **leer primero**), `ARTICULACION_Y_PROYECCION.md`.

---

## 1. Qué es esta app

PWA offline-first (React + Vite + Dexie + Supabase anon, sin login) para el trabajo en terreno del proceso de **restauración**: `Jurídica → SIG I → CAMPO → SIG II → Plan → Vivero → Ejecución`.

Es la copia en desarrollo de `familias-res/` (que fue la prueba de concepto; esta carpeta `app_campo/` es la que se trabaja). Tres módulos por predio:

| Módulo | Qué hace | Estado |
|---|---|---|
| **Módulo SIG** (`/sig/:familiaLocalId`) | Mapa satelital con el polígono de la finca + zonas de siembra del SIG I, geolocalización GPS respecto a las zonas, y **corrección de zonas** (SIG II): confirmar / editar vértices / descartar / dibujar nuevas | ✅ Construido 2026-07-08 |
| **Evaluación de Campo** (`/evaluacion/:id`) | Formato biofísico AE-CAMPO-001: cartografía social, cobertura, suelo, logística (por zona real del SIG), riesgos, firmas | ✅ Funciona, conectado a zonas reales |
| **Encuesta Predial** (`/encuesta/:id`) | Encuesta socioeconómica (vivienda, familia, economía, cultivos, ganadería, tecnología, bosque) | ✅ Funciona (la aplica otra persona del equipo) |

**Regla de negocio central (pedida explícitamente por el usuario): SIG I es OBLIGATORIO.** Un predio solo aparece en la app si Jurídica aprobó Y el SIG subió al menos una zona de siembra Y alguien pulsó "Enviar a Campo" en la intranet. La app no permite crear predios ni zonas en blanco.

## 2. Flujo de datos (cómo quedó conectado)

```
Jurídica aprueba DD (intranet /intranet/juridica) → "Enviar a SIG" → etapa sig_i
SIG sube .zip finca + .zip sitios de siembra (/intranet/sig/[predioId]) → geo.zonas (tipo finca | restauracion)
SIG pulsa "Enviar a Campo" → POST /api/juridica/aliados/[id]/crear-en-siembra
   valida: dd aprobada + etapa='sig_i' + ≥1 geo.zonas tipo restauracion (422 si no)
   crea siembra.familias (SOLO predio_id/aliado_id/expediente_id — identidad NO se duplica)
   avanza core.expedientes.etapa → 'campo'
App de campo lee core.v_predios_campo (vista angosta, única lectura de core para anon)
   → picker "Predios habilitados" → snapshot offline en Dexie (familia + zonas con geometría GeoJSON)
Técnico en terreno: módulo SIG (verifica/corrige zonas) + evaluación + encuesta
Sync al volver la señal:
   revisiones de zonas → RPC geo.revisar_zona (idempotente por local_id)
   evaluación → siembra.evaluaciones_campo · encuesta → siembra.familias
```

Claves de arquitectura:
- `siembra.predios` **ya no existe** (subsumida por `core.predios`+`core.aliados`+`core.expedientes`).
- `siembra.familias` / `evaluaciones_campo` ya no tienen columnas de identidad/ubicación — se leen por JOIN a `core` (la app usa `core.v_predios_campo`).
- Las zonas de la evaluación llevan `zona_id` (FK real a `geo.zonas`) — el técnico no elige "número de zonas".
- La PWA escribe zonas SOLO vía el RPC `geo.revisar_zona` (SECURITY DEFINER). Sin UPDATE directo. La auditoría (`geo.zona_revision`) conserva la geometría original de cada cambio.
- Lat/long se eliminó de la encuesta (se deriva del polígono SIG). `anio_adquisicion` se queda en campo (Jurídica no lo captura estructurado aún — decisión del usuario).

## 3. Qué se hizo (sesiones 2026-07-07 y 07-08)

### SQL (en `Intranet-AE/docs/sql/`, las corre el usuario en el SQL Editor)
| Archivo | Qué hace | Estado |
|---|---|---|
| `migration_campo_core.sql` | Vista `core.v_predios_campo`, FKs de siembra.* → core.predios, elimina columnas duplicadas y `siembra.predios`, grants anon (vista + geo.zonas + RPC lectura). TRUNCA datos de prueba | ✅ ejecutada |
| `migration_campo_core_v2.sql` | Endurece la vista: EXISTS geo.zonas tipo restauracion (SIG I obligatorio a nivel de datos) | ✅ ejecutada |
| `migration_zona_revision.sql` | `geo.zona_revision` + RPC `geo.revisar_zona` + estado `descartada` + vista excluye descartadas | ⚠️ **PENDIENTE de ejecutar** (verificar con el usuario; sin ella las revisiones quedan "pendientes de sincronizar" en los celulares, no se pierden) |

### Intranet-AE
- `crear-en-siembra/route.ts`: validaciones SIG I (etapa + zonas), INSERT sin columnas duplicadas.
- `/intranet/sig/[predioId]`: sección **"Enviar a Campo"** (deshabilitada sin sitios de siembra guardados; visible solo en etapa `sig_i`; banner verde si ya pasó).

### app_campo (todo compila: `tsc -b` y `npm run build` limpios)
- `src/lib/core.ts` — lee `core.v_predios_campo` + RPC `geo.zonas_de_predio` (geometrías GeoJSON); caché Dexie; filtra predios sin zonas.
- `src/lib/geo.ts` — `zonasVigentes`/`zonasActivas` (originales − descartadas + nuevas), punto-en-polígono, distancia al borde + rumbo (turf), áreas.
- `src/lib/sync.ts` — `syncPendingRevisiones` (RPC idempotente, refresca snapshot local tras aplicar), payloads sin columnas duplicadas.
- `src/pages/Sig/index.tsx` — el módulo SIG completo (Leaflet + Esri satelital + leaflet-geoman, lazy chunk). Colores: ámbar=por verificar, verde=confirmada, azul=corregida, teal=nueva, rojo=descartada; finca = blanco punteado no editable.
- `src/pages/Familia/index.tsx` — picker de predios habilitados (reemplazó el formulario en blanco) + ficha solo-lectura con zonas.
- `src/pages/Familia/FamiliaDetail.tsx` — 3 tarjetas (SIG / Evaluación / Encuesta); la evaluación se arma desde `zonasActivas`.
- `src/db/schema.ts` — Dexie v6 (prediosHabilitados) y v7 (revisiones).
- `src/types/{core,revision,familia,evaluacion,encuesta}.ts` — tipos nuevos/limpiados.
- Deps nuevas: leaflet, @geoman-io/leaflet-geoman-free, @turf/* (area, boolean-point-in-polygon, distance, bearing, centroid, polygon-to-line, point-to-line-distance, helpers).

### Verificado
- Migraciones campo_core v1/v2 confirmadas contra la BD real (vista responde, tablas limpias, RLS de core intacta para anon).
- Módulo SIG probado en preview con el predio real de prueba (57 ha): render de capas, selección, confirmar (ámbar→verde), edición con vértices geoman, guardado como "corregida" con área turf, deshacer. RPC `zonas_de_predio` funciona con anon.

## 4. Qué falta (en orden sugerido)

1. **Correr `migration_zona_revision.sql`** si aún no se hizo (verificar: `select to_regclass('geo.zona_revision')`).
2. **Prueba E2E real**: un expediente completo Jurídica → Enviar a SIG → subir shapefiles → Enviar a Campo → abrirlo en la app (con login M365 en intranet y un celular real para GPS). Nada de esto se ha probado con usuario final.
3. **Mapa base offline (PMTiles)**: hoy sin señal los polígonos y el GPS funcionan pero el fondo satelital no carga. Decisión ya tomada en docs: PMTiles sirve para el geovisor Y como mapa offline de campo.
4. **Modo "caminar con GPS"**: dibujar/corregir zona grabando el track del técnico (decisión abierta en `ARQUITECTURA_DATOS.md`; hoy solo edición por vértices).
5. **Foto por zona en el módulo SIG** (el diseño de `zona_revision` contemplaba `foto_url`; la columna no se incluyó — agregar cuando se implemente captura).
6. **Deploy de app_campo** (hay `vercel.json`; falta conectar el repo a Vercel o donde se decida) y probar la PWA instalada.
7. **`codigo_predio`**: ¿es lo mismo que `core.predios.codigo_catastral`? Sin resolver — hoy se pregunta en la evaluación.
8. Revisar la app vieja `familias-res/` (quedó desactualizada; decidir si se archiva).
9. Kobo: migrar fotos históricas cuando vuelva (pendiente viejo, no de esta app).

## 5. Cómo probar en local

```bash
cd app_campo && npm install && npm run dev   # puerto 5173; .env ya trae la anon key (gitignored)
```
- Sin predios en etapa `campo` el picker sale vacío (correcto). Para probar el módulo SIG sin flujo completo: sembrar una familia falsa en Dexie con las geometrías reales del RPC (`geo.zonas_de_predio` con el predio `3463915f-e8b3-4d66-9fc2-6b38d30caf25`, que tiene 2 fincas + 1 zona de 57 ha).
- El type-check es `./node_modules/.bin/tsc -b --noEmit`; build `npm run build`.

## 6. Decisiones tomadas (no re-litigar sin el usuario)

- SIG I obligatorio para Campo (doble candado: API + vista SQL). La app nunca fabrica zonas.
- Revisiones offline-first con última-acción-gana por zona; una revisión ya sincronizada no se edita — se crea otra encima.
- El RPC aplica el cambio DIRECTO a `geo.zonas` (estado `validada`, origen `campo`, version+1) — no hay cola de aprobación; la auditoría es `geo.zona_revision`.
- Identidad/ubicación jamás se duplican en siembra.*: FKs a core + JOIN.
- Dos dominios separados (Siembra=proceso vs RAS=conservación); esta app es SOLO del proceso de restauración.
