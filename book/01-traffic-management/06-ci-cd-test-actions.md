# CI/CD Test Cases - GitHub Actions

## Test: CI Pipeline Basic Functionality
- **Description:** Verify that the CI/CD pipeline runs successfully on push to main branch
- **Steps:**
  1. Push a commit to the main branch
  2. Wait for the GitHub Actions workflow to complete
  3. Verify the workflow status is "success"
  4. Check that all jobs completed

**Expected Result:** Workflow completes without errors, all steps pass

## Test: Pull Request Workflow Triggers
- **Description:** Verify that the CI/CD pipeline runs on pull requests
- **Steps:**
  1. Create a pull request to the main branch
  2. Verify the workflow runs
  3. Check that the workflow does not deploy to production

**Expected Result:** Workflow runs on pull request, no deployment to production