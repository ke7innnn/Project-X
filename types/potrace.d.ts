declare module 'potrace' {
  export interface TraceOptions {
    threshold?: number;
    turdSize?: number;
    optTolerance?: number;
    alphaMax?: number;
    curveTolerance?: number;
    background?: string;
    color?: string;
  }

  export function trace(
    image: Buffer | string,
    options: TraceOptions,
    callback: (err: Error | null, svg: string) => void
  ): void;

  export function trace(
    image: Buffer | string,
    callback: (err: Error | null, svg: string) => void
  ): void;
}
