# Analytics & Visualizations

## Overview

The Congressional Bill Tracker includes an analytics system to visualize meaningful insights about legislative data. This document covers the entire analytics implementation, from database structures to frontend visualization components.

## Technology Stack

- **Database**: Supabase (PostgreSQL)
- **Visualization Library**: Tremor v3.18.7 (`@tremor/react`)
- **Data Refresh**: PostgreSQL Materialized Views + pg_cron
- **Frontend Framework**: Next.js 15

## Directory Structure

```
project/
├── app/
│   ├── actions/
│   │   └── analytics-actions.ts  # Server actions for fetching analytics data
│   ├── components/
│   │   └── analytics/
│   │       └── CongressionalBillsChart.tsx  # Component for bill charts
│   └── page.tsx                 # Homepage with analytics section
├── scripts/
│   └── check-analytics-data.ts  # Utility script to verify analytics data
├── sql/
│   ├── analytics_refresh_log.sql # SQL for analytics refresh logging
│   └── refresh_analytics.sql    # SQL for manual refresh of analytics views
```

## Database Implementation

### Materialized Views

We use PostgreSQL materialized views to pre-compute analytics data. This reduces database load by avoiding expensive queries on every page load, especially for data that doesn't change frequently.

#### Example: Bills by Congress Materialized View

```sql
CREATE MATERIALIZED VIEW app_analytics_bills_by_congress AS
SELECT 
  congress,
  COUNT(*) as bill_count,
  COUNT(CASE WHEN bill_type LIKE 'h%' THEN 1 END) as house_bill_count,
  COUNT(CASE WHEN bill_type LIKE 's%' THEN 1 END) as senate_bill_count
FROM bill_info
WHERE congress IS NOT NULL
GROUP BY congress
ORDER BY congress DESC;
```

This materialized view pre-computes:
- Total bills per Congress
- House bills per Congress
- Senate bills per Congress

### Refresh Function

We created a database function to refresh all analytics materialized views:

```sql
CREATE OR REPLACE FUNCTION public.app_refresh_analytics_views()
RETURNS void AS $$
BEGIN
  SET search_path = 'public';
  
  -- Refresh the materialized view
  REFRESH MATERIALIZED VIEW app_analytics_bills_by_congress;
  
  RETURN;
END;
$$ LANGUAGE plpgsql 
   SECURITY DEFINER 
   SET search_path = public;
```

### Refresh Logging

A log table tracks when analytics views are refreshed:

```sql
CREATE TABLE IF NOT EXISTS public.analytics_refresh_log (
  id SERIAL PRIMARY KEY,
  refreshed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  note TEXT
);
```

### Automated Refresh with pg_cron

We use pg_cron to automatically refresh analytics views daily:

```sql
SELECT cron.schedule(
  'refresh-analytics-views',
  '0 2 * * *',  -- Run at 2 AM every day
  $$
  SELECT app_refresh_analytics_views();
  INSERT INTO analytics_refresh_log (note) VALUES ('Scheduled refresh via pg_cron');
  $$
);
```

## Frontend Implementation

### 1. Server Actions

Server actions fetch data from our materialized views, with built-in caching to improve performance:

```typescript
// app/actions/analytics-actions.ts
import { createClient } from '@/lib/services/supabase/server';
import { unstable_cache } from 'next/cache';

export interface BillsByCongressData {
  congress: number;
  bill_count: number;
  house_bill_count: number;
  senate_bill_count: number;
}

export const getBillsByCongressData = unstable_cache(
  async () => {
    const supabase = createClient();
    
    const { data, error } = await supabase
      .from('app_analytics_bills_by_congress')
      .select('*')
      .order('congress', { ascending: false })
      .limit(5);
      
    if (error) {
      console.error('Error fetching bills by congress data:', error);
      return [];
    }
    
    return data.reverse();
  },
  ['analytics-bills-by-congress'],
  { revalidate: 86400 }  // Cache for 24 hours
);
```

### 2. Visualization Components

We use Tremor for visualization components. All visualization components:
- Should be client components (include 'use client' directive)
- Should be placed in `/app/components/analytics/`
- Should include proper type definitions
- Should handle empty/error states gracefully

Example (Congressional Bills Bar Chart):

```tsx
'use client';

import { Card, Title, BarChart, Subtitle } from '@tremor/react';
import type { BillsByCongressData } from '@/app/actions/analytics-actions';

interface CongressionalBillsChartProps {
  data: BillsByCongressData[];
}

export default function CongressionalBillsChart({ data }: CongressionalBillsChartProps) {
  if (!data || data.length === 0) {
    return null;
  }

  // Format numbers with commas
  const valueFormatter = (value: number) => 
    new Intl.NumberFormat('en-US').format(value);

  return (
    <Card className="mx-auto bg-[#19223C] border-0 shadow-lg">
      <Title className="text-center text-gray-100">Bills Introduced by Congress</Title>
      <Subtitle className="text-center text-gray-300 mt-2">
        Compare the number of bills introduced in the last 5 Congresses
      </Subtitle>
      <BarChart
        className="mt-6 h-72 text-gray-300"
        data={data}
        index="congress"
        categories={["bill_count"]}
        colors={["blue"]}
        valueFormatter={valueFormatter}
        yAxisWidth={60}
        showLegend={false}
        showGridLines={false}
        showAnimation={true}
        animationDuration={1000}
        customTooltip={customTooltip}
      />
    </Card>
  );
}

// Custom tooltip code...
```

