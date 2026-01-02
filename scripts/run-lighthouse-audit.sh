#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   Lighthouse Audit - BarTender App${NC}"
echo -e "${GREEN}========================================${NC}\n"

# Get the app URL from environment or default
APP_URL="${1:-https://bar-tender-ten.vercel.app}"

echo -e "${YELLOW}Target URL: $APP_URL${NC}\n"

# Run Lighthouse CLI with all options
echo -e "${YELLOW}Running Lighthouse audit...${NC}"
npx @lhci/cli@latest autorun \
  --config=lighthouserc.json \
  2>/dev/null || \
npx lighthouse "$APP_URL" \
  --view \
  --output-path="./lighthouse-final-$(date +%Y%m%d-%H%M%S).html" \
  --emulated-form-factor=mobile \
  --throttling-method=simulate \
  --throttling.cpuSlowdownMultiplier=4 \
  --disable-full-page-screenshots

echo -e "\n${GREEN}✅ Lighthouse audit completed!${NC}"
echo -e "Report saved to dist/lighthouse-final-*.html"
echo -e "\n${YELLOW}Next steps:${NC}"
echo -e "1. Open the HTML report in browser"
echo -e "2. Compare with previous scores (56.9 → ?)"
echo -e "3. Update OPTIMISATIONS_PERFORMANCE_ACCESSIBILITE.md with results"
