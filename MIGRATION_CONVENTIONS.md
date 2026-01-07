# 📋 Migration Naming & Documentation Conventions

**Version** : 1.0
**Effective** : 2026-01-07 (post-MIGRATIONS_HISTORY.md)
**Purpose** : Standardize all future migrations for clarity, consistency, and compliance

---

## 📝 Naming Convention

### Format (OBLIGATOIRE)

```
YYYYMMDDHHMMSS_description_slug.sql
```

### Pattern Rules

- **YYYYMMDDHHMMSS** : Timestamp when migration created (avoids conflicts)
  - YYYY = 4-digit year (2026)
  - MM = 2-digit month (01-12)
  - DD = 2-digit day (01-31)
  - HH = 2-digit hour (00-23)
  - MM = 2-digit minute (00-59)
  - SS = 2-digit second (00-59)
  - **Example** : `20260107143022`

- **description_slug** : Kebab-case description (lowercase, no spaces, underscores for words)
  - Max 50 characters
  - Descriptive but concise
  - Imperative mood (add, fix, create, update, convert)
  - **Examples** :
    - `add_closing_hour_to_bars`
    - `fix_rls_admin_bars_list`
    - `create_promotion_system`
    - `convert_views_to_security_invoker`

### Full Examples

✅ **GOOD** :
- `20260107143022_add_closing_hour_to_bars.sql`
- `20260107150000_fix_rls_admin_bars_list.sql`
- `20260108090000_create_supply_and_update_cump.sql`

❌ **BAD** :
- `069_add_business_date_param_to_create_sale.sql` (sequential numbering = conflicts)
- `20260107_Add Closing Hour to Bars.sql` (uppercase, spaces)
- `update_view.sql` (too vague)
- `20260107_very_long_description_that_exceeds_fifty_characters_limit.sql` (too long)

---

## 📄 SQL Template

**Use** : [MIGRATION_TEMPLATE.sql](MIGRATION_TEMPLATE.sql)

### Required Sections

Every migration MUST have these 3 sections at top:

```sql
-- MIGRATION: [Title]
-- DATE: YYYY-MM-DD
-- AUTHOR: [Name]

-- PROBLEM: [What problem does this solve?]
-- IMPACT: [Who is affected?]
-- SOLUTION: [What are we doing?]

-- BREAKING_CHANGE: YES/NO
-- TABLES_CREATED/MODIFIED: [List]
-- RLS_CHANGES: [If applicable]
```

### Optional Sections

Include if applicable :

```sql
-- TICKET: Jira/GitHub reference
-- APPROACH: Why this solution?
-- ROLLBACK_STRATEGY: How to undo?
-- FUNCTIONS_CREATED: New RPCs
-- PRE_DEPLOY_TESTS: Manual tests
-- POST_DEPLOY_VALIDATION: Checks after deploy
```

### SQL Best Practices

Inside the migration, follow these rules:

1. **Use Transactions**
   ```sql
   BEGIN;
   -- ... changes ...
   COMMIT;
   ```

2. **Add Comments Above Major Operations**
   ```sql
   -- Step 1: Create table for storing ...
   CREATE TABLE promotions (
     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     ...
   );

   -- Step 2: Add RLS policy for multi-tenant isolation
   ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "select_own_bar" ON promotions
     FOR SELECT USING (bar_id IN (...));
   ```

3. **Add COMMENT ON TABLE/COLUMN**
   ```sql
   COMMENT ON TABLE promotions IS 'Promotional offers by bar (bundles, discounts, happy hours)';
   COMMENT ON COLUMN promotions.discount_amount IS 'Fixed discount in FCFA (null if percentage)';
   ```

4. **Create Indexes for Performance**
   ```sql
   CREATE INDEX idx_promotions_bar_id ON promotions(bar_id);
   CREATE INDEX idx_promotions_created_at ON promotions(created_at DESC);
   ```

5. **Grant Permissions Explicitly**
   ```sql
   GRANT SELECT, INSERT, UPDATE, DELETE ON promotions TO authenticated;
   GRANT SELECT ON promotions TO anon;
   ```

6. **Backfill Data if Modifying**
   ```sql
   -- Update existing rows if adding required column
   UPDATE bar_products
   SET current_average_cost = (
     SELECT AVG(unit_cost) FROM supplies
     WHERE bar_id = bar_products.bar_id
     AND product_id = bar_products.id
   )
   WHERE current_average_cost IS NULL;
   ```

7. **Data Validation After Changes**
   ```sql
   -- Validate: all sales have business_date
   DO $$
   BEGIN
     IF EXISTS (SELECT 1 FROM sales WHERE business_date IS NULL) THEN
       RAISE EXCEPTION 'business_date backfill incomplete';
     END IF;
   END $$;
   ```

---

## 🏷️ Tagging Convention

In migration comments, use these tags for categorization :

```sql
-- TAGS: #security #rls #audit
-- TAGS: #performance #index #optimization
-- TAGS: #feature #business-logic
-- TAGS: #bugfix #hotfix
-- TAGS: #refactor #technical-debt
-- TAGS: #admin #operations
```

**Why** : Enables quick filtering via grep/search
```bash
grep -l "#security" supabase/migrations/*.sql
```

---

## ✅ Pre-Commit Checklist

Before pushing a new migration:

