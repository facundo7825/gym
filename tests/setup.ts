import { config } from 'dotenv'

// Apunta explícitamente a .env.test. El atajo `dotenv/config` NO sirve acá:
// carga `.env`, que es el archivo de las apps y no tiene la SERVICE_ROLE_KEY
// que estos tests necesitan para preparar datos salteando RLS.
config({ path: '.env.test' })
