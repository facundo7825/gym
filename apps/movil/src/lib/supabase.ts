import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@gym/core'

export const supabase = createClient<Database>(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      // Guarda la sesión en el teléfono para no pedir login en cada apertura.
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // React Native no tiene URL de navegador de donde leer el token.
      detectSessionInUrl: false,
    },
  },
)
