interface QueueEntry {
  url: string;
  depth: number;
}

export class CrawlQueue {
  private queue: QueueEntry[] = [];
  private seen = new Set<string>();

  enqueue(url: string, depth: number): void {
    if (this.seen.has(url)) return;
    this.seen.add(url);
    this.queue.push({ url, depth });
  }

  next(): QueueEntry | undefined {
    return this.queue.shift();
  }

  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  hasSeen(url: string): boolean {
    return this.seen.has(url);
  }
}
