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