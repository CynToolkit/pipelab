import { Page } from 'playwright'
import { join } from 'node:path'

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

  // as soon as it appear, without blocking flow
  // ignore asking for update
  const notNowBtn = page.getByText('Not now')
  notNowBtn
    .waitFor()
    .then(async () => {
      notNowBtn.click()
    })
    .catch(async () => {
      console.log('notNowBtn.click() failed')
    })

  // as soon as it appear, without blocking flow
  // ignore webgl error
  const okDialog = page.locator('#okDialog')
  const webglErrorButton = okDialog.locator('.okButton')
  webglErrorButton
    .waitFor()
    .then(async () => {
      const text = await okDialog.allInnerTexts()

      if (text.join().toLowerCase().includes('webgl')) {
        webglErrorButton.click()
      }
    })
    .catch(async () => {
      console.log('webglErrorButton.click() failed')
    })

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

    console.log('jsonResponse', jsonResponse)

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
