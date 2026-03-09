/**
 * Coleta de métricas de performance para monitoramento
 */

import { logger } from './logger';

export interface OperationMetrics {
  operationName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
}

export class MetricsCollector {
  private static metrics: OperationMetrics[] = [];

  static startOperation(operationName: string): number {
    const startTime = Date.now();
    logger.debug(`Operation started: ${operationName}`);
    return startTime;
  }

  static endOperation(
    operationName: string,
    startTime: number,
    success: boolean = true,
    error?: string,
    metadata?: Record<string, any>
  ): OperationMetrics {
    const endTime = Date.now();
    const duration = endTime - startTime;

    const metric: OperationMetrics = {
      operationName,
      startTime,
      endTime,
      duration,
      success,
      error,
      metadata,
    };

    this.metrics.push(metric);
    const status = success ? 'completed' : 'failed';
    logger.info(`Operation ${status}: ${operationName}`, {
      duration: `${duration}ms`,
      ...metadata,
    });

    // Manter apenas últimas 100 métricas em memória
    if (this.metrics.length > 100) {
      this.metrics = this.metrics.slice(-100);
    }

    return metric;
  }

  static getMetrics(): OperationMetrics[] {
    return [...this.metrics];
  }

  static getMetricsByOperation(operationName: string): OperationMetrics[] {
    return this.metrics.filter((m) => m.operationName === operationName);
  }

  static getAverageDuration(operationName: string): number {
    const ops = this.getMetricsByOperation(operationName);
    if (ops.length === 0) return 0;
    const totalDuration = ops.reduce((sum, m) => sum + (m.duration || 0), 0);
    return totalDuration / ops.length;
  }

  static clearMetrics(): void {
    this.metrics = [];
  }
}
