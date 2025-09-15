declare module "pdfjs-dist/web/pdf_viewer" {
  export class TextLayerBuilder {
    constructor(options: any);
    div: HTMLDivElement;
    render(viewport: any): Promise<void>;
    cancel(): void;
  }
}
