import { WirePayloadError } from "./protobuf-reader.js";

const maximumDecompressedBytes = 64 * 1024 * 1024;

export function decompressSnappy(input: Uint8Array): Uint8Array {
  let position = 0;
  let length = 0;
  for (let shift = 0; ; shift += 7) {
    if (position >= input.length || shift > 28) throw invalid();
    const byte = input[position]!;
    position += 1;
    length += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) break;
  }
  if (length > maximumDecompressedBytes) {
    throw new WirePayloadError("The decompressed payload is too large");
  }
  const output = new Uint8Array(length);
  let written = 0;

  while (position < input.length) {
    const tag = input[position]!;
    position += 1;
    const kind = tag & 3;
    if (kind === 0) {
      let literalLength = tag >>> 2;
      if (literalLength >= 60) {
        const sizeBytes = literalLength - 59;
        if (position + sizeBytes > input.length) throw invalid();
        literalLength = 0;
        for (let index = 0; index < sizeBytes; index += 1) {
          literalLength += input[position + index]! * 2 ** (8 * index);
        }
        position += sizeBytes;
      }
      literalLength += 1;
      if (position + literalLength > input.length || written + literalLength > length) {
        throw invalid();
      }
      output.set(input.subarray(position, position + literalLength), written);
      position += literalLength;
      written += literalLength;
      continue;
    }
    let copyLength: number;
    let offset: number;
    if (kind === 1) {
      if (position >= input.length) throw invalid();
      copyLength = ((tag >>> 2) & 7) + 4;
      offset = ((tag >>> 5) << 8) | input[position]!;
      position += 1;
    } else if (kind === 2) {
      if (position + 2 > input.length) throw invalid();
      copyLength = (tag >>> 2) + 1;
      offset = input[position]! | (input[position + 1]! << 8);
      position += 2;
    } else {
      if (position + 4 > input.length) throw invalid();
      copyLength = (tag >>> 2) + 1;
      offset =
        input[position]! +
        input[position + 1]! * 2 ** 8 +
        input[position + 2]! * 2 ** 16 +
        input[position + 3]! * 2 ** 24;
      position += 4;
    }
    if (offset === 0 || offset > written || written + copyLength > length) throw invalid();
    for (let index = 0; index < copyLength; index += 1) {
      output[written] = output[written - offset]!;
      written += 1;
    }
  }
  if (written !== length) throw invalid();
  return output;
}

function invalid(): WirePayloadError {
  return new WirePayloadError("The snappy payload is invalid");
}
