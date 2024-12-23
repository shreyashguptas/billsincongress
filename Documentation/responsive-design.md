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
- Consistent policy area badge placement
- Optimized title length for mobile
- Subtle entrance animations
- Interactive hover effects
- Motion-based cursor following (desktop only)

### Bill Details Page
- Compact title and spacing on mobile
- Vertical progress stages on mobile
- Horizontal progress stages on desktop
- Consistent text hierarchy
- Full-width buttons on mobile
- Reduced padding on mobile
- PDF button next to title
- HTML-stripped summary for better readability
- Optimized sponsor information layout

### Filters
- Horizontal scrolling on mobile
- Full width on larger screens
- Compact selects on mobile
- Consistent dropdown alignment
- Touch-friendly select options
- Clear visual feedback on selection

## Implementation Details

### Typography
```tsx
// Responsive text sizes
text-sm sm:text-base    // Body text
text-base sm:text-lg    // Large text
text-2xl sm:text-4xl    // Headings
text-xs sm:text-sm      // Small text

// Bill title handling
line-clamp-2 sm:line-clamp-3  // Title truncation
leading-tight sm:leading-snug // Line height
```

### Layout
```tsx
// Responsive containers
container px-4           // Consistent padding
flex-col sm:flex-row    // Stack to row
gap-4 sm:gap-6          // Adjusted spacing
p-4 sm:p-8              // Responsive padding
mb-4 sm:mb-8            // Responsive margins

// Bill details layout
flex-col lg:flex-row    // Vertical to horizontal layout
space-y-4 lg:space-x-6  // Spacing adjustments
w-full lg:w-2/3         // Width constraints
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

// Dropdowns
min-w-[200px]          // Minimum width for dropdowns
max-h-[300px]          // Maximum height with scrolling
p-2 sm:p-3            // Touch-friendly padding
```

### Animations
```tsx
// Entrance animations
.slide-up {
  @apply opacity-0 translate-y-4 motion-safe:animate-slide-up;
}

// Hover effects
.hover-lift {
  @apply transition-transform duration-300 ease-out hover:-translate-y-1;
}

// Cursor following (desktop only)
.cursor-follow {
  @apply hidden lg:block transform-gpu transition-transform duration-200;
  transform-style: preserve-3d;
  perspective: 1000px;
}

// Stagger children animations
.stagger-children > * {
  @apply opacity-0;
  animation: slide-up 0.5s ease-out forwards;
  animation-delay: calc(var(--index) * 100ms);
}

// Reduced motion
@media (prefers-reduced-motion: reduce) {
  .slide-up, .hover-lift, .cursor-follow {
    @apply transform-none transition-none animate-none;
  }
}
```

## Best Practices

1. Mobile-First Approach
   - Base styles for mobile
   - Progressive enhancement
   - Breakpoint-specific adjustments
   - Consistent spacing system

2. Performance
   - Hardware-accelerated animations
   - Use transform-gpu for 3D transforms
   - Debounce cursor tracking
   - Minimal layout shifts
   - Smooth transitions
   - Lazy load off-screen content
   - Optimize animation frames
   - Batch DOM updates

3. Content Adaptation
   - Vertical layouts on mobile
   - Horizontal layouts on desktop
   - Touch-friendly tap targets (minimum 44px)
   - Full-width buttons on mobile
   - Smart text truncation

4. Typography
   - Reduced font sizes on mobile
   - Consistent type scale
   - Proper line heights
   - Adequate contrast
   - HTML content sanitization

5. Interactive Elements
   - Clear hover states
   - Focus indicators
   - Touch-friendly targets
   - Consistent dropdown behavior
   - Proper spacing between interactive elements

6. Animation Guidelines
   - Use subtle, purposeful animations
   - Respect reduced-motion preferences
   - Disable complex animations on mobile
   - Use hardware acceleration
   - Implement staggered loading
   - Keep durations under 400ms
   - Use appropriate easing curves
   - Avoid animation jank

7. Testing
   - Multiple device testing
   - Browser compatibility
   - Orientation changes
   - Touch interaction testing
   - Keyboard navigation
   - Screen reader compatibility
   - Animation performance testing
   - Frame rate monitoring