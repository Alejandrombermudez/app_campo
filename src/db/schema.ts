import Dexie, { type EntityTable } from 'dexie'
import type { EvaluacionRecord, PhotoRecord } from '../types/evaluacion'
import type { EncuestaPredialRecord } from '../types/encuesta'
import type { PredioRecord } from '../types/predio'
import type { FamiliaRecord } from '../types/familia'

class AppDB extends Dexie {
  familias!:     EntityTable<FamiliaRecord, 'id'>
  evaluaciones!: EntityTable<EvaluacionRecord, 'id'>
  photos!:       EntityTable<PhotoRecord, 'id'>
  encuestas!:    EntityTable<EncuestaPredialRecord, 'id'>
  predios!:      EntityTable<PredioRecord, 'id'>

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
  }
}

export const db = new AppDB()
