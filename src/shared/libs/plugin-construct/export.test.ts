import { expect, test, describe } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * These tests verify that the Construct 3 export login flow in script.ts
 * uses the correct approach: API call + localforage injection on editor origin.
 *
 * They catch the regression where:
 *   1. Credentials were injected on the wrong origin (account.construct.net IndexedDB)
 *   2. Login was done via UI automation (clicking through iframe dialogs)
 *   3. Listeners were registered in the wrong order (after file chooser)
 *   4. Listeners lacked browser-closed guards
 */

const scriptPath = resolve(import.meta.dirname, './assets/script.ts')
const script = readFileSync(scriptPath, 'utf8')

describe('script.ts login flow', () => {
  test('injects credentials via localforage (editor origin), not raw IndexedDB (account origin)', () => {
    // NEW: must use localforage to inject on editor.construct.net
    expect(script).toContain('localforage.setItem')
    expect(script).toContain('login-data')

    // OLD broken approach: navigated to account.construct.net to use raw IndexedDB
    expect(script).not.toContain("page.goto('https://account.construct.net")
    expect(script).not.toContain('page.goto("https://account.construct.net')
  })

  test('calls the account.construct.net API for authentication', () => {
    expect(script).toContain('account.construct.net/login.json')
    expect(script).toContain('productType')
  })

  test('navigates to editor.construct.net first, not account.construct.net', () => {
    // The editor URL must be set first so localforage is on the right origin
    const editorGoto = script.indexOf("editor.construct.net/")
    const accountGoto = script.indexOf("account.construct.net/")

    // editor.goto must appear before any account.construct.net reference
    expect(editorGoto).toBeLessThan(accountGoto)
  })

  test('waits for localforage to be available before injecting', () => {
    expect(script).toContain("waitForFunction(() => typeof localforage !== 'undefined'")
  })

  test('reloads page after injecting credentials', () => {
    // Must reload so the editor picks up the login state
    const injectIndex = script.indexOf('localforage.setItem')
    const reloadIndex = script.indexOf('page.reload()')

    expect(reloadIndex).toBeGreaterThan(injectIndex)
  })

  test('registers all dialog listeners before the file chooser', () => {
    // All register*Listener calls must come before the fileChooser
    const fileChooserIndex = script.indexOf("waitForEvent('filechooser')")

    expect(script.indexOf('registerWelcomeToConstructListener(page')).toBeLessThan(fileChooserIndex)
    expect(script.indexOf('registerNewVersionAvailableListener(page')).toBeLessThan(fileChooserIndex)
    expect(script.indexOf('registerNotNowListener(page')).toBeLessThan(fileChooserIndex)
    expect(script.indexOf('registerInstallButtonListener(page')).toBeLessThan(fileChooserIndex)
    expect(script.indexOf('registerWebglErrorListener(page')).toBeLessThan(fileChooserIndex)
    expect(script.indexOf('registerMissingAddonErrorListener(page')).toBeLessThan(fileChooserIndex)
    expect(script.indexOf('registerDeprecatedFeatures(page')).toBeLessThan(fileChooserIndex)
    expect(script.indexOf('registerSaveLoginExpiredistener(page')).toBeLessThan(fileChooserIndex)
  })

  test('registerNotNowListener re-registers itself (recursive)', () => {
    // The function body must call itself after a successful click
    const fnMatch = script.match(
      /const registerNotNowListener[\s\S]*?^}/m
    )
    expect(fnMatch).toBeTruthy()
    expect(fnMatch![0]).toContain('registerNotNowListener(page')
  })

  test('registerNewVersionAvailableListener exists', () => {
    expect(script).toContain('registerNewVersionAvailableListener')
    expect(script).toContain('#confirmDialog')
    expect(script).toContain('.cancelConfirmButton')
  })

  test('all listener catch handlers guard against browser closure', () => {
    const catchPattern = /Target page, context or browser has been closed/g
    const matches = script.match(catchPattern)
    // Must have at least 8 catch handlers with this guard (one per listener)
    expect(matches).not.toBeNull()
    expect(matches!.length).toBeGreaterThanOrEqual(8)
  })

  test('OLD UI-automation login approach is completely removed', () => {
    // The old code used these selectors to click through a login dialog iframe
    expect(script).not.toContain("getByTitle('User account')")
    expect(script).not.toContain('#loginDialog')
    expect(script).not.toContain("getByRole('menuitem', { name: 'Log in' })")
    expect(script).not.toContain("frameLocator('#loginDialog iframe')")
  })

  test('login credentials are not injected via raw IndexedDB', () => {
    // Old approach: page.evaluate(() => { const req = indexedDB.open(...) })
    expect(script).not.toContain('indexedDB.open')
    expect(script).not.toContain('objectStore')
    expect(script).not.toContain('transaction')
  })
})
