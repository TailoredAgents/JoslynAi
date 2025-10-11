declare module "clamdjs" {
  function createScanner(host: string, port?: number, timeout?: number): {
    scanFile: (path: string) => Promise<string>;
  };

  export { createScanner };
}
