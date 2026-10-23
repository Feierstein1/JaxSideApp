// Image files bundled by Metro resolve to an asset id (the same as `expo/types`).
declare module '*.png' {
  const asset: number;
  export default asset;
}
