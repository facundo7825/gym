import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { admin, crearEscenario, type Escenario } from './ayudas'

// El bucket `videos` no tiene ninguna política sobre storage.objects, así que
// RLS deniega todo. El único camino al contenido es la URL firmada que emite
// la Edge Function video-url. Eso es una CONFIGURACIÓN, y las configuraciones
// se rompen calladas: alcanza con que alguien agregue una política "para
// probar algo" y el contenido del gimnasio queda descargable por cualquier
// socio con la sesión abierta. Tiene que avisar un test rojo, no un cliente.
describe('el bucket de videos es privado de punta a punta', () => {
  let e: Escenario
  let ruta: string

  beforeAll(async () => {
    e = await crearEscenario()
    ruta = `${e.gymA}/${crypto.randomUUID()}.mp4`

    const { error } = await admin.storage.from('videos').upload(
      ruta,
      new Blob([new Uint8Array([0, 0, 0, 32])], { type: 'video/mp4' }),
      { contentType: 'video/mp4' },
    )
    if (error) throw error
  })

  // El bucket tiene un cupo de 1 GB, compartido con todo lo que suba cada
  // corrida de test:rls. Sin este cleanup, cada corrida deja un objeto más
  // que nadie borra.
  afterAll(async () => {
    await admin.storage.from('videos').remove([ruta])
  })

  // Esta aserción NO es decorativa y va primera a propósito: `download` de una
  // ruta inexistente también falla, así que sin ella las dos de abajo pasan
  // igual con el bucket abierto de par en par. Sería un test verde que no
  // verifica nada.
  it('service_role sí baja el objeto', async () => {
    const { data, error } = await admin.storage.from('videos').download(ruta)
    expect(error).toBeNull()
    expect(data).not.toBeNull()
  })

  it('un admin del gimnasio DUEÑO no puede bajarlo directo', async () => {
    const { error } = await e.comoAdminA.storage.from('videos').download(ruta)
    expect(error).not.toBeNull()
  })

  it('un socio del gimnasio dueño tampoco', async () => {
    const { error } = await e.comoSocioA.storage.from('videos').download(ruta)
    expect(error).not.toBeNull()
  })

  it('alguien de otro gimnasio tampoco', async () => {
    const { error } = await e.comoSocioB.storage.from('videos').download(ruta)
    expect(error).not.toBeNull()
  })
})
