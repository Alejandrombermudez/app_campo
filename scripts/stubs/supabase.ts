// Cliente de Supabase de mentira: registra las llamadas a RPC y responde lo que
// la prueba configure. Nunca sale a la red.
type Resp = { data: unknown; error: { code?: string; message?: string } | null }
export const llamadas: { fn: string; args: Record<string, unknown> }[] = []
export const respuestas: Record<string, (args: Record<string, unknown>) => Resp> = {}
export const supabase = {
  schema: () => ({
    rpc: (fn: string, args: Record<string, unknown>) => {
      llamadas.push({ fn, args })
      const r = respuestas[fn]
      return Promise.resolve(r ? r(args) : { data: null, error: { code: 'PGRST202', message: `Could not find the function ${fn}` } })
    },
    from: () => { throw new Error('la prueba no espera lecturas de tablas') },
  }),
}
export const evalTable = () => { throw new Error('no se usa en la prueba') }
export const encTable = () => { throw new Error('no se usa en la prueba') }
