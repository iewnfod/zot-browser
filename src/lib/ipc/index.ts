export function JsonDataCallback(callback?: (data: any) => void) {
  return (data: string) => {
    if (data) {
      try {
        const d = JSON.parse(data);
        callback?.(d);
      } catch (e) {
        console.error("Failed to solve ipc callback data: ", e);
        callback?.(data);
      }
    } else {
      callback?.({});
    }
  }
}
