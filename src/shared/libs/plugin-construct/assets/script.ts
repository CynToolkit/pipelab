import { Page } from 'playwright'
import { join } from 'node:path'

const registerInstallButtonListener = (page: Page, log: typeof console.log) => {
  // as soon as it appear, without blocking flow
  // accept installing plugins
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
    .catch(async () => {
      log('installBtn.click() failed')
    })
}

const registerSaveLoginExpiredistener = (page: Page, log: typeof console.log) => {
  // as soon as it appear, without blocking flow
  // accept installing plugins
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
    .catch(async () => {
      log('cancelBtn.click() failed')
    })
}

const registerWebglErrorListener = (page: Page, log: typeof console.log) => {
  // as soon as it appear, without blocking flow
  // ignore webgl error
  const okDialog = page.locator('#okDialog')
  const webglErrorButton = okDialog.locator('.okButton')
  webglErrorButton
    .waitFor({
      timeout: 0
    })
    .then(async () => {
      const text = await okDialog.allInnerTexts()

      if (text.join().toLowerCase().includes('webgl')) {
        webglErrorButton.click()
        log('webglErrorButton clicked')
        registerWebglErrorListener(page, log)
      }
    })
    .catch(async () => {
      log('webglErrorButton.click() failed')
    })
}
const registerDeprecatedFeatures = (page: Page, log: typeof console.log) => {
  // as soon as it appear, without blocking flow
  // ignore deprecated feature
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
    .catch(async () => {
      log('okButton.click() failed')
    })
}
const registerWelcomeToConstructListener = (page: Page, log: typeof console.log) => {
  // as soon as it appear, without blocking flow
  // ignore deprecated feature
  const welcomeTourDialog = page.locator('#welcomeTourDialog')
  const okButton = welcomeTourDialog.locator('.noThanksLink')
  okButton
    .waitFor({
      timeout: 0
    })
    .then(async () => {
      await okButton.click()
      log('okButton clicked')
      registerDeprecatedFeatures(page, log)
    })
    .catch(async () => {
      log('okButton.click() failed')
    })
}

const registerMissingAddonErrorListener = (page: Page, log: typeof console.log) => {
  // as soon as it appear, without blocking flow
  // ignore missing addon and throw
  const okDialog = page.locator('#missingAddonsDialog')
  const webglErrorButton = okDialog.locator('.okButton')
  webglErrorButton
    .waitFor({
      timeout: 0
    })
    .then(async () => {
      throw new Error('Missing addon. You should bundle addons with your project')
    })
    .catch(async () => {
      log('webglErrorButton.click() failed')
    })
}

export const script = async (
  page: Page,
  log: typeof console.log,
  filePath: string,
  username: string | undefined,
  password: string | undefined,
  version: string | undefined,
  downloadDir: string,
  // addonsFolder: string | undefined
) => {
  let url = 'https://editor.construct.net/'
  if (version) {
    url += `r${version}`
  }
  log('Navigating to URL', url)
  // const serviceWorkerPromise = page.waitForEvent("serviceworker");
  await page.goto(url)
  log('after navigating')

  // const serviceworker = await serviceWorkerPromise;
  registerWelcomeToConstructListener(page, log)

  log('after event')

  // if (addonsFolder) {
  //   const _files = await readdir(addonsFolder)
  //   const addonFiles = _files
  //     .filter((x) => extname(x) === '.c3addon')
  //     .map((x) => join(addonsFolder, x))
  //   console.log('addonFiles', addonFiles)

  //   await page.pause()
  //   await page.getByRole('button', { name: 'Menu' }).click();
  //   await page.mouse.move(30, 150)
  //   await page.mouse.move(150, 100)
  //   await page.mouse.click(150, 100);

  //   const [fileChooserAddons] = await Promise.all([
  //     page.waitForEvent('filechooser'),
  //     await page.getByRole('button', { name: 'Install new addon...' }).click()
  //   ])

  //   await fileChooserAddons.setFiles(addonFiles)

  //   // await page.pause()
  //   // if (addonFiles.length > 0) {
  //   //   for (let i = 0; i < addonFiles.length - 1; i += 1) {
  //   //     const [fileChooser] = await Promise.all([
  //   //       page.waitForEvent('filechooser'),
  //   //       page.keyboard.press('ControlOrMeta+O')
  //   //     ])

  //   //     await fileChooser.setFiles(addonFiles[i])
  //   //     log('Set addon files', addonFiles[i])

  //   //     await page.pause()
  //   //   }
  //   // }
  // }

  await page.waitForTimeout(2000)
  log('after wait')

  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.keyboard.press('ControlOrMeta+O')
  ])
  log('filechooser')

  console.log('filePath', filePath)
  await fileChooser.setFiles([filePath])
  log('Set file')

  // await page.getByText("Not now").click({
  //   timeout: 1000
  // });

  const progressDialog = page.locator('#progressDialog')
  // <progress class="progressBar" value="0.293996941070648" max="1"></progress>
  const progessBar = progressDialog.locator('.progressBar')

  log('Waiting for progress dialog')
  await progressDialog.waitFor({
    timeout: 0
  })
  log('Got loading progress dialog')

  const progressInterval = setInterval(async () => {
    const text = await progessBar.getAttribute('value')
    const textAsNumber = parseFloat(text)
    const finalText = Number.isNaN(textAsNumber) ? 0 : textAsNumber
    log('progress', `${finalText * 100}%`)
  }, 500)

  // as soon as it appear, without blocking flow
  // ignore asking for update
  const notNowBtn = page.getByText('Not now')
  notNowBtn
    .waitFor({
      timeout: 0
    })
    .then(async () => {
      return notNowBtn.click()
    })
    .then(() => {
      log('notNowBtn clicked')
    })
    .catch(async () => {
      log('notNowBtn.click() failed')
    })

  registerInstallButtonListener(page, log)
  registerWebglErrorListener(page, log)
  registerMissingAddonErrorListener(page, log)
  registerDeprecatedFeatures(page, log)
  registerSaveLoginExpiredistener(page, log)

  log('Waiting for progress dialog to disapear')
  await progressDialog.waitFor({
    state: 'detached',
    timeout: 0
  })
  log('Got progress dialog to disapear')
  clearTimeout(progressInterval)

  if (username && password) {
    log('Authenticating')
    await page.getByTitle('User account').locator('ui-icon').click()
    await page.getByRole('menuitem', { name: 'Log in' }).locator('span').click()
    await page.frameLocator('#loginDialog iframe').getByLabel('Username').fill(username)
    await page.frameLocator('#loginDialog iframe').getByLabel('Password').fill(password)

    const tokenPromise = page.waitForResponse(/https:\/\/account.*\.construct\.net\/login.json/i)

    await page.frameLocator('#loginDialog iframe').getByRole('button', { name: 'Log in' }).click()

    const response = await tokenPromise
    const jsonResponse = await response.json()

    log('jsonResponse', jsonResponse)

    if (jsonResponse.request.status === 'error') {
      await page.close()

      throw new Error('Invalid credentials')
    }
    log('Authenticated')
  }

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
