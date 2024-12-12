# Responsive Design Implementation

## Breakpoints

```css
sm: 640px  /* Small devices */
md: 768px  /* Medium devices */
lg: 1024px /* Large devices */
xl: 1280px /* Extra large devices */
```

## Component Adaptations

### Navigation
- Mobile menu for small screens
- Condensed header on mobile
- Responsive search button

### Bill Cards
- Single column on mobile
- Two columns on tablet
- Three columns on desktop
- Adjusted typography and spacing

### Filters
- Horizontal scrolling on mobile
- Full width on larger screens
- Compact selects on mobile

## Implementation Details

### Typography
```tsx
// Responsive text sizes
text-base sm:text-lg     // Base text
text-2xl sm:text-3xl     // Headings
text-xs sm:text-sm       // Small text
```

### Layout
```tsx
// Responsive containers
container px-4           // Consistent padding
flex-col sm:flex-row    // Stack to row
gap-4 sm:gap-6          // Adjusted spacing
```

### Components
```tsx
// Responsive components
w-full sm:w-auto        // Full width to auto
h-14 sm:h-16           // Adjusted heights
space-y-4 sm:space-y-6 // Vertical spacing
```

## Best Practices

1. Mobile-First Approach
   - Base styles for mobile
   - Progressive enhancement
   - Breakpoint-specific adjustments

2. Performance
   - Optimized images
   - Efficient layouts
   - Minimal layout shifts

3. Testing
   - Multiple device testing
   - Browser compatibility
   - Orientation changes