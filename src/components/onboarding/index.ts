// Onboarding context & flow
export { OnboardingFlow } from './OnboardingFlow';

// Owner/Promoter components (kept steps - redirect steps removed)
export { BarDetailsStep } from './BarDetailsStep';
export { ReviewStep } from './ReviewStep';
// Removed: AddManagersStep, SetupStaffStep, AddProductsStep, StockInitStep
// These have been replaced by RedirectStep with config-driven architecture

// Manager components (3 steps)
export { ManagerRoleConfirmStep } from './ManagerRoleConfirmStep';
export { ManagerCheckStaffStep } from './ManagerCheckStaffStep';
export { ManagerTourStep } from './ManagerTourStep';

// Bartender components (3 steps)
export { BartenderIntroStep } from './BartenderIntroStep';
export { BartenderDemoStep } from './BartenderDemoStep';
export { BartenderTestSaleStep } from './BartenderTestSaleStep';
