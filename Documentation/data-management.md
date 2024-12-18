# Data Management

## Database Schema

### Bills Table
The `bills` table is the primary storage for all congressional bill information:

```sql
create table bills (
  id text primary key,                                    -- Unique identifier: {congress}-{type}-{number}
  title text not null,                                    -- Bill's display title
  congress_number integer,                                -- Congress number (e.g., 117 for 2021-2022)
  bill_type text,                                         -- Type: HR, S, HJRES, SJRES, etc.
  bill_number integer,                                    -- Bill's assigned number
  sponsor_name text,                                      -- Primary sponsor's name (cleaned format)
  sponsor_state text,                                     -- Sponsor's state
  sponsor_party text,                                     -- Sponsor's political party
  sponsor_bioguide_id text,                              -- Sponsor's Bioguide ID
  committee_count integer,                                -- Number of committees involved
  latest_action_text text,                               -- Most recent action description
  latest_action_date text,                               -- Date of most recent action
  update_date text,                                      -- Last update from Congress.gov
  status text,                                           -- Current bill status
  progress numeric(5,2),                                 -- Progress percentage (0-100)
  summary text,                                          -- Official bill summary
  tags text[],                                           -- Categorization tags
  ai_summary text,                                       -- AI-generated summary
  last_updated timestamp with time zone,                 -- Last database update time
  vote_count jsonb,                                      -- Vote tallies {yea, nay, present, notVoting}
  origin_chamber text,                                   -- Originating chamber (House/Senate)
  origin_chamber_code char(1),                           -- Chamber code (H/S)
  congress_gov_url text,                                 -- Official Congress.gov URL
  status_history jsonb default '[]'::jsonb,             -- Historical status changes
  last_status_change timestamp with time zone,           -- Timestamp of last status change
  introduced_date text,                                  -- Bill introduction date
  constitutional_authority_text text,                    -- Constitutional authority statement
  official_title text,                                   -- Official bill title
  short_title text,                                      -- Short title if available
  cosponsors_count integer default 0,                    -- Number of cosponsors
  created_at timestamp with time zone default now(),     -- Record creation timestamp
  updated_at timestamp with time zone default now(),     -- Record update timestamp
  constraint valid_progress_range check (progress >= 0 and progress <= 100)
);

-- Indexes for performance optimization
create index bills_last_updated_idx on bills(last_updated);
create index bills_congress_number_idx on bills(congress_number);
create index bills_bill_type_idx on bills(bill_type);
create index bills_bill_number_idx on bills(bill_number);
create index bills_origin_chamber_idx on bills(origin_chamber);
create index bills_status_idx on bills(status);
```

## Data Synchronization

### Synchronization Scripts
The system includes three main synchronization scripts:

1. `sync-historical-bills.ts`: Initial data population and backfilling
   - Fetches a specified number of bills (configurable)
   - Works backwards from current Congress
   - Processes all bill types (HR, S, HJRES, etc.)
   - Includes retry logic and error handling
   - Configuration options:
     ```typescript
     {
       totalRecordsToFetch: 3000,  // Number of bills to fetch
       batchSize: 250,             // Bills per API call
       delayBetweenBatches: 1000,  // Milliseconds between calls
       maxRetries: 3,              // Failed request retry limit
       retryDelay: 5000           // Milliseconds between retries
     }
     ```

2. `sync-daily-bills.ts`: Regular updates and maintenance
   - Fetches only bills updated since last sync
   - Determines date range automatically
   - Maintains data freshness
   - Configuration options:
     ```typescript
     {
       batchSize: 250,             // Bills per API call
       delayBetweenBatches: 1000,  // Milliseconds between calls
       maxRetries: 3,              // Failed request retry limit
       retryDelay: 5000           // Milliseconds between retries
     }
     ```

3. `sync-all-historical-bills.ts`: Complete historical archive
   - Fetches ALL bills from specified Congress range
   - No record limit
   - Comprehensive historical data

### Bill Types Processed
All scripts handle the following bill types:
- `hr`: House Bills
- `s`: Senate Bills
- `hjres`: House Joint Resolutions
- `sjres`: Senate Joint Resolutions
- `hconres`: House Concurrent Resolutions
- `sconres`: Senate Concurrent Resolutions
- `hres`: House Simple Resolutions
- `sres`: Senate Simple Resolutions

### Data Transformation
The system performs several transformations during synchronization:

1. Sponsor Name Cleaning
   - Removes bracketed information (e.g., `[D-VA-11]`)
   - Example: `"Rep. Connolly, Gerald E. [D-VA-11]"` → `"Rep. Connolly, Gerald E."`

2. Status Determination
   - `Enacted`: Bill became law
   - `Vetoed`: Bill was vetoed
   - `Introduced`: Bill was introduced
   - `In Committee`: Bill referred to committee
   - `In Progress`: Default status

3. Progress Calculation
   - Enacted: 100%
   - Vetoed: 90%
   - In Committee: 30%
   - Introduced: 10%
   - In Progress: 50%

4. Tag Generation
   - Combines policy areas and subjects
   - Handles multiple data formats
   - Removes duplicates
   - Ensures array format

### Error Handling and Resilience

1. Retry Logic
   - Automatic retry on failed API calls
   - Configurable retry attempts
   - Exponential backoff
   - Detailed error logging

2. Data Validation
   - Type checking
   - Null/undefined handling
   - Format verification
   - Safe fallbacks

3. Rate Limiting
   - Respects API limits (5,000 requests/hour)
   - Configurable delays between batches
   - Automatic throttling

### Best Practices for Syncing

1. Initial Setup
   ```bash
   # 1. First-time setup
   npm run sync-historical-bills  # Populate initial data
   
   # 2. Regular updates
   npm run sync-daily            # Run daily for updates
   ```

2. Monitoring
   - Check logs for errors
   - Monitor sync completion
   - Verify data integrity
   - Track API rate limits

3. Maintenance
   - Regular backups
   - Data cleanup
   - Performance optimization
   - Index maintenance

### API Integration Details

1. Congress.gov API
   - Base URL: `https://api.congress.gov/v3`
   - Authentication: API key required
   - Rate limit: 5,000 requests/hour
   - Response format: JSON

2. Endpoints Used
   - Bill List: `/bill/{congress}/{type}`
   - Bill Detail: `/bill/{congress}/{type}/{number}`
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