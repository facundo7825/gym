// Las tres funciones de video se llaman con supabase.functions.invoke() desde
// un componente cliente, o sea desde el navegador. Eso manda antes un
// preflight OPTIONS: si no se contesta, la llamada falla y el error que ve el
// usuario no menciona CORS por ningún lado.
//
// Origin '*' no abre nada acá: las tres exigen un Bearer del usuario, y ese
// token vive en el origen del panel, al que una página ajena no llega.
export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export const responder = (cuerpo: string, status: number) =>
  new Response(cuerpo, { status, headers: CORS })
