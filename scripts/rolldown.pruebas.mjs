// Empaqueta las pruebas de lógica para correrlas con Node, con Dexie y Supabase
// reemplazados por los de scripts/stubs (nunca salen a la red).
import { fileURLToPath } from 'node:url'
import path from 'node:path'
const aqui = path.dirname(fileURLToPath(import.meta.url))
const salida = process.env.SALIDA ?? path.join(aqui, '..', 'node_modules', '.pruebas')
const stubs = {
  [path.join(aqui, '..', 'src', 'db', 'schema.ts')]: path.join(aqui, 'stubs', 'db.ts'),
  [path.join(aqui, '..', 'src', 'lib', 'supabase.ts')]: path.join(aqui, 'stubs', 'supabase.ts'),
}
export default {
  input: { 'prueba-campo-primero': path.join(aqui, 'prueba-campo-primero.ts'), 'prueba-sync-limite': path.join(aqui, 'prueba-sync-limite.ts'), 'prueba-sitios-proyecto': path.join(aqui, 'prueba-sitios-proyecto.ts') },
  platform: 'node',
  output: { dir: salida, format: 'esm' },
  plugins: [{
    name: 'stubs',
    async resolveId(fuente, importador) {
      if (!importador || !fuente.startsWith('.')) return null
      const r = await this.resolve(fuente, importador, { skipSelf: true })
      return r && stubs[path.normalize(r.id)] ? stubs[path.normalize(r.id)] : null
    },
  }],
}
