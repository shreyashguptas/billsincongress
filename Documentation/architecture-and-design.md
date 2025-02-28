# Architecture & Design

## Project Overview

The Congressional Bill Tracker follows a modern React architecture using Next.js 15's App Router. The application is built with a component-based architecture, emphasizing reusability, maintainability, and proper handling of dynamic parameters.

## Directory Structure

```
project/
├── app/                    # Next.js app directory (App Router)
│   ├── bills/             # Bill-related pages and routes
│   │   ├── [id]/         # Dynamic route for individual bill details
│   │   │   └── page.tsx  # Individual bill page with ISR and async params
│   │   └── page.tsx      # Bills listing page with filters and search
│   ├── layout.tsx         # Root layout with global providers and UI structure
│   └── page.tsx           # Home page with featured bills and overview
│
├── sql/                   # Database SQL files and definitions
│   ├── functions/        # Database functions with security settings
│   │   └── bill_functions.sql  # Core bill-related database functions
│   └── triggers/         # Database triggers
│       └── triggers.sql  # All database trigger definitions
│
├── scripts/              # Data update and maintenance scripts
│   └── DataUpdate/      # Scripts for updating bill data
│       ├── updateBillInfo.ts    # Updates core bill information
│       ├── updateBillActions.ts # Updates bill actions with retry logic
│       └── updateBillSubjects.ts # Updates bill subjects and policy areas
│
├── components/            # React components organized by feature
│   ├── ui/               # Reusable UI components (shadcn/ui based)
│   │   ├── button.tsx   # Button component for actions
│   │   ├── card.tsx     # Card component for content display
│   │   ├── select.tsx   # Select component for filters
│   │   └── badge.tsx    # Badge component for status and tags
│   │
│   └── bills/           # Bill-specific components
│       ├── bill-card.tsx    # Card component for bill preview
│       ├── bills-filter.tsx # Filter component for bills page
│       └── pagination.tsx   # Pagination component for bill lists
│
├── lib/                  # Core application logic and utilities
│   ├── services/        # Service layer for data operations
│   │   └── bills-service.ts # Bills data service with Supabase integration
│   │
│   ├── store/           # State management
│   │   ├── bills-store.ts   # Bills state management
│   │   └── ui-store.ts      # UI state management
│   │
│   ├── types/           # TypeScript type definitions
│   │   └── BillInfo.ts      # Bill-related type definitions
│   │
│   └── utils/           # Utility functions and helpers
```

## Technical Architecture

### Framework and Core Libraries
- **Next.js 15**: App Router implementation with React Server Components
- **TypeScript**: Type-safe code development
- **Supabase**: Backend database and authentication
- **Tailwind CSS**: Utility-first styling approach

### Key Architecture Principles
- **Server Components**: For data-fetching operations
- **Client Components**: For interactive UI elements
- **ISR (Incremental Static Regeneration)**: For bill detail pages
- **Server Actions**: For form submission and mutations
- **Type Safety**: Throughout the application
- **Responsive Design**: Mobile-first approach

## Component Architecture

### Core Components
- **Bill Cards**: Display bill previews
- **Bill Details**: Show comprehensive bill information
- **Filters**: Allow searching and filtering bills
- **Progress Indicators**: Show bill progress through legislative stages
- **Navigation**: Site-wide navigation components

### Common Type Issues and Solutions

#### 1. Progress Bar Calculation
The application uses two different progress calculation methods that need to be kept in sync:

##### Database Progress Stage
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

##### Component Progress Calculation
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

#### 2. Type Safety in Dynamic Routes

##### Async Params Handling
```typescript
interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BillPage({ params }: PageProps): Promise<ReactElement> {
  try {
    const { id } = await params;
    // Implementation...
  } catch (error) {
    // Error handling...
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