## Creating New Visualizations

### 1. Database Investigation

Always start by investigating the database structure:

```typescript
// Use MCP Query tool to understand the schema
const result = await mcp__query(`
  SELECT column_name, data_type 
  FROM information_schema.columns 
  WHERE table_name = 'bill_info'
`);
```

Check existing materialized views:

```typescript
const result = await mcp__query(`
  SELECT matviewname 
  FROM pg_matviews 
  WHERE schemaname = 'public'
`);
```

### 2. Create a Materialized View

Create a new materialized view for your analytics query:

```sql
CREATE MATERIALIZED VIEW app_analytics_[name] AS
SELECT 
  -- Your analytics query here
FROM [tables]
WHERE [conditions]
GROUP BY [columns]
ORDER BY [columns];
```

### 3. Update the Refresh Function

Modify the `app_refresh_analytics_views()` function to include your new view:

```sql
CREATE OR REPLACE FUNCTION public.app_refresh_analytics_views()
RETURNS void AS $$
BEGIN
  SET search_path = 'public';
  
  -- Existing refreshes
  REFRESH MATERIALIZED VIEW app_analytics_bills_by_congress;
  
  -- Add your new view
  REFRESH MATERIALIZED VIEW app_analytics_[name];
  
  RETURN;
END;
$$ LANGUAGE plpgsql 
   SECURITY DEFINER 
   SET search_path = public;
```

### 4. Create a Server Action

Create a new server action to fetch data from your materialized view:

```typescript
// app/actions/analytics-actions.ts

export interface YourDataType {
  // Define the structure of your data
}

export const getYourAnalyticsData = unstable_cache(
  async () => {
    const supabase = createClient();
    
    const { data, error } = await supabase
      .from('app_analytics_[name]')
      .select('*')
      // Add any filtering or ordering
      
    if (error) {
      console.error('Error fetching data:', error);
      return [];
    }
    
    return data;
  },
  ['analytics-[name]'],
  { revalidate: 86400 }
);
```

### 5. Create a Visualization Component

Create a new component in `/app/components/analytics/`:

```tsx
// app/components/analytics/YourVisualization.tsx
'use client';

import { Card, Title, /* import needed components */ } from '@tremor/react';
import type { YourDataType } from '@/app/actions/analytics-actions';

interface YourVisualizationProps {
  data: YourDataType[];
}

export default function YourVisualization({ data }: YourVisualizationProps) {
  if (!data || data.length === 0) {
    return null;
  }

  // Format data as needed
  
  return (
    <Card className="mx-auto bg-[#19223C] border-0 shadow-lg">
      <Title className="text-center text-gray-100">Your Visualization Title</Title>
      <Subtitle className="text-center text-gray-300 mt-2">
        Description of your visualization
      </Subtitle>
      {/* Add your Tremor visualization component */}
    </Card>
  );
}
```

### 6. Add to Page

Add your visualization to the appropriate page:

```tsx
import YourVisualization from '@/app/components/analytics/YourVisualization';
import { getYourAnalyticsData } from '@/app/actions/analytics-actions';

export default async function Page() {
  const data = await getYourAnalyticsData();
  
  return (
    <div>
      {/* Other page content */}
      <YourVisualization data={data} />
    </div>
  );
}
```

## Tremor Components Reference

Tremor offers various visualization components:

- **BarChart**: For comparing categorical data
- **LineChart**: For showing trends over time
- **AreaChart**: For showing trends with filled areas
- **DonutChart**: For showing parts of a whole
- **PieChart**: Alternative to DonutChart
- **ScatterChart**: For showing correlation between variables
- **Card**: Container for visualizations
- **Metric**: For displaying key metrics

Visit the [Tremor documentation](https://www.tremor.so/docs/components/overview) for more components.

## Troubleshooting

### Materialized View Issues

If a materialized view isn't returning data:

1. Check if the view exists:
   ```sql
   SELECT * FROM pg_matviews WHERE matviewname = 'app_analytics_bills_by_congress';
   ```

2. Try manually refreshing the view:
   ```sql
   REFRESH MATERIALIZED VIEW app_analytics_bills_by_congress;
   ```

3. Query the base tables directly to verify data exists.

### Component Rendering Issues

1. Make sure client components have the 'use client' directive
2. Verify props are passed correctly from server to client components
3. Check browser console for errors
4. Verify data is being returned from server actions

## Best Practices

1. **Materialized Views**:
   - Create focused views that answer specific questions
   - Include only necessary columns to reduce storage
   - Consider indexing if querying by specific columns

2. **Refresh Strategy**:
   - Schedule refreshes during low-traffic periods
   - For current Congress data, consider more frequent refreshes
   - For historical data, less frequent refreshes are adequate

3. **Component Design**:
   - Handle empty/loading/error states
   - Make visualizations responsive
   - Use consistent styling across visualizations
   - Include proper typings
   - Add helpful tooltips for context

4. **Performance**:
   - Use Next.js caching for server actions
   - Lazy-load visualization components if not in initial viewport
   - Use pagination or limits when dealing with large datasets 