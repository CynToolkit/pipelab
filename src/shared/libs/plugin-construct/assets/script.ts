import { Page } from 'playwright'
import { join } from 'node:path'

const registerInstallButtonListener = (page: Page, log: typeof console.log) => {
  const installDialog = page.locator('#addonConfirmInstallDialog')
  const installBtn = installDialog.locator('.okButton')
  installBtn
    .waitFor({
      timeout: 0
    })
    .then(async () => {
      await installBtn.click()
      log('installBtn clicked')
      registerInstallButtonListener(page, log)
    })
    .catch(async (e) => {
      if (e.message.includes('Target page, context or browser has been closed')) return
      log('installBtn.click() failed')
    })
}

const registerSaveLoginExpiredistener = (page: Page, log: typeof console.log) => {
  const installDialog = page.locator('#confirmDialog')
  const cancelBtn = installDialog.locator('.cancelConfirmButton')
  cancelBtn
    .waitFor({
      timeout: 0
    })
    .then(async () => {
      await cancelBtn.click()
      log('cancelBtn clicked')
      registerSaveLoginExpiredistener(page, log)
    })
    .catch(async (e) => {
      if (e.message.includes('Target page, context or browser has been closed')) return
      log('cancelBtn.click() failed')
    })
}

const registerWebglErrorListener = (page: Page, log: typeof console.log) => {
  const okDialog = page.locator('#okDialog')
  const webglErrorButton = okDialog.locator('.okButton')
  webglErrorButton
    .waitFor({
      timeout: 0
    })
    .then(async () => {
      const text = await okDialog.allInnerTexts()

      if (text.join().toLowerCase().includes('webgl')) {
        await webglErrorButton.click()
        log('webglErrorButton clicked')
        registerWebglErrorListener(page, log)
      }
    })
    .catch(async (e) => {
      if (e.message.includes('Target page, context or browser has been closed')) return
      log('webglErrorButton.click() failed')
    })
}
const registerDeprecatedFeatures = (page: Page, log: typeof console.log) => {
  const deprecatedFeaturesDialog = page.locator('#deprecatedFeaturesDialog')
  const okButton = deprecatedFeaturesDialog.locator('.okButton')
  okButton
    .waitFor({
      timeout: 0
    })
    .then(async () => {
      await okButton.click()
      log('okButton clicked')
      registerDeprecatedFeatures(page, log)
    })
    .catch(async (e) => {
      if (e.message.includes('Target page, context or browser has been closed')) return
      log('okButton.click() failed')
    })
}
const registerWelcomeToConstructListener = (page: Page, log: typeof console.log) => {
  const welcomeTourDialog = page.locator('#welcomeTourDialog')
  const okButton = welcomeTourDialog.locator('.noThanksLink')
  okButton
    .waitFor({
      timeout: 0
    })
    .then(async () => {
      await okButton.click()
      log('welcomeTour dismissed')
    })
    .catch(async (e) => {
      if (e.message.includes('Target page, context or browser has been closed')) return
      log('welcomeTour.noThanksLink.click() failed')
    })
}

const registerNewVersionAvailableListener = (page: Page, log: typeof console.log) => {
  const newVersionAvailableDialog = page.locator('#confirmDialog')
  const cancelButton = newVersionAvailableDialog.locator('.cancelConfirmButton')
  cancelButton
    .waitFor({
      timeout: 0
    })
    .then(async () => {
      await cancelButton.click()
      log('cancelButton clicked (new version)')
      registerNewVersionAvailableListener(page, log)
    })
    .catch(async (e) => {
      if (e.message.includes('Target page, context or browser has been closed')) return
      log('cancelButton.click() failed')
    })
}

const registerNotNowListener = (page: Page, log: typeof console.log) => {
  const notNowBtn = page.getByText('Not now')
  notNowBtn
    .waitFor({
      timeout: 0
    })
    .then(async () => {
      await notNowBtn.click()
      log('notNowBtn clicked')
      registerNotNowListener(page, log)
    })
    .catch(async (e) => {
      if (e.message.includes('Target page, context or browser has been closed')) return
      log('notNowBtn.click() failed')
    })
}

