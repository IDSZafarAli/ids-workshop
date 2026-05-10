export class RingBuffer<T> {
  private readonly _buf: T[] = [];

  constructor(private readonly _max: number) {}

  public push(item: T): void {
    this._buf.push(item);
    if (this._buf.length > this._max) {
      this._buf.shift();
    }
  }

  public getAll(): T[] {
    return [...this._buf];
  }

  public clear(): void {
    this._buf.length = 0;
  }

  public getLast(n: number): T[] {
    return this._buf.slice(-n);
  }

  public get length(): number {
    return this._buf.length;
  }
}
