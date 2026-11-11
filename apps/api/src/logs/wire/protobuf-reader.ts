export class WirePayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WirePayloadError";
  }
}

export const wireTypes = { varint: 0, fixed64: 1, lengthDelimited: 2, fixed32: 5 } as const;

const textDecoder = new TextDecoder("utf-8");

export class ProtobufReader {
  private position: number;

  constructor(
    private readonly buffer: Uint8Array,
    start = 0,
    private readonly end = buffer.length
  ) {
    this.position = start;
  }

  get done(): boolean {
    return this.position >= this.end;
  }

  tag(): { field: number; wireType: number } {
    const value = Number(this.varint());
    const field = Math.floor(value / 8);
    if (field < 1) throw new WirePayloadError("Invalid protobuf field");
    return { field, wireType: value & 7 };
  }

  varint(): bigint {
    let result = 0n;
    let shift = 0n;
    for (let index = 0; index < 10; index += 1) {
      const byte = this.byte();
      result |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return BigInt.asUintN(64, result);
      shift += 7n;
    }
    throw new WirePayloadError("Invalid protobuf varint");
  }

  int64(): bigint {
    return BigInt.asIntN(64, this.varint());
  }

  uint32(): number {
    return Number(BigInt.asUintN(32, this.varint()));
  }

  bool(): boolean {
    return this.varint() !== 0n;
  }

  fixed64(): bigint {
    const view = this.view(8);
    return view.getBigUint64(0, true);
  }

  fixed32(): number {
    return this.view(4).getUint32(0, true);
  }

  double(): number {
    return this.view(8).getFloat64(0, true);
  }

  bytes(): Uint8Array {
    const length = Number(this.varint());
    const start = this.position;
    if (length < 0 || start + length > this.end) {
      throw new WirePayloadError("Truncated protobuf payload");
    }
    this.position += length;
    return this.buffer.subarray(start, start + length);
  }

  string(): string {
    return textDecoder.decode(this.bytes());
  }

  message(): ProtobufReader {
    const length = Number(this.varint());
    const start = this.position;
    if (length < 0 || start + length > this.end) {
      throw new WirePayloadError("Truncated protobuf payload");
    }
    this.position += length;
    return new ProtobufReader(this.buffer, start, start + length);
  }

  skip(wireType: number): void {
    if (wireType === wireTypes.varint) this.varint();
    else if (wireType === wireTypes.fixed64) this.advance(8);
    else if (wireType === wireTypes.lengthDelimited) this.bytes();
    else if (wireType === wireTypes.fixed32) this.advance(4);
    else throw new WirePayloadError("Unsupported protobuf wire type");
  }

  private byte(): number {
    if (this.position >= this.end) throw new WirePayloadError("Truncated protobuf payload");
    const byte = this.buffer[this.position]!;
    this.position += 1;
    return byte;
  }

  private view(length: number): DataView {
    const start = this.position;
    this.advance(length);
    return new DataView(this.buffer.buffer, this.buffer.byteOffset + start, length);
  }

  private advance(length: number): void {
    if (this.position + length > this.end) throw new WirePayloadError("Truncated protobuf payload");
    this.position += length;
  }
}
