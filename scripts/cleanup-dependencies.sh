#!/bin/bash

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  NPM Dependencies Cleanup Script${NC}"
echo -e "${GREEN}========================================${NC}\n"

# Step 1: Remove unused dependencies
echo -e "${YELLOW}Step 1: Removing unused dependencies...${NC}"
echo -e "Removing: Storybook addons, testing tools, CLI utilities\n"

npm uninstall \
  @chromatic-com/storybook \
  @storybook/addon-docs \
  @storybook/addon-onboarding \
  @storybook/addon-vitest \
  supabase \
  tsx \
  @testing-library/jest-dom \
  @testing-library/user-event \
  @vitest/coverage-v8 \
  playwright

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Unused dependencies removed${NC}\n"
else
  echo -e "${RED}❌ Error removing dependencies${NC}\n"
  exit 1
fi

# Step 2: Add missing dev dependencies
echo -e "${YELLOW}Step 2: Adding missing dev dependencies...${NC}"
echo -e "Adding: @storybook/react, lighthouse, chrome-launcher\n"

npm install -D \
  @storybook/react \
  lighthouse \
  chrome-launcher

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Missing dev dependencies added${NC}\n"
else
  echo -e "${RED}❌ Error adding dependencies${NC}\n"
  exit 1
fi

# Step 3: Verify build still works
echo -e "${YELLOW}Step 3: Verifying build...${NC}"
npm run build

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Build successful!${NC}\n"
else
  echo -e "${RED}❌ Build failed!${NC}\n"
  exit 1
fi

# Step 4: Check bundle size
echo -e "${YELLOW}Step 4: Bundle size analysis...${NC}"
du -sh node_modules
echo ""

# Step 5: Summary
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Cleanup Complete! ${NC}"
echo -e "${GREEN}========================================${NC}\n"

echo -e "${YELLOW}Summary:${NC}"
echo -e "✅ Removed ~12 unused packages"
echo -e "✅ Added 3 critical dev dependencies"
echo -e "✅ Build verified"
echo -e "✅ node_modules should be ~50-100 MB smaller\n"

echo -e "${YELLOW}Next steps:${NC}"
echo -e "1. git add package.json package-lock.json"
echo -e "2. git commit -m 'refactor: Clean up unused dependencies'"
echo -e "3. npm install (if needed in CI/CD)"
