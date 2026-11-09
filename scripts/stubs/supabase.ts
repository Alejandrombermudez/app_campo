// Cliente de Supabase de mentira: registra las llamadas a RPC y responde lo que
// la prueba configure. Nunca sale a la red.
type Resp = { data: unknown; error: { code?: string; message?: string } | null }
export const llamadas: { fn: string; args: Record<string, unknown> }[] = []
export const respuestas: Record<string, (args: Record<string, unknown>) => Resp> = {}
/** Lecturas de tablas/vistas: recibe las columnas pedidas. Sin entrada, la prueba no las esperaba. */
export const tablas: Record<string, (cols: string) => Resp> = {}
function consulta(tabla: string) {
  return {
    select: (cols: string) => {
      const r = () => {
        const f = tablas[tabla]
        if (!f) throw new Error(`la prueba no espera lecturas de ${tabla}`)
        return Promise.resolve(f(cols))
      }
      const q = { eq: () => q, order: () => q, then: (ok: (v: Resp) => unknown, ko?: (e: unknown) => unknown) => r().then(ok, ko) }
      return q
    },
  }
}
export const supabase = {
  schema: () => ({
    rpc: (fn: string, args: Record<string, unknown>) => {
      llamadas.push({ fn, args })
      const r = respuestas[fn]
      return Promise.resolve(r ? r(args) : { data: null, error: { code: 'PGRST202', message: `Could not find the function ${fn}` } })
    },
    from: (tabla: string) => consulta(tabla),
  }),
}
export const evalTable = () => { throw new Error('no se usa en la prueba') }
export const encTable = () => { throw new Error('no se usa en la prueba') }
