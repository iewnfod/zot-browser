import { isMac } from '@react-aria/utils';
import { Button, Card } from '@heroui/react';
import { LuMaximize, LuMinimize, LuMinus, LuX } from 'react-icons/lu';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { Api } from '@/lib/ipc/api.ts';

export default function WebViewContainer({
  children,
  hide = false,
  isLoading = false,
} : {
  children?: ReactNode;
  hide?: boolean;
  isLoading?: boolean;
}) {
  const [showWindowButtons, setShowWindowButtons] = useState<boolean>(false);
  const [isMaximized, setIsMaximized] = useState<boolean>(false);
  const [loadingState, setLoadingState] = useState<'idle' | 'loading' | 'complete'>('idle');

  const closeTimeoutRef = useRef<NodeJS.Timeout>(null);

  const handleMouseLeave = () => {
    closeTimeoutRef.current = setTimeout(() => {
      setShowWindowButtons(false);
    }, 300);
  };

  const handleMouseEnter = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      setShowWindowButtons(true);
    }
  };

  function getIsMaximized() {
    Api.isMaximized((m) => {
      setIsMaximized(m);
    });
  }

  useEffect(() => {
    window.addEventListener('resize', getIsMaximized);

    return () => {
      window.removeEventListener('resize', getIsMaximized);
    };
  }, []);

  useEffect(() => {
    if (isLoading) {
      setLoadingState('loading');
    } else {
      setLoadingState('complete');
      const timer = setTimeout(() => {
        setLoadingState('idle');
      }, 600);
      return () => clearTimeout(timer);
    }
    return () => {};
  }, [isLoading]);

  return (
    <div
      className={`flex flex-col w-full h-full items-center select-none grow ${hide ? 'hidden' : ''}`}
    >
      <style>
        {`
          @keyframes pulseWidth {
            0% {
              transform: scaleX(0.3);
            }
            50% {
              transform: scaleX(0.5);
            }
            100% {
              transform: scaleX(0.3);
            }
          }
        `}
      </style>

      <div
        className={`
          w-full ${showWindowButtons ? 'h-10' : 'h-2'} transition-all duration-300 ease-in-out
          flex flex-row justify-center items-center drag
        `}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div
          className={`
          w-full h-1 mt-0.5 mb-0.5 bg-neutral-500
          transform origin-center z-50
          transition-all duration-600 ease-in-out
          rounded-medium
          ${loadingState === 'loading' ? 'opacity-100 scale-x-100' : loadingState === 'complete' ? 'opacity-0 scale-x-100' : 'opacity-0 scale-x-0'}
        `}
          style={{
            animation: loadingState === 'loading' ? 'pulseWidth 5s ease-in-out infinite' : 'none'
          }}
        />

        {
          !isMac() && (
            <div
              className={`absolute right-0 top-0 flex flex-row transition-all duration-300 ease-in-out ${showWindowButtons ? 'opacity-100 h-10' : 'opacity-0 h-0'}`}
            >
              <Button isIconOnly variant="light" onPress={() => Api.minimize()}>
                <LuMinus size={20}/>
              </Button>
              {
                isMaximized ? (
                  <Button isIconOnly variant="light" onPress={() => Api.unmaximize(() => getIsMaximized())}>
                    <LuMinimize size={20}/>
                  </Button>
                ) : (
                  <Button isIconOnly variant="light" onPress={() => Api.maximize(() => getIsMaximized())}>
                    <LuMaximize size={20}/>
                  </Button>
                )
              }
              <Button isIconOnly variant="light" color="danger" onPress={() => Api.close()}>
                <LuX size={20}/>
              </Button>
            </div>
          )
        }
      </div>

      <div className="w-full h-full grow p-2 pl-0 pt-0">
        <Card className="w-full h-full overflow-hidden">
          {children}
        </Card>
      </div>
    </div>
  );
}
