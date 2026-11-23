import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chromium } from 'playwright'
import { createSources } from './source-server.mjs'

const wire = JSON.parse(await readFile(new URL('./wire.json', import.meta.url), 'utf8'))

test('浏览器能选择业务范围并回读提交号', async t => {
  const server = createSources().listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise(resolve => server.close(resolve)))
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    page.setDefaultTimeout(4500)
    const address = `http://127.0.0.1:${server.address().port}`
    for (const [i, form] of wire.forms.entries()) {
      const source = wire.routes.find(route => route.path === form.source && !route.phase)
      assert.ok(source)
      await page.goto(address + '/portal/' + (i + 1))
      for (const [name, label, options] of form.query) {
        if (options) await page.getByLabel(label, { exact: true }).selectOption(String(source.params[name]))
        else await page.getByLabel(label, { exact: true }).fill(String(source.params[name]))
      }
      await page.getByRole('button', { name: '查询来源' }).click()
      assert.equal(await page.getByRole('row').count(), source.data.length + 1)
      for (const row of source.data) {
        assert.ok((await page.getByRole('table').innerText()).includes(String(row[form.columns[0]])))
      }
      if (!form.action) continue
      const action = wire.routes.find(route => route.path === form.action && !route.phase)
      const requestId = 'portal-' + i
      for (const [key, label] of form.fields) {
        const value = key === 'requestId' ? requestId : action.expectedBody[key] ?? source.params[key] ?? '演练记录'
        await page.getByLabel(label, { exact: true }).fill(String(value))
      }
      await page.getByRole('button', { name: '提交办理' }).click()
      assert.ok(await page.getByRole('status').textContent())
      const response = await page.request.get(address + '/receipts?requestId=' + requestId)
      assert.equal(response.status(), 200)
      assert.equal((await response.json()).requestId, requestId)
    }
  } finally {
    await browser.close()
  }
})
