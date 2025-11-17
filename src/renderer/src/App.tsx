import { useEffect, useRef, useState } from 'react';
import { Button } from '@heroui/button';
import { Input } from '@heroui/input';

function App() {
  const [url, setUrl] = useState("https://google.com/");
  const webviewRef = useRef<HTMLWebViewElement>(null);

  function handleGo(u?: string) {
    if (webviewRef.current) {
      // @ts-ignore
      webviewRef.current.loadURL(u || url);
    }
  }

  useEffect(() => {
    if (webviewRef.current) {
      const onLoadCommit = (evt) => {
        if (evt.isMainFrame) {
          setUrl(evt.url);
        }
      };

      webviewRef.current.addEventListener('load-commit', onLoadCommit);

      return () => {
        if (webviewRef.current) {
          webviewRef.current.removeEventListener('load-commit', onLoadCommit);
        }
      }
    }

    return () => {};
  }, [])

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
      <webview
        src="https://google.com/"
        className="w-full grow h-full"
        ref={webviewRef}
      />
    </div>
  );
}

export default App;
