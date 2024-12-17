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
  sponsor_name text,                                      -- Primary sponsor's name
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

### Historical Data Sync
The system includes three synchronization scripts:

1. `sync-historical-bills.ts`: Fetches bills from a specific Congress with a limit
2. `sync-all-historical-bills.ts`: Comprehensive historical sync without limits
3. `sync-daily-bills.ts`: Daily updates for recent bills

Key features:
- Configurable Congress range (93rd onwards)
- Rate limit handling
- Error recovery
- Progress tracking
- Duplicate prevention via upsert

### Sync Configuration
```typescript
interface SyncConfig {
  startCongress: number;     // Starting Congress (e.g., 93 for 1973-1974)
  endCongress: number;       // Current Congress
  batchSize: number;         // Records per API call (max 250)
  delayBetweenBatches: number; // Milliseconds between calls
  maxRetries: number;        // Failed request retry limit
  retryDelay: number;        // Milliseconds between retries
}
```

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