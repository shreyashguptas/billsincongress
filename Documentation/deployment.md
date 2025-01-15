# Deployment Guide

## Vercel Deployment

### Configuration
The project is configured for deployment on Vercel using the following settings:

```json
{
  "buildCommand": "next build",
  "devCommand": "next dev",
  "installCommand": "npm install",
  "framework": "nextjs",
  "outputDirectory": ".next"
}
```

### Environment Variables
- Supabase API is already configured in the project
- CONGRESS_API_KEY is required for the Congress.gov API
- SYNC_AUTH_TOKEN is required for the sync scripts

### Build Output
The build process generates static files in the `.next` directory.

## Deployment Process

1. Push code to GitHub repository
2. Connect repository to Vercel
3. Vercel automatically:
   - Installs dependencies
   - Builds the application
   - Deploys to production

## Post-Deployment

### Monitoring
- Check build logs
- Verify routes
- Test functionality
- Monitor performance

### Domain Setup
1. Add custom domain
2. Configure DNS settings
3. Enable HTTPS

### Performance
- Check Core Web Vitals
- Monitor loading times
- Verify SSR/SSG behavior

## Edge Functions Deployment

### Prerequisites
- Supabase CLI installed
- Docker Desktop installed (required for local development and deployment)
- Supabase access token (obtain from dashboard)

### Deployment Steps
1. **Login to Supabase CLI**:
   ```bash
   supabase login
   ```

2. **Deploy Edge Function**:
   ```bash
   supabase functions deploy function-name --project-ref your-project-ref
   ```

3. **Set Environment Variables**:
   - Navigate to Supabase Dashboard → Settings → Functions
   - Add required environment variables
   - Ensure secrets are properly managed

4. **Configure Scheduled Execution (if needed)**:
   - Go to Database → Functions → Scheduled Functions
   - Create new scheduled function
   - Set schedule using cron syntax
   - Select Edge Function as type
   - Configure HTTP method (GET/POST)

### Monitoring and Maintenance
- View logs in Supabase Dashboard → Edge Functions → Logs
- Monitor invocations and performance
- Check execution history
- Set up alerts for failures (recommended)

### Troubleshooting
- Check Docker Desktop is running for deployments
- Verify environment variables are set
- Review function logs for errors
- Ensure proper permissions and access tokens