- [ ] **Naming** : `YYYYMMDDHHMMSS_slug.sql` format ✓
- [ ] **Comments** : All 3 required sections filled (MIGRATION, PROBLEM, SOLUTION)
- [ ] **Breaking Change** : Explicitly stated YES/NO
- [ ] **Transactions** : Wrapped in `BEGIN; ... COMMIT;`
- [ ] **RLS** : If touching sensitive data, RLS policy added + tested
- [ ] **Permissions** : GRANT statements for all roles
- [ ] **Indexes** : Created for performance-critical queries
- [ ] **Comments** : COMMENT ON TABLE/COLUMN for new objects
- [ ] **Backfill** : If adding required column, backfilled + validated
- [ ] **Data Validation** : DO block to check data integrity after changes
- [ ] **Tags** : At least one tag for categorization (#feature, #bugfix, etc.)
- [ ] **No Breaking Changes** : Unless explicitly documented + approved

---

## 🚨 Breaking Change Guidelines

**When is it a breaking change?** If:
- ✅ Column renamed (API contracts depend on name)
- ✅ Column deleted (data lost)
- ✅ Column type changed (int → text)
- ✅ Table renamed (queries reference name)
- ✅ RPC signature changed (app code breaks)
- ✅ Enum values removed (existing data becomes invalid)

**When is it NOT a breaking change?** If:
- ✅ Column added (additive)
- ✅ View converted (same name, behavior improves)
- ✅ New RPC created (opt-in)
- ✅ Permission widened (backward compatible)
- ✅ Index added (invisible to app)
- ✅ Enum value added (old values still valid)

**If BREAKING** : Must communicate with frontend team + deploy coordinated

---

## 📊 Migration Checklist by Type

### 🟢 Adding New Table

```sql
-- MIGRATION: Create [table_name] for [purpose]
-- BREAKING_CHANGE: NO (additive)
-- TABLES_CREATED: [table_name]
-- RLS_CHANGES: YES

✓ Create table with UUID PK, timestamps, constraints
✓ Add COMMENT ON TABLE and key columns
✓ Enable RLS + create SELECT/INSERT/UPDATE/DELETE policies
✓ Create indexes on foreign keys and frequent filters
✓ GRANT permissions by role
```

### 🟡 Modifying Existing Table

```sql
-- MIGRATION: Add [column] to [table]
-- BREAKING_CHANGE: NO (additive column)
-- TABLES_MODIFIED: [table]

✓ ALTER TABLE ADD COLUMN (if adding)
✓ Set DEFAULT or backfill NULL values
✓ Add COMMENT ON COLUMN
✓ Update RLS if needed (new column in filters?)
✓ Create index if used in WHERE/JOIN
✓ Validate all rows updated (SELECT COUNT WHERE column IS NULL)
```

### 🔴 Fixing Critical Bug

```sql
-- MIGRATION: Fix [bug description]
-- PROBLEM: [What was broken?]
-- IMPACT: [What was affected?]
-- BREAKING_CHANGE: NO (bug fixes are backward compatible)

✓ Minimal, surgical change
✓ Include validation that fix worked
✓ Document exactly what rows were affected
✓ Log audit trail (who fixed what, when)
```

### 📊 Adding Analytics/View

```sql
-- MIGRATION: Create [view_name] for [purpose]
-- TABLES_CREATED: [view_name]
-- RLS_CHANGES: YES (add security_invoker + policies)

✓ Create view (normal or materialized)
✓ Add security_invoker=true (PHASE 13 standard)
✓ Include WHERE filters for RLS
✓ COMMENT ON VIEW
✓ GRANT SELECT (only, views are read-only typically)
✓ Create indexes if materialized
✓ Test with different user roles
```

### 🔐 Security Changes

```sql
-- MIGRATION: [Description]
-- BREAKING_CHANGE: NO (security improves, not breaks)
-- RLS_CHANGES: YES
-- TAGS: #security

✓ Clear explanation of security improvement
✓ Include audit logging if sensitive operation
✓ Test RLS cannot be bypassed
✓ Document new attack surface mitigated
✓ Backward compatible (existing data/queries work)
```

---

## 🔄 Git Workflow for Migrations

### Before You Write

```bash
# 1. Create feature branch
git checkout -b feature/my-new-feature

# 2. Create migration with correct naming
# Use current timestamp: date +%Y%m%d%H%M%S
touch supabase/migrations/20260107143022_add_feature_x.sql
```

### While Writing

```bash
# Use template
cp MIGRATION_TEMPLATE.sql supabase/migrations/20260107143022_add_feature_x.sql
# Fill in all required sections
```

### Before Commit

```bash
# Run linting checks (if available)
# sqlfluff lint supabase/migrations/*.sql

# Test migration locally on dev database
# psql -U postgres -d bartender_dev -f supabase/migrations/20260107143022_add_feature_x.sql

# Check no conflicts with existing migrations
git log --oneline supabase/migrations/ | head -20
```

### Commit Message

```bash
git commit -m "feat: Add feature X to Y

- Adds [what was added]
- Fixes [what was fixed if applicable]
- Impacts [who is affected]

Migration: 20260107143022_add_feature_x.sql
Ticket: JIRA-123 (if applicable)

🤖 Generated with Claude Code
Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

## 📚 Reference Documents

- **MIGRATIONS_HISTORY.md** : Complete history of all 165+ migrations (phases, chains, lessons)
- **MIGRATION_TEMPLATE.sql** : Copy this for each new migration
- **MIGRATION_CONVENTIONS.md** : This document (you are here)

---

## 🚀 FAQ

**Q: What if I create migration at 14:30:22 but only commit at 16:00?**
A: Use creation time (14:30:22) in filename. Timestamp is for conflict prevention, not commit time.

**Q: Can I modify a migration after creating it?**
A: NO. Once pushed to git, it's immutable (history integrity). Create new migration to fix bugs.

**Q: What if I mess up a migration?**
A: Create new migration with `_fix` suffix:
```
20260108090000_fix_rls_policy_created_20260107143022.sql
```

**Q: Do I always need to update MIGRATIONS_HISTORY.md?**
A: NO. That's updated quarterly after stabilization. Your task: write good migration comments.

**Q: What if migration is backward compatible but still "breaks" some use case?**
A: Still document it clearly and communicate with team. Better overcommunicate.

---

**Last Updated** : 2026-01-07
**Maintainer** : Claude Code (AI Assistant)
**Review** : Every quarter or after 50+ new migrations
