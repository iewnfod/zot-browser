import { app, ipcMain, session, shell, DownloadItem } from 'electron';
import { basename, join } from 'path';
import { existsSync } from 'fs';
import { broadcastToUiViews } from './viewManager';
import { PARTITION } from './viewManager';
import { store } from './storage';

/**
 * 下载管理（主进程）。
 *
 * 设计要点（见 AGENTS.md §2 / §7）：
 * - 网页跑在 `persist:shared-partition` 这个 session 上，下载由该 session 的
 *   `will-download` 事件触发，故在此 session 上监听（而非 app 级）。
 * - UI view 是事件汇聚点：所有进度 / 状态变更一律发给 UI view，由 UI 层
 *   （zot://downloads 页面）订阅展示，符合「UI 是事件汇聚点」的现有约定。
 * - 持久化只存「已完成」的元信息（文件名 / URL / savePath / 大小 / 时间），
 *   存进 store 的 'downloads' 数组，重启后仍可见。进行中下载不持久化
 *   （重启视为取消）。
 */

/** 持久化的已完成下载条数上限（避免无限增长）。 */
const MAX_HISTORY = 200;

/** 进行中下载的内存记录（带 DownloadItem 引用，便于 pause/resume/cancel）。 */
interface ActiveDownload {
  id: string;
  item: DownloadItem;
  filename: string;
  url: string;
  /** 用户可读状态：'progressing' | 'paused' | 'interrupted'（用于页面加载时回填）。 */
  state: 'progressing' | 'paused' | 'interrupted';
  /** 速度（bytes/sec，EMA 平滑）。paused/interrupted 时为 0。 */
  speed: number;
  /** 速度计算基线：< 0 表示未建立（等待首个 updated 建立基线）。 */
  baseReceived: number;
  baseTime: number;
}

/** 推给 UI 的进度快照（序列化形态，跨 IPC 安全）。 */
export interface DownloadProgressPayload {
  id: string;
  filename: string;
  url: string;
  received: number;
  total: number;
  /** interrupted 表示下载被中断（可能在 done 之前短暂出现）。 */
  state: 'progressing' | 'paused' | 'interrupted';
  /** 下载速度（bytes/sec，EMA 平滑后）。paused/interrupted 时为 0。 */
  speed: number;
}

/** 推给 UI 的完成事件载荷。 */
export interface DownloadDonePayload {
  id: string;
  filename: string;
  url: string;
  savePath: string;
  state: 'completed' | 'cancelled' | 'interrupted';
  total: number;
  mimeType: string;
}

/** 持久化到 store 的历史条目形态。 */
export interface DownloadHistoryItem {
  id: string;
  filename: string;
  url: string;
  savePath: string;
  total: number;
  mimeType: string;
  completedAt: number;
}

/** 进行中下载集合（id → ActiveDownload）。 */
const active = new Map<string, ActiveDownload>();
let nextSeq = 1;

/** 推送下载事件：广播给主 UI + 所有 zot:// 内部页（如已打开的 zot://downloads）。 */
function sendToUi(channel: string, ...args: unknown[]): void {
  broadcastToUiViews(channel, ...args);
}

/** 读取持久化历史（缺失返回空数组）。 */
function readHistory(): DownloadHistoryItem[] {
  const data = store.get('downloads');
  return Array.isArray(data) ? (data as DownloadHistoryItem[]) : [];
}

/** 写入持久化历史。 */
function writeHistory(items: DownloadHistoryItem[]): void {
  store.set('downloads', items);
}

/**
 * 为下载项生成一个不冲突的保存路径：若目标文件已存在，在文件名后追加 ` (n)`。
 */
function resolveSavePath(filename: string): string {
  const dir = app.getPath('downloads');
  const candidate = join(dir, filename);
  if (!existsSync(candidate)) return candidate;

  const dot = filename.lastIndexOf('.');
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  const ext = dot > 0 ? filename.slice(dot) : '';
  for (let i = 2; i < 10000; i++) {
    const next = join(dir, `${base} (${i})${ext}`);
    if (!existsSync(next)) return next;
  }
  // 极端情况：用时间戳兜底
  return join(dir, `${base} (${Date.now()})${ext}`);
}

function snapshotProgress(a: ActiveDownload): DownloadProgressPayload {
  const item = a.item;
  return {
    id: a.id,
    filename: a.filename,
    url: a.url,
    received: item.getReceivedBytes(),
    total: item.getTotalBytes(),
    state: a.state,
    speed: a.state === 'progressing' ? a.speed : 0,
  };
}

/**
 * 装载下载相关事件：session 监听 + IPC handlers。
 * 在 index.ts 的 app.whenReady 里、loadStoreEvents 之后调用。
 */
