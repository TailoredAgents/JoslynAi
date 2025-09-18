declare module "@joslyn-ai/core/rag/retriever" {
  export const retrieveForAsk: any;
}

declare module "@joslyn-ai/core/smart_attachments/map" {
  export const SMART_ATTACHMENT_MAP: any;
}

declare module "fastify-raw-body" {
  import { FastifyPluginCallback } from "fastify";

  type RawBodyOptions = {
    field?: string;
    global?: boolean;
    encoding?: string;
    runFirst?: boolean;
  };

  const fastifyRawBody: FastifyPluginCallback<RawBodyOptions>;
  export default fastifyRawBody;
}
