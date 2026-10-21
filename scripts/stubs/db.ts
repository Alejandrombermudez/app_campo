// Dexie de mentira para las pruebas de sincronización: tablas en memoria con
// lo poco que usa lib/sync.ts (where().equals()/anyOf(), first, toArray, update).
type Fila = Record<string, unknown> & { id?: number }
class Tabla {
  filas: Fila[] = []
  private n = 0
  add(f: Fila) { const id = ++this.n; this.filas.push({ ...f, id }); return Promise.resolve(id) }
  update(id: number, cambios: Fila) {
    const f = this.filas.find(x => x.id === id)
    if (f) Object.assign(f, cambios)
    return Promise.resolve(f ? 1 : 0)
  }
  filter(pred: (f: Fila) => boolean) {
    return { toArray: () => Promise.resolve(this.filas.filter(pred).map(f => ({ ...f }))) }
  }
  delete(id: number) { this.filas = this.filas.filter(f => f.id !== id); return Promise.resolve() }
  where(campo: string) {
    const sobre = (pred: (f: Fila) => boolean) => ({
      first: () => Promise.resolve(this.filas.find(pred)),
      toArray: () => Promise.resolve(this.filas.filter(pred).map(f => ({ ...f }))),
    })
    return {
      equals: (v: unknown) => sobre(f => f[campo] === v),
      anyOf: (vs: unknown[]) => sobre(f => vs.includes(f[campo])),
    }
  }
}
export const db = {
  familias: new Tabla(), evaluaciones: new Tabla(), revisiones: new Tabla(),
  encuestas: new Tabla(), photos: new Tabla(), predios: new Tabla(), prediosHabilitados: new Tabla(),
  decisionesApoyo: new Tabla(),
}
