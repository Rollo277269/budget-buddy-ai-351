export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      bank_movements: {
        Row: {
          account_id: string
          causale: string
          cig: string
          created_at: string
          data: string
          data_valuta: string
          descrizione: string
          id: string
          importo: number
          saldo: number
        }
        Insert: {
          account_id?: string
          causale?: string
          cig?: string
          created_at?: string
          data?: string
          data_valuta?: string
          descrizione?: string
          id?: string
          importo?: number
          saldo?: number
        }
        Update: {
          account_id?: string
          causale?: string
          cig?: string
          created_at?: string
          data?: string
          data_valuta?: string
          descrizione?: string
          id?: string
          importo?: number
          saldo?: number
        }
        Relationships: []
      }
      bank_reconciliations: {
        Row: {
          created_at: string
          documento_id: string | null
          id: string
          invoice_anno: number | null
          invoice_numero: number | null
          invoice_type: string | null
          movement_id: string
        }
        Insert: {
          created_at?: string
          documento_id?: string | null
          id?: string
          invoice_anno?: number | null
          invoice_numero?: number | null
          invoice_type?: string | null
          movement_id: string
        }
        Update: {
          created_at?: string
          documento_id?: string | null
          id?: string
          invoice_anno?: number | null
          invoice_numero?: number | null
          invoice_type?: string | null
          movement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_reconciliations_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documenti_acquisto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_reconciliations_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "bank_movements"
            referencedColumns: ["id"]
          },
        ]
      }
      categorie_centri: {
        Row: {
          codice: string
          created_at: string
          descrizione: string
          id: string
          tipo: string
        }
        Insert: {
          codice: string
          created_at?: string
          descrizione?: string
          id?: string
          tipo: string
        }
        Update: {
          codice?: string
          created_at?: string
          descrizione?: string
          id?: string
          tipo?: string
        }
        Relationships: []
      }
      centri_cr: {
        Row: {
          categoria_id: string | null
          codice: string
          created_at: string
          descrizione: string
          id: string
          note: string
          parole_chiave_matching: string
          tipo: string
        }
        Insert: {
          categoria_id?: string | null
          codice: string
          created_at?: string
          descrizione?: string
          id?: string
          note?: string
          parole_chiave_matching?: string
          tipo: string
        }
        Update: {
          categoria_id?: string | null
          codice?: string
          created_at?: string
          descrizione?: string
          id?: string
          note?: string
          parole_chiave_matching?: string
          tipo?: string
        }
        Relationships: []
      }
      centro_assignments: {
        Row: {
          centro_codice: string
          context: string
          created_at: string
          id: string
          invoice_key: string
          tipo: string
        }
        Insert: {
          centro_codice: string
          context: string
          created_at?: string
          id?: string
          invoice_key: string
          tipo: string
        }
        Update: {
          centro_codice?: string
          context?: string
          created_at?: string
          id?: string
          invoice_key?: string
          tipo?: string
        }
        Relationships: []
      }
      commessa_links: {
        Row: {
          cig: string
          created_at: string
          id: string
          invoice_key: string
          invoice_type: string
        }
        Insert: {
          cig: string
          created_at?: string
          id?: string
          invoice_key: string
          invoice_type: string
        }
        Update: {
          cig?: string
          created_at?: string
          id?: string
          invoice_key?: string
          invoice_type?: string
        }
        Relationships: []
      }
      conti_correnti: {
        Row: {
          banca: string
          conto_addebito_id: string | null
          created_at: string
          iban: string
          id: string
          intestatario: string
          note: string
          tipo: string
        }
        Insert: {
          banca: string
          conto_addebito_id?: string | null
          created_at?: string
          iban: string
          id?: string
          intestatario?: string
          note?: string
          tipo?: string
        }
        Update: {
          banca?: string
          conto_addebito_id?: string | null
          created_at?: string
          iban?: string
          id?: string
          intestatario?: string
          note?: string
          tipo?: string
        }
        Relationships: []
      }
      documenti_acquisto: {
        Row: {
          ai_summary: string | null
          centro_costo: string | null
          cig: string
          created_at: string | null
          data_documento: string | null
          descrizione: string | null
          file_name: string
          fornitore: string | null
          id: string
          importo: number | null
          parsed_text: string | null
          storage_path: string
          tipo: string
        }
        Insert: {
          ai_summary?: string | null
          centro_costo?: string | null
          cig?: string
          created_at?: string | null
          data_documento?: string | null
          descrizione?: string | null
          file_name: string
          fornitore?: string | null
          id?: string
          importo?: number | null
          parsed_text?: string | null
          storage_path: string
          tipo?: string
        }
        Update: {
          ai_summary?: string | null
          centro_costo?: string | null
          cig?: string
          created_at?: string | null
          data_documento?: string | null
          descrizione?: string | null
          file_name?: string
          fornitore?: string | null
          id?: string
          importo?: number | null
          parsed_text?: string | null
          storage_path?: string
          tipo?: string
        }
        Relationships: []
      }
      fatture_acquisto: {
        Row: {
          anno: number
          cassa: number
          cig: string
          created_at: string
          cup: string
          data: string
          descrizione: string
          fornitore: string
          id: string
          imponibile: number
          imposta: number
          numero: number
          pagamento: string
          partita_iva: string
          ritenute: number
          scadenza: string
          stato: string
          tipo: string
          totale: number
        }
        Insert: {
          anno: number
          cassa?: number
          cig?: string
          created_at?: string
          cup?: string
          data?: string
          descrizione?: string
          fornitore?: string
          id?: string
          imponibile?: number
          imposta?: number
          numero: number
          pagamento?: string
          partita_iva?: string
          ritenute?: number
          scadenza?: string
          stato?: string
          tipo?: string
          totale?: number
        }
        Update: {
          anno?: number
          cassa?: number
          cig?: string
          created_at?: string
          cup?: string
          data?: string
          descrizione?: string
          fornitore?: string
          id?: string
          imponibile?: number
          imposta?: number
          numero?: number
          pagamento?: string
          partita_iva?: string
          ritenute?: number
          scadenza?: string
          stato?: string
          tipo?: string
          totale?: number
        }
        Relationships: []
      }
      fatture_vendita: {
        Row: {
          anno: number
          cig: string
          cliente: string
          created_at: string
          cup: string
          data: string
          descrizione: string
          id: string
          imponibile: number
          imposta: number
          numero: number
          pagamento: string
          partita_iva: string
          righe: Json
          scadenza: string
          stato: string
          suffisso: string
          tipo: string
          totale: number
        }
        Insert: {
          anno: number
          cig?: string
          cliente?: string
          created_at?: string
          cup?: string
          data?: string
          descrizione?: string
          id?: string
          imponibile?: number
          imposta?: number
          numero: number
          pagamento?: string
          partita_iva?: string
          righe?: Json
          scadenza?: string
          stato?: string
          suffisso?: string
          tipo?: string
          totale?: number
        }
        Update: {
          anno?: number
          cig?: string
          cliente?: string
          created_at?: string
          cup?: string
          data?: string
          descrizione?: string
          id?: string
          imponibile?: number
          imposta?: number
          numero?: number
          pagamento?: string
          partita_iva?: string
          righe?: Json
          scadenza?: string
          stato?: string
          suffisso?: string
          tipo?: string
          totale?: number
        }
        Relationships: []
      }
      fatture_xml: {
        Row: {
          anno: number | null
          cedente_denominazione: string | null
          cessionario_denominazione: string | null
          created_at: string | null
          data_fattura: string | null
          file_name: string
          id: string
          importo_totale: number | null
          invoice_key: string | null
          matched: boolean | null
          numero: number | null
          numero_documento: string | null
          parsed_data: Json | null
          storage_path: string
          tipo: string
        }
        Insert: {
          anno?: number | null
          cedente_denominazione?: string | null
          cessionario_denominazione?: string | null
          created_at?: string | null
          data_fattura?: string | null
          file_name: string
          id?: string
          importo_totale?: number | null
          invoice_key?: string | null
          matched?: boolean | null
          numero?: number | null
          numero_documento?: string | null
          parsed_data?: Json | null
          storage_path: string
          tipo?: string
        }
        Update: {
          anno?: number | null
          cedente_denominazione?: string | null
          cessionario_denominazione?: string | null
          created_at?: string | null
          data_fattura?: string | null
          file_name?: string
          id?: string
          importo_totale?: number | null
          invoice_key?: string | null
          matched?: boolean | null
          numero?: number | null
          numero_documento?: string | null
          parsed_data?: Json | null
          storage_path?: string
          tipo?: string
        }
        Relationships: []
      }
      naming_rules: {
        Row: {
          created_at: string
          esempio: string
          id: string
          pattern: string
          tipo: string
        }
        Insert: {
          created_at?: string
          esempio?: string
          id?: string
          pattern: string
          tipo: string
        }
        Update: {
          created_at?: string
          esempio?: string
          id?: string
          pattern?: string
          tipo?: string
        }
        Relationships: []
      }
      rate_finanziamento: {
        Row: {
          conto_id: string
          created_at: string
          data_scadenza: string
          debito_residuo: number
          id: string
          importo_capitale: number
          importo_interessi: number
          importo_rata: number
          note: string
          numero_rata: number
          pagata: boolean
        }
        Insert: {
          conto_id: string
          created_at?: string
          data_scadenza: string
          debito_residuo?: number
          id?: string
          importo_capitale?: number
          importo_interessi?: number
          importo_rata?: number
          note?: string
          numero_rata: number
          pagata?: boolean
        }
        Update: {
          conto_id?: string
          created_at?: string
          data_scadenza?: string
          debito_residuo?: number
          id?: string
          importo_capitale?: number
          importo_interessi?: number
          importo_rata?: number
          note?: string
          numero_rata?: number
          pagata?: boolean
        }
        Relationships: []
      }
      rubrica: {
        Row: {
          codice_sdi: string
          created_at: string
          denominazione: string
          email: string
          id: string
          indirizzo: string
          note: string
          partita_iva: string
          pec: string
          sede_legale: Json
          sede_operativa: Json
          telefono: string
          tipo: string
        }
        Insert: {
          codice_sdi?: string
          created_at?: string
          denominazione: string
          email?: string
          id?: string
          indirizzo?: string
          note?: string
          partita_iva?: string
          pec?: string
          sede_legale?: Json
          sede_operativa?: Json
          telefono?: string
          tipo?: string
        }
        Update: {
          codice_sdi?: string
          created_at?: string
          denominazione?: string
          email?: string
          id?: string
          indirizzo?: string
          note?: string
          partita_iva?: string
          pec?: string
          sede_legale?: Json
          sede_operativa?: Json
          telefono?: string
          tipo?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  public: {
    Enums: {},
  },
} as const
