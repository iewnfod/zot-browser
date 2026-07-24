import { isMac } from '@react-aria/utils';
import { Button, Card } from '@heroui/react';
import { LuMaximize, LuMinimize, LuMinus, LuX } from 'react-icons/lu';
import { ReactNode, RefObject, useEffect, useRef, useState } from 'react';

export default function WebViewContainer({
  children,
  hide = false,
  isLoading = false,
  pageAreaRef,
  naturalScroll = false
} : {
  children?: ReactNode;
  hide?: boolean;
  isLoading?: boolean;
  pageAreaRef?: RefObject<HTMLDivElement | null>;
  naturalScroll?: boolean;
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

  // 滚轮事件转发：在 pageAreaRef 上捕获 wheel 事件，阻止 UI 处理，转发到主进程 → 网页 view
  useEffect(() => {
    const el = pageAreaRef?.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      window.api.forwardWheel({
        deltaX: naturalScroll ? -e.deltaX : e.deltaX,
        deltaY: naturalScroll ? -e.deltaY : e.deltaY,
        deltaMode: e.deltaMode,
        x: e.clientX,
        y: e.clientY
      });
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [pageAreaRef, naturalScroll]);

  return (
    <div
      className={`flex flex-col w-full h-full items-center select-none grow bg-transparent ${hide ? 'hidden' : ''}`}
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
          flex flex-row justify-center items-center bg-(--bg-color)
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
              className={`absolute right-0 top-0 flex flex-row transition-all duration-300 ease-in-out ${showWindowButtons ? 'opacity-100 h-8' : 'opacity-0 h-0'}`}
            >
              <Button size="sm" isIconOnly variant="light" onPress={window.api.minimize}>
                <LuMinus size={18}/>
              </Button>
              {
                isMaximized ? (
                  <Button size="sm" isIconOnly variant="light" onPress={() => window.api.unmaximize().then(() => getIsMaximized())}>
                    <LuMinimize size={18}/>
                  </Button>
                ) : (
                  <Button size="sm" isIconOnly variant="light" onPress={() => window.api.maximize().then(() => getIsMaximized())}>
                    <LuMaximize size={18}/>
                  </Button>
                )
              }
              <Button size="sm" isIconOnly variant="light" color="danger" onPress={window.api.close}>
                <LuX size={18}/>
              </Button>
            </div>
          )
        }
      </div>

      <div className="w-full h-full grow flex flex-row pl-0 pt-0 bg-transparent">
        <div className="w-full h-full grow flex flex-col">
          {/* 整个内容区域透明，让下层网页 view 显示出来 */}
          <div ref={pageAreaRef} className="w-full h-full bg-transparent">
            <Card className="w-full h-full overflow-hidden bg-transparent">
              {children}
            </Card>
          </div>
          {/* 底部占位背景 */}
          <div className="bg-(--bg-color) h-2 w-full"/>
        </div>
        {/* 右侧占位背景 */}
        <div className="bg-(--bg-color) w-2 h-full"/>
      </div>
    </div>
  );
}
