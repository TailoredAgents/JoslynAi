declare module "file-type/node" {
  import type { FileTypeResult } from "file-type";

  export function fileTypeFromFile(path: string): Promise<FileTypeResult | undefined>;
  export * from "file-type";
}
