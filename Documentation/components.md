# Components Documentation

## UI Components

### Navigation
```tsx
// components/navigation.tsx
- Primary navigation component
- Responsive design
- Theme toggle integration
```

### Bill Components

#### BillCard
```tsx
// components/bills/bill-card.tsx
- Displays individual bill information
- Props:
  - bill: Bill
- Features:
  - Progress indicator
  - Tags display
  - Status information
```

#### BillHeader
```tsx
// components/bills/bill-header.tsx
- Header for individual bill pages
- Props:
  - bill: Bill
- Features:
  - Title display
  - Share functionality
  - Introduction date
```

#### BillProgressCard
```tsx
// components/bills/bill-progress-card.tsx
- Shows bill progress
- Props:
  - bill: Bill
- Features:
  - Progress bar
  - Status display
```

#### BillContentTabs
```tsx
// components/bills/bill-content-tabs.tsx
- Tabbed content for bill details
- Props:
  - bill: Bill
- Tabs:
  - Summary
  - Timeline
  - Full Text
```

## Layout Components

### ThemeProvider
```tsx
// components/theme-provider.tsx
- Manages theme state
- Provides dark/light mode
```

### Footer
```tsx
// components/footer.tsx
- Site-wide footer
- Links and information
```

## Shared Components

### UI Components from shadcn/ui
- Button
- Card
- Progress
- Tabs
- Badge
- Avatar
- etc.

## Component Best Practices

1. Single Responsibility
   - Each component has one main purpose
   - Clear and focused functionality

2. Props Interface
   - TypeScript interfaces for props
   - Required vs optional props

3. Error Handling
   - Fallback UI
   - Error boundaries

4. Accessibility
   - ARIA labels
   - Keyboard navigation
   - Screen reader support