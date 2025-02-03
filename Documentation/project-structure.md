# Project Structure

## Directory Overview

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
│       ├── formatting.ts    # Date and text formatting utilities
│       ├── styles.ts        # Style utility functions
│       └── supabase/        # Supabase client configuration
│           ├── client.ts    # Client-side Supabase instance
│           ├── server.ts    # Server-side Supabase instance
│           └── config.ts    # Supabase configuration
│
├── hooks/               # Custom React hooks
│   └── use-debounce.ts # Debounce hook for search inputs
│
├── middleware.ts       # Next.js middleware for auth and routing
│
├── public/            # Static assets and public files
│
├── Documentation/     # Project documentation
│   ├── api-documentation/  # API integration docs
│   ├── architecture.md    # System architecture
│   ├── data-management.md # Data handling and services
│   └── project-structure.md # This file
│
├── next.config.mjs    # Next.js configuration
└── tsconfig.json      # TypeScript configuration
```

## Key Directories Explained

### App Directory
The app directory uses Next.js 15's App Router architecture for improved routing and server components.

#### `/app/bills/[id]/page.tsx`
- Dynamic route for individual bill pages
- Implements ISR with 1-hour revalidation
- Uses async params for Next.js 15 compatibility
- Pre-generates static pages for recent bills

#### `/app/bills/page.tsx`
- Main bills listing page
- Implements filtering and search functionality
- Uses server components for initial data fetch
- Integrates with bills service layer

### Components Directory
Organized by feature and responsibility, following atomic design principles.

#### `/components/ui/`
- Base UI components built with shadcn/ui
- Ensures consistent design language
- Implements accessibility features
- Provides type-safe component props

#### `/components/bills/`
- Bill-specific components
- Handles bill data display
- Implements interactive features
- Uses service layer for data operations

### Lib Directory
Core application logic separated by responsibility.

#### `/lib/services/`
- Service layer for data operations
- Implements clean architecture principles
- Handles data transformation
- Manages API interactions

#### `/lib/store/`
- State management implementation
- Separates concerns by feature
- Implements proper error handling
- Manages loading states

#### `/lib/types/`
- TypeScript type definitions
- Ensures type safety across the app
- Defines data structures
- Documents data shapes

#### `/lib/utils/`
- Utility functions and helpers
- Common formatting functions
- Style utilities
- Supabase client configuration

### Hooks Directory
Custom React hooks for reusable logic.

#### `/hooks/use-debounce.ts`
- Implements debounce functionality
- Optimizes search performance
- Reduces unnecessary API calls
- Type-safe implementation

### Configuration Files

#### `next.config.mjs`
```javascript
// Next.js configuration with TypeScript
export default {
  // ... configuration options
};
```

#### `tsconfig.json`
```javascript
{
  "compilerOptions": {
    "target": "es5",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

### SQL Directory
Houses all database-related SQL files for consistent database management.

#### `/sql/functions/`
- Contains database function definitions
- Implements security-enhanced functions
- Includes schema protection measures
- Documents function behavior and triggers

#### `/sql/functions/bill_functions.sql`
- Core bill-related database functions
- Security-enhanced with `SECURITY DEFINER`
- Fixed search paths to prevent schema poisoning
- Functions for:
  - Updating timestamps
  - Calculating bill progress
  - Updating bill status

#### `/sql/triggers/`
- Database trigger definitions
- Documents trigger relationships
- Maintains data consistency
- Automates data updates

### Scripts Directory
Contains scripts for data management and maintenance.

#### `/scripts/DataUpdate/`
- Scripts for updating bill data
- Implements robust error handling
- Includes retry mechanisms
- Respects API rate limits

#### Key Scripts:
- **updateBillInfo.ts**
  - Updates core bill information
  - Handles API pagination
  - Implements progress tracking
  - Generates detailed error reports

- **updateBillActions.ts**
  - Manages bill action updates
  - Implements append-only logic
  - Verifies successful updates
  - Handles trigger interactions

- **updateBillSubjects.ts**
  - Updates bill subjects and policy areas
  - Manages one-to-one relationships
  - Implements update verification
  - Tracks update timestamps

## Best Practices

### 1. File Organization
- Group related files by feature
- Keep components close to their usage
- Maintain clear separation of concerns
- Use consistent naming conventions

### 2. Component Structure
- Implement proper error boundaries
- Handle loading states
- Use TypeScript for type safety
- Follow accessibility guidelines

### 3. Service Layer
- Implement clean architecture
- Handle errors appropriately
- Use TypeScript for type safety
- Document public interfaces

### 4. State Management
- Separate concerns by feature
- Implement proper error handling
- Use TypeScript for type safety
- Document state shapes

### 5. Type Safety
- Use TypeScript strictly
- Define clear interfaces
- Document type definitions
- Validate data at boundaries

### 6. Database Management
- Keep SQL files in version control
- Document function security settings
- Maintain clear trigger documentation
- Use consistent naming conventions

### 7. Data Update Scripts
- Implement robust error handling
- Use TypeScript for type safety
- Document retry mechanisms
- Generate detailed logs

## Code Organization

### Directory Structure
```
├── app/                 # Next.js app directory with App Router
│   ├── bills/          # Bill-related pages
│   ├── learn/          # Learning resources
│   ├── api/            # API routes
│   ├── about/          # About pages
│   └── layout.tsx      # Root layout
├── components/          # React components
│   ├── ui/             # Base UI components
│   ├── bills/          # Bill-specific components
│   ├── layout/         # Layout components
│   └── shared/         # Shared components
├── lib/                # Core library code
│   ├── services/       # API and data services
│   ├── store/          # State management
│   ├── types/          # TypeScript types
│   ├── utils/          # Utility functions
│   ├── constants/      # Application constants
│   └── hooks/          # Custom React hooks
└── Documentation/      # Project documentation
```

### Component Organization Guidelines

1. **Group by Feature**
   - Related components should be grouped together
   - Shared/common components go in the ui folder
   - Feature-specific components in their own directories

2. **File Naming Conventions**
   - Use kebab-case for file names (e.g., `bill-card.tsx`)
   - Use PascalCase for component names (e.g., `BillCard`)
   - Names should be descriptive and indicate functionality

3. **TypeScript Best Practices**
   ```typescript
   // Use interfaces for props
   interface ComponentProps {
     prop1: string;
     prop2?: number;
   }

   // Use type for specific unions/literals
   type Status = 'pending' | 'approved' | 'rejected';
   ```

4. **Component Structure**
   ```tsx
   // Single responsibility principle
   // Clear props interface
   // Proper error handling
   export function Component({ prop1, prop2 }: ComponentProps) {
     // Implementation
   }
   ```

5. **Custom Hooks**
   ```tsx
   // Extract reusable logic into custom hooks
   function useCustomHook() {
     const [state, setState] = useState();
     // Hook logic
     return { state, setState };
   }
   ```

## Service Layer

### Data Services

#### Bills Service (`/lib/services/bills-service.ts`)
Primary service for bill-related operations.

Features:
- Query parameter handling
- Data transformation
- Error handling
- Type safety

Key operations:
- Fetching bills with filters
- Retrieving single bill details
- Managing bill relationships
- Handling pagination

#### Bill Storage Service (`/lib/services/bill-storage.ts`)
Handles direct database operations.

Responsibilities:
- Data persistence
- Schema validation
- Relationship management
- Progress tracking

### Type Definitions

#### Bill Types (`/lib/types/bill.ts`)
Core bill interfaces and types.

Key types:
- `Bill` - Core bill information
- `BillAction` - Legislative actions
- `BillSubject` - Policy areas
- `BillSummary` - Bill summaries

#### Query Types (`/lib/types/BillInfo.ts`)
Query and response interfaces.

Includes:
- `BillQueryParams` - Filter parameters
- `BillsResponse` - API response format
- `BillInfoResponse` - Database response

### Database Functions

#### Bill Functions (`/sql/functions/bill_functions.sql`)
Core database operations.

Features:
- Progress calculation
- Data validation
- Relationship management
- Timestamp handling

#### Triggers (`/sql/triggers/`)
Automated database operations.

Includes:
- Timestamp updates
- Progress recalculation
- Data validation
- Relationship maintenance

### Scripts

#### Data Update (`/scripts/DataUpdate/`)
Background service scripts.

Components:
- `updateMasterBill.ts` - Main update logic
- `updateBillInfo.ts` - Core data updates
- `updateBillActions.ts` - Action tracking
- `updateBillSubjects.ts` - Subject management