UPDATE fatture_vendita v
SET righe = COALESCE(x.parsed_data->'linee', '[]'::jsonb)
FROM fatture_xml x
WHERE x.tipo = 'vendita'
  AND x.matched = true
  AND x.invoice_key = CASE
    WHEN COALESCE(v.suffisso, '') = '' THEN v.anno::text || '-' || v.numero::text
    ELSE v.anno::text || '-' || v.numero::text || '-' || v.suffisso
  END
  AND jsonb_typeof(x.parsed_data->'linee') = 'array'
  AND jsonb_array_length(x.parsed_data->'linee') > 0
  AND (
    jsonb_typeof(v.righe) <> 'array'
    OR jsonb_array_length(v.righe) = 0
    OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v.righe) r WHERE r ? 'prezzoTotale')
  );