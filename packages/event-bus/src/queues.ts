import { Queue, Worker, type Processor } from "bullmq";
import { createBusConnection } from "./connection.js";
import type { EventName, EventPayloads } from "./events.js";

export function createQueue<TName extends EventName>(name: TName, redisUrl: string) {
  return new Queue<EventPayloads[TName]>(name, {
    connection: createBusConnection(redisUrl),
  });
}

export function createWorker<TName extends EventName>(
  name: TName,
  redisUrl: string,
  processor: Processor<EventPayloads[TName]>,
) {
  return new Worker<EventPayloads[TName]>(name, processor, {
    connection: createBusConnection(redisUrl),
  });
}

export type { Queue, Worker, Processor } from "bullmq";
