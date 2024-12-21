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
├── components/            # React components organized by feature
│   ├── ui/               # Reusable UI components (shadcn/ui based)
│   │   ├── card.tsx     # Card component for consistent content display
│   │   ├── progress.tsx # Progress indicator for bill status
│   │   └── badge.tsx    # Badge component for status and tags
│   └── bills/           # Bill-specific components
│       ├── bill-card.tsx    # Card component for bill preview
│       └── featured-bills.tsx# Featured bills section component
│
├── lib/                  # Core application logic and utilities
│   ├── services/        # Service layer for data operations
│   │   └── bills-service.ts # Bills data service with Supabase integration
│   ├── store/           # State management
│   │   ├── bills-store.ts   # Bills state management
│   │   └── ui-store.ts      # UI state management
│   ├── types/           # TypeScript type definitions
│   │   └── BillInfo.ts      # Bill-related type definitions
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