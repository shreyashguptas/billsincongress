# Styling Documentation

## Technology Stack

### 1. Tailwind CSS
- Utility-first CSS framework
- Custom configuration
- Theme customization

### 2. CSS Variables
```css
:root {
  --background: 0 0% 100%;
  --foreground: 0 0% 3.9%;
  --primary: 0 0% 9%;
  --secondary: 0 0% 96.1%;
  /* ... other variables */
}
```

## Color Palette

### Brand Colors
- Primary: #002868 (Navy Blue)
- Secondary: #BF0A30 (Red)
- White: #FFFFFF

### Functional Colors
- Success: #4CAF50
- Warning: #FFC107
- Error: #F44336

## Theme Support

### Light Theme
- Background: White
- Text: Dark gray
- Subtle backgrounds: Light gray

### Dark Theme
- Background: Dark gray
- Text: Light gray
- Subtle backgrounds: Darker gray

## Component Styling

### Cards
```tsx
// Example card styling
<Card className="h-full transition-shadow hover:shadow-lg">
  <CardHeader>...</CardHeader>
  <CardContent>...</CardContent>
</Card>
```

### Buttons
```tsx
// Primary button
<Button>Primary Action</Button>

// Secondary button
<Button variant="outline">Secondary Action</Button>
```

## Responsive Design

### Breakpoints
```css
sm: 640px   /* @media (min-width: 640px) */
md: 768px   /* @media (min-width: 768px) */
lg: 1024px  /* @media (min-width: 1024px) */
xl: 1280px  /* @media (min-width: 1280px) */
2xl: 1536px /* @media (min-width: 1536px) */
```

### Grid System
```tsx
// Responsive grid example
<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
  {/* Content */}
</div>
```

## Best Practices

1. Consistent Spacing
   - Use Tailwind's spacing scale
   - Maintain rhythm with consistent gaps

2. Typography
   - Use type scale classes
   - Maintain readable line lengths

3. Accessibility
   - Sufficient color contrast
   - Focus states
   - Interactive element styling