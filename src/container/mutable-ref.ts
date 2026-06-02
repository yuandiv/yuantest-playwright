export class MutableRef<T> {
  constructor(public current: T) {}

  static of<T>(value: T): MutableRef<T> {
    return new MutableRef(value);
  }
}
