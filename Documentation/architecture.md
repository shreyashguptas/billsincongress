# Architecture

## Overview

The Congressional Bill Tracker follows a modern React architecture using Next.js 15's App Router. The application is built with a component-based architecture, emphasizing reusability and maintainability.

## Key Architectural Decisions

### 1. Next.js App Router
- Utilizes the new App Router for improved routing and layouts
- Server Components for better performance
- Client Components when interactivity is needed

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

### 4. State Management
- React's built-in useState for local state
- Server Components for remote data
- Future consideration for global state management

### 5. Caching Strategy
- Implements Next.js 15 caching mechanisms
- Uses unstable_cache for data fetching
- Page-level revalidation controls
- Dynamic route caching optimization

## File Organization

### App Directory Structure
```
app/
├── bills/
│   ├── [id]/     # Individual bill pages
│   └── page.tsx  # Bills listing page
├── about/
│   └── page.tsx
├── layout.tsx
└── page.tsx
```

### Component Organization
- Components are grouped by feature
- Shared components in ui directory
- Feature-specific components in dedicated directories

## Performance Considerations

### 1. Server Components
- Used for static content
- Reduces client-side JavaScript

### 2. Client Components
- Used only when needed
- Marked with 'use client' directive

### 3. Image Optimization
- Next.js Image component
- Responsive images
- Lazy loading

### 4. Caching Implementation
- Page-level caching with revalidation
- Data caching with unstable_cache
- Dynamic route caching optimization
- Supabase client caching configuration

## Caching Architecture

### 1. Page-Level Caching
```typescript
// Example from bills/[id]/page.tsx
export const revalidate = 3600; // Revalidate every hour
```

### 2. Data Fetching Cache
```typescript
// Example of cached data fetching
const getCachedData = unstable_cache(
  async () => {
    // Data fetching logic
  },
  ['cache-key'],
  { revalidate: 3600 }
);
```

### 3. Dynamic Route Caching
```typescript
// Configuration for dynamic routes
export const dynamic = 'error';
export const dynamicParams = true;
```

### 4. Supabase Integration
```typescript
// Supabase client with caching
const customInit = {
  cache: 'force-cache',
  next: { 
    revalidate: 3600,
    tags: ['bills']
  }
};
```

## Cache Invalidation

### 1. Automatic Invalidation
- Time-based revalidation (hourly)
- Tag-based invalidation
- Dynamic route handling

### 2. Manual Invalidation
- API routes for cache clearing
- Tag-based cache clearing
- On-demand revalidation

### 3. Cache Tags
- 'bills' for bill-related data
- 'bill-detail' for individual bills
- Granular cache control