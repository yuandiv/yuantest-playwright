import { Lang } from '../i18n';
import { t } from '../i18n';

interface KPICardsProps {
  lang: Lang;
  total: number;
  passed: number;
  failed: number;
  pending: number;
}

export function KPICards({ lang, total, passed, failed, pending }: KPICardsProps) {
  const passRate = total === 0 ? 0 : ((passed / total) * 100).toFixed(1);

  const cards = [
    { label: t('totalCases', lang), value: total, icon: 'fas fa-vial text-indigo-300', color: '' },
    { label: t('passRate', lang), value: `${passRate}%`, icon: 'fas fa-chart-line text-green-400', color: '' },
    { label: t('failedCount', lang), value: failed, icon: 'fas fa-exclamation-triangle text-red-300', color: 'text-red-500' },
    { label: t('pendingCount', lang), value: pending, icon: 'fas fa-hourglass-half text-gray-400', color: '' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
      {cards.map((card) => (
        <div key={card.label} className="bg-white rounded-[1.25rem] shadow-sm hover:-translate-y-0.5 hover:shadow-lg transition-all p-4 flex justify-between items-center">
          <div>
            <p className="text-gray-500 text-xs">{card.label}</p>
            <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
          </div>
          <i className={`${card.icon} text-2xl`}></i>
        </div>
      ))}
    </div>
  );
}
