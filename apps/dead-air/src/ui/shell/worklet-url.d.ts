/** Vite returns the bundled URL of a worker or worklet module for `?worker&url`. */
declare module "*?worker&url" {
  const url: string;
  export default url;
}
