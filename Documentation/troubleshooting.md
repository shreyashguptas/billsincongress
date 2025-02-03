# Common Issues and Solutions

## Progress Stage Issues

### 1. Progress Bar Calculation
The application uses two different progress calculation methods that need to be kept in sync:

#### Database Progress Stage
```sql
-- Progress stages in database
20: Introduced
40: In Committee
60: Passed One Chamber
80: Passed Both Chambers
90: To President
95: Signed by President
100: Became Law
```

#### Component Progress Calculation
```typescript
// Convert stage (20-100) to percentage (0-100)
const normalizedProgress = ((stage - 20) / 80) * 100;
```

**Common Issues:**
- Progress stage coming as string instead of number
- Mismatch between database stage and UI calculation
- Zero progress showing for valid stages

**Solutions:**
- Always convert progress_stage to number: `Number(bill.progress_stage)`
- Use type-safe stage handling: `typeof stage === 'string' ? parseInt(stage, 10) : stage`
- Validate stage range: `Math.max(20, Math.min(100, stage))`

## Type Safety Issues

### 1. Async Params Handling
**Common Issues:**
- Type errors with async params
- Missing error handling for params resolution
- Incorrect return type annotations

**Solutions:**
- Use proper TypeScript types for async params
- Implement comprehensive error handling
- Add explicit return type annotations

### 2. Component State Management
**Common Issues:**
- HTML tags showing in text
- Hydration mismatches
- Missing error handling

**Solutions:**
- Parse HTML only on client side in useEffect
- Provide fallback content
- Implement proper error handling

### 3. Data Type Consistency
**Common Issues:**
- Inconsistent data types from API
- Missing fallback values
- Type conversion errors

**Solutions:**
- Add type checking and conversion
- Provide default values
- Use proper TypeScript types 