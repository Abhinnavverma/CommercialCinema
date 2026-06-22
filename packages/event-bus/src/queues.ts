import { Queue, Worker, type Processor } from "bullmq";
import { createBusConnection } from "./connection.js";
import type { EventName, EventPayloads } from "./events.js";
import type { QueueName } from "./queues.constants.js";

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

export function createNamedQueue<TPayload>(queueName: QueueName, redisUrl: string) {
  return new Queue<TPayload>(queueName, {
    connection: createBusConnection(redisUrl),
  });
}

export function createNamedWorker<TPayload>(
  queueName: QueueName,
  redisUrl: string,
  processor: Processor<TPayload>,
) {
  return new Worker<TPayload>(queueName, processor, {
    connection: createBusConnection(redisUrl),
  });
}

export type { Queue, Worker, Processor } from "bullmq";
