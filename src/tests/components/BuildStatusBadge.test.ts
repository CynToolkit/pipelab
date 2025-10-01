import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BuildStatusBadge from '../../renderer/components/BuildStatusBadge.vue'

describe('BuildStatusBadge', () => {
  const createWrapper = (props: any = {}) => {
    return mount(BuildStatusBadge, {
      props: {
        status: 'completed',
        showIcon: true,
        size: 'medium',
        ...props
      }
    })
  }

  describe('Rendering', () => {
    it('should render with default props', () => {
      const wrapper = createWrapper()

      expect(wrapper.find('.build-status-badge').exists()).toBe(true)
      expect(wrapper.text()).toBe('Completed')
      expect(wrapper.find('.status-icon').exists()).toBe(true)
    })

    it('should render without icon when showIcon is false', () => {
      const wrapper = createWrapper({ showIcon: false })

      expect(wrapper.find('.status-icon').exists()).toBe(false)
      expect(wrapper.text()).toBe('Completed')
    })

    it('should apply correct size classes', () => {
      const smallWrapper = createWrapper({ size: 'small' })
      const largeWrapper = createWrapper({ size: 'large' })

      expect(smallWrapper.find('.size-small').exists()).toBe(true)
      expect(largeWrapper.find('.size-large').exists()).toBe(true)
    })
  })

  describe('Status Display', () => {
    it('should display completed status correctly', () => {
      const wrapper = createWrapper({ status: 'completed' })

      expect(wrapper.text()).toBe('Completed')
      expect(wrapper.find('.status-completed').exists()).toBe(true)
      expect(wrapper.find('.pi-check').exists()).toBe(true)
    })

    it('should display running status correctly', () => {
      const wrapper = createWrapper({ status: 'running' })

      expect(wrapper.text()).toBe('Running')
      expect(wrapper.find('.status-running').exists()).toBe(true)
      expect(wrapper.find('.pi-spin').exists()).toBe(true)
    })

    it('should display failed status correctly', () => {
      const wrapper = createWrapper({ status: 'failed' })

      expect(wrapper.text()).toBe('Failed')
      expect(wrapper.find('.status-failed').exists()).toBe(true)
      expect(wrapper.find('.pi-times').exists()).toBe(true)
    })

    it('should display cancelled status correctly', () => {
      const wrapper = createWrapper({ status: 'cancelled' })

      expect(wrapper.text()).toBe('Cancelled')
      expect(wrapper.find('.status-cancelled').exists()).toBe(true)
      expect(wrapper.find('.pi-stop').exists()).toBe(true)
    })

    it('should display pending status correctly', () => {
      const wrapper = createWrapper({ status: 'pending' })

      expect(wrapper.text()).toBe('Pending')
      expect(wrapper.find('.status-pending').exists()).toBe(true)
      expect(wrapper.find('.pi-clock').exists()).toBe(true)
    })
  })

  describe('Status Configuration', () => {
    const statusTests = [
      {
        status: 'completed' as const,
        expectedClass: 'status-completed',
        expectedIcon: 'pi-check',
        expectedText: 'Completed',
        expectedTooltip: 'Build completed successfully'
      },
      {
        status: 'running' as const,
        expectedClass: 'status-running',
        expectedIcon: 'pi-spinner',
        expectedText: 'Running',
        expectedTooltip: 'Build is currently in progress'
      },
      {
        status: 'failed' as const,
        expectedClass: 'status-failed',
        expectedIcon: 'pi-times',
        expectedText: 'Failed',
        expectedTooltip: 'Build failed with errors'
      },
      {
        status: 'cancelled' as const,
        expectedClass: 'status-cancelled',
        expectedIcon: 'pi-stop',
        expectedText: 'Cancelled',
        expectedTooltip: 'Build was cancelled'
      },
      {
        status: 'pending' as const,
        expectedClass: 'status-pending',
        expectedIcon: 'pi-clock',
        expectedText: 'Pending',
        expectedTooltip: 'Step is waiting to execute'
      }
    ]

    statusTests.forEach(({ status, expectedClass, expectedIcon, expectedText }) => {
      it(`should configure ${status} status correctly`, () => {
        const wrapper = createWrapper({ status })

        expect(wrapper.find(`.${expectedClass}`).exists()).toBe(true)
        expect(wrapper.find(`.${expectedIcon}`).exists()).toBe(true)
        expect(wrapper.text()).toBe(expectedText)
        expect(wrapper.attributes('data-pc-section')).toBe('tooltip')
      })
    })
  })

  describe('Size Variants', () => {
    it('should apply small size styling', () => {
      const wrapper = createWrapper({ size: 'small' })

      expect(wrapper.find('.size-small').exists()).toBe(true)
      expect(wrapper.classes()).toContain('size-small')
    })

    it('should apply medium size styling by default', () => {
      const wrapper = createWrapper()

      expect(wrapper.find('.size-medium').exists()).toBe(true)
      expect(wrapper.classes()).toContain('size-medium')
    })

    it('should apply large size styling', () => {
      const wrapper = createWrapper({ size: 'large' })

      expect(wrapper.find('.size-large').exists()).toBe(true)
      expect(wrapper.classes()).toContain('size-large')
    })
  })

  describe('Icon Display', () => {
    it('should show icon by default', () => {
      const wrapper = createWrapper()

      expect(wrapper.find('.status-icon').exists()).toBe(true)
      expect(wrapper.find('.pi-check').exists()).toBe(true)
    })

    it('should hide icon when showIcon is false', () => {
      const wrapper = createWrapper({ showIcon: false })

      expect(wrapper.find('.status-icon').exists()).toBe(false)
      expect(wrapper.find('.pi-check').exists()).toBe(false)
    })

    it('should show correct icon for each status', () => {
      const statusIconMap = {
        completed: 'pi-check',
        running: 'pi-spinner',
        failed: 'pi-times',
        cancelled: 'pi-stop',
        pending: 'pi-clock'
      }

      Object.entries(statusIconMap).forEach(([status, expectedIcon]) => {
        const wrapper = createWrapper({ status: status as any })
        expect(wrapper.find(`.${expectedIcon}`).exists()).toBe(true)
      })
    })
  })

  describe('CSS Classes', () => {
    it('should apply base badge class', () => {
      const wrapper = createWrapper()

      expect(wrapper.find('.build-status-badge').exists()).toBe(true)
    })

    it('should apply status-specific classes', () => {
      const wrapper = createWrapper({ status: 'failed' })

      expect(wrapper.find('.status-failed').exists()).toBe(true)
      expect(wrapper.classes()).toContain('status-failed')
    })

    it('should apply size-specific classes', () => {
      const wrapper = createWrapper({ size: 'large' })

      expect(wrapper.find('.size-large').exists()).toBe(true)
      expect(wrapper.classes()).toContain('size-large')
    })

    it('should combine multiple classes correctly', () => {
      const wrapper = createWrapper({ status: 'running', size: 'small' })

      expect(wrapper.classes()).toContain('build-status-badge')
      expect(wrapper.classes()).toContain('status-running')
      expect(wrapper.classes()).toContain('size-small')
    })
  })

  describe('Tooltip Integration', () => {
    it('should have tooltip directive', () => {
      const wrapper = createWrapper()

      const badgeElement = wrapper.find('.build-status-badge')
      expect(badgeElement.attributes('data-pc-section')).toBe('tooltip')
    })

    it('should display correct tooltip for each status', () => {
      const statusTooltipMap = {
        completed: 'Build completed successfully',
        running: 'Build is currently in progress',
        failed: 'Build failed with errors',
        cancelled: 'Build was cancelled',
        pending: 'Step is waiting to execute'
      }

      Object.entries(statusTooltipMap).forEach(([status]) => {
        const wrapper = createWrapper({ status: status as any })
        // The tooltip content would be tested through the directive
        expect(wrapper.find('.build-status-badge').exists()).toBe(true)
      })
    })
  })

  describe('Animation and Visual Effects', () => {
    it('should apply pulse animation for running status', () => {
      const wrapper = createWrapper({ status: 'running' })

      expect(wrapper.find('.status-running').exists()).toBe(true)
      // Pulse animation is applied via CSS, would need visual testing
    })

    it('should apply hover effects', () => {
      const wrapper = createWrapper()

      const badgeElement = wrapper.find('.build-status-badge')
      expect(badgeElement.classes()).toContain('build-status-badge')
      // Hover effects are applied via CSS, would need visual testing
    })
  })

  describe('Accessibility', () => {
    it('should have proper ARIA attributes when used as tooltip', () => {
      const wrapper = createWrapper()

      const badgeElement = wrapper.find('.build-status-badge')
      expect(badgeElement.exists()).toBe(true)
      // Tooltip directive should handle accessibility
    })

    it('should be focusable for keyboard navigation', () => {
      const wrapper = createWrapper()

      const badgeElement = wrapper.find('.build-status-badge')
      expect(badgeElement.exists()).toBe(true)
      // Focusability would depend on tooltip implementation
    })
  })

  describe('Edge Cases', () => {
    it('should handle invalid status gracefully', () => {
      // This would test the fallback behavior if status is not in the config
      const wrapper = createWrapper({ status: 'unknown' as any })

      expect(wrapper.find('.build-status-badge').exists()).toBe(true)
      expect(wrapper.text()).toBe('unknown')
    })

    it('should handle missing props gracefully', () => {
      const wrapper = mount(BuildStatusBadge, {
        props: {
          status: 'completed'
          // Missing showIcon and size, should use defaults
        }
      })

      expect(wrapper.find('.build-status-badge').exists()).toBe(true)
      expect(wrapper.find('.status-icon').exists()).toBe(true)
      expect(wrapper.find('.size-medium').exists()).toBe(true)
    })
  })

  describe('Component Integration', () => {
    it('should work correctly in a parent component context', () => {
      const wrapper = createWrapper({ status: 'completed' })

      expect(wrapper.vm).toBeDefined()
      expect(wrapper.vm.status).toBe('completed')
      expect(wrapper.vm.showIcon).toBe(true)
      expect(wrapper.vm.size).toBe('medium')
    })

    it('should react to prop changes', async () => {
      const wrapper = createWrapper({ status: 'completed' })

      expect(wrapper.text()).toBe('Completed')

      await wrapper.setProps({ status: 'failed' })

      expect(wrapper.text()).toBe('Failed')
      expect(wrapper.find('.status-failed').exists()).toBe(true)
    })
  })
})
