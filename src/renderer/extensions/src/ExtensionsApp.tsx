import { useEffect } from 'react';
import { LuPuzzle } from 'react-icons/lu';
import { useLocale } from '@renderer/lib/useLocale';
import { useT } from '@renderer/lib/useT';

/**
 * zot://extensions 占位页。功能尚未实现。
 */
export default function ExtensionsApp() {
  const locale = useLocale();
  const t = useT(locale);
  useEffect(() => {
    document.title = t('extensions.title');
  }, [t]);
  return (
    <div className="w-screen h-screen flex flex-col items-center justify-center gap-3 bg-neutral-50 select-none">
      <LuPuzzle size={56} className="text-default-400" />
      <h1 className="text-xl font-semibold text-default-700">{t('extensions.title')}</h1>
      <p className="text-sm text-default-400">{t('extensions.comingSoon')}</p>
    </div>
  );
}
