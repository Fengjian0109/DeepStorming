import { writeFile } from 'node:fs/promises'
import type {
  CancellationToken,
  LessonExportDestinationPort,
  LessonExportFormat,
} from '@deepstorming/application'
import type { HtmlToPdfPort } from '@deepstorming/infrastructure'
import { BrowserWindow, dialog } from 'electron'

export class ElectronLessonExportDestination implements LessonExportDestinationPort {
  async choose(
    input: Readonly<{ format: LessonExportFormat; suggestedName: string }>,
  ): Promise<string | undefined> {
    const options = {
      title: input.format === 'markdown' ? '导出 Markdown 课堂记录' : '导出 PDF 课堂记录',
      defaultPath: input.suggestedName,
      filters:
        input.format === 'markdown'
          ? [{ name: 'Markdown', extensions: ['md'] }]
          : [{ name: 'PDF', extensions: ['pdf'] }],
    }
    const parent = BrowserWindow.getFocusedWindow()
    const result =
      parent === null
        ? await dialog.showSaveDialog(options)
        : await dialog.showSaveDialog(parent, options)
    return result.canceled ? undefined : result.filePath
  }
}

export class ElectronHtmlToPdf implements HtmlToPdfPort {
  async render(html: string, targetPath: string, token: CancellationToken): Promise<void> {
    if (token.cancelled) throw new Error('cancelled')
    const window = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    })
    const unsubscribe = token.onCancel(() => window.destroy())
    try {
      await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
      if (token.cancelled) throw new Error('cancelled')
      const bytes = await window.webContents.printToPDF({ printBackground: true, pageSize: 'A4' })
      if (token.cancelled) throw new Error('cancelled')
      await writeFile(targetPath, bytes)
    } finally {
      unsubscribe()
      if (!window.isDestroyed()) window.destroy()
    }
  }
}
