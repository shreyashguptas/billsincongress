# Project Structure

## Directory Overview

```
project/
├── app/                    # Next.js app directory
│   ├── bills/             # Bill-related pages
│   ├── about/             # About page
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Home page
│
├── components/            # React components
│   ├── ui/               # Base UI components
│   ├── bills/            # Bill-specific components
│   └── shared/           # Shared components
│
├── lib/                   # Utilities and helpers
│   ├── mock-data.ts      # Mock data
│   ├── types.ts          # TypeScript types
│   └── utils.ts          # Utility functions
│
├── Documentation/         # Project documentation
│   ├── README.md         # Documentation home
│   └── ...               # Other docs
│
├── public/               # Static assets
│
└── styles/               # Global styles
```

## Key Directories

### App Directory
- Modern Next.js App Router
- Page components
- Layouts
- Route groups

### Components Directory
- Reusable UI components
- Feature-specific components
- Layout components

### Lib Directory
- Shared utilities
- Type definitions
- Constants
- Helper functions

### Documentation Directory
- Project documentation
- Architecture details
- Component documentation
- Best practices

## File Naming Conventions

### Components
- PascalCase for component files
- `.tsx` extension for TypeScript
- Example: `BillCard.tsx`

### Pages
- Lowercase with hyphens
- `page.tsx` for pages
- Example: `bills/page.tsx`

### Utilities
- Camel case
- Descriptive names
- Example: `mockData.ts`

## Configuration Files

### Next.js Config
```javascript
// next.config.js
module.exports = {
  // Configuration options
};
```

### TypeScript Config
```javascript
// tsconfig.json
{
  "compilerOptions": {
    // Compiler options
  }
}
```

### Tailwind Config
```javascript
// tailwind.config.js
module.exports = {
  // Tailwind configuration
};
```

## Best Practices

1. Organization
   - Group related files
   - Clear separation of concerns
   - Logical file structure

2. Naming
   - Consistent conventions
   - Descriptive names
   - Clear purpose

3. Imports
   - Absolute imports
   - Organized imports
   - Clear dependencies