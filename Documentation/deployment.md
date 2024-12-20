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