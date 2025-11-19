import { isMac } from '@react-aria/utils';
import { Button, Card } from '@heroui/react';
import { LuMaximize, LuMinimize, LuMinus, LuX } from 'react-icons/lu';
import { ReactNode, useEffect, useState } from 'react';

export default function WebViewContainer({
  children,
  hide = false
} : {
  children?: ReactNode;
  hide?: boolean;
}) {
  const [showWindowButtons, setShowWindowButtons] = useState<boolean>(false);
  const [isMaximized, setIsMaximized] = useState<boolean>(false);

  function getIsMaximized() {
    window.api.isMaximized().then((m) => {
      setIsMaximized(m);
    });
  }

  useEffect(() => {
    window.addEventListener('resize', getIsMaximized);

    return () => {
      window.removeEventListener('resize', getIsMaximized);
    };
  }, []);

  return (
    <div
      className={`flex flex-col w-full h-full select-none grow ${hide ? 'hidden' : ''}`}
    >
      {
        isMac() ? (
          <div className="w-full h-2"/>
        ) : (
          <div
            className={`
              w-full h-2 hover:h-10 transition-all duration-300 ease-in-out
              flex flex-row justify-end items-center
            `}
            onMouseEnter={() => setShowWindowButtons(true)}
            onMouseLeave={() => setShowWindowButtons(false)}
          >
            <div
              className={`flex flex-row h-full ${showWindowButtons ? '' : 'hidden'}`}
            >
              <Button isIconOnly variant="light" onPress={window.api.minimize}>
                <LuMinus size={20}/>
              </Button>
              {
                isMaximized ? (
                  <Button isIconOnly variant="light" onPress={() => window.api.unmaximize().then(() => getIsMaximized())}>
                    <LuMinimize size={20}/>
                  </Button>
                ) : (
                  <Button isIconOnly variant="light" onPress={() => window.api.maximize().then(() => getIsMaximized())}>
                    <LuMaximize size={20}/>
                  </Button>
                )
              }
              <Button isIconOnly variant="light" color="danger" onPress={window.api.close}>
                <LuX size={20}/>
              </Button>
            </div>
          </div>
        )
      }

      <div className="w-full h-full grow p-2 pl-0 pt-0">
        <Card
          className={"w-full h-full overflow-hidden"}
        >
          {children}
        </Card>
      </div>
    </div>
  );
}