export function loadDownloadEvents(): void {
  const ses = session.fromPartition(PARTITION);

  ses.on('will-download', (_event, item) => {
    const id = `dl-${nextSeq++}`;
    const originalName = item.getFilename() || 'download';
    const url = item.getURLChain()?.[0] ?? item.getURL() ?? '';

    // 直接存到下载目录（不弹「另存为」），自动处理重名（追加 (n)）
    item.setSavePath(resolveSavePath(originalName));
    // 显示文件名用实际保存路径的 basename：重名时会带 (n)，与磁盘文件一致
    const filename = basename(item.getSavePath()) || originalName;

    const record: ActiveDownload = {
      id,
      item,
      filename,
      url,
      state: 'progressing',
      speed: 0,
      baseReceived: -1,
      baseTime: 0,
    };
    active.set(id, record);

    // 首次通知：让 UI 立即出现这一行
    sendToUi('download-progress', snapshotProgress(record));

    item.on('updated', (_e, state) => {
      if (state === 'interrupted') {
        record.state = 'interrupted';
        record.speed = 0;
      } else if (item.isPaused()) {
        record.state = 'paused';
        record.speed = 0;
      } else {
        record.state = 'progressing';
        // 速度计算：基于上次基线的 received 增量 / 时间增量，用 EMA 平滑（避免抖动）
        const now = Date.now();
        const cur = item.getReceivedBytes();
        if (record.baseReceived < 0) {
          record.baseReceived = cur;
          record.baseTime = now;
          record.speed = 0;
        } else {
          const dt = now - record.baseTime;
          if (dt > 0) {
            const inst = Math.max(0, ((cur - record.baseReceived) / dt) * 1000);
            record.speed = record.speed === 0 ? inst : record.speed * 0.6 + inst * 0.4;
          }
          record.baseReceived = cur;
          record.baseTime = now;
        }
      }
      sendToUi('download-progress', snapshotProgress(record));
    });

    item.once('done', (_e, state) => {
      const savePath = item.getSavePath();
      const total = item.getTotalBytes();
      const mimeType = item.getMimeType();

      let doneState: DownloadDonePayload['state'];
      if (state === 'completed') {
        doneState = 'completed';
      } else if (state === 'cancelled') {
        doneState = 'cancelled';
      } else {
        doneState = 'interrupted';
      }

      // 仅 completed 入历史（cancelled / interrupted 不入库）
      if (doneState === 'completed') {
        const entry: DownloadHistoryItem = {
          id,
          filename,
          url,
          savePath,
          total,
          mimeType,
          completedAt: Date.now(),
        };
        const history = readHistory();
        history.unshift(entry);
        writeHistory(history.slice(0, MAX_HISTORY));
      }

      sendToUi('download-done', {
        id,
        filename,
        url,
        savePath,
        state: doneState,
        total,
        mimeType,
      } satisfies DownloadDonePayload);

      active.delete(id);
    });
  });

  // —— 进行中下载控制 ——

  ipcMain.handle('download-pause', (_e, id: string) => {
    const a = active.get(id);
    if (a) {
      a.item.pause();
      a.state = 'paused';
      sendToUi('download-progress', snapshotProgress(a));
    }
    return !!a;
  });

  ipcMain.handle('download-resume', (_e, id: string) => {
    const a = active.get(id);
    if (a) {
      a.item.resume();
      a.state = 'progressing';
      // 重置速度基线，避免恢复后首个 updated 用暂停期间的时差算出错误速度
      a.baseReceived = -1;
      a.speed = 0;
      sendToUi('download-progress', snapshotProgress(a));
    }
    return !!a;
  });

  ipcMain.handle('download-cancel', (_e, id: string) => {
    const a = active.get(id);
    if (a) {
      a.item.cancel();
      // done 事件会负责清理 active 与广播，这里不重复删
    }
    return !!a;
  });

  // —— 文件操作 ——

  ipcMain.handle('download-show-in-folder', (_e, savePath: string) => {
    if (savePath) shell.showItemInFolder(savePath);
    return !!savePath;
  });

  ipcMain.handle('download-open-file', async (_e, savePath: string) => {
    if (!savePath) return false;
    const err = await shell.openPath(savePath);
    return !err;
  });

  // —— 历史管理 ——
  // 删除/清空后广播 downloads-history-changed，让主 UI（SideBar Dropdown）和
  // zot://downloads 页面各自重新拉取，避免两端 state 不同步（它们是独立的 webContents）。

  ipcMain.handle('download-clear-history', () => {
    writeHistory([]);
    sendToUi('downloads-history-changed');
    return true;
  });

  ipcMain.handle('download-remove-history-item', (_e, id: string) => {
    const history = readHistory().filter((it) => it.id !== id);
    writeHistory(history);
    sendToUi('downloads-history-changed');
    return true;
  });

  // —— 批量检查文件是否仍存在（UI 据此隐藏「打开 / 在文件夹中显示」按钮）——
  // 返回存在的路径数组（renderer 自行转 Set 查询）。

  ipcMain.handle('download-check-files', (_e, savePaths: string[]): string[] => {
    if (!Array.isArray(savePaths)) return [];
    return savePaths.filter((p) => typeof p === 'string' && p && existsSync(p));
  });

  // —— 页面加载时拉取进行中快照（避免错过已开始的下载）——

  ipcMain.handle('download-get-active', (): DownloadProgressPayload[] => {
    return Array.from(active.values()).map(snapshotProgress);
  });

  // —— 拉取最近历史（供 SideBar 的下载 Dropdown 展示最近几条）——
  // limit 缺省 5，上限 50，避免一次拉太多。

  ipcMain.handle('download-get-history', (_e, limit?: number): DownloadHistoryItem[] => {
    const n = Math.max(1, Math.min(50, Math.floor(limit ?? 5)));
    return readHistory().slice(0, n);
  });
}
