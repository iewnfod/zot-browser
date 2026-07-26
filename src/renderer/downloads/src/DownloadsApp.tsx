import { Button, Card, CardBody, Progress, Tooltip } from '@heroui/react';
import { useEffect, useState } from 'react';
import {
  LuFolderOpen,
  LuLoaderCircle,
  LuPause,
  LuPlay,
  LuRotateCw,
  LuTrash2,
  LuX,
} from 'react-icons/lu';
import { getDefaultSettings, getUISizePrefs, resolveUISize, Settings } from '@renderer/lib/settings';
import { DEFAULT_LOCALE, Locale, resolveLocale } from '@renderer/lib/i18n';
import { useT } from '@renderer/lib/useT';

/**
 * zot://downloads 下载管理页。
 *
 * 与主 UI 共享 settings（store 'settings' key），与主进程通过 window.api 的
 * download-* IPC + window.electron.ipcRenderer 的事件通信：
 * - 挂载时拉取进行中快照（downloadGetActive）+ 持久化历史（store 'downloads'）
 * - 订阅 download-progress / download-done 事件实时更新
 * - 控制命令经 window.api.downloadPause/Resume/Cancel 等发往主进程
 *
 * 本页面加载在带 preload 的 WebContentsView 里（contextIsolation 开启），
 * 所以 window.store / window.api / window.electron 均可用。
 */

/** 进行中下载的 UI 形态（与 preload/index.d.ts 的 DownloadProgressPayload 对齐）。 */
interface ActiveItem {
  id: string;
  filename: string;
  url: string;
  received: number;
  total: number;
  state: 'progressing' | 'paused' | 'interrupted';
  speed: number;
}

/** 持久化历史条目（与 src/main/download.ts 的 DownloadHistoryItem 对齐）。 */
interface HistoryItem {
  id: string;
  filename: string;
  url: string;
  savePath: string;
  total: number;
  mimeType: string;
  completedAt: number;
}

/** 已完成的瞬时状态（由 download-done 事件驱动，用于在历史落库前即时展示）。 */
interface DoneFlash {
  id: string;
  filename: string;
  state: 'completed' | 'cancelled' | 'interrupted';
}

/** 把字节数格式化为人类可读字符串。 */
function formatBytes(n: number): string {
  if (!n || n < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/** 把速度（bytes/sec）格式化为人类可读字符串（如 1.2 MB/s）。0 返回空串。 */
function formatSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return '';
  return `${formatBytes(bytesPerSec)}/s`;
}

/** 格式化时间戳为本地短日期。 */
function formatTime(ts: number): string {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return '';
  }
}

export default function DownloadsApp() {
  const [settings, setSettings] = useState<Settings>(getDefaultSettings());
  const [systemLocale, setSystemLocale] = useState<Locale>(DEFAULT_LOCALE);
  const [active, setActive] = useState<ActiveItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [flashes, setFlashes] = useState<Record<string, DoneFlash>>({});
  /** 仍存在的文件路径集合（savePath）。文件被删除时对应历史项隐藏「打开/在文件夹中显示」。 */
  const [existingPaths, setExistingPaths] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  // —— 初始加载：settings + 系统语言 + 进行中快照 + 历史 ——
  useEffect(() => {
    window.api.getSystemLocale().then((sys) => setSystemLocale(sys));
    window.store.get('settings').then((data) => {
      if (data) setSettings(data);
    });
    window.api.downloadGetActive().then((snapshot) => {
      setActive(snapshot ?? []);
    });
    window.store.get('downloads').then((data) => {
      const items = Array.isArray(data) ? (data as HistoryItem[]) : [];
      setHistory(items);
      setLoaded(true);
      // 批量检查历史项的文件是否仍存在
      if (items.length > 0) {
        window.api.downloadCheckFiles(items.map((it) => it.savePath)).then((existing) => {
          setExistingPaths(new Set(existing));
        });
      }
    });
  }, []);

  // —— 实时感知 settings 变更（主 UI 或别处改了 settings）——
  useEffect(() => {
    const handler = (_e: unknown, next: Settings): void => setSettings(next);
    window.electron.ipcRenderer.on('settings-changed', handler);
    return () => {
      window.electron.ipcRenderer.removeAllListeners('settings-changed');
    };
  }, []);

  // —— 订阅下载事件 ——
  useEffect(() => {
    const onProgress = (_e: unknown, p: ActiveItem): void => {
      setActive((prev) => {
        const idx = prev.findIndex((it) => it.id === p.id);
        if (idx === -1) return [...prev, p];
        const next = prev.slice();
        next[idx] = { ...next[idx], ...p };
        return next;
      });
    };

    const onDone = (
      _e: unknown,
      d: { id: string; filename: string; url: string; savePath: string; state: string; total: number; mimeType: string }
    ): void => {
      // 从进行中移除
      setActive((prev) => prev.filter((it) => it.id !== d.id));
      // completed 入历史前缀（与主进程一致：未完成的入历史）
      if (d.state === 'completed') {
        setHistory((prev) => {
          const entry: HistoryItem = {
            id: d.id,
            filename: d.filename,
            url: d.url,
            savePath: d.savePath,
            total: d.total,
            mimeType: d.mimeType,
            completedAt: Date.now(),
          };
          return [entry, ...prev].slice(0, 200);
        });
        // 刚下载完成，文件必然存在
        setExistingPaths((prev) => new Set(prev).add(d.savePath));
      }
      // 闪一条完成提示（5 秒后自动消失）
      const flash: DoneFlash = { id: d.id, filename: d.filename, state: d.state as DoneFlash['state'] };
      setFlashes((prev) => ({ ...prev, [d.id]: flash }));
      window.setTimeout(() => {
        setFlashes((prev) => {
          const next = { ...prev };
          delete next[d.id];
          return next;
        });
      }, 5000);
    };

    // 历史被删除/清空（可能来自主 UI 的 SideBar）时，从主进程重新拉取保持同步
    const onHistoryChanged = (): void => {
      window.store.get('downloads').then((data) => {
        const items = Array.isArray(data) ? (data as HistoryItem[]) : [];
        setHistory(items);
        if (items.length > 0) {
          window.api.downloadCheckFiles(items.map((it) => it.savePath)).then((existing) => {
            setExistingPaths(new Set(existing));
          });
        } else {
          setExistingPaths(new Set());
        }
      });
    };

    window.electron.ipcRenderer.on('download-progress', onProgress);
    window.electron.ipcRenderer.on('download-done', onDone);
    window.electron.ipcRenderer.on('downloads-history-changed', onHistoryChanged);
    return () => {
      window.electron.ipcRenderer.removeAllListeners('download-progress');
      window.electron.ipcRenderer.removeAllListeners('download-done');
      window.electron.ipcRenderer.removeAllListeners('downloads-history-changed');
    };
  }, []);

  // 定期检测文件存在性（30s），让历史项在文件被外部删除/恢复后自动更新按钮显隐。
  // 仅刷新 existingPaths；页面隐藏（切到其它标签）时跳过本次检查以省 IPC。
  useEffect(() => {
    if (history.length === 0) return;
    const paths = history.map((it) => it.savePath).filter(Boolean);
    if (paths.length === 0) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      window.api.downloadCheckFiles(paths).then((existing) => {
        setExistingPaths(new Set(existing));
      });
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [history]);

  const locale = resolveLocale(settings.locale, systemLocale);
  const t = useT(locale);
  const uiSize = resolveUISize(settings);
  const prefs = getUISizePrefs(uiSize);

  useEffect(() => {
    document.title = t('downloads.title');
  }, [t]);

  // —— 控制命令 ——
  function pause(id: string): void {
    window.api.downloadPause(id);
  }
  function resume(id: string): void {
    window.api.downloadResume(id);
  }
  function cancel(id: string): void {
    window.api.downloadCancel(id);
  }
  function showInFolder(savePath: string): void {
    window.api.downloadShowInFolder(savePath);
  }
  function openFile(savePath: string): void {
    window.api.downloadOpenFile(savePath);
  }
  function removeFromHistory(id: string): void {
    setHistory((prev) => prev.filter((it) => it.id !== id));
    window.api.downloadRemoveHistoryItem(id);
  }
  function clearHistory(): void {
    setHistory([]);
    window.api.downloadClearHistory();
  }

  if (!loaded) {
    return <div className="w-screen h-screen" />;
  }

  return (
    <div className="w-screen h-screen overflow-auto bg-neutral-50">
      <div className="max-w-3xl mx-auto p-8 flex flex-col gap-6">
        <header className="flex flex-row items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold">{t('downloads.title')}</h1>
            <p className="text-sm text-default-500">{t('downloads.inProgress')}</p>
          </div>
          {history.length > 0 && (
            <Button size="sm" variant="flat" color="danger" onPress={clearHistory}>
              {t('downloads.clearHistory')}
            </Button>
          )}
        </header>

        {/* 进行中 */}
        {active.length > 0 && (
          <div className="flex flex-col gap-3">
            {active.map((it) => {
              const pct = it.total > 0 ? Math.min(100, (it.received / it.total) * 100) : 0;
              // paused / interrupted 都显示「继续」按钮（resume 可尝试恢复中断的下载）
              const isPaused = it.state === 'paused' || it.state === 'interrupted';
              const speed = formatSpeed(it.speed);
              const size = `${formatBytes(it.received)}${it.total > 0 ? ` / ${formatBytes(it.total)}` : ` / ${t('downloads.unknownSize')}`}`;
              return (
                <Card key={it.id} shadow="sm">
                  <CardBody className={`${prefs.downloadRow} flex flex-col gap-2`}>
                    {/* 第1行：文件名 + 操作按钮 */}
                    <div className="flex flex-row items-start justify-between gap-3">
                      <p className={`${prefs.downloadName} font-medium truncate min-w-0`}>{it.filename}</p>
                      <div className="flex flex-row items-center gap-1 shrink-0">
                        {isPaused ? (
                          <Tooltip size="sm" content={t('downloads.resume')}>
                            <Button isIconOnly variant="light" size={prefs.button} onPress={() => resume(it.id)}>
                              <LuPlay size={prefs.icon} />
                            </Button>
                          </Tooltip>
                        ) : (
                          <Tooltip size="sm" content={t('downloads.pause')}>
                            <Button isIconOnly variant="light" size={prefs.button} onPress={() => pause(it.id)}>
                              <LuPause size={prefs.icon} />
                            </Button>
                          </Tooltip>
                        )}
                        <Tooltip size="sm" content={t('downloads.cancel')}>
                          <Button isIconOnly variant="light" size={prefs.button} onPress={() => cancel(it.id)}>
                            <LuX size={prefs.icon} />
                          </Button>
                        </Tooltip>
                      </div>
                    </div>
                    {/* 第2行：速度 · 进度 */}
                    <p className={`${prefs.downloadMeta} text-default-500`}>
                      {speed ? `${speed} · ${size}` : size}
                    </p>
                    {/* 第3行：进度条 */}
                    <Progress
                      aria-label={it.filename}
                      size="sm"
                      value={pct}
                      isIndeterminate={it.total <= 0}
                      color={isPaused ? 'warning' : 'primary'}
                      showValueLabel={it.total > 0}
                    />
                    {/* 第4行：来源 URL */}
                    {it.url && (
                      <p className="text-xs text-default-400 truncate">{it.url}</p>
                    )}
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )}

        {/* 完成提示（瞬时） */}
        {Object.values(flashes).length > 0 && (
          <div className="flex flex-col gap-3">
            {Object.values(flashes).map((f) => (
              <Card key={f.id} shadow="sm">
                <CardBody className={`${prefs.downloadRow} flex flex-row items-center gap-2`}>
                  {f.state === 'completed' ? (
                    <LuFolderOpen size={prefs.icon} className="text-success shrink-0" />
                  ) : f.state === 'cancelled' ? (
                    <LuX size={prefs.icon} className="text-danger shrink-0" />
                  ) : (
                    <LuRotateCw size={prefs.icon} className="text-warning shrink-0" />
                  )}
                  <p className={`${prefs.downloadName} truncate`}>
                    {f.filename} —{' '}
                    {f.state === 'completed'
                      ? t('downloads.completed')
                      : f.state === 'cancelled'
                        ? t('downloads.cancelled')
                        : t('downloads.interrupted')}
                  </p>
                </CardBody>
              </Card>
            ))}
          </div>
        )}

        {/* 下载历史 */}
        <div className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">{t('downloads.history')}</h2>
          {history.length === 0 ? (
            <Card shadow="sm">
              <CardBody className="flex flex-col items-center justify-center gap-2 py-10 text-default-400">
                <LuLoaderCircle size={40} className="opacity-40" />
                <p className={prefs.downloadMeta}>{t('downloads.empty')}</p>
              </CardBody>
            </Card>
          ) : (
            history.map((it) => {
              // 文件是否仍存在（不存在时仅保留「移除」按钮）
              const fileExists = existingPaths.has(it.savePath);
              return (
                <Card key={it.id} shadow="sm">
                  <CardBody className={`${prefs.downloadRow} flex flex-col gap-1.5`}>
                    {/* 第1行：文件名 + 操作按钮 */}
                    <div className="flex flex-row items-start justify-between gap-3">
                      <p className={`${prefs.downloadName} font-medium truncate min-w-0`}>{it.filename}</p>
                      <div className="flex flex-row items-center gap-1 shrink-0">
                        {fileExists && (
                          <>
                            <Tooltip size="sm" content={t('downloads.openFile')}>
                              <Button isIconOnly variant="light" size={prefs.button} onPress={() => openFile(it.savePath)}>
                                <LuPlay size={prefs.icon} />
                              </Button>
                            </Tooltip>
                            <Tooltip size="sm" content={t('downloads.showInFolder')}>
                              <Button isIconOnly variant="light" size={prefs.button} onPress={() => showInFolder(it.savePath)}>
                                <LuFolderOpen size={prefs.icon} />
                              </Button>
                            </Tooltip>
                          </>
                        )}
                        <Tooltip size="sm" content={t('downloads.remove')}>
                          <Button isIconOnly variant="light" size={prefs.button} color="danger" onPress={() => removeFromHistory(it.id)}>
                            <LuTrash2 size={prefs.icon} />
                          </Button>
                        </Tooltip>
                      </div>
                    </div>
                    {/* 第2行：来源 URL */}
                    {it.url && (
                      <p className="text-xs text-default-400 truncate">{it.url}</p>
                    )}
                    {/* 第3行：大小 · 类型 · 完成时间 */}
                    <p className={`${prefs.downloadMeta} text-default-500`}>
                      {formatBytes(it.total)}{it.mimeType ? ` · ${it.mimeType}` : ''} · {formatTime(it.completedAt)}
                    </p>
                  </CardBody>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
