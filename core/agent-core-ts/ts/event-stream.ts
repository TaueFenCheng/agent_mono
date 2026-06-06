import { type AgentRunEvent, AsyncEventQueue } from "./events.js";

function normalizeError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(typeof error === "string" ? error : String(error));
}

export class EventStream<TEvent, TResult> implements AsyncIterable<TEvent> {
  private readonly queue = new AsyncEventQueue<TEvent>();
  private readonly finalResultPromise: Promise<TResult>;
  private settled = false;
  private resolveFinalResult!: (result: TResult) => void;
  private rejectFinalResult!: (error: Error) => void;

  constructor() {
    this.finalResultPromise = new Promise<TResult>((resolve, reject) => {
      this.resolveFinalResult = resolve;
      this.rejectFinalResult = reject;
    });
  }

  push(event: TEvent): void {
    if (this.settled) return;
    this.queue.push(event);
  }

  complete(result: TResult, terminalEvent?: TEvent): void {
    if (this.settled) return;
    if (typeof terminalEvent !== "undefined") {
      this.queue.push(terminalEvent);
    }
    this.settled = true;
    this.resolveFinalResult(result);
    this.queue.end();
  }

  fail(error: unknown, terminalEvent?: TEvent): void {
    if (this.settled) return;
    if (typeof terminalEvent !== "undefined") {
      this.queue.push(terminalEvent);
    }
    this.settled = true;
    this.rejectFinalResult(normalizeError(error));
    this.queue.end();
  }

  result(): Promise<TResult> {
    return this.finalResultPromise;
  }

  next(): Promise<IteratorResult<TEvent>> {
    return this.queue.next();
  }

  [Symbol.asyncIterator](): AsyncIterator<TEvent> {
    return {
      next: () => this.next()
    };
  }
}

export type AgentEventStream<TResult> = EventStream<AgentRunEvent, TResult>;

export function createAgentEventStream<TResult>(): AgentEventStream<TResult> {
  return new EventStream<AgentRunEvent, TResult>();
}
