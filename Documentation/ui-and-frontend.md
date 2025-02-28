# UI & Frontend

## Styling

### Technology Stack

#### 1. Tailwind CSS
- Utility-first CSS framework
- Custom configuration
- Theme customization

#### 2. CSS Variables
```css
:root {
  --background: 0 0% 100%;
  --foreground: 0 0% 3.9%;
  --primary: 0 0% 9%;
  --secondary: 0 0% 96.1%;
  /* ... other variables */
}
```

### Color Palette

#### Brand Colors
- Primary: #002868 (Navy Blue)
- Secondary: #BF0A30 (Red)
- White: #FFFFFF

#### Functional Colors
- Success: #4CAF50
- Warning: #FFC107
- Error: #F44336

### Theme Support

#### Light Theme
- Background: White
- Text: Dark gray
- Subtle backgrounds: Light gray

#### Dark Theme
- Background: Dark gray
- Text: Light gray
- Subtle backgrounds: Darker gray

## Responsive Design

### Breakpoints

```css
sm: 640px  /* Small devices */
md: 768px  /* Medium devices */
lg: 1024px /* Large devices */
xl: 1280px /* Extra large devices */
```

### Component Adaptations

#### Navigation
- Mobile menu for small screens
- Condensed header on mobile
- Responsive search button

#### Bill Cards
- Single column on mobile
- Two columns on tablet
- Three columns on desktop
- Adjusted typography and spacing
- Consistent policy area badge placement
- Optimized title length for mobile
- Subtle entrance animations
- Interactive hover effects
- Motion-based cursor following (desktop only)

#### Bill Details Page
- Compact title and spacing on mobile
- Vertical progress stages on mobile
- Horizontal progress stages on desktop
- Consistent text hierarchy
- Full-width buttons on mobile
- Reduced padding on mobile
- PDF button next to title
- HTML-stripped summary for better readability
- Optimized sponsor information layout

#### Filters
- Horizontal scrolling on mobile
- Full width on larger screens
- Compact selects on mobile
- Consistent dropdown alignment
- Touch-friendly select options
- Clear visual feedback on selection

## Components

### Bill Components

#### BillCard
```tsx
// components/bills/bill-card.tsx
interface BillCardProps {
  bill: Bill;
}

// Features:
// - Displays full bill title
// - Shows policy area badge
// - Displays bill type and number
// - Shows progress description
// - Shows sponsor information with party and state
// - Consistent typography and spacing
// - Mobile-responsive layout
```

#### BillDetails
```tsx
// components/bills/bill-details.tsx
interface BillDetailsProps {
  bill: Bill;
}

// Features:
// - Clean, modern layout with consistent spacing
// - PDF viewer link with icon for full bill text
// - Dynamic progress bar with percentage
// - Visual stage indicators (mobile: vertical, desktop: horizontal)
// - HTML-stripped summary display
// - Comprehensive sponsor information
// - Full party name display (including Independent variations)
// - UTC-aware date formatting
```

#### BillsFilter
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
  // ...other onChange handlers
}

// Features:
// - Comprehensive filter options
// - Responsive filter layout
// - Debounced search input
// - Clear all filters option
// - Persistent filter state
// - Accessible form elements
```

### UI Components

#### Button
```tsx
// components/ui/button.tsx
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg';
}

// Features:
// - Multiple variants and sizes
// - Icon support
// - Accessible keyboard navigation
// - Proper focus states
// - Loading state support
```

#### Card
```tsx
// components/ui/card.tsx
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  // Extended props
}

// Features:
// - Consistent padding and spacing
// - Proper border radius
// - Optional hover effects
// - Accessible structure
```

### Common UI Patterns

#### Data Loading
- Skeleton loaders during data fetching
- Delayed loading indicators (prevent flash)
- Error state handling
- Empty state handling

#### Error Handling
- User-friendly error messages
- Clear recovery options
- Detailed error logging (non-visible)
- Consistent error styling

#### Accessibility Features
- Proper heading hierarchy
- ARIA labels for interactive elements
- Keyboard navigation support
- Skip links
- Color contrast compliance 