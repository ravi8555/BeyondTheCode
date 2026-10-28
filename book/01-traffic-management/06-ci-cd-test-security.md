# CI/CD Test Cases - Security

## Test: Secret Management
- **Description:** Verify that secrets are not hardcoded in pipeline scripts
- **Steps:**
  1. Check that no secrets are in the GitHub Actions workflow
  2. Verify that secrets are used from the secrets store
  3. Check that Docker login uses password-stdin
  4. Verify that Kubernetes secrets are used for sensitive data

**Expected Result:** No hardcoded secrets in workflow, secrets accessed from secure store

## Test: Image Vulnerability Scanning
- **Description:** Verify that Docker images are scanned for vulnerabilities
- **Steps:**
  1. Run `trivy image myapp:latest`
  2. Check for critical vulnerabilities
  3. Fail the build if critical vulnerabilities are found
  4. Generate a vulnerability report

**Expected Result:** Image scanned for vulnerabilities, critical vulnerabilities blocked, report generated