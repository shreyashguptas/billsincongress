# Database & Data Management

## Database Schema

### Core Tables

#### 1. Bill Information (`bill_info`)
Primary table containing core bill data. See implementation in `/sql/tables/BillInfo.sql`.

Key Features:
- Unique bill identifier system
- Core bill metadata
- Progress tracking fields
- Relationship management

#### 2. Bill Actions (`bill_actions`)
Tracks legislative actions on bills. See implementation in `/sql/tables/BillActions.sql`.

#### 3. Bill Subjects (`bill_subjects`)
Maps bills to policy areas. See implementation in `/sql/tables/BillSubjects.sql`.

#### 4. Bill Summaries (`bill_summaries`)
Stores bill summary versions. See implementation in `/sql/tables/BillSummaries.sql`.

#### 5. Bill Text (`bill_text`)
Manages bill text versions. See implementation in `/sql/tables/BillText.sql`.

## Progress Stage Tracking

Bills progress through various stages in the legislative process. The progress is tracked using numeric stages:

1. Stage 100: Became Law
2. Stage 95: Signed by President
3. Stage 90: To President
4. Stage 80: Passed Both Chambers
5. Stage 60: Passed One Chamber
6. Stage 40: In Committee
7. Stage 20: Introduced

Progress calculation is handled by database functions. See implementation in `/sql/functions/bill_functions.sql`.

## Custom Database Functions

### Naming Conventions

All custom database functions follow a structured naming pattern to ensure consistency and clarity:

1. **Prefix**: `app_` - Identifies functions specific to our application.
2. **Action**: Verb describing the function's action (e.g., `get_`, `update_`, `calculate_`).
3. **Subject**: The data entity being operated on.
4. **Qualifier** (optional): Additional context when needed.

Example: `app_get_distinct_congress_numbers`

### Security Best Practices

All custom functions should:

1. Include `SECURITY DEFINER` to run with the creator's permissions
2. Explicitly `SET search_path = public` to prevent search path injection attacks
3. Include a `COMMENT` describing the function's purpose
4. Include appropriate error handling

### Implementation Template

```sql
-- Function template
CREATE OR REPLACE FUNCTION public.app_[action]_[subject]([parameters])
RETURNS [return_type] AS $$
DECLARE
    [variable declarations]
BEGIN
    -- Set search path explicitly for security
    SET search_path = 'public';
    
    -- Function logic here
    
    RETURN [result];
END;
$$ LANGUAGE plpgsql 
   SECURITY DEFINER 
   SET search_path = public;

-- Add comment for documentation
COMMENT ON FUNCTION public.app_[action]_[subject]([parameters]) IS 
'[Description of what the function does]';
```

### Existing Custom Functions

#### 1. `app_get_distinct_congress_numbers()`

**Purpose**: Returns an array of all unique congress numbers from the bill_info table in descending order.

**Implementation**:
```sql
CREATE OR REPLACE FUNCTION public.app_get_distinct_congress_numbers()
RETURNS integer[] AS $$
DECLARE
    result integer[];
BEGIN
    SET search_path = 'public';
    
    SELECT ARRAY(
        SELECT DISTINCT congress 
        FROM bill_info 
        WHERE congress IS NOT NULL 
        ORDER BY congress DESC
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql 
   SECURITY DEFINER 
   SET search_path = public;

COMMENT ON FUNCTION public.app_get_distinct_congress_numbers() IS 
'Returns an array of all unique congress numbers from the bill_info table in descending order';
```

**Usage in TypeScript**:
```typescript
async getAvailableCongressNumbers(): Promise<number[]> {
  const supabase = this.getClient();
  
  try {
    const { data, error } = await supabase.rpc('app_get_distinct_congress_numbers');
    
    if (error) {
      console.error('Error calling app_get_distinct_congress_numbers:', error);
      throw error;
    }
    
    return data;
  } catch (error) {
    console.error('Failed to get congress numbers:', error);
    return [];
  }
}
```

### Function Types by Feature Area

Different feature areas should use different naming patterns to maintain organization:

1. **Bill Data Functions**: `app_bill_[action]_[subject]`
   - Example: `app_bill_get_recent_actions`

2. **Filter Functions**: `app_filter_[subject]_by_[criteria]`
   - Example: `app_filter_bills_by_sponsor`

3. **Search Functions**: `app_search_[subject]_[criteria]`
   - Example: `app_search_bills_text`

4. **Utility Functions**: `app_util_[action]_[subject]`
   - Example: `app_util_format_bill_number`

## Data Services

### Bill Storage Service
Handles database operations for bill data. See implementation in `/lib/services/bill-storage.ts`.

Key responsibilities:
- Bill data retrieval
- Data persistence
- Progress tracking

### Bill Update Service
Manages updating bill data from external APIs. See implementation in `/scripts/DataUpdate/`.

Key features:
- Connects to Congress.gov API
- Respects rate limits (5,000 requests/hour)
- Implements pagination (250 records/page)
- Handles API authentication
- Validates incoming data
- Transforms to database schema
- Handles data type conversions
- Manages relationships
- Uses upsert operations
- Maintains data consistency
- Triggers progress recalculation
- Updates timestamps
- Implements retry mechanisms
- Logs errors comprehensively
- Maintains partial progress
- Sends failure notifications

## Data Flows

### Bill Creation Flow
1. External API data fetched
2. Data validated and transformed
3. Bill created in database
4. Related entities created (subjects, actions, etc.)
5. Progress calculated

### Bill Update Flow
1. New data fetched from API
2. Changes detected using timestamps
3. Bill updated with new information
4. Related entities updated
5. Progress recalculated if needed

### Data Access Patterns
1. **By ID**: Direct lookup using bill ID
2. **By Filter**: Filtered lookup using query parameters
3. **By Search**: Text search across bill titles and content
4. **By Status**: Lookup by progress stage

## Common Data Issues and Resolutions

### 1. Data Consistency
**Issue**: Inconsistent progress stages between database and UI.  
**Resolution**: Ensure proper type handling and stage normalization.

### 2. Data Synchronization
**Issue**: Out-of-sync bill data with external sources.  
**Resolution**: Implement regular update jobs with proper error handling.

### 3. Type Safety
**Issue**: Type errors when processing bill data.  
**Resolution**: Implement proper TypeScript interfaces and type guards. 