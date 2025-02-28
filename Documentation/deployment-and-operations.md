# Deployment & Operations

## Homelab Deployment

### K3s Cluster Setup

#### Server Node Setup
1. Install K3s server on your main Raspberry Pi:
```bash
curl -sfL https://get.k3s.io | sh -
```

2. After installation, get the node token from:
```bash
sudo cat /var/lib/rancher/k3s/server/node-token
```

#### Agent Node Setup
1. Join additional Raspberry Pis as agent nodes:
```bash
curl -sfL https://get.k3s.io | K3S_URL=https://server-ip:6443 K3S_TOKEN=mynodetoken sh -
```

2. Verify cluster status:
```bash
kubectl get nodes
```

#### Kubeconfig Setup
1. Copy the kubeconfig from the server:
```bash
sudo cat /etc/rancher/k3s/k3s.yaml
```

2. Save it locally as `~/.kube/config` (replace server IP):
```bash
# Replace "127.0.0.1" with your server's IP
sed 's/127.0.0.1/server-ip/' ~/.kube/config
```

### Docker Image Setup

#### Building the Image
1. Create a Dockerfile in the project root:
```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

CMD ["npm", "run", "start:update-script"]
```

2. Build the image:
```bash
docker build -t bills-update:latest .
```

3. Tag the image for your registry:
```bash
docker tag bills-update:latest localhost:5000/bills-update:latest
```

4. Push to your local registry:
```bash
docker push localhost:5000/bills-update:latest
```

### CronJob Deployment

1. Create a CronJob manifest (`cronjob.yaml`):
```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: bills-update-job
spec:
  schedule: "0 1 * * *"  # Daily at 1 AM
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: bills-update
            image: localhost:5000/bills-update:latest
            env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: db-secrets
                  key: database-url
            resources:
              limits:
                memory: "1Gi"
                cpu: "500m"
              requests:
                memory: "512Mi"
                cpu: "250m"
          restartPolicy: OnFailure
```

2. Create a secret for database credentials:
```bash
kubectl create secret generic db-secrets \
  --from-literal=database-url='postgres://user:password@hostname:5432/database'
```

3. Apply the CronJob:
```bash
kubectl apply -f cronjob.yaml
```

## Background Services

### Bill Data Update Service

#### Overview
The system employs a Kubernetes (K3s) cluster running on a homelab setup for automated background tasks.

#### Service Configuration
- **Type**: Kubernetes CronJob on K3s cluster
- **Schedule**: Daily at 1 AM UTC
- **Runtime**: Node.js
- **Container**: Docker
- **Resource Limits**: See deployment manifest

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

### Monitoring

#### Kubernetes Dashboard
1. Install the dashboard:
```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/dashboard/v2.7.0/aio/deploy/recommended.yaml
```

2. Create a service account:
```bash
kubectl create serviceaccount admin-user -n kubernetes-dashboard
kubectl create clusterrolebinding admin-user --clusterrole=cluster-admin --serviceaccount=kubernetes-dashboard:admin-user
```

3. Get the token:
```bash
kubectl -n kubernetes-dashboard create token admin-user
```

4. Access the dashboard:
```bash
kubectl proxy
```

5. Navigate to: http://localhost:8001/api/v1/namespaces/kubernetes-dashboard/services/https:kubernetes-dashboard:/proxy/

## Troubleshooting

### Common Issues and Solutions

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

##### 2. Component State Management
**Common Issues:**
- HTML tags showing in text
- Hydration mismatches
- Missing error handling

**Solutions:**
- Parse HTML only on client side in useEffect
- Provide fallback content
- Implement proper error handling

##### 3. Data Type Consistency
**Common Issues:**
- Inconsistent data types from API
- Missing fallback values
- Type conversion errors

**Solutions:**
- Add type checking and conversion
- Provide default values
- Use proper TypeScript types

### CronJob Debugging

#### 1. Check CronJob Status
```bash
kubectl get cronjobs
```

#### 2. View Recent Job History
```bash
kubectl get jobs
```

#### 3. Check Pod Logs
```bash
kubectl get pods | grep bills-update
kubectl logs <pod-name>
```

#### 4. Manual Job Trigger
```bash
kubectl create job --from=cronjob/bills-update-job bills-update-manual
```

#### 5. Check for Resource Issues
```bash
kubectl describe pod <pod-name>
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

#### 4. Node.js Performance
- Adjust memory limits if needed
- Consider clustering for CPU-intensive tasks
- Monitor garbage collection patterns 