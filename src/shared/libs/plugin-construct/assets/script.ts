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
    url += `r${version}`
  }
  log('Navigating to URL', url)
  // const serviceWorkerPromise = page.waitForEvent("serviceworker");
  await page.goto(url)

  // const serviceworker = await serviceWorkerPromise;
  await page.getByText('No thanks, not now').click()
  log('Clicked No thanks button')

  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.keyboard.press('Control+O')
  ])

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
    log('progress', `${textAsNumber * 100}%`)
  }, 500)

  // as soon as it appear, without blocking flow
  // ignore asking for update
  const notNowBtn = page.getByText('Not now')
  notNowBtn
    .waitFor({
      timeout: 0
    })
    .then(async () => {
      await notNowBtn.click()
      log('notNowBtn clicked')
    })
    .catch(async () => {
      log('notNowBtn.click() failed')
    })

  registerInstallButtonListener(page, log)

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
      }
    })
    .catch(async () => {
      log('webglErrorButton.click() failed')
    })

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
  log('"Next" clicked')
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
