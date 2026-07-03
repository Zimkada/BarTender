#!/bin/bash

echo "🎨 Starting contrast fixes..."
echo ""

# Counter for changes
TOTAL_CHANGES=0

# Phase 1: Fix text-gray-400 to text-gray-600 (safe replacement)
echo "Phase 1: Fixing text-gray-400 → text-gray-600"
for file in src/pages/*.tsx src/components/*.tsx; do
  if grep -q "text-gray-400" "$file" 2>/dev/null; then
    BEFORE=$(grep -c "text-gray-400" "$file" || true)
    sed -i 's/text-gray-400/text-gray-600/g' "$file"
    AFTER=$(grep -c "text-gray-400" "$file" || true)
    CHANGES=$((BEFORE - AFTER))
    if [ $CHANGES -gt 0 ]; then
      echo "  ✅ $file: Fixed $CHANGES instances"
      TOTAL_CHANGES=$((TOTAL_CHANGES + CHANGES))
    fi
  fi
done

echo ""
echo "Phase 2: Fixing placeholder:text-gray-400 → placeholder:text-gray-500"
for file in src/pages/*.tsx src/components/*.tsx; do
  if grep -q "placeholder:text-gray-400" "$file" 2>/dev/null; then
    BEFORE=$(grep -c "placeholder:text-gray-400" "$file" || true)
    sed -i 's/placeholder:text-gray-400/placeholder:text-gray-500/g' "$file"
    AFTER=$(grep -c "placeholder:text-gray-400" "$file" || true)
    CHANGES=$((BEFORE - AFTER))
    if [ $CHANGES -gt 0 ]; then
      echo "  ✅ $file: Fixed $CHANGES instances"
      TOTAL_CHANGES=$((TOTAL_CHANGES + CHANGES))
    fi
  fi
done

echo ""
echo "=================================================="
echo "✅ Contrast fixes complete!"
echo "Total changes: $TOTAL_CHANGES"
echo "=================================================="
