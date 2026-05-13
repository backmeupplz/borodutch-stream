export interface Event {
  id: string
  timestamp: string
  text: string
  source?: string
  project?: string
}

export class RingBuffer {
  private buffer: Event[]
  private index = 0
  private count = 0

  constructor(private maxSize: number) {
    this.buffer = new Array(maxSize)
  }

  push(event: Event) {
    this.buffer[this.index] = event
    this.index = (this.index + 1) % this.maxSize
    if (this.count < this.maxSize) {
      this.count++
    }
  }

  getAll(): Event[] {
    if (this.count === 0) return []
    const events: Event[] = []
    if (this.count < this.maxSize) {
      for (let i = 0; i < this.count; i++) {
        events.push(this.buffer[i])
      }
    } else {
      for (let i = 0; i < this.count; i++) {
        const idx = (this.index + i) % this.maxSize
        events.push(this.buffer[idx])
      }
    }
    return events
  }

  size(): number {
    return this.count
  }
}
