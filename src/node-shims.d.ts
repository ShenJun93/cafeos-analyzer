declare module "node:zlib" {
  export function inflateRawSync(data: Uint8Array): Uint8Array;
}
declare module "node:crypto" {
  interface HashLike { update(data: string | Uint8Array): HashLike; digest(encoding: "hex"): string; }
  export function createHash(algorithm: string): HashLike;
  export function createHmac(algorithm: string, key: string | Uint8Array): HashLike;
}
