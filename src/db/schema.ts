import Dexie, { type EntityTable } from 'dexie'
import type { EvaluacionRecord, PhotoRecord } from '../types/evaluacion'

class AppDB extends Dexie {
  evaluaciones!: EntityTable<EvaluacionRecord, 'id'>
  photos!: EntityTable<PhotoRecord, 'id'>

  constructor() {
    super('AECampoDB')
    this.version(1).stores({
      evaluaciones: '++id, local_id, sync_status, fecha_visita, updated_at',
      photos: '++id, local_evaluacion_id, field_key, sync_status',
    })
  }
}

export const db = new AppDB()
