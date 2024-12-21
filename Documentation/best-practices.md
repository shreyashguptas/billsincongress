# Best Practices

## Code Organization

### File Structure
```
├── app/                 # Next.js app directory
├── components/          # React components
├── lib/                 # Utilities and helpers
├── types/              # TypeScript types
└── Documentation/      # Project documentation
```

### Component Organization
1. Group by Feature
   - Related components together
   - Shared components in ui folder

2. File Naming
   - Kebab-case for files
   - PascalCase for components
   - Descriptive names

## Coding Standards

### TypeScript
```typescript
// Use interfaces for props
interface ComponentProps {
  prop1: string;
  prop2?: number;
}

// Use type for specific unions/literals
type Status = 'pending' | 'approved' | 'rejected';
```

### React Best Practices
1. Component Structure
   ```tsx
   // Single responsibility
   // Clear props interface
   // Proper error handling
   export function Component({ prop1, prop2 }: ComponentProps) {
     // ...
   }
   ```

2. Hooks Usage
   ```tsx
   // Custom hooks for reusable logic
   function useCustomHook() {
     const [state, setState] = useState();
     // ...
     return { state, setState };
   }
   ```

## Performance

### Optimization Techniques
1. Server Components
   - Use for static content
   - Reduce client JavaScript

2. Client Components
   - Only when needed
   - Clear 'use client' directive

3. Image Optimization
   - Next.js Image component
   - Proper sizing
   - Loading strategies

## Testing

### Component Testing
```typescript
// Jest + React Testing Library
describe('Component', () => {
  it('renders correctly', () => {
    // ...
  });
});
```

## Git Practices

### Commit Messages
```
feat: Add new feature
fix: Fix bug
docs: Update documentation
style: Format code
refactor: Refactor code
test: Add tests
```

## Accessibility

### WCAG Guidelines
1. Semantic HTML
2. ARIA labels
3. Keyboard navigation
4. Color contrast
5. Screen reader support

## Caching Best Practices

### 1. Server Component Caching
- Use `unstable_cache` for data fetching operations
- Implement appropriate cache keys and tags
- Set reasonable revalidation periods
- Handle cache invalidation properly

Example:
```typescript
const getCachedData = unstable_cache(
  async () => {
    // Fetching logic
  },
  ['cache-key'],
  { 
    revalidate: 3600,
    tags: ['data-tag']
  }
);
```

### 2. Dynamic Route Caching
- Configure dynamic routes appropriately
- Use proper params handling
- Implement cache strategies for dynamic content
- Handle cache invalidation for dynamic routes

Example:
```typescript
// In dynamic route pages
export const dynamic = 'error';
export const dynamicParams = true;
export const revalidate = 3600;
```

### 3. Supabase Integration
- Configure Supabase client with proper caching
- Handle authentication states
- Implement error handling
- Use appropriate cache settings

Example:
```typescript
const supabaseClient = createClient({
  global: {
    fetch: (url, init) => {
      const customInit = {
        ...init,
        next: { 
          revalidate: 3600,
          tags: ['bills']
        }
      };
      if (!init?.cache) {
        customInit.cache = 'force-cache';
      }
      return fetch(url, customInit);
    }
  }
});
```

### 4. Cache Invalidation
- Implement proper cache invalidation strategies
- Use cache tags for granular control
- Handle revalidation appropriately
- Monitor cache performance