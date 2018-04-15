declare module "local-storage" {
  function remove(key: string): any;
  function get(key: string): any;
  function set(key: string, value: any): void;
  function clear(): void;
}
