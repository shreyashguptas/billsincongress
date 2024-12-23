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

### Bill Details Page
- Compact title and spacing on mobile
- Vertical progress stages on mobile
- Horizontal progress stages on desktop
- Consistent text hierarchy
- Full-width buttons on mobile
- Reduced padding on mobile

### Filters
- Horizontal scrolling on mobile
- Full width on larger screens
- Compact selects on mobile

## Implementation Details

### Typography
```tsx
// Responsive text sizes
text-sm sm:text-base    // Body text
text-base sm:text-lg    // Large text
text-2xl sm:text-4xl    // Headings
text-xs sm:text-sm      // Small text
```

### Layout
```tsx
// Responsive containers
container px-4           // Consistent padding
flex-col sm:flex-row    // Stack to row
gap-4 sm:gap-6          // Adjusted spacing
p-4 sm:p-8              // Responsive padding
mb-4 sm:mb-8            // Responsive margins
```

### Components
```tsx
// Responsive components
w-full sm:w-auto        // Full width to auto
h-14 sm:h-16           // Adjusted heights
space-y-4 sm:space-y-6 // Vertical spacing

// Progress Bar
h-3 sm:h-4             // Smaller on mobile
block sm:hidden        // Mobile-only elements
hidden sm:flex         // Desktop-only elements
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

3. Content Adaptation
   - Vertical layouts on mobile
   - Horizontal layouts on desktop
   - Touch-friendly tap targets
   - Full-width buttons on mobile

4. Typography
   - Reduced font sizes on mobile
   - Consistent type scale
   - Proper line heights
   - Adequate contrast

5. Testing
   - Multiple device testing
   - Browser compatibility
   - Orientation changes
   - Touch interaction testing