import { test, expect } from '@playwright/test'

test.describe('Build History E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authentication to be logged in with premium subscription
    await page.route('**/auth/**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { id: 'test-user', subscription: 'premium' },
          hasBenefit: true
        })
      })
    })

    // Mock build history API responses
    await page.route('**/build-history/**', (route) => {
      const url = route.request().url()

      if (url.includes('get-all')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            entries: [
              {
                id: 'e2e-test-entry-1',
                projectId: 'e2e-project-1',
                projectName: 'E2E Test Project',
                projectPath: '/test/project',
                status: 'completed',
                startTime: Date.now() - 10000,
                endTime: Date.now(),
                duration: 10000,
                totalSteps: 3,
                completedSteps: 3,
                failedSteps: 0,
                cancelledSteps: 0,
                createdAt: Date.now(),
                updatedAt: Date.now()
              }
            ],
            total: 1,
            page: 1,
            pageSize: 20,
            totalPages: 1
          })
        })
      } else if (url.includes('get-storage-info')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            totalEntries: 1,
            totalSize: 1024,
            oldestEntry: Date.now() - 86400000,
            newestEntry: Date.now()
          })
        })
      } else {
        route.fulfill({ status: 200 })
      }
    })

    // Navigate to build history page
    await page.goto('/build-history')
  })

  test('should display build history page correctly', async ({ page }) => {
    // Check page header
    await expect(page.locator('h1')).toContainText('Build History')
    await expect(page.locator('.page-description')).toContainText(
      'Track and manage your build executions'
    )

    // Check premium status indicator
    await expect(page.locator('.premium-status')).toContainText(
      'Premium Feature - Build History Enabled'
    )

    // Check that main content is visible for authorized users
    await expect(page.locator('.main-content')).toBeVisible()
  })

  test('should display build history entries', async ({ page }) => {
    // Wait for entries to load
    await expect(page.locator('[data-testid="build-history-list"]')).toBeVisible()

    // Check that entry is displayed
    await expect(page.locator('[data-testid="build-history-item"]')).toBeVisible()
    await expect(page.locator('[data-testid="project-name"]')).toContainText('E2E Test Project')
  })

  test('should show correct status badges', async ({ page }) => {
    // Check status badge
    await expect(page.locator('[data-testid="status-badge"]')).toBeVisible()
    await expect(page.locator('[data-testid="status-badge"]')).toHaveClass(/status-completed/)
  })

  test('should display storage information', async ({ page }) => {
    // Check storage info section
    await expect(page.locator('.storage-info')).toBeVisible()
    await expect(page.locator('.storage-info')).toContainText('Storage Information')
    await expect(page.locator('.storage-info')).toContainText('Total Entries:')
    await expect(page.locator('.storage-info')).toContainText('Storage Size:')
  })

  test('should handle refresh functionality', async ({ page }) => {
    // Click refresh button
    await page.click('[data-testid="refresh-button"]')

    // Should show loading state briefly
    await expect(page.locator('[data-testid="loading-indicator"]')).toBeVisible()

    // Should reload data
    await expect(page.locator('[data-testid="build-history-item"]')).toBeVisible()
  })

  test('should handle filtering', async ({ page }) => {
    // Open filters
    await page.click('[data-testid="filters-toggle"]')

    // Apply status filter
    await page.selectOption('[data-testid="status-filter"]', 'completed')

    // Apply filter
    await page.click('[data-testid="apply-filters"]')

    // Should show filtered results
    await expect(page.locator('[data-testid="build-history-item"]')).toBeVisible()
  })

  test('should handle pagination', async ({ page }) => {
    // Mock multiple pages of data
    await page.route('**/build-history/get-all**', (route) => {
      const url = new URL(route.request().url())
      const page = url.searchParams.get('page') || '1'

      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          entries: Array.from({ length: 20 }, (_, i) => ({
            id: `page-${page}-entry-${i}`,
            projectId: 'test-project',
            projectName: `Project ${i}`,
            projectPath: '/test/project',
            status: 'completed',
            startTime: Date.now() - i * 1000,
            endTime: Date.now() - i * 900,
            duration: 100,
            totalSteps: 1,
            completedSteps: 1,
            failedSteps: 0,
            cancelledSteps: 0,
            createdAt: Date.now() - i * 1000,
            updatedAt: Date.now() - i * 1000
          })),
          total: 45,
          page: parseInt(page),
          pageSize: 20,
          totalPages: 3
        })
      })
    })

    // Should show pagination controls
    await expect(page.locator('[data-testid="pagination"]')).toBeVisible()

    // Navigate to next page
    await page.click('[data-testid="next-page"]')

    // Should load page 2
    await expect(page.locator('[data-testid="current-page"]')).toContainText('2')
  })

  test('should handle entry details view', async ({ page }) => {
    // Click on entry to view details
    await page.click('[data-testid="build-history-item"]')

    // Should open details modal
    await expect(page.locator('[data-testid="build-details-modal"]')).toBeVisible()
    await expect(page.locator('[data-testid="build-details-modal"]')).toContainText('Build Details')
  })

  test('should handle entry deletion', async ({ page }) => {
    // Mock delete API
    await page.route('**/build-history/delete**', (route) => {
      route.fulfill({ status: 200 })
    })

    // Click delete button
    await page.click('[data-testid="delete-button"]')

    // Should show confirmation dialog
    await expect(page.locator('[data-testid="confirm-dialog"]')).toBeVisible()

    // Confirm deletion
    await page.click('[data-testid="confirm-delete"]')

    // Entry should be removed from list
    await expect(page.locator('[data-testid="build-history-item"]')).not.toBeVisible()
  })

  test('should handle clear all history', async ({ page }) => {
    // Mock clear API
    await page.route('**/build-history/clear**', (route) => {
      route.fulfill({ status: 200 })
    })

    // Click clear history button
    await page.click('[data-testid="clear-history-button"]')

    // Should show confirmation dialog
    await expect(page.locator('[data-testid="confirm-dialog"]')).toBeVisible()

    // Confirm clear
    await page.click('[data-testid="confirm-clear"]')

    // All entries should be cleared
    await expect(page.locator('[data-testid="build-history-item"]')).not.toBeVisible()
    await expect(page.locator('[data-testid="empty-state"]')).toBeVisible()
  })

  test('should handle export functionality', async ({ page }) => {
    // Mock export API
    await page.route('**/build-history/export**', (route) => {
      route.fulfill({ status: 200 })
    })

    // Click export button
    await page.click('[data-testid="export-button"]')

    // Should show export dialog
    await expect(page.locator('[data-testid="export-dialog"]')).toBeVisible()
    await expect(page.locator('[data-testid="export-progress"]')).toBeVisible()

    // Should show progress updates
    await expect(page.locator('[data-testid="export-status"]')).toContainText('Preparing')
  })

  test('should handle sorting', async ({ page }) => {
    // Mock multiple entries for sorting
    await page.route('**/build-history/get-all**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          entries: [
            {
              id: 'sort-entry-1',
              projectId: 'project-1',
              projectName: 'Project Z',
              projectPath: '/test/project',
              status: 'completed',
              startTime: Date.now() - 1000,
              endTime: Date.now() - 900,
              duration: 100,
              totalSteps: 1,
              completedSteps: 1,
              failedSteps: 0,
              cancelledSteps: 0,
              createdAt: Date.now() - 1000,
              updatedAt: Date.now() - 1000
            },
            {
              id: 'sort-entry-2',
              projectId: 'project-2',
              projectName: 'Project A',
              projectPath: '/test/project',
              status: 'completed',
              startTime: Date.now() - 2000,
              endTime: Date.now() - 1900,
              duration: 100,
              totalSteps: 1,
              completedSteps: 1,
              failedSteps: 0,
              cancelledSteps: 0,
              createdAt: Date.now() - 2000,
              updatedAt: Date.now() - 2000
            }
          ],
          total: 2,
          page: 1,
          pageSize: 20,
          totalPages: 1
        })
      })
    })

    // Click sort by project name
    await page.click('[data-testid="sort-project-name"]')

    // Should sort entries alphabetically
    const firstProject = page.locator('[data-testid="project-name"]').first()
    await expect(firstProject).toContainText('Project A')
  })

  test('should handle search functionality', async ({ page }) => {
    // Enter search term
    await page.fill('[data-testid="search-input"]', 'E2E Test')

    // Should filter entries
    await expect(page.locator('[data-testid="build-history-item"]')).toBeVisible()
    await expect(page.locator('[data-testid="project-name"]')).toContainText('E2E Test Project')
  })

  test('should handle unauthorized access', async ({ page }) => {
    // Mock unauthorized response
    await page.route('**/auth/**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { id: 'test-user', subscription: 'free' },
          hasBenefit: false
        })
      })
    })

    // Reload page
    await page.reload()

    // Should show unauthorized state
    await expect(page.locator('.unauthorized-state')).toBeVisible()
    await expect(page.locator('.unauthorized-state')).toContainText('Premium Feature')
    await expect(page.locator('[data-testid="upgrade-button"]')).toBeVisible()
  })

  test('should handle subscription errors', async ({ page }) => {
    // Mock subscription error
    await page.route('**/build-history/**', (route) => {
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'SUBSCRIPTION_REQUIRED',
          message: 'Premium subscription required for build history'
        })
      })
    })

    // Reload page
    await page.reload()

    // Should show subscription error
    await expect(page.locator('.subscription-error')).toBeVisible()
    await expect(page.locator('.subscription-error')).toContainText('Subscription Required')
    await expect(page.locator('[data-testid="upgrade-button"]')).toBeVisible()
  })

  test('should handle network errors gracefully', async ({ page }) => {
    // Mock network error
    await page.route('**/build-history/get-all**', (route) => {
      route.abort('failed')
    })

    // Reload page
    await page.reload()

    // Should show error state
    await expect(page.locator('[data-testid="error-state"]')).toBeVisible()
    await expect(page.locator('[data-testid="retry-button"]')).toBeVisible()
  })

  test('should handle responsive design', async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })

    // Should adapt layout for mobile
    await expect(page.locator('.build-history-page')).toBeVisible()
    await expect(page.locator('h1')).toBeVisible()

    // Test tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 })

    // Should show tablet layout
    await expect(page.locator('.build-history-page')).toBeVisible()
  })

  test('should handle keyboard navigation', async ({ page }) => {
    // Tab through interactive elements
    await page.keyboard.press('Tab')

    // Should focus first interactive element
    const focusedElement = page.locator(':focus')
    await expect(focusedElement).toBeVisible()

    // Navigate through list items
    await page.keyboard.press('ArrowDown')
    await expect(page.locator('[data-testid="build-history-item"]:focus')).toBeVisible()
  })

  test('should handle real-time updates', async ({ page }) => {
    // Mock WebSocket or polling updates
    await page.route('**/build-history/get-all**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          entries: [
            {
              id: 'realtime-entry',
              projectId: 'realtime-project',
              projectName: 'Real-time Project',
              projectPath: '/test/project',
              status: 'running',
              startTime: Date.now(),
              totalSteps: 5,
              completedSteps: 2,
              failedSteps: 0,
              cancelledSteps: 0,
              createdAt: Date.now(),
              updatedAt: Date.now()
            }
          ],
          total: 1,
          page: 1,
          pageSize: 20,
          totalPages: 1
        })
      })
    })

    // Trigger refresh
    await page.click('[data-testid="refresh-button"]')

    // Should show updated data
    await expect(page.locator('[data-testid="project-name"]')).toContainText('Real-time Project')
    await expect(page.locator('[data-testid="status-badge"]')).toHaveClass(/status-running/)
  })

  test('should handle data persistence across sessions', async ({ page }) => {
    // Set local storage data
    await page.evaluate(() => {
      localStorage.setItem(
        'build-history-filters',
        JSON.stringify({
          status: 'completed',
          projectName: 'Persistent Project'
        })
      )
    })

    // Reload page
    await page.reload()

    // Should restore filters from localStorage
    await expect(page.locator('[data-testid="status-filter"]')).toHaveValue('completed')
    await expect(page.locator('[data-testid="project-filter"]')).toHaveValue('Persistent Project')
  })

  test('should handle performance with large datasets', async ({ page }) => {
    // Mock large dataset
    await page.route('**/build-history/get-all**', (route) => {
      const entries = Array.from({ length: 1000 }, (_, i) => ({
        id: `perf-entry-${i}`,
        projectId: `project-${i}`,
        projectName: `Performance Project ${i}`,
        projectPath: '/test/project',
        status: i % 2 === 0 ? 'completed' : 'failed',
        startTime: Date.now() - i * 1000,
        endTime: Date.now() - i * 900,
        duration: 100,
        totalSteps: 3,
        completedSteps: i % 2 === 0 ? 3 : 1,
        failedSteps: i % 2 === 0 ? 0 : 2,
        cancelledSteps: 0,
        createdAt: Date.now() - i * 1000,
        updatedAt: Date.now() - i * 1000
      }))

      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          entries: entries.slice(0, 20),
          total: 1000,
          page: 1,
          pageSize: 20,
          totalPages: 50
        })
      })
    })

    // Should handle large dataset efficiently
    const startTime = Date.now()
    await page.waitForSelector('[data-testid="build-history-list"]')
    const loadTime = Date.now() - startTime

    expect(loadTime).toBeLessThan(3000) // Should load within 3 seconds
    await expect(page.locator('[data-testid="build-history-item"]')).toHaveCount(20)
  })
})
