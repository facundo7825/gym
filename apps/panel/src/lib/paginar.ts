/**
 * PostgREST corta en ~1000 filas sin avisar. Esto pide de a páginas hasta que
 * una venga corta. La consulta tiene que estar ordenada por algo único, para
 * que dos páginas no se pisen. Si una página falla se devuelve lo acumulado:
 * en el panel, mostrar lo que hay es mejor que nada.
 */
export async function todasLasPaginas<T>(
  pagina: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const filas: T[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await pagina(desde, desde + 999)
    if (error || !data) break
    filas.push(...data)
    if (data.length < 1000) break
  }
  return filas
}
