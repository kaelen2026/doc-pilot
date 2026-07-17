import { QUEUE_NAMES } from "@doc-pilot/contracts";
import { type ConnectionOptions, Queue } from "bullmq";

export function getDocumentProcessingQueue(connection: ConnectionOptions): Queue {
  return new Queue(QUEUE_NAMES.documentProcessing, { connection });
}
