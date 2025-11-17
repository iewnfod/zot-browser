import { useRef, useState } from 'react';
import { Button } from '@heroui/button';
import { Input } from '@heroui/input';
import WebView, { WebViewMethods } from '@renderer/components/WebView'

function App() {
  const [url, setUrl] = useState("https://google.com/");
  const webviewRef = useRef<WebViewMethods>(null);

  function handleGo(u?: string) {
    if (webviewRef.current) {
      webviewRef.current.loadURL(u || url);
    }
  }

  function handleLoadCommit(u: string, isMainFrame: boolean) {
    if (isMainFrame) {
      setUrl(u);
    }
  }

  return (
    <div className="flex flex-col w-[100vw] h-[100vh]">
      <div className="flex flex-row">
        <Button onPress={() => handleGo("https://google.com/")} variant="flat">
          Home
        </Button>
        <Input
          value={url}
          onValueChange={setUrl}
        />
        <Button onPress={() => handleGo()} variant="flat">
          Go
        </Button>
      </div>
      <WebView
        src="https://google.com/"
        className="w-full h-full grow"
        onLoadCommit={handleLoadCommit}
        ref={webviewRef}
      />
    </div>
  );
}

export default App;
