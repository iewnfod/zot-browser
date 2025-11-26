type IpcAcceptArgType = string | number | boolean;

declare const ipc: {
  emit: (event: string, args?: IpcAcceptArgType[], callback?: (data: any) => void) => void;
}
