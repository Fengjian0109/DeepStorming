import { readFile } from 'node:fs/promises'

import type {
  CancellationToken,
  ExtractedDocumentFigureAsset,
  PdfFigureExtractorPort,
} from '@deepstorming/application'
import { findFigureCaptions } from '@deepstorming/domain'
import type { PDFParse } from 'pdf-parse'

type PdfParseInstance = InstanceType<typeof PDFParse>

const cancelledError = (): Error => new Error('PDF figure extraction was cancelled.')

export class PdfFigureExtractor implements PdfFigureExtractorPort {
  public async extract(
    input: Readonly<{
      filePath: string
      pages: readonly Readonly<{ pageNumber: number; text: string }>[]
    }>,
    token: CancellationToken,
  ): Promise<readonly ExtractedDocumentFigureAsset[]> {
    let cancelled = token.cancelled
    const unsubscribe = token.onCancel(() => {
      cancelled = true
    })
    const assertActive = () => {
      if (cancelled || token.cancelled) throw cancelledError()
    }
    let parser: PdfParseInstance | undefined
    try {
      assertActive()
      const captionPages = input.pages
        .map((page) => ({ ...page, captions: findFigureCaptions(page.text) }))
        .filter((page) => page.captions.length > 0)
      if (captionPages.length === 0) return []

      const { PDFParse } = await import('pdf-parse')
      parser = new PDFParse({ data: await readFile(input.filePath) })
      const result: ExtractedDocumentFigureAsset[] = []
      for (const page of captionPages) {
        assertActive()
        const embedded = await parser.getImage({
          partial: [page.pageNumber],
          imageThreshold: 0,
          imageBuffer: true,
          imageDataUrl: false,
        })
        assertActive()
        const images = embedded.pages[0]?.images ?? []
        let screenshot: Readonly<{ data: Uint8Array; width: number; height: number }> | undefined
        for (const [index, caption] of page.captions.entries()) {
          const image = images[index]
          if (image !== undefined && image.data.byteLength > 0) {
            result.push({
              pageNumber: page.pageNumber,
              ...caption,
              assetKind: 'embedded_image',
              width: image.width,
              height: image.height,
              data: image.data,
            })
            continue
          }
          screenshot ??= (
            await parser.getScreenshot({
              partial: [page.pageNumber],
              desiredWidth: 1_200,
              imageBuffer: true,
              imageDataUrl: false,
            })
          ).pages[0]
          assertActive()
          if (screenshot === undefined || screenshot.data.byteLength === 0) {
            throw new Error('PDF page render did not produce an image.')
          }
          result.push({
            pageNumber: page.pageNumber,
            ...caption,
            assetKind: 'page_render',
            width: screenshot.width,
            height: screenshot.height,
            data: screenshot.data,
          })
        }
      }
      return result
    } finally {
      unsubscribe()
      await parser?.destroy()
    }
  }
}
