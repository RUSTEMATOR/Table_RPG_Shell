export const ru = {
  appName: 'Зеленогорье',
  connection: {
    online: 'На связи',
    connecting: 'Переподключение…',
    offline: 'Нет связи',
  },
  roles: { gm: 'Мастер', player: 'Игрок', table: 'Общий экран' },
  errors: {
    unauthorized: 'Нужно войти',
    forbidden: 'Нет доступа',
    rateLimited: 'Слишком много попыток. Подождите и попробуйте снова.',
    badCredentials: 'Неверный код, участник или PIN',
    inviteUsed: 'Ссылка уже использована',
    inviteExpired: 'Срок действия ссылки истёк',
    inviteNotFound: 'Ссылка не найдена',
    network: 'Нет связи с сервером',
    unknown: 'Что-то пошло не так',
  },
} as const;
