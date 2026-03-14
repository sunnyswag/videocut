import { useLocale } from '../i18n';

export function LocaleToggle() {
  const { locale, setLocale } = useLocale();

  return (
    <button
      className="locale-toggle"
      onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}
    >
      {locale === 'zh' ? 'EN' : '中'}
    </button>
  );
}
