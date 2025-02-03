# Background Services

## Bill Data Update Service

### Overview
The system employs a Kubernetes (K3s) cluster running on a homelab setup for automated background tasks. For detailed deployment information, see `homelab-deployment.md`.

### Service Configuration
- **Type**: Kubernetes CronJob on K3s cluster
- **Schedule**: Daily at 1 AM UTC
- **Runtime**: Node.js
- **Container**: Docker
- **Resource Limits**: See `homelab-deployment.md`

### Update Process

1. **Data Fetching**
   - Connects to Congress.gov API
   - Respects rate limits (5,000 requests/hour)
   - Implements pagination (250 records/page)
   - Handles API authentication

2. **Data Processing**
   - Validates incoming data
   - Transforms to database schema
   - Handles data type conversions
   - Manages relationships

3. **Database Updates**
   - Uses upsert operations
   - Maintains data consistency
   - Triggers progress recalculation
   - Updates timestamps

4. **Error Handling**
   - Implements retry mechanisms
   - Logs errors comprehensively
   - Maintains partial progress
   - Sends failure notifications

### Implementation Details

Key files:
- Update logic: `/scripts/DataUpdate/updateMasterBill.ts`
- Type definitions: `/lib/types/BillInfo.ts`
- Database functions: `/sql/functions/bill_functions.sql`

### Monitoring

1. **Kubernetes Dashboard**
   - Job completion status
   - Container logs
   - Resource utilization
   - Error events

2. **Database Metrics**
   - Update timestamps
   - Record counts
   - Error logs
   - Performance metrics

3. **Application Monitoring**
   - Data freshness
   - API response times
   - Error rates
   - Cache hit rates

### Environment Configuration

Required variables:
```
CONGRESS_API_KEY=your_api_key
DATABASE_URL=your_db_url
```

For detailed deployment configuration, see `homelab-deployment.md`. 