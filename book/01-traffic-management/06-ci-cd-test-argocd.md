# CI/CD Test Cases - Argo CD

## Test: Argo CD Application Manifest
- **Description:** Verify that the Argo CD application manifest is valid
- **Steps:**
  1. Run `kubectl apply --dry-run=client -f argocd/application.yaml`
  2. Verify no errors
  3. Check that the source repository URL is correct
  4. Verify the destination namespace is correct

**Expected Result:** Manifest validates without errors, correct repository URL, correct destination namespace

## Test: Sync Policy Configuration
- **Description:** Verify that the Argo CD sync policy is configured correctly
- **Steps:**
  1. Check that automated sync is enabled
  2. Verify prune is enabled
  3. Verify self-heal is enabled
  4. Check sync options

**Expected Result:** Automated sync enabled, prune enabled, self-heal enabled, correct sync options