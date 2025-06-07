# BarTender Project Guidelines

## Build Commands
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build

## Code Style Guidelines
- **TypeScript**: Use strict typing, avoid `any`. Define interfaces in `/src/types/index.ts`
- **React**: Use functional components with hooks. Extract reusable logic to custom hooks in `/src/hooks/`
- **Error Handling**: Use try/catch blocks with console.error for localStorage and API calls
- **Naming**: PascalCase for components, camelCase for functions/variables, interfaces without 'I' prefix
- **Imports**: Group imports: React, external libraries, internal components, hooks, types, styles
- **State Management**: Use local state and context. Persist with useLocalStorage hook
- **CSS**: Use Tailwind classes with consistent spacing and color variables

## File Structure
- Components in `/src/components/`
- Hooks in `/src/hooks/`
- Types in `/src/types/`