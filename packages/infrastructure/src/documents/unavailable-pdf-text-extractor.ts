import { PdfTextExtractionError, type PdfTextExtractorPort } from '@deepstorming/application'

export class UnavailablePdfTextExtractor implements PdfTextExtractorPort {
  public async extract(): Promise<never> {
    throw new PdfTextExtractionError(
      'DOCUMENT_PDF_PARSE_FAILED',
      'PDF text extraction is not available in this build yet.',
      true,
    )
  }
}
