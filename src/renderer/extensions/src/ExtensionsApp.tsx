import { LuPuzzle } from 'react-icons/lu';

/**
 * zot://extensions 占位页。功能尚未实现。
 */
export default function ExtensionsApp() {
  return (
    <div className="w-screen h-screen flex flex-col items-center justify-center gap-3 bg-neutral-50 select-none">
      <LuPuzzle size={56} className="text-default-400" />
      <h1 className="text-xl font-semibold text-default-700">Extensions</h1>
      <p className="text-sm text-default-400">Coming soon.</p>
    </div>
  );
}
