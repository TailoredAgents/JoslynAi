declare module "clamdjs" {
  type ClamdScanner = {
    scanFile: (path: string, timeout?: number, chunkSize?: number) => Promise<string>;
    scanBuffer: (buffer: Buffer, timeout?: number, chunkSize?: number) => Promise<string>;
    scanStream: (stream: NodeJS.ReadableStream, timeout?: number) => Promise<string>;
  };

  function createScanner(host: string, port?: number, timeout?: number): ClamdScanner;
  function ping(host: string, port?: number, timeout?: number): Promise<boolean>;

  export { createScanner, ping, type ClamdScanner };
}
