# Vérification Migration 047 Appliquée

## État: Migration appliquée ✅

`SELECT COUNT(*) FROM promotions` retourne **0** = NORMAL ✅

**Pourquoi 0 est correct :**
- La table `promotions` existe
- Elle est vide (aucune promotion créée encore)
- COUNT(*) sur table vide = 0

---

## Vérifications SQL à faire dans Supabase

### 1. Vérifier que les tables existent
```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('promotions', 'promotion_applications', 'bar_events')
ORDER BY table_name;
```

**Résultat attendu :**
```
bar_events
promotion_applications
promotions
```

---

### 2. Vérifier que les ENUMs existent
```sql
SELECT typname
FROM pg_type
WHERE typname IN ('promotion_type', 'promotion_status', 'event_type')
ORDER BY typname;
```

**Résultat attendu :**
```
event_type
promotion_status
promotion_type
```

---

### 3. Vérifier les colonnes de la table promotions
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'promotions'
ORDER BY ordinal_position;
```

**Colonnes attendues (27) :**
- id (uuid)
- bar_id (uuid)
- name (text)
- description (text)
- type (USER-DEFINED = promotion_type)
- status (USER-DEFINED = promotion_status)
- target_type (text)
- target_product_ids (ARRAY)
- target_category_ids (ARRAY)
- bundle_quantity (integer)
- bundle_price (numeric)
- discount_amount (numeric)
- discount_percentage (numeric)
- special_price (numeric)
- time_start (time without time zone)
- time_end (time without time zone)
- start_date (date)
- end_date (date)
- is_recurring (boolean)
- recurrence_days (ARRAY)
- max_uses_per_customer (integer)
- max_total_uses (integer)
- current_uses (integer)
- priority (integer)
- created_by (uuid)
- created_at (timestamp with time zone)
- updated_at (timestamp with time zone)

---

### 4. Vérifier les indexes
```sql
SELECT indexname
FROM pg_indexes
WHERE tablename IN ('promotions', 'promotion_applications', 'bar_events')
ORDER BY indexname;
```

**14 indexes attendus :**
- idx_bar_events_active
- idx_bar_events_bar_date
- idx_bar_events_type
- idx_promo_apps_analytics
- idx_promo_apps_applied_at
- idx_promo_apps_bar_id
- idx_promo_apps_product_id
- idx_promo_apps_promotion_id
- idx_promo_apps_sale_id
- idx_promotions_active_lookup
- idx_promotions_bar_id
- idx_promotions_dates
- idx_promotions_status
- idx_promotions_target_categories
- idx_promotions_target_products
- idx_promotions_type

---

### 5. Vérifier les fonctions
```sql
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name LIKE '%promotion%'
ORDER BY routine_name;
```

**3 fonctions attendues :**
- auto_activate_scheduled_promotions
- auto_expire_promotions
- increment_promotion_uses

---

### 6. Vérifier les policies RLS
```sql
SELECT tablename, policyname
FROM pg_policies
WHERE tablename IN ('promotions', 'promotion_applications', 'bar_events')
ORDER BY tablename, policyname;
```

**6 policies attendues :**
- **bar_events**:
  - Admins can manage events for their bars
  - Users can view events for their bars
- **promotion_applications**:
  - Users can insert promotion applications for their bars
  - Users can view promotion applications for their bars
- **promotions**:
  - Admins can manage promotions for their bars
  - Users can view promotions for their bars

---

## Si TOUTES les vérifications passent = Migration 047 OK ✅

**Prochaine étape :** Tester le service TypeScript avec une promotion test
