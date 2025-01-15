# Architecture

## Overview

The Congressional Bill Tracker follows a modern React architecture using Next.js 15's App Router. The application is built with a component-based architecture, emphasizing reusability, maintainability, and proper handling of dynamic parameters.

## Common Issues and Solutions

### 1. Progress Bar Calculation
The application uses two different progress calculation methods that need to be kept in sync:

#### Database Progress Stage
```sql
-- Progress stages in database
20: Introduced
40: In Committee
60: Passed One Chamber
80: Passed Both Chambers
90: To President
95: Signed by President
100: Became Law
```

#### Component Progress Calculation
```typescript
// Convert stage (20-100) to percentage (0-100)
const normalizedProgress = ((stage - 20) / 80) * 100;
```

**Common Issues:**
- Progress stage coming as string instead of number
- Mismatch between database stage and UI calculation
- Zero progress showing for valid stages

**Solutions:**
- Always convert progress_stage to number: `Number(bill.progress_stage)`
- Use type-safe stage handling: `typeof stage === 'string' ? parseInt(stage, 10) : stage`
- Validate stage range: `Math.max(20, Math.min(100, stage))`

### 2. Type Safety in Dynamic Routes

#### Async Params Handling
```typescript
interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BillPage({ params }: PageProps): Promise<ReactElement> {
  try {
    const { id } = await params;
    // Implementation
  } catch (error: unknown) {
    console.error('Error:', error);
    notFound();
  }
}
```

**Common Issues:**
- Type errors with async params
- Missing error handling for params resolution
- Incorrect return type annotations

**Solutions:**
- Use proper TypeScript types for async params
- Implement comprehensive error handling
- Add explicit return type annotations

### 3. Component State Management

#### Client-Side HTML Parsing
```typescript
const [summary, setSummary] = useState<string>(initialValue);

useEffect(() => {
  try {
    if (htmlContent) {
      const tmp = document.createElement('div');
      tmp.innerHTML = htmlContent;
      setSummary(tmp.textContent || tmp.innerText || fallback);
    }
  } catch (error: unknown) {
    console.error('Error parsing HTML:', error);
    setSummary(fallback);
  }
}, [htmlContent]);
```

**Common Issues:**
- HTML tags showing in text
- Hydration mismatches
- Missing error handling

**Solutions:**
- Parse HTML only on client side in useEffect
- Provide fallback content
- Implement proper error handling

### 4. Data Type Consistency

#### Progress Stage Handling
```typescript
// Convert progress_stage to number and calculate percentage
const progressStage = typeof bill.progress_stage === 'string' 
  ? parseInt(bill.progress_stage, 10) 
  : bill.progress_stage;
const progressPercentage = getProgressPercentage(progressStage || 20);
```

**Common Issues:**
- Inconsistent data types from API
- Missing fallback values
- Type conversion errors

**Solutions:**
- Add type checking and conversion
- Provide default values
- Use proper TypeScript types

## Key Architectural Decisions

### 1. Next.js App Router
- Utilizes the new App Router for improved routing and layouts
- Server Components for better performance
- Client Components when interactivity is needed
- Proper handling of async params in dynamic routes

### 2. Component Structure
```
components/
├── ui/          # Base UI components
├── bills/       # Bill-specific components
├── layout/      # Layout components
└── shared/      # Shared components
```

### 3. Data Flow
- Server Components for data fetching
- Client Components for interactivity
- Props for component communication
- Types for data structure definition
- Service layer for API calls and data transformation

### 4. State Management
- Service layer for data fetching and transformation
- Store layer for state management
- Error boundaries for error handling
- Loading states for better UX

### 5. Caching Strategy
- Page-level revalidation with ISR
- Static generation for frequently accessed pages
- Dynamic params handling for bill details
- Proper cookie handling in server components

## File Organization

### App Directory Structure
```
app/
├── bills/
│   ├── [id]/     # Individual bill pages with async params
│   └── page.tsx  # Bills listing page
├── about/
│   └── page.tsx
├── layout.tsx
└── page.tsx
```

### Service Layer Structure
```
lib/
├── services/    # API and data services
├── store/       # State management
├── types/       # TypeScript types
└── utils/       # Utility functions
```

## Performance Considerations

### 1. Server Components
- Used for static content
- Reduces client-side JavaScript
- Proper handling of dynamic params

### 2. Static Generation
- Pre-generates most recent bills
- Incremental Static Regeneration (ISR)
- Async params handling for dynamic routes

### 3. Error Handling
- Proper error boundaries
- Loading states
- Type-safe data handling

### 4. Caching Implementation
- Page-level caching with revalidation
- Static generation with ISR
- Proper cookie handling in server components
- Service layer caching

## Dynamic Route Handling

### 1. Async Params
```typescript
interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BillPage({ params }: PageProps) {
  const { id } = await params;
  // ... rest of the implementation
}
```

### 2. Static Generation
```typescript
export async function generateStaticParams() {
  // Pre-generate most recent bills
  return bills.map((bill) => ({
    id: bill.id,
  }));
}
```

### 3. Revalidation
```typescript
// Enable ISR with 1-hour revalidation
export const revalidate = 3600;
```

## Service Layer

### 1. Data Services
```typescript
// Example service structure
class BillsService {
  async fetchBills(params: BillQueryParams): Promise<BillsResponse> {
    // Implementation
  }
  
  async fetchBill(id: string): Promise<BillInfo | null> {
    // Implementation
  }
}
```

### 2. Error Handling
```typescript
try {
  const data = await getBillData(id);
  if (!data) {
    notFound();
  }
  // ... rest of the implementation
} catch (error) {
  // Error handling
}
```

### 3. Type Safety
```typescript
interface BillQueryParams {
  // Query parameters
}

interface BillsResponse {
  // Response structure
}
```

## Best Practices

### 1. Server Components
- Use server components for data fetching
- Handle async params properly
- Implement proper error boundaries

### 2. Type Safety
- Define clear interfaces
- Use TypeScript strictly
- Validate data at boundaries

### 3. Performance
- Implement ISR where appropriate
- Pre-generate static content
- Handle dynamic routes efficiently

### 4. Error Handling
- Implement proper error boundaries
- Show loading states
- Provide fallback UI

## Background Services

### Automated Data Updates
The system employs Supabase Edge Functions for automated background tasks:

1. **Bill Update Service**
   - **Type**: Supabase Edge Function
   - **Schedule**: Daily at 1 AM
   - **Purpose**: Keeps bill data synchronized with Congress.gov API
   - **Components**:
     - Deno runtime environment
     - Rate-limited API requests
     - Optimistic update strategy
     - Error handling and retry logic
   - **Data Flow**:
     ```
     Congress.gov API → Edge Function → Supabase Database
     ```
   - **Integration Points**:
     - Congress.gov API for source data
     - Supabase database for storage
     - Supabase scheduler for timing
   - **Monitoring**:
     - Function logs
     - Invocation history
     - Performance metrics

This service ensures that the application's bill data remains current while respecting API limits and maintaining data integrity.