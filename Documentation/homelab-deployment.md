# Homelab Deployment Guide

## Overview
This guide details the process of deploying the bills update script on a home Kubernetes (K3s) cluster. The deployment uses Docker containers and Kubernetes CronJobs for automated execution.

## K3s Cluster Setup

### Server Node Setup
1. Install K3s server on your main Raspberry Pi:
```bash
curl -sfL https://get.k3s.io | sh -
```

2. After installation, get the node token from:
```bash
sudo cat /var/lib/rancher/k3s/server/node-token
```

### Agent Node Setup
1. Join additional Raspberry Pis as agent nodes:
```bash
curl -sfL https://get.k3s.io | K3S_URL=https://server-ip:6443 K3S_TOKEN=mynodetoken sh -
```

2. Verify cluster status:
```bash
kubectl get nodes
```

### Kubeconfig Setup
1. Copy the kubeconfig from the server:
```bash
sudo cat /etc/rancher/k3s/k3s.yaml
```

2. Save it locally as `~/.kube/config` (replace server IP):
```bash
# Replace "127.0.0.1" with your server's IP
sed 's/127.0.0.1/server-ip/' ~/.kube/config
```

### Resource Considerations
- Raspberry Pi has limited resources
- Default resource limits in manifests are adjusted for RPi
- Monitor memory usage closely

## Prerequisites
- K3s cluster running on Raspberry Pi nodes
- Docker installed on development machine
- `kubectl` configured to access the cluster
- Access to container registry (Docker Hub or private)
- Git access to the repository

## Docker Container Setup

### Dockerfile
Create a `Dockerfile` in the project root:

```dockerfile
FROM node:18-slim

WORKDIR /app

# Install git and other dependencies
RUN apt-get update && apt-get install -y \
    git \
    && rm -rf /var/lib/apt/lists/*

# Clone repository
RUN git clone https://github.com/shreyashguptas/billsincongress.git .

# Install dependencies
RUN npm install

# Add script to handle updates
COPY update-script.sh /app/
RUN chmod +x /app/update-script.sh

# Set entrypoint
ENTRYPOINT ["/app/update-script.sh"]
```

### Update Script
Create `update-script.sh` in the project root:

```bash
#!/bin/bash
set -e

echo "Starting update at $(date)"

# Pull latest changes
git pull origin main

# Install dependencies
npm install

# Run update script
npm run update-bills

echo "Update completed at $(date)"
```

## Kubernetes Configuration

### Namespace Setup
```bash
# Create dedicated namespace
kubectl create namespace bills-update
```

### Secrets Management
Create Kubernetes secrets for sensitive data:

```bash
kubectl create secret generic bills-update-secrets \
  --from-literal=NEXT_PUBLIC_SUPABASE_URL='your-url' \
  --from-literal=SUPABASE_SERVICE_KEY='your-key' \
  --from-literal=CONGRESS_API_KEY='your-key' \
  --from-literal=SYNC_AUTH_TOKEN='your-token' \
  -n bills-update
```

### CronJob Configuration
Create `k8s/cronjob.yaml`:

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: bills-update-job
  namespace: bills-update
spec:
  schedule: "0 1 * * *"  # 1 AM daily
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: bills-update
            image: your-registry/bills-update:latest
            resources:
              requests:
                memory: "1Gi"
                cpu: "500m"
              limits:
                memory: "2Gi"
                cpu: "1"
            envFrom:
            - secretRef:
                name: bills-update-secrets
          restartPolicy: OnFailure
```

### Persistent Storage (Optional)
Create `k8s/pvc.yaml` for log storage:

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: bills-update-logs
  namespace: bills-update
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
```

## Deployment Steps

1. **Build Docker Image**:
   ```bash
   # Build image
   docker build -t shreyashguptas/bills-update:latest .
   
   # Push to registry
   docker push shreyashguptas/bills-update:latest
   ```

2. **Deploy to K3s**:
   ```bash
   # Apply Kubernetes configurations
   kubectl apply -f k8s/cronjob.yaml
   kubectl apply -f k8s/pvc.yaml
   ```

3. **Verify Deployment**:
   ```bash
   # Check cronjob status
   kubectl get cronjobs -n bills-update
   
   # Check logs of last run
   kubectl logs -l job-name=bills-update-<job-id> -n bills-update
   ```

## Monitoring and Maintenance

### K3s-Specific Monitoring
1. **Node Status**:
   ```bash
   # Check node status and resources
   kubectl get nodes
   kubectl describe nodes
   
   # Check node metrics
   kubectl top nodes  # Requires metrics-server
   ```

2. **Install Metrics Server** (if not installed):
   ```bash
   kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
   ```

3. **Monitor Pod Resources**:
   ```bash
   # Check pod status
   kubectl get pods -n bills-update
   
   # Check pod metrics
   kubectl top pods -n bills-update
   
   # Get detailed pod info
   kubectl describe pod -n bills-update -l app=bills-update
   ```

4. **K3s Service Logs**:
   ```bash
   # Check K3s service status
   sudo systemctl status k3s
   
   # View K3s logs
   sudo journalctl -u k3s
   ```

5. **Node Resource Monitoring**:
   ```bash
   # Check RAM usage
   free -h
   
   # Check disk space
   df -h
   
   # Check system load
   top
   ```

### Raspberry Pi Specific Checks
1. **Temperature Monitoring**:
   ```bash
   # Check CPU temperature
   vcgencmd measure_temp
   ```

2. **Power Status**:
   ```bash
   # Check for undervoltage warnings
   vcgencmd get_throttled
   ```

3. **Memory Split**:
   ```bash
   # View memory split configuration
   vcgencmd get_mem arm && vcgencmd get_mem gpu
   ```

### Logging
- Access container logs using kubectl
- Consider setting up log aggregation (e.g., Loki)
- Monitor disk usage for persistent volumes

### Health Checks
- Monitor CronJob completion status
- Check resource usage on nodes
- Verify data updates in Supabase

### Troubleshooting
1. **Job Failures**:
   - Check container logs
   - Verify secrets are properly mounted
   - Ensure sufficient resources

2. **Network Issues**:
   - Verify cluster network connectivity
   - Check DNS resolution
   - Confirm API access

3. **Resource Constraints**:
   - Monitor node resources
   - Adjust resource limits if needed
   - Check for memory leaks

## Best Practices

1. **Security**:
   - Regularly update base images
   - Use minimal container permissions
   - Rotate secrets periodically
   - Keep K3s cluster updated

2. **Maintenance**:
   - Implement monitoring
   - Set up alerts for failures
   - Regular backup of configurations
   - Document any modifications

3. **Resource Management**:
   - Set appropriate resource limits
   - Monitor resource usage
   - Plan for scalability

## Updates and Upgrades

### Container Updates
1. Build new image version
2. Push to registry
3. Update CronJob specification
4. Apply changes to cluster

### Configuration Updates
1. Update relevant YAML files
2. Apply changes using kubectl
3. Verify changes are applied
4. Monitor for any issues

## Backup and Recovery

### Configuration Backup
- Store YAML files in version control
- Document all custom configurations
- Keep secrets backed up securely

### Recovery Steps
1. Recreate namespace if needed
2. Reapply secrets
3. Deploy CronJob and PVC
4. Verify functionality

## Cluster Information

### Node Configuration
```bash
NAME           STATUS   ROLES                  AGE   VERSION
raspberrypi1   Ready    control-plane,master   41d   v1.31.3+k3s1
raspberrypi2   Ready    <none>                 41d   v1.31.3+k3s1
raspberrypi3   Ready    <none>                 36d   v1.31.4+k3s1
```

The deployment is configured to run on `raspberrypi2` as the worker node.

## Docker Configuration

### Registry Information
- Docker Hub Username: `shreyashguptas`
- Image Name: `bills-update`
- Full Image Path: `shreyashguptas/bills-update:latest`

### Building and Pushing
```bash
# Build the Docker image
docker build -t shreyashguptas/bills-update:latest .

# Push to Docker Hub
docker push shreyashguptas/bills-update:latest
``` 