const registerMissingAddonErrorListener = (page: Page, log: typeof console.log) => {
  const okDialog = page.locator('#missingAddonsDialog')
  const webglErrorButton = okDialog.locator('.okButton')
  webglErrorButton
    .waitFor({
      timeout: 0
    })
    .then(async () => {
      throw new Error('Missing addon. You should bundle addons with your project')
    })
    .catch(async (e) => {
      if (e.message.includes('Target page, context or browser has been closed')) return
      log('missingAddon.okButton.waitFor() failed')
    })
}

export const script = async (
  page: Page,
  log: typeof console.log,
  filePath: string,
  username: string | undefined,
  password: string | undefined,
  version: string | undefined,
  downloadDir: string
) => {
  let url = 'https://editor.construct.net/'
  if (version) {
    url += version
  }
  log('Navigating to URL', url)
  await page.goto(url, { waitUntil: 'load' })
  log('after navigating, current URL:', page.url())

  if (username && password) {
    log('Directly authenticating via Construct 3 account API...')
    const formData = new FormData()
    formData.append('username', username)
    formData.append('password', password)
    formData.append('productType', 'games')

    const res = await fetch('https://account.construct.net/login.json', {
      method: 'POST',
      body: formData
    })
    const json = (await res.json()) as any

    if (json.request.status !== 'ok') {
      throw new Error(json.request.errorMessage || 'Invalid credentials')
    }

    const { userID, token } = json.response
    log('API login successful, injecting credentials into browser context...')
    log('Current URL before injection:', page.url())

    // Wait for localforage to be available (initialized by the editor's JS)
    await page.waitForFunction(() => typeof localforage !== 'undefined', { timeout: 30000 })
    log('localforage is available')

    // Inject credentials using the editor's own localforage instance
    await page.evaluate(
      async ({ userID, token }) => {
        await localforage.setItem('login-data', { userID, token })
      },
      { userID, token }
    )
    log('Credentials injected successfully.')

    // Reload to pick up the new login state
    log('Reloading page to apply login state...')
    await page.reload()
    log('Page reloaded.')
  }

  registerWelcomeToConstructListener(page, log)
  registerNewVersionAvailableListener(page, log)
  registerNotNowListener(page, log)
  registerInstallButtonListener(page, log)
  registerWebglErrorListener(page, log)
  registerMissingAddonErrorListener(page, log)
  registerDeprecatedFeatures(page, log)
  registerSaveLoginExpiredistener(page, log)

  log('after event')

  // Wait for filesystem API (Ctrl+O handler) to be registered
  await page.waitForTimeout(2000)

  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.keyboard.press('ControlOrMeta+O')
  ])
  log('filechooser')

  console.log('filePath', filePath)
  await fileChooser.setFiles([filePath])
  log('Set file')

  const progressDialog = page.locator('#progressDialog')
  const progessBar = progressDialog.locator('.progressBar')

  log('Waiting for progress dialog')
  await progressDialog.waitFor({
    timeout: 0
  })
  log('Got loading progress dialog')

  const progressInterval = setInterval(async () => {
    try {
      const text = await progessBar.getAttribute('value', { timeout: 100 })
      if (text === null) return
      const textAsNumber = parseFloat(text)
      const finalText = Number.isNaN(textAsNumber) ? 0 : textAsNumber
      log('progress', `${finalText * 100}%`)
    } catch {
      clearInterval(progressInterval)
    }
  }, 500)

  log('Waiting for progress dialog to disapear')
  await progressDialog.waitFor({
    state: 'detached',
    timeout: 0
  })
  log('Got progress dialog to disapear')
  clearInterval(progressInterval)

  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Project' }).click()
  await page.getByRole('menuitem', { name: 'Export' }).click()
  log('"Export" clicked')
  await page
    .locator('ui-iconviewitem')
    .filter({ hasText: 'Web (HTML5)' })
    .locator('ui-icon')
    .click()
  log('"Web" clicked')

  await page.locator('#exportSelectPlatformDialog').getByRole('button', { name: 'Next' }).click()

  await page.getByLabel('Offline support').uncheck()
  log('Disabled offline support')

  await page.locator('#exportStandardOptionsDialog').getByRole('button', { name: 'Next' }).click()
  log('"Next" clicked')
  const downloadPromise = page.waitForEvent('download')
  await page.locator('.downloadExportedProject').click()
  const download = await downloadPromise
  await page.getByRole('button', { name: 'OK' }).click()
  log('"Download" clicked')

  const finalPath = join(downloadDir, download.suggestedFilename())
  await download.saveAs(finalPath)
  log('File Downloaded')

  await page.close()
  return finalPath
}
