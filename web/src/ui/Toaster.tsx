import { Toaster as Sonner, toast } from 'sonner';

/** Уведомления о результате действия мастера («Сохранено», «Сцена показана на столе»). Цвета — токены темы. */
export function Toaster() {
  return (
    <Sonner
      position="bottom-center"
      gap={8}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'flex w-[min(420px,calc(100vw-32px))] items-center gap-3 rounded-control bg-text px-4 py-3 font-ui text-[14px] font-medium text-surface shadow-[0_8px_24px_rgba(20,26,21,.24)]',
          error: '!bg-danger !text-surface',
          actionButton: 'ml-auto cursor-pointer border-0 bg-transparent font-ui text-[14px] font-semibold text-inherit underline',
          description: 'opacity-80',
        },
      }}
    />
  );
}

export { toast };
