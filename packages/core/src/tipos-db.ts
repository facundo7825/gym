export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ejercicios: {
        Row: {
          creado_por: string | null
          created_at: string
          descripcion: string | null
          equipamiento: Database["public"]["Enums"]["tipo_equipamiento"]
          grupo_muscular: Database["public"]["Enums"]["grupo_muscular"]
          gym_id: string | null
          id: string
          instrucciones: string | null
          maquina_id: string | null
          nombre: string
          video_id: string | null
        }
        Insert: {
          creado_por?: string | null
          created_at?: string
          descripcion?: string | null
          equipamiento: Database["public"]["Enums"]["tipo_equipamiento"]
          grupo_muscular: Database["public"]["Enums"]["grupo_muscular"]
          gym_id?: string | null
          id?: string
          instrucciones?: string | null
          maquina_id?: string | null
          nombre: string
          video_id?: string | null
        }
        Update: {
          creado_por?: string | null
          created_at?: string
          descripcion?: string | null
          equipamiento?: Database["public"]["Enums"]["tipo_equipamiento"]
          grupo_muscular?: Database["public"]["Enums"]["grupo_muscular"]
          gym_id?: string | null
          id?: string
          instrucciones?: string | null
          maquina_id?: string | null
          nombre?: string
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ejercicio_maquina_del_mismo_gym"
            columns: ["maquina_id", "gym_id"]
            isOneToOne: false
            referencedRelation: "maquinas"
            referencedColumns: ["id", "gym_id"]
          },
          {
            foreignKeyName: "ejercicios_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ejercicios_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ejercicios_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      gyms: {
        Row: {
          activo: boolean
          created_at: string
          id: string
          logo_url: string | null
          nombre: string
          plan: string
          slug: string
          zona_horaria: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          id?: string
          logo_url?: string | null
          nombre: string
          plan?: string
          slug: string
          zona_horaria?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          id?: string
          logo_url?: string | null
          nombre?: string
          plan?: string
          slug?: string
          zona_horaria?: string
        }
        Relationships: []
      }
      maquinas: {
        Row: {
          cantidad: number
          created_at: string
          foto_url: string | null
          gym_id: string
          id: string
          marca: string | null
          nombre: string
          notas: string | null
        }
        Insert: {
          cantidad?: number
          created_at?: string
          foto_url?: string | null
          gym_id: string
          id?: string
          marca?: string | null
          nombre: string
          notas?: string | null
        }
        Update: {
          cantidad?: number
          created_at?: string
          foto_url?: string | null
          gym_id?: string
          id?: string
          marca?: string | null
          nombre?: string
          notas?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maquinas_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          codigo_qr: string
          created_at: string
          estado: Database["public"]["Enums"]["estado_membresia"]
          fecha_alta: string
          gym_id: string
          id: string
          rol: Database["public"]["Enums"]["rol_membresia"]
          user_id: string
        }
        Insert: {
          codigo_qr?: string
          created_at?: string
          estado?: Database["public"]["Enums"]["estado_membresia"]
          fecha_alta?: string
          gym_id: string
          id?: string
          rol?: Database["public"]["Enums"]["rol_membresia"]
          user_id: string
        }
        Update: {
          codigo_qr?: string
          created_at?: string
          estado?: Database["public"]["Enums"]["estado_membresia"]
          fecha_alta?: string
          gym_id?: string
          id?: string
          rol?: Database["public"]["Enums"]["rol_membresia"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          apellido: string
          avatar_url: string | null
          created_at: string
          es_superadmin: boolean
          fecha_nacimiento: string | null
          id: string
          nombre: string
          telefono: string | null
        }
        Insert: {
          apellido?: string
          avatar_url?: string | null
          created_at?: string
          es_superadmin?: boolean
          fecha_nacimiento?: string | null
          id: string
          nombre?: string
          telefono?: string | null
        }
        Update: {
          apellido?: string
          avatar_url?: string | null
          created_at?: string
          es_superadmin?: boolean
          fecha_nacimiento?: string | null
          id?: string
          nombre?: string
          telefono?: string | null
        }
        Relationships: []
      }
      rutina_dias: {
        Row: {
          created_at: string
          id: string
          nombre: string
          notas: string | null
          orden: number
          rutina_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          nombre: string
          notas?: string | null
          orden: number
          rutina_id: string
        }
        Update: {
          created_at?: string
          id?: string
          nombre?: string
          notas?: string | null
          orden?: number
          rutina_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rutina_dias_rutina_id_fkey"
            columns: ["rutina_id"]
            isOneToOne: false
            referencedRelation: "rutinas"
            referencedColumns: ["id"]
          },
        ]
      }
      rutina_ejercicios: {
        Row: {
          created_at: string
          descanso_seg: number | null
          ejercicio_id: string
          id: string
          notas: string | null
          orden: number
          peso_sugerido_kg: number | null
          repeticiones: string
          rutina_dia_id: string
          series: number
        }
        Insert: {
          created_at?: string
          descanso_seg?: number | null
          ejercicio_id: string
          id?: string
          notas?: string | null
          orden: number
          peso_sugerido_kg?: number | null
          repeticiones: string
          rutina_dia_id: string
          series: number
        }
        Update: {
          created_at?: string
          descanso_seg?: number | null
          ejercicio_id?: string
          id?: string
          notas?: string | null
          orden?: number
          peso_sugerido_kg?: number | null
          repeticiones?: string
          rutina_dia_id?: string
          series?: number
        }
        Relationships: [
          {
            foreignKeyName: "rutina_ejercicios_ejercicio_id_fkey"
            columns: ["ejercicio_id"]
            isOneToOne: false
            referencedRelation: "ejercicios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rutina_ejercicios_rutina_dia_id_fkey"
            columns: ["rutina_dia_id"]
            isOneToOne: false
            referencedRelation: "rutina_dias"
            referencedColumns: ["id"]
          },
        ]
      }
      rutinas: {
        Row: {
          asignada_por: string | null
          creado_por: string | null
          created_at: string
          descripcion: string | null
          estado: Database["public"]["Enums"]["estado_rutina"]
          fecha_fin: string | null
          fecha_inicio: string | null
          gym_id: string
          id: string
          nivel: Database["public"]["Enums"]["nivel_rutina"]
          nombre: string
          objetivo: Database["public"]["Enums"]["objetivo_rutina"]
          origen_id: string | null
          propietario_id: string | null
          tipo: Database["public"]["Enums"]["tipo_rutina"]
        }
        Insert: {
          asignada_por?: string | null
          creado_por?: string | null
          created_at?: string
          descripcion?: string | null
          estado?: Database["public"]["Enums"]["estado_rutina"]
          fecha_fin?: string | null
          fecha_inicio?: string | null
          gym_id: string
          id?: string
          nivel?: Database["public"]["Enums"]["nivel_rutina"]
          nombre: string
          objetivo?: Database["public"]["Enums"]["objetivo_rutina"]
          origen_id?: string | null
          propietario_id?: string | null
          tipo: Database["public"]["Enums"]["tipo_rutina"]
        }
        Update: {
          asignada_por?: string | null
          creado_por?: string | null
          created_at?: string
          descripcion?: string | null
          estado?: Database["public"]["Enums"]["estado_rutina"]
          fecha_fin?: string | null
          fecha_inicio?: string | null
          gym_id?: string
          id?: string
          nivel?: Database["public"]["Enums"]["nivel_rutina"]
          nombre?: string
          objetivo?: Database["public"]["Enums"]["objetivo_rutina"]
          origen_id?: string | null
          propietario_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_rutina"]
        }
        Relationships: [
          {
            foreignKeyName: "rutinas_asignada_por_fkey"
            columns: ["asignada_por"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rutinas_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rutinas_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rutinas_origen_id_fkey"
            columns: ["origen_id"]
            isOneToOne: false
            referencedRelation: "rutinas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rutinas_propietario_id_fkey"
            columns: ["propietario_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
        ]
      }
      videos: {
        Row: {
          created_at: string
          duracion_seg: number | null
          error_detalle: string | null
          estado: Database["public"]["Enums"]["estado_video"]
          gym_id: string | null
          id: string
          ruta: string
          subido_por: string | null
          thumbnail_url: string | null
        }
        Insert: {
          created_at?: string
          duracion_seg?: number | null
          error_detalle?: string | null
          estado?: Database["public"]["Enums"]["estado_video"]
          gym_id?: string | null
          id?: string
          ruta: string
          subido_por?: string | null
          thumbnail_url?: string | null
        }
        Update: {
          created_at?: string
          duracion_seg?: number | null
          error_detalle?: string | null
          estado?: Database["public"]["Enums"]["estado_video"]
          gym_id?: string | null
          id?: string
          ruta?: string
          subido_por?: string | null
          thumbnail_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "videos_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "videos_subido_por_fkey"
            columns: ["subido_por"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      copiar_rutina: {
        Args: { p_nueva_id: string; p_origen_id: string }
        Returns: undefined
      }
      duplicar_plantilla: { Args: { p_rutina_id: string }; Returns: string }
      mi_membresia: { Args: { p_gym_id: string }; Returns: string }
      mi_rol: {
        Args: { p_gym_id: string }
        Returns: Database["public"]["Enums"]["rol_membresia"]
      }
      mis_gyms: { Args: never; Returns: string[] }
      puedo_editar_dia: { Args: { p_dia_id: string }; Returns: boolean }
      puedo_editar_rutina: { Args: { p_rutina_id: string }; Returns: boolean }
      puedo_ver_dia: { Args: { p_dia_id: string }; Returns: boolean }
      puedo_ver_rutina: { Args: { p_rutina_id: string }; Returns: boolean }
      puedo_ver_rutina_fila: {
        Args: {
          p_gym_id: string
          p_propietario_id: string
          p_tipo: Database["public"]["Enums"]["tipo_rutina"]
        }
        Returns: boolean
      }
      reordenar_dias: {
        Args: { p_ids: string[]; p_rutina_id: string }
        Returns: undefined
      }
      reordenar_ejercicios: {
        Args: { p_dia_id: string; p_ids: string[] }
        Returns: undefined
      }
      soy_superadmin: { Args: never; Returns: boolean }
      tomar_rutina: {
        Args: { p_plantilla_id: string; p_propietario_id: string }
        Returns: string
      }
    }
    Enums: {
      estado_membresia: "activo" | "inactivo"
      estado_rutina: "activa" | "archivada"
      estado_video: "procesando" | "listo" | "error"
      grupo_muscular:
        | "pecho"
        | "espalda"
        | "hombros"
        | "biceps"
        | "triceps"
        | "cuadriceps"
        | "isquiotibiales"
        | "gluteos"
        | "gemelos"
        | "abdominales"
        | "antebrazo"
        | "cuerpo_completo"
      nivel_rutina: "principiante" | "intermedio" | "avanzado"
      objetivo_rutina:
        | "fuerza"
        | "hipertrofia"
        | "resistencia"
        | "perdida_grasa"
        | "general"
      rol_membresia: "socio" | "entrenador" | "admin"
      tipo_equipamiento:
        | "barra"
        | "mancuerna"
        | "maquina"
        | "polea"
        | "kettlebell"
        | "banda"
        | "peso_corporal"
        | "otro"
      tipo_rutina: "plantilla" | "activa"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      estado_membresia: ["activo", "inactivo"],
      estado_rutina: ["activa", "archivada"],
      estado_video: ["procesando", "listo", "error"],
      grupo_muscular: [
        "pecho",
        "espalda",
        "hombros",
        "biceps",
        "triceps",
        "cuadriceps",
        "isquiotibiales",
        "gluteos",
        "gemelos",
        "abdominales",
        "antebrazo",
        "cuerpo_completo",
      ],
      nivel_rutina: ["principiante", "intermedio", "avanzado"],
      objetivo_rutina: [
        "fuerza",
        "hipertrofia",
        "resistencia",
        "perdida_grasa",
        "general",
      ],
      rol_membresia: ["socio", "entrenador", "admin"],
      tipo_equipamiento: [
        "barra",
        "mancuerna",
        "maquina",
        "polea",
        "kettlebell",
        "banda",
        "peso_corporal",
        "otro",
      ],
      tipo_rutina: ["plantilla", "activa"],
    },
  },
} as const

