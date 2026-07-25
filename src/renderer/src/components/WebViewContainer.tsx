import { isMac } from '@react-aria/utils';
import { Button, Card } from '@heroui/react';
import { LuMaximize, LuMinimize, LuMinus, LuX } from 'react-icons/lu';
import { ReactNode, RefObject, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Electron cursor-changed 的 type 字符串 → CSS cursor 值。
 * 未知/自定义图片光标 → default。
 */
function electronCursorToCSS(type: string): string {
  switch (type) {
    case 'pointer': return 'pointer';
    case 'text': return 'text';
    case 'crosshair': return 'crosshair';
    case 'hand': return 'pointer';
    case 'wait': return 'wait';
    case 'progress': return 'progress';
    case 'help': return 'help';
    case 'move': return 'move';
    case 'ew-resize': case 'col-resize': return 'ew-resize';
    case 'ns-resize': case 'row-resize': return 'ns-resize';
    case 'nesw-resize': return 'nesw-resize';
    case 'nwse-resize': return 'nwse-resize';
    case 'not-allowed': return 'not-allowed';
    case 'zoom-in': return 'zoom-in';
    case 'zoom-out': return 'zoom-out';
    case 'grab': return 'grab';
    case 'grabbing': return 'grabbing';
    default: return 'default';
  }
}

export default function WebViewContainer({
  children,
  hide = false,
  isLoading = false,
  pageAreaRef,
  naturalScroll = false,
  cursorType = 'default',
  hoverURL = ''
} : {
  children?: ReactNode;
  hide?: boolean;
  isLoading?: boolean;
  pageAreaRef?: RefObject<HTMLDivElement | null>;
  naturalScroll?: boolean;
  /** 网页当前光标类型（来自 cursor-changed 事件） */
  cursorType?: string;
  /** 悬停链接目标 URL，空串表示未悬停 */
  hoverURL?: string;
}) {
  const [showWindowButtons, setShowWindowButtons] = useState<boolean>(false);
  const [isMaximized, setIsMaximized] = useState<boolean>(false);
  const [loadingState, setLoadingState] = useState<'idle' | 'loading' | 'complete'>('idle');

  // 网页光标类型 → CSS。非网页区域（如 loading 默认）用 default。
  const cursorCSS = useMemo(() => electronCursorToCSS(cursorType), [cursorType]);

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
          relative z-50 w-full ${showWindowButtons ? 'h-10' : 'h-2'} transition-all duration-300 ease-in-out
          flex flex-row justify-center items-center
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

      {/* 内容区域：左/右/下各留 8px(=画框边宽)，顶部贴顶栏(画框顶边=顶栏高度)。
          整块透明，让下层网页 view 显示出来；cursor 样式按网页光标类型同步。 */}
      <div className="w-full h-full grow flex flex-row pr-2 pb-2 pt-0 bg-transparent">
        <div
          ref={pageAreaRef}
          className="relative w-full h-full bg-transparent"
          style={{ cursor: cursorCSS }}
        >
          <Card className="w-full h-full overflow-hidden bg-transparent">
            {children}
          </Card>
          {/* 悬停链接状态条（左下角，类似浏览器状态栏） */}
          {hoverURL && (
            <div
              className="absolute bottom-1 left-1 max-w-[60%] z-50 pointer-events-none select-none"
            >
              <div className="px-2 py-0.5 rounded-small bg-black/75 text-white text-xs truncate">
                {hoverURL}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
