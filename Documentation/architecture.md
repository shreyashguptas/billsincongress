# Architecture

## Overview

The Congressional Bill Tracker follows a modern React architecture using Next.js 15's App Router. The application is built with a component-based architecture, emphasizing reusability, maintainability, and proper handling of dynamic parameters.

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