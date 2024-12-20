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
│   ├── ui/                # Base UI components
│   ├── bills/             # Bill-specific components
│   └── shared/            # Shared components
│
├── lib/                   # Utilities and helpers
│   ├── mock-data.ts       # Mock data
│   ├── types.ts           # TypeScript types
│   ├── utils.ts           # Utility functions
│   ├── supabase.ts        # Supabase client configuration
│   └── constants/         # Constants used throughout the app
│
├── scripts/               # Scripts for data management and syncing
│   ├── initial-data-sync.ts # Initial data synchronization script
│   ├── generate-icons.ts   # Icon generation script
│   ├── scheduled-sync.ts    # Scheduled sync script
│   └── sync-bills-with-summaries.ts # Sync bills with summaries script
│
├── hooks/                 # Custom React hooks
│   └── useCustomHook.ts    # Example of a custom hook
│
├── public/                # Static assets
│
├── styles/                # Global styles
│
├── Documentation/         # Project documentation
│   ├── api-documentation/  # API documentation
│   └── ...                # Other docs
│
└── README.md              # Project documentation home
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

## Assets and Icons

### Favicon and PWA Icons
The project uses an automated icon generation system that creates optimized favicons and PWA icons from a single source image:

- Source image: `public/images/logo.webp`
- Generated icons in `public/icons/`:
  - Multiple PNG sizes (16x16 to 512x512)
  - favicon.ico
  - apple-touch-icon.png

### Icon Generation
- Automated during build process
- Uses Sharp for optimized image processing
- Generates multiple sizes for different devices
- Creates PWA-compliant icons

### PWA Configuration
- Web app manifest (`app/manifest.ts`)
- Full PWA support
- Optimized for iOS and Android
- Theme color adaptation
- Offline capabilities

### Icon Optimization
- WebP source image for best quality/size ratio
- Transparent background support
- Automatic resizing with quality preservation
- Device-specific optimizations

### Usage
Icons are automatically generated during build:
```bash
npm run build # Includes icon generation
```

Manual icon generation:
```bash
npm run generate-icons
```