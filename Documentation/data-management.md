# Data Management

## Data Structure

### Bill Interface
```typescript
interface Bill {
  id: string;
  title: string;
  sponsor: string;
  introduced: string;
  status: string;
  progress: number;
  summary: string;
  tags: string[];
  aiSummary?: string;
  lastUpdated?: string;
  voteCount?: {
    yea: number;
    nay: number;
    present: number;
    notVoting: number;
  };
}
```

## Mock Data

### Purpose
- Development and testing
- UI implementation
- Component showcase

### Location
```
lib/
└── mock-data.ts
```

## Future Data Implementation

### API Integration
1. Endpoints to implement:
   - GET /api/bills
   - GET /api/bills/[id]
   - GET /api/bills/search

2. Data Fetching
   - Server Components
   - API routes
   - Error handling

### Caching Strategy
1. Static Generation
   - Pre-rendered pages
   - Incremental Static Regeneration

2. Dynamic Data
   - Server-side rendering
   - Client-side fetching

## Data Flow

### Server Components
- Direct data access
- Pre-rendered content
- SEO optimization

### Client Components
- Interactive features
- Real-time updates
- User interactions