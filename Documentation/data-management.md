# Data Management

## Service Layer

### BillsService

The `BillsService` class is responsible for handling all bill-related data operations. It provides a clean interface for fetching and transforming bill data from our Supabase database.

```typescript
class BillsService {
  constructor(private supabase: SupabaseClient) {}

  async fetchBills(params: BillQueryParams): Promise<BillsResponse> {
    // Implementation
  }

  async fetchBill(id: string): Promise<BillInfo | null> {
    // Implementation
  }

  async fetchFeaturedBills(): Promise<BillInfo[]> {
    // Implementation
  }
}
```

### Query Parameters

```typescript
interface BillQueryParams {
  page?: number;
  limit?: number;
  congress?: number;
  billType?: string;
  sponsor?: string;
  // ... other filter parameters
}
```

### Response Types

```typescript
interface BillsResponse {
  data: BillInfo[];
  count: number;
  error: Error | null;
}

interface BillInfo {
  id: string;
  title: string;
  introduced_date: string;
  bill_type_label: string;
  bill_number: string;
  congress: number;
  sponsor_first_name: string;
  sponsor_last_name: string;
  sponsor_party: string;
  sponsor_state: string;
  latest_action_text?: string;
  latest_action_date?: string;
  progress_description?: string;
  bill_subjects?: {
    policy_area_name: string;
  };
}
```

## Database Schema

### Core Tables Overview

The database is structured around a central `bill_info` table with several related tables containing specific aspects of bills. All related tables use the bill's ID as a foreign key, creating a hub-and-spoke model where `bill_info` is the hub.

### Table Relationships

```mermaid
erDiagram
    bill_info ||--o{ bill_actions : has
    bill_info ||--|| bill_subjects : has
    bill_info ||--o{ bill_summaries : has
    bill_info ||--o{ bill_text : has
    bill_info ||--o{ bill_titles : has
```

### Table Structures

#### 1. Bill Info (`bill_info`)
Primary table containing core bill information.

**Primary Key**: `id` (TEXT)

| Column | Type | Description | Example |
|--------|------|-------------|----------|
| id | TEXT | Unique identifier formatted as {number}{type}{congress} | "114hr118" |
| introduced_date | DATE | Date bill was introduced | "2023-01-09" |
| sponsor_bioguide_id | TEXT | Sponsor's bioguide ID | "B001302" |
| sponsor_district | INTEGER | Sponsor's district number | 5 |
| sponsor_first_name | TEXT | Sponsor's first name | "Andy" |
| sponsor_last_name | TEXT | Sponsor's last name | "Biggs" |
| sponsor_party | TEXT | Sponsor's party | "R" |
| sponsor_state | TEXT | Sponsor's state | "AZ" |
| sponsor_is_by_request | TEXT | If bill was by request | "N" |
| update_date | TIMESTAMP WITH TIME ZONE | Last update date | "2024-06-11T15:57:35Z" |
| update_date_including_text | TIMESTAMP WITH TIME ZONE | Last update including text changes | "2024-06-11T15:57:35Z" |
| created_at | TIMESTAMP WITH TIME ZONE | Record creation timestamp | Auto-generated |
| updated_at | TIMESTAMP WITH TIME ZONE | Record update timestamp | Auto-generated |
| latest_action_code | TEXT | The most recent action code from the bill's legislative history | "36000" |
| latest_action_date | DATE | The date of the most recent action taken on the bill | "2024-06-11" |
| latest_action_text | TEXT | A description of the most recent action taken on the bill | "Passed in House" |
| progress_stage | INTEGER | The current stage of the bill in the legislative process | 60 |
| progress_description | TEXT | A textual description of the bill's progress | "Passed First Chamber" |

#### 2. Bill Actions (`bill_actions`)
Contains all actions taken on a bill.

**Primary Key**: Composite (`id`, `action_code`, `action_date`)
**Foreign Key**: `id` references `bill_info(id)`

| Column | Type | Description | Example |
|--------|------|-------------|----------|
| id | TEXT | References bill_info(id) | "114hr118" |
| action_code | TEXT | Unique code for the action | "36000" |
| action_date | DATE | Date of the action | "2022-04-06" |
| source_system_code | INTEGER | System code for action source | 9 |
| source_system_name | TEXT | Name of source system | "Library of Congress" |
| text | TEXT | Description of the action | "Became Public Law No: 117-108." |
| type | TEXT | Type of action | "BecameLaw" |
| created_at | TIMESTAMP WITH TIME ZONE | Record creation timestamp | Auto-generated |
| updated_at | TIMESTAMP WITH TIME ZONE | Record update timestamp | Auto-generated |

#### 3. Bill Subjects (`bill_subjects`)
Contains policy area information for each bill.

**Primary Key**: `id`
**Foreign Key**: `id` references `bill_info(id)`

| Column | Type | Description | Example |
|--------|------|-------------|----------|
| id | TEXT | References bill_info(id) | "114hr118" |
| policy_area_name | TEXT | Name of policy area | "Government Operations and Politics" |
| policy_area_update_date | TIMESTAMP WITH TIME ZONE | Last update of policy area | "2023-01-19T23:47:02Z" |
| created_at | TIMESTAMP WITH TIME ZONE | Record creation timestamp | Auto-generated |
| updated_at | TIMESTAMP WITH TIME ZONE | Record update timestamp | Auto-generated |

#### 4. Bill Summaries (`bill_summaries`)
Contains different versions of bill summaries.

**Primary Key**: Composite (`id`, `version_code`)
**Foreign Key**: `id` references `bill_info(id)`

| Column | Type | Description | Example |
|--------|------|-------------|----------|
| id | TEXT | References bill_info(id) | "114hr118" |
| action_date | DATE | Date of summary action | "2023-01-09" |
| action_desc | TEXT | Description of summary action | "Introduced in House" |
| text | TEXT | Summary text content | HTML formatted text |
| update_date | TIMESTAMP WITH TIME ZONE | Last update timestamp | "2023-01-20T19:19:57Z" |
| version_code | TEXT | Version identifier | "00" |
| created_at | TIMESTAMP WITH TIME ZONE | Record creation timestamp | Auto-generated |
| updated_at | TIMESTAMP WITH TIME ZONE | Record update timestamp | Auto-generated |

#### 5. Bill Text (`bill_text`)
Contains links to different versions of bill text.

**Primary Key**: Composite (`id`, `date`, `type`)
**Foreign Key**: `id` references `bill_info(id)`

| Column | Type | Description | Example |
|--------|------|-------------|----------|
| id | TEXT | References bill_info(id) | "114hr118" |
| date | TIMESTAMP WITH TIME ZONE | Version date | "2023-01-09T05:00:00Z" |
| formats_url_txt | TEXT | URL to HTML version | "https://..." |
| formats_url_pdf | TEXT | URL to PDF version | "https://..." |
| type | TEXT | Version type | "Introduced in House" |
| created_at | TIMESTAMP WITH TIME ZONE | Record creation timestamp | Auto-generated |
| updated_at | TIMESTAMP WITH TIME ZONE | Record update timestamp | Auto-generated |

#### 6. Bill Titles (`bill_titles`)
Contains different titles associated with bills.

**Primary Key**: Composite (`id`, `title_type_code`, `title`)
**Foreign Key**: `id` references `bill_info(id)`

| Column | Type | Description | Example |
|--------|------|-------------|----------|
| id | TEXT | References bill_info(id) | "114hr118" |
| title | TEXT | The title text | "Postal Service Reform Act of 2022" |
| title_type | TEXT | Type of title | "Display Title" |
| title_type_code | INTEGER | Code for title type | 45 |
| update_date | TIMESTAMP WITH TIME ZONE | Last update timestamp | "2023-01-11T13:49:52Z" |
| bill_text_version_code | TEXT | Optional version code | "RH" |
| bill_text_version_name | TEXT | Optional version name | "Reported in House" |
| chamber_code | TEXT | Optional chamber code | "H" |
| chamber_name | TEXT | Optional chamber name | "House" |
| created_at | TIMESTAMP WITH TIME ZONE | Record creation timestamp | Auto-generated |
| updated_at | TIMESTAMP WITH TIME ZONE | Record update timestamp | Auto-generated |

### Common Features Across Tables

1. **Timestamps**
   - All tables include `created_at` and `updated_at` columns
   - Auto-managed by triggers for tracking record history

2. **Row Level Security (RLS)**
   - All tables have RLS enabled
   - Read access for authenticated users
   - Write access restricted to service role

3. **Indexing Strategy**
   - Primary key columns are automatically indexed
   - Foreign key columns have dedicated indexes
   - Additional indexes on frequently queried columns

4. **Cascade Deletion**
   - All child tables have ON DELETE CASCADE
   - Deleting from bill_info cascades to all related records

### Data Integrity

1. **Primary Keys**
   - `bill_info`: Single column (id)
   - Other tables: Composite keys including id
   - Ensures unique identification of records

2. **Foreign Keys**
   - All tables reference bill_info(id)
   - Enforces referential integrity
   - Prevents orphaned records

3. **NOT NULL Constraints**
   - Applied to essential columns
   - Ensures data completeness
   - Maintains data quality

### Performance Considerations

1. **Indexes**
   - Strategic indexing for common queries
   - Foreign key indexes for joins
   - Composite indexes where needed

2. **Denormalization**
   - Some redundant data for performance
   - Balanced with data integrity needs
   - Optimized for read operations

### Security Model

1. **Row Level Security**
   - Read: Authenticated users
   - Write: Service role only
   - Policies defined per table

2. **Service Role Access**
   - Used for data synchronization
   - Bypasses RLS for maintenance
   - Controlled access pattern

### API Integration Details

1. Congress.gov API
   - Base URL: `https://api.congress.gov/v3`
   - Authentication: API key required
   - Rate limit: 5,000 requests/hour
   - Response format: JSON

2. Endpoints Used
   - Parameters:
     - `limit`: Records per page (max 250)
     - `offset`: Pagination offset
     - `format`: Response format (json)
     - `api_key`: Authentication

### Data Quality Assurance

1. Validation Checks
   - Required fields presence
   - Data type consistency
   - Format compliance
   - Relationship integrity

2. Data Cleaning
   - Sponsor name formatting
   - Date standardization
   - Text field sanitization
   - Empty field handling

3. Monitoring Metrics
   - Sync completion rate
   - Error frequency
   - Data freshness
   - Coverage completeness

### Security Considerations

1. Authentication
   - API key protection
   - Sync token requirement
   - Environment variable security

2. Access Control
   - Row Level Security (RLS)
   - Role-based access
   - API rate limiting
   - Request validation

3. Data Protection
   - Sensitive data handling
   - Audit logging
   - Error masking
   - Secure connections

## API Integration

### Congress.gov API
- Rate limit: 5,000 requests per hour
- Maximum batch size: 250 records
- Supports XML and JSON formats
- Authentication via API key

### Data Flow
1. Congress.gov API → Sync Scripts
2. Data Transformation & Validation
3. Supabase Storage (upsert operations)
4. Client Access via Next.js API Routes

## Recent Changes

### Database Updates
- Added `status_history` for tracking bill progression
- Implemented progress calculation
- Added vote counting
- Enhanced indexing for performance

### API Improvements
- Rate limit handling
- Batch processing
- Error recovery
- Progress tracking

### UI Enhancements
- Responsive design optimization
- Accessibility improvements
- Performance optimizations
- Enhanced filtering and search

## Data Access Patterns

### Server Components
- Direct Supabase queries
- Pre-rendered content
- SEO optimization

### Client Components
- Real-time updates
- Interactive features
- Cached data access

## Security & Performance

### Security Measures
- Row Level Security (RLS) enabled
- API key protection
- Rate limiting
- Input validation

### Performance Optimizations
- Indexed queries
- Batch processing
- Incremental Static Regeneration
- Edge caching

## Status Tracking System

The bill status tracking system uses several components:

1. **Action Codes**: Numeric codes in `bill_actions` table that indicate specific legislative actions. We handle both Library of Congress codes (e.g., '36000') and House system codes (e.g., 'E40000').

2. **Progress Stages**:
   - 20: Introduced
   - 40: In Committee
   - 60: Passed One Chamber
   - 80: Passed Both Chambers
   - 90: To President
   - 100: Became Law

3. **Database Trigger Implementation**: 
   - A trigger function `calculate_bill_progress()` runs after any insert or update on `bill_actions`
   - The trigger:
     - Finds the latest action for the bill
     - Determines the progress stage based on action codes, types, and text
     - Updates `progress_stage` and `progress_description` in `bill_info`

4. **Status Calculation Logic**:
   The status is determined by checking (in order of precedence):
   - Became Law: action_code in ('36000', 'E40000') or type = 'BecameLaw'
   - Signed by President: action_code in ('29000', 'E30000')
   - To President: action_code in ('28000', 'E20000')
   - Passed Both Chambers: Has actions with codes ('17000', '8000', 'E10000')
   - Passed One Chamber: action_code in ('17000', '8000', 'E10000')
   - In Committee: action_code in ('5000', '14000')
   - Introduced: action_code in ('1000', '10000')

5. **Data Flow**:
   - Bill actions are stored in `bill_actions` table
   - Status is automatically calculated by the trigger
   - No manual status updates needed
   - Status is always derived from actual actions

This system ensures that bill status is:
- Automatically updated
- Consistently calculated
- Based on authoritative action codes
- Handles both LoC and House system codes

## Data Relationships

All tables have a one-to-many relationship with `bill_info` through the `id` column:
- One bill can have many actions
- One bill can have many titles
- One bill can have many subjects
- One bill can have many summaries
- One bill can have many text versions

## Caching and Data Fetching

### Supabase Integration

#### 1. Client Configuration
```typescript
// utils/supabase/client.ts
export const createClient = () => {
  return createSupabaseClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      fetch: (url, init) => {
        const customInit = {
          ...init,
          next: { 
            revalidate: 3600,
            tags: ['bills']
          }
        };
        if (!init?.cache) {
          customInit.cache = 'force-cache';
        }
        return fetch(url, customInit);
      }
    }
  });
};
```

#### 2. Caching Strategy
- **Default Cache**: Force-cache for all requests
- **Cache Duration**: 1 hour (3600 seconds)
- **Cache Tags**: 'bills' for bill-related data
- **Cache Override**: Possible through init parameters

#### 3. Server Components Integration
```typescript
// Example of cached data fetching in a server component
const getCachedBillById = unstable_cache(
  async (id: string) => {
    'use server';
    const supabase = createClient();
    const { data, error } = await supabase
      .from('bill_info')
      .select('*')
      .eq('id', id)
      .single();
    return data;
  },
  ['bill-detail'],
  {
    revalidate: 3600,
    tags: ['bills']
  }
);
```

### Caching Patterns

#### 1. List Pages
- Cache entire result sets
- Revalidate hourly
- Use pagination metadata
- Cache by query parameters

#### 2. Detail Pages
- Cache individual records
- Dynamic route parameters
- Related data caching
- Nested relationship handling

#### 3. Search Results
- Cache common searches
- Partial cache invalidation
- Search parameter handling
- Result set management

### Performance Optimization

#### 1. Query Optimization
- Select specific columns
- Use appropriate indexes
- Optimize join operations
- Handle pagination efficiently

#### 2. Cache Management
- Granular cache invalidation
- Cache warming strategies
- Memory usage optimization
- Cache hit ratio monitoring

#### 3. Error Handling
- Graceful degradation
- Fallback strategies
- Error boundary implementation
- Cache miss handling

### Best Practices

#### 1. Data Fetching
- Use server components
- Implement proper caching
- Handle loading states
- Manage error states

#### 2. Cache Configuration
- Set appropriate TTL
- Use meaningful tags
- Implement cache warming
- Monitor cache performance

#### 3. Performance Monitoring
- Track cache hit rates
- Monitor response times
- Analyze query performance
- Measure client impact

## Data Fetching Strategy

### 1. Static Generation
- Pre-generates the most recent 100 bills at build time
- Uses ISR with 1-hour revalidation
- Optimizes performance for frequently accessed bills

### 2. Dynamic Data
- Fetches bill details on-demand for non-pre-generated bills
- Implements proper error handling
- Uses loading states for better UX

### 3. Caching
- Page-level caching with ISR
- Service layer caching for repeated requests
- Proper cookie handling in server components

## Error Handling

### 1. Service Layer
```typescript
try {
  const data = await this.supabase
    .from(BILL_INFO_TABLE_NAME)
    .select(...)
    .match({ id })
    .single();

  if (!data) {
    return null;
  }

  return data;
} catch (error) {
  console.error('Error fetching bill:', error);
  throw new Error('Failed to fetch bill data');
}
```

### 2. Component Layer
```typescript
try {
  const data = await getBillData(id);
  if (!data) {
    notFound();
  }
  // Render data
} catch (error) {
  // Show error UI
}
```

## Best Practices

### 1. Data Fetching
- Use service layer for all data operations
- Implement proper error handling
- Use TypeScript for type safety
- Handle loading states

### 2. Performance
- Implement ISR where appropriate
- Pre-generate static content
- Cache frequently accessed data
- Handle dynamic routes efficiently

### 3. Type Safety
- Define clear interfaces
- Use TypeScript strictly
- Validate data at boundaries
- Handle null and undefined cases

### 4. Error Handling
- Implement proper error boundaries
- Show loading states
- Provide fallback UI
- Log errors appropriately