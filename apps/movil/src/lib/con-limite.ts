/**
 * Una consulta con tope de espera. En un subsuelo la señal no siempre se corta
 * del todo: a veces queda tan mala que una consulta tarda un minuto en fallar,
 * y una pantalla no puede quedarse esperándola. `null` = no llegó a tiempo, y
 * quien llama lo trata igual que estar sin señal.
 */
export function conLimite<T>(consulta: PromiseLike<T>, ms = 4000): Promise<T | null> {
  let temporizador: ReturnType<typeof setTimeout> | undefined
  const tope = new Promise<null>((resolver) => {
    temporizador = setTimeout(() => resolver(null), ms)
  })
  return Promise.race([Promise.resolve(consulta).catch(() => null), tope])
    .finally(() => clearTimeout(temporizador))
}
