# Deployment & Operations

## Docker & Kubernetes Deployment

This document outlines how to build the Docker image for the Bills in Congress project and deploy it as a Kubernetes job to fetch data from the API and update the database.

### Preparation

#### 1. Clone Repository and Create .env.local

On your homelab, clone the repository and create the `.env.local` file that contains your environment variables:

```bash
# Clone the repository 
git clone https://github.com/shreyashguptas/billsincongress.git
cd billsincongress

# Create .env.local file with your secrets
# Make sure to include all necessary API keys, database credentials, etc.
nano .env.local  # or use any editor you prefer

# For reference, the full path to your .env.local file would be:
# (Replace with your actual path from running 'pwd' in the repository directory)
# Example: /home/username/billsincongress/.env.local
```

### Docker Image Setup

#### Building the Image

1. Navigate to the project root directory where the Dockerfile is located (if you're not already there):

```bash
cd /path/to/billsincongress
```

2. Build the Docker image:

```bash
docker build -t shreyashguptas/bills-update:latest .
```

3. (Optional)Push the image to Docker Hub (or your preferred registry) if you need to use it on multiple nodes:

```bash
docker push shreyashguptas/bills-update:latest
```

### Kubernetes Deployment

#### Prerequisites

- Access to a K3s cluster (as documented in k3s-cluster-info.md)
- kubectl configured to connect to your cluster
- `.env.local` file created in the repository root directory

#### Create the Namespace

```bash
kubectl create namespace bills-update
```

#### Create Secrets

1. First, create a secret for your application environment variables:

```bash
# IMPORTANT: The --from-file parameter has the format: --from-file=<name in secret>=<path to your actual file>
# In our case: --from-file=.env.local=<ACTUAL PATH TO YOUR .ENV.LOCAL FILE>

# If you're in the repository root directory where .env.local exists, you can use:
kubectl create secret generic bills-update-secrets \
  --namespace bills-update \
  --from-file=.env.local=./.env.local

# EXAMPLE with full path:
# If 'pwd' returns "/home/username/billsincongress", the command would be:
# kubectl create secret generic bills-update-secrets \
#   --namespace bills-update \
#   --from-file=.env.local=/home/username/billsincongress/.env.local
```

2. Then, create a separate secret for Git credentials (this keeps your personal information out of the repository):

```bash
# Replace with your actual Git information for commits made by the update script
kubectl create secret generic git-credentials \
  --namespace bills-update \
  --from-literal=git-email="your.email@example.com" \
  --from-literal=git-name="Your Name"
```

This approach ensures your Git credentials are stored securely in Kubernetes and not committed to any public repositories.

#### Test Secret and File Mounting

Before proceeding with the full deployment, you can test if the secret was created correctly and verify how it will be mounted:

```bash
# Check if the secrets were created successfully
kubectl get secret bills-update-secrets -n bills-update
kubectl get secret git-credentials -n bills-update

# See details about the secrets
kubectl describe secret bills-update-secrets -n bills-update
kubectl describe secret git-credentials -n bills-update

# Create a temporary test pod to verify the .env.local mounting
kubectl run test-env-pod --image=busybox -n bills-update --rm -it --restart=Never \
  --overrides='
{
  "spec": {
    "containers": [
      {
        "name": "test-env-pod",
        "image": "busybox",
        "command": ["sh", "-c", "cat /app/.env.local && echo \"\n\nFile mounted successfully!\""],
        "volumeMounts": [
          {
            "name": "env-file",
            "mountPath": "/app/.env.local",
            "subPath": ".env.local"
          }
        ]
      }
    ],
    "volumes": [
      {
        "name": "env-file",
        "secret": {
          "secretName": "bills-update-secrets"
        }
      }
    ]
  }
}'
```

If the file is correctly mounted, you should see the contents of your .env.local file followed by "File mounted successfully!". If there are any issues, fix them before proceeding.

#### Deploy Persistent Volume Claim

Apply the PVC for log storage:

```bash
kubectl apply -f k8s/pvc.yaml
```

#### Deploy CronJob

Apply the CronJob to run the bill update process:

```bash
kubectl apply -f k8s/cronjob.yaml
```

#### Verify Deployment

```bash
kubectl get cronjobs -n bills-update
kubectl get pvc -n bills-update
kubectl get secrets -n bills-update
```

### Self-Healing and Reliability

The deployment is designed to be self-healing and recover automatically from failures:

1. **CronJob Reliability**:
   - Kubernetes CronJobs automatically reschedule after cluster restarts
   - If a node goes down, jobs will run on other available nodes
   - CronJobs will automatically execute at the next scheduled time after a failure

2. **Image Pull Policy**:
   - The `imagePullPolicy: Always` setting ensures the latest image is always used
   - This allows for seamless updates by simply pushing a new image with the same tag

3. **Health Monitoring**:
   - The Docker image includes a health check that verifies the API endpoint is responding
   - In Kubernetes, this feeds into the liveness probe which restarts unhealthy containers
   - Container health status can be monitored through the Kubernetes dashboard

4. **Logs Persistence**:
   - Logs are stored in a persistent volume that survives pod restarts
   - All update operations are logged with timestamps for auditing and debugging

5. **Concurrency Protection**:
   - The `concurrencyPolicy: Forbid` setting prevents overlapping job executions
   - This ensures data consistency even if previous jobs run longer than expected

6. **Environment Variables**:
   - Environment variables are securely stored as Kubernetes secrets
   - The `.env.local` file is mounted directly into the container
   - Git credentials are stored in a separate secret for security
   - No manual intervention needed after deployment

## Background Services

### Bill Data Update Service

#### Overview
The system uses a Kubernetes CronJob to automate the process of fetching and updating bill data from the Congress.gov API.

#### Service Configuration
- **Type**: Kubernetes CronJob
- **Schedule**: Daily at 1 AM UTC
- **Runtime**: Node.js
- **Container**: Docker
- **Resource Limits**: 1Gi memory, 500m CPU

#### Update Process

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

## Monitoring

### Kubernetes Dashboard

To monitor the CronJob and pod status:

1. Access the Kubernetes dashboard:

```bash
kubectl proxy
```

2. Navigate to: http://localhost:8001/api/v1/namespaces/kubernetes-dashboard/services/https:kubernetes-dashboard:/proxy/

3. Check job status and logs:
   - Navigate to "Jobs" in the dashboard
   - Select the "bills-update" namespace
   - Select the job to view details and logs

### Health Check Monitoring

To check the health status of containers:

```bash
# For running containers in Kubernetes
kubectl describe pod <pod-name> -n bills-update

# For Docker containers directly
docker inspect --format='{{json .State.Health}}' <container_id> | jq
```

Health check logs contain information about the container's ability to connect to the API endpoint and can help diagnose connectivity issues.

### Command Line Monitoring

View CronJob status:
```bash
kubectl get cronjobs -n bills-update
```

View recent job history:
```bash
kubectl get jobs -n bills-update
```

View pod logs:
```bash
# Get pod name
kubectl get pods -n bills-update

# View logs
kubectl logs <pod-name> -n bills-update
```

## Troubleshooting

### Common Issues and Solutions

#### Cluster Recovery After Downtime

If the entire cluster goes down:

1. After the cluster recovers, CronJobs will automatically resume on their next scheduled execution time
2. Check the status of the CronJob after recovery:
   ```bash
   kubectl get cronjobs -n bills-update
   ```
3. If needed, manually trigger a job to run immediately:
   ```bash
   kubectl create job --from=cronjob/bills-update-job manual-recovery-$(date +%Y%m%d-%H%M%S) -n bills-update
   ```

#### Environment Variable Issues

If your job fails due to missing environment variables:

1. Check that the secrets were created correctly:
   ```bash
   kubectl describe secret bills-update-secrets -n bills-update
   kubectl describe secret git-credentials -n bills-update
   ```

2. Verify the secrets are mounted and referenced correctly in the pod:
   ```bash
   kubectl describe pod <pod-name> -n bills-update
   ```

3. If needed, update the secrets:
   ```bash
   # Update application secret with a new .env.local file
   kubectl create secret generic bills-update-secrets \
     --namespace bills-update \
     --from-file=.env.local=./.env.local \
     --dry-run=client -o yaml | kubectl apply -f -
     
   # Update git credentials if needed
   kubectl create secret generic git-credentials \
     --namespace bills-update \
     --from-literal=git-email="your.new.email@example.com" \
     --from-literal=git-name="Your New Name" \
     --dry-run=client -o yaml | kubectl apply -f -
   ```

#### Progress Stage Issues

##### 1. Progress Bar Calculation
The application uses two different progress calculation methods that need to be kept in sync:

###### Database Progress Stage
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

###### Component Progress Calculation
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

#### Type Safety Issues

##### 1. Async Params Handling
**Common Issues:**
- Type errors with async params
- Missing error handling for params resolution
- Incorrect return type annotations

**Solutions:**
- Use proper TypeScript types for async params
- Implement comprehensive error handling
- Add explicit return type annotations

### CronJob Debugging

#### 1. Check CronJob Status
```bash
kubectl get cronjobs -n bills-update
```

#### 2. View Recent Job History
```bash
kubectl get jobs -n bills-update
```

#### 3. Check Pod Logs
```bash
kubectl get pods -n bills-update | grep bills-update
kubectl logs <pod-name> -n bills-update
```

#### 4. Manual Job Trigger
```bash
kubectl create job --from=cronjob/bills-update-job manual-bills-update-$(date +%Y%m%d-%H%M%S) -n bills-update
```

#### 5. Check for Resource Issues
```bash
kubectl describe pod <pod-name> -n bills-update
```

### Application Performance Troubleshooting

#### 1. Slow Database Queries
- Check for missing indexes
- Optimize complex queries
- Review explain plans

#### 2. Memory Leaks
- Monitor pod memory usage
- Check for increasing memory patterns
- Review component lifecycle methods

#### 3. API Rate Limiting
- Implement proper backoff strategies
- Monitor API usage metrics
- Add rate limiting awareness to scripts 