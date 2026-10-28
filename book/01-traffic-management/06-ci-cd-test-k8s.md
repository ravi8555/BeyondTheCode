# CI/CD Test Cases - Kubernetes

## Test: Deployment Manifest Validation
- **Description:** Verify that the Kubernetes deployment manifest is valid
- **Steps:**
  1. Run `kubectl apply --dry-run=client -f k8s/deployment.yaml`
  2. Verify no errors
  3. Check that the deployment has the correct number of replicas
  4. Verify labels are present

**Expected Result:** Manifest validates without errors, correct replica count, proper labels

## Test: Readiness and Liveness Probes
- **Description:** Verify that the deployment has proper health checks
- **Steps:**
  1. Check that livenessProbe is defined
  2. Check that readinessProbe is defined
  3. Verify probe paths and ports match the application
  4. Test that probes don't have unreasonable timeouts

**Expected Result:** Both probes defined, proper path and port configuration, reasonable timeout values