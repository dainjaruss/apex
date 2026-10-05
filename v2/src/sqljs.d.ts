declare module "sql.js" {
  interface InitConfig {
    wasmBinary?: ArrayBuffer;
  }
  export default function initSqlJs(config?: InitConfig): Promise<unknown>;
}
