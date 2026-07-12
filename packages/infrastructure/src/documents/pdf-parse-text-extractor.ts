import { readFile } from 'node:fs/promises'
import { PdfTextExtractionError, type PdfTextExtractorPort } from '@deepstorming/application'
import type { PDFParse } from 'pdf-parse'

type ParseErrorLike = Readonly<{ name?: unknown; message?: unknown; code?: unknown }>
type PdfParseInstance = InstanceType<typeof PDFParse>

const isPasswordError = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) return false
  const candidate = error as ParseErrorLike
  return (
    candidate.name === 'PasswordException' ||
    candidate.code === 'PASSWORD_EXCEPTION' ||
    (typeof candidate.message === 'string' &&
      candidate.message.toLocaleLowerCase().includes('password'))
  )
}

class NoopDOMMatrix {
  public multiplySelf(): this {
    return this
  }

  public translateSelf(): this {
    return this
  }

  public scaleSelf(): this {
    return this
  }
}

class NoopImageData {
  public constructor(
    public readonly data: Uint8ClampedArray,
    public readonly width: number,
    public readonly height: number,
  ) {}
}

class NoopPath2D {}

const ensurePdfJsGeometryGlobals = (): void => {
  const globalScope = globalThis as typeof globalThis & {
    DOMMatrix?: unknown
    ImageData?: unknown
    Path2D?: unknown
  }
  globalScope.DOMMatrix ??= NoopDOMMatrix
  globalScope.ImageData ??= NoopImageData
  globalScope.Path2D ??= NoopPath2D
}

export class PdfParseTextExtractor implements PdfTextExtractorPort {
  public async extract(
    filePath: string,
  ): Promise<Awaited<ReturnType<PdfTextExtractorPort['extract']>>> {
    let parser: PdfParseInstance | undefined
    try {
      ensurePdfJsGeometryGlobals()
      const { PDFParse } = await import('pdf-parse')
      parser = new PDFParse({ data: await readFile(filePath) })
      const info = await parser.getInfo({ parsePageInfo: true })
      const text = await parser.getText({ pageJoiner: '' })
      return {
        pages: text.pages.map((page) => {
          const pageInfo = info.pages.find((item) => item.pageNumber === page.num)
          const pageText = page.text.trim()
          return {
            pageNumber: page.num,
            width: pageInfo?.width ?? 1,
            height: pageInfo?.height ?? 1,
            text: pageText,
            blocks: pageText.length > 0 ? [{ text: pageText }] : [],
          }
        }),
      }
    } catch (error) {
      if (isPasswordError(error)) {
        throw new PdfTextExtractionError(
          'DOCUMENT_PDF_PASSWORD_PROTECTED',
          'The PDF is password protected.',
          false,
        )
      }
      throw new PdfTextExtractionError(
        'DOCUMENT_PDF_PARSE_FAILED',
        'The PDF could not be parsed.',
        false,
      )
    } finally {
      await parser?.destroy()
    }
  }
}
