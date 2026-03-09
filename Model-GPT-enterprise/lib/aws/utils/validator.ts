/**
 * Validação de inputs para melhor segurança e confiabilidade
 */

import { logger } from './logger';

export class Validator {
  static validateQueryInput(query: string): { valid: boolean; error?: string } {
    if (!query) {
      const error = 'Query cannot be empty';
      logger.warn(error);
      return { valid: false, error };
    }

    if (typeof query !== 'string') {
      const error = 'Query must be a string';
      logger.warn(error);
      return { valid: false, error };
    }

    if (query.trim().length === 0) {
      const error = 'Query cannot be only whitespace';
      logger.warn(error);
      return { valid: false, error };
    }

    if (query.length > 5000) {
      const error = 'Query exceeds maximum length of 5000 characters';
      logger.warn(error);
      return { valid: false, error };
    }

    return { valid: true };
  }

  static validateConversationId(conversationId: string): { valid: boolean; error?: string } {
    if (!conversationId) {
      const error = 'conversationId cannot be empty';
      logger.warn(error);
      return { valid: false, error };
    }

    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(conversationId)) {
      const error = 'conversationId must be alphanumeric (with - and _), max 100 chars';
      logger.warn(error);
      return { valid: false, error };
    }

    return { valid: true };
  }

  static validateTopK(topK: number): { valid: boolean; error?: string } {
    if (!Number.isInteger(topK) || topK < 1 || topK > 100) {
      const error = 'topK must be an integer between 1 and 100';
      logger.warn(error);
      return { valid: false, error };
    }

    return { valid: true };
  }

  static validateChatMessage(message: any): { valid: boolean; error?: string } {
    if (!message || typeof message !== 'object') {
      const error = 'Message must be an object';
      logger.warn(error);
      return { valid: false, error };
    }

    if (!['user', 'assistant', 'system'].includes(message.role)) {
      const error = 'Message role must be "user", "assistant", or "system"';
      logger.warn(error);
      return { valid: false, error };
    }

    if (typeof message.content !== 'string' || !message.content.trim()) {
      const error = 'Message content must be a non-empty string';
      logger.warn(error);
      return { valid: false, error };
    }

    return { valid: true };
  }
}
