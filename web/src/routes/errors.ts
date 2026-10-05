import { ru } from '@zg/shared';

export function errorText(error: string, retryAfterSec?: number): string {
  switch (error) {
    case 'rate_limited':
      return retryAfterSec ? `${ru.errors.rateLimited} Через ${Math.ceil(retryAfterSec / 60)} мин.` : ru.errors.rateLimited;
    case 'bad_credentials':
      return ru.errors.badCredentials;
    case 'invite_used':
      return ru.errors.inviteUsed;
    case 'invite_expired':
      return ru.errors.inviteExpired;
    case 'invite_missing':
      return ru.errors.inviteNotFound;
    case 'room_not_found':
      return 'Комната с таким кодом не найдена';
    case 'network':
      return ru.errors.network;
    case 'unauthorized':
      return ru.errors.unauthorized;
    case 'forbidden':
      return ru.errors.forbidden;
    default:
      return ru.errors.unknown;
  }
}
