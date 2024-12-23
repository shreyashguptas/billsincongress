# Components Documentation

## Bill Components

### BillCard
```tsx
// components/bills/bill-card.tsx
interface BillCardProps {
  bill: Bill;
}
Features:
- Displays full bill title
- Shows policy area badge
- Displays bill type and number
- Shows progress description
- Shows sponsor information with party and state
- Consistent typography and spacing
- Mobile-responsive layout
```

### BillDetails
```tsx
// components/bills/bill-details.tsx
interface BillDetailsProps {
  bill: Bill;
}
Features:
- Clean, modern layout with consistent spacing
- PDF viewer link with icon for full bill text
- Dynamic progress bar with percentage
- Visual stage indicators (mobile: vertical, desktop: horizontal)
- HTML-stripped summary display
- Comprehensive sponsor information
- Full party name display (including Independent variations)
- UTC-aware date formatting
```

### BillsFilter
```tsx
// components/bills/bills-filter.tsx
interface BillsFilterProps {
  statusFilter: string;
  introducedDateFilter: string;
  lastActionDateFilter: string;
  sponsorFilter: string;
  titleFilter: string;
  stateFilter: string;
  policyAreaFilter: string;
  billTypeFilter: string;
  onStatusChange: (value: string) => void;
  onIntroducedDateChange: (value: string) => void;
  onLastActionDateChange: (value: string) => void;
  onSponsorChange: (value: string) => void;
  onTitleChange: (value: string) => void;
  onStateChange: (value: string) => void;
  onPolicyAreaChange: (value: string) => void;
  onBillTypeChange: (value: string) => void;
  onClearAllFilters: () => void;
}
Features:
- Two-row layout for better organization
- First row: Dropdown filters
  - Policy area categories with scrollable list
  - Status filter with all bill stages
  - Bill type filter with full descriptions
  - Introduced date filter (week/month/year)
  - Last action date filter (week/month/year)
  - State filter with full state names
- Second row: Search inputs
  - Title search with multi-word support
  - Sponsor name search with flexible matching
- Clear all filters button
- Space-aware text search handling
- Case-insensitive search
- Consistent dropdown alignment
```

### BillsPage
```tsx
// app/bills/page.tsx
Features:
- Dynamic Congress session display (year range)
- Persistent filter state using localStorage
- Responsive grid layout
- Load more functionality
- Error handling and loading states
- Total bill count display
```

## UI Components

### Button
```tsx
// components/ui/button.tsx
Features:
- Multiple variants (default, outline)
- Loading state support
- Disabled state handling
```

### Card
```tsx
// components/ui/card.tsx
Components:
- Card
- CardHeader
- CardContent
- CardTitle
Features:
- Consistent padding and spacing
- Hover state for interactive cards
- Flexible content layout
- Mobile-responsive spacing
```

### Select
```tsx
// components/ui/select.tsx
Components:
- Select
- SelectTrigger
- SelectContent
- SelectItem
- SelectValue
Features:
- Accessible dropdown
- Custom trigger styling
- Keyboard navigation
- Consistent alignment
```

### Badge
```tsx
// components/ui/badge.tsx
Features:
- Multiple variants (default, outline)
- Policy area display
- Status indicators
```

## Component Best Practices

1. Single Responsibility
   - Each component has one main purpose
   - Clear and focused functionality

2. Props Interface
   - TypeScript interfaces for props
   - Required vs optional props

3. Error Handling
   - Fallback UI for loading states
   - Error messages for no results
   - Graceful degradation

4. Accessibility
   - ARIA labels
   - Keyboard navigation
   - Screen reader support

5. Mobile Responsiveness
   - Flexible layouts
   - Appropriate text sizes
   - Touch-friendly targets

6. Data Formatting
   - UTC-aware date handling
   - HTML content sanitization
   - Consistent text formatting