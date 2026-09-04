/**
 * gifenc ships no type declarations. Only the three functions this project
 * uses are declared, with the shapes the encoder actually accepts.
 */
declare module "gifenc" {
  export type Palette = number[][];

  export interface WriteFrameOptions {
    palette?: Palette;
    /** Frame duration in milliseconds. */
    delay?: number;
    transparent?: boolean;
    transparentIndex?: number;
    repeat?: number;
  }

  export interface Encoder {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      options?: WriteFrameOptions,
    ): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
    reset(): void;
  }

  export function GIFEncoder(options?: { auto?: boolean; initialCapacity?: number }): Encoder;

  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: { format?: "rgb565" | "rgb444" | "rgba4444"; oneBitAlpha?: boolean },
  ): Palette;

  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: Palette,
    format?: "rgb565" | "rgb444" | "rgba4444",
  ): Uint8Array;
}
