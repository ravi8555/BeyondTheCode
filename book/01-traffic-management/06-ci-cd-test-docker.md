# CI/CD Test Cases - Docker Build

## Test: Multi-stage Docker Build
- **Description:** Verify that the multi-stage Docker build produces a valid image
- **Steps:**
  1. Run `docker build -t test-image:latest .`
  2. Verify the build completes without errors
  3. Check that the final image size is smaller than the builder image
  4. Verify the image can be run with `docker run test-image:latest`

**Expected Result:** Build completes successfully, final image size < builder image size

## Test: Dockerfile Linting
- **Description:** Verify Dockerfile best practices
- **Steps:**
  1. Run `hadolint Dockerfile`
  2. Check for common issues (latest tag, unnecessary sudo, etc.)
  3. Fix any linting errors

**Expected Result:** No critical linting errors, Dockerfile follows best practices