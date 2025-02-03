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

## Learning Center Components

### USMap
```tsx
// app/learn/components/us-map.tsx
interface USMapProps {
  onStateHover: (state: StateData | null) => void;
}

interface StateData {
  name: string;
  representatives: number;
  abbreviation: string;
}

Features:
- Interactive SVG map of United States
- Dynamic color shading based on number of representatives
- Hover effects with state information tooltip
- Responsive design (mobile and desktop)
- Automatic calculation of total representatives and senators
- Accessible SVG with ARIA labels
- Production-ready with fallback image
- Light/dark mode support
- Touch device support

Technical Details:
- SVG manipulation using contentDocument
- Dynamic style injection for SVG elements
- Retry mechanism for production environments
- Event delegation for performance
- Viewport-relative positioning for tooltips
- Semantic color tokens for theme support
```

### CongressSection
```tsx
// app/learn/components/congress-section.tsx
interface CongressInfo {
  title: string;
  description: string;
  totalMembers: number;
  color: string;
  details: string[];
}

Features:
- Comprehensive overview of Congress structure
- Animated Capitol Building image with parallax effect
- Interactive chamber cards (House and Senate)
- Responsive layout with grid system
- Motion animations for enhanced UX
- Semantic HTML structure
- Optimized images with multiple formats
- Consistent typography and spacing
```

Best Practices:
1. SVG Handling
   - Proper viewBox setup
   - Responsive scaling
   - Performance optimization
   - Touch event handling

2. State Management
   - Efficient hover state tracking
   - Centralized data management
   - Type-safe interfaces

3. Accessibility
   - ARIA labels for interactive elements
   - Keyboard navigation support
   - Screen reader friendly content
   - Color contrast compliance

4. Performance
   - Optimized event listeners
   - Efficient SVG manipulation
   - Proper cleanup on unmount
   - Production fallbacks

5. Mobile Considerations
   - Touch-friendly interactions
   - Responsive text sizing
   - Appropriate spacing
   - Viewport-aware layouts

## SVG and Interactive Maps

### SVG Best Practices

1. **Performance Optimization**
   ```typescript
   // Optimize SVG loading and manipulation
   const initializeMap = () => {
     // Use contentDocument for SVG manipulation
     const doc = obj.contentDocument;
     if (!doc) return;
     
     // Batch SVG updates
     const svg = doc.querySelector('svg');
     if (!svg) return;
     
     // Set attributes efficiently
     svg.setAttribute('width', '100%');
     svg.setAttribute('height', '100%');
   };
   ```

2. **Accessibility Implementation**
   ```typescript
   // Make SVGs accessible
   <object
     aria-label="Interactive map"
     role="img"
     tabIndex={0}
   >
     <img alt="Fallback map image" />
   </object>
   ```

3. **Event Handling**
   ```typescript
   // Efficient event delegation
   svg.addEventListener('mouseover', (e) => {
     const path = e.target.closest('path');
     if (!path) return;
     // Handle interaction
   });
   ```

4. **Production Readiness**
   ```typescript
   // Implement retry mechanism
   let retryCount = 0;
   const maxRetries = 3;
   const retryInterval = setInterval(() => {
     if (isLoaded || retryCount >= maxRetries) {
       clearInterval(retryInterval);
       return;
     }
     initializeMap();
     retryCount++;
   }, 1000);
   ```

### Interactive Map Guidelines

1. **User Experience**
   - Provide clear hover states
   - Implement touch support
   - Show loading states
   - Handle errors gracefully

2. **Performance**
   - Optimize SVG assets
   - Use efficient event handlers
   - Implement proper cleanup
   - Batch DOM updates

3. **Accessibility**
   - Keyboard navigation
   - Screen reader support
   - Touch device support
   - Clear visual feedback

4. **Responsive Design**
   - Proper scaling
   - Touch-friendly targets
   - Responsive tooltips
   - Appropriate text sizing