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
```

### BillsFilter
```tsx
// components/bills/bills-filter.tsx
interface BillsFilterProps {
  statusFilter: string;
  introducedDateFilter: string;
  lastActionDateFilter: string;
  sponsorFilter: string;
  stateFilter: string;
  onStatusChange: (value: string) => void;
  onIntroducedDateChange: (value: string) => void;
  onLastActionDateChange: (value: string) => void;
  onSponsorChange: (value: string) => void;
  onStateChange: (value: string) => void;
  onClearAllFilters: () => void;
}
Features:
- Status filter with all bill stages
- Introduced date filter (week/month/year)
- Last action date filter (week/month/year)
- Sponsor name search with exact first name matching
- State filter with full state names
- Clear all filters button
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

4. Accessibility
   - ARIA labels
   - Keyboard navigation
   - Screen reader support