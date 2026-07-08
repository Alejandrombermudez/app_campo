import Dexie, { type EntityTable } from 'dexie'
import type { EvaluacionRecord, PhotoRecord } from '../types/evaluacion'
import type { EncuestaPredialRecord } from '../types/encuesta'
import type { PredioRecord } from '../types/predio'
import type { FamiliaRecord } from '../types/familia'
import type { PredioHabilitado } from '../types/core'
import type { RevisionRecord } from '../types/revision'

class AppDB extends Dexie {
  familias!:           EntityTable<FamiliaRecord, 'id'>
  evaluaciones!:       EntityTable<EvaluacionRecord, 'id'>
  photos!:             EntityTable<PhotoRecord, 'id'>
  encuestas!:          EntityTable<EncuestaPredialRecord, 'id'>
  predios!:            EntityTable<PredioRecord, 'id'>
  prediosHabilitados!: EntityTable<PredioHabilitado, 'predio_id'>
  revisiones!:         EntityTable<RevisionRecord, 'id'>

  constructor() {
    super('AECampoDB')
    this.version(1).stores({
      evaluaciones: '++id, local_id, sync_status, fecha_visita, updated_at',
      photos:       '++id, local_evaluacion_id, field_key, sync_status',
    })
    this.version(2).stores({
      evaluaciones: '++id, local_id, sync_status, fecha_visita, updated_at',
      photos:       '++id, local_evaluacion_id, field_key, sync_status',
      encuestas:    '++id, local_id, sync_status, fecha_encuesta, municipio, updated_at',
    })
    this.version(3).stores({
      evaluaciones: '++id, local_id, sync_status, fecha_visita, updated_at',
      photos:       '++id, local_evaluacion_id, field_key, sync_status',
      encuestas:    '++id, local_id, sync_status, fecha_encuesta, municipio, updated_at',
      predios:      '++id, local_id, sync_status, fecha, municipio, updated_at',
    })
    this.version(4).stores({
      familias:     '++id, local_id, sync_status, municipio, updated_at',
      evaluaciones: '++id, local_id, familia_local_id, sync_status, fecha_visita, updated_at',
      photos:       '++id, local_evaluacion_id, field_key, sync_status',
      encuestas:    '++id, local_id, familia_local_id, sync_status, fecha_encuesta, municipio, updated_at',
      predios:      '++id, local_id, sync_status, fecha, municipio, updated_at',
    })
    this.version(5).stores({
      familias:     '++id, local_id, supabase_id, sync_status, municipio, updated_at',
      evaluaciones: '++id, local_id, supabase_id, familia_local_id, sync_status, fecha_visita, updated_at',
      photos:       '++id, local_evaluacion_id, field_key, sync_status',
      encuestas:    '++id, local_id, supabase_id, familia_local_id, sync_status, fecha_encuesta, municipio, updated_at',
      predios:      '++id, local_id, sync_status, fecha, municipio, updated_at',
    })
    // v6: caché offline de predios habilitados por Jurídica+SIG (core.v_predios_campo)
    // + familias gana predio_core_id/expediente_id (el enlace real hacia core).
    this.version(6).stores({
      familias:           '++id, local_id, supabase_id, sync_status, municipio, predio_core_id, updated_at',
      evaluaciones:       '++id, local_id, supabase_id, familia_local_id, sync_status, fecha_visita, updated_at',
      photos:             '++id, local_evaluacion_id, field_key, sync_status',
      encuestas:          '++id, local_id, supabase_id, familia_local_id, sync_status, fecha_encuesta, municipio, updated_at',
      predios:            '++id, local_id, sync_status, fecha, municipio, updated_at',
      prediosHabilitados: 'predio_id, nombre_predio, municipio, etapa',
    })
    // v7: módulo SIG — revisiones de zonas hechas en campo (SIG II), pendientes
    // de aplicar en geo.zonas vía RPC geo.revisar_zona.
    this.version(7).stores({
      familias:           '++id, local_id, supabase_id, sync_status, municipio, predio_core_id, updated_at',
      evaluaciones:       '++id, local_id, supabase_id, familia_local_id, sync_status, fecha_visita, updated_at',
      photos:             '++id, local_evaluacion_id, field_key, sync_status',
      encuestas:          '++id, local_id, supabase_id, familia_local_id, sync_status, fecha_encuesta, municipio, updated_at',
      predios:            '++id, local_id, sync_status, fecha, municipio, updated_at',
      prediosHabilitados: 'predio_id, nombre_predio, municipio, etapa',
      revisiones:         '++id, local_id, familia_local_id, zona_id, sync_status, updated_at',
    })
  }
}

export const db = new AppDB